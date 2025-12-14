// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "solady/src/auth/Ownable.sol";
import {NFTStrategy} from "./NFTStrategy.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "@uniswap/v4-periphery/lib/permit2/src/interfaces/IAllowanceTransfer.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IUniswapV4Router04} from "./IUniswapV4Router04.sol";
import "./Interfaces.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";

interface IPoolManagerOracle is IPoolManager {
    function observe(PoolKey memory key, uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
}

/// @title NFTStrategyFactory
contract NFTStrategyFactory is Ownable, ReentrancyGuard {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    /*                       CONSTANTS                      */

    uint256 private constant ethToPair = 2 wei;
    uint256 private constant initialBuy = 10000000000000 wei;
    uint256 private constant SLIPPAGE_BIPS_DENOM = 10_000;
    uint256 private constant MAX_SLIPPAGE_BIPS = 2_000; // 20% max slippage tolerance
    uint256 private constant MIN_TWAP_DELAY_BLOCKS = 100;
    IPositionManager private immutable posm;
    IAllowanceTransfer private immutable permit2;
    IUniswapV4Router04 private immutable router;
    IPoolManagerOracle public immutable poolManager;

    address public restrictedTokenAddress;
    address public restrictedTokenHookAddress;
    address public constant DEADADDRESS = 0x000000000000000000000000000000000000dEaD;

    /*                   STATE VARIABLES                   */

    mapping(address => address) public collectionToNFTStrategy;
    mapping(address => address) public nftStrategyToCollection;
    uint256 public feeToLaunch;
    address public hookAddress;
    address public feeAddress;
    bool public loadingLiquidity;
    bool public deployerBuying;
    bool public publicLaunches;
    bool public collectionOwnerLaunches;
    uint256 public twapIncrement = 1 ether;
    uint256 public twapDelayInBlocks = MIN_TWAP_DELAY_BLOCKS;
    uint256 public lastTwapBlock;
    bool public routerRestrict;
    mapping(address => bool) public listOfRouters;
    uint256 public slippageToleranceBips = 500; // 5%
    uint256 public launchSlippageBps = 500; // 5% default for launch buys

    /*                    CUSTOM ERRORS                    */

    error HookNotSet();
    error CollectionAlreadyLaunched();
    error WrongEthAmount();
    error NotERC721();
    error GatedByCollectionOwner();
    error CannotLaunch();
    error NoETHToTwap();
    error TwapDelayNotMet();
    error TwapDelayTooLow();
    error InvalidSlippage();

    /*                    CUSTOM EVENTS                    */

    event NFTStrategyLaunched(
        address indexed collection,
        address indexed nftStrategy,
        string tokenName,
        string tokenSymbol
    );

    /*                     CONSTRUCTOR                     */

    constructor(
        address _posm,
        address _permit2,
        address _poolManager,
        address payable _universalRouter,
        address payable _router,
        address _feeAddress,
        address _restrictedTokenAddress,
        address _restrictedTokenHookAddress
    ) {
        router = IUniswapV4Router04(_router);
        posm = IPositionManager(_posm);
        permit2 = IAllowanceTransfer(_permit2);
        poolManager = IPoolManagerOracle(_poolManager);
        restrictedTokenAddress = _restrictedTokenAddress;
        restrictedTokenHookAddress = _restrictedTokenHookAddress;

        listOfRouters[address(this)] = true;
        listOfRouters[_posm] = true;
        listOfRouters[_permit2] = true;
        listOfRouters[_router] = true;
        listOfRouters[_universalRouter] = true;
        listOfRouters[_poolManager] = true;
        listOfRouters[DEADADDRESS] = true;

        routerRestrict = true;

        feeAddress = _feeAddress;
        _initializeOwner(msg.sender);
    }

    /*                    ADMIN FUNCTIONS                  */

    function setPublicLaunches(bool _publicLaunches) external onlyOwner {
        publicLaunches = _publicLaunches;
    }

    function setCollectionOwnerLaunches(bool _collectionOwnerLaunches) external onlyOwner {
        collectionOwnerLaunches = _collectionOwnerLaunches;
    }

    function setRouter(address _router, bool status) external onlyOwner {
        listOfRouters[_router] = status;
    }

    function setRouterRestrict(bool status) external onlyOwner {
        routerRestrict = status;
    }

    function updateFeeToLaunch(uint256 _feeToLaunch) external onlyOwner {
        feeToLaunch = _feeToLaunch;
    }

    function updateHookAddress(address _hookAddress) external onlyOwner {
        hookAddress = _hookAddress;
        listOfRouters[hookAddress] = true;
    }

    function setRestrictedTokenAddress(address _address) external onlyOwner {
        restrictedTokenAddress = _address;
    }

    function setRestrictedTokenHookAddress(address _address) external onlyOwner {
        restrictedTokenHookAddress = _address;
    }

    function updateTokenName(address nftStrategy, string memory tokenName) external onlyOwner {
        INFTStrategy(nftStrategy).updateName(tokenName);
    }

    function updateTokenSymbol(address nftStrategy, string memory tokenSymbol) external onlyOwner {
        INFTStrategy(nftStrategy).updateSymbol(tokenSymbol);
    }

    function updatePriceMultiplier(address nftStrategy, uint256 newMultiplier) external onlyOwner {
        INFTStrategy(nftStrategy).setPriceMultiplier(newMultiplier);
    }

    function setSlippageTolerance(uint256 newSlippageBips) external onlyOwner {
        if (newSlippageBips > MAX_SLIPPAGE_BIPS) revert InvalidSlippage();
        slippageToleranceBips = newSlippageBips;
    }

    function setLaunchSlippage(uint256 newSlippageBps) external onlyOwner {
        require(newSlippageBps <= 1000, "Max 10%");
        launchSlippageBps = newSlippageBps;
    }

    function updateTwapDelay(uint256 newDelay) external onlyOwner {
        if (newDelay < MIN_TWAP_DELAY_BLOCKS) revert TwapDelayTooLow();
        twapDelayInBlocks = newDelay;
    }

    /*                  INTERNAL FUNCTIONS                 */

    function _loadLiquidity(address _token) internal {
        loadingLiquidity = true;

        Currency currency0 = Currency.wrap(address(0));
        Currency currency1 = Currency.wrap(_token);

        uint24 lpFee = 0;
        int24 tickSpacing = 60;

        uint256 token0Amount = 1;
        uint256 token1Amount = 1_000_000_000 * 10**18;

        uint160 startingPrice = 501082896750095888663770159906816;

        int24 tickLower = TickMath.minUsableTick(tickSpacing);
        int24 tickUpper = int24(175020);

        PoolKey memory key = PoolKey(currency0, currency1, lpFee, tickSpacing, IHooks(hookAddress));
        bytes memory hookData = new bytes(0);

        uint128 liquidity = 158372218983990412488087;

        uint256 amount0Max = token0Amount + 1 wei;
        uint256 amount1Max = token1Amount + 1 wei;

        (bytes memory actions, bytes[] memory mintParams) =
            _mintLiquidityParams(key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, address(this), hookData);

        bytes[] memory params = new bytes[](2);

        params[0] = abi.encodeWithSelector(posm.initializePool.selector, key, startingPrice, hookData);

        params[1] = abi.encodeWithSelector(
            posm.modifyLiquidities.selector, abi.encode(actions, mintParams), block.timestamp + 60
        );

        uint256 valueToPass = amount0Max;
        permit2.approve(_token, address(posm), type(uint160).max, type(uint48).max);

        posm.multicall{value: valueToPass}(params);

        loadingLiquidity = false;
    }

    function _mintLiquidityParams(
        PoolKey memory poolKey,
        int24 _tickLower,
        int24 _tickUpper,
        uint256 liquidity,
        uint256 amount0Max,
        uint256 amount1Max,
        address recipient,
        bytes memory hookData
    ) internal pure returns (bytes memory, bytes[] memory) {
        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));

        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(poolKey, _tickLower, _tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData);
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);
        return (actions, params);
    }

    function _validateERC721(address collection) internal view {
        bool isSupported;
        try IERC721(collection).supportsInterface(0x80ac58cd) returns (bool supported) {
            isSupported = supported;
        } catch {
            revert NotERC721();
        }
        if (!isSupported) revert NotERC721();

        try IERC721(collection).balanceOf(address(this)) returns (uint256) {
            // balanceOf implemented correctly
        } catch {
            revert NotERC721();
        }

        // Optional structural integrity check (non-fatal if token supply absent)
        try IERC721(collection).ownerOf(1) returns (address) {
            // token exists
        } catch {
            // collection may have zero supply; ignore
        }
    }

    function _calculateExpectedOutput(PoolKey memory key, uint256 amountIn) internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,) = IPoolManager(poolManager).getSlot0(key.toId());
        return FullMath.mulDiv(
            amountIn,
            uint256(sqrtPriceX96) * uint256(sqrtPriceX96),
            FixedPoint96.Q96 * FixedPoint96.Q96
        );
    }

    function _buyTokens(uint256 amountIn, address nftStrategy, address caller) internal {
        deployerBuying = true;

        PoolKey memory key = PoolKey(
            Currency.wrap(address(0)),
            Currency.wrap(nftStrategy),
            0,
            60,
            IHooks(hookAddress)
        );

        uint256 expectedOutput = _calculateExpectedOutput(key, amountIn);
        uint256 minOutput = (expectedOutput * (SLIPPAGE_BIPS_DENOM - launchSlippageBps)) / SLIPPAGE_BIPS_DENOM;

        router.swapExactTokensForTokens{value: amountIn}(
            amountIn,
            minOutput,
            true,
            key,
            "",
            caller,
            block.timestamp
        );

        deployerBuying = false;
    }

    function _buyAndBurnRestrictedToken(uint256 amountIn) internal returns (uint256) {
        uint256 rarityBalanceBefore = IERC20(restrictedTokenAddress).balanceOf(DEADADDRESS);

        PoolKey memory key = PoolKey(
            Currency.wrap(address(0)),
            Currency.wrap(restrictedTokenAddress),
            0,
            60,
            IHooks(restrictedTokenHookAddress)
        );

        // 30-minute TWAP window, 5% slippage tolerance (500 bps)
        uint256 minAmountOut = _getMinAmountOut(key, amountIn, 30 minutes, 500);

        router.swapExactTokensForTokens{value: amountIn}(
            amountIn,
            minAmountOut, // Protected by TWAP
            true,
            key,
            "",
            DEADADDRESS,
            block.timestamp
        );

        return IERC20(restrictedTokenAddress).balanceOf(DEADADDRESS) - rarityBalanceBefore;
    }

    function _getMinAmountOut(
        PoolKey memory key,
        uint256 amountIn,
        uint32 twapWindow,
        uint256 slippageBps
    ) internal view returns (uint256) {
        // Define the time range (now, and twapWindow seconds ago)
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow; // twapWindow seconds ago
        secondsAgos[1] = 0; // Now

        // Get the arithmetic mean tick from the oracle
        // NOTE: pool must have Oracle flag initialized
        (int56[] memory tickCumulatives, ) = poolManager.observe(key, secondsAgos);

        int56 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];
        int24 arithmeticMeanTick = int24(tickCumulativesDelta / int56(uint56(twapWindow)));

        // Calculate sqrtPrice from the mean tick
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(arithmeticMeanTick);

        // Calculate expected amount out
        // For Token0 (ETH) -> Token1 (rarity) swap: AmountOut = AmountIn * (Price)^2
        uint256 expectedOut = FullMath.mulDiv(
            amountIn,
            uint256(sqrtPriceX96) * uint256(sqrtPriceX96),
            FixedPoint96.Q96 * FixedPoint96.Q96
        );

        // Apply slippage tolerance
        return (expectedOut * (10_000 - slippageBps)) / 10_000;
    }

    /*                    USER FUNCTIONS                   */

    function ownerLaunchNFTStrategy(
        address collection,
        string memory tokenName,
        string memory tokenSymbol
    ) external payable onlyOwner returns (NFTStrategy) {
        if (hookAddress == address(0)) revert HookNotSet();
        if (collectionToNFTStrategy[collection] != address(0)) revert CollectionAlreadyLaunched();

        NFTStrategy nftStrategy = new NFTStrategy(
            address(this),
            hookAddress,
            router,
            collection,
            tokenName,
            tokenSymbol
        );

        collectionToNFTStrategy[collection] = address(nftStrategy);
        nftStrategyToCollection[address(nftStrategy)] = collection;

        _loadLiquidity(address(nftStrategy));

        INFTStrategyHook(hookAddress).adminUpdateFeeAddress(address(nftStrategy), feeAddress);

        // Add initial token purchase to ensure token appears on Uniswap interface
        if (msg.value >= initialBuy) {
            _buyTokens(initialBuy, address(nftStrategy), msg.sender);
        }
        emit NFTStrategyLaunched(collection, address(nftStrategy), tokenName, tokenSymbol);

        return nftStrategy;
    }

    function launchNFTStrategy(
        address collection,
        string memory tokenName,
        string memory tokenSymbol
    ) external payable nonReentrant returns (NFTStrategy) {
        if (hookAddress == address(0)) revert HookNotSet();
        if (collectionToNFTStrategy[collection] != address(0)) revert CollectionAlreadyLaunched();
        if (msg.value != feeToLaunch) revert WrongEthAmount();
        if (!publicLaunches && !collectionOwnerLaunches) revert CannotLaunch();

        if (msg.sender != owner()) {
            _validateERC721(collection);
        }

        address collectionOwnerFromContract;
        try IERC721(collection).owner() returns (address owner) {
            collectionOwnerFromContract = owner;
        } catch {
            collectionOwnerFromContract = address(0);
        }

        if (!publicLaunches && msg.sender != collectionOwnerFromContract) revert GatedByCollectionOwner();

        NFTStrategy nftStrategy = new NFTStrategy(
            address(this),
            hookAddress,
            router,
            collection,
            tokenName,
            tokenSymbol
        );

        collectionToNFTStrategy[collection] = address(nftStrategy);
        nftStrategyToCollection[address(nftStrategy)] = collection;

        _loadLiquidity(address(nftStrategy));

        INFTStrategyHook(hookAddress).adminUpdateFeeAddress(address(nftStrategy), feeAddress);

        _buyTokens(initialBuy, address(nftStrategy), msg.sender);

        uint256 totalRequired = ethToPair + initialBuy;
        if (msg.value < totalRequired) revert WrongEthAmount();
        
        uint256 ethToSend = msg.value - totalRequired;
        if (ethToSend > 0) {
            SafeTransferLib.forceSafeTransferETH(feeAddress, ethToSend);
        }

        emit NFTStrategyLaunched(collection, address(nftStrategy), tokenName, tokenSymbol);

        return nftStrategy;
    }

    function processTokenTwap() external nonReentrant {
        uint256 balance = address(this).balance;
        if(balance == 0) revert NoETHToTwap();

        if(block.number < lastTwapBlock + twapDelayInBlocks) revert TwapDelayNotMet();

        uint256 burnAmount = twapIncrement;
        if(balance < twapIncrement) {
            burnAmount = balance;
        }

        uint256 reward = (burnAmount * 5) / 1000;
        burnAmount -= reward;

        lastTwapBlock = block.number;

        _buyAndBurnRestrictedToken(burnAmount);

        SafeTransferLib.forceSafeTransferETH(msg.sender, reward);
    }

    function validTransfer(address from, address to, address tokenAddress) external view returns (bool) {
        if (!routerRestrict) return true;
        
        bool userToUser = !listOfRouters[from] && !listOfRouters[to];
        if (userToUser && (from != tokenAddress && to != tokenAddress)) {
            if (from == address(poolManager)) return true;
            
            if (to == address(poolManager)) {
                return INFTStrategy(tokenAddress).midSwap() || loadingLiquidity;
            }
            return false;
        }
        return true;
    }

    receive() external payable {
        require(
            msg.sender == address(router) || msg.sender == address(posm) || msg.sender == owner(),
            "Unauthorized"
        );
    }
}
