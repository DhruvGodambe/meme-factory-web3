# Testing with Uniswap Interface

## 🚀 Quick Start

### 1. Deploy Contracts
```bash
npx hardhat run scripts/deploy-full-system.ts --network sepolia
```

This will deploy and configure:
- ✅ FeeHookFactory
- ✅ FeeHook (with correct address)
- ✅ RestrictedToken
- ✅ All whitelists and restrictions

**Note:** No pool is initialized - you'll do this via Uniswap interface!

---

## 📋 After Deployment

The script will output:

```
✅ DEPLOYMENT COMPLETE - READY FOR UNISWAP INTERFACE!

📝 Contract Addresses:
   FeeHookFactory: 0x...
   FeeHook: 0x...
   RestrictedToken: 0x...

🎯 Pool Configuration for Uniswap Interface:
   Currency 0 (ETH): 0x0000000000000000000000000000000000000000
   Currency 1 (Token): 0x...
   Fee Tier: 3000 (0.3%)
   Tick Spacing: 60
   Hook Address: 0x...
```

**Save these addresses!** You'll need them for the Uniswap interface.

---

## 🏊 Using Uniswap v4 Interface

### Step 1: Access Uniswap v4
Go to the Uniswap v4 interface (URL depends on network):
- Sepolia: Check Uniswap docs for testnet interface
- Mainnet: https://app.uniswap.org (when v4 is live)

### Step 2: Create Pool

1. **Select "Create Pool"**
2. **Configure Pool:**
   - Token 0: ETH (native currency)
   - Token 1: Your RestrictedToken address
   - Fee Tier: 0.3% (3000)
   - Tick Spacing: 60
   - **Hook Address:** Your deployed FeeHook address

3. **Initialize Pool** with your desired starting price

### Step 3: Add Liquidity

1. Click "Add Liquidity"
2. Select your ETH/RestrictedToken pool
3. Choose price range (or full range)
4. Enter amounts
5. Confirm transaction

### Step 4: Test Swap

1. Go to "Swap"
2. Select ETH → RestrictedToken (or vice versa)
3. Enter amount
4. You should see **10% fee** being charged
5. Confirm and execute swap

---

## 🔍 Verify Fee Collection

### Check Events

After a swap, check the transaction on Etherscan for these events:

1. **`FeeCollected`** - Shows fee was collected
2. **`FeeProcessed`** - Shows 90/10 distribution

### Check Balances

```javascript
// Check collection received 90%
const collectionBalance = await ethers.provider.getBalance(restrictedTokenAddress);

// Check treasury received 10%
const treasuryBalance = await ethers.provider.getBalance(treasuryAddress);
```

---

## ⚙️ Important Configuration

### What's Already Configured:

✅ **Factory Settings:**
- `loadingLiquidity`: **ENABLED** (allows pool creation)
- `routerRestrict`: **ENABLED** (only whitelisted routers)
- UniversalRouter: **WHITELISTED**

✅ **Token Settings:**
- Trading: **ENABLED**
- Restrictions: **ACTIVE**
- Mid-swap protection: **READY**
- Hook: **WHITELISTED**
- PoolManager: **WHITELISTED**
- UniversalRouter: **WHITELISTED**

✅ **Hook Settings:**
- Fee: **10%**
- Split: **90% collection / 10% treasury**
- Mid-swap flag: **WILL BE SET DURING SWAPS**

---

## 🔒 Security Features Active

When you test, these protections are active:

1. **Mid-Swap Protection**
   - Token sets `midSwap = true` during swaps
   - Prevents sandwich attacks
   - Only whitelisted addresses can transfer during swap

2. **Router Restrictions**
   - Only UniversalRouter can initiate swaps
   - Factory enforces router whitelist
   - Configurable via `factory.setRouter()`

3. **Whitelist System**
   - Only whitelisted addresses can transfer token
   - Covers: Hook, PoolManager, Router, Treasury, Token itself
   - Pool interactions work seamlessly

4. **Factory Control**
   - Only pools using FeeHook can be created
   - `loadingLiquidity` must be true for init/add liquidity
   - Can be locked down with `factory.setLoadingLiquidity(false)`

---

## 💡 Testing Checklist

### Before Testing:
- [ ] Contracts deployed successfully
- [ ] All addresses saved from deployment output
- [ ] Connected to correct network (Sepolia)
- [ ] Wallet has ETH for gas + liquidity

### During Testing:
- [ ] Pool created with correct hook address
- [ ] Liquidity added successfully
- [ ] First swap executes (10% fee charged)
- [ ] Check `FeeCollected` event emitted
- [ ] Check `FeeProcessed` event shows 90/10 split

### After Testing:
- [ ] Verify collection balance increased (90%)
- [ ] Verify treasury balance increased (10%)
- [ ] Test multiple swaps
- [ ] Optionally lock with `factory.setLoadingLiquidity(false)`

---

## 🛠️ Troubleshooting

### "Pool already exists"
**Cause:** Pool with this configuration already initialized

**Solution:** Use existing pool or change parameters

### "Hook validation failed"
**Cause:** Hook address doesn't have correct permission bits

**Solution:** Redeploy - the script mines correct address automatically

### "Transfer failed"
**Cause:** Address not whitelisted in RestrictedToken

**Solution:** All necessary addresses are pre-whitelisted by script

### "UnauthorizedPool"
**Cause:** `factory.loadingLiquidity` is false

**Solution:** Script sets it to true - if changed, re-enable:
```javascript
await factory.setLoadingLiquidity(true);
```

---

## 📊 Deployment Info

The script saves all deployment info to:
```
deployment-full-{timestamp}.json
```

This file contains:
- All contract addresses
- Pool configuration
- Hook mining details
- Network information

**Keep this file!** You'll need it for future interactions.

---

## 🎯 Next Steps

After successful testing:

1. **Lock Down Pool Creation** (optional)
   ```bash
   npx hardhat console --network sepolia
   ```
   ```javascript
   const factory = await ethers.getContractAt("FeeHookFactory", "0x...");
   await factory.setLoadingLiquidity(false);
   ```

2. **Monitor Fees**
   - Watch `FeeCollected` events
   - Track collection balance
   - Verify 90/10 split

3. **Add More Routers** (if needed)
   ```javascript
   await factory.setRouter(newRouterAddress, true);
   ```

4. **Customize Fee Address** (collection owner)
   ```javascript
   const token = await ethers.getContractAt("RestrictedToken", tokenAddress);
   await token.updateFeeAddressForCollection(collectionAddress, customAddress);
   ```

---

## 📞 Support

If issues occur:
1. Check transaction on Etherscan for error details
2. Verify all addresses are correct
3. Ensure `loadingLiquidity` is still enabled
4. Check contract events for diagnostic info

---

## ✅ Success Indicators

You'll know it's working when:
- ✅ Pool initializes without errors
- ✅ Liquidity adds successfully
- ✅ Swaps execute with 10% fee
- ✅ `FeeCollected` event appears in transaction
- ✅ Collection receives ~90% of fee
- ✅ Treasury receives ~10% of fee

**Happy testing! 🎉**

