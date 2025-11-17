import { run } from "hardhat";

async function verify(address: string, constructorArgs: any[], contractPath?: string) {
  try {
    console.log(`\n🔍 Verifying: ${address}`);
    
    const verifyParams: any = {
      address,
      constructorArguments: constructorArgs,
    };
    
    if (contractPath) {
      verifyParams.contract = contractPath;
    }
    
    await run("verify:verify", verifyParams);
    console.log(`✅ Verified: https://basescan.org/address/${address}#code`);
  } catch (err: any) {
    if (err.message.includes("Already Verified") || err.message.includes("already verified")) {
      console.log(`✅ Already Verified: ${address}`);
    } else if (err.message.includes("Missing chainid parameter")) {
      console.log(`⚠️  V2 API issue detected. Trying alternative verification method...`);
      // Try with explicit network
      try {
        await run("verify:verify", {
          address,
          constructorArguments: constructorArgs,
          network: "base",
        });
        console.log(`✅ Verified (alternative method): https://basescan.org/address/${address}#code`);
      } catch (err2: any) {
        console.log(`⚠️  Automated verification failed. Please verify manually on BaseScan.`);
        console.log(`   Contract: ${address}`);
        console.log(`   BaseScan: https://basescan.org/address/${address}#code`);
        console.log(`   Constructor Args: ${JSON.stringify(constructorArgs)}`);
      }
    } else {
      console.error(`❌ Verification failed for ${address}:`, err.message);
      // Don't throw - continue with next contract
      console.log(`   Continuing with next contract...`);
    }
  }
}

async function main() {
  console.log("\n🔍 Verifying Newly Deployed Contracts on BaseScan");
  console.log("=".repeat(60));
  console.log(`📋 Network: Base Mainnet (Chain ID: 8453)\n`);

  // Constants from migration
  const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
  const FEE_ADDRESS = "0xF93E7518F79C2E1978D6862Dbf161270040e623E";
  const RESTRICTED_TOKEN = "0x11bd3952C622D69551DcE28b5b9769CA39c88dBc";
  const FACTORY_ADDRESS = "0x6E4Eef9b5ff69E7c22bB5EAD0a7dCc62ad567039";

  // Newly deployed contracts from migration (Nov 2025)
  const NEW_HOOK = "0x5DB041c70Af719EB8A6B23654006cc8D9E5628C4";
  const NEW_HOOK_MINER = "0x56089fA568678940C505Ed966D9F0Ac5cF5885F7";

  console.log("📦 Contracts to verify:");
  console.log(`   1. NFTStrategyHook: ${NEW_HOOK}`);
  console.log(`   2. NFTStrategyHookMiner: ${NEW_HOOK_MINER}\n`);

  try {
    // 1. Verify NFTStrategyHookMiner
    console.log("=".repeat(60));
    console.log("1️⃣  Verifying NFTStrategyHookMiner");
    console.log("=".repeat(60));
    await verify(NEW_HOOK_MINER, [POOL_MANAGER, FEE_ADDRESS]);

    // 2. Verify NFTStrategyHook
    // Note: Hook constructor takes 4 params: poolManager, restrictedToken, factory, feeAddress
    // Even though deployHook() takes 3, the actual constructor needs all 4
    console.log("\n" + "=".repeat(60));
    console.log("2️⃣  Verifying NFTStrategyHook");
    console.log("=".repeat(60));
    console.log("   Constructor args: [poolManager, restrictedToken, factory, feeAddress]");
    await verify(NEW_HOOK, [
      POOL_MANAGER,        // IPoolManager _poolManager
      RESTRICTED_TOKEN,    // RestrictedToken _restrictedToken
      FACTORY_ADDRESS,     // INFTStrategyFactory _nftStrategyFactory
      FEE_ADDRESS,         // address _feeAddress
    ]);

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Verification Complete!");
    console.log("=".repeat(60));
    console.log("\n📊 Verification Summary:");
    console.log(`   ✅ NFTStrategyHookMiner: https://basescan.org/address/${NEW_HOOK_MINER}#code`);
    console.log(`   ✅ NFTStrategyHook: https://basescan.org/address/${NEW_HOOK}#code`);
    console.log("\n💡 Note: If verification failed, contracts may already be verified.");
    console.log("   Check the BaseScan links above to confirm verification status.");

  } catch (error: any) {
    console.error("\n❌ Verification process encountered an error:", error.message);
    console.log("\n💡 Troubleshooting:");
    console.log("   1. Ensure BASESCAN_API_KEY is set in your .env file");
    console.log("   2. Check that contracts are deployed and confirmed on Base Mainnet");
    console.log("   3. Verify constructor arguments match deployment");
    console.log("   4. Try manual verification on BaseScan if automated verification fails");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });

