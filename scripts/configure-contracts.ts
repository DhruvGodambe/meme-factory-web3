import { ethers } from "hardhat";

async function delay(ms = 2000) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`\n⚙️ Configuring from account: ${deployer.address}`);

  const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
  const UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";

  const factoryAddress = "0x6E4Eef9b5ff69E7c22bB5EAD0a7dCc62ad567039";
  const restrictedTokenAddress = "0x11bd3952C622D69551DcE28b5b9769CA39c88dBc";
  const actualHookAddr = "0x0B7e30C74cE52CBa10c91357655955006C9a68c4";

  const feeData = await ethers.provider.getFeeData();
  const baseFee = feeData.maxFeePerGas ?? BigInt(10_000_000_000);
  const priorityFee = feeData.maxPriorityFeePerGas ?? BigInt(1_000_000_000);

  const txOpts = {
    gasLimit: 12_000_000,
    maxFeePerGas: baseFee * BigInt(4), // 4x bump
    maxPriorityFeePerGas: priorityFee * BigInt(4),
  };

  console.log(
    `⛽ Gas bumped → maxFee: ${ethers.formatUnits(txOpts.maxFeePerGas, "gwei")} gwei`
  );

  const factory = await ethers.getContractAt("NFTStrategyFactory", factoryAddress);
  const restrictedToken = await ethers.getContractAt("RestrictedToken", restrictedTokenAddress);

  console.log("\n=== 🏗️ Configuring Factory ===");
  await (await factory.updateHookAddress(actualHookAddr, txOpts)).wait();
  console.log("✅ Hook address updated");
  await delay();

  await (await factory.setRestrictedTokenHookAddress(actualHookAddr, txOpts)).wait();
  console.log("✅ Restricted token hook address set");
  await delay();

  await (await factory.updateFeeToLaunch(ethers.parseEther("0.00002"), txOpts)).wait();
  console.log("✅ Launch fee set");
  await delay();

  await (await factory.setPublicLaunches(true, txOpts)).wait();
  console.log("✅ Public launches enabled");
  await delay();

  await (await factory.setCollectionOwnerLaunches(true, txOpts)).wait();
  console.log("✅ Collection owner launches enabled");

  console.log("\n=== 🧩 Configuring RestrictedToken ===");
  await (await restrictedToken.setPoolManager(POOL_MANAGER, txOpts)).wait();
  console.log("✅ Pool Manager set");
  await delay();

  await (await restrictedToken.setHook(actualHookAddr, txOpts)).wait();
  console.log("✅ Hook address linked");
  await delay();

  await (await restrictedToken.setSwapRouter(UNIVERSAL_ROUTER, txOpts)).wait();
  console.log("✅ Router set");
  await delay();

  await (await restrictedToken.setTradingEnabled(true, txOpts)).wait();
  console.log("✅ Trading enabled");

  console.log("\n🎉 Configuration complete!");
}

main().catch((err) => {
  console.error("❌ Configuration failed:", err);
  process.exit(1);
});
