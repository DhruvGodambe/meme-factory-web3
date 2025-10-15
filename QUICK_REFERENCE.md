# Quick Reference - Uniswap Interface Testing

## 🚀 Deploy Command
```bash
npx hardhat run scripts/deploy-full-system.ts --network sepolia
```

---

## 📋 Pool Configuration (for Uniswap Interface)

After deployment, use these values:

| Parameter | Value |
|-----------|-------|
| **Currency 0** | `0x0000000000000000000000000000000000000000` (ETH) |
| **Currency 1** | `{Your RestrictedToken Address}` |
| **Fee Tier** | `3000` (0.3%) |
| **Tick Spacing** | `60` |
| **Hook Address** | `{Your FeeHook Address}` |

*Addresses are printed by deployment script*

---

## ⚙️ What's Pre-Configured

✅ Factory `loadingLiquidity`: **ENABLED** (pool creation allowed)  
✅ Factory `routerRestrict`: **ENABLED** (router whitelist active)  
✅ Token `tradingEnabled`: **ENABLED**  
✅ Token restrictions: **ACTIVE**  
✅ Fee collection: **10%**  
✅ Fee split: **90% collection / 10% treasury**  
✅ All critical addresses: **WHITELISTED**  

---

## 🎯 Testing Flow

1. ✅ Deploy contracts
2. ✅ Note addresses from output
3. ✅ Go to Uniswap v4 interface
4. ✅ Create pool with above config
5. ✅ Add liquidity
6. ✅ Execute swap
7. ✅ Verify 10% fee charged
8. ✅ Check events for fee distribution

---

## 🔍 Verify Success

**After swap, check:**
- `FeeCollected` event in transaction
- `FeeProcessed` event showing 90/10 split
- Collection balance increased (90%)
- Treasury balance increased (10%)

---

## 🛠️ Common Commands

### Lock Pool Creation (after setup)
```javascript
// In Hardhat console
const factory = await ethers.getContractAt("FeeHookFactory", factoryAddress);
await factory.setLoadingLiquidity(false);
```

### Add Another Router
```javascript
await factory.setRouter(routerAddress, true);
```

### Custom Fee Address (as collection owner)
```javascript
const hook = await ethers.getContractAt("FeeHook", hookAddress);
await hook.updateFeeAddressForCollection(collectionAddress, customAddress);
```

---

## ⚠️ Important Notes

- **Hook address** must match what's mined (script does this)
- **Pool creation** requires `loadingLiquidity = true`
- **Swaps** work even if `loadingLiquidity = false`
- **10% fee** is fixed and always collected
- **90/10 split** is automatic

---

## 📁 Deployment Output

```
deployment-full-{timestamp}.json
```
Contains all addresses and configuration - **keep this file!**

---

That's it! Deploy, configure in Uniswap UI, test swaps. ✨

