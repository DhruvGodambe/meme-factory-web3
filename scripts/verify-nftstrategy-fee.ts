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
const NFT_STRATEGY = "0xcE87DE97dC27fA2b6730593ccE4bfb23E6A94348";
const FEE_CONTRACT = "0x492B1d81145c3d11b04A3c024EcF855Cb21E272F";

// ----- SHARED CORE ADDRESSES -----
const FACTORY = "0x1F649F2EC09b7814D313d12AC7DfC12F84412e99";
const HOOK = "0x9c3fb59C7a27a8d141A5E3a664ece6798eaB28c4";
const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";
const COLLECTION = "0x25b2ed7149fb8a05f6ef9407d9c8f878f59cd1e1";

// ----- NFTStrategy-SPECIFIC -----
const TOKEN_NAME = "Hydrexfi Strategy 1.2"; // update if different
const TOKEN_SYMBOL = "HYDSTR1"; // update if different

// ----- FeeContract-SPECIFIC -----
const RARITY_TOKEN = "0xcE87DE97dC27fA2b6730593ccE4bfb23E6A94348";
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

