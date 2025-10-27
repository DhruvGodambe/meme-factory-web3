// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Ownable} from "solady/src/auth/Ownable.sol";
import {NFTStrategy} from "./NFTStrategy.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "@uniswap/v4-periphery/lib/permit2/src/interfaces/IAllowanceTransfer.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IUniswapV4Router04} from "./IUniswapV4Router04.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import "./Interfaces.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {LibClone} from "solady/src/utils/LibClone.sol";

/// @title NFTStrategyFactory - Factory for deploying NFTStrategy contracts
/// @author TokenWorks (https://token.works/)
/// @notice This factory deploys and manages NFTStrategy contracts with Uniswap V4 integration
/// @dev Uses ERC1967 proxy pattern for upgradeable NFTStrategy deployments
contract NFTStrategyFactory is Ownable, ReentrancyGuard {
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™                ™™™™™™™™™™™                ™™™™™™™™™™™ */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™               ™™™™™™™™™™™™               ™™™™™™™™™™  */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™              ™™™™™™™™™™™™™              ™™™™™™™™™™™  */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™             ™™™™™™™™™™™™™™            ™™™™™™™™™™™   */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™            ™™™™™™™™™™™™™™™            ™™™™™™™™™™™   */
    /*                ™™™™™™™™™™™            ™™™™™™™™™™™           ™™™™™™™™™™™™™™™           ™™™™™™™™™™™    */
    /*                ™™™™™™™™™™™             ™™™™™™™™™™          ™™™™™™™™™™™™™™™™™          ™™™™™™™™™™™    */
    /*                ™™™™™™™™™™™             ™™™™™™™™™™          ™™™™™™™™™™™™™™™™™          ™™™™™™™™™™     */
    /*                ™™™™™™™™™™™              ™™™™™™™™™™        ™™™™™™™™™™™™™™™™™™™        ™™™™™™™™™™™     */
    /*                ™™™™™™™™™™™              ™™™™™™™™™™™       ™™™™™™™™™ ™™™™™™™™™       ™™™™™™™™™™™      */
    /*                ™™™™™™™™™™™               ™™™™™™™™™™      ™™™™™™™™™™ ™™™™™™™™™™      ™™™™™™™™™™™      */
    /*                ™™™™™™™™™™™               ™™™™™™™™™™      ™™™™™™™™™   ™™™™™™™™™      ™™™™™™™™™™       */
    /*                ™™™™™™™™™™™                ™™™™™™™™™™    ™™™™™™™™™™    ™™™™™™™™™    ™™™™™™™™™™        */
    /*                ™™™™™™™™™™™                 ™™™™™™™™™™   ™™™™™™™™™     ™™™™™™™™™™  ™™™™™™™™™™™        */
    /*                ™™™™™™™™™™™                 ™™™™™™™™™™  ™™™™™™™™™™     ™™™™™™™™™™  ™™™™™™™™™™         */
    /*                ™™™™™™™™™™™                  ™™™™™™™™™™™™™™™™™™™™       ™™™™™™™™™™™™™™™™™™™™          */
    /*                ™™™™™™™™™™™                   ™™™™™™™™™™™™™™™™™™         ™™™™™™™™™™™™™™™™™™           */
    /*                ™™™™™™™™™™™                   ™™™™™™™™™™™™™™™™™™         ™™™™™™™™™™™™™™™™™™           */
    /*                ™™™™™™™™™™™                    ™™™™™™™™™™™™™™™™           ™™™™™™™™™™™™™™™™            */
    /*                ™™™™™™™™™™™                     ™™™™™™™™™™™™™™             ™™™™™™™™™™™™™™             */
    /*                ™™™™™™™™™™™                     ™™™™™™™™™™™™™™             ™™™™™™™™™™™™™™             */
    /*                ™™™™™™™™™™™                      ™™™™™™™™™™™™               ™™™™™™™™™™™™              */

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                      CONSTANTS                      */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice ETH amount used for initial liquidity pairing
    uint256 private constant ethToPair = 2 wei;
    /// @notice Uniswap V4 Position Manager for liquidity operations
    IPositionManager private immutable posm;
    /// @notice Permit2 contract for token approvals
    IAllowanceTransfer private immutable permit2;
    /// @notice Uniswap V4 Router for token swaps
    IUniswapV4Router04 private immutable router;
    /// @notice Uniswap V4 Pool Manager for pool operations
    IPoolManager private immutable poolManager;

    /// @notice RestrictedToken token contract address
    address public constant RESTRICTED_TOKEN_ADDRESS = 0x04fD8C3d616E33f1d19d6cbE71142C32784A23A1;
    /// @notice NFTStrategyHook contract address
    address public constant NFT_STRATEGY_HOOK_ADDRESS = 0x423660071Fe05a8b7BD77F29b9CD5bB4A6C8A8c4;
    /// @notice Dead address for burning tokens
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    /// @notice Previous factory contract address for migration checks
    address public constant OLD_FACTORY = 0xA1a196b5BE89Be04a2c1dc71643689CE013c22e5;

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                   STATE VARIABLES                   */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Mapping of NFT collection addresses to their NFTStrategy contracts
    mapping(address => address) public collectionToNFTStrategy;
    /// @notice Mapping of NFTStrategy addresses to their collection contracts
    mapping(address => address) public nftStrategyToCollection;
    /// @notice Mapping of addresses that can launch strategies
    mapping(address => bool) public launchers;
    /// @notice The Uniswap V4 hook that controls the logic of new deployments
    address public hookAddress;
    /// @notice Gates the NFTStrategyHook to only when we're loading a new token
    bool public loadingLiquidity;
    /// @notice Controls upgradeability of new NFTStrategy contracts
    bool public launchUpgradeable;
    /// @notice The address to send deployment fees to
    address public feeAddress;
    /// @notice Implementation contract for NFTStrategy proxies
    address public nftStrategyImplementation;
    /// @notice TWAP increment when buying RestrictedToken tokens
    uint256 public twapIncrement = 1 ether;
    /// @notice TWAP delay in blocks when buying RestrictedToken tokens
    uint256 public twapDelayInBlocks = 1;
    /// @notice Last block number when TWAP was executed
    uint256 public lastTwapBlock;

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                    CUSTOM ERRORS                    */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Hook address has not been set
    error HookNotSet();
    /// @notice Collection already has an NFTStrategy deployed
    error CollectionAlreadyLaunched();
    /// @notice Incorrect ETH amount sent with launch transaction
    error WrongEthAmount();
    /// @notice Contract does not implement ERC721 interface
    error NotERC721();
    /// @notice Launch is restricted to collection owner only
    error GatedByCollectionOwner();
    /// @notice Launching is currently disabled
    error CannotLaunch();
    /// @notice No ETH available for TWAP operations
    error NoETHToTwap();
    /// @notice Not enough blocks have passed since last TWAP
    error TwapDelayNotMet();
    /// @notice Buy increment is outside valid range
    error InvalidIncrement();

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                    CUSTOM EVENTS                    */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Event emitted when a new NFTStrategy instance is launched
    /// @param collection The NFT collection address
    /// @param nftStrategy The deployed NFTStrategy contract address
    /// @param tokenName The name of the strategy token
    /// @param tokenSymbol The symbol of the strategy token
    event NFTStrategyLaunched(
        address indexed collection, address indexed nftStrategy, string tokenName, string tokenSymbol
    );

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                     CONSTRUCTOR                     */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Constructor initializes the factory with required dependencies
    /// @param _posm Uniswap V4 Position Manager address
    /// @param _permit2 Permit2 contract address
    /// @param _router Uniswap V4 Router address
    /// @param _poolManager Uniswap V4 Pool Manager address
    /// @param _feeAddress Address to receive deployment fees
    /// @dev Sets up immutable references and creates NFTStrategy implementation
    constructor(address _posm, address _permit2, address payable _router, address _poolManager, address _feeAddress) {
        posm = IPositionManager(_posm);
        permit2 = IAllowanceTransfer(_permit2);
        router = IUniswapV4Router04(_router);
        poolManager = IPoolManager(_poolManager);
        feeAddress = _feeAddress;

        // Enable upgradeability by default
        launchUpgradeable = true;

        nftStrategyImplementation = address(new NFTStrategy());
        _initializeOwner(msg.sender);
    }

    /// @notice Restricts function access to authorized launchers or owner
    modifier onlyLauncher() {
        if (!launchers[msg.sender] && msg.sender != Ownable.owner()) revert Unauthorized();
        _;
    }

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                    ADMIN FUNCTIONS                  */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Sets the implementation of the NFTStrategy contract
    /// @param _nftStrategyImplementation Address of the NFTStrategy implementation contract
    /// @dev Only callable by owner
    function setNftStrategyImplementation(address _nftStrategyImplementation) external onlyOwner {
        nftStrategyImplementation = _nftStrategyImplementation;
    }


    /// @notice Disables the upgradeability of new NFTStrategy launches
    /// @dev Only callable by owner
    function disableLaunchUpgradeable() external onlyOwner {
        launchUpgradeable = false;
    }

    /// @notice Deploys a new upgradeable NFTStrategy contract
    /// @param _collection The NFT collection address
    /// @param _hook The hook contract address
    /// @param _tokenName The name of the strategy token
    /// @param _tokenSymbol The symbol of the strategy token
    /// @param _buyIncrement The buy increment for price calculations
    /// @param _owner The owner of the NFTStrategy contract
    /// @return proxy The deployed NFTStrategy proxy contract
    /// @dev Uses ERC1967 proxy pattern with packed immutable args
    function _deployUpgradeableNFTStrategy(
        address _collection,
        address _hook,
        string memory _tokenName,
        string memory _tokenSymbol,
        uint256 _buyIncrement,
        address _owner
    ) internal returns (NFTStrategy proxy) {
        bytes memory args = abi.encodePacked(address(this), IUniswapV4Router04(router), IPoolManager(poolManager));
        proxy = NFTStrategy(payable(LibClone.deployERC1967(address(nftStrategyImplementation), args)));

        proxy.initialize(
            _collection, _hook, _tokenName, _tokenSymbol, _buyIncrement, launchUpgradeable ? _owner : address(0)
        );
    }

    /// @notice Updates the hook attached to new NFTStrategy pools
    /// @param _hookAddress New Uniswap v4 hook address
    /// @dev Only callable by owner
    function updateHookAddress(address _hookAddress) external onlyOwner {
        hookAddress = _hookAddress;
    }

    /// @notice Updates whether an address is authorized as a launcher
    /// @param _launcher Address to update launcher status for
    /// @param _authorized Whether the address should be authorized as a launcher
    /// @dev Only callable by owner
    function updateLauncher(address _launcher, bool _authorized) external onlyOwner {
        launchers[_launcher] = _authorized;
    }

    /// @notice Updates the name of a specific NFTStrategy token
    /// @param nftStrategy Address of the NFTStrategy contract
    /// @param tokenName New name for the token
    function updateTokenName(address nftStrategy, string memory tokenName) external onlyOwner {
        INFTStrategy(nftStrategy).updateName(tokenName);
    }

    /// @notice Updates the symbol of a specific NFTStrategy token
    /// @param nftStrategy Address of the NFTStrategy contract
    /// @param tokenSymbol New symbol for the token
    function updateTokenSymbol(address nftStrategy, string memory tokenSymbol) external onlyOwner {
        INFTStrategy(nftStrategy).updateSymbol(tokenSymbol);
    }

    /// @notice Updates the price multiplier for a specific NFTStrategy
    /// @param nftStrategy Address of the NFTStrategy contract
    /// @param newMultiplier New multiplier in basis points (1100 = 1.1x)
    function updatePriceMultiplier(address nftStrategy, uint256 newMultiplier) external onlyOwner {
        INFTStrategy(nftStrategy).setPriceMultiplier(newMultiplier);
    }


    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                  INTERNAL FUNCTIONS                 */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Internal function to load initial liquidity into the Uniswap V4 pool
    /// @param _token Address of the NFTStrategy ERC20 token
    /// @dev Creates pool, initializes with starting price, and adds liquidity
    function _loadLiquidity(address _token) internal {
        loadingLiquidity = true;

        // Create the pool with ETH (currency0) and TOKEN (currency1)
        Currency currency0 = Currency.wrap(address(0)); // ETH
        Currency currency1 = Currency.wrap(_token); // NFTStrategy Token

        uint24 lpFee = 0;
        int24 tickSpacing = 60;

        uint256 token0Amount = 1; // 1 wei
        uint256 token1Amount = 1_000_000_000 * 10 ** 18; // 1B TOKEN

        // 10e18 ETH = 1_000_000_000e18 TOKEN
        uint160 startingPrice = 501082896750095888663770159906816;

        int24 tickLower = TickMath.minUsableTick(tickSpacing);
        int24 tickUpper = int24(175020);

        PoolKey memory key = PoolKey(currency0, currency1, lpFee, tickSpacing, IHooks(hookAddress));
        bytes memory hookData = new bytes(0);

        // Hardcoded from LiquidityAmounts.getLiquidityForAmounts
        uint128 liquidity = 158372218983990412488087;

        uint256 amount0Max = token0Amount + 1 wei;
        uint256 amount1Max = token1Amount + 1 wei;

        (bytes memory actions, bytes[] memory mintParams) =
            _mintLiquidityParams(key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, DEAD_ADDRESS, hookData);

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

    /// @notice Creates parameters for minting liquidity in Uniswap V4
    /// @param poolKey The pool key for the liquidity position
    /// @param _tickLower Lower tick boundary
    /// @param _tickUpper Upper tick boundary
    /// @param liquidity Amount of liquidity to mint
    /// @param amount0Max Maximum amount of token0 to use
    /// @param amount1Max Maximum amount of token1 to use
    /// @param recipient Address to receive the liquidity position
    /// @param hookData Additional data for hooks
    /// @return Encoded actions and parameters for position manager
    /// @dev Internal helper for liquidity operations
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

    /// @notice Buys RestrictedToken tokens with ETH and burns them by sending to dead address
    /// @param amountIn The amount of ETH to spend on RestrictedToken tokens
    /// @dev Uses RestrictedToken pool to swap ETH for RestrictedToken and burn
    function _buyAndBurnRestrictedToken(uint256 amountIn) internal {
        PoolKey memory key =
            PoolKey(Currency.wrap(address(0)), Currency.wrap(RESTRICTED_TOKEN_ADDRESS), 0, 60, IHooks(NFT_STRATEGY_HOOK_ADDRESS));

        router.swapExactTokensForTokens{value: amountIn}(amountIn, 0, true, key, "", DEAD_ADDRESS, block.timestamp);
    }

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                    USER FUNCTIONS                   */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Launches a new NFTStrategy contract with owner permissions
    /// @param collection Address of the NFT collection contract
    /// @param tokenName Name of the strategy token
    /// @param tokenSymbol Symbol of the strategy token
    /// @param collectionOwner Address that will receive fees from the strategy
    /// @param buyIncrement The buy increment for price calculations
    /// @return The deployed NFTStrategy contract
    /// @dev Only callable by contract owner, deploys NFTStrategy and initializes liquidity
    function ownerLaunchNFTStrategy(
        address collection,
        string memory tokenName,
        string memory tokenSymbol,
        address collectionOwner,
        uint256 buyIncrement
    ) external payable onlyLauncher returns (NFTStrategy) {
        // Validate the parameters passed
        if (hookAddress == address(0)) revert HookNotSet();
        if (checkIfAlreadyLaunched(collection)) revert CollectionAlreadyLaunched();
        if (buyIncrement < 0.01 ether || buyIncrement > 0.1 ether) {
            revert InvalidIncrement();
        }

        if (!IERC721(collection).supportsInterface(0x80ac58cd)) revert NotERC721();

        NFTStrategy nftStrategy =
            _deployUpgradeableNFTStrategy(collection, hookAddress, tokenName, tokenSymbol, buyIncrement, owner());

        collectionToNFTStrategy[collection] = address(nftStrategy);
        nftStrategyToCollection[address(nftStrategy)] = collection;

        // Costs 2 wei
        _loadLiquidity(address(nftStrategy));

        // Set fees to collectionOwner
        INFTStrategyHook(hookAddress).adminUpdateFeeAddress(address(nftStrategy), collectionOwner);

        emit NFTStrategyLaunched(collection, address(nftStrategy), tokenName, tokenSymbol);

        return nftStrategy;
    }

    /// @notice Processes RestrictedToken token buyback using TWAP mechanism
    /// @dev Can be called once every twapDelayInBlocks, caller receives 0.5% reward
    /// @dev Uses contract's ETH balance to buy and burn RestrictedToken tokens
    function processTokenTwap() external nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoETHToTwap();

        // Check if enough blocks have passed since last TWAP
        if (block.number < lastTwapBlock + twapDelayInBlocks) revert TwapDelayNotMet();

        // Calculate amount to burn - either twapIncrement or remaining ethToTwap
        uint256 burnAmount = twapIncrement;
        if (balance < twapIncrement) {
            burnAmount = balance;
        }

        // Set reward to 0.5% of burnAmount
        uint256 reward = (burnAmount * 5) / 1000;
        burnAmount -= reward;

        // Update state
        lastTwapBlock = block.number;

        _buyAndBurnRestrictedToken(burnAmount);

        // Send reward to caller
        SafeTransferLib.forceSafeTransferETH(msg.sender, reward);
    }


    /// @notice Checks if a collection already has a strategy launched
    /// @param collection The address of the NFT collection to check
    /// @return True if collection already has a strategy, false otherwise
    /// @dev Checks both current factory and old factory for existing strategies
    function checkIfAlreadyLaunched(address collection) public view returns (bool) {
        return collectionToNFTStrategy[collection] != address(0)
            || INFTStrategyFactory(OLD_FACTORY).collectionToNFTStrategy(collection) != address(0);
    }

    /// @notice Allows the contract to receive ETH for twap
    receive() external payable {}
}