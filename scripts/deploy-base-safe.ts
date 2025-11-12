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

  // Check and reset nonce if needed
  const currentNonce = await ethers.provider.getTransactionCount(deployer.address, 'pending');
  const confirmedNonce = await ethers.provider.getTransactionCount(deployer.address, 'latest');
  console.log(`📊 Current nonce - Latest: ${confirmedNonce}, Pending: ${currentNonce}`);
  
  if (currentNonce > confirmedNonce) {
    console.log(`⚠️  Found ${currentNonce - confirmedNonce} pending transaction(s)`);
    console.log("💡 Waiting for pending transactions to clear...");
    // Wait for pending transactions
    await new Promise(resolve => setTimeout(resolve, 30000));
  }

  // --- CONFIG ---
  const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
  const POSITION_MANAGER = "0x7c5f5a4bbd8fd63184577525326123b519429bdc";
  const UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
  const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const FEE_ADDRESS = "0xF93E7518F79C2E1978D6862Dbf161270040e623E";
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";

  // Helper function for safe deployment with proper nonce handling
  async function safeDeployment(deploymentName: string, deploymentFunc: () => Promise<any>) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        console.log(`\n=== Step: Deploy ${deploymentName} ===`);
        if (attempts > 0) {
          console.log(`🔄 Retry attempt ${attempts + 1}/${maxAttempts}`);
          // Wait longer on retries
          await new Promise(resolve => setTimeout(resolve, 10000 + attempts * 5000));
        }
        
        const result = await deploymentFunc();
        console.log(`✅ ${deploymentName} deployed successfully`);
        
        // Wait between deployments to avoid nonce conflicts
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        return result;
      } catch (error: any) {
        attempts++;
        console.log(`❌ ${deploymentName} deployment failed (attempt ${attempts}):`, error.message);
        
        if (error.message.includes('already known')) {
          console.log("💡 Transaction already in mempool, waiting...");
          await new Promise(resolve => setTimeout(resolve, 20000));
        } else if (error.message.includes('nonce')) {
          console.log("💡 Nonce issue detected, waiting and refreshing...");
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
        
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to deploy ${deploymentName} after ${maxAttempts} attempts: ${error.message}`);
        }
      }
    }
  }

  // --- Step 1: RestrictedToken ---
  const restrictedToken = await safeDeployment("RestrictedToken", async () => {
    const RestrictedToken = await ethers.getContractFactory("RestrictedToken");
    const nonce = await ethers.provider.getTransactionCount(deployer.address, 'latest');
    const contract = await RestrictedToken.deploy({ nonce });
    await contract.waitForDeployment();
    return contract;
  });
  const restrictedTokenAddress = await restrictedToken.getAddress();
  console.log("✅ RestrictedToken address:", restrictedTokenAddress);

  // --- Step 2: OpenSeaNFTBuyer ---
  const openSeaBuyer = await safeDeployment("OpenSeaNFTBuyer", async () => {
    const OpenSeaNFTBuyer = await ethers.getContractFactory("OpenSeaNFTBuyer");
    const nonce = await ethers.provider.getTransactionCount(deployer.address, 'latest');
    const contract = await OpenSeaNFTBuyer.deploy({ nonce });
    await contract.waitForDeployment();
    return contract;
  });
  const openSeaBuyerAddress = await openSeaBuyer.getAddress();
  console.log("✅ OpenSeaNFTBuyer address:", openSeaBuyerAddress);

  // --- Step 3: FakeNFTCollection ---
  const nftCollection = await safeDeployment("FakeNFTCollection", async () => {
    const FakeNFTCollection = await ethers.getContractFactory("FakeNFTCollection");
    const nonce = await ethers.provider.getTransactionCount(deployer.address, 'latest');
    const contract = await FakeNFTCollection.deploy(
      "Test NFT Collection",
      "TEST",
      "https://api.example.com/metadata/",
      { nonce }
    );
    await contract.waitForDeployment();
    return contract;
  });
  const nftCollectionAddress = await nftCollection.getAddress();
  console.log("✅ FakeNFTCollection address:", nftCollectionAddress);

  // --- Step 4: HookMiner ---
  const hookMiner = await safeDeployment("NFTStrategyHookMiner", async () => {
    const NFTStrategyHookMiner = await ethers.getContractFactory("NFTStrategyHookMiner");
    const nonce = await ethers.provider.getTransactionCount(deployer.address, 'latest');
    const contract = await NFTStrategyHookMiner.deploy(POOL_MANAGER, FEE_ADDRESS, { nonce });
    await contract.waitForDeployment();
    return contract;
  });
  const hookMinerAddress = await hookMiner.getAddress();
  console.log("✅ HookMiner address:", hookMinerAddress);

  // --- Step 5: Factory ---
  const factory = await safeDeployment("NFTStrategyFactory", async () => {
    const NFTStrategyFactory = await ethers.getContractFactory("NFTStrategyFactory");
    const nonce = await ethers.provider.getTransactionCount(deployer.address, 'latest');
    const contract = await NFTStrategyFactory.deploy(
      POSITION_MANAGER,
      PERMIT2,
      POOL_MANAGER,
      UNIVERSAL_ROUTER,
      ROUTER,
      FEE_ADDRESS,
      restrictedTokenAddress,
      ethers.ZeroAddress,
      { nonce }
    );
    await contract.waitForDeployment();
    return contract;
  });
  const factoryAddress = await factory.getAddress();
  console.log("✅ Factory address:", factoryAddress);

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
    network: chainId === 11155111 ? "sepolia" : chainId === 8453 || chainId === 84532 ? "base" : "polygon",
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

  const networkName = chainId === 11155111 ? "sepolia" : chainId === 8453 || chainId === 84532 ? "base" : "polygon";
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