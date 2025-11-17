import { ethers } from "hardhat";
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
    } else {
      console.error(`❌ Verification failed:`, err.message);
      throw err;
    }
  }
}

async function main() {
  const FEE_CONTRACT_ADDRESS = "0x7b672e5e87da80656b43622ddc40c4b3dc6253ed";
  
  console.log("\n🔍 Verifying FeeContract on BaseScan");
  console.log("=".repeat(60));
  console.log(`📋 Network: Base Mainnet (Chain ID: 8453)`);
  console.log(`📦 FeeContract Address: ${FEE_CONTRACT_ADDRESS}\n`);

  // Known addresses from Base Mainnet
  const FACTORY_ADDRESS = "0x6E4Eef9b5ff69E7c22bB5EAD0a7dCc62ad567039";
  const HOOK_ADDRESS = "0xcd1d8048FC7bfec63118a5bF54D477dE3D3168C4"; // New hook
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";
  const OPEN_SEA_BUYER = "0x1df4E3643Dc9119Df655a0BfA9502AB9FaA6356c";

  try {
    // Query the hook to get the RARITY token associated with this FeeContract
    console.log("📡 Querying contract to get constructor arguments...");
    const hook = await ethers.getContractAt("NFTStrategyHook", HOOK_ADDRESS);
    const rarityToken = await hook.feeContractToRarityToken(FEE_CONTRACT_ADDRESS);
    
    if (rarityToken === ethers.ZeroAddress) {
      console.log("⚠️  FeeContract not found in hook mapping. Trying to query factory...");
      
      // Try to get from factory - check all known RARITY tokens
      const factory = await ethers.getContractAt("NFTStrategyFactory", FACTORY_ADDRESS);
      const knownRarityToken = "0xefd37af75982b8462c4589b9e820fca1bcaa8d86"; // From README
      
      const collection = await factory.nftStrategyToCollection(knownRarityToken);
      if (collection !== ethers.ZeroAddress) {
        console.log(`✅ Found collection: ${collection}`);
        console.log(`✅ Using RARITY token: ${knownRarityToken}`);
        
        // Verify with these arguments
        console.log("\n" + "=".repeat(60));
        console.log("🔧 Constructor Arguments:");
        console.log("=".repeat(60));
        console.log(`   1. Factory: ${FACTORY_ADDRESS}`);
        console.log(`   2. Hook: ${HOOK_ADDRESS}`);
        console.log(`   3. Router: ${ROUTER}`);
        console.log(`   4. Collection: ${collection}`);
        console.log(`   5. RARITY Token: ${knownRarityToken}`);
        console.log(`   6. OpenSea Buyer: ${OPEN_SEA_BUYER}\n`);
        
        await verify(FEE_CONTRACT_ADDRESS, [
          FACTORY_ADDRESS,
          HOOK_ADDRESS,
          ROUTER,
          collection,
          knownRarityToken,
          OPEN_SEA_BUYER,
        ]);
      } else {
        throw new Error("Could not determine constructor arguments. Please verify manually.");
      }
    } else {
      console.log(`✅ Found RARITY token: ${rarityToken}`);
      
      // Get collection from factory
      const factory = await ethers.getContractAt("NFTStrategyFactory", FACTORY_ADDRESS);
      const collection = await factory.nftStrategyToCollection(rarityToken);
      
      if (collection === ethers.ZeroAddress) {
        throw new Error("Collection not found for this RARITY token");
      }
      
      console.log(`✅ Found collection: ${collection}`);
      
      // Verify with these arguments
      console.log("\n" + "=".repeat(60));
      console.log("🔧 Constructor Arguments:");
      console.log("=".repeat(60));
      console.log(`   1. Factory: ${FACTORY_ADDRESS}`);
      console.log(`   2. Hook: ${HOOK_ADDRESS}`);
      console.log(`   3. Router: ${ROUTER}`);
      console.log(`   4. Collection: ${collection}`);
      console.log(`   5. RARITY Token: ${rarityToken}`);
      console.log(`   6. OpenSea Buyer: ${OPEN_SEA_BUYER}\n`);
      
      await verify(FEE_CONTRACT_ADDRESS, [
        FACTORY_ADDRESS,
        HOOK_ADDRESS,
        ROUTER,
        collection,
        rarityToken,
        OPEN_SEA_BUYER,
      ]);
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 Verification Complete!");
    console.log("=".repeat(60));
    console.log(`\n📊 FeeContract Verified: https://basescan.org/address/${FEE_CONTRACT_ADDRESS}#code`);

  } catch (error: any) {
    console.error("\n❌ Verification failed:", error.message);
    console.log("\n💡 Manual Verification Instructions:");
    console.log("   1. Go to: https://basescan.org/verifyContract");
    console.log(`   2. Contract Address: ${FEE_CONTRACT_ADDRESS}`);
    console.log("   3. Compiler: Solidity (Single file)");
    console.log("   4. Compiler Version: v0.8.26+commit.8a97fa7a");
    console.log("   5. Optimization: Yes, Runs: 1, Via IR: Yes, EVM: cancun");
    console.log("   6. Constructor Arguments (ABI-encoded):");
    console.log("      You'll need to encode the constructor arguments manually");
    console.log("      or use the values queried above.");
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });


