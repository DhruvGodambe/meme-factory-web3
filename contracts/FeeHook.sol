// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BaseTestHooks} from "@uniswap/v4-core/src/test/BaseTestHooks.sol";

/**
 * @title FeeHook
 * @notice Uniswap v4 Hook contract for managing token swaps with fees
 * @dev Implements beforeSwap hook to enforce fee logic on RestrictedToken trades
 */
contract FeeHook is BaseTestHooks {
    using PoolIdLibrary for PoolKey;
    using Hooks for IHooks;

    IPoolManager public immutable poolManager;
    address public feeReceiver;
    
    // Events
    event FeeReceiverSet(address indexed feeReceiver);
    event SwapExecuted(
        PoolId indexed poolId,
        address indexed sender,
        int256 amountSpecified
    );
    
    constructor(IPoolManager _poolManager, address _feeReceiver) {
        require(address(_poolManager) != address(0), "Invalid pool manager");
        require(_feeReceiver != address(0), "Invalid fee receiver");
        poolManager = _poolManager;
        feeReceiver = _feeReceiver;
    }
    
    modifier onlyPoolManager() {
        require(msg.sender == address(poolManager), "Only pool manager can call");
        _;
    }
    
    /**
     * @notice Hook executed before a swap
     * @dev This is called by the PoolManager before each swap
     * The fee logic is handled in the RestrictedToken contract itself
     * This hook validates and tracks swaps
     */
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata /* hookData */
    ) external override onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        // Emit event for tracking
        emit SwapExecuted(
            key.toId(),
            sender,
            params.amountSpecified
        );
        
        
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }
    
    /**
     * @notice Set the fee receiver address
     * @param _feeReceiver New fee receiver address
     * @dev In production, add proper access control (onlyOwner)
     */
    function setFeeReceiver(address _feeReceiver) external {
        require(_feeReceiver != address(0), "Invalid fee receiver");
        feeReceiver = _feeReceiver;
        emit FeeReceiverSet(_feeReceiver);
    }
    
    /**
     * @notice Returns the hook permissions bitmap
     * @dev This function is called by Uniswap v4 to validate hook permissions
     */
    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterAddLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }
}
