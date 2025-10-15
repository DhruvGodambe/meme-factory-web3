import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Complete deployment script for FeeHook + RestrictedToken system
 * 
 * Deploys and configures all contracts WITHOUT initializing pools
 * Pool initialization will be done via Uniswap interface
 * 
 * Steps:
 * 1. Deploy FeeHookFactory
 * 2. Mine salt and deploy FeeHook
 * 3. Deploy RestrictedToken
 * 4. Register collection in factory
 * 5. Configure all contracts and whitelists
 * 6. Enable trading
 */

// Uniswap v4 addresses (update based on your network)
const POOL_MANAGER = "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543"; // Sepolia v4 PoolManager
const UNIVERSAL_ROUTER = "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b"; // Sepolia Universal Router

async function main() {
  console.log("\n🚀 Deploying FeeHook System (Ready for Uniswap Interface)\n");
  console.log("=".repeat(70));

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const treasuryAddress = deployerAddress; // Using deployer as treasury

  console.log("📋 Configuration:");
  console.log("  Network:", (await ethers.provider.getNetwork()).name);
  console.log("  Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("  Deployer:", deployerAddress);
  console.log("  Pool Manager:", POOL_MANAGER);
  console.log("  Universal Router:", UNIVERSAL_ROUTER);
  console.log("  Treasury:", treasuryAddress);
  console.log("");

  // ============================================================================
  // STEP 1: Deploy FeeHookFactory
  // ============================================================================
  console.log("📤 Step 1: Deploying FeeHookFactory...");
  const FeeHookFactory = await ethers.getContractFactory("FeeHookFactory");
  const factory = await FeeHookFactory.deploy(POOL_MANAGER, treasuryAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  
  console.log("   ✅ FeeHookFactory deployed at:", factoryAddress);
  console.log("");

  // ============================================================================
  // STEP 2: Mine Salt & Deploy FeeHook
  // ============================================================================
  console.log("📤 Step 2: Mining salt for FeeHook...");
  
  const requiredFlags = await (factory as any).getRequiredFlags();
  console.log("   Required flags: 0x" + requiredFlags.toString(16));
  console.log("");
  
  console.log("   ⏳ Mining salt (this may take a while)...");
  const [hookAddress, salt] = await (factory as any).mineSalt();
  
  console.log("   ✅ Valid salt found!");
  console.log("   Salt:", salt);
  console.log("   Hook address:", hookAddress);
  console.log("");

  // ============================================================================
  // STEP 3: Deploy FeeHook
  // ============================================================================
  console.log("📤 Step 3: Deploying FeeHook...");
  
  const deployTx = await (factory as any).deployHook(salt);
  console.log("   ⏳ Waiting for transaction...");
  const receipt = await deployTx.wait();
  
  if (!receipt) {
    throw new Error("Failed to get transaction receipt");
  }
  
  console.log("   ✅ FeeHook deployed at:", hookAddress);
  console.log("   Transaction hash:", receipt.hash);
  
  // Verify deployment
  const deployedCode = await ethers.provider.getCode(hookAddress);
  if (deployedCode === "0x") {
    throw new Error("❌ Hook deployment failed");
  }
  console.log("   ✅ Deployment verified");
  console.log("");

  // ============================================================================
  // STEP 4: Deploy RestrictedToken
  // ============================================================================
  console.log("📤 Step 4: Deploying RestrictedToken...");
  const RestrictedToken = await ethers.getContractFactory("RestrictedToken");
  const token = await RestrictedToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  
  console.log("   ✅ RestrictedToken deployed at:", tokenAddress);
  console.log("   Symbol:", await token.symbol());
  console.log("   Total Supply:", ethers.formatEther(await token.totalSupply()), "RST");
  console.log("");

  // ============================================================================
  // STEP 5: Register Collection
  // ============================================================================
  console.log("📤 Step 5: Registering collection...");
  
  let tx = await (factory as any).registerCollection(tokenAddress, tokenAddress);
  await tx.wait();
  
  console.log("   ✅ Collection registered");
  console.log("");

  // ============================================================================
  // STEP 6: Configure RestrictedToken
  // ============================================================================
  console.log("⚙️  Step 6: Configuring RestrictedToken...");
  
  console.log("   Setting PoolManager...");
  tx = await token.setPoolManager(POOL_MANAGER);
  await tx.wait();
  console.log("   ✅ PoolManager set");
  
  console.log("   Setting Hook...");
  tx = await token.setHook(hookAddress);
  await tx.wait();
  console.log("   ✅ Hook set");
  
  console.log("   Setting SwapRouter...");
  tx = await token.setSwapRouter(UNIVERSAL_ROUTER);
  await tx.wait();
  console.log("   ✅ SwapRouter set");
  
  console.log("   Whitelisting Hook...");
  tx = await token.setWhitelist(hookAddress, true);
  await tx.wait();
  console.log("   ✅ Hook whitelisted");
  
  console.log("   Whitelisting PoolManager...");
  tx = await token.setWhitelist(POOL_MANAGER, true);
  await tx.wait();
  console.log("   ✅ PoolManager whitelisted");
  
  console.log("   Whitelisting UniversalRouter...");
  tx = await token.setWhitelist(UNIVERSAL_ROUTER, true);
  await tx.wait();
  console.log("   ✅ UniversalRouter whitelisted");
  
  console.log("   Whitelisting Treasury...");
  tx = await token.setWhitelist(treasuryAddress, true);
  await tx.wait();
  console.log("   ✅ Treasury whitelisted");
  
  console.log("   Whitelisting Token (for addFees)...");
  tx = await token.setWhitelist(tokenAddress, true);
  await tx.wait();
  console.log("   ✅ Token whitelisted");
  console.log("");

  // ============================================================================
  // STEP 7: Configure Factory
  // ============================================================================
  console.log("⚙️  Step 7: Configuring Factory...");
  
  console.log("   Enabling router restrictions...");
  tx = await (factory as any).setRouterRestrict(true);
  await tx.wait();
  console.log("   ✅ Router restrictions enabled");
  
  console.log("   Whitelisting router in factory...");
  tx = await (factory as any).setRouter(UNIVERSAL_ROUTER, true);
  await tx.wait();
  console.log("   ✅ Router whitelisted");
  
  console.log("   Enabling liquidity loading...");
  tx = await (factory as any).setLoadingLiquidity(true);
  await tx.wait();
  console.log("   ✅ Liquidity loading enabled");
  console.log("");

  // ============================================================================
  // STEP 8: Enable Trading
  // ============================================================================
  console.log("⚙️  Step 8: Enabling trading...");
  
  tx = await token.setTradingEnabled(true);
  await tx.wait();
  console.log("   ✅ Trading enabled");
  console.log("");

  // ============================================================================
  // STEP 9: Verify Configuration
  // ============================================================================
  console.log("🔍 Step 9: Verifying configuration...");
  
  const hook = await ethers.getContractAt("FeeHook", hookAddress);
  const restrictionStatus = await token.getRestrictionStatus();
  
  console.log("   ✓ Hook at:", hookAddress);
  console.log("   ✓ Factory at:", factoryAddress);
  console.log("   ✓ Token at:", tokenAddress);
  console.log("   ✓ Trading enabled:", restrictionStatus._tradingEnabled);
  console.log("   ✓ Liquidity loading:", await (factory as any).loadingLiquidity());
  console.log("   ✓ Router restrictions:", await (factory as any).routerRestrict());
  console.log("");

  // ============================================================================
  // STEP 10: Save Deployment
  // ============================================================================
  const timestamp = Date.now();
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    timestamp,
    date: new Date(timestamp).toISOString(),
    deployer: deployerAddress,
    treasury: treasuryAddress,
    contracts: {
      PoolManager: POOL_MANAGER,
      UniversalRouter: UNIVERSAL_ROUTER,
      FeeHookFactory: factoryAddress,
      FeeHook: hookAddress,
      RestrictedToken: tokenAddress
    },
    hookMining: {
      salt,
      requiredFlags: "0x" + requiredFlags.toString(16)
    },
    poolKey: {
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: tokenAddress,
      fee: 3000,
      tickSpacing: 60,
      hooks: hookAddress
    },
    configuration: {
      loadingLiquidity: true,
      routerRestrict: true,
      tradingEnabled: true
    }
  };

  const outputPath = path.join(__dirname, `../deployment-full-${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("💾 Saved to:", outputPath);
  console.log("");

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("=".repeat(70));
  console.log("✅ DEPLOYMENT COMPLETE - READY FOR UNISWAP INTERFACE!");
  console.log("=".repeat(70));
  console.log("");
  console.log("📝 Contract Addresses:");
  console.log("   FeeHookFactory:", factoryAddress);
  console.log("   FeeHook:", hookAddress);
  console.log("   RestrictedToken:", tokenAddress);
  console.log("");
  console.log("🎯 Pool Configuration for Uniswap Interface:");
  console.log("   Currency 0 (ETH):", "0x0000000000000000000000000000000000000000");
  console.log("   Currency 1 (Token):", tokenAddress);
  console.log("   Fee Tier:", "3000 (0.3%)");
  console.log("   Tick Spacing:", "60");
  console.log("   Hook Address:", hookAddress);
  console.log("");
  console.log("⚠️  Important for Uniswap Interface:");
  console.log("   1. Use Hook Address:", hookAddress);
  console.log("   2. Pair: ETH / RestrictedToken");
  console.log("   3. Factory.loadingLiquidity is: ENABLED");
  console.log("   4. Token trading is: ENABLED");
  console.log("   5. Router restrictions are: ENABLED");
  console.log("");
  console.log("🔒 Security Status:");
  console.log("   ✓ All critical addresses whitelisted");
  console.log("   ✓ Router restrictions active");
  console.log("   ✓ Mid-swap protection ready");
  console.log("   ✓ 10% fee will be collected");
  console.log("   ✓ 90/10 split (collection/treasury)");
  console.log("");
  console.log("📋 Next Steps:");
  console.log("   1. Go to Uniswap v4 interface");
  console.log("   2. Create pool with above configuration");
  console.log("   3. Add liquidity");
  console.log("   4. Test swaps - fees will be collected!");
  console.log("");
  console.log("💡 To disable pool creation after setup:");
  console.log("   factory.setLoadingLiquidity(false)");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
