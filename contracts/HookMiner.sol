// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {FeeHook} from "./FeeHook.sol";

/**
 * @title FeeHookFactory
 * @notice Factory contract for deploying FeeHook and managing pool creation
 * @dev Ensures only pools using the authorized hook can be created
 */
contract FeeHookFactory {
    using PoolIdLibrary for PoolKey;

    address public owner;
    IPoolManager public immutable poolManager;
    FeeHook public hook;
    address public treasury;
    
    // Pool creation control
    bool public loadingLiquidity;
    bool public deployerBuying;
    bool public routerRestrict;
    
    // Mappings for collection tracking
    mapping(address => address) public collectionToNFTStrategy;
    mapping(address => address) public nftStrategyToCollection;
    mapping(address => bool) public validRouters;

    event HookDeployed(address indexed hook, address indexed treasury);
    event PoolCreated(PoolId indexed poolId, address indexed collection, address indexed strategy);
    event LoadingLiquidityEnabled(bool enabled);
    event RouterSet(address indexed router, bool status);
    event RouterRestrictSet(bool status);
    event TreasuryUpdated(address indexed newTreasury);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error HookAlreadyDeployed();
    error HookNotDeployed();
    error InvalidAddress();
    error NotLoadingLiquidity();
    error PoolMustUseHook();
    error CollectionAlreadyExists();
    error InvalidRouter();

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
     * @notice Calculate required flags for FeeHook address
     * @dev Based on FeeHook's getHookPermissions():
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
     * @notice Mine salt for hook deployment using official HookMiner
     * @return hookAddress The address where the hook will be deployed
     * @return salt The salt to use for deployment
     */
    function mineSalt() external view returns (address hookAddress, bytes32 salt) {
        uint160 flags = getRequiredFlags();
        bytes memory creationCode = type(FeeHook).creationCode;
        bytes memory constructorArgs = abi.encode(poolManager, treasury, address(this));
        
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
     * @param salt Salt from mineSalt function
     * @return hookAddress Address of deployed hook
     */
    function deployHook(bytes32 salt) external onlyOwner returns (address hookAddress) {
        if (address(hook) != address(0)) revert HookAlreadyDeployed();
        
        // Deploy using CREATE2 with the mined salt
        FeeHook feeHook = new FeeHook{salt: salt}(poolManager, treasury, address(this));
        hook = feeHook;
        hookAddress = address(feeHook);
        
        require(hookAddress != address(0), "Failed to deploy hook");
        
        emit HookDeployed(hookAddress, treasury);
        
        return hookAddress;
    }

    /**
     * @notice Register a collection and its strategy
     * @dev Must be called before pool initialization
     * @param collection The NFT collection address
     * @param strategy The strategy contract address
     */
    function registerCollection(address collection, address strategy) external onlyOwner {
        if (collection == address(0) || strategy == address(0)) revert InvalidAddress();
        if (collectionToNFTStrategy[collection] != address(0)) revert CollectionAlreadyExists();
        
        collectionToNFTStrategy[collection] = strategy;
        nftStrategyToCollection[strategy] = collection;
    }

    /**
     * @notice Enable liquidity loading mode
     * @dev When enabled, allows pool initialization and liquidity addition
     * @param enabled True to enable, false to disable
     */
    function setLoadingLiquidity(bool enabled) external onlyOwner {
        loadingLiquidity = enabled;
        emit LoadingLiquidityEnabled(enabled);
    }

    /**
     * @notice Set deployer buying mode
     * @param enabled True to enable, false to disable
     */
    function setDeployerBuying(bool enabled) external onlyOwner {
        deployerBuying = enabled;
    }

    /**
     * @notice Set router restriction mode
     * @param status True to enable restrictions, false to disable
     */
    function setRouterRestrict(bool status) external onlyOwner {
        routerRestrict = status;
        emit RouterRestrictSet(status);
    }

    /**
     * @notice Add or remove a valid router
     * @param router Router address
     * @param status True to allow, false to disallow
     */
    function setRouter(address router, bool status) external onlyOwner {
        if (router == address(0)) revert InvalidAddress();
        validRouters[router] = status;
        emit RouterSet(router, status);
    }

    /**
     * @notice Validate if a transfer is allowed (for router restrictions)
     * @param to Recipient address
     * @param from Sender address
     * @return True if transfer is valid
     */
    function validTransfer(
        address to,
        address from,
        address /* tokenAddress */
    ) external view returns (bool) {
        if (!routerRestrict) return true;
        
        // Allow transfers if router restriction is disabled
        // Or if either party is a valid router
        return validRouters[to] || validRouters[from];
    }

    /**
     * @notice Update treasury address
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        if (address(hook) == address(0)) revert HookNotDeployed();
        
        treasury = newTreasury;
        hook.setTreasury(newTreasury);
        
        emit TreasuryUpdated(newTreasury);
    }

    /**
     * @notice Transfer ownership of the factory
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        
        address oldOwner = owner;
        owner = newOwner;
        
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @notice Transfer ownership of the deployed hook
     * @param newOwner New owner address for the hook
     */
    function transferHookOwnership(address newOwner) external onlyOwner {
        if (address(hook) == address(0)) revert HookNotDeployed();
        if (newOwner == address(0)) revert InvalidAddress();
        
        hook.transferOwnership(newOwner);
    }

    /**
     * @notice Admin function to update fee address for a collection
     * @param collection Collection address
     * @param destination Fee recipient address
     */
    function adminUpdateFeeAddress(address collection, address destination) external onlyOwner {
        if (address(hook) == address(0)) revert HookNotDeployed();
        hook.adminUpdateFeeAddress(collection, destination);
    }

    /**
     * @notice Get hook permissions (matches FeeHook implementation)
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
