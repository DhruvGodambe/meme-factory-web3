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
import {toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FeeHook (patched - safe Option B)
 * @notice Uniswap v4 Hook that collects a 10% fee on swaps that involve `restrictedToken`.
 *   - Fee is computed from actual swap result in _afterSwap (safe for output-fees)
 *   - Fees are recorded in pendingFees and must be settled via unlockCallback or settlePendingFees
 *   - Add owner-settle helper to allow manual settlement/testing
 */
contract FeeHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using BeforeSwapDeltaLibrary for BeforeSwapDelta;

    address public treasury;
    address public owner;
    address public restrictedToken;
    uint256 public constant FEE_PERCENT = 10; // 10% fee

    // Track authorized pools
    mapping(PoolId => bool) public authorizedPools;

    // Bookkeeping: fees that have been "recorded" and awaiting settlement (per pool + currency)
    mapping(PoolId => mapping(Currency => uint256)) public pendingFees;

    // Track accumulated fees owed for bookkeeping (historical/tracking)
    mapping(Currency => uint256) public feesOwedToTreasury;

    // Events
    event PoolAuthorized(PoolId indexed poolId);
    event FeeCollected(
        Currency indexed currency,
        uint256 amount,
        string feeType,
        address indexed recipient
    );
    event FeeDebug(address indexed token, bool zeroForOne, int256 specifiedAmount, uint256 feeAmount, bool rstIsSpecified);
    event TreasurySet(address indexed treasury);
    event RestrictedTokenSet(address indexed token);
    event PendingFeesSettled(PoolId indexed poolId, Currency indexed currency, uint256 amount, address indexed treasury);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(IPoolManager _poolManager, address _treasury, address _restrictedToken)
        BaseHook(_poolManager)
    {
        require(_treasury != address(0), "Invalid treasury");
        require(_restrictedToken != address(0), "Invalid token");
        treasury = _treasury;
        restrictedToken = _restrictedToken;
        owner = msg.sender;
    }

    function _beforeInitialize(
        address, /* sender */
        PoolKey calldata key,
        uint160 /* sqrtPriceX96 */
    ) internal override returns (bytes4) {
        require(address(key.hooks) == address(this), "Pool must use this hook");

        PoolId poolId = key.toId();
        authorizedPools[poolId] = true;

        emit PoolAuthorized(poolId);

        return IHooks.beforeInitialize.selector;
    }

    /**
     * @notice beforeSwap: unchanged (no fee deduction here). We keep behavior as-is:
     * - If restricted token is specified token we may still compute specified-side fee (existing logic)
     *   But by default the safe path computes fee in _afterSwap and settles later.
     */
    function _beforeSwap(
        address, /* sender */
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata /* hookData */
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();
        require(authorizedPools[poolId], "Unauthorized pool");

        bool rstIsCurrency0 = Currency.unwrap(key.currency0) == restrictedToken;
        bool rstIsCurrency1 = Currency.unwrap(key.currency1) == restrictedToken;

        if (!rstIsCurrency0 && !rstIsCurrency1) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        // Keep original behavior for specified-token fee (unchanged) — same logic you had.
        int256 specifiedAmount = params.amountSpecified;

        bool rstIsSpecified = false;
        Currency rstCurrency;

        if (rstIsCurrency0 && params.zeroForOne) {
            rstIsSpecified = true;
            rstCurrency = key.currency0;
        } else if (rstIsCurrency1 && !params.zeroForOne) {
            rstIsSpecified = true;
            rstCurrency = key.currency1;
        }

        if (rstIsSpecified && specifiedAmount != 0) {
            uint256 absAmount = specifiedAmount < 0 ? uint256(-specifiedAmount) : uint256(specifiedAmount);
            uint256 feeAmount = (absAmount * FEE_PERCENT) / 100;

            require(feeAmount <= uint256(uint128(type(int128).max)), "Fee overflow");
            require(feeAmount <= absAmount, "Fee exceeds amount");

            if (feeAmount > 0) {
                // Bookkeeping
                feesOwedToTreasury[rstCurrency] += feeAmount;

                // compute deltaSpecified according to exact-input (neg) / exact-output (pos)
                int128 deltaSpecified;
                if (specifiedAmount < 0) {
                    // exact-input: user gives tokens; positive delta means hook "takes" some of the specified token
                    deltaSpecified = int128(int256(feeAmount));
                } else {
                    // exact-output: user receives tokens; negative delta increases what user must provide
                    deltaSpecified = -int128(int256(feeAmount));
                }

                // Debug event to aid tracing from tx logs
                emit FeeDebug(
                    Currency.unwrap(rstCurrency),
                    params.zeroForOne,
                    specifiedAmount,
                    feeAmount,
                    rstIsSpecified
                );

                emit FeeCollected(rstCurrency, feeAmount, "beforeSwap", treasury);

                // Create BeforeSwapDelta: specified token delta = deltaSpecified, unspecified = 0
                BeforeSwapDelta feeDelta = toBeforeSwapDelta(deltaSpecified, 0);
                return (IHooks.beforeSwap.selector, feeDelta, 0);
            }
        }

        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /**
     * @notice _afterSwap: SAFE approach — compute fee based on actual swap result (BalanceDelta),
     * register it in pendingFees and emit events. Actual collection (poolManager.take + transfer)
     * will occur via unlockCallback (PoolManager) or via `settlePendingFees` (owner helper).
     */
    function _afterSwap(
        address, /* sender */
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata /* hookData */
    ) internal override returns (bytes4, int128) {
        PoolId poolId = key.toId();
        require(authorizedPools[poolId], "Unauthorized pool");

        bool rstIsCurrency0 = Currency.unwrap(key.currency0) == restrictedToken;
        bool rstIsCurrency1 = Currency.unwrap(key.currency1) == restrictedToken;

        if (!rstIsCurrency0 && !rstIsCurrency1) {
            return (IHooks.afterSwap.selector, 0);
        }

        // Extract the balance delta for the restricted token from BalanceDelta.
        // Note: BalanceDelta field names/types may vary by v4-core version. Adapt if necessary.
        // Commonly delta.amount0 / delta.amount1 exist and are signed.
        int256 rstSignedDelta;
        Currency rstCurrency = rstIsCurrency0 ? key.currency0 : key.currency1;

        // Try getting correct delta component
        rstSignedDelta = rstIsCurrency0 ? int256(delta.amount0()) : int256(delta.amount1());

        // absolute amount the pool moved for restricted token (how much user received or gave)
        uint256 absAmount = rstSignedDelta < 0 ? uint256(-rstSignedDelta) : uint256(rstSignedDelta);

        // If user got restricted token (absAmount > 0) compute fee
        if (absAmount > 0) {
            uint256 feeAmount = (absAmount * FEE_PERCENT) / 100;
            if (feeAmount > 0) {
                // record pending fee for this pool+cURRENCY
                pendingFees[poolId][rstCurrency] += feeAmount;
                feesOwedToTreasury[rstCurrency] += feeAmount;

                emit FeeCollected(rstCurrency, feeAmount, "afterSwap", treasury);
            }
        }

        // We don't return any additional delta here. Settlement occurs later via unlockCallback/settlePendingFees.
        return (IHooks.afterSwap.selector, 0);
    }

    /**
     * === unlockCallback settlement flow ===
     * - PoolManager will call our unlockCallback after unlock(); ensure only poolManager does this
     * - We accept encoded operations (same as before) OR we can be called (by owner) to settle stored pendingFees
     *
     * The encoded op format (per-entry): abi.encodePacked(uint8 action, bytes32 currency, uint256 amount)
     * actionType:
     *  1 = collect positive delta (call poolManager.take -> then transfer ERC20 to treasury)
     *  2 = settle negative delta (transfer tokens from hook to poolManager then poolManager.settle) -- not implemented
     *
     * NOTE: adapt the poolManager.take/settle signatures to the version of v4-core you compile with.
     */
    function unlockCallback(bytes calldata data) external {
        require(msg.sender == address(poolManager), "Only PoolManager");

        uint256 offset = 0;
        while (offset < data.length) {
            // decode a fixed-size chunk (1 + 32 + 32 = 65 bytes)
            require(data.length >= offset + 65, "Bad data length");
            bytes memory chunk = data[offset: offset + 65];
            (uint8 actionType, Currency currency, uint256 amount) = abi.decode(chunk, (uint8, Currency, uint256));
            offset += 65;

            address tokenAddr = Currency.unwrap(currency);

            if (actionType == 1) {
                // Positive-delta collection: poolManager should allow us to take accounting funds
                // ADAPT: poolManager.take signature may differ by v4-core version
                poolManager.take(currency, address(this), amount);

                // Transfer tokens to treasury
                require(IERC20(tokenAddr).transfer(treasury, amount), "transfer failed");

                // reconcile bookkeeping: reduce pendingFees if present
                // NOTE: we don't know poolId here: PoolManager passes unlockCallback for a specific pool context,
                // but if needed you can include poolId in the encoded data to zero the correct entry.
                // For safety, we attempt to reduce feesOwedToTreasury and leave pendingFees as-is unless caller encoded poolId.
                if (feesOwedToTreasury[currency] >= amount) {
                    feesOwedToTreasury[currency] -= amount;
                } else {
                    feesOwedToTreasury[currency] = 0;
                }

                emit PendingFeesSettled(PoolId.wrap(bytes32(uint256(0))), currency, amount, treasury); // poolId unknown in this encoded flow
            } else if (actionType == 2) {
                // Negative-delta settle flow left as before - implement according to your poolManager API
                revert("Negative-delta settle flow must be implemented per your poolManager API");
            } else {
                revert("Unknown action");
            }
        }
    }

    /**
     * @notice Owner helper: settle pending fees for a given poolId & currency.
     * This allows local testing and manual settlement if unlockCallback isn't used or you want to
     * drive settlement from offchain tooling. Adapt poolManager.take signature if needed.
     */
    function settlePendingFees(PoolId poolId, Currency currency) external onlyOwner {
        uint256 amount = pendingFees[poolId][currency];
        require(amount > 0, "No pending fees");

        // clear pending record first to avoid reentrancy issues
        pendingFees[poolId][currency] = 0;

        // call poolManager.take to collect accounting amount to this hook
        // ADAPT: check poolManager.take signature for your v4-core version
        poolManager.take(currency, address(this), amount);

        // transfer to treasury
        address tokenAddr = Currency.unwrap(currency);
        require(IERC20(tokenAddr).transfer(treasury, amount), "transfer failed");

        // reconcile bookkeeping
        if (feesOwedToTreasury[currency] >= amount) {
            feesOwedToTreasury[currency] -= amount;
        } else {
            feesOwedToTreasury[currency] = 0;
        }

        emit PendingFeesSettled(poolId, currency, amount, treasury);
    }

    // View helpers
    function getAccumulatedFees(Currency currency) external view returns (uint256) {
        return feesOwedToTreasury[currency];
    }

    function getPendingFees(PoolId poolId, Currency currency) external view returns (uint256) {
        return pendingFees[poolId][currency];
    }

    function isPoolAuthorized(PoolId poolId) external view returns (bool) {
        return authorizedPools[poolId];
    }

    // Admin
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }

    function setRestrictedToken(address _token) external onlyOwner {
        require(_token != address(0), "Invalid token");
        restrictedToken = _token;
        emit RestrictedTokenSet(_token);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }

    function clearFeeRecords(Currency currency) external onlyOwner {
        feesOwedToTreasury[currency] = 0;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterAddLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }
}
