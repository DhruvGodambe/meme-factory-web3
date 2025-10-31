import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  
  // Get current gas prices
  const feeData = await ethers.provider.getFeeData();
  console.log("Current gas price:", feeData.gasPrice?.toString());
  console.log("Current maxFeePerGas:", feeData.maxFeePerGas?.toString());
  console.log("Current maxPriorityFeePerGas:", feeData.maxPriorityFeePerGas?.toString());

  // Polygon addresses
  const POOL_MANAGER = "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543";
  const POSITION_MANAGER = "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4";
  const UNIVERSAL_ROUTER = "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b";
  const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const FEE_ADDRESS = "0xF93E7518F79C2E1978D6862Dbf161270040e623E";
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97"
  
  console.log("\n=== Step 1: Deploy RestrictedToken ===");
  
  // Small delay before first deployment
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const RestrictedToken = await ethers.getContractFactory("RestrictedToken");
  const restrictedToken = await RestrictedToken.deploy();
  await restrictedToken.waitForDeployment();
  const restrictedTokenAddress = await restrictedToken.getAddress();
  console.log("RestrictedToken deployed to:", restrictedTokenAddress);

  // Delay between deployments
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n=== Step 2: Deploy FakeNFTCollection ===");
  const FakeNFTCollection = await ethers.getContractFactory("FakeNFTCollection");
  const nftCollection = await FakeNFTCollection.deploy(
    "Test NFT Collection",
    "TEST",
    "https://api.example.com/metadata/"
  );
  await nftCollection.waitForDeployment();
  const nftCollectionAddress = await nftCollection.getAddress();
  console.log("FakeNFTCollection deployed to:", nftCollectionAddress);

  // Delay between deployments
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n=== Step 3: Deploy NFTStrategyHookMiner ===");
  const NFTStrategyHookMiner = await ethers.getContractFactory("NFTStrategyHookMiner");
  const hookMiner = await NFTStrategyHookMiner.deploy(
    POOL_MANAGER,
    FEE_ADDRESS
  );
  await hookMiner.waitForDeployment();
  const hookMinerAddress = await hookMiner.getAddress();
  console.log("NFTStrategyHookMiner deployed to:", hookMinerAddress);

  // The V4Router address on Polygon
  // TODO: Replace this with the actual Uniswap V4 Router address on Polygon when available
   // Using Universal Router as fallback
  
//   if (V4_ROUTER_ADDRESS === ethers.ZeroAddress) {
//     console.log("WARNING: Using Universal Router as V4Router. Update when V4Router is deployed on Polygon.");
//   }

  console.log("\n=== Step 4: Deploy NFTStrategyFactory (needed for hook deployment) ===");
  
  // Wait a bit before deployment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const NFTStrategyFactory = await ethers.getContractFactory("NFTStrategyFactory");
  const factory = await NFTStrategyFactory.deploy(
    POSITION_MANAGER,
    PERMIT2,
    POOL_MANAGER,
    UNIVERSAL_ROUTER,
    ROUTER,
    FEE_ADDRESS,
    restrictedTokenAddress,
    ethers.ZeroAddress // Will be set after hook deployment
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("NFTStrategyFactory deployed to:", factoryAddress);

  console.log("\n=== Step 5: Mine Salt for NFTStrategyHook ===");
  
  // Check if salt is already mined
  const [existingHookAddress, existingSalt, isMined] = await hookMiner.getMinedData();
  if (isMined) {
    console.log("✅ Salt already mined!");
    console.log("Mined Hook Address:", existingHookAddress);
    console.log("Mined Salt:", existingSalt);
  } else {
    console.log("⏳ Mining salt (this may take a while depending on difficulty)...");
    console.log("⚠️  Be patient! Salt mining can take several minutes to hours.");
    console.log("💡 Mining with optimized gas settings...");
    
    // Wait for next block to avoid nonce issues
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const mineSaltTx = await hookMiner.mineSalt(
      restrictedTokenAddress,
      factoryAddress,
      FEE_ADDRESS,
      {
        gasLimit: 16_777_215, // 30M gas limit
        gasPrice: feeData.gasPrice || BigInt(0)
      }
    );
    
    console.log("⏳ Salt mining transaction submitted:", mineSaltTx.hash);
    console.log("⏳ Waiting for confirmation (this may take 5-10 minutes)...");
    
    const receipt = await mineSaltTx.wait();
    if (receipt) {
      console.log("✅ Salt mining transaction confirmed in block:", receipt.blockNumber);
      console.log("Gas used:", receipt.gasUsed.toString());
    }
  }
  
  const [minedHookAddress, minedSalt] = await hookMiner.getMinedData();
  console.log("Mined Hook Address:", minedHookAddress);
  console.log("Mined Salt:", minedSalt);

  console.log("\n=== Step 6: Deploy NFTStrategyHook using CREATE2 ===");
  console.log("⏳ Deploying hook with CREATE2 (mined salt)...");
  
  // Wait before deployment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const deployHookTx = await hookMiner.deployHook(
    restrictedTokenAddress,
    factoryAddress,
    FEE_ADDRESS,
    {
      gasLimit: 5_000_000, // Adjusted gas limit for deployment
      gasPrice: feeData.gasPrice || BigInt(0)
    }
  );
  
  console.log("⏳ Waiting for deployment transaction...");
  const deployReceipt = await deployHookTx.wait(2);
  console.log("✅ Hook deployed!");
  if (deployReceipt) {
    console.log("Gas used:", deployReceipt.gasUsed.toString());
  }
  
  const actualHookAddress = await hookMiner.getHook();
  console.log("NFTStrategyHook deployed to:", actualHookAddress);
  
  if (actualHookAddress.toLowerCase() !== minedHookAddress.toLowerCase()) {
    throw new Error("Hook address mismatch!");
  }

  console.log("\n=== Step 7: Configure Factory ===");
  
  // Wait a bit before next transaction to avoid nonce issues
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Set the restricted token hook address to the NFTStrategyHook address
  const setRestrictedHookTx = await factory.setRestrictedTokenHookAddress(actualHookAddress);
  await setRestrictedHookTx.wait();
  console.log("Restricted token hook address set to NFTStrategyHook:", actualHookAddress);

  await new Promise(resolve => setTimeout(resolve, 1000));

  const setHookTx = await factory.updateHookAddress(actualHookAddress);
  await setHookTx.wait();
  console.log("Hook address set in factory");

  const setFeeTx = await factory.updateFeeToLaunch(ethers.parseEther("0.01")); // Example: 0.01 ETH fee
  await setFeeTx.wait();
  console.log("Fee to launch set");

  const setPublicTx = await factory.setPublicLaunches(true);
  await setPublicTx.wait();
  console.log("Public launches enabled");

  const setCollectionOwnerTx = await factory.setCollectionOwnerLaunches(true);
  await setCollectionOwnerTx.wait();
  console.log("Collection owner launches enabled");

  console.log("\n=== Step 8: Configure RestrictedToken ===");
  const setPoolManagerTx = await restrictedToken.setPoolManager(POOL_MANAGER);
  await setPoolManagerTx.wait();
  console.log("PoolManager set in RestrictedToken");

  const setHookTx2 = await restrictedToken.setHook(actualHookAddress);
  await setHookTx2.wait();
  console.log("Hook set in RestrictedToken");

  const setRouterTx = await restrictedToken.setSwapRouter(UNIVERSAL_ROUTER);
  await setRouterTx.wait();
  console.log("Router set in RestrictedToken");

  // Enable trading
  const enableTradingTx = await restrictedToken.setTradingEnabled(true);
  await enableTradingTx.wait();
  console.log("Trading enabled for RestrictedToken");

  console.log("\n=== Step 9: Save Deployment Info ===");
  const deploymentInfo = {
    network: "polygon",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      NFTStrategyHookMiner: hookMinerAddress,
      NFTStrategyHook: actualHookAddress,
      NFTStrategyFactory: factoryAddress,
      RestrictedToken: restrictedTokenAddress,
      FakeNFTCollection: nftCollectionAddress,
      minedHookAddress: minedHookAddress,
      minedSalt: minedSalt,
    },
    config: {
      poolManager: POOL_MANAGER,
      positionManager: POSITION_MANAGER,
      universalRouter: UNIVERSAL_ROUTER,
      permit2: PERMIT2,
      router: UNIVERSAL_ROUTER,
      feeAddress: FEE_ADDRESS,
      restrictedTokenAddress: restrictedTokenAddress,
      restrictedTokenHookAddress: actualHookAddress, // Same as NFTStrategyHook
    }
  };

  const filename = `deployment-polygon-${Date.now()}.json`;
  const filepath = path.join(__dirname, "..", filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to:", filename);

  console.log("\n=== Step 10: Additional Configuration (Optional) ===");
  
  // TWAP increment is already set to 1 ether in the contract

  // Optionally set router restrictions
  try {
    const setRouterRestrictTx = await factory.setRouterRestrict(true);
    await setRouterRestrictTx.wait();
    console.log("Router restrictions enabled");
  } catch (error) {
    console.log("Could not set router restrictions (may not be in contract)");
  }

  console.log("\n=== Deployment Summary ===");
  console.log("✓ NFTStrategyHookMiner:", hookMinerAddress);
  console.log("✓ NFTStrategyHook:", actualHookAddress);
  console.log("✓ NFTStrategyFactory:", factoryAddress);
  console.log("✓ RestrictedToken:", restrictedTokenAddress);
  console.log("✓ FakeNFTCollection:", nftCollectionAddress);
  console.log("✓ Mined Salt:", minedSalt);
  console.log("\n📋 Configuration:");
  console.log("  - Public Launches: ENABLED");
  console.log("  - Collection Owner Launches: ENABLED");
  console.log("  - Launch Fee: 0.01 MATIC");
  console.log("  - Hook Address:", actualHookAddress);
  console.log("  - RestrictedToken Hook:", actualHookAddress);
  console.log("\n🔗 To launch a new NFTStrategy:");
  console.log(`  factory.launchNFTStrategy("${nftCollectionAddress}", "Token Name", "SYMBOL")`);
  console.log("\n📝 Next steps:");
  console.log("1. Verify all contracts on Polygonscan");
  console.log("2. Transfer ownership if needed");
  console.log("3. Fund the factory for TWAP operations");
  console.log("4. Test with the FakeNFTCollection launch");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

