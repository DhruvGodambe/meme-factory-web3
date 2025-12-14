import { ethers } from "hardhat";

/**
 * Launch a new NFTStrategy for the Parallel Strategy collection.
 *
 * Defaults are set for the known factory and collection; override via env vars:
 *   FACTORY_ADDRESS=0x... COLLECTION_ADDRESS=0x... TOKEN_NAME="..." TOKEN_SYMBOL="..." LAUNCH_VALUE_ETH=0.02
 *
 * Run with:
 *   npx hardhat run scripts/launch-parallel-strategy.ts --network <network>
 */

const DEFAULT_FACTORY = "0x6E4Eef9b5ff69E7c22bB5EAD0a7dCc62ad567039";
const DEFAULT_COLLECTION = "0x206571b68c66e1d112b74d65695043ad2b5f95d5";
const DEFAULT_NAME = "Parallel Strategy";
const DEFAULT_SYMBOL = "PARSTR";

function parseLaunchValue(raw?: string) {
  if (!raw || raw.trim() === "") return undefined;
  const cleaned = raw.trim();
  try {
    // Accept both plain wei (integer/0x) and eth strings (e.g. "0.02")
    const isPlainInteger = /^(\d+|0x[0-9a-fA-F]+)$/.test(cleaned);
    return isPlainInteger ? BigInt(cleaned) : ethers.parseEther(cleaned);
  } catch (err) {
    throw new Error(`Unable to parse launch value "${raw}": ${(err as Error)?.message ?? err}`);
  }
}

async function main() {
  const factoryAddress = process.env.FACTORY_ADDRESS ?? DEFAULT_FACTORY;
  const collectionAddress = process.env.COLLECTION_ADDRESS ?? DEFAULT_COLLECTION;
  const tokenName = process.env.TOKEN_NAME ?? DEFAULT_NAME;
  const tokenSymbol = process.env.TOKEN_SYMBOL ?? DEFAULT_SYMBOL;
  const valueOverride =
    parseLaunchValue(process.env.LAUNCH_VALUE_WEI) ?? parseLaunchValue(process.env.LAUNCH_VALUE_ETH);

  if (!ethers.isAddress(factoryAddress)) throw new Error(`Invalid factory address: ${factoryAddress}`);
  if (!ethers.isAddress(collectionAddress)) throw new Error(`Invalid collection address: ${collectionAddress}`);

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Factory:  ${factoryAddress}`);
  console.log(`Collection: ${collectionAddress}`);
  console.log(`Token: "${tokenName}" (${tokenSymbol})`);

  const factory = await ethers.getContractAt("NFTStrategyFactory", factoryAddress, deployer);

  const hookAddress = await factory.hookAddress();
  const feeToLaunch: bigint = valueOverride ?? (await factory.feeToLaunch());
  const publicLaunches: boolean = await factory.publicLaunches();
  const collectionOwnerLaunches: boolean = await factory.collectionOwnerLaunches();

  console.log(`Hook address: ${hookAddress}`);
  console.log(`publicLaunches: ${publicLaunches} | collectionOwnerLaunches: ${collectionOwnerLaunches}`);
  console.log(`feeToLaunch: ${ethers.formatEther(feeToLaunch)} ETH (${feeToLaunch} wei)`);

  const existing = await factory.collectionToNFTStrategy(collectionAddress);
  if (existing && existing !== ethers.ZeroAddress) {
    console.log(`Collection already launched. Strategy address: ${existing}`);
    return;
  }

  if (!publicLaunches && !collectionOwnerLaunches) {
    throw new Error("Factory is not open for public or collection-owner launches.");
  }

  console.log("Sending launch transaction...");
  const tx = await factory.launchNFTStrategy(collectionAddress, tokenName, tokenSymbol, {
    value: feeToLaunch,
  });
  console.log(`Tx hash: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Confirmed in block: ${receipt?.blockNumber ?? "?"}`);

  const launched = await factory.collectionToNFTStrategy(collectionAddress);
  console.log(`New NFTStrategy address: ${launched}`);
}

main().catch((err) => {
  console.error("Launch failed:", err);
  process.exit(1);
});

