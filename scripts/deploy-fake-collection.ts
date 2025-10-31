/*
  Deploy modified FakeNFTCollection to Sepolia and save outputs to runs/<timestamp>.json

  Required env:
    - SEPOLIA_RPC_URL
    - PRIVATE_KEY (deployer)

  Configure constants below for name/symbol/baseURI as needed.
*/

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const rpcUrl = mustGetEnv("SEPOLIA_RPC_URL");
  const pk = mustGetEnv("PRIVATE_KEY");

  const COLLECTION_NAME = "Fake NFTs";
  const COLLECTION_SYMBOL = "FAKE";
  const COLLECTION_BASE_URI = "https://example.com/";

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(pk, provider);
  console.log("Deployer:", wallet.address);

  // Load artifact from local build
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const artifact = require("../artifacts/contracts/amock/FakeNFTCollection.sol/FakeNFTCollection.json");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("Deploying FakeNFTCollection...");
  const contract = await factory.deploy(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_BASE_URI);
  const rcpt = await contract.deploymentTransaction()?.wait();
  const addr = await contract.getAddress();
  console.log("FakeNFTCollection:", addr);
  console.log("Deploy tx:", rcpt?.hash);

  const out = {
    network: "sepolia",
    deployer: wallet.address,
    collection: addr,
    tx: rcpt?.hash,
    params: {
      name: COLLECTION_NAME,
      symbol: COLLECTION_SYMBOL,
      baseURI: COLLECTION_BASE_URI,
    },
  };
  const outDir = path.join(process.cwd(), "runs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `deploy-fake-collection-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Saved deployment to:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


