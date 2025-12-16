import { run } from "hardhat";

/**
 * Hardcoded verification script for:
 *  - NFTStrategy
 *  - FeeContract
 *
 * Fill in the addresses and constructor params below before running:
 *   npx hardhat run scripts/verify-nftstrategy-fee.ts --network <network>
 */

// ----- CONTRACT ADDRESSES TO VERIFY -----
const NFT_STRATEGY = "0xYourNftStrategyAddress";
const FEE_CONTRACT = "0xYourFeeContractAddress";

// ----- SHARED CORE ADDRESSES -----
const FACTORY = "0x56753c68c8DAcCea714A2F08dA2B554b9EA50470";
const HOOK = "0xAf53b4516a43fE6E818a6d06463F1023cdb668c4";
const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";
const COLLECTION = "0xYourCollectionAddress";

// ----- NFTStrategy-SPECIFIC -----
const TOKEN_NAME = "Parallel Strategy"; // update if different
const TOKEN_SYMBOL = "PARSTR"; // update if different

// ----- FeeContract-SPECIFIC -----
const RARITY_TOKEN = "0xYourRarityTokenAddress";
const OPEN_SEA_BUYER = "0xe0a6Bf83a6C3C64dBCa462912242AF56dd4C0183";

async function main() {
  console.log("\nVerifying NFTStrategy...");
  await run("verify:verify", {
    address: NFT_STRATEGY,
    constructorArguments: [FACTORY, HOOK, ROUTER, COLLECTION, TOKEN_NAME, TOKEN_SYMBOL],
  });
  console.log("✅ NFTStrategy verification submitted");

  console.log("\nVerifying FeeContract...");
  await run("verify:verify", {
    address: FEE_CONTRACT,
    constructorArguments: [FACTORY, HOOK, ROUTER, COLLECTION, RARITY_TOKEN, OPEN_SEA_BUYER],
  });
  console.log("✅ FeeContract verification submitted");
}

main().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});

