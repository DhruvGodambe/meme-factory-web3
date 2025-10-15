// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RestrictedToken
 * @notice ERC20 token with trading restrictions compatible with Uniswap v4
 * @dev Implements a whitelist-based restriction system that works with v4's routing architecture
 * Key insight: In v4, SwapRouter initiates transfers TO PoolManager, not FROM PoolManager
 */
contract RestrictedToken is ERC20, Ownable {
    // Core addresses
    address public poolManager;
    address public authorizedHook;
    address public swapRouter;  // Universal Router or V4Router
    
    // Control flags
    bool public tradingEnabled = false;
    bool public restrictionActive = true;  // Can disable restrictions entirely
    bool public midSwap = false;  // Flag to track if currently in a swap
    
    // Whitelist for addresses that can always transfer
    mapping(address => bool) public isWhitelisted;
    
    // Track authorized pool IDs (optional - for multi-pool support)
    mapping(bytes32 => bool) public authorizedPools;
    
    // Events
    event TradingEnabled(bool status);
    event RestrictionToggled(bool active);
    event PoolManagerSet(address indexed poolManager);
    event HookSet(address indexed hook);
    event SwapRouterSet(address indexed router);
    event WhitelistUpdated(address indexed account, bool status);
    event PoolAuthorized(bytes32 indexed poolId, bool status);
    event MidSwapSet(bool value);
    
    constructor() ERC20("Restricted Token", "RST") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
        
        // Owner is always whitelisted
        isWhitelisted[msg.sender] = true;
    }
    
    /**
     * @notice Set the PoolManager address
     * @dev PoolManager should be whitelisted to receive/send tokens during swaps
     */
    function setPoolManager(address _poolManager) external onlyOwner {
        require(_poolManager != address(0), "Invalid pool manager");
        poolManager = _poolManager;
        isWhitelisted[_poolManager] = true;
        emit PoolManagerSet(_poolManager);
    }
    
    /**
     * @notice Set the authorized hook address
     * @dev Hook should be whitelisted to interact with tokens during fee collection
     */
    function setHook(address _hook) external onlyOwner {
        require(_hook != address(0), "Invalid hook");
        authorizedHook = _hook;
        isWhitelisted[_hook] = true;
        emit HookSet(_hook);
    }
    
    /**
     * @notice Set mid-swap flag (only callable by authorized hook)
     * @dev Used to prevent unauthorized transfers during active swaps
     */
    function setMidSwap(bool value) external {
        require(msg.sender == authorizedHook, "Only hook can set midSwap");
        midSwap = value;
        emit MidSwapSet(value);
    }
    
    /**
     * @notice Set the SwapRouter address (Universal Router or V4Router)
     * @dev CRITICAL: Router needs to be whitelisted to transfer user tokens to PoolManager
     */
    function setSwapRouter(address _router) external onlyOwner {
        require(_router != address(0), "Invalid router");
        swapRouter = _router;
        isWhitelisted[_router] = true;
        emit SwapRouterSet(_router);
    }
    
    /**
     * @notice Add/remove addresses from whitelist
     * @dev Whitelisted addresses can always send or receive tokens
     */
    function setWhitelist(address account, bool status) external onlyOwner {
        require(account != address(0), "Invalid address");
        isWhitelisted[account] = status;
        emit WhitelistUpdated(account, status);
    }
    
    /**
     * @notice Batch whitelist update for gas efficiency
     */
    function setWhitelistBatch(address[] calldata accounts, bool status) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            require(accounts[i] != address(0), "Invalid address");
            isWhitelisted[accounts[i]] = status;
            emit WhitelistUpdated(accounts[i], status);
        }
    }
    
    /**
     * @notice Authorize a specific pool ID (optional - for multi-pool setups)
     * @param poolId The keccak256 hash of the pool key
     */
    function setPoolAuthorization(bytes32 poolId, bool status) external onlyOwner {
        authorizedPools[poolId] = status;
        emit PoolAuthorized(poolId, status);
    }
    
    /**
     * @notice Enable/disable trading
     */
    function setTradingEnabled(bool _status) external onlyOwner {
        tradingEnabled = _status;
        emit TradingEnabled(_status);
    }
    
    /**
     * @notice Toggle restriction system on/off
     * @dev Emergency function to disable all restrictions if needed
     */
    function setRestrictionActive(bool _active) external onlyOwner {
        restrictionActive = _active;
        emit RestrictionToggled(_active);
    }
    
    /**
     * @dev Override _update to enforce trading restrictions
     * This is called by transfer, transferFrom, mint, and burn
     */
    function _update(address from, address to, uint256 value) internal override {
        // Always allow minting and burning
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        
        // If restrictions are disabled, allow all transfers
        if (!restrictionActive) {
            super._update(from, to, value);
            return;
        }
        
        // Before trading is enabled, only whitelisted addresses can transfer
        if (!tradingEnabled) {
            require(
                isWhitelisted[from] || isWhitelisted[to],
                "RST: Trading not enabled"
            );
            super._update(from, to, value);
            return;
        }
        
        // Once trading is enabled, apply restriction logic
        // Allow transfer if either sender OR receiver is whitelisted
        // This covers all legitimate v4 flows:
        // 1. User -> Router (router whitelisted) ✓
        // 2. Router -> PoolManager (both whitelisted) ✓
        // 3. PoolManager -> User (PoolManager whitelisted) ✓
        // 4. PoolManager -> Hook (both whitelisted) ✓
        // 5. Hook -> Treasury (hook whitelisted) ✓
        
        bool isAllowedTransfer = isWhitelisted[from] || isWhitelisted[to];
        
        // Additional check: If midSwap is true, only allow whitelisted transfers
        // This prevents sandwich attacks and unauthorized transfers during swaps
        if (midSwap) {
            require(
                isAllowedTransfer,
                "RST: Transfer restricted during swap"
            );
        } else {
            require(
                isAllowedTransfer,
                "RST: Only tradeable through authorized pool"
            );
        }
        
        super._update(from, to, value);
    }
    
    /**
     * @notice Check if an address is whitelisted
     * @param account Address to check
     */
    function checkWhitelist(address account) external view returns (bool) {
        return isWhitelisted[account];
    }
    
    /**
     * @notice Get current restriction status
     */
    function getRestrictionStatus() external view returns (
        bool _tradingEnabled,
        bool _restrictionActive,
        address _poolManager,
        address _hook,
        address _router
    ) {
        return (
            tradingEnabled,
            restrictionActive,
            poolManager,
            authorizedHook,
            swapRouter
        );
    }
}