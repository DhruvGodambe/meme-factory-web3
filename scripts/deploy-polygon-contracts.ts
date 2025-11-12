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

  // Basic balance safety check
  const minRequiredBalance = ethers.parseEther("0.1");
  if (balance < minRequiredBalance) {
    console.log("⚠️  Low balance — recommended minimum:", ethers.formatEther(minRequiredBalance), "ETH");
  }

  // Fetch gas fee data with retry
  let feeData: any;
  for (let i = 0; i < 3; i++) {
    try {
      feeData = await ethers.provider.getFeeData();
      break;
    } catch {
      console.log(`Retrying gas data fetch (${i + 1}/3)...`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!feeData) {
    feeData = {
      gasPrice: BigInt(20_000_000_000),
      maxFeePerGas: BigInt(30_000_000_000),
      maxPriorityFeePerGas: BigInt(2_000_000_000),
    };
  }

  console.log("⛽ Gas info:");
  console.log("   Gas price:", feeData.gasPrice?.toString());
  console.log("   Max fee per gas:", feeData.maxFeePerGas?.toString());
  console.log("   Max priority fee:", feeData.maxPriorityFeePerGas?.toString());

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`🌐 Chain ID: ${chainId}`);

  const isBase = chainId === 8453 || chainId === 84532;
  console.log(isBase ? "🔵 Base network detected" : "🟣 Polygon network detected");

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
  const restrictedToken = await RestrictedToken.deploy();
  await restrictedToken.waitForDeployment();
  const restrictedTokenAddress = await restrictedToken.getAddress();
  console.log("✅ RestrictedToken deployed at:", restrictedTokenAddress);

  // --- Step 2: OpenSeaNFTBuyer ---
  console.log("\n=== Step 2: Deploy OpenSeaNFTBuyer ===");
  const OpenSeaNFTBuyer = await ethers.getContractFactory("OpenSeaNFTBuyer");
  const openSeaBuyer = await OpenSeaNFTBuyer.deploy();
  await openSeaBuyer.waitForDeployment();
  const openSeaBuyerAddress = await openSeaBuyer.getAddress();
  console.log("✅ OpenSeaNFTBuyer deployed at:", openSeaBuyerAddress);

  // --- Step 3: FakeNFTCollection ---
  console.log("\n=== Step 3: Deploy FakeNFTCollection ===");
  const FakeNFTCollection = await ethers.getContractFactory("FakeNFTCollection");
  const nftCollection = await FakeNFTCollection.deploy(
    "Test NFT Collection",
    "TEST",
    "https://api.example.com/metadata/"
  );
  await nftCollection.waitForDeployment();
  const nftCollectionAddress = await nftCollection.getAddress();
  console.log("✅ FakeNFTCollection deployed at:", nftCollectionAddress);

  // --- Step 4: HookMiner ---
  console.log("\n=== Step 4: Deploy NFTStrategyHookMiner ===");
  const NFTStrategyHookMiner = await ethers.getContractFactory("NFTStrategyHookMiner");
  const hookMiner = await NFTStrategyHookMiner.deploy(POOL_MANAGER, FEE_ADDRESS);
  await hookMiner.waitForDeployment();
  const hookMinerAddress = await hookMiner.getAddress();
  console.log("✅ HookMiner deployed at:", hookMinerAddress);

  // --- Step 5: Factory ---
  console.log("\n=== Step 5: Deploy NFTStrategyFactory ===");
  const NFTStrategyFactory = await ethers.getContractFactory("NFTStrategyFactory");
  const factory = await NFTStrategyFactory.deploy(
    POSITION_MANAGER,
    PERMIT2,
    POOL_MANAGER,
    UNIVERSAL_ROUTER,
    ROUTER,
    FEE_ADDRESS,
    restrictedTokenAddress,
    ethers.ZeroAddress
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("✅ Factory deployed at:", factoryAddress);

  // --- Step 6: Salt Mining ---
  console.log("\n=== Step 6: Mine Salt for Hook ===");
  const [existingHookAddress, existingSalt, isMined] = await hookMiner.getMinedData();
  let finalMinedHookAddress: string, finalMinedSalt: string;

  if (isMined) {
    console.log("✅ Salt already mined");
    finalMinedHookAddress = existingHookAddress;
    finalMinedSalt = existingSalt;
  } else {
    console.log("🧮 Simulating salt...");
    const [predictedHookAddress, predictedSalt] = await hookMiner.simulateSalt(
      restrictedTokenAddress,
      factoryAddress,
      FEE_ADDRESS
    );
    console.log("   Predicted Hook Address:", predictedHookAddress);
    console.log("   Predicted Salt:", predictedSalt);

    console.log("⛏️  Mining salt on-chain...");
    // FIX: Properly call the contract method with await
    const mineSaltTx = await hookMiner.mineSalt(
      restrictedTokenAddress, 
      factoryAddress, 
      FEE_ADDRESS
    );
    const receipt = await mineSaltTx.wait();
    console.log("✅ Salt mined and recorded!");
    if (receipt) {
      console.log("   Gas used:", receipt.gasUsed.toString());
    }

    const [hookAddr, salt] = await hookMiner.getMinedData();
    finalMinedHookAddress = hookAddr;
    finalMinedSalt = salt;
  }

  console.log("📦 Final Mined Hook Address:", finalMinedHookAddress);
  console.log("📦 Final Mined Salt:", finalMinedSalt);

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

  // --- Step 8: Configure Hook ---
  console.log("\n=== Step 8: Configure Hook ===");
  
  // Get the deployed hook contract instance
  const NFTStrategyHook = await ethers.getContractFactory("NFTStrategyHook");
  const hook = NFTStrategyHook.attach(actualHookAddress) as any;
  
  try {
    const setBuyerTx = await hook.setOpenSeaBuyer(openSeaBuyerAddress);
    await setBuyerTx.wait();
    console.log("✅ OpenSeaBuyer configured");
  } catch (e) {
    console.log("⚠️  setOpenSeaBuyer failed:", e);
    console.log("   Manual call required");
  }

  try {
    const setRouterTx = await hook.setRouterAddress(ROUTER);
    await setRouterTx.wait();
    console.log("✅ Router address set");
  } catch (e) {
    console.log("⚠️  Router configuration failed:", e);
    console.log("   Manual call required");
  }

  // --- Step 9: Configure Factory ---
  console.log("\n=== Step 9: Configure Factory ===");
  await (await factory.setRestrictedTokenHookAddress(actualHookAddress)).wait();
  console.log("   ✓ Hook address set in factory");
  await (await factory.updateHookAddress(actualHookAddress)).wait();
  console.log("   ✓ Hook address updated");
  await (await factory.updateFeeToLaunch(ethers.parseEther("0.01"))).wait();
  console.log("   ✓ Launch fee set to 0.01 ETH");
  await (await factory.setPublicLaunches(true)).wait();
  console.log("   ✓ Public launches enabled");
  await (await factory.setCollectionOwnerLaunches(true)).wait();
  console.log("   ✓ Collection owner launches enabled");
  console.log("✅ Factory configured");

  // --- Step 10: Configure RestrictedToken ---
  console.log("\n=== Step 10: Configure RestrictedToken ===");
  await (await restrictedToken.setPoolManager(POOL_MANAGER)).wait();
  console.log("   ✓ Pool manager set");
  await (await restrictedToken.setHook(actualHookAddress)).wait();
  console.log("   ✓ Hook set");
  await (await restrictedToken.setSwapRouter(UNIVERSAL_ROUTER)).wait();
  console.log("   ✓ Swap router set");
  await (await restrictedToken.setTradingEnabled(true)).wait();
  console.log("   ✓ Trading enabled");
  console.log("✅ RestrictedToken fully configured");

  // --- Step 11: Save Deployment Info ---
  console.log("\n=== Step 11: Save Deployment Info ===");
  const deploymentInfo = {
    network: hre.network.name,
    chainId: chainId,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      RestrictedToken: restrictedTokenAddress,
      OpenSeaNFTBuyer: openSeaBuyerAddress,
      FakeNFTCollection: nftCollectionAddress,
      HookMiner: hookMinerAddress,
      NFTStrategyFactory: factoryAddress,
      NFTStrategyHook: actualHookAddress,
      minedHookAddress: finalMinedHookAddress,
      minedSalt: finalMinedSalt,
    },
    config: {
      POOL_MANAGER,
      POSITION_MANAGER,
      UNIVERSAL_ROUTER,
      PERMIT2,
      FEE_ADDRESS,
      ROUTER,
    },
  };

  const file = path.join(__dirname, `../deployment-${hre.network.name}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(deploymentInfo, null, 2));
  console.log("📝 Deployment data saved at:", file);

  // --- Step 12: Summary ---
  console.log("\n=== ✅ Deployment Complete ===");
  console.table({
    RestrictedToken: restrictedTokenAddress,
    OpenSeaBuyer: openSeaBuyerAddress,
    NFTCollection: nftCollectionAddress,
    HookMiner: hookMinerAddress,
    NFTStrategyFactory: factoryAddress,
    Hook: actualHookAddress,
  });
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exit(1);
});