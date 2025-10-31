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
    uint128 private constant VAULT_FEE_PORTION = 1400; // 14% to vault
    uint128 private constant FOUNDER_FEE_PORTION = 100; // 1% to founder
    uint160 private constant MAX_PRICE_LIMIT = TickMath.MAX_SQRT_PRICE - 1;
    uint160 private constant MIN_PRICE_LIMIT = TickMath.MIN_SQRT_PRICE + 1;

    RestrictedToken immutable restrictedToken;
    INFTStrategyFactory public nftStrategyFactory;
    IPoolManager public manager;
    address public feeAddress;
    
    // New state for Rarity Town Protocol
    mapping(address => address) public activeFeeContract; // rarityToken => FeeContract
    address public founderWallet;
    address public brandAssetToken;
    address public brandAssetHook;
    bool public brandAssetEnabled;
    address payable public routerAddress;

    /*                   STATE VARIABLES                   */

    mapping(address => uint256) public deploymentBlock;
    mapping(address => address) public feeAddressClaimedByOwner;

    /*                    CUSTOM ERRORS                    */

    error NotNFTStrategy();
    error NotNFTStrategyFactoryOwner();
    error InvalidCollection();
    error NotCollectionOwner();

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
        founderWallet = _feeAddress; // Initialize founder wallet to fee address
    }

    /*                     FUNCTIONS                       */


    function setNFTStrategyFactory(address _nftStrategyFactory) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        nftStrategyFactory = INFTStrategyFactory(_nftStrategyFactory);
    }

    function setpoolmanager(address _poolManager) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        manager = IPoolManager(_poolManager);
    }

    function updateFeeAddress(address _feeAddress) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        feeAddress = _feeAddress;
    }

    function updateFeeAddressForCollection(address nftStrategy, address destination) external {
        address collection = nftStrategyFactory.nftStrategyToCollection(nftStrategy);
        if (collection == address(0)) revert InvalidCollection();
        if (IERC721(collection).owner() != msg.sender) revert NotCollectionOwner();
        feeAddressClaimedByOwner[nftStrategy] = destination;
    }

    function adminUpdateFeeAddress(address nftStrategy, address destination) external {
        if (msg.sender != nftStrategyFactory.owner() && msg.sender != address(nftStrategyFactory)) revert NotNFTStrategyFactoryOwner();        
        feeAddressClaimedByOwner[nftStrategy] = destination;
    }

    /*               RARITY TOWN PROTOCOL FUNCTIONS        */

    function setActiveFeeContract(address rarityToken, address feeContract) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        activeFeeContract[rarityToken] = feeContract;
    }

    function setFounderWallet(address _founderWallet) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        founderWallet = _founderWallet;
    }

    function setBrandAsset(address _brandAssetToken, address _brandAssetHook, bool _enabled) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        brandAssetToken = _brandAssetToken;
        brandAssetHook = _brandAssetHook;
        brandAssetEnabled = _enabled;
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

    /// @notice Check if current FeeContract is full (manual check)
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

    /// @notice Check if any FeeContract address is full
    /// @param feeContractAddress The specific FeeContract address to check
    /// @return isFull True if the FeeContract is full (5+ NFTs), false otherwise
    function isFeeContractFull(address feeContractAddress) external view returns (bool) {
        if (feeContractAddress == address(0)) return false;
        
        (bool success, bytes memory data) = feeContractAddress.staticcall(abi.encodeWithSignature("isFull()"));
        if (success) {
            return abi.decode(data, (bool));
        }
        return false;
    }

    /// @notice Get current holdings of any FeeContract address
    /// @param feeContractAddress The specific FeeContract address to check
    /// @return holdings Number of NFTs currently held by the FeeContract
    function getFeeContractHoldings(address feeContractAddress) external view returns (uint256) {
        if (feeContractAddress == address(0)) return 0;
        
        (bool success, bytes memory data) = feeContractAddress.staticcall(abi.encodeWithSignature("currentHoldings()"));
        if (success) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }

    /// @notice Get current fees of any FeeContract address
    /// @param feeContractAddress The specific FeeContract address to check
    /// @return fees Amount of ETH fees currently held by the FeeContract
    function getFeeContractFees(address feeContractAddress) external view returns (uint256) {
        if (feeContractAddress == address(0)) return 0;
        
        (bool success, bytes memory data) = feeContractAddress.staticcall(abi.encodeWithSignature("currentFees()"));
        if (success) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }

    function setRouterAddress(address payable _routerAddress) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        routerAddress = _routerAddress;
    }

    /// @notice Manually deploy a new FeeContract for a RARITY token
    /// @param rarityToken The RARITY token address to create a FeeContract for
    /// @return feeContract Address of the newly created FeeContract
    function deployNewFeeContract(address rarityToken) external returns (address) {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        
        address collection = nftStrategyFactory.nftStrategyToCollection(rarityToken);
        require(collection != address(0), "Invalid RARITY token");
        
        FeeContract newFeeContract = new FeeContract(
            address(nftStrategyFactory),
            address(this),
            IUniswapV4Router04(routerAddress),
            collection,
            rarityToken
        );
        
        // Set as active FeeContract
        activeFeeContract[rarityToken] = address(newFeeContract);
        
        return address(newFeeContract);
    }

    /// @notice Force create a new FeeContract even if current one isn't full
    /// @param rarityToken The RARITY token address
    /// @return feeContract Address of the newly created FeeContract
    function forceRotateFeeContract(address rarityToken) external returns (address) {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        
        address collection = nftStrategyFactory.nftStrategyToCollection(rarityToken);
        require(collection != address(0), "Invalid RARITY token");
        
        FeeContract newFeeContract = new FeeContract(
            address(nftStrategyFactory),
            address(this),
            IUniswapV4Router04(routerAddress),
            collection,
            rarityToken
        );
        
        // Set as active FeeContract (replaces current one)
        activeFeeContract[rarityToken] = address(newFeeContract);
        
        return address(newFeeContract);
    }
 
    function _processFees(address rarityToken, uint256 feeAmount) internal {
        if (feeAmount == 0) return;
        
        // MANUAL MODE: No automatic FeeContract creation
        // Admin must manually deploy FeeContracts using deployNewFeeContract()
        // ensureActiveFeeContract(rarityToken);  // ← COMMENTED OUT
        
        // MANUAL MODE: No automatic rotation
        // Admin must manually rotate using forceRotateFeeContract()
        // rotateIfFull(rarityToken);  // ← COMMENTED OUT
        
        // Calculate fee distribution: 14% to vault, 1% to founder
        uint256 vaultAmount = (feeAmount * VAULT_FEE_PORTION) / TOTAL_BIPS;
        uint256 founderAmount = (feeAmount * FOUNDER_FEE_PORTION) / TOTAL_BIPS;
        
        // Send 14% to active FeeContract (if one exists)
        address activeVault = activeFeeContract[rarityToken];
        if (activeVault != address(0)) {
            (bool success,) = activeVault.call{value: vaultAmount}(abi.encodeWithSignature("addFees()"));
            require(success, "Vault fee transfer failed");
        } else {
            // If no FeeContract exists, send vault portion to founder as well
            founderAmount += vaultAmount;
        }
        
        // Handle founder fee (includes vault portion if no FeeContract)
        if (founderAmount > 0) {
            if (brandAssetEnabled && brandAssetToken != address(0)) {
                // Buy and burn brand asset
                _buyAndBurnBrandAsset(founderAmount);
            } else {
                // Send to founder wallet
                address destination = founderWallet != address(0) ? founderWallet : feeAddress;
                SafeTransferLib.forceSafeTransferETH(destination, founderAmount);
            }
        }
    }

    function _buyAndBurnBrandAsset(uint256 amountIn) internal {
        if (brandAssetToken == address(0) || brandAssetHook == address(0)) return;
        
        // Use router to buy and send to dead address
        // Note: This would need the router interface - keeping simple for now
        // Future implementation would create PoolKey and use router for actual swap
        SafeTransferLib.forceSafeTransferETH(address(0x000000000000000000000000000000000000dEaD), amountIn);
    }

    // Legacy function kept for compatibility
    function _processFeesLegacy(address collection, uint256 feeAmount) internal {
        if (feeAmount == 0) return;
        
        uint256 depositAmount = (feeAmount * 990) / 1000;
        uint256 restrictedTokenAmount = 0;
        uint256 ownerAmount = feeAmount - depositAmount - restrictedTokenAmount;

        // Legacy: send to NFTStrategy (now disabled)
        // INFTStrategy(collection).addFees{value: depositAmount}();
        
        if (restrictedTokenAmount > 0) {
            SafeTransferLib.forceSafeTransferETH(address(nftStrategyFactory), restrictedTokenAmount);
        }
        
        SafeTransferLib.forceSafeTransferETH(feeAddressClaimedByOwner[collection] == address(0) ? feeAddress : feeAddressClaimedByOwner[collection], ownerAmount);
    }

    function calculateFee(address /*collection*/, bool /*isBuying*/) public view returns (uint128) {
        // Always return flat 15% fee for Rarity Town Protocol
        if(nftStrategyFactory.deployerBuying()) return 0;
        return FLAT_FEE;
    }

    // Legacy function kept for compatibility - now returns flat fee
    function calculateFeeLegacy(address collection, bool isBuying) public view returns (uint128) {
        if (!isBuying) return FLAT_FEE;
        if(nftStrategyFactory.deployerBuying()) return 0;

        uint256 deployedAt = deploymentBlock[collection];
        if (deployedAt == 0) return FLAT_FEE;

        uint256 blocksPassed = block.number - deployedAt;
        uint256 feeReductions = (blocksPassed / 5) * 100;

        uint256 maxReducible = 9500 - FLAT_FEE; // Using old STARTING_BUY_FEE logic
        if (feeReductions >= maxReducible) return FLAT_FEE;

        return uint128(9500 - feeReductions);
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
            INFTStrategy(Currency.unwrap(key.currency1)).setMidSwap(true);
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
        bool specifiedTokenIs0 = (params.amountSpecified < 0 == params.zeroForOne);
        (Currency feeCurrency, int128 swapAmount) =
            (specifiedTokenIs0) ? (key.currency1, delta.amount1()) : (key.currency0, delta.amount0());

        if (swapAmount < 0) swapAmount = -swapAmount;

        bool ethFee = Currency.unwrap(feeCurrency) == address(0);
        address collection = Currency.unwrap(key.currency1);

        uint128 currentFee = calculateFee(collection, params.zeroForOne);
        uint256 feeAmount = uint128(swapAmount) * currentFee / TOTAL_BIPS;

        if(feeAmount == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        manager.take(feeCurrency, address(this), feeAmount);

        emit HookFee(
            PoolId.unwrap(key.toId()),
            sender,
            ethFee ? uint128(feeAmount) : 0,
            ethFee ? 0 : uint128(feeAmount)
        );

        address rarityToken = Currency.unwrap(key.currency1);
        
        if (!ethFee) {
            uint256 feeInETH = _swapToEth(key, feeAmount);
            _processFees(rarityToken, feeInETH); 
        } else {
            _processFees(rarityToken, feeAmount); 
        }

        emit Trade(collection, _getCurrentPrice(key), delta.amount0(), delta.amount1());

        if (nftStrategyFactory.routerRestrict()) {
            INFTStrategy(Currency.unwrap(key.currency1)).setMidSwap(false);
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
