/*
  Sepolia end-to-end flow:
  - Deploy FakeNFTCollection (escrow-enabled)
  - Mint NFT to SELLER
  - List token on FakeNFTCollection escrow marketplace (list(tokenId, priceWei))
  - Ensure NFTStrategy has enough currentFees (cannot fund unless signer == hook)
  - Call NFTStrategy.buyTargetNFT(value=priceWei, data=abi.encodeWithSelector(Collection.buy(tokenId)), expectedId=tokenId, target=Collection)
  - As BUYER, call NFTStrategy.sellTargetNFT(tokenId) with msg.value == listed price

  Env vars required (only for sensitive keys and RPC):
    SEPOLIA_RPC_URL
    PRIVATE_KEY_SELLER
    PRIVATE_KEY_BUYER (optional; defaults to seller)
*/

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Minimal ABIs needed
const NFT_STRATEGY_ABI = [
  "function currentFees() view returns (uint256)",
  "function addFees() payable",
  "function buyTargetNFT(uint256 value, bytes data, uint256 expectedId, address target)",
  "function nftForSale(uint256 tokenId) view returns (uint256)",
  "function sellTargetNFT(uint256 tokenId) payable",
];

const COLLECTION_ABI = [
  "function owner() view returns (address)",
  "function mint(address to) returns (uint256)",
  "function list(uint256 tokenId, uint256 price)",
  "function buy(uint256 tokenId) payable",
  "function listings(uint256 tokenId) view returns (address seller, uint256 price)",
];

async function main() {
  const rpcUrl = mustGetEnv("SEPOLIA_RPC_URL");
  const sellerPk = mustGetEnv("PRIVATE_KEY");
  const buyerPk = sellerPk; // buyer and seller are the same

  // Hardcoded config — fill these with Sepolia addresses
  const ADDR_STRATEGY_RAW = "0xae2a9c859f7f73f8ba6d2aca1aa3aba3a3a1038a"; // required
  const ADDR_HOOK_RAW = "0x355Fe46E605175Fb41E718d637932Afc44f6a8c4"; // required if funding fees
  const ADDR_COLLECTION_RAW = "0xE15680C44220a6303ac201ABe9d0e569Ba581a30"; // provided collection address
  const PRICE_WEI = ethers.parseEther("0.00014");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const sellerWallet = new ethers.Wallet(sellerPk, provider);
  const buyerWallet = new ethers.Wallet(buyerPk, provider);

  console.log("Seller:", sellerWallet.address);
  console.log("Buyer :", buyerWallet.address);

  // Use existing collection address
  const normalize = (a: string) => ethers.getAddress(a.trim());
  const ADDR_STRATEGY = normalize(ADDR_STRATEGY_RAW);
  const ADDR_HOOK = normalize(ADDR_HOOK_RAW);
  const addrCollection = normalize(ADDR_COLLECTION_RAW);
  console.log("Using FakeNFTCollection:", addrCollection);

  // Contracts
  const strategy = new ethers.Contract(ADDR_STRATEGY, NFT_STRATEGY_ABI, provider);
  const collection = new ethers.Contract(addrCollection, COLLECTION_ABI, sellerWallet);

  // Mint to seller and derive tokenId as nextTokenId - 1
  console.log("Minting NFT to:", sellerWallet.address);
  const mintTx = await collection.mint(sellerWallet.address);
  const mintRcpt = await mintTx.wait();
  console.log("Mint tx:", mintRcpt?.hash);

  // List on escrow marketplace
  // Determine tokenId via nextTokenId() - 1
  const next = (await new ethers.Contract(addrCollection, ["function nextTokenId() view returns (uint256)"], sellerWallet).nextTokenId()) as bigint;
  const tokenId = next - 1n;
  console.log("Listing tokenId on collection escrow:", tokenId.toString(), "price:", PRICE_WEI.toString());
  const listTx = await collection.list(tokenId, PRICE_WEI);
  const listRcpt = await listTx.wait();
  console.log("list() tx:", listRcpt?.hash);

  // Check fees
  const currentFees: bigint = await strategy.currentFees();
  console.log("Strategy currentFees:", currentFees.toString());
  if (currentFees < PRICE_WEI) {
    console.log("Insufficient currentFees. Attempting to fund via addFees() requires msg.sender == hook.");
    if (sellerWallet.address.toLowerCase() !== ADDR_HOOK.toLowerCase()) {
      throw new Error(`Cannot fund: signer ${sellerWallet.address} != hook ${ADDR_HOOK}`);
    }
    const strategyWithHook = strategy.connect(sellerWallet) as any;
    console.log("Funding addFees with:", PRICE_WEI.toString(), "wei");
    const fundTx = await strategyWithHook.addFees({ value: PRICE_WEI });
    const fundRcpt = await fundTx.wait();
    console.log("addFees tx:", fundRcpt?.hash);
  }

  // Execute buyTargetNFT as seller (anyone can call), strategy uses its own fees to pay SimpleSeller
  const strategyAsSeller = strategy.connect(sellerWallet) as any;
  console.log("Calling buyTargetNFT via collection.buy(tokenId)...");
  const iface = new ethers.Interface(COLLECTION_ABI);
  const buyData = iface.encodeFunctionData("buy", [tokenId]);
  const buyTx = await strategyAsSeller.buyTargetNFT(PRICE_WEI, buyData, tokenId, addrCollection);
  const buyRcpt = await buyTx.wait();
  console.log("buyTargetNFT tx:", buyRcpt?.hash);

  // Check listing price
  const listPrice: bigint = await strategy.nftForSale(tokenId);
  console.log("nftForSale[", tokenId.toString(), "]=", listPrice.toString());
  if (listPrice === 0n) {
    throw new Error("Listing failed: sale price is zero");
  }

  // Buyer purchases from strategy
  const strategyAsBuyer = strategy.connect(buyerWallet) as any;
  console.log("Calling sellTargetNFT as buyer with value:", listPrice.toString());
  const sellTx = await strategyAsBuyer.sellTargetNFT(tokenId, { value: listPrice });
  const sellRcpt = await sellTx.wait();
  console.log("sellTargetNFT tx:", sellRcpt?.hash);

  // Save outputs to JSON
  const out = {
    network: "sepolia",
    addresses: {
      strategy: ADDR_STRATEGY,
      hook: ADDR_HOOK,
      collection: addrCollection,
      seller: sellerWallet.address,
      buyer: buyerWallet.address,
    },
    tokenId: tokenId.toString(),
    priceWei: PRICE_WEI.toString(),
    currentFeesBefore: currentFees.toString(),
    tx: {
      mint: mintRcpt?.hash,
      list: listRcpt?.hash,
      buyTargetNFT: buyRcpt?.hash,
      sellTargetNFT: sellRcpt?.hash,
    },
  };
  const outDir = path.join(process.cwd(), "runs");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `sepolia-flow-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Saved run to:", outPath);
}

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
function getEnv(name: string): string | undefined {
  return process.env[name];
}

// No artifact loader needed for existing collection

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


