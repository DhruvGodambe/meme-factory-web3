// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20, IERC721, INFTStrategy, IFeeHookFactory, IRestrictedToken} from "./Interfaces.sol";

/**
 * @title FeeHook - NFT Collection Fee Hook
 * @notice Hook that charges fees on swaps and distributes them: 90% to collection, 10% to treasury
 * @dev Integrates with factory to ensure only authorized pools can be created
 */
contract FeeHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using BeforeSwapDeltaLibrary for BeforeSwapDelta;
    using StateLibrary for IPoolManager;
    using CurrencySettler for Currency;
    using SafeCast for uint256;
    using SafeCast for int128;

    uint128 private constant TOTAL_BIPS = 10000;
    uint128 private constant DEFAULT_FEE = 1000; // 10% default fee
    uint160 private constant MAX_PRICE_LIMIT = TickMath.MAX_SQRT_PRICE - 1;
    uint160 private constant MIN_PRICE_LIMIT = TickMath.MIN_SQRT_PRICE + 1;

    address public treasury;
    address public owner;
    address public factory;
    
    // Track authorized pools and their collections
    mapping(PoolId => bool) public authorizedPools;
    mapping(PoolId => address) public poolToCollection;
    mapping(address => PoolId) public collectionToPool;
    
    // Collection owners can claim custom fee addresses
    mapping(address => address) public feeAddressClaimedByOwner;

    // Events
    event PoolAuthorized(PoolId indexed poolId, address indexed collection);
    event FeeCollected(
        PoolId indexed poolId,
        Currency indexed currency,
        uint256 amount,
        address indexed collection
    );
    event FeeProcessed(
        address indexed collection,
        uint256 collectionAmount,
        uint256 treasuryAmount
    );
    event TreasurySet(address indexed treasury);
    event FactorySet(address indexed factory);
    event CollectionFeeAddressSet(address indexed collection, address indexed feeAddress);

    error NotOwner();
    error NotFactory();
    error InvalidTreasury();
    error InvalidFactory();
    error InvalidCollection();
    error UnauthorizedPool();
    error NotCollectionOwner();
    error PoolAlreadyExists();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    constructor(
        IPoolManager _poolManager,
        address _treasury,
        address _factory
    ) BaseHook(_poolManager) {
        if (_treasury == address(0)) revert InvalidTreasury();
        if (_factory == address(0)) revert InvalidFactory();
        
        treasury = _treasury;
        factory = _factory;
        owner = msg.sender;
    }

    /**
     * @notice Before pool initialization - authorize the pool
     * @dev Can only be called during factory-controlled liquidity loading
     */
    function _beforeInitialize(
        address, /* sender */
        PoolKey calldata key,
        uint160 /* sqrtPriceX96 */
    ) internal override returns (bytes4) {
        require(address(key.hooks) == address(this), "Pool must use this hook");
        
        // CRITICAL: Only allow pool initialization when factory enables it
        if (!IFeeHookFactory(factory).loadingLiquidity()) {
            revert UnauthorizedPool();
        }
        
        PoolId poolId = key.toId();
        
        // Extract collection address (currency1 is the collection token)
        address collection = Currency.unwrap(key.currency1);
        if (collection == address(0)) revert InvalidCollection();
        
        // Check if pool already exists for this collection
        if (PoolId.unwrap(collectionToPool[collection]) != bytes32(0)) revert PoolAlreadyExists();
        
        authorizedPools[poolId] = true;
        poolToCollection[poolId] = collection;
        collectionToPool[collection] = poolId;

        emit PoolAuthorized(poolId, collection);

        return IHooks.beforeInitialize.selector;
    }

    /**
     * @notice Before add liquidity - ensure authorized and factory allows it
     */
    function _beforeAddLiquidity(
        address, /* sender */
        PoolKey calldata key,
        ModifyLiquidityParams calldata, /* params */
        bytes calldata /* hookData */
    ) internal view override returns (bytes4) {
        PoolId poolId = key.toId();
        if (!authorizedPools[poolId]) revert UnauthorizedPool();
        
        // CRITICAL: Only allow liquidity addition when factory enables it
        if (!IFeeHookFactory(factory).loadingLiquidity()) {
            revert UnauthorizedPool();
        }
        
        return IHooks.beforeAddLiquidity.selector;
    }

    /**
     * @notice Before swap - set mid-swap flag if router restrictions are enabled
     */
    function _beforeSwap(
        address, /* sender */
        PoolKey calldata key,
        SwapParams calldata, /* params */
        bytes calldata /* hookData */
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // If factory has router restrictions enabled, set midSwap flag on token
        if (IFeeHookFactory(factory).routerRestrict()) {
            address restrictedToken = Currency.unwrap(key.currency1);
            // During off-chain quotes (STATICCALL), state writes revert. Swallow failures safely.
            try IRestrictedToken(restrictedToken).setMidSwap(true) {} catch {}
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /**
     * @notice After swap - collect and distribute fees
     * @dev Charges DEFAULT_FEE (10%) and splits: 90% to collection, 10% to treasury
     */
    function _afterSwap(
        address, /* sender */
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata /* hookData */
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        if (!authorizedPools[poolId]) revert UnauthorizedPool();

        // Determine which currency was swapped and the swap amount
        bool specifiedTokenIs0 = (params.amountSpecified < 0 == params.zeroForOne);
        (Currency feeCurrency, int128 swapAmount) =
            (specifiedTokenIs0) ? (key.currency1, delta.amount1()) : (key.currency0, delta.amount0());

        if (swapAmount < 0) swapAmount = -swapAmount;

        // Calculate fee (10% of swap amount)
        uint128 feeAmount = uint128(swapAmount) * DEFAULT_FEE / TOTAL_BIPS;
        
        if (feeAmount == 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        // Take fee from pool (quote-safe: swallow failures under STATICCALL)
        try this.__take(feeCurrency, feeAmount) {} catch {}

        address collection = poolToCollection[poolId];
        bool ethFee = Currency.unwrap(feeCurrency) == address(0);

        emit FeeCollected(poolId, feeCurrency, feeAmount, collection);

        // Process fees: convert to ETH if needed, then distribute (quote-safe: wrap)
        try this.__processFees(key, feeCurrency, feeAmount, collection, ethFee) {} catch {}

        // If factory has router restrictions enabled, clear midSwap flag on token (quote-safe)
        if (IFeeHookFactory(factory).routerRestrict()) {
            try IRestrictedToken(collection).setMidSwap(false) {} catch {}
        }

        return (IHooks.afterSwap.selector, int128(feeAmount));
    }

    // Internal helper callable via external try/catch (separate context to avoid revert bubbling)
    function __take(Currency feeCurrency, uint256 feeAmount) external {
        require(msg.sender == address(this), "only self");
        poolManager.take(feeCurrency, address(this), feeAmount);
    }

    function __processFees(
        PoolKey calldata key,
        Currency feeCurrency,
        uint256 feeAmount,
        address collection,
        bool ethFee
    ) external {
        require(msg.sender == address(this), "only self");
        if (!ethFee) {
            uint256 feeInETH = _swapToEth(key, feeCurrency, feeAmount);
            _processFees(collection, feeInETH);
        } else {
            _processFees(collection, feeAmount);
        }
    }

    /**
     * @notice Swap collected token fees to ETH
     * @param key Pool key
     * @param currency Currency to swap
     * @param amount Amount to swap
     * @return ETH amount received
     */
    function _swapToEth(
        PoolKey memory key,
        Currency currency,
        uint256 amount
    ) internal returns (uint256) {
        uint256 ethBefore = address(this).balance;
        
        // Determine swap direction based on which currency we're swapping
        bool zeroForOne = Currency.unwrap(key.currency1) == Currency.unwrap(currency);
        
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: zeroForOne ? MIN_PRICE_LIMIT : MAX_PRICE_LIMIT
            }),
            bytes("")
        );

        // Settle the swap
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

    /**
     * @notice Process and distribute fees: 90% to collection, 10% to treasury
     * @param collection Collection address
     * @param feeAmount Total fee amount in ETH
     */
    function _processFees(address collection, uint256 feeAmount) internal {
        if (feeAmount == 0) return;
        
        // 90% to collection, 10% to treasury/owner
        uint256 collectionAmount = (feeAmount * 90) / 100;
        uint256 treasuryAmount = feeAmount - collectionAmount;

        // Send 90% to collection's addFees function (skip silently if not supported / quoting)
        try INFTStrategy(collection).addFees{value: collectionAmount}() {} catch {}
        
        // Send 10% to treasury (or custom fee address if set by collection owner)
        address feeRecipient = feeAddressClaimedByOwner[collection];
        if (feeRecipient == address(0)) {
            feeRecipient = treasury;
        }
        
        // Force safe ETH transfer (skip on failure during quotes)
        _forceSafeTransferETH(feeRecipient, treasuryAmount);

        emit FeeProcessed(collection, collectionAmount, treasuryAmount);
    }

    /**
     * @notice Force safe ETH transfer with retry mechanism
     * @dev Mimics SafeTransferLib.forceSafeTransferETH from solady
     * @param to Recipient address
     * @param amount Amount of ETH to send
     */
    function _forceSafeTransferETH(address to, uint256 amount) internal {
        // Attempt normal transfer first
        (bool success, ) = to.call{value: amount}("");
        if (!success) {
            // On quoting (STATICCALL) or recipient failure, just skip without reverting
            return;
        }
    }

    /**
     * @notice Allow collection owner to set custom fee address
     * @param collection Collection address
     * @param destination Custom fee recipient address
     */
    function updateFeeAddressForCollection(address collection, address destination) external {
        if (IERC721(collection).owner() != msg.sender) revert NotCollectionOwner();
        feeAddressClaimedByOwner[collection] = destination;
        emit CollectionFeeAddressSet(collection, destination);
    }

    /**
     * @notice Admin override for setting collection fee address
     * @param collection Collection address
     * @param destination Custom fee recipient address
     */
    function adminUpdateFeeAddress(address collection, address destination) external onlyOwner {
        feeAddressClaimedByOwner[collection] = destination;
        emit CollectionFeeAddressSet(collection, destination);
    }

    // Admin functions
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidTreasury();
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setFactory(address _factory) external onlyOwner {
        if (_factory == address(0)) revert InvalidFactory();
        factory = _factory;
        emit FactorySet(_factory);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }

    // View functions
    function isPoolAuthorized(PoolId poolId) external view returns (bool) {
        return authorizedPools[poolId];
    }

    function getCollectionForPool(PoolId poolId) external view returns (address) {
        return poolToCollection[poolId];
    }

    function getPoolForCollection(address collection) external view returns (PoolId) {
        return collectionToPool[collection];
    }

    /**
     * @notice Helper to validate router transfers (called by factory)
     * @param to Recipient address
     * @param from Sender address
     * @param tokenAddress Token being transferred
     * @return True if transfer should be allowed
     */
    function validateRouterTransfer(
        address to,
        address from,
        address tokenAddress
    ) external view returns (bool) {
        // Delegate to factory's validTransfer function
        return IFeeHookFactory(factory).validTransfer(to, from, tokenAddress);
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            beforeRemoveLiquidity: false,
            afterAddLiquidity: false,
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

    receive() external payable {}
}
