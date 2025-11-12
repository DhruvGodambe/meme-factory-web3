import { run } from "hardhat";
import deploymentInfo from "../deployment-sepolia-1762881133127.json";

async function main() {
  console.log("🔍 Starting contract verification on Etherscan...");
  console.log("Network:", deploymentInfo.network);
  console.log("Deployer:", deploymentInfo.deployer);
  console.log("Timestamp:", deploymentInfo.timestamp);
  
  const contracts = deploymentInfo.contracts;
  const config = deploymentInfo.config;
  
  // Track verification results
  const verificationResults = {
    successful: [] as string[],
    failed: [] as string[],
    skipped: [] as string[]
  };

  // Helper function to verify a contract with retry logic
  async function verifyContract(
    contractName: string,
    address: string,
    constructorArgs: any[] = [],
    maxRetries: number = 3
  ) {
    console.log(`\n📋 Verifying ${contractName} at ${address}...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`   Attempt ${attempt}/${maxRetries}...`);
        
        await run("verify:verify", {
          address: address,
          constructorArguments: constructorArgs,
        });
        
        console.log(`✅ ${contractName} verified successfully!`);
        verificationResults.successful.push(`${contractName} (${address})`);
        return true;
        
      } catch (error: any) {
        console.log(`❌ Attempt ${attempt} failed:`, error.message);
        
        // Check if contract is already verified
        if (error.message.includes("Already Verified") || 
            error.message.includes("already verified")) {
          console.log(`ℹ️  ${contractName} is already verified`);
          verificationResults.skipped.push(`${contractName} (${address}) - Already verified`);
          return true;
        }
        
        // Check if it's a compilation issue
        if (error.message.includes("compilation") || 
            error.message.includes("source code")) {
          console.log(`⚠️  ${contractName} has compilation issues, skipping`);
          verificationResults.failed.push(`${contractName} (${address}) - Compilation error`);
          return false;
        }
        
        if (attempt === maxRetries) {
          console.log(`💀 ${contractName} verification failed after ${maxRetries} attempts`);
          verificationResults.failed.push(`${contractName} (${address}) - ${error.message}`);
          return false;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    return false;
  }

  console.log("\n" + "=".repeat(60));
  console.log("🚀 STARTING CONTRACT VERIFICATION");
  console.log("=".repeat(60));

  // 1. Verify RestrictedToken (no constructor args)
  await verifyContract(
    "RestrictedToken",
    contracts.RestrictedToken,
    []
  );

  // 2. Verify FakeNFTCollection
  await verifyContract(
    "FakeNFTCollection", 
    contracts.FakeNFTCollection,
    [
      "Test NFT Collection",    // collectionName
      "TEST",                   // collectionSymbol  
      "https://api.example.com/metadata/"  // baseTokenURI
    ]
  );

  // 3. Verify NFTStrategyHookMiner
  await verifyContract(
    "NFTStrategyHookMiner",
    contracts.NFTStrategyHookMiner,
    [
      config.poolManager,     // _poolManager
      config.feeAddress       // _treasury
    ]
  );

  // 4. Verify NFTStrategyFactory
  await verifyContract(
    "NFTStrategyFactory",
    contracts.NFTStrategyFactory,
    [
      config.positionManager,           // _positionManager
      config.permit2,                   // _permit2
      config.poolManager,               // _poolManager  
      config.universalRouter,           // _universalRouter
      config.router,                    // _router
      config.feeAddress,                // _feeAddress
      contracts.RestrictedToken,        // _restrictedToken
      "0x0000000000000000000000000000000000000000"  // _restrictedTokenHookAddress (initially zero)
    ]
  );

  // 5. Verify NFTStrategyHook (most complex)
  await verifyContract(
    "NFTStrategyHook",
    contracts.NFTStrategyHook,
    [
      config.poolManager,           // _poolManager
      contracts.RestrictedToken,    // _restrictedToken
      contracts.NFTStrategyFactory, // _nftStrategyFactory
      config.feeAddress            // _feeAddress
    ]
  );

  // Print verification summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 VERIFICATION SUMMARY");
  console.log("=".repeat(60));
  
  console.log(`\n✅ Successfully verified (${verificationResults.successful.length}):`);
  verificationResults.successful.forEach(contract => {
    console.log(`   • ${contract}`);
  });
  
  console.log(`\nℹ️  Already verified (${verificationResults.skipped.length}):`);
  verificationResults.skipped.forEach(contract => {
    console.log(`   • ${contract}`);
  });
  
  console.log(`\n❌ Failed verification (${verificationResults.failed.length}):`);
  verificationResults.failed.forEach(contract => {
    console.log(`   • ${contract}`);
  });

  const totalAttempted = verificationResults.successful.length + 
                        verificationResults.skipped.length + 
                        verificationResults.failed.length;
  const totalSuccess = verificationResults.successful.length + verificationResults.skipped.length;
  
  console.log(`\n📈 Overall Success Rate: ${totalSuccess}/${totalAttempted} (${Math.round(totalSuccess/totalAttempted*100)}%)`);

  // Generate Etherscan links
  console.log("\n" + "=".repeat(60));
  console.log("🔗 ETHERSCAN LINKS (CORRECTED FOR ACTUAL NETWORK)");
  console.log("=".repeat(60));
  
  // Since we ran with --network sepolia, use sepolia links regardless of deployment JSON network field
  const networkName = "sepolia.etherscan.io";

  Object.entries(contracts).forEach(([name, address]) => {
    if (typeof address === 'string' && address.startsWith('0x')) {
      console.log(`${name}: https://${networkName}/address/${address}#code`);
    }
  });

  console.log("\n✨ Verification process completed!");
  
  if (verificationResults.failed.length > 0) {
    console.log("\n⚠️  Some contracts failed verification. Common solutions:");
    console.log("1. Check if constructor arguments are correct");
    console.log("2. Ensure Solidity version matches");
    console.log("3. Verify optimizer settings match deployment");
    console.log("4. Try manual verification on Etherscan");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Verification failed:", error);
    process.exit(1);
  });