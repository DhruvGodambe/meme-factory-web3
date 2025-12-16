import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { wireHookAndVerify } from "./wire-hook-and-verify";
import constants from "./constants.json";

/**
 * Minimal deployment script to:
 * - (Optionally) deploy NFTStrategyHookMiner if you don't have one yet
 * - Mine/store salt
 * - Deploy the updated NFTStrategyHook via CREATE2
 * - Wire the new hook into an existing NFTStrategyFactory + RestrictedToken
 *
 * NOTE:
 * - Fill in EXISTING_* addresses from your last deployment if you want to
 *   reuse factory / restricted token / buyer.
 * - If you prefer a completely clean deployment, use scripts/deploy-clean.ts instead.
 */

async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();

  console.log(`\n🚀 Using deployer: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

  const network = await ethers.provider.getNetwork();
  console.log(`🌐 Chain: ${network.name} (${network.chainId})`);

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

  // ---- EXISTING CORE ADDRESSES (FILL THESE IN) ----
  // PoolManager and Router are the same regardless of the hook change.
  const POOL_MANAGER = constants.base.POOL_MANAGER;
  const POSITION_MANAGER = constants.base.POSITION_MANAGER;
  const UNIVERSAL_ROUTER = constants.base.UNIVERSAL_ROUTER;
  const PERMIT2 = constants.base.PERMIT2;
  const ROUTER = constants.base.ROUTER;

  // If you already have these from a previous deployment, set them here;
  // otherwise leave as ZeroAddress to deploy fresh ones.
  let EXISTING_FACTORY = ethers.ZeroAddress;
  let EXISTING_RESTRICTED_TOKEN = ethers.ZeroAddress;
  let EXISTING_OPEN_SEA_BUYER = ethers.ZeroAddress;
  let EXISTING_HOOK_MINER = ethers.ZeroAddress;

  const FEE_ADDRESS = deployer.address;

  async function deployContract(name: string, args: any[] = [], gas = 12_000_000) {
    console.log(`\n=== Deploying ${name} ===`);
    const Factory = await ethers.getContractFactory(name);
    const instance = await Factory.deploy(...args, {
      ...txOpts,
      gasLimit: gas,
    });
    await instance.waitForDeployment();
    const addr = await instance.getAddress();
    console.log(`✅ ${name} deployed at ${addr}`);
    return addr;
  }

  // --- STEP 1: Ensure RestrictedToken, OpenSea buyer, Factory exist ---
  const restrictedTokenAddress =
    EXISTING_RESTRICTED_TOKEN !== ethers.ZeroAddress
      ? EXISTING_RESTRICTED_TOKEN
      : await deployContract("RestrictedToken");

  const openSeaBuyerAddress =
    EXISTING_OPEN_SEA_BUYER !== ethers.ZeroAddress
      ? EXISTING_OPEN_SEA_BUYER
      : await deployContract("OpenSeaNFTBuyer");

  // NFTStrategyFactory constructor (posm, permit2, poolManager, universalRouter, router, feeAddress, restrictedToken, restrictedTokenHook)
  const factoryArgs = [
    POSITION_MANAGER,
    PERMIT2,
    POOL_MANAGER,
    UNIVERSAL_ROUTER,
    ROUTER,
    FEE_ADDRESS,
    restrictedTokenAddress,
    ethers.ZeroAddress, // restrictedTokenHookAddress set after hook deployment
  ];

  const factoryAddress =
    EXISTING_FACTORY !== ethers.ZeroAddress
      ? EXISTING_FACTORY
      : await deployContract("NFTStrategyFactory", factoryArgs);

  // --- STEP 2: Ensure HookMiner exists ---
  // NFTStrategyHookMiner constructor (poolManager, treasury/feeAddress)
  const hookMinerArgs = [POOL_MANAGER, FEE_ADDRESS];

  // Helper to ensure a valid HookMiner address (has code and decodes ABI)
  async function ensureHookMiner(): Promise<string> {
    if (EXISTING_HOOK_MINER !== ethers.ZeroAddress) {
      const code = await ethers.provider.getCode(EXISTING_HOOK_MINER);
      if (code && code !== "0x") {
        return EXISTING_HOOK_MINER;
      }
      console.warn(
        `⚠️ EXISTING_HOOK_MINER has no code on-chain (${EXISTING_HOOK_MINER}); redeploying fresh miner.`
      );
    }
    return await deployContract("NFTStrategyHookMiner", hookMinerArgs);
  }

  let hookMinerAddress = await ensureHookMiner();
  let hookMiner = await ethers.getContractAt("NFTStrategyHookMiner", hookMinerAddress);

  // --- STEP 3: Mine/store salt and deploy new hook ---
  console.log("\n=== Salt Simulation + Hook Deployment ===");

  async function getMinedDataSafe() {
    try {
      return await hookMiner.getMinedData();
    } catch (err: any) {
      console.warn("⚠️ getMinedData() failed, redeploying fresh HookMiner...");
      hookMinerAddress = await deployContract("NFTStrategyHookMiner", hookMinerArgs);
      hookMiner = await ethers.getContractAt("NFTStrategyHookMiner", hookMinerAddress);
      return await hookMiner.getMinedData();
    }
  }

  const [existingHook, existingSalt, isMined] = await getMinedDataSafe();
  let finalHookAddr: string;
  let finalSalt: string;

  if (isMined && existingHook !== ethers.ZeroAddress) {
    console.log("ℹ️ Salt already mined on-chain, reusing mined values");
    finalHookAddr = existingHook;
    finalSalt = existingSalt;
  } else {
    console.log("🧮 Simulating salt for updated hook bytecode...");
    const [predictedHook, predictedSalt] = await (hookMiner as any).simulateSalt(
      restrictedTokenAddress,
      factoryAddress,
      FEE_ADDRESS
    );
    console.log(`   Predicted Hook: ${predictedHook}`);
    console.log(`   Predicted Salt: ${predictedSalt}`);

    console.log("💾 Storing salt on-chain...");
    const storeSaltTx = await hookMiner.storeSalt(predictedHook, predictedSalt, {
      ...txOpts,
      gasLimit: 10_000_000,
    });
    await storeSaltTx.wait();

    const [hookAddr, salt] = await hookMiner.getMinedData();
    finalHookAddr = hookAddr;
    finalSalt = salt;
    console.log(`✅ Salt stored. Hook: ${hookAddr}, salt: ${salt}`);
  }

  console.log("\n🧪 Dry-running CREATE2 deployment (staticCall)...");
  try {
    await hookMiner.deployHook.staticCall(
      restrictedTokenAddress,
      factoryAddress,
      FEE_ADDRESS
    );
    console.log("✅ CREATE2 dry-run success, ready to deploy hook");
  } catch (err: any) {
    console.error("❌ CREATE2 dry-run reverted:", err.message);
    console.error("⚠️ Check that NFTStrategyHook bytecode and constructor args match the miner config.");
    process.exit(1);
  }

  console.log("🚀 Deploying updated NFTStrategyHook via CREATE2...");
  const deployHookTx = await hookMiner.deployHook(
    restrictedTokenAddress,
    factoryAddress,
    FEE_ADDRESS,
    { ...txOpts, gasLimit: 10_000_000 }
  );
  const deployHookReceipt = await deployHookTx.wait();
  console.log(`✅ Hook deployed (gasUsed: ${deployHookReceipt?.gasUsed.toString() || "unknown"})`);

  const actualHookAddr = await hookMiner.getHook();
  console.log(`📦 New NFTStrategyHook deployed at: ${actualHookAddr}`);

  // --- STEP 4: Wire factory + restricted token to new hook ---
  console.log("\n=== ⚙️ Wiring Factory & RestrictedToken to new hook ===");
  // --- STEP 4: Delegate wiring & verification ---
  await wireHookAndVerify(
    {
      restrictedToken: restrictedTokenAddress,
      openSeaBuyer: openSeaBuyerAddress,
      factory: factoryAddress,
      hookMiner: hookMinerAddress,
      hook: actualHookAddr,
      poolManager: POOL_MANAGER,
      universalRouter: UNIVERSAL_ROUTER,
      router: ROUTER,
      positionManager: POSITION_MANAGER,
      permit2: PERMIT2,
      feeAddress: FEE_ADDRESS,
    },
    hre
  );

  console.log("\n🎉 Hook upgrade flow complete.\n");
}

main().catch((err) => {
  console.error("❌ deploy-updated-hook failed:", err);
  process.exit(1);
});



