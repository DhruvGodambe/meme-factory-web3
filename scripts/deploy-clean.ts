import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

async function safeDelay(ms = 1500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();

  console.log(`\n🚀 Deploying with account: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const networkName =
    chainId === 8453 || chainId === 84532
      ? "base"
      : chainId === 11155111
      ? "sepolia"
      : "polygon";
  console.log(`🌐 Network: ${networkName} (${chainId})`);

  const feeData = await ethers.provider.getFeeData();
  const gasBump = 3;
  const maxFeePerGas =
    feeData.maxFeePerGas
      ? BigInt(Math.floor(Number(feeData.maxFeePerGas) * gasBump))
      : BigInt(20_000_000_000);
  const maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas
      ? BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * gasBump))
      : BigInt(2_000_000_000);

  const txOpts = {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit: 12_000_000,
  };

  console.log(`\n⛽ Gas config:
  MaxFee: ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei
  PriorityFee: ${ethers.formatUnits(maxPriorityFeePerGas, "gwei")} gwei`);

  // --- addresses ---
  const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
  const POSITION_MANAGER = "0x7c5f5a4bbd8fd63184577525326123b519429bdc";
  const UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
  const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const FEE_ADDRESS = deployer.address;
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";

  // --- Deploy helpers ---
  let currentNonce = await ethers.provider.getTransactionCount(
    deployer.address,
    "latest"
  );
  async function deployContract(name: string, args: any[] = [], gas = 12_000_000) {
    console.log(`\n=== Deploying ${name} ===`);
    const start = Date.now();
    const Factory = await ethers.getContractFactory(name);
    const instance = await Factory.deploy(...args, {
      ...txOpts,
      gasLimit: gas,
      nonce: currentNonce++,
    });
    await instance.waitForDeployment();
    const addr = await instance.getAddress();
    console.log(
      `✅ ${name} deployed at ${addr} (⏱ ${(Date.now() - start) / 1000}s)`
    );
    return addr;
  }

  // --- STEP 1: RestrictedToken ---
  const restrictedTokenAddress = await deployContract("RestrictedToken");
  await safeDelay();

  // --- STEP 2: OpenSeaNFTBuyer ---
  const openSeaBuyerAddress = await deployContract("OpenSeaNFTBuyer");
  await safeDelay();

  // --- STEP 3: FakeNFTCollection ---
  const nftCollectionAddress = await deployContract("FakeNFTCollection", [
    "Test NFT Collection",
    "TEST",
    "https://api.example.com/metadata/",
  ]);
  await safeDelay();

  // --- STEP 4: NFTStrategyHookMiner ---
  const hookMinerAddress = await deployContract("NFTStrategyHookMiner", [
    POOL_MANAGER,
    FEE_ADDRESS,
  ]);
  await safeDelay();

  // --- STEP 5: NFTStrategyFactory ---
  const factoryAddress = await deployContract(
    "NFTStrategyFactory",
    [
      POSITION_MANAGER,
      PERMIT2,
      POOL_MANAGER,
      UNIVERSAL_ROUTER,
      ROUTER,
      FEE_ADDRESS,
      restrictedTokenAddress,
      ethers.ZeroAddress,
    ],
    12_000_000
  );
  await safeDelay();

  // --- STEP 6: Salt compute + store + CREATE2 deploy ---
  console.log("\n=== Salt Simulation + Hook Deployment ===");
  const hookMiner = await ethers.getContractAt(
    "NFTStrategyHookMiner",
    hookMinerAddress
  );

  const [existingHook, existingSalt, isMined] = await hookMiner.getMinedData();
  let finalHookAddr: string, finalSalt: string;

  if (isMined && existingHook !== ethers.ZeroAddress) {
    console.log("ℹ️ Salt already mined on-chain");
    finalHookAddr = existingHook;
    finalSalt = existingSalt;
  } else {
    console.log("🧮 Simulating salt...");
    const [predictedHook, predictedSalt] = await (hookMiner as any).simulateSalt(
      restrictedTokenAddress,
      factoryAddress,
      FEE_ADDRESS
    );
    console.log(`   Predicted Hook: ${predictedHook}`);
    console.log(`   Predicted Salt: ${predictedSalt}`);

    console.log("💾 Storing salt...");
    const storeSaltTx = await hookMiner.storeSalt(predictedHook, predictedSalt, {
      ...txOpts,
      gasLimit: 10_000_000,
    });
    const storeReceipt = await storeSaltTx.wait();
    console.log(
      `✅ Salt stored (gasUsed: ${storeReceipt?.gasUsed.toString() || 'unknown'})`
    );

    const [hook, salt] = await hookMiner.getMinedData();
    finalHookAddr = hook;
    finalSalt = salt;
  }

  // Safety check before CREATE2
  console.log("\n🧪 Dry-running CREATE2 deployment (staticCall)...");
  try {
    await hookMiner.deployHook.staticCall(
      restrictedTokenAddress,
      factoryAddress,
      FEE_ADDRESS
    );
    console.log("✅ CREATE2 dry-run success, ready to deploy");
  } catch (err: any) {
    console.error("❌ CREATE2 dry-run reverted:", err.message);
    console.error(
      "⚠️ Check if Hook bytecode, constructor args, or salt mismatch"
    );
    process.exit(1);
  }

  console.log("🚀 Deploying Hook via CREATE2...");
  const deployHookTx = await hookMiner.deployHook(
    restrictedTokenAddress,
    factoryAddress,
    FEE_ADDRESS,
    { ...txOpts, gasLimit: 10_000_000 }
  );
  const deployReceipt = await deployHookTx.wait();
  console.log(`✅ Hook deployed (gasUsed: ${deployReceipt?.gasUsed.toString() || 'unknown'})`);

  const actualHookAddr = await hookMiner.getHook();
  console.log(`📦 Hook deployed at: ${actualHookAddr}`);

  // --- STEP 7: Configure Factory + Token ---
  console.log("\n=== ⚙️ Configuring Factory & Token (High Gas Mode) ===");
const factory = await ethers.getContractAt("NFTStrategyFactory", factoryAddress);
const restrictedToken = await ethers.getContractAt("RestrictedToken", restrictedTokenAddress);

// 🔥 Use higher gas for sensitive configuration txs
const highGas = {
  ...txOpts,
  gasLimit: 10_000_000, // increase limit for safety
  maxFeePerGas: txOpts.maxFeePerGas * BigInt(2), // 2x bump
  maxPriorityFeePerGas: txOpts.maxPriorityFeePerGas * BigInt(2),
};

console.log(
  `Using boosted gas → maxFee: ${ethers.formatUnits(highGas.maxFeePerGas, "gwei")} gwei, ` +
  `priority: ${ethers.formatUnits(highGas.maxPriorityFeePerGas, "gwei")} gwei`
);

// ✅ Factory configuration transactions
const factoryTxs = [
  factory.updateHookAddress(actualHookAddr, highGas),
  factory.setRestrictedTokenHookAddress(actualHookAddr, highGas),
  factory.updateFeeToLaunch(ethers.parseEther("0.00002"), highGas),
  factory.setPublicLaunches(true, highGas),
  factory.setCollectionOwnerLaunches(true, highGas),
];

for (const txPromise of factoryTxs) {
  const tx = await txPromise;
  console.log(`⏳ Sent tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`✅ Factory config step confirmed (${receipt?.gasUsed.toString()} gas)`);
  await new Promise(res => setTimeout(res, 2000)); // short delay for nonce spacing
}
console.log("✅ Factory fully configured");

// ✅ RestrictedToken configuration transactions
const tokenTxs = [
  restrictedToken.setPoolManager(POOL_MANAGER, highGas),
  restrictedToken.setHook(actualHookAddr, highGas),
  restrictedToken.setSwapRouter(UNIVERSAL_ROUTER, highGas),
  restrictedToken.setTradingEnabled(true, highGas),
];

for (const txPromise of tokenTxs) {
  const tx = await txPromise;
  console.log(`⏳ Sent token tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`✅ Token config step confirmed (${receipt?.gasUsed.toString() || 'unknown'} gas)`);
  await new Promise(res => setTimeout(res, 2000)); // slight delay
}
console.log("✅ RestrictedToken fully configured");

  // --- STEP 8: Configure Hook (Optional) ---
  console.log("\n=== ⚙️ Configuring Hook (Optional) ===");
  const hook = await ethers.getContractAt("NFTStrategyHook", actualHookAddr);
  
  // Optional: Set router address for FeeContract deployments
  try {
    const setRouterTx = await hook.setRouterAddress(ROUTER, highGas);
    await setRouterTx.wait();
    console.log("✅ Router address set in hook");
    await safeDelay();
  } catch (err: any) {
    console.log("⚠️ Could not set router address:", err.message);
  }

  // Optional: Set OpenSea buyer address
  try {
    const setOpenSeaTx = await hook.setOpenSeaBuyer(openSeaBuyerAddress, highGas);
    await setOpenSeaTx.wait();
    console.log("✅ OpenSea buyer address set in hook");
    await safeDelay();
  } catch (err: any) {
    console.log("⚠️ Could not set OpenSea buyer:", err.message);
  }

  // Note: Both founderWallet1 and founderWallet2 are already set to FEE_ADDRESS (deployer.address) in constructor
  // If you want to set different addresses, uncomment and modify:
  // const FOUNDER_WALLET_1 = "0x..."; // 0.25% recipient
  // const FOUNDER_WALLET_2 = "0x..."; // 0.75% recipient
  // await hook.setFounderWallet1(FOUNDER_WALLET_1, highGas);
  // await hook.setFounderWallet2(FOUNDER_WALLET_2, highGas);
  // console.log("✅ Founder wallets configured");

  // --- Save deployment ---
  const deployment = {
    network: networkName,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      NFTStrategyFactory: factoryAddress,
      NFTStrategyHookMiner: hookMinerAddress,
      NFTStrategyHook: actualHookAddr,
      RestrictedToken: restrictedTokenAddress,
      OpenSeaNFTBuyer: openSeaBuyerAddress,
      FakeNFTCollection: nftCollectionAddress,
      minedHook: finalHookAddr,
      minedSalt: finalSalt,
    },
  };

  const filename = `deployment-${networkName}-${Date.now()}.json`;
  fs.writeFileSync(path.join(__dirname, "..", filename), JSON.stringify(deployment, null, 2));
  console.log(`\n💾 Deployment saved: ${filename}`);

  console.log("\n🎉 Deployment complete! All contracts successfully deployed.\n");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
