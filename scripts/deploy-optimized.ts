import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");

  const minRequiredBalance = ethers.parseEther("0.1");
  if (balance < minRequiredBalance) {
    console.log("⚠️  Low balance — recommended minimum:", ethers.formatEther(minRequiredBalance), "ETH");
  }

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`🌐 Chain ID: ${chainId}`);

  const isBase = chainId === 8453 || chainId === 84532;
  console.log(isBase ? "🔵 Base network detected" : "🟣 Polygon network detected");

  // Check current nonce and clear any pending transactions if needed
  let currentNonce = await ethers.provider.getTransactionCount(deployer.address, 'pending');
  const confirmedNonce = await ethers.provider.getTransactionCount(deployer.address, 'latest');
  console.log(`📊 Nonce info - Latest: ${confirmedNonce}, Pending: ${currentNonce}`);
  
  if (currentNonce > confirmedNonce) {
    console.log(`⚠️  Found ${currentNonce - confirmedNonce} pending transaction(s). Waiting for confirmation...`);
    console.log("💡 You can also reset nonce manually or wait for transactions to confirm");
    
    // Wait for pending transactions to confirm or fail
    let attempts = 0;
    while (currentNonce > confirmedNonce && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
      currentNonce = await ethers.provider.getTransactionCount(deployer.address, 'pending');
      const newConfirmedNonce = await ethers.provider.getTransactionCount(deployer.address, 'latest');
      console.log(`📊 Nonce check ${attempts + 1} - Latest: ${newConfirmedNonce}, Pending: ${currentNonce}`);
      attempts++;
    }
  }

  // Helper function to deploy with retry and nonce management
  async function deployWithRetry(
    contractName: string,
    factory: any,
    args: any[] = [],
    maxRetries = 3
  ): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 ${contractName} deployment attempt ${attempt}/${maxRetries}...`);
        
        // Get fresh nonce for each attempt
        const nonce = await ethers.provider.getTransactionCount(deployer.address, 'pending');
        
        const contract = await factory.deploy(...args, {
          nonce: nonce,
          gasLimit: 8000000, // High gas limit for complex contracts
        });
        
        await contract.waitForDeployment();
        return contract;
      } catch (error: any) {
        console.log(`❌ Attempt ${attempt} failed:`, error.message);
        
        if (error.message.includes('already known') || error.message.includes('nonce')) {
          console.log("💡 Nonce conflict detected, waiting and retrying...");
          await new Promise(resolve => setTimeout(resolve, 15000)); // Wait 15 seconds
        } else if (attempt === maxRetries) {
          throw error;
        } else {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
    throw new Error(`Failed to deploy ${contractName} after ${maxRetries} attempts`);
  }

  // --- CONFIG ---
  const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
  const POSITION_MANAGER = "0x7c5f5a4bbd8fd63184577525326123b519429bdc";
  const UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
  const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const FEE_ADDRESS = "0xF93E7518F79C2E1978D6862Dbf161270040e623E";
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";

  // --- Step 1: RestrictedToken ---
  console.log("\n=== Step 1: Deploy RestrictedToken ===");
  const RestrictedToken = await ethers.getContractFactory("RestrictedToken");
  const restrictedToken = await deployWithRetry("RestrictedToken", RestrictedToken);
  const restrictedTokenAddress = await restrictedToken.getAddress();
  console.log("✅ RestrictedToken deployed at:", restrictedTokenAddress);

  // --- Step 2: OpenSeaNFTBuyer ---
  console.log("\n=== Step 2: Deploy OpenSeaNFTBuyer ===");
  const OpenSeaNFTBuyer = await ethers.getContractFactory("OpenSeaNFTBuyer");
  const openSeaBuyer = await deployWithRetry("OpenSeaNFTBuyer", OpenSeaNFTBuyer);
  const openSeaBuyerAddress = await openSeaBuyer.getAddress();
  console.log("✅ OpenSeaNFTBuyer deployed at:", openSeaBuyerAddress);

  // --- Step 3: FakeNFTCollection ---
  console.log("\n=== Step 3: Deploy FakeNFTCollection ===");
  const FakeNFTCollection = await ethers.getContractFactory("FakeNFTCollection");
  const nftCollection = await deployWithRetry("FakeNFTCollection", FakeNFTCollection, [
    "Test NFT Collection",
    "TEST",
    "https://api.example.com/metadata/"
  ]);
  const nftCollectionAddress = await nftCollection.getAddress();
  console.log("✅ FakeNFTCollection deployed at:", nftCollectionAddress);

  // --- Step 4: HookMiner ---
  console.log("\n=== Step 4: Deploy NFTStrategyHookMiner ===");
  const NFTStrategyHookMiner = await ethers.getContractFactory("NFTStrategyHookMiner");
  const hookMiner = await deployWithRetry("NFTStrategyHookMiner", NFTStrategyHookMiner, [POOL_MANAGER, FEE_ADDRESS]);
  const hookMinerAddress = await hookMiner.getAddress();
  console.log("✅ HookMiner deployed at:", hookMinerAddress);

  // --- Step 5: Factory ---
  console.log("\n=== Step 5: Deploy NFTStrategyFactory ===");
  const NFTStrategyFactory = await ethers.getContractFactory("NFTStrategyFactory");
  const factory = await deployWithRetry("NFTStrategyFactory", NFTStrategyFactory, [
    POSITION_MANAGER,
    PERMIT2,
    POOL_MANAGER,
    UNIVERSAL_ROUTER,
    ROUTER,
    FEE_ADDRESS,
    restrictedTokenAddress,
    ethers.ZeroAddress
  ]);
  const factoryAddress = await factory.getAddress();
  console.log("✅ Factory deployed at:", factoryAddress);

  // --- Step 6: Optimized Salt Storage ---
  console.log("\n=== Step 6: Use Pre-Computed Salt ===");
  const [existingHookAddress, existingSalt, isMined] = await hookMiner.getMinedData();
  let finalMinedHookAddress: string, finalMinedSalt: string;

  if (isMined) {
    console.log("✅ Salt already stored on-chain");
    finalMinedHookAddress = existingHookAddress;
    finalMinedSalt = existingSalt;
  } else {
    console.log("🧮 Getting pre-computed salt from simulateSalt...");
    const [predictedHookAddress, predictedSalt] = await (hookMiner as any).simulateSalt(
      restrictedTokenAddress,
      factoryAddress,
      FEE_ADDRESS
    );
    console.log("   Predicted Hook Address:", predictedHookAddress);
    console.log("   Predicted Salt:", predictedSalt);

    // Use the new storeSalt function instead of expensive mineSalt
    console.log("💾 Storing pre-computed salt on-chain...");
    const storeSaltTx = await (hookMiner as any).storeSalt(
      predictedHookAddress,
      predictedSalt
    );
    await storeSaltTx.wait();
    console.log("✅ Salt stored successfully!");

    const [hookAddr, salt] = await hookMiner.getMinedData();
    finalMinedHookAddress = hookAddr;
    finalMinedSalt = salt;
  }

  console.log("📦 Final Hook Address:", finalMinedHookAddress);
  console.log("📦 Final Salt:", finalMinedSalt);

  // --- Step 7: Deploy Hook with CREATE2 ---
  console.log("\n=== Step 7: Deploy Hook with CREATE2 ===");
  const deployHookTx = await hookMiner.deployHook(
    restrictedTokenAddress,
    factoryAddress,
    FEE_ADDRESS
  );
  const deployReceipt = await deployHookTx.wait();
  if (deployReceipt) {
    console.log("   Gas used:", deployReceipt.gasUsed.toString());
  }
  
  const actualHookAddress = await hookMiner.getHook();
  console.log("✅ Hook deployed at:", actualHookAddress);

  if (actualHookAddress.toLowerCase() !== finalMinedHookAddress.toLowerCase()) {
    throw new Error("❌ Hook address mismatch!");
  }

  // --- Step 8: Configure Hook with OpenSeaBuyer ---
  console.log("\n=== Step 8: Configure Hook with OpenSeaBuyer ===");
  
  try {
    const setOpenSeaTx = await deployer.sendTransaction({
      to: actualHookAddress,
      data: ethers.id("setOpenSeaBuyer(address)").slice(0, 10) + 
            ethers.zeroPadValue(openSeaBuyerAddress, 32).slice(2),
      gasLimit: 100000
    });
    await setOpenSeaTx.wait();
    console.log("✅ OpenSeaBuyer address set in Hook:", openSeaBuyerAddress);
  } catch (error: any) {
    console.log("⚠️  OpenSeaBuyer configuration failed - will need manual setup");
    console.log("Error:", error.message);
  }

  // Configure router address in hook
  try {
    console.log("⏳ Setting router address in hook...");
    const setRouterTx = await deployer.sendTransaction({
      to: actualHookAddress,
      data: ethers.id("setRouterAddress(address)").slice(0, 10) + 
            ethers.zeroPadValue(ROUTER, 32).slice(2),
      gasLimit: 100000
    });
    await setRouterTx.wait();
    console.log("✅ Router address set in Hook:", ROUTER);
  } catch (error: any) {
    console.log("⚠️  Router address configuration failed");
  }

  // --- Step 9: Configure Factory ---
  console.log("\n=== Step 9: Configure Factory ===");
  
  const setRestrictedHookTx = await factory.setRestrictedTokenHookAddress(actualHookAddress);
  await setRestrictedHookTx.wait();
  console.log("✅ Restricted token hook address set");

  const setHookTx = await factory.updateHookAddress(actualHookAddress);
  await setHookTx.wait();
  console.log("✅ Hook address set in factory");

  const setFeeTx = await factory.updateFeeToLaunch(ethers.parseEther("0.00002"));
  await setFeeTx.wait();
  console.log("✅ Fee to launch set");

  const setPublicTx = await factory.setPublicLaunches(true);
  await setPublicTx.wait();
  console.log("✅ Public launches enabled");

  const setCollectionOwnerTx = await factory.setCollectionOwnerLaunches(true);
  await setCollectionOwnerTx.wait();
  console.log("✅ Collection owner launches enabled");

  // --- Step 10: Configure RestrictedToken ---
  console.log("\n=== Step 10: Configure RestrictedToken ===");
  const setPoolManagerTx = await restrictedToken.setPoolManager(POOL_MANAGER);
  await setPoolManagerTx.wait();
  console.log("✅ PoolManager set in RestrictedToken");

  const setHookTx2 = await restrictedToken.setHook(actualHookAddress);
  await setHookTx2.wait();
  console.log("✅ Hook set in RestrictedToken");

  const setRouterTx = await restrictedToken.setSwapRouter(UNIVERSAL_ROUTER);
  await setRouterTx.wait();
  console.log("✅ Router set in RestrictedToken");

  const enableTradingTx = await restrictedToken.setTradingEnabled(true);
  await enableTradingTx.wait();
  console.log("✅ Trading enabled for RestrictedToken");

  // --- Step 11: Save Deployment Info ---
  console.log("\n=== Step 11: Save Deployment Info ===");
  const deploymentInfo = {
    network: chainId === 11155111 ? "sepolia" : "polygon",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      NFTStrategyHookMiner: hookMinerAddress,
      NFTStrategyHook: actualHookAddress,
      NFTStrategyFactory: factoryAddress,
      RestrictedToken: restrictedTokenAddress,
      FakeNFTCollection: nftCollectionAddress,
      OpenSeaNFTBuyer: openSeaBuyerAddress,
      minedHookAddress: finalMinedHookAddress,
      minedSalt: finalMinedSalt,
    },
    config: {
      poolManager: POOL_MANAGER,
      positionManager: POSITION_MANAGER,
      universalRouter: UNIVERSAL_ROUTER,
      permit2: PERMIT2,
      router: ROUTER,
      feeAddress: FEE_ADDRESS,
      restrictedTokenAddress: restrictedTokenAddress,
      restrictedTokenHookAddress: actualHookAddress,
    }
  };

  const networkName = chainId === 11155111 ? "sepolia" : "polygon";
  const filename = `deployment-${networkName}-${Date.now()}.json`;
  const filepath = path.join(__dirname, "..", filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n✅ Deployment info saved to:", filename);

  console.log("\n=== 🎉 Deployment Summary ===");
  console.log("✓ NFTStrategyHookMiner:", hookMinerAddress);
  console.log("✓ NFTStrategyHook:", actualHookAddress);
  console.log("✓ NFTStrategyFactory:", factoryAddress);
  console.log("✓ RestrictedToken:", restrictedTokenAddress);
  console.log("✓ FakeNFTCollection:", nftCollectionAddress);
  console.log("✓ OpenSeaNFTBuyer:", openSeaBuyerAddress);
  console.log("✓ Mined Salt:", finalMinedSalt);
  
  console.log("\n📋 Configuration:");
  console.log("  - Public Launches: ENABLED");
  console.log("  - Collection Owner Launches: ENABLED");
  console.log("  - Launch Fee: 0.00002 ETH");
  console.log("  - Hook Address:", actualHookAddress);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exit(1);
});