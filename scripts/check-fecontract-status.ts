import { ethers } from "hardhat";

async function main() {
  const FEE_CONTRACT_ADDRESS = "0x7b672e5e87da80656b43622ddc40c4b3dc6253ed";
  const HOOK_ADDRESS = "0xcd1d8048FC7bfec63118a5bF54D477dE3D3168C4";
  const FACTORY_ADDRESS = "0x6E4Eef9b5ff69E7c22bB5EAD0a7dCc62ad567039";
  const KNOWN_RARITY_TOKEN = "0xEFD37AF75982b8462c4589b9E820FCA1BcAA8d86";

  console.log("\n🔍 Checking FeeContract Status");
  console.log("=".repeat(60));
  console.log(`FeeContract: ${FEE_CONTRACT_ADDRESS}\n`);

  try {
    const hook = await ethers.getContractAt("NFTStrategyHook", HOOK_ADDRESS);
    const factory = await ethers.getContractAt("NFTStrategyFactory", FACTORY_ADDRESS);
    const feeContract = await ethers.getContractAt("FeeContract", FEE_CONTRACT_ADDRESS);

    // 1. Check if this FeeContract is mapped to any RARITY token
    console.log("1️⃣  Checking FeeContract → RARITY Token mapping...");
    const rarityToken = await hook.feeContractToRarityToken(FEE_CONTRACT_ADDRESS);
    
    if (rarityToken === ethers.ZeroAddress) {
      console.log("   ❌ This FeeContract is NOT registered in the hook");
      console.log("   This means it's either:");
      console.log("      - An old/deprecated FeeContract");
      console.log("      - A test contract");
      console.log("      - Not deployed through the hook\n");
    } else {
      console.log(`   ✅ Mapped to RARITY Token: ${rarityToken}\n`);
      
      // 2. Check if this FeeContract is the active one for that RARITY token
      console.log("2️⃣  Checking if this is the active FeeContract...");
      const activeFeeContract = await hook.activeFeeContract(rarityToken);
      
      if (activeFeeContract.toLowerCase() === FEE_CONTRACT_ADDRESS.toLowerCase()) {
        console.log("   ✅ This IS the active FeeContract for this RARITY token\n");
      } else {
        console.log(`   ⚠️  This is NOT the active FeeContract`);
        console.log(`   Active FeeContract: ${activeFeeContract}\n`);
      }
    }

    // 3. Check FeeContract's immutable values
    console.log("3️⃣  Checking FeeContract's immutable values...");
    try {
      const factoryValue = await feeContract.factory();
      const hookValue = await feeContract.hookAddress();
      const collection = await feeContract.collection();
      const rarityTokenValue = await feeContract.rarityToken();
      
      console.log(`   Factory: ${factoryValue}`);
      console.log(`   Hook: ${hookValue}`);
      console.log(`   Collection: ${collection}`);
      console.log(`   RARITY Token: ${rarityTokenValue}\n`);
      
      // 4. Check if this matches the known RARITY token
      if (rarityTokenValue.toLowerCase() === KNOWN_RARITY_TOKEN.toLowerCase()) {
        console.log("4️⃣  This FeeContract is associated with the known RARITY token");
        console.log(`   RARITY Token: ${KNOWN_RARITY_TOKEN}\n`);
      }
    } catch (err: any) {
      console.log(`   ⚠️  Could not read immutable values: ${err.message}\n`);
    }

    // 5. Check current status
    console.log("5️⃣  Checking FeeContract current status...");
    try {
      const holdings = await feeContract.currentHoldings();
      const fees = await feeContract.currentFees();
      const isFull = await feeContract.isFull();
      
      console.log(`   Current Holdings: ${holdings}/5 NFTs`);
      console.log(`   Current Fees: ${ethers.formatEther(fees)} ETH`);
      console.log(`   Is Full: ${isFull}\n`);
    } catch (err: any) {
      console.log(`   ⚠️  Could not read status: ${err.message}\n`);
    }

    console.log("=".repeat(60));
    console.log("📊 Summary:");
    console.log("=".repeat(60));
    
    if (rarityToken === ethers.ZeroAddress) {
      console.log("⚠️  This FeeContract is NOT registered in the hook.");
      console.log("   It may be an old instance or a test contract.");
      console.log("   You can still verify it on BaseScan, but it's not actively used.");
    } else {
      const activeFeeContract = await hook.activeFeeContract(rarityToken);
      if (activeFeeContract.toLowerCase() === FEE_CONTRACT_ADDRESS.toLowerCase()) {
        console.log("✅ This FeeContract is ACTIVE and registered in the hook.");
      } else {
        console.log("⚠️  This FeeContract exists but is NOT the active one.");
        console.log(`   The active FeeContract is: ${activeFeeContract}`);
      }
    }

  } catch (error: any) {
    console.error("❌ Error:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });


