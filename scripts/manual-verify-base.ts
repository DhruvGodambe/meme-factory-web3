import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🔍 Manual Contract Verification for Base");
  console.log("=".repeat(50));
  
  const contractAddress = "0xaA46dd2434dE4b06Da8D4F7f0Ace4e152EecbbA6";
  const contractName = "OpenSeaNFTBuyer";
  
  console.log("Contract Address:", contractAddress);
  console.log("Network: Base Mainnet (Chain ID: 8453)");
  console.log("Contract Name:", contractName);
  
  try {
    console.log("\n⏳ Step 1: Flattening contract source code...");
    
    // First, let's flatten the contract
    await run("flatten", {
      files: ["contracts/amock/OpenSeaPort.sol"]
    });
    
    console.log("✅ Contract flattened successfully!");
    
  } catch (error: any) {
    console.log("❌ Flattening failed:", error.message);
  }
  
  console.log("\n📋 MANUAL VERIFICATION INSTRUCTIONS:");
  console.log("=".repeat(50));
  
  console.log("\n🌐 1. Go to BaseScan verification page:");
  console.log("   https://basescan.org/verifyContract");
  
  console.log("\n📝 2. Enter contract details:");
  console.log("   - Contract Address:", contractAddress);
  console.log("   - Compiler Type: Solidity (Single file)");
  console.log("   - Compiler Version: v0.8.26+commit.8a97fa7a");
  console.log("   - Open Source License Type: MIT");
  
  console.log("\n⚙️ 3. Optimization settings:");
  console.log("   - Optimization: Yes");
  console.log("   - Runs: 200");
  console.log("   - Via IR: Yes");
  console.log("   - EVM Version: cancun");
  
  console.log("\n📄 4. Source code:");
  console.log("   Copy the flattened source code from above or use this command:");
  console.log("   npx hardhat flatten contracts/amock/OpenSeaPort.sol > flattened.sol");
  
  console.log("\n🔧 5. Constructor arguments:");
  console.log("   - No constructor arguments needed (empty)");
  
  console.log("\n📊 6. Contract verification details:");
  console.log("   - Contract Name: OpenSeaNFTBuyer");
  console.log("   - SPDX License: MIT");
  console.log("   - Solidity Version: ^0.8.20");
  
  // Generate a flattened version and save to file
  try {
    console.log("\n💾 Generating flattened contract file...");
    
    // Run flatten command and capture output
    const { execSync } = require('child_process');
    const flattenedCode = execSync('npx hardhat flatten contracts/amock/OpenSeaPort.sol', { 
      encoding: 'utf8',
      cwd: process.cwd()
    });
    
    // Save to file
    const outputPath = path.join(process.cwd(), 'flattened-opensea.sol');
    fs.writeFileSync(outputPath, flattenedCode);
    
    console.log("✅ Flattened contract saved to:", outputPath);
    console.log("📋 You can copy this file content for manual verification");
    
  } catch (error: any) {
    console.log("❌ Failed to generate flattened file:", error.message);
  }
  
  console.log("\n🎯 ALTERNATIVE: Try direct verification with v2 API");
  console.log("=".repeat(50));
  
  try {
    console.log("⏳ Attempting direct verification...");
    
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: [],
      contract: "contracts/amock/OpenSeaPort.sol:OpenSeaNFTBuyer"
    });
    
    console.log("✅ Direct verification successful!");
    
  } catch (error: any) {
    console.log("❌ Direct verification failed:", error.message);
    
    if (error.message.includes("already verified")) {
      console.log("ℹ️  Contract might already be verified!");
      console.log("🔗 Check: https://basescan.org/address/" + contractAddress + "#code");
    }
  }
  
  console.log("\n📚 ADDITIONAL RESOURCES:");
  console.log("- BaseScan Docs: https://docs.basescan.org/");
  console.log("- Etherscan V2 API: https://docs.etherscan.io/v/etherscan-v2/");
  console.log("- Hardhat Verify: https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify");
  
  console.log("\n✨ Verification guide completed!");
  console.log("🔗 Contract URL: https://basescan.org/address/" + contractAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });