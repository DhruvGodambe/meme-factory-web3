import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying Rarity Town Protocol contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  
  // Get current gas prices
  const feeData = await ethers.provider.getFeeData();
  console.log("Current gas price:", feeData.gasPrice?.toString());
  console.log("Current maxFeePerGas:", feeData.maxFeePerGas?.toString());
  console.log("Current maxPriorityFeePerGas:", feeData.maxPriorityFeePerGas?.toString());

  // Network configuration
  let POOL_MANAGER, POSITION_MANAGER, UNIVERSAL_ROUTER, PERMIT2, ROUTER, FEE_ADDRESS;
  
  if (hre.network.name === "sepolia" || hre.network.name === "polygon-mainnet") {
    // Polygon addresses
    POOL_MANAGER = "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543";
    POSITION_MANAGER = "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4";
    UNIVERSAL_ROUTER = "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b";
    PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
    ROUTER = "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b";
    FEE_ADDRESS = "0xF93E7518F79C2E1978D6862Dbf161270040e623E";
  } else {
    // Sepolia test addresses (using deployer as mock addresses for testing)
    console.log("⚠️ Using test addresses for Sepolia deployment");
    POOL_MANAGER = deployer.address; // Mock - will use deployer address
    POSITION_MANAGER = deployer.address; // Mock - will use deployer address
    UNIVERSAL_ROUTER = deployer.address; // Mock - will use deployer address
    PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // This is usually consistent
    ROUTER = deployer.address; // Mock - will use deployer address
    FEE_ADDRESS = deployer.address; // Use deployer as fee address
  }
  
  console.log("\n🚀 === Rarity Town Protocol Deployment Started ===");
  console.log("Network:", hre.network.name);
  
  console.log("\n=== Step 1: Deploy RestrictedToken ===");
  
  // Small delay before first deployment
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const RestrictedToken = await ethers.getContractFactory("RestrictedToken");
  console.log("⏳ Deploying RestrictedToken...");
  const restrictedToken = await RestrictedToken.deploy({
    gasLimit: 3_000_000,
    gasPrice: feeData.gasPrice || undefined
  });
  await restrictedToken.waitForDeployment();
  const restrictedTokenAddress = await restrictedToken.getAddress();
  console.log("✅ RestrictedToken deployed to:", restrictedTokenAddress);

  // Delay between deployments to avoid nonce issues
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n=== Step 2: Deploy Test NFT Collection ===");
  const FakeNFTCollection = await ethers.getContractFactory("FakeNFTCollection");
  console.log("⏳ Deploying FakeNFTCollection for testing...");
  const nftCollection = await FakeNFTCollection.deploy(
    "Rarity Test Collection",
    "RTC", 
    "https://api.rarity-town.com/metadata/",
    {
      gasLimit: 2_500_000,
      gasPrice: feeData.gasPrice || undefined
    }
  );
  await nftCollection.waitForDeployment();
  const nftCollectionAddress = await nftCollection.getAddress();
  console.log("✅ FakeNFTCollection deployed to:", nftCollectionAddress);

  // Delay between deployments
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n=== Step 3: Deploy NFTStrategyHookMiner ===");
  const NFTStrategyHookMiner = await ethers.getContractFactory("NFTStrategyHookMiner");
  console.log("⏳ Deploying NFTStrategyHookMiner...");
  const hookMiner = await NFTStrategyHookMiner.deploy(
    POOL_MANAGER,
    FEE_ADDRESS,
    {
      gasLimit: 3_500_000,
      gasPrice: feeData.gasPrice || undefined
    }
  );
  await hookMiner.waitForDeployment();
  const hookMinerAddress = await hookMiner.getAddress();
  console.log("✅ NFTStrategyHookMiner deployed to:", hookMinerAddress);

  // Delay between deployments
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n=== Step 4: Deploy NFTStrategyFactory ===");
  console.log("⏳ Deploying NFTStrategyFactory...");
  
  const NFTStrategyFactory = await ethers.getContractFactory("NFTStrategyFactory");
  const factory = await NFTStrategyFactory.deploy(
    POSITION_MANAGER,
    PERMIT2,
    POOL_MANAGER,
    UNIVERSAL_ROUTER,
    ROUTER,
    FEE_ADDRESS,
    restrictedTokenAddress,
    ethers.ZeroAddress, // RestrictedToken hook address (will be set after hook deployment)
    {
      gasLimit: 5_000_000,
      gasPrice: feeData.gasPrice || undefined
    }
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ NFTStrategyFactory deployed to:", factoryAddress);

  console.log("\n=== Step 5: Mine Salt for NFTStrategyHook ===");
  
  // Check if salt is already mined
  const [existingHookAddress, existingSalt, isMined] = await hookMiner.getMinedData();
  if (isMined) {
    console.log("ℹ️ Salt already mined:");
    console.log("  Hook Address:", existingHookAddress);
    console.log("  Salt:", existingSalt);
  } else {
    console.log("⏳ Mining salt for NFTStrategyHook address...");
    console.log("This may take a while to find an address with correct permissions...");
    
    const mineTx = await hookMiner.mineSalt(
      restrictedTokenAddress,
      factoryAddress,
      FEE_ADDRESS,
      {
        gasLimit: 30_000_000, // High gas limit for mining
        gasPrice: feeData.gasPrice || undefined
      }
    );
    
    console.log("⏳ Mining transaction submitted, waiting for completion...");
    const mineReceipt = await mineTx.wait(3); // Wait for 3 confirmations
    console.log("✅ Salt mining completed!");
    if (mineReceipt) {
      console.log("  Gas used:", mineReceipt.gasUsed.toString());
    }
  }
  
  const [minedHookAddress, minedSalt] = await hookMiner.getMinedData();
  console.log("🎯 Mined Hook Address:", minedHookAddress);
  console.log("🧂 Mined Salt:", minedSalt);

  console.log("\n=== Step 6: Deploy NFTStrategyHook using CREATE2 ===");
  console.log("⏳ Deploying NFTStrategyHook with mined salt...");
  
  // Wait before deployment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const deployHookTx = await hookMiner.deployHook(
    restrictedTokenAddress,
    factoryAddress,
    FEE_ADDRESS,
    {
      gasLimit: 6_000_000,
      gasPrice: feeData.gasPrice || undefined
    }
  );
  
  console.log("⏳ Waiting for hook deployment transaction...");
  const deployReceipt = await deployHookTx.wait(2);
  console.log("✅ NFTStrategyHook deployed!");
  if (deployReceipt) {
    console.log("  Gas used:", deployReceipt.gasUsed.toString());
  }
  
  const actualHookAddress = await hookMiner.getHook();
  console.log("🎣 NFTStrategyHook deployed to:", actualHookAddress);
  
  // Verify addresses match
  if (actualHookAddress.toLowerCase() !== minedHookAddress.toLowerCase()) {
    throw new Error(`Hook address mismatch! Expected: ${minedHookAddress}, Got: ${actualHookAddress}`);
  }

  console.log("\n=== Step 7: Configure Contracts ===");
  
  // Wait a bit before configuration transactions
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("⚙️ Configuring NFTStrategyFactory...");
  
  // Set the restricted token hook address to the NFTStrategyHook address
  const setRestrictedHookTx = await factory.setRestrictedTokenHookAddress(actualHookAddress);
  await setRestrictedHookTx.wait();
  console.log("✅ Restricted token hook address set");

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Set hook address in factory
  const setHookTx = await factory.updateHookAddress(actualHookAddress);
  await setHookTx.wait();
  console.log("✅ Hook address set in factory");

  // Set launch fee (0.01 ETH)
  const setFeeTx = await factory.updateFeeToLaunch(ethers.parseEther("0.01"));
  await setFeeTx.wait();
  console.log("✅ Launch fee set to 0.01 ETH");

  // Enable public launches
  const setPublicTx = await factory.setPublicLaunches(true);
  await setPublicTx.wait();
  console.log("✅ Public launches enabled");

  // Enable collection owner launches
  const setCollectionOwnerTx = await factory.setCollectionOwnerLaunches(true);
  await setCollectionOwnerTx.wait();
  console.log("✅ Collection owner launches enabled");

  console.log("\n⚙️ Configuring RestrictedToken...");
  
  // Configure RestrictedToken
  const setPoolManagerTx = await restrictedToken.setPoolManager(POOL_MANAGER);
  await setPoolManagerTx.wait();
  console.log("✅ PoolManager set in RestrictedToken");

  const setHookTx2 = await restrictedToken.setHook(actualHookAddress);
  await setHookTx2.wait();
  console.log("✅ Hook set in RestrictedToken");

  const setRouterTx = await restrictedToken.setSwapRouter(UNIVERSAL_ROUTER);
  await setRouterTx.wait();
  console.log("✅ Router set in RestrictedToken");

  // Enable trading
  const enableTradingTx = await restrictedToken.setTradingEnabled(true);
  await enableTradingTx.wait();
  console.log("✅ Trading enabled for RestrictedToken");

  console.log("\n⚙️ Configuring NFTStrategyHook...");
  
  // Get hook contract instance
  const NFTStrategyHook = await ethers.getContractFactory("NFTStrategyHook");
  const hook = NFTStrategyHook.attach(actualHookAddress) as any; // Type assertion for additional methods
  
  // Set router address for FeeContract deployments
  const setRouterAddressTx = await hook.setRouterAddress(ROUTER);
  await setRouterAddressTx.wait();
  console.log("✅ Router address set in hook for FeeContract deployments");

  // Set founder wallet (optional)
  const setFounderTx = await hook.setFounderWallet(FEE_ADDRESS);
  await setFounderTx.wait();
  console.log("✅ Founder wallet set");

  console.log("\n=== Step 8: Save Deployment Info ===");
  const deploymentInfo = {
    protocol: "Rarity Town Protocol",
    network: hre.network.name,
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
      router: ROUTER,
      feeAddress: FEE_ADDRESS,
      launchFee: "0.01 ETH",
      publicLaunches: true,
      collectionOwnerLaunches: true,
      tradingEnabled: true,
    },
    notes: {
      feeContracts: "FeeContracts are deployed automatically by NFTStrategyHook when needed",
      nftStrategies: "NFTStrategy tokens are deployed by NFTStrategyFactory.launchNFTStrategy()",
      manualMode: "Hook is in manual mode - FeeContracts must be manually deployed using deployNewFeeContract()",
      feeDistribution: "15% total fee: 14% to FeeContract, 1% to founder wallet"
    }
  };

  const filename = `deployment-rarity-town-${hre.network.name}-${Date.now()}.json`;
  const filepath = path.join(__dirname, "..", filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log("📄 Deployment info saved to:", filename);

  console.log("\n=== Step 9: Deploy SimpleSeller (Testing Helper) ===");
  
  // Deploy SimpleSeller for testing NFT purchases
  const SimpleSeller = await ethers.getContractFactory("SimpleSeller");
  
  // We'll create a seller for token ID 1 with price 0.1 ETH
  const testTokenId = 1;
  const testPrice = ethers.parseEther("0.1");
  
  console.log("⏳ Deploying SimpleSeller for testing...");
  const simpleSeller = await SimpleSeller.deploy(
    nftCollectionAddress,
    deployer.address, // Seller is the deployer
    ethers.ZeroAddress, // Strategy address (will be set after NFTStrategy deployment)
    testTokenId,
    testPrice,
    {
      gasLimit: 1_500_000,
      gasPrice: feeData.gasPrice || undefined
    }
  );
  await simpleSeller.waitForDeployment();
  const simpleSellerAddress = await simpleSeller.getAddress();
  console.log("✅ SimpleSeller deployed to:", simpleSellerAddress);

  console.log("\n🎉 === Deployment Summary ===");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│                   RARITY TOWN PROTOCOL                     │");
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log("│ Core Contracts:                                             │");
  console.log("│  🎣 NFTStrategyHook     :", actualHookAddress.padEnd(20), "│");
  console.log("│  🏭 NFTStrategyFactory  :", factoryAddress.padEnd(20), "│");
  console.log("│  🪙 RestrictedToken     :", restrictedTokenAddress.padEnd(20), "│");
  console.log("│  ⛏️  HookMiner           :", hookMinerAddress.padEnd(20), "│");
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log("│ Testing Contracts:                                          │");
  console.log("│  🖼️ FakeNFTCollection   :", nftCollectionAddress.padEnd(20), "│");
  console.log("│  💰 SimpleSeller        :", simpleSellerAddress.padEnd(20), "│");
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log("│ Configuration:                                              │");
  console.log("│  • Public Launches: ENABLED                                │");
  console.log("│  • Collection Owner Launches: ENABLED                      │");
  console.log("│  • Launch Fee: 0.01 ETH                                     │");
  console.log("│  • Hook Mode: MANUAL (Admin controlled FeeContracts)       │");
  console.log("│  • Fee Structure: 15% (14% vault + 1% founder)             │");
  console.log("└─────────────────────────────────────────────────────────────┘");

  console.log("\n📋 Next Steps:");
  console.log("1️⃣ Launch your first RARITY token:");
  console.log(`   factory.launchNFTStrategy("${nftCollectionAddress}", "Collection RARITY", "COLL")`);
  console.log("");
  console.log("2️⃣ Deploy FeeContract for the RARITY token:");
  console.log("   hook.deployNewFeeContract(rarityTokenAddress)");
  console.log("");
  console.log("3️⃣ Test NFT trading:");
  console.log("   feeContract.buyTargetNFT(value, data, tokenId, sellerAddress)");
  console.log("");
  console.log("4️⃣ Monitor and rotate FeeContracts when full (5 NFTs):");
  console.log("   hook.isActiveFeeContractFull(rarityTokenAddress)");
  console.log("   hook.forceRotateFeeContract(rarityTokenAddress)");

  console.log("\n🔗 Verification Commands:");
  console.log("npx hardhat verify", restrictedTokenAddress, "--network", hre.network.name);
  console.log("npx hardhat verify", factoryAddress, POSITION_MANAGER, PERMIT2, POOL_MANAGER, UNIVERSAL_ROUTER, ROUTER, FEE_ADDRESS, restrictedTokenAddress, ethers.ZeroAddress, "--network", hre.network.name);
  console.log("npx hardhat verify", hookMinerAddress, POOL_MANAGER, FEE_ADDRESS, "--network", hre.network.name);

  console.log("\n✨ Rarity Town Protocol deployment completed successfully!");
  console.log("🚀 Ready to create RARITY tokens for NFT collections!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });