// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {FeeHook} from "./FeeHook.sol";

/**
 * @title HookMinerDeployer
 * @notice Helper to deploy hook at correct address using the official Uniswap v4 HookMiner
 * @dev Uses the official HookMiner library from v4-periphery for proper address mining
 */
contract HookMinerDeployer {
    /**
     * @notice Calculate required flags for FeeHook address
     * @dev Based on FeeHook's getHookPermissions():
     * - beforeInitialize: BEFORE_INITIALIZE_FLAG = 1 << 13 (bit 13)
     * - beforeSwap: BEFORE_SWAP_FLAG = 1 << 7 (bit 7)
     * - afterSwap: AFTER_SWAP_FLAG = 1 << 6 (bit 6)
     * - beforeSwapReturnDelta: BEFORE_SWAP_RETURNS_DELTA_FLAG = 1 << 3 (bit 3)
     * - afterSwapReturnDelta: AFTER_SWAP_RETURNS_DELTA_FLAG = 1 << 2 (bit 2)
     */
    function getRequiredFlags() public pure returns (uint160) {
        return Hooks.BEFORE_INITIALIZE_FLAG | 
               Hooks.BEFORE_SWAP_FLAG | 
               Hooks.AFTER_SWAP_FLAG | 
               Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG |
               Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;
    }
    
    /**
     * @notice Mine salt for hook deployment using official HookMiner
     * @param poolManager PoolManager address
     * @param treasury Treasury address
     * @param restrictedToken Restricted token address
     * @return hookAddress The address where the hook will be deployed
     * @return salt The salt to use for deployment
     */
    function mineSalt(
        IPoolManager poolManager,
        address treasury,
        address restrictedToken
    ) external view returns (address hookAddress, bytes32 salt) {
        uint160 flags = getRequiredFlags();
        bytes memory creationCode = type(FeeHook).creationCode;
        bytes memory constructorArgs = abi.encode(poolManager, treasury, restrictedToken);
        
        // Use the official HookMiner library
        (hookAddress, salt) = HookMiner.find(
            address(this), // deployer will be this contract
            flags,
            creationCode,
            constructorArgs
        );
        
        return (hookAddress, salt);
    }
    
    /**
     * @notice Deploy FeeHook with CREATE2 using mined salt
     * @param poolManager PoolManager address
     * @param treasury Treasury address
     * @param restrictedToken Restricted token address
     * @param salt Salt from mineSalt function
     * @return hook Address of deployed hook
     */
    function deployHook(
        IPoolManager poolManager,
        address treasury,
        address restrictedToken,
        bytes32 salt
    ) external returns (address hook) {
        // Deploy using CREATE2 with the mined salt
        FeeHook feeHook = new FeeHook{salt: salt}(poolManager, treasury, restrictedToken);
        hook = address(feeHook);
        
        // Validation is handled by BaseHook constructor
        require(hook != address(0), "Failed to deploy hook");
        
        return hook;
    }
    
    /**
     * @notice Get hook permissions (matches FeeHook implementation)
     */
    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
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
            afterSwapReturnDelta: true,     // Must match FeeHook exactly
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }
}