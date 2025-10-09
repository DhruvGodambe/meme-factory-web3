// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RestrictedToken
 * @notice ERC20 token with trading restrictions and fee mechanism
 * @dev Can only be traded through authorized hook/pool manager when trading is enabled
 */
contract RestrictedToken is ERC20, Ownable {
    address public allowedHook;        // Hook contract that can apply fee
    address public allowedPoolManager; // Official Uniswap v4 PoolManager or DEX
    bool public tradingEnabled = false;
    uint256 public constant FEE_PERCENT = 10; // 10% fee on swap
    
    // Events
    event TradingEnabled(bool status);
    event AllowedAddressesSet(address hook, address poolManager);
    event FeeCollected(address from, address to, uint256 feeAmount);
    
    constructor() ERC20("Restricted Token", "RST") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }
    
    /**
     * @notice Set authorized addresses for trading
     * @param _hook Address of the hook contract
     * @param _poolManager Address of the pool manager
     */
    function setAllowedAddresses(address _hook, address _poolManager) external onlyOwner {
        require(_hook != address(0), "Invalid hook address");
        require(_poolManager != address(0), "Invalid pool manager address");
        allowedHook = _hook;
        allowedPoolManager = _poolManager;
        emit AllowedAddressesSet(_hook, _poolManager);
    }
    
    /**
     * @notice Enable or disable trading
     * @param _status True to enable trading, false to disable
     */
    function enableTrading(bool _status) external onlyOwner {
        tradingEnabled = _status;
        emit TradingEnabled(_status);
    }
    
    /**
     * @dev Override transfer logic to enforce restrictions and fees
     */
    function _update(address from, address to, uint256 value) internal override {
      
        if (tradingEnabled) {
           
            require(
                msg.sender == allowedHook || 
                msg.sender == allowedPoolManager || 
                from == owner() || 
                to == owner(),
                "Restricted: use official pool only"
            );
            
            
            if (msg.sender == allowedHook && from != owner() && to != owner()) {
                uint256 fee = (value * FEE_PERCENT) / 100;
                uint256 net = value - fee;
                
                // Send fee to owner/treasury
                super._update(from, owner(), fee);
                emit FeeCollected(from, owner(), fee);
                
                // Send net amount to recipient
                super._update(from, to, net);
                return;
            }
        }
        
        // Normal transfers (e.g., before trading starts or owner transfers)
        super._update(from, to, value);
    }
}
