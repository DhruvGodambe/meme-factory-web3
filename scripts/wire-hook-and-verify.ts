import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export type WiringConfig = {
  restrictedToken: string;
  openSeaBuyer: string;
  factory: string;
  hookMiner: string;
  hook: string;
  poolManager: string;
  universalRouter: string;
  router: string;
  positionManager: string;
  permit2: string;
  feeAddress: string;
};

/**
 * Wiring script to configure the deployed hook and verify contracts on Basescan.
 * Accepts configurable addresses so it can be invoked programmatically.
 */
export async function wireHookAndVerify(
  config: WiringConfig,
  hreParam?: HardhatRuntimeEnvironment
) {
  const hre: HardhatRuntimeEnvironment = hreParam ?? require("hardhat");
  const [deployer] = await ethers.getSigners();

  console.log(`\n🔌 Wiring with account: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`🌐 Chain: ${network.name} (${chainId})`);

  const getChecksumAddress = (addr: string): string => {
    try {
      return ethers.getAddress(addr.toLowerCase());
    } catch (e) {
      console.error(`Invalid address: ${addr}`, e);
      throw e;
    }
  };

  const RESTRICTED_TOKEN = getChecksumAddress(config.restrictedToken);
  const OPEN_SEA_BUYER = getChecksumAddress(config.openSeaBuyer);
  const FACTORY = getChecksumAddress(config.factory);
  const HOOK_MINER = getChecksumAddress(config.hookMiner);
  const HOOK = getChecksumAddress(config.hook);
  const POOL_MANAGER = getChecksumAddress(config.poolManager);
  const UNIVERSAL_ROUTER = getChecksumAddress(config.universalRouter);
  const ROUTER = getChecksumAddress(config.router);
  const POSITION_MANAGER = getChecksumAddress(config.positionManager);
  const PERMIT2 = getChecksumAddress(config.permit2);
  const FEE_ADDRESS = getChecksumAddress(config.feeAddress);

  console.log(`\n📋 Addresses (checksummed):
  Factory: ${FACTORY}
  Hook: ${HOOK}
  RestrictedToken: ${RESTRICTED_TOKEN}`);

  const feeData = await ethers.provider.getFeeData();
  const gasBump = 3;
  const maxFeePerGas = feeData.maxFeePerGas
    ? BigInt(Math.floor(Number(feeData.maxFeePerGas) * gasBump))
    : BigInt(20_000_000_000);
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
    ? BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * gasBump))
    : BigInt(2_000_000_000);

  const highGas = {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit: 10_000_000,
  };

  console.log(`\n⛽ Gas config:
  MaxFee: ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei
  PriorityFee: ${ethers.formatUnits(maxPriorityFeePerGas, "gwei")} gwei`);

  console.log("\n=== 🔌 Wiring Factory to Hook ===");
  const factory = await ethers.getContractAt("NFTStrategyFactory", FACTORY);

  try {
    const updateHookTx = await factory.updateHookAddress(HOOK, highGas);
    console.log(`⏳ Sent updateHookAddress tx: ${updateHookTx.hash}`);
    const receipt1 = await updateHookTx.wait();
    console.log(`✅ Factory hookAddress updated (gasUsed: ${receipt1?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to update factory hookAddress:", err.message);
  }

  try {
    const setRestrictedHookTx = await factory.setRestrictedTokenHookAddress(HOOK, highGas);
    console.log(`⏳ Sent setRestrictedTokenHookAddress tx: ${setRestrictedHookTx.hash}`);
    const receipt2 = await setRestrictedHookTx.wait();
    console.log(`✅ Factory restrictedTokenHookAddress updated (gasUsed: ${receipt2?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to set restrictedTokenHookAddress:", err.message);
  }

  try {
    const setPublicLaunchesTx = await factory.setPublicLaunches(true, highGas);
    console.log(`⏳ Sent setPublicLaunches tx: ${setPublicLaunchesTx.hash}`);
    const receiptPublic = await setPublicLaunchesTx.wait();
    console.log(`✅ Factory publicLaunches set to true (gasUsed: ${receiptPublic?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to set publicLaunches:", err.message);
  }

  try {
    const updateFeeTx = await factory.updateFeeToLaunch(20000000000000n, highGas);
    console.log(`⏳ Sent updateFeeToLaunch tx: ${updateFeeTx.hash}`);
    const receiptFee = await updateFeeTx.wait();
    console.log(`✅ Factory feeToLaunch set to 0.00002 ETH (gasUsed: ${receiptFee?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to set feeToLaunch:", err.message);
  }

  console.log("\n=== 🔌 Wiring RestrictedToken ===");
  const restrictedToken = await ethers.getContractAt("RestrictedToken", RESTRICTED_TOKEN);

  try {
    const setPoolManagerTx = await restrictedToken.setPoolManager(POOL_MANAGER, highGas);
    console.log(`⏳ Sent setPoolManager tx: ${setPoolManagerTx.hash}`);
    const receipt3 = await setPoolManagerTx.wait();
    console.log(`✅ RestrictedToken poolManager set (gasUsed: ${receipt3?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to set poolManager:", err.message);
  }

  try {
    const setHookTx = await restrictedToken.setHook(HOOK, highGas);
    console.log(`⏳ Sent setHook tx: ${setHookTx.hash}`);
    const receipt4 = await setHookTx.wait();
    console.log(`✅ RestrictedToken hook set (gasUsed: ${receipt4?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to set hook:", err.message);
  }

  try {
    const setRouterTx = await restrictedToken.setSwapRouter(UNIVERSAL_ROUTER, highGas);
    console.log(`⏳ Sent setSwapRouter tx: ${setRouterTx.hash}`);
    const receipt5 = await setRouterTx.wait();
    console.log(`✅ RestrictedToken swapRouter set (gasUsed: ${receipt5?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to set swapRouter:", err.message);
  }

  try {
    const enableTradingTx = await restrictedToken.setTradingEnabled(true, highGas);
    console.log(`⏳ Sent setTradingEnabled tx: ${enableTradingTx.hash}`);
    const receipt6 = await enableTradingTx.wait();
    console.log(`✅ RestrictedToken trading enabled (gasUsed: ${receipt6?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to enable trading:", err.message);
  }

  console.log("\n=== ⚙️ Configuring Hook ===");
  const hook = await ethers.getContractAt("NFTStrategyHook", HOOK);

  try {
    const setRouterTx = await hook.setRouterAddress(ROUTER, highGas);
    console.log(`⏳ Sent setRouterAddress tx: ${setRouterTx.hash}`);
    const receipt7 = await setRouterTx.wait();
    console.log(`✅ Hook routerAddress set (gasUsed: ${receipt7?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to set hook routerAddress:", err.message);
  }

  try {
    const setOpenSeaTx = await hook.setOpenSeaBuyer(OPEN_SEA_BUYER, highGas);
    console.log(`⏳ Sent setOpenSeaBuyer tx: ${setOpenSeaTx.hash}`);
    const receipt8 = await setOpenSeaTx.wait();
    console.log(`✅ Hook OpenSea buyer set (gasUsed: ${receipt8?.gasUsed.toString()})`);
    await new Promise((res) => setTimeout(res, 2000));
  } catch (err: any) {
    console.error("❌ Failed to set OpenSea buyer:", err.message);
  }

  console.log("\n=== 🔍 Verifying contracts on Basescan ===");
  const verifyContract = async (name: string, address: string, constructorArgs: any[] = []) => {
    try {
      console.log(`\n🔍 Verifying ${name} at ${address}...`);
      await hre.run("verify:verify", {
        address,
        constructorArguments: constructorArgs,
      });
      console.log(`✅ ${name} verified on Basescan`);
    } catch (err: any) {
      if (err.message.includes("Already Verified")) {
        console.log(`ℹ️ ${name} already verified`);
      } else {
        console.error(`❌ Failed to verify ${name}:`, err.message);
      }
    }
  };

  await verifyContract("RestrictedToken", RESTRICTED_TOKEN);
  await verifyContract("OpenSeaNFTBuyer", OPEN_SEA_BUYER);
  await verifyContract("NFTStrategyFactory", FACTORY, [
    POSITION_MANAGER,
    PERMIT2,
    POOL_MANAGER,
    UNIVERSAL_ROUTER,
    ROUTER,
    FEE_ADDRESS,
    RESTRICTED_TOKEN,
    ethers.ZeroAddress,
  ]);
  await verifyContract("NFTStrategyHookMiner", HOOK_MINER, [POOL_MANAGER, FEE_ADDRESS]);
  await verifyContract("NFTStrategyHook", HOOK, [
    POOL_MANAGER,
    RESTRICTED_TOKEN,
    FACTORY,
    FEE_ADDRESS,
  ]);

  console.log("\n🎉 Wiring and verification complete!\n");
  console.log(`📋 Summary:
  - Factory: ${FACTORY}
  - Hook: ${HOOK}
  - RestrictedToken: ${RESTRICTED_TOKEN}
  - OpenSeaBuyer: ${OPEN_SEA_BUYER}
  - HookMiner: ${HOOK_MINER}
  `);
}

const defaultConfig: WiringConfig = {
  restrictedToken: "0xa574F531720a21aA4c31dd04185293855AB78972",
  openSeaBuyer: "0x11003468BD18ca9bCfA3cee5b81BB48d25e981E3",
  factory: "0xCffE96f1307285e97bc6c5C0E584471A6aF277E9",
  hookMiner: "0xaf64D31cfF47f455380a64cBEaC8304A207B072A",
  hook: "0x5954bDdFE399684c5D9015533ba92DB6722268C4",
  poolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
  universalRouter: "0x6ff5693b99212da76ad316178a184ab56d299b43",
  router: "0x00000000000044a361Ae3cAc094c9D1b14Eece97",
  positionManager: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  feeAddress: "0x4F71DfcA94c6357f3797E1f1d99079A73c63b5cB",
};

async function main() {
  await wireHookAndVerify(defaultConfig);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ Wiring/verification failed:", err);
    process.exit(1);
  });
}