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
const NFT_STRATEGY = "0x73656d64ab4046558f827ef0af396046a14dfb95";
const FEE_CONTRACT = "0x70209f462ac90fafd6aa64b70c9549498c036184";

// ----- SHARED CORE ADDRESSES -----
const FACTORY = "0x7C006F83f8539801220beEa30DFF1518082138ab";
const HOOK = "0x008C6209c47692d504aA2652fCd0710883B568C4";
const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";
const COLLECTION = "0x25b2ed7149fb8a05f6ef9407d9c8f878f59cd1e1";

// ----- NFTStrategy-SPECIFIC -----
const TOKEN_NAME = "Hydrexfi Strategy 1.3"; // update if different
const TOKEN_SYMBOL = "HYDSTR2"; // update if different

// ----- FeeContract-SPECIFIC -----
const RARITY_TOKEN = "0x73656d64ab4046558f827ef0af396046a14dfb95";
const OPEN_SEA_BUYER = "0xe0a6Bf83a6C3C64dBCa462912242AF56dd4C0183";

async function main() {
  try {
    console.log("\nVerifying NFTStrategy...");
    await run("verify:verify", {
      address: NFT_STRATEGY,
      constructorArguments: [FACTORY, HOOK, ROUTER, COLLECTION, TOKEN_NAME, TOKEN_SYMBOL],
    });
    console.log("✅ NFTStrategy verification submitted");
  } catch (e) {
    console.log("failed verifying nft strategy...");
    console.log(e);
  }

  try {
    console.log("\nVerifying FeeContract...");
    await run("verify:verify", {
      address: FEE_CONTRACT,
      constructorArguments: [FACTORY, HOOK, ROUTER, COLLECTION, RARITY_TOKEN, OPEN_SEA_BUYER],
    });
    console.log("✅ FeeContract verification submitted");
  } catch (e) {
    console.log("failed verifying fee contract...");
    console.log(e);
  }

}

main().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});

