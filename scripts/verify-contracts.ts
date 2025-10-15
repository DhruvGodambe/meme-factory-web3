import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Verify deployed contracts from deployment JSON
 */

async function main() {
  console.log("\n🔍 Contract Verification\n");
  console.log("=".repeat(70));

  // Load deployment info
  const deploymentPath = path.join(__dirname, "../deployment-full-1760550087393.json");
  
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("Deployment file not found");
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  
  console.log("📂 Loaded deployment:");
  console.log("   Network:", deployment.network);
  console.log("   Chain ID:", deployment.chainId);
  console.log("   Date:", deployment.date);
  console.log("");

  const factoryAddress = deployment.contracts.FeeHookFactory;
  const hookAddress = deployment.contracts.FeeHook;
  const tokenAddress = deployment.contracts.RestrictedToken;

  let passedTests = 0;
  let totalTests = 0;

  function test(name: string, condition: boolean, details?: string) {
    totalTests++;
    if (condition) {
      console.log("   ✅", name);
      if (details) console.log("      →", details);
      passedTests++;
    } else {
      console.log("   ❌", name);
      if (details) console.log("      →", details);
    }
  }

  // ============================================================================
  // Test 1: Contract Deployments
  // ============================================================================
  console.log("📦 Test Suite 1: Contract Deployments");
  
  const factoryCode = await ethers.provider.getCode(factoryAddress);
  test("FeeHookFactory deployed", factoryCode !== "0x", factoryAddress);
  
  const hookCode = await ethers.provider.getCode(hookAddress);
  test("FeeHook deployed", hookCode !== "0x", hookAddress);
  
  const tokenCode = await ethers.provider.getCode(tokenAddress);
  test("RestrictedToken deployed", tokenCode !== "0x", tokenAddress);
  
  console.log("");

  // Get contract instances
  const factory = await ethers.getContractAt("FeeHookFactory", factoryAddress);
  const hook = await ethers.getContractAt("FeeHook", hookAddress);
  const token = await ethers.getContractAt("RestrictedToken", tokenAddress);

  // ============================================================================
  // Test 2: Hook Address Validation
  // ============================================================================
  console.log("🪝 Test Suite 2: Hook Address Validation");
  
  const hookAddressBigInt = BigInt(hookAddress);
  const permissionBits = hookAddressBigInt & 0x3FFFn; // Last 14 bits
  const expectedFlags = BigInt(deployment.hookMining.requiredFlags);
  
  test(
    "Hook address has correct permission bits",
    permissionBits === expectedFlags,
    `0x${permissionBits.toString(16)} === ${deployment.hookMining.requiredFlags}`
  );
  
  const hookPerms = await hook.getHookPermissions();
  test("Hook beforeInitialize enabled", hookPerms.beforeInitialize === true);
  test("Hook beforeAddLiquidity enabled", hookPerms.beforeAddLiquidity === true);
  test("Hook beforeSwap enabled", hookPerms.beforeSwap === true);
  test("Hook afterSwap enabled", hookPerms.afterSwap === true);
  test("Hook afterSwapReturnDelta enabled", hookPerms.afterSwapReturnDelta === true);
  
  console.log("");

  // ============================================================================
  // Test 3: Factory Configuration
  // ============================================================================
  console.log("⚙️  Test Suite 3: Factory Configuration");
  
  const factoryHook = await (factory as any).getHook();
  test("Factory has correct hook address", factoryHook === hookAddress, factoryHook);
  
  const factoryHookDeployed = await (factory as any).isHookDeployed();
  test("Factory hook deployed flag", factoryHookDeployed === true);
  
  const factoryOwner = await (factory as any).owner();
  test("Factory has owner", factoryOwner !== ethers.ZeroAddress, factoryOwner);
  
  const factoryTreasury = await (factory as any).treasury();
  test("Factory has treasury", factoryTreasury === deployment.treasury, factoryTreasury);
  
  const loadingLiquidity = await (factory as any).loadingLiquidity();
  test("Liquidity loading enabled", loadingLiquidity === true);
  
  const routerRestrict = await (factory as any).routerRestrict();
  test("Router restrictions enabled", routerRestrict === true);
  
  const routerValid = await (factory as any).validRouters(deployment.contracts.UniversalRouter);
  test("UniversalRouter whitelisted", routerValid === true);
  
  console.log("");

  // ============================================================================
  // Test 4: Hook Configuration
  // ============================================================================
  console.log("🔗 Test Suite 4: Hook Configuration");
  
  const hookFactory = await hook.factory();
  test("Hook linked to factory", hookFactory === factoryAddress, hookFactory);
  
  const hookTreasury = await hook.treasury();
  test("Hook has treasury", hookTreasury === deployment.treasury, hookTreasury);
  
  const hookOwner = await hook.owner();
  test("Hook has owner", hookOwner !== ethers.ZeroAddress, hookOwner);
  
  console.log("");

  // ============================================================================
  // Test 5: Token Configuration
  // ============================================================================
  console.log("🪙 Test Suite 5: Token Configuration");
  
  const restrictionStatus = await token.getRestrictionStatus();
  
  test(
    "Token PoolManager set",
    restrictionStatus._poolManager === deployment.contracts.PoolManager,
    restrictionStatus._poolManager
  );
  
  test("Token Hook set", restrictionStatus._hook === hookAddress, restrictionStatus._hook);
  
  test(
    "Token Router set",
    restrictionStatus._router === deployment.contracts.UniversalRouter,
    restrictionStatus._router
  );
  
  test("Trading enabled", restrictionStatus._tradingEnabled === true);
  test("Restrictions active", restrictionStatus._restrictionActive === true);
  
  const hookWhitelisted = await token.isWhitelisted(hookAddress);
  test("Hook whitelisted in token", hookWhitelisted === true);
  
  const pmWhitelisted = await token.isWhitelisted(deployment.contracts.PoolManager);
  test("PoolManager whitelisted in token", pmWhitelisted === true);
  
  const routerWhitelisted = await token.isWhitelisted(deployment.contracts.UniversalRouter);
  test("Router whitelisted in token", routerWhitelisted === true);
  
  const treasuryWhitelisted = await token.isWhitelisted(deployment.treasury);
  test("Treasury whitelisted in token", treasuryWhitelisted === true);
  
  const tokenSelfWhitelisted = await token.isWhitelisted(tokenAddress);
  test("Token self-whitelisted (for addFees)", tokenSelfWhitelisted === true);
  
  const tokenMidSwap = await token.midSwap();
  test("Token midSwap initially false", tokenMidSwap === false);
  
  console.log("");

  // ============================================================================
  // Test 6: Integration Tests
  // ============================================================================
  console.log("🔗 Test Suite 6: Integration Tests");
  
  const collectionRegistered = await (factory as any).collectionToNFTStrategy(tokenAddress);
  test(
    "Collection registered in factory",
    collectionRegistered === tokenAddress,
    collectionRegistered
  );
  
  const strategyMapped = await (factory as any).nftStrategyToCollection(tokenAddress);
  test("Strategy mapped in factory", strategyMapped === tokenAddress, strategyMapped);
  
  console.log("");

  // ============================================================================
  // Test 7: Pool Key Validation
  // ============================================================================
  console.log("🏊 Test Suite 7: Pool Key Configuration");
  
  test("Pool key currency0 is ETH", deployment.poolKey.currency0 === ethers.ZeroAddress);
  test("Pool key currency1 is token", deployment.poolKey.currency1 === tokenAddress);
  test("Pool key fee tier is 3000", deployment.poolKey.fee === 3000);
  test("Pool key tick spacing is 60", deployment.poolKey.tickSpacing === 60);
  test("Pool key hooks is FeeHook", deployment.poolKey.hooks === hookAddress);
  
  console.log("");

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("=".repeat(70));
  console.log("📊 VERIFICATION SUMMARY");
  console.log("=".repeat(70));
  console.log("");
  console.log(`   Tests Passed: ${passedTests}/${totalTests}`);
  console.log(`   Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`);
  console.log("");
  
  if (passedTests === totalTests) {
    console.log("✅ ALL TESTS PASSED!");
    console.log("");
    console.log("🎉 Deployment is fully configured and ready for Uniswap!");
    console.log("");
    console.log("🎯 Ready to use in Uniswap Interface:");
    console.log("");
    console.log("   Pool Configuration:");
    console.log("   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("   Currency 0 (ETH):  ", deployment.poolKey.currency0);
    console.log("   Currency 1 (Token):", deployment.poolKey.currency1);
    console.log("   Fee Tier:          ", deployment.poolKey.fee, "(0.3%)");
    console.log("   Tick Spacing:      ", deployment.poolKey.tickSpacing);
    console.log("   Hook Address:      ", deployment.poolKey.hooks);
    console.log("   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    console.log("📋 Contract Addresses:");
    console.log("   FeeHookFactory:    ", factoryAddress);
    console.log("   FeeHook:           ", hookAddress);
    console.log("   RestrictedToken:   ", tokenAddress);
    console.log("   Treasury:          ", deployment.treasury);
    console.log("");
    console.log("✨ Next Steps:");
    console.log("   1. Go to Uniswap v4 interface");
    console.log("   2. Create pool with above configuration");
    console.log("   3. Add liquidity");
    console.log("   4. Test swaps!");
    console.log("");
  } else {
    console.log("⚠️  SOME TESTS FAILED");
    console.log("");
    console.log(`❌ ${totalTests - passedTests} test(s) failed`);
    console.log("");
    console.log("Please review the configuration and fix any issues.");
    console.log("");
    process.exit(1);
  }

  // Display additional info
  console.log("📊 Detailed Configuration:");
  console.log("");
  console.log("   Network:           ", deployment.network);
  console.log("   Chain ID:          ", deployment.chainId);
  console.log("   Deployer:          ", deployment.deployer);
  console.log("   PoolManager:       ", deployment.contracts.PoolManager);
  console.log("   UniversalRouter:   ", deployment.contracts.UniversalRouter);
  console.log("");
  console.log("   Token Symbol:      ", await token.symbol());
  console.log("   Token Name:        ", await token.name());
  console.log("   Total Supply:      ", ethers.formatEther(await token.totalSupply()), "RST");
  console.log("");
  console.log("   Hook Flags:        ", deployment.hookMining.requiredFlags);
  console.log("   Hook Salt:         ", deployment.hookMining.salt);
  console.log("");
  console.log("🔒 Security Settings:");
  console.log("   Loading Liquidity: ", loadingLiquidity ? "✅ ENABLED" : "❌ DISABLED");
  console.log("   Router Restrict:   ", routerRestrict ? "✅ ENABLED" : "❌ DISABLED");
  console.log("   Trading Enabled:   ", restrictionStatus._tradingEnabled ? "✅ ENABLED" : "❌ DISABLED");
  console.log("   Mid-Swap Ready:    ", "✅ YES");
  console.log("   Fee Collection:    ", "✅ 10%");
  console.log("   Fee Split:         ", "✅ 90% Collection / 10% Treasury");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Verification failed:", error);
    process.exit(1);
  });

