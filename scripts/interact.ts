import { ethers } from "hardhat";

async function main() {
  // Load deployment info
  const fs = require('fs');
  let deploymentInfo: any;
  
  try {
    deploymentInfo = JSON.parse(fs.readFileSync('deployment-info.json', 'utf8'));
  } catch (error) {
    console.error("❌ Could not load deployment-info.json");
    console.error("   Please deploy the contracts first using: npx hardhat run scripts/deploy.ts");
    process.exit(1);
  }

  const [owner] = await ethers.getSigners();
  console.log("Interacting with contracts using account:", owner.address);

  const tokenAddress = deploymentInfo.contracts.RestrictedToken;
  const hookAddress = deploymentInfo.contracts.FeeHook;

  console.log("\n📝 Loading contracts...");
  const restrictedToken = await ethers.getContractAt("RestrictedToken", tokenAddress);
  const feeHook = await ethers.getContractAt("FeeHook", hookAddress);

  console.log("RestrictedToken:", tokenAddress);
  console.log("FeeHook:", hookAddress);

  // Get current status
  console.log("\n📊 Current Status:");
  console.log("==================");
  const tradingEnabled = await restrictedToken.tradingEnabled();
  const allowedHook = await restrictedToken.allowedHook();
  const allowedPoolManager = await restrictedToken.allowedPoolManager();
  const ownerBalance = await restrictedToken.balanceOf(owner.address);
  const totalSupply = await restrictedToken.totalSupply();

  console.log("Trading Enabled:", tradingEnabled);
  console.log("Allowed Hook:", allowedHook);
  console.log("Allowed Pool Manager:", allowedPoolManager);
  console.log("Owner Balance:", ethers.formatEther(ownerBalance), "RST");
  console.log("Total Supply:", ethers.formatEther(totalSupply), "RST");

  // Enable trading if not already enabled
  if (!tradingEnabled) {
    console.log("\n⚙️  Enabling trading...");
    const tx = await restrictedToken.enableTrading(true);
    await tx.wait();
    console.log("✅ Trading enabled!");
  } else {
    console.log("\n✅ Trading is already enabled");
  }

  // Demonstrate a transfer before and after trading
  console.log("\n🧪 Testing Transfers:");
  console.log("=====================");

  // Create a test recipient address
  const testRecipient = ethers.Wallet.createRandom().address;
  console.log("Test recipient:", testRecipient);

  // Transfer some tokens as owner (should work)
  const transferAmount = ethers.parseEther("1000");
  console.log("\n📤 Transferring", ethers.formatEther(transferAmount), "RST to test recipient...");
  const transferTx = await restrictedToken.transfer(testRecipient, transferAmount);
  await transferTx.wait();
  
  const recipientBalance = await restrictedToken.balanceOf(testRecipient);
  console.log("✅ Transfer successful!");
  console.log("   Recipient balance:", ethers.formatEther(recipientBalance), "RST");

  console.log("\n✨ Interaction complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
