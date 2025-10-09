import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy RestrictedToken
  console.log("\n📝 Deploying RestrictedToken...");
  const RestrictedTokenFactory = await ethers.getContractFactory("RestrictedToken");
  const restrictedToken = await RestrictedTokenFactory.deploy();
  await restrictedToken.waitForDeployment();
  const tokenAddress = await restrictedToken.getAddress();
  console.log("✅ RestrictedToken deployed to:", tokenAddress);

  // For Sepolia, you would need the actual Uniswap v4 PoolManager address
  // This is a placeholder - replace with actual address when available
  const UNISWAP_V4_POOL_MANAGER = process.env.UNISWAP_V4_POOL_MANAGER || deployer.address;
  
  // Deploy FeeHook
  console.log("\n📝 Deploying FeeHook...");
  const FeeHookFactory = await ethers.getContractFactory("FeeHook");
  const feeHook = await FeeHookFactory.deploy(
    UNISWAP_V4_POOL_MANAGER,
    deployer.address // Fee receiver is deployer for now
  );
  await feeHook.waitForDeployment();
  const hookAddress = await feeHook.getAddress();
  console.log("✅ FeeHook deployed to:", hookAddress);

  // Configure RestrictedToken
  console.log("\n⚙️  Configuring RestrictedToken...");
  const setAllowedTx = await restrictedToken.setAllowedAddresses(
    hookAddress,
    UNISWAP_V4_POOL_MANAGER
  );
  await setAllowedTx.wait();
  console.log("✅ Allowed addresses set");

  console.log("\n📋 Deployment Summary:");
  console.log("=======================");
  console.log("RestrictedToken:", tokenAddress);
  console.log("FeeHook:", hookAddress);
  console.log("Pool Manager:", UNISWAP_V4_POOL_MANAGER);
  console.log("Fee Receiver:", deployer.address);
  console.log("\n⚠️  Remember to enable trading when ready:");
  console.log(`   await restrictedToken.enableTrading(true)`);

  // Save deployment addresses to a file
  const fs = require('fs');
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      RestrictedToken: tokenAddress,
      FeeHook: hookAddress,
      PoolManager: UNISWAP_V4_POOL_MANAGER,
    }
  };

  fs.writeFileSync(
    'deployment-info.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n💾 Deployment info saved to deployment-info.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
