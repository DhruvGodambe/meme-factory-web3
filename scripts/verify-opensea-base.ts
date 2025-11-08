import { run } from "hardhat";

async function main() {
  console.log("🔍 Verifying OpenSeaNFTBuyer on BaseScan...");
  console.log("=".repeat(50));
  
  const contractAddress = "0xaA46dd2434dE4b06Da8D4F7f0Ace4e152EecbbA6";
  console.log("Contract Address:", contractAddress);
  console.log("Network: Base Mainnet");
  
  try {
    console.log("⏳ Submitting verification request...");
    
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: [], // OpenSeaNFTBuyer has no constructor arguments
    });
    
    console.log("✅ Contract verified successfully!");
    console.log("🔗 View on BaseScan:", `https://basescan.org/address/${contractAddress}#code`);
    
  } catch (error: any) {
    if (error.message.includes("Already Verified") || 
        error.message.includes("already verified")) {
      console.log("ℹ️  Contract is already verified");
      console.log("🔗 View on BaseScan:", `https://basescan.org/address/${contractAddress}#code`);
    } else {
      console.error("❌ Verification failed:", error.message);
      
      // Provide troubleshooting help
      console.log("\n🛠️  Troubleshooting Tips:");
      console.log("1. Make sure BASESCAN_API_KEY is set in your .env file");
      console.log("2. Verify the contract address is correct");
      console.log("3. Ensure the Solidity version matches (0.8.26)");
      console.log("4. Check that optimizer settings match deployment");
      console.log("5. Try again in a few minutes if rate-limited");
      
      console.log("\n📝 Manual Verification Steps:");
      console.log("1. Go to https://basescan.org/verifyContract");
      console.log("2. Enter contract address:", contractAddress);
      console.log("3. Select 'Solidity (Single file)'");
      console.log("4. Compiler version: 0.8.26");
      console.log("5. Optimization: Yes, 200 runs");
      console.log("6. Copy the flattened source code");
      
      throw error;
    }
  }
  
  console.log("\n✨ Verification process completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Verification failed:", error);
    process.exit(1);
  });