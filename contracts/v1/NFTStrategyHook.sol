// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {RestrictedToken} from "../RestrictedToken.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import "./Interfaces.sol";
import "./FeeContract.sol";
import "./IUniswapV4Router04.sol";

/// @title NFTStrategyHook - Uniswap V4 Hook for NFTStrategy
contract NFTStrategyHook is BaseHook, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using CurrencySettler for Currency;
    using SafeCast for uint256;
    using SafeCast for int128;

    /*                      CONSTANTS                      */

    uint128 private constant TOTAL_BIPS = 10000;
    uint128 private constant FLAT_FEE = 1500; // 15% flat fee
    uint128 private constant FEE_CONTRACT_SHARE_BIPS = 9333; // 93.33% of collected hook fee amount
    uint128 private constant FOUNDER_REMAINDER_SHARE_BIPS = 2500; // 25% of the 6.66% remainder
    uint160 private constant MAX_PRICE_LIMIT = TickMath.MAX_SQRT_PRICE - 1;
    uint160 private constant MIN_PRICE_LIMIT = TickMath.MIN_SQRT_PRICE + 1;

    RestrictedToken immutable restrictedToken;
    INFTStrategyFactory public nftStrategyFactory;
    IPoolManager public manager;
    address public feeAddress;
    
    // New state for Rarity Town Protocol
    mapping(address => address) public activeFeeContract; // rarityToken => FeeContract
    mapping(address => address) public feeContractToRarityToken; // FeeContract => rarityToken
    address public founderWallet1; // 25% share of the remainder
    address public founderWallet2; // fallback recipient for buyback share when disabled
    address public brandAssetToken;
    address public brandAssetHook;
    bool public brandAssetEnabled;
    address payable public routerAddress;
    address public openSeaBuyer;
    
    // Hot wallet system
    address public hotWallet;
    mapping(address => bool) public authorizedCallers; // hotWallet and admin can call getters

    /*                   STATE VARIABLES                   */

    mapping(address => uint256) public deploymentBlock;
    mapping(address => address) public feeAddressClaimedByOwner;

    /*                    CUSTOM ERRORS                    */

    error NotNFTStrategy();
    error NotNFTStrategyFactoryOwner();
    error InvalidCollection();
    error NotCollectionOwner();
    error NotAuthorizedCaller();
    error InvalidHotWallet();
    error InsufficientBalance();
    error VaultFeeTransferFailed();

    /*                    CUSTOM EVENTS                    */

    event HookFee(bytes32 indexed id, address indexed sender, uint128 feeAmount0, uint128 feeAmount1);
    event Trade(address indexed nftStrategy, uint160 sqrtPriceX96, int128 ethAmount, int128 tokenAmount);

    /*                     CONSTRUCTOR                     */

    constructor(
        IPoolManager _poolManager,
        RestrictedToken _restrictedToken,
        INFTStrategyFactory _nftStrategyFactory,
        address _feeAddress
    ) BaseHook(_poolManager) {
        manager = _poolManager;
        restrictedToken = _restrictedToken;
        nftStrategyFactory = _nftStrategyFactory;
        feeAddress = _feeAddress;
        founderWallet1 = _feeAddress; // Initialize founder wallet 1 to fee address (owner)
        founderWallet2 = _feeAddress; // Initialize founder wallet 2 to fee address (owner)
        
        // Initialize authorized callers
        authorizedCallers[_feeAddress] = true; // Admin is authorized
    }

    /*                     FUNCTIONS                       */


    function setNFTStrategyFactory(address _nftStrategyFactory) external onlyOwnerOrAuthorized {
        nftStrategyFactory = INFTStrategyFactory(_nftStrategyFactory);
    }

    function setpoolmanager(address _poolManager) external onlyOwnerOrAuthorized {
        manager = IPoolManager(_poolManager);
    }

    function updateFeeAddress(address _feeAddress) external onlyOwnerOrAuthorized {
        feeAddress = _feeAddress;
    }

    function updateFeeAddressForCollection(address nftStrategy, address destination) external {
        address collection = nftStrategyFactory.nftStrategyToCollection(nftStrategy);
        if (collection == address(0)) revert InvalidCollection();
        if (IERC721(collection).owner() != msg.sender) revert NotCollectionOwner();
        feeAddressClaimedByOwner[nftStrategy] = destination;
    }

    function adminUpdateFeeAddress(address nftStrategy, address destination) external {
        if (
            msg.sender != nftStrategyFactory.owner() &&
            msg.sender != address(nftStrategyFactory) &&
            !authorizedCallers[msg.sender]
        ) revert NotNFTStrategyFactoryOwner();
        feeAddressClaimedByOwner[nftStrategy] = destination;
    }

    /*               RARITY TOWN PROTOCOL FUNCTIONS        */

    function setActiveFeeContract(address rarityToken, address feeContract) external onlyOwnerOrAuthorized {
        activeFeeContract[rarityToken] = feeContract;
        feeContractToRarityToken[feeContract] = rarityToken;
    }

    /// @notice Set founder wallet 1 address (0.25% recipient)
    /// @param _founderWallet1 The new founder wallet 1 address
    function setFounderWallet1(address _founderWallet1) external onlyOwnerOrAuthorized {
        founderWallet1 = _founderWallet1;
    }

    /// @notice Set founder wallet 2 address (fallback recipient for buyback share)
    /// @param _founderWallet2 The new founder wallet 2 address
    function setFounderWallet2(address _founderWallet2) external onlyOwnerOrAuthorized {
        founderWallet2 = _founderWallet2;
    }

    /// @notice Get founder wallet 1 address
    /// @return The address of founder wallet 1 (25% of remainder)
    function getFounderWallet1() external view returns (address) {
        return founderWallet1;
    }

    /// @notice Get founder wallet 2 address
    /// @return The address of founder wallet 2 (fallback buyback recipient)
    function getFounderWallet2() external view returns (address) {
        return founderWallet2;
    }

    function setBrandAsset(address _brandAssetToken, bool _enabled) external onlyOwnerOrAuthorized {
        brandAssetToken = _brandAssetToken;
        brandAssetEnabled = _enabled;
    }

    /*               HOT WALLET SYSTEM FUNCTIONS           */

    /// @notice Set the hot wallet address (can be generated off-chain)
    /// @param _hotWallet The new hot wallet address
    function setHotWallet(address _hotWallet) external onlyOwnerOrAuthorized {
        if (_hotWallet == address(0)) revert InvalidHotWallet();
        
        // Remove old hot wallet authorization
        if (hotWallet != address(0)) {
            authorizedCallers[hotWallet] = false;
        }
        
        // Set new hot wallet and authorize it
        hotWallet = _hotWallet;
        authorizedCallers[_hotWallet] = true;
    }

    /// @notice Add or remove authorized callers for getter functions
    /// @param caller The address to authorize/deauthorize
    /// @param authorized Whether to authorize or deauthorize
    function setAuthorizedCaller(address caller, bool authorized) external onlyOwnerOrAuthorized {
        authorizedCallers[caller] = authorized;
    }

    /// @notice Fund the hot wallet with ETH from the hook contract
    /// @param amount Amount of ETH to send to hot wallet (in wei)
    function fundHotWallet(uint256 amount) external onlyOwnerOrAuthorized {
        if (hotWallet == address(0)) revert InvalidHotWallet();
        if (address(this).balance < amount) revert InsufficientBalance();
        
        SafeTransferLib.forceSafeTransferETH(hotWallet, amount);
    }

    /// @notice Check if address is authorized to call getter functions
    /// @param caller The address to check
    /// @return True if authorized, false otherwise
    function isAuthorizedCaller(address caller) external view returns (bool) {
        return authorizedCallers[caller];
    }

    /*               MODIFIER FOR AUTHORIZED ACCESS        */

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender]) revert NotAuthorizedCaller();
        _;
    }

    modifier onlyOwnerOrAuthorized() {
        address owner = nftStrategyFactory.owner();
        if (msg.sender != owner && !authorizedCallers[msg.sender]) {
            revert NotNFTStrategyFactoryOwner();
        }
        _;
    }

    // COMMENTED OUT FOR MANUAL MODE
    // function ensureActiveFeeContract(address rarityToken) internal {
    //     if (activeFeeContract[rarityToken] == address(0)) {
    //         // Create new FeeContract
    //         address collection = nftStrategyFactory.nftStrategyToCollection(rarityToken);
    //         
    //         FeeContract newFeeContract = new FeeContract(
    //             address(nftStrategyFactory),
    //             address(this),
    //             IUniswapV4Router04(routerAddress),
    //             collection,
    //             rarityToken
    //         );
    //         
    //         activeFeeContract[rarityToken] = address(newFeeContract);
    //     }
    // }

    // COMMENTED OUT FOR MANUAL MODE - Use forceRotateFeeContract() instead
    // function rotateIfFull(address rarityToken) public {
    //     address currentFeeContract = activeFeeContract[rarityToken];
    //     
    //     if (currentFeeContract != address(0)) {
    //         (bool success, bytes memory data) = currentFeeContract.call(abi.encodeWithSignature("isFull()"));
    //         if (success && abi.decode(data, (bool))) {
    //             // Create new FeeContract
    //             address collection = nftStrategyFactory.nftStrategyToCollection(rarityToken);
    //             
    //             FeeContract newFeeContract = new FeeContract(
    //                 address(nftStrategyFactory),
    //                 address(this),
    //                 IUniswapV4Router04(routerAddress),
    //                 collection,
    //                 rarityToken
    //             );
    //             
    //             activeFeeContract[rarityToken] = address(newFeeContract);
    //         }
    //     }
    // }

    /*               AUTHORIZED GETTER FUNCTIONS            */

    /// @notice Check if specific FeeContract is full (authorized access only)
    /// @param feeContractAddress The specific FeeContract address to check
    /// @return isFull True if the FeeContract is full (5+ NFTs), false otherwise
    function isFeeContractFull(address feeContractAddress) external view onlyAuthorized returns (bool) {
        if (feeContractAddress == address(0)) return false;
        
        (bool success, bytes memory data) = feeContractAddress.staticcall(abi.encodeWithSignature("isFull()"));
        if (success) {
            return abi.decode(data, (bool));
        }
        return false;
    }

    /// @notice Get current holdings of specific FeeContract (authorized access only)
    /// @param feeContractAddress The specific FeeContract address to check
    /// @return holdings Number of NFTs currently held by the FeeContract
    function getFeeContractHoldings(address feeContractAddress) external view onlyAuthorized returns (uint256) {
        if (feeContractAddress == address(0)) return 0;
        
        (bool success, bytes memory data) = feeContractAddress.staticcall(abi.encodeWithSignature("currentHoldings()"));
        if (success) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }

    /// @notice Get current fees of specific FeeContract (authorized access only)
    /// @param feeContractAddress The specific FeeContract address to check
    /// @return fees Amount of ETH fees currently held by the FeeContract
    function getFeeContractFees(address feeContractAddress) external view onlyAuthorized returns (uint256) {
        if (feeContractAddress == address(0)) return 0;
        
        (bool success, bytes memory data) = feeContractAddress.staticcall(abi.encodeWithSignature("currentFees()"));
        if (success) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }

    /// @notice Get the RARITY token associated with a FeeContract (authorized access only)
    /// @param feeContractAddress The FeeContract address
    /// @return rarityToken The associated RARITY token address
    function getRarityTokenFromFeeContract(address feeContractAddress) external view onlyAuthorized returns (address) {
        return feeContractToRarityToken[feeContractAddress];
    }

    /// @notice Get the collection associated with a FeeContract (authorized access only)
    /// @param feeContractAddress The FeeContract address
    /// @return collection The associated NFT collection address
    function getCollectionFromFeeContract(address feeContractAddress) external view onlyAuthorized returns (address) {
        address rarityToken = feeContractToRarityToken[feeContractAddress];
        if (rarityToken == address(0)) return address(0);
        return nftStrategyFactory.nftStrategyToCollection(rarityToken);
    }

    /// @notice Get comprehensive FeeContract info (authorized access only)
    /// @param feeContractAddress The FeeContract address
    /// @return rarityToken The RARITY token address
    /// @return collection The NFT collection address
    /// @return currentHoldings Number of NFTs held
    /// @return currentFees Amount of ETH fees held
    /// @return isFull Whether the vault is full (5+ NFTs)
    function getFeeContractInfo(address feeContractAddress) external view onlyAuthorized returns (
        address rarityToken,
        address collection,
        uint256 currentHoldings,
        uint256 currentFees,
        bool isFull
    ) {
        if (feeContractAddress == address(0)) {
            return (address(0), address(0), 0, 0, false);
        }

        rarityToken = feeContractToRarityToken[feeContractAddress];
        collection = rarityToken != address(0) ? nftStrategyFactory.nftStrategyToCollection(rarityToken) : address(0);

        (bool success1, bytes memory data1) = feeContractAddress.staticcall(abi.encodeWithSignature("currentHoldings()"));
        currentHoldings = success1 ? abi.decode(data1, (uint256)) : 0;

        (bool success2, bytes memory data2) = feeContractAddress.staticcall(abi.encodeWithSignature("currentFees()"));
        currentFees = success2 ? abi.decode(data2, (uint256)) : 0;

        (bool success3, bytes memory data3) = feeContractAddress.staticcall(abi.encodeWithSignature("isFull()"));
        isFull = success3 ? abi.decode(data3, (bool)) : false;
    }

    /*               RARITY TOKEN GETTERS                  */

    /// @notice Check if current FeeContract is full by RARITY token (manual check)
    function isActiveFeeContractFull(address rarityToken) external view returns (bool) {
        address currentFeeContract = activeFeeContract[rarityToken];
        if (currentFeeContract == address(0)) return false;
        
        (bool success, bytes memory data) = currentFeeContract.staticcall(abi.encodeWithSignature("isFull()"));
        if (success) {
            return abi.decode(data, (bool));
        }
        return false;
    }

    /// @notice Check if a FeeContract exists for a RARITY token
    function hasFeeContract(address rarityToken) external view returns (bool) {
        return activeFeeContract[rarityToken] != address(0);
    }

    /// @notice Get active FeeContract address (returns address(0) if none)
    function getActiveFeeContract(address rarityToken) external view returns (address) {
        return activeFeeContract[rarityToken];
    }

    function setRouterAddress(address payable _routerAddress) external onlyOwnerOrAuthorized {
        routerAddress = _routerAddress;
    }

    function setOpenSeaBuyer(address _openSeaBuyer) external onlyOwnerOrAuthorized {
        openSeaBuyer = _openSeaBuyer;
    }

    function getOpenSeaBuyer() external view returns (address) {
        return openSeaBuyer;
    }

    /// @notice Manually deploy a new FeeContract for a RARITY token
    /// @param rarityToken The RARITY token address to create a FeeContract for
    /// @return feeContract Address of the newly created FeeContract
    function deployNewFeeContract(address rarityToken) external onlyOwnerOrAuthorized returns (address) {
        
        address collection = nftStrategyFactory.nftStrategyToCollection(rarityToken);
        if (collection == address(0)) revert InvalidCollection();
        
        FeeContract newFeeContract = new FeeContract(
            address(nftStrategyFactory),
            address(this),
            IUniswapV4Router04(routerAddress),
            collection,
            rarityToken,
            openSeaBuyer
        );
        
        // Set as active FeeContract and track reverse mapping
        activeFeeContract[rarityToken] = address(newFeeContract);
        feeContractToRarityToken[address(newFeeContract)] = rarityToken;
        
        return address(newFeeContract);
    }

    /// @notice Force create a new FeeContract even if current one isn't full
    /// @param rarityToken The RARITY token address
    /// @return feeContract Address of the newly created FeeContract
    function forceRotateFeeContract(address rarityToken) external onlyOwnerOrAuthorized returns (address) {
        
        address collection = nftStrategyFactory.nftStrategyToCollection(rarityToken);
        if (collection == address(0)) revert InvalidCollection();
        
        FeeContract newFeeContract = new FeeContract(
            address(nftStrategyFactory),
            address(this),
            IUniswapV4Router04(routerAddress),
            collection,
            rarityToken,
            openSeaBuyer

        );
        
        // Set as active FeeContract and track reverse mapping (replaces current one)
        activeFeeContract[rarityToken] = address(newFeeContract);
        feeContractToRarityToken[address(newFeeContract)] = rarityToken;
        
        return address(newFeeContract);
    }
 
    function _processFees(address rarityToken, uint256 feeAmount) internal {
        if (feeAmount == 0) return;
        
        // Manual mode: Admin must manage FeeContracts off-chain
        uint256 vaultAmount = (feeAmount * FEE_CONTRACT_SHARE_BIPS) / TOTAL_BIPS; // 93.33%
        uint256 remainder = feeAmount - vaultAmount; // 6.66%
        bool vaultFunded;

        address activeVault = activeFeeContract[rarityToken];
        if (vaultAmount > 0 && activeVault != address(0)) {
            (bool success,) = activeVault.call{value: vaultAmount}(abi.encodeWithSignature("addFees()"));
            vaultFunded = success;
        }

        if (!vaultFunded) {
            remainder += vaultAmount;
        }

        if (remainder == 0) {
            return;
        }

        uint256 founderAmount = (remainder * FOUNDER_REMAINDER_SHARE_BIPS) / TOTAL_BIPS; // 25%
        uint256 buyBackAmount = remainder - founderAmount; // 75%
        
        if (founderAmount > 0) {
            address destination = feeAddressClaimedByOwner[rarityToken];
            if (destination == address(0)) {
                destination = founderWallet1 != address(0) ? founderWallet1 : feeAddress;

            } else {
                SafeTransferLib.forceSafeTransferETH(destination, founderAmount);
            }
        }
        
        if (buyBackAmount > 0) {
            if (
                brandAssetEnabled &&
                brandAssetToken != address(0)
            ) {
                _buyAndBurnBrandAsset(buyBackAmount);
            } else {
                address destination = founderWallet2 != address(0) ? founderWallet2 : feeAddress;
                if (destination != address(0)) {
                    SafeTransferLib.forceSafeTransferETH(destination, buyBackAmount);
                }
            }
        }
    }

    /// @notice Buys brand asset token with ETH and burns it by sending to dead address
    /// @param amountIn The amount of ETH to spend on tokens that will be burned
    /// @dev Only executes when brandAssetEnabled is true (checked in _processFees)
    /// @dev This burns 75% of 6.66% of 15% = 0.74925% of total swap amount
    function _buyAndBurnBrandAsset(uint256 amountIn) internal {
        if (brandAssetToken == address(0) || routerAddress == address(0)) return;
        
        // Create PoolKey for ETH -> brandAssetToken swap (no hook needed)
        PoolKey memory poolKey = PoolKey(
            Currency.wrap(address(0)), // currency0 = ETH
            Currency.wrap(brandAssetToken), // currency1 = brandAssetToken
            0, // fee tier
            60, // tickSpacing
            IHooks(address(0)) // no hook needed for this swap
        );
        
        // Swap ETH for brandAssetToken and send directly to dead address (burn)
        // zeroForOne = true means swapping currency0 (ETH) for currency1 (token)
        IUniswapV4Router04(routerAddress).swapExactTokensForTokens{value: amountIn}(
            amountIn,
            0, // amountOutMin - accept any amount of tokens
            true, // zeroForOne - swap ETH for token
            poolKey,
            "", // hookData - empty for this swap
            0x000000000000000000000000000000000000dEaD, // receiver - send tokens to dead address to burn
            block.timestamp // deadline
        );
    }

    function calculateFee(address /*collection*/, bool /*isBuying*/) public view returns (uint128) {
        // Always return flat 15% fee for Rarity Town Protocol
        if(nftStrategyFactory.deployerBuying()) return 0;
        return FLAT_FEE;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _beforeInitialize(address, PoolKey calldata key, uint160)
        internal
        override
        returns (bytes4)
    {        
        if(!nftStrategyFactory.loadingLiquidity()) {
            revert NotNFTStrategy();
        }

        address collection = Currency.unwrap(key.currency1);
        deploymentBlock[collection] = block.number;
        
        return BaseHook.beforeInitialize.selector;
    }

    function _beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4)
    {        
        if(!nftStrategyFactory.loadingLiquidity()) {
            revert NotNFTStrategy();
        }
        return BaseHook.beforeAddLiquidity.selector;
    }

    function _beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        if (nftStrategyFactory.routerRestrict()) {
            address rarityToken = Currency.unwrap(key.currency1);
            INFTStrategy(rarityToken).setMidSwap(true);
        }
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        bool specifiedTokenIs0 = (params.amountSpecified < 0) == params.zeroForOne;
        Currency feeCurrency = specifiedTokenIs0 ? key.currency1 : key.currency0;
        int128 rawSwapAmount = specifiedTokenIs0 ? delta.amount1() : delta.amount0();
        int256 magnitude = int256(rawSwapAmount);
        if (magnitude < 0) {
            magnitude = -magnitude;
        }
        uint128 swapAmount = uint128(uint256(magnitude));

        bool ethFee = Currency.unwrap(feeCurrency) == address(0);
        address rarityToken = Currency.unwrap(key.currency1);

        uint128 currentFee = calculateFee(rarityToken, params.zeroForOne);
        uint256 feeAmount = uint256(swapAmount) * currentFee / TOTAL_BIPS;

        if (feeAmount == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        manager.take(feeCurrency, address(this), feeAmount);

        uint128 feeAmount128 = uint128(feeAmount);

        emit HookFee(
            PoolId.unwrap(key.toId()),
            sender,
            ethFee ? feeAmount128 : 0,
            ethFee ? 0 : feeAmount128
        );

        uint256 amountForProcessing = ethFee ? feeAmount : _swapToEth(key, feeAmount);
        _processFees(rarityToken, amountForProcessing);
        
        emit Trade(rarityToken, _getCurrentPrice(key), delta.amount0(), delta.amount1());

        if (nftStrategyFactory.routerRestrict()) {
            INFTStrategy(rarityToken).setMidSwap(false);
        }
        return (BaseHook.afterSwap.selector, feeAmount.toInt128());
    }

    function _swapToEth(PoolKey memory key, uint256 amount) internal returns (uint256) {
        uint256 ethBefore = address(this).balance;
        
        BalanceDelta delta = manager.swap(
            key,
            SwapParams({
                zeroForOne: false,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: MAX_PRICE_LIMIT
            }),
            bytes("")
        );

        // Handle token settlements
        if (delta.amount0() < 0) {
            key.currency0.settle(poolManager, address(this), uint256(int256(-delta.amount0())), false);
        } else if (delta.amount0() > 0) {
            key.currency0.take(poolManager, address(this), uint256(int256(delta.amount0())), false);
        }

        if (delta.amount1() < 0) {
            key.currency1.settle(poolManager, address(this), uint256(int256(-delta.amount1())), false);
        } else if (delta.amount1() > 0) {
            key.currency1.take(poolManager, address(this), uint256(int256(delta.amount1())), false);
        }

        return address(this).balance - ethBefore;
    }

    function _getCurrentPrice(PoolKey calldata key) internal view returns (uint160) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        return sqrtPriceX96;
    }

    receive() external payable {}
}
