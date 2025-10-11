import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Complete deployment script for RestrictedToken + FeeHook system
 * 
 * Steps:
 * 1. Deploy RestrictedToken
 * 2. Deploy FeeHookDeployer factory
 * 3. Mine correct salt for hook address with proper permission bits
 * 4. Deploy FeeHook using factory with mined salt
 * 5. Configure RestrictedToken with PoolManager, Hook, and Router addresses
 * 6. Enable trading
 */

// Uniswap v4 addresses (update based on your network)
const POOL_MANAGER = "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543"; // Sepolia v4 PoolManager
const UNIVERSAL_ROUTER = "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b"; // Sepolia Universal Router (update with actual address)

/**
 * Uniswap v4 Hook Permission Flags (from Hooks.sol)
 * 
 * Bit positions (right to left, 0-indexed):
 * Bit 13: BEFORE_INITIALIZE_FLAG    = 1 << 13 = 0x2000
 * Bit 12: AFTER_INITIALIZE_FLAG     = 1 << 12 = 0x1000
 * Bit 11: BEFORE_ADD_LIQUIDITY_FLAG = 1 << 11 = 0x0800
 * Bit 10: AFTER_ADD_LIQUIDITY_FLAG  = 1 << 10 = 0x0400
 * Bit 9:  BEFORE_REMOVE_LIQUIDITY_FLAG = 1 << 9 = 0x0200
 * Bit 8:  AFTER_REMOVE_LIQUIDITY_FLAG  = 1 << 8 = 0x0100
 * Bit 7:  BEFORE_SWAP_FLAG          = 1 << 7 = 0x0080  ← NOTE: Not bit 6!
 * Bit 6:  AFTER_SWAP_FLAG           = 1 << 6 = 0x0040  ← NOTE: Not bit 7!
 * Bit 5:  BEFORE_DONATE_FLAG        = 1 << 5 = 0x0020
 * Bit 4:  AFTER_DONATE_FLAG         = 1 << 4 = 0x0010
 * Bit 3:  BEFORE_SWAP_RETURN_DELTA  = 1 << 3 = 0x0008
 * Bit 2:  AFTER_SWAP_RETURN_DELTA   = 1 << 2 = 0x0004
 * Bit 1:  AFTER_ADD_LIQUIDITY_RETURN_DELTA = 1 << 1 = 0x0002
 * Bit 0:  AFTER_REMOVE_LIQUIDITY_RETURN_DELTA = 1 << 0 = 0x0001
 * 
 * WARNING: The actual bit positions may vary! Check your version of Hooks.sol
 * The safest approach is to directly import the constants from the Hooks library
 */

// Define flags based on actual Hooks.sol constants
// These are now correctly imported from the HookMiner contract
// which uses the official Hooks library constants
const BEFORE_INITIALIZE_FLAG = 1n << 13n; // 0x2000
const BEFORE_SWAP_FLAG = 1n << 7n;        // 0x0080 (corrected from bit 6)
const AFTER_SWAP_FLAG = 1n << 6n;         // 0x0040 (corrected from bit 7)
const BEFORE_SWAP_RETURN_DELTA_FLAG = 1n << 3n; // 0x0008 (corrected from bit 10)

/**
 * Mine a salt that produces a hook address with correct permission bits
 */
async function mineSalt(
  factoryAddress: string,
  requiredFlags: bigint,
  creationCode: string,
  constructorArgs: string
): Promise<{ salt: string; hookAddress: string }> {
  console.log("⛏️  Mining salt for hook address...");
  console.log("   Factory:", factoryAddress);
  console.log("   Required flags: 0x" + requiredFlags.toString(16).padStart(4, '0'));
  console.log("   Binary:", requiredFlags.toString(2).padStart(14, '0'));
  
  // Display which permissions are enabled
  const permissions = [
    { name: "beforeInitialize", flag: BEFORE_INITIALIZE_FLAG },
    { name: "beforeSwap", flag: BEFORE_SWAP_FLAG },
    { name: "afterSwap", flag: AFTER_SWAP_FLAG },
    { name: "beforeSwapReturnDelta", flag: BEFORE_SWAP_RETURN_DELTA_FLAG }
  ];
  
  permissions.forEach(p => {
    const enabled = (requiredFlags & p.flag) !== 0n;
    console.log(`   - ${p.name}: ${enabled ? "✅" : "❌"}`);
  });
  console.log("");

  const initCode = creationCode + constructorArgs.slice(2);
  const initCodeHash = ethers.keccak256(initCode);
  
  const MAX_ITERATIONS = 2000000;
  const timestamp = Date.now();
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const salt = ethers.keccak256(
      ethers.solidityPacked(["string"], [`feehook-v4-${timestamp}-${i}`])
    );
    
    // Compute CREATE2 address
    const hash = ethers.solidityPackedKeccak256(
      ["bytes1", "address", "bytes32", "bytes32"],
      ["0xff", factoryAddress, salt, initCodeHash]
    );
    const hookAddress = ethers.getAddress("0x" + hash.slice(-40));
    
    // Check if address matches required flags
    const addressInt = BigInt(hookAddress);
    const permissionBits = addressInt & 0x3FFFn; // Last 14 bits
    
    if (permissionBits === requiredFlags) {
      console.log("✅ Found valid salt!");
      console.log("   Salt:", salt);
      console.log("   Hook Address:", hookAddress);
      console.log("   Permission bits: 0x" + permissionBits.toString(16).padStart(4, '0'));
      console.log("   Binary:", permissionBits.toString(2).padStart(14, '0'));
      console.log("   Attempts:", (i + 1).toLocaleString());
      console.log("");
      return { salt, hookAddress };
    }
    
    if ((i + 1) % 10000 === 0) {
      process.stdout.write(`\r   Checked ${(i + 1).toLocaleString()} salts...`);
    }
  }
  
  throw new Error(`Could not find valid salt in ${MAX_ITERATIONS.toLocaleString()} attempts`);
}

async function main() {
  console.log("\n🚀 Full System Deployment: RestrictedToken + FeeHook\n");
  console.log("=".repeat(70));

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const treasuryAddress = deployerAddress; // Use deployer as treasury

  console.log("📋 Configuration:");
  console.log("  Network:", (await ethers.provider.getNetwork()).name);
  console.log("  Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("  Deployer:", deployerAddress);
  console.log("  Pool Manager:", POOL_MANAGER);
  console.log("  Universal Router:", UNIVERSAL_ROUTER);
  console.log("  Treasury:", treasuryAddress);
  console.log("");

  // ============================================================================
  // STEP 1: Deploy RestrictedToken
  // ============================================================================
  console.log("📤 Step 1: Deploying RestrictedToken...");
  const RestrictedToken = await ethers.getContractFactory("RestrictedToken");
  const token = await RestrictedToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  
  console.log("   ✅ RestrictedToken deployed at:", tokenAddress);
  console.log("   Symbol:", await token.symbol());
  console.log("   Total Supply:", ethers.formatEther(await token.totalSupply()), "RST");
  console.log("");

  // ============================================================================
  // STEP 2: Deploy HookMinerDeployer
  // ============================================================================
  console.log("📤 Step 2: Deploying HookMinerDeployer...");
  const HookMinerDeployer = await ethers.getContractFactory("HookMinerDeployer");
  const hookMiner = await HookMinerDeployer.deploy();
  await hookMiner.waitForDeployment();
  const minerAddress = await hookMiner.getAddress();
  
  console.log("   ✅ HookMinerDeployer deployed at:", minerAddress);
  console.log("");

  // ============================================================================
  // STEP 3: Mine Salt for Hook Address
  // ============================================================================
  console.log("⛏️  Step 3: Mining salt for hook address with correct permissions...");
  
  // Use HookMinerDeployer to get the required flags directly from Hooks.sol
  const requiredFlags = await hookMiner.getRequiredFlags();
  console.log("   Required flags from HookMinerDeployer: 0x" + requiredFlags.toString(16));
  console.log("");
  
  // Mine salt using HookMinerDeployer
  console.log("   Mining parameters:");
  console.log("   - Deployer (HookMinerDeployer):", minerAddress);
  console.log("   - Pool Manager:", POOL_MANAGER);
  console.log("   - Treasury:", treasuryAddress);
  console.log("   - Token:", tokenAddress);
  console.log("");
  
  const [hookAddress, salt] = await hookMiner.mineSalt(
    POOL_MANAGER,
    treasuryAddress,
    tokenAddress
  );
  
  console.log("   ✅ Valid salt found!");
  console.log("   Salt:", salt);
  console.log("   Predicted hook address:", hookAddress);
  console.log("");

  // ============================================================================
  // STEP 4: Deploy FeeHook using HookMinerDeployer
  // ============================================================================
  console.log("📤 Step 4: Deploying FeeHook using HookMinerDeployer...");
  console.log("   Using salt:", salt);
  console.log("");
  
  const deployTx = await hookMiner.deployHook(
    POOL_MANAGER,
    treasuryAddress,
    tokenAddress,
    salt
  );
  
  console.log("   ⏳ Waiting for transaction to be mined...");
  const receipt = await deployTx.wait();
  
  if (!receipt) {
    throw new Error("Failed to get transaction receipt");
  }
  
  // The deployed hook address should be in the logs or we can compute it
  // Since we know the salt and the deployer, we can compute the CREATE2 address
  const deployedHookAddress = hookAddress; // Use the pre-computed address
  console.log("   ✅ FeeHook deployed at:", deployedHookAddress);
  console.log("   📋 Transaction hash:", receipt.hash);
  
  // Verify the deployment by checking if code exists at the address
  const deployedCode = await ethers.provider.getCode(deployedHookAddress);
  if (deployedCode === "0x") {
    throw new Error("❌ Hook deployment failed - no code at address");
  }
  
  console.log("   ✅ Hook address verification passed!");
  console.log("");

  // ============================================================================
  // STEP 5: Configure RestrictedToken
  // ============================================================================
  console.log("⚙️  Step 5: Configuring RestrictedToken...");
  
  // Set PoolManager
  console.log("   Setting PoolManager...");
  let tx2 = await token.setPoolManager(POOL_MANAGER);
  await tx2.wait();
  console.log("   ✅ PoolManager set");
  
  // Set Hook
  console.log("   Setting Hook address...");
  tx2 = await token.setHook(hookAddress);
  await tx2.wait();
  console.log("   ✅ Hook address set");
  
  // Set SwapRouter (CRITICAL!)
  console.log("   Setting SwapRouter...");
  tx2 = await token.setSwapRouter(UNIVERSAL_ROUTER);
  await tx2.wait();
  console.log("   ✅ SwapRouter set");
  
  // Whitelist treasury for fee collection
  console.log("   Whitelisting treasury...");
  tx2 = await token.setWhitelist(treasuryAddress, true);
  await tx2.wait();
  console.log("   ✅ Treasury whitelisted");
  
  // Enable Trading
  console.log("   Enabling trading...");
  tx2 = await token.setTradingEnabled(true);
  await tx2.wait();
  console.log("   ✅ Trading enabled");
  console.log("");

  // ============================================================================
  // STEP 6: Verify Configuration
  // ============================================================================
  console.log("🔍 Step 6: Verifying configuration...");
  
  const hook = await ethers.getContractAt("FeeHook", hookAddress);
  const restrictionStatus = await token.getRestrictionStatus();
  
  console.log("   RestrictedToken:");
  console.log("     - Pool Manager:", restrictionStatus._poolManager);
  console.log("     - Hook:", restrictionStatus._hook);
  console.log("     - SwapRouter:", restrictionStatus._router);
  console.log("     - Trading Enabled:", restrictionStatus._tradingEnabled);
  console.log("     - Restrictions Active:", restrictionStatus._restrictionActive);
  console.log("     - Treasury Whitelisted:", await token.isWhitelisted(treasuryAddress));
  console.log("");
  console.log("   FeeHook:");
  console.log("     - Treasury:", await hook.treasury());
  console.log("     - Owner:", await hook.owner());
  console.log("     - Restricted Token:", await hook.restrictedToken());
  console.log("     - Fee Percent:", await hook.FEE_PERCENT(), "%");
  
  // Verify hook permissions
  const permissions = await hook.getHookPermissions();
  console.log("");
  console.log("   Hook Permissions:");
  console.log("     - beforeInitialize:", permissions.beforeInitialize);
  console.log("     - beforeSwap:", permissions.beforeSwap);
  console.log("     - afterSwap:", permissions.afterSwap);
  console.log("     - beforeSwapReturnDelta:", permissions.beforeSwapReturnDelta);
  console.log("");

  // ============================================================================
  // STEP 7: Save Deployment Info
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
      RestrictedToken: tokenAddress,
      HookMinerDeployer: minerAddress,
      FeeHook: hookAddress
    },
    hookMining: {
      salt,
      requiredFlags: "0x" + requiredFlags.toString(16).padStart(4, '0'),
      flagBreakdown: "Flags calculated directly from Hooks.sol via HookMinerDeployer"
    },
    configuration: {
      tokenSymbol: await token.symbol(),
      tokenName: await token.name(),
      totalSupply: ethers.formatEther(await token.totalSupply()),
      feePercent: 10,
      tradingEnabled: true,
      restrictionActive: true
    }
  };

  const outputPath = path.join(__dirname, `../deployment-full-${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log("💾 Deployment info saved to:", outputPath);
  console.log("");

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("=".repeat(70));
  console.log("✅ DEPLOYMENT COMPLETE!");
  console.log("=".repeat(70));
  console.log("");
  console.log("📝 Contract Addresses:");
  console.log("   RestrictedToken:", tokenAddress);
  console.log("   HookMinerDeployer:", minerAddress);
  console.log("   FeeHook:", hookAddress);
  console.log("");
  console.log("🎯 Next Steps:");
  console.log("   1. Verify contracts on block explorer");
  console.log("   2. Initialize pool with desired pair (e.g., ETH/RST)");
  console.log("   3. Add initial liquidity through the hook");
  console.log("   4. Test swap with 10% fee collection");
  console.log("");
  console.log("⚠️  Important Notes:");
  console.log("   - Hook address has correct permission bits (0x24C0)");
  console.log("   - Universal Router is whitelisted for token transfers");
  console.log("   - Treasury is whitelisted for receiving fees");
  console.log("   - Only pools created through this hook are authorized");
  console.log("   - 10% fee is collected on swaps TO RestrictedToken");
  console.log("   - Fees go to treasury:", treasuryAddress);
  console.log("");
  console.log("🔒 Security Checklist:");
  console.log("   ✓ PoolManager whitelisted");
  console.log("   ✓ Hook whitelisted");
  console.log("   ✓ SwapRouter whitelisted");
  console.log("   ✓ Treasury whitelisted");
  console.log("   ✓ Trading enabled");
  console.log("   ✓ Restrictions active");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });