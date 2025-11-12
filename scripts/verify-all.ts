import { run } from "hardhat";

async function verify(address: string, constructorArgs: any[]) {
  try {
    console.log(`\n🔍 Verifying: ${address}`);
    await run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(`✅ Verified: https://basescan.org/address/${address}#code`);
  } catch (err: any) {
    if (err.message.includes("Already Verified")) {
      console.log(`✅ Already Verified: ${address}`);
    } else {
      console.error(`❌ Verification failed for ${address}:`, err.message);
    }
  }
}

async function main() {
  const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
  const POSITION_MANAGER = "0x7c5f5a4bbd8fd63184577525326123b519429bdc";
  const UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
  const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const FEE_ADDRESS = "0xF93E7518F79C2E1978D6862Dbf161270040e623E";
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";

  const restrictedToken = "0xc7B391b5B2bE18606a3023535062fD59be096Bdc";
  const openSeaBuyer = "0x69bC1a1DeAC31D425EF5707864490273e4378492";
  const fakeNFTCollection = "0x17Afe98A34a310Efe518c75aCb5Cd2Fa343070fc";
  const hookMiner = "0x25a4BA1D9B9018c954C82463348d20aC981C0217";
  const factory = "0xb35de559B8dF1237bc9324e4eD57e586F37d4bED";
  const hook = "0xe6951fD58448c11b937c2cd823f6240a068B68c4";

  console.log("\n🔗 Starting verification on BaseScan...");

  await verify(restrictedToken, []);
  await verify(openSeaBuyer, []);
  await verify(fakeNFTCollection, [
    "Test NFT Collection",
    "TEST",
    "https://api.example.com/metadata/",
  ]);
  await verify(hookMiner, [POOL_MANAGER, FEE_ADDRESS]);
  await verify(factory, [
    POSITION_MANAGER,
    PERMIT2,
    POOL_MANAGER,
    UNIVERSAL_ROUTER,
    ROUTER,
    FEE_ADDRESS,
    restrictedToken,
    "0x0000000000000000000000000000000000000000",
  ]);
  await verify(hook, [
  "0x498581ff718922c3f8e6a244956af099b2652b2b", // poolManager
  "0xc7B391b5B2bE18606a3023535062fD59be096Bdc", // restrictedToken
  "0xb35de559B8dF1237bc9324e4eD57e586F37d4bED", // nftStrategyFactory
  "0xF93E7518F79C2E1978D6862Dbf161270040e623E"  // feeAddress
]);

  console.log("\n🎯 All verification attempts complete!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
