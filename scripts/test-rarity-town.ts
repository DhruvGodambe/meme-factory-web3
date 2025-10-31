import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();
  
  console.log("🧪 Testing Rarity Town Protocol Deployment");
  console.log("Network:", hre.network.name);
  console.log("Account:", deployer.address);
  
  // You can update these addresses after deployment
  const FACTORY_ADDRESS = "0x..."; // Update after deployment
  const HOOK_ADDRESS = "0x...";    // Update after deployment
  const NFT_COLLECTION = "0x...";  // Update after deployment
  
  if (FACTORY_ADDRESS === "0x..." || HOOK_ADDRESS === "0x..." || NFT_COLLECTION === "0x...") {
    console.log("❌ Please update the contract addresses in this script after deployment");
    return;
  }
  
  // Get contract instances
  const factory = await ethers.getContractAt("NFTStrategyFactory", FACTORY_ADDRESS);
  const hook = await ethers.getContractAt("NFTStrategyHook", HOOK_ADDRESS) as any;
  
  console.log("\n=== Test 1: Launch RARITY Token ===");
  
  try {
    const launchFee = await factory.feeToLaunch();
    console.log("Launch fee:", ethers.formatEther(launchFee), "ETH");
    
    console.log("⏳ Launching RARITY token for NFT collection...");
    const launchTx = await factory.launchNFTStrategy(
      NFT_COLLECTION,
      "Test Collection RARITY",
      "TCR",
      { value: launchFee }
    );
    
    const launchReceipt = await launchTx.wait();
    console.log("✅ RARITY token launched!");
    
    // Get the deployed RARITY token address
    const rarityTokenAddress = await factory.collectionToNFTStrategy(NFT_COLLECTION);
    console.log("RARITY Token Address:", rarityTokenAddress);
    
    console.log("\n=== Test 2: Deploy FeeContract ===");
    
    // Check if FeeContract exists
    const hasFeeContract = await hook.hasFeeContract(rarityTokenAddress);
    console.log("Has FeeContract:", hasFeeContract);
    
    if (!hasFeeContract) {
      console.log("⏳ Deploying FeeContract...");
      const deployFeeContractTx = await hook.deployNewFeeContract(rarityTokenAddress);
      const deployReceipt = await deployFeeContractTx.wait();
      console.log("✅ FeeContract deployed!");
      
      const feeContractAddress = await hook.getActiveFeeContract(rarityTokenAddress);
      console.log("FeeContract Address:", feeContractAddress);
    }
    
    console.log("\n=== Test 3: Check Status ===");
    
    const activeFeeContract = await hook.getActiveFeeContract(rarityTokenAddress);
    console.log("Active FeeContract:", activeFeeContract);
    
    const isFull = await hook.isActiveFeeContractFull(rarityTokenAddress);
    console.log("Is FeeContract Full:", isFull);
    
    if (activeFeeContract !== ethers.ZeroAddress) {
      const holdings = await hook.getFeeContractHoldings(activeFeeContract);
      const fees = await hook.getFeeContractFees(activeFeeContract);
      console.log("FeeContract Holdings:", holdings.toString(), "NFTs");
      console.log("FeeContract Fees:", ethers.formatEther(fees), "ETH");
    }
    
    console.log("\n✅ All tests passed!");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });