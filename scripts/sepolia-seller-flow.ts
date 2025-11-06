/*
  Polygon FeeContract end-to-end flow:
  - Use existing FakeNFTCollection (escrow-enabled)
  - Mint NFT to SELLER
  - List token on FakeNFTCollection escrow marketplace (list(tokenId, priceWei))
  - Ensure FeeContract has enough currentFees (funded by hook via swap fees)
  - Call FeeContract.buyTargetNFT(value=priceWei, data=abi.encodeWithSelector(Collection.buy(tokenId)), expectedId=tokenId, target=Collection)
  - As BUYER, call FeeContract.sellTargetNFT(tokenId) with msg.value == listed price

  Env vars required (only for sensitive keys and RPC):
    POLYGON_RPC_URL
    PRIVATE_KEY_SELLER
    PRIVATE_KEY_BUYER (optional; defaults to seller)
*/

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Minimal ABIs needed
const FEE_CONTRACT_ABI = [
  "function currentFees() view returns (uint256)",
  "function currentHoldings() view returns (uint256)",
  "function isFull() view returns (bool)",
  "function buyTargetNFT(uint256 value, bytes data, uint256 expectedId, address target)",
  "function smartBuyNFT(uint256 tokenId, address previousFeeContract)",
  "function nftForSale(uint256 tokenId) view returns (uint256)",
  "function sellTargetNFT(uint256 tokenId) payable",
  "function collection() view returns (address)",
  "function rarityToken() view returns (address)",
];

const COLLECTION_ABI = [
  "function owner() view returns (address)",
  "function mint(address to) returns (uint256)",
  "function list(uint256 tokenId, uint256 price)",
  "function buy(uint256 tokenId) payable",
  "function listings(uint256 tokenId) view returns (address seller, uint256 price)",
  "function nextTokenId() view returns (uint256)",
];

const HOOK_ABI = [
  "function activeFeeContract(address rarityToken) view returns (address)",
  "function hasFeeContract(address rarityToken) view returns (bool)",
  "function deployNewFeeContract(address rarityToken) returns (address)",
  "function setHotWallet(address hotWallet)",
  "function fundHotWallet(uint256 amount)",
  "function isFeeContractFull(address feeContractAddress) view returns (bool)",
  "function getFeeContractHoldings(address feeContractAddress) view returns (uint256)",
  "function getFeeContractFees(address feeContractAddress) view returns (uint256)",
  "function getFeeContractInfo(address feeContractAddress) view returns (address, address, uint256, uint256, bool)",
  "function hotWallet() view returns (address)",
  "function isAuthorizedCaller(address caller) view returns (bool)",
];

async function main() {
  const rpcUrl = mustGetEnv("SEPOLIA_RPC_URL");
  const sellerPk = mustGetEnv("PRIVATE_KEY");
  const buyerPk = sellerPk; // buyer and seller are the same

  // Hardcoded config — fill these with Sepolia addresses
  const ADDR_STRATEGY_RAW = "0xc3aD1980B4fa9536db535AA6D52fab577a57C2c9"; // required
  // const ADDR_HOOK_RAW = "0x59438D97FE46B521cFa1A06e9c011443f84968C4"; // required if funding fees (fixed checksum)
  const ADDR_COLLECTION_RAW = "0xb1551a7c12c87D4D1beB29dA74de67c7DA4fd9cb"; // provided collection address
  const PRICE_WEI = BigInt("20000000000000"); // 20000000000000 wei (less than current fees: 23100715218205)

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const sellerWallet = new ethers.Wallet(sellerPk, provider);
  const buyerWallet = new ethers.Wallet(buyerPk, provider);

  console.log("Seller:", sellerWallet.address);
  console.log("Buyer :", buyerWallet.address);

  // Use existing collection address
  const normalize = (a: string) => ethers.getAddress(a.trim());
  const ADDR_STRATEGY = normalize(ADDR_STRATEGY_RAW);
  // const ADDR_HOOK = normalize(ADDR_HOOK_RAW);
  const addrCollection = normalize(ADDR_COLLECTION_RAW);
  console.log("Using FakeNFTCollection:", addrCollection);

  // Contracts
  const feeContract = new ethers.Contract(ADDR_STRATEGY, FEE_CONTRACT_ABI, provider);
  const collection = new ethers.Contract(addrCollection, COLLECTION_ABI, sellerWallet);
  // const hook = new ethers.Contract(ADDR_HOOK, HOOK_ABI, provider);

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

  // Check fees and FeeContract status
  const currentFees: bigint = await feeContract.currentFees();
  const currentHoldings: bigint = await feeContract.currentHoldings();
  const isFull: boolean = await feeContract.isFull();
  
  console.log("FeeContract currentFees:", currentFees.toString());
  console.log("FeeContract currentHoldings:", currentHoldings.toString());
  console.log("FeeContract isFull:", isFull);
  
  if (currentFees < PRICE_WEI) {
    console.log("Insufficient currentFees. Note: addFees() should be called by the hook during swaps.");
    console.log("For testing, you may need to perform a swap or manually fund via the hook.");
  }

  // Execute buyTargetNFT as seller (anyone can call), FeeContract uses its own fees to pay SimpleSeller
  const feeContractAsSeller = feeContract.connect(sellerWallet) as any;
  console.log("Calling buyTargetNFT via collection.buy(tokenId)...");
  const iface = new ethers.Interface(COLLECTION_ABI);
  const buyData = iface.encodeFunctionData("buy", [tokenId]);
  const buyTx = await feeContractAsSeller.buyTargetNFT(PRICE_WEI, buyData, tokenId, addrCollection);
  const buyRcpt = await buyTx.wait();
  console.log("buyTargetNFT tx:", buyRcpt?.hash);

  // Check listing price
  const listPrice: bigint = await feeContract.nftForSale(tokenId);
  console.log("nftForSale[", tokenId.toString(), "]=", listPrice.toString());
  if (listPrice === 0n) {
    throw new Error("Listing failed: sale price is zero");
  }

  // Buyer purchases from FeeContract
  const feeContractAsBuyer = feeContract.connect(buyerWallet) as any;
  console.log("Calling sellTargetNFT as buyer with value:", listPrice.toString());
  const sellTx = await feeContractAsBuyer.sellTargetNFT(tokenId, { value: listPrice });
  const sellRcpt = await sellTx.wait();
  console.log("sellTargetNFT tx:", sellRcpt?.hash);

  // Save outputs to JSON
  const out = {
    network: "sepolia",
    addresses: {
      feeContract: ADDR_STRATEGY,
      // hook: ADDR_HOOK,
      collection: addrCollection,
      seller: sellerWallet.address,
      buyer: buyerWallet.address,
    },
    tokenId: tokenId.toString(),
    priceWei: PRICE_WEI.toString(),
    feeContractStatus: {
      currentFees: currentFees.toString(),
      currentHoldings: currentHoldings.toString(),
      isFull: isFull,
    },
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


