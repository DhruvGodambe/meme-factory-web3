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

  // Deployed addresses from latest deployment
  const restrictedToken = "0x11bd3952C622D69551DcE28b5b9769CA39c88dBc";
  const openSeaBuyer = "0x1df4E3643Dc9119Df655a0BfA9502AB9FaA6356c";
  const fakeNFTCollection = "0xE3Fbc83f467267634b43d937DffD6dEA66bc307B";
  const hookMiner = "0x1AF607dE9cdB08d57EdC0E1337B1E3ef43b43453";
  const factory = "0x6E4Eef9b5ff69E7c22bB5EAD0a7dCc62ad567039";
  const hook = "0x0B7e30C74cE52CBa10c91357655955006C9a68c4";

  console.log("\n🔗 Starting verification on BaseScan...");
  console.log(`📋 Network: Base Mainnet (Chain ID: 8453)`);
  console.log(`📋 Deployer: ${FEE_ADDRESS}\n`);

  // 1. RestrictedToken (no constructor args)
  await verify(restrictedToken, []);
  
  // 2. OpenSeaNFTBuyer (no constructor args)
  await verify(openSeaBuyer, []);
  
  // 3. FakeNFTCollection
  await verify(fakeNFTCollection, [
    "Test NFT Collection",
    "TEST",
    "https://api.example.com/metadata/",
  ]);
  
  // 4. NFTStrategyHookMiner
  await verify(hookMiner, [POOL_MANAGER, FEE_ADDRESS]);
  
  // 5. NFTStrategyFactory
  await verify(factory, [
    POSITION_MANAGER,
    PERMIT2,
    POOL_MANAGER,
    UNIVERSAL_ROUTER,
    ROUTER,
    FEE_ADDRESS,
    restrictedToken,
    "0x0000000000000000000000000000000000000000", // restrictedTokenHookAddress (zero initially)
  ]);
  
  // 6. NFTStrategyHook
  await verify(hook, [
    POOL_MANAGER,        // poolManager
    restrictedToken,     // restrictedToken
    factory,             // nftStrategyFactory
    FEE_ADDRESS         // feeAddress
  ]);

  console.log("\n🎯 All verification attempts complete!");
  console.log("\n📊 Verification Summary:");
  console.log(`   RestrictedToken: https://basescan.org/address/${restrictedToken}#code`);
  console.log(`   OpenSeaNFTBuyer: https://basescan.org/address/${openSeaBuyer}#code`);
  console.log(`   FakeNFTCollection: https://basescan.org/address/${fakeNFTCollection}#code`);
  console.log(`   NFTStrategyHookMiner: https://basescan.org/address/${hookMiner}#code`);
  console.log(`   NFTStrategyFactory: https://basescan.org/address/${factory}#code`);
  console.log(`   NFTStrategyHook: https://basescan.org/address/${hook}#code`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
