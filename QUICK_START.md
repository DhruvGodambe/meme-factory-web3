# Quick Start Guide - FeeHook with RestrictedToken

## 🚀 Fast Track Setup

### Prerequisites
- Uniswap v4 PoolManager deployed
- Treasury address for fee collection
- Universal Router address

---

## 📦 Step-by-Step Deployment

### 1. Deploy Factory
```solidity
FeeHookFactory factory = new FeeHookFactory(
    poolManagerAddress,
    treasuryAddress
);
```

### 2. Mine Salt & Deploy Hook
```solidity
// Mine the salt for correct hook address
(address predictedHookAddress, bytes32 salt) = factory.mineSalt();

// Deploy hook with mined salt
address hookAddress = factory.deployHook(salt);

// Verify address matches prediction
assert(hookAddress == predictedHookAddress);
```

### 3. Deploy RestrictedToken
```solidity
RestrictedToken token = new RestrictedToken();
// Token starts with:
// - 1,000,000 tokens minted to deployer
// - tradingEnabled = false
// - restrictionActive = true
// - owner whitelisted
```

### 4. Configure Token
```solidity
// Set critical addresses
token.setPoolManager(poolManagerAddress);
token.setHook(hookAddress);
token.setSwapRouter(universalRouterAddress);

// Whitelist essential addresses
token.setWhitelist(hookAddress, true);          // Hook can collect fees
token.setWhitelist(poolManagerAddress, true);   // PoolManager can swap
token.setWhitelist(universalRouterAddress, true); // Router can initiate
token.setWhitelist(treasuryAddress, true);      // Treasury can receive
token.setWhitelist(strategyAddress, true);      // Strategy can receive
```

### 5. Register Collection in Factory
```solidity
factory.registerCollection(
    address(token),      // Collection address
    strategyAddress      // Strategy that receives 90%
);
```

### 6. Enable Router Restrictions (Recommended)
```solidity
// Enable router restriction mode
factory.setRouterRestrict(true);

// Whitelist approved routers
factory.setRouter(universalRouterAddress, true);
```

### 7. Initialize Pool
```solidity
// Enable liquidity loading mode
factory.setLoadingLiquidity(true);

// Create pool key
PoolKey memory key = PoolKey({
    currency0: Currency.wrap(address(0)),        // ETH
    currency1: Currency.wrap(address(token)),    // RestrictedToken
    fee: 3000,                                   // 0.3%
    tickSpacing: 60,
    hooks: IHooks(hookAddress)                   // MUST use this hook
});

// Initialize pool
uint160 startingPrice = /* calculate sqrtPriceX96 */;
poolManager.initialize(key, startingPrice, "");
```

### 8. Add Initial Liquidity
```solidity
// Define liquidity parameters
ModifyLiquidityParams memory params = ModifyLiquidityParams({
    tickLower: -887220,
    tickUpper: 887220,
    liquidityDelta: 1000000000000000000, // 1e18
    salt: bytes32(0)
});

// Add liquidity (only works while loadingLiquidity = true)
poolManager.modifyLiquidity(key, params, "");
```

### 9. Enable Trading
```solidity
// Enable trading on the token
token.setTradingEnabled(true);

// Optional: Lock down pool creation
factory.setLoadingLiquidity(false);
```

### 10. Done! 🎉
Your pool is now live with:
- ✅ 10% fee on all swaps
- ✅ 90% to strategy, 10% to treasury
- ✅ Mid-swap protection active
- ✅ Router restrictions enforced
- ✅ Only authorized pools can be created

---

## 🔧 Post-Deployment Configuration

### Allow Collection Owner to Claim Custom Fee Address
```solidity
// Collection owner calls:
token.updateFeeAddressForCollection(
    address(token),
    customFeeRecipientAddress
);

// Or factory owner can override:
factory.adminUpdateFeeAddress(
    address(token),
    customFeeRecipientAddress
);
```

### Add More Routers to Whitelist
```solidity
factory.setRouter(newRouterAddress, true);
```

### Whitelist Additional Addresses on Token
```solidity
// Single address
token.setWhitelist(newAddress, true);

// Batch addresses
address[] memory addresses = [addr1, addr2, addr3];
token.setWhitelistBatch(addresses, true);
```

---

## 🧪 Testing Your Setup

### 1. Test Pool Initialization Restriction
```solidity
// Should FAIL - loadingLiquidity is false
factory.setLoadingLiquidity(false);
poolManager.initialize(someOtherKey, price, "");
// Expected: UnauthorizedPool error

// Should SUCCEED - loadingLiquidity is true
factory.setLoadingLiquidity(true);
poolManager.initialize(someOtherKey, price, "");
// Expected: Success
```

### 2. Test Token Transfer Restriction
```solidity
// Should FAIL - neither address whitelisted
token.transfer(randomAddress, 1000);
// Expected: "RST: Only tradeable through authorized pool"

// Should SUCCEED - recipient is whitelisted
token.setWhitelist(randomAddress, true);
token.transfer(randomAddress, 1000);
// Expected: Success
```

### 3. Test Fee Collection
```solidity
// Perform a swap
swapRouter.swap(params);

// Check fee was collected
uint256 collectionBalance = strategyAddress.balance;
uint256 treasuryBalance = treasuryAddress.balance;

// Should be 90/10 split
assert(collectionBalance == feeAmount * 90 / 100);
assert(treasuryBalance == feeAmount * 10 / 100);
```

### 4. Test Mid-Swap Protection
```solidity
// Before swap: midSwap = false
assert(!token.midSwap());

// During swap (in hook): midSwap = true
// (automatically set by hook)

// After swap: midSwap = false
assert(!token.midSwap());
```

---

## 🎯 Common Operations

### Update Treasury
```solidity
factory.updateTreasury(newTreasuryAddress);
```

### Transfer Factory Ownership
```solidity
factory.transferOwnership(newOwnerAddress);
```

### Transfer Hook Ownership (via Factory)
```solidity
factory.transferHookOwnership(newOwnerAddress);
```

### Disable Restrictions (Emergency)
```solidity
token.setRestrictionActive(false);
```

### Re-enable Liquidity Loading
```solidity
factory.setLoadingLiquidity(true);
```

---

## 📊 View Functions

### Check Configuration
```solidity
// Factory
bool isDeployed = factory.isHookDeployed();
address hookAddr = factory.getHook();
bool canLoad = factory.loadingLiquidity();
bool routerMode = factory.routerRestrict();

// Hook
bool isAuthorized = hook.isPoolAuthorized(poolId);
address collection = hook.getCollectionForPool(poolId);
address customFee = hook.feeAddressClaimedByOwner(collection);

// Token
bool trading = token.tradingEnabled();
bool restrictions = token.restrictionActive();
bool inSwap = token.midSwap();
bool whitelisted = token.checkWhitelist(address);
```

---

## ⚠️ Important Notes

1. **Hook Address is Deterministic**
   - Generated via CREATE2 with specific flags
   - MUST match Uniswap v4 requirements
   - Use `mineSalt()` to find correct salt

2. **Whitelist Critical Addresses**
   - Hook, PoolManager, Router are MANDATORY
   - Treasury/Strategy addresses recommended
   - Missing whitelists = transaction failures

3. **Loading Liquidity Gate**
   - MUST be `true` for pool init and liquidity add
   - Can be disabled after setup for security
   - Swaps work regardless of this flag

4. **Mid-Swap Protection**
   - Only hook can set the flag
   - Automatically managed during swaps
   - Don't try to set manually

5. **Router Restrictions**
   - Optional but recommended
   - Add all routers you want to support
   - Factory must have `routerRestrict = true`

---

## 🐛 Troubleshooting

### "UnauthorizedPool" Error
- Check `factory.loadingLiquidity()` is `true`
- Verify pool uses correct hook address
- Ensure collection is registered in factory

### "RST: Only tradeable through authorized pool"
- Check sender/recipient is whitelisted
- Verify `tradingEnabled = true` on token
- Ensure addresses are properly configured

### "RST: Transfer restricted during swap"
- Token is mid-swap, wait for completion
- Only whitelisted addresses can transfer during swap
- This is expected behavior for protection

### "Only hook can set midSwap"
- Don't call `setMidSwap()` manually
- Hook manages this automatically
- Verify `authorizedHook` is set correctly

---

## 📚 Additional Resources

- `RESTRICTED_TOKEN_INTEGRATION.md` - Full integration guide
- `INTEGRATION_SUMMARY.md` - Complete feature overview
- `contracts/FeeHook.sol` - Main hook implementation
- `contracts/HookMiner.sol` - Factory implementation
- `contracts/RestrictedToken.sol` - Token implementation
- `contracts/Interfaces.sol` - All interfaces

---

## ✅ Deployment Checklist

- [ ] Factory deployed
- [ ] Hook salt mined
- [ ] Hook deployed with correct address
- [ ] RestrictedToken deployed
- [ ] Token configured with PoolManager
- [ ] Token configured with Hook
- [ ] Token configured with Router
- [ ] Critical addresses whitelisted
- [ ] Collection registered in factory
- [ ] Router restrictions enabled (optional)
- [ ] Routers whitelisted (if restrictions enabled)
- [ ] Pool initialized
- [ ] Initial liquidity added
- [ ] Trading enabled on token
- [ ] Loading liquidity locked (optional)
- [ ] Fee collection tested
- [ ] Transfer restrictions verified

**Ready to go! 🚀**

