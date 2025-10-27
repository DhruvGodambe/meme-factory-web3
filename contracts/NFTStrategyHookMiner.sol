// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {NFTStrategyHook} from "./amock/NFTStrategyHook.sol";
import {RestrictedToken} from "./RestrictedToken.sol";
import "./amock/Interfaces.sol";

/**
 * @title NFTStrategyHookMiner
 * @notice Contract for mining salt and deploying NFTStrategyHook with proper permissions
 * @dev Ensures only hooks with correct permissions can be deployed
 */
contract NFTStrategyHookMiner {
    using PoolIdLibrary for PoolKey;

    address public owner;
    IPoolManager public immutable poolManager;
    NFTStrategyHook public hook;
    address public treasury;
    
    // Mined salt and address
    address public minedHookAddress;
    bytes32 public minedSalt;
    bool public saltMined;
    
    event SaltMined(address indexed hookAddress, bytes32 indexed salt);
    event HookDeployed(address indexed hook, address indexed treasury);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error SaltNotMined();
    error HookAlreadyDeployed();
    error InvalidAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IPoolManager _poolManager, address _treasury) {
        if (address(_poolManager) == address(0)) revert InvalidAddress();
        if (_treasury == address(0)) revert InvalidAddress();
        
        poolManager = _poolManager;
        treasury = _treasury;
        owner = msg.sender;
    }

    /**
     * @notice Calculate required flags for NFTStrategyHook address
     * @dev Based on NFTStrategyHook's getHookPermissions():
     * - beforeInitialize: BEFORE_INITIALIZE_FLAG = 1 << 13
     * - beforeAddLiquidity: BEFORE_ADD_LIQUIDITY_FLAG = 1 << 11
     * - beforeSwap: BEFORE_SWAP_FLAG = 1 << 7
     * - afterSwap: AFTER_SWAP_FLAG = 1 << 6
     * - afterSwapReturnDelta: AFTER_SWAP_RETURNS_DELTA_FLAG = 1 << 2
     */
    function getRequiredFlags() public pure returns (uint160) {
        return Hooks.BEFORE_INITIALIZE_FLAG | 
               Hooks.BEFORE_ADD_LIQUIDITY_FLAG |
               Hooks.BEFORE_SWAP_FLAG | 
               Hooks.AFTER_SWAP_FLAG | 
               Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;
    }
    
    /**
     * @notice Mine salt for NFTStrategyHook deployment
     * @param restrictedToken The RestrictedToken contract address
     * @param nftStrategyFactory The NFTStrategyFactory contract address
     * @param feeAddress The fee address
     * @return hookAddress The address where the hook will be deployed
     * @return salt The salt to use for deployment
     */
    function mineSalt(
        address restrictedToken,
        address nftStrategyFactory,
        address feeAddress
    ) external onlyOwner returns (address hookAddress, bytes32 salt) {
        if (saltMined) {
            return (minedHookAddress, minedSalt);
        }

        uint160 flags = getRequiredFlags();
        bytes memory creationCode = type(NFTStrategyHook).creationCode;
        bytes memory constructorArgs = abi.encode(
            poolManager,
            RestrictedToken(restrictedToken),
            INFTStrategyFactory(nftStrategyFactory),
            feeAddress
        );
        
        // Use the official HookMiner library
        (hookAddress, salt) = HookMiner.find(
            address(this), // deployer will be this contract
            flags,
            creationCode,
            constructorArgs
        );
        
        // Store the mined values
        minedHookAddress = hookAddress;
        minedSalt = salt;
        saltMined = true;
        
        emit SaltMined(hookAddress, salt);
        
        return (hookAddress, salt);
    }
    
    /**
     * @notice Deploy NFTStrategyHook with CREATE2 using mined salt
     * @param restrictedToken The RestrictedToken contract address
     * @param nftStrategyFactory The NFTStrategyFactory contract address
     * @param feeAddress The fee address
     * @return hookAddress Address of deployed hook
     */
    function deployHook(
        address restrictedToken,
        address nftStrategyFactory,
        address feeAddress
    ) external onlyOwner returns (address hookAddress) {
        if (address(hook) != address(0)) revert HookAlreadyDeployed();
        if (!saltMined) revert SaltNotMined();
        
        // Deploy using CREATE2 with the mined salt
        NFTStrategyHook nftStrategyHook = new NFTStrategyHook{salt: minedSalt}(
            poolManager,
            RestrictedToken(restrictedToken),
            INFTStrategyFactory(nftStrategyFactory),
            feeAddress
        );
        hook = nftStrategyHook;
        hookAddress = address(nftStrategyHook);
        
        require(hookAddress != address(0), "Failed to deploy hook");
        require(hookAddress == minedHookAddress, "Hook address mismatch");
        
        emit HookDeployed(hookAddress, treasury);
        
        return hookAddress;
    }

    /**
     * @notice Get the mined hook address and salt
     * @return hookAddress The mined hook address
     * @return salt The mined salt
     * @return isMined Whether salt has been mined
     */
    function getMinedData() external view returns (address hookAddress, bytes32 salt, bool isMined) {
        return (minedHookAddress, minedSalt, saltMined);
    }

    /**
     * @notice Transfer ownership of the miner
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        
        address oldOwner = owner;
        owner = newOwner;
        
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @notice Get hook permissions (matches NFTStrategyHook implementation)
     */
    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
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

    /**
     * @notice Get deployed hook address
     */
    function getHook() external view returns (address) {
        return address(hook);
    }

    /**
     * @notice Check if hook is deployed
     */
    function isHookDeployed() external view returns (bool) {
        return address(hook) != address(0);
    }
}





