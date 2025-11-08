import { ethers } from "ethers";

// Configuration
const CONFIG = {
  BASE_RPC: process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY",
  CONTRACT_ADDRESS: "0xaA46dd2434dE4b06Da8D4F7f0Ace4e152EecbbA6", // Updated with new deployment
  SEAPORT_V16_ADDRESS: "0x0000000000000068f116a894984e2db1123eb395",
  OPENSEA_API_KEY: process.env.OPENSEA_API_KEY || "", // Get from OpenSea developer portal
};

// Contract ABI - minimal needed for execution
const CONTRACT_ABI = [
  "function buyNFT((tuple(address offerer, address zone, tuple(uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount)[] offer, tuple(uint8 itemType, address token, uint256 identifierOrCriteria, uint256 startAmount, uint256 endAmount, address recipient)[] consideration, uint8 orderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 conduitKey, uint256 totalOriginalConsiderationItems) parameters, bytes signature) order) external payable",
  "function buyNFTBasic((address considerationToken, uint256 considerationIdentifier, uint256 considerationAmount, address offerer, address zone, address offerToken, uint256 offerIdentifier, uint256 offerAmount, uint8 basicOrderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 offererConduitKey, bytes32 fulfillerConduitKey, uint256 totalOriginalAdditionalRecipients, tuple(uint256 amount, address recipient)[] additionalRecipients, bytes signature) parameters) external payable",
];

interface OrderData {
  order_hash: string;
  protocol_data: {
    parameters: any;
    signature: string | null;
  };
  price: {
    current: {
      value: string;
    };
  };
}

/**
 * Step 1: Fetch the order with signature from OpenSea API
 */
async function fetchOrderWithSignature(
  orderHash: string
): Promise<OrderData> {
  const response = await fetch(
    `https://api.opensea.io/api/v2/orders/chain/base/protocol/0x0000000000000068f116a894984e2db1123eb395/${orderHash}`,
    {
      headers: {
        "X-API-KEY": CONFIG.OPENSEA_API_KEY,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch order: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Step 2: Calculate total price including fees
 */
function calculateTotalPrice(orderData: OrderData): bigint {
  // Sum all consideration items (seller payment + marketplace fees + creator royalties)
  const considerations = orderData.protocol_data.parameters.consideration;
  let totalPrice = BigInt(0);

  for (const item of considerations) {
    totalPrice += BigInt(item.startAmount);
  }

  return totalPrice;
}

/**
 * Step 3: Format order for your contract
 */
function formatOrderForContract(orderData: OrderData) {
  const params = orderData.protocol_data.parameters;

  return {
    parameters: {
      offerer: params.offerer,
      zone: params.zone,
      offer: params.offer.map((item: any) => ({
        itemType: item.itemType,
        token: item.token,
        identifierOrCriteria: item.identifierOrCriteria,
        startAmount: item.startAmount,
        endAmount: item.endAmount,
      })),
      consideration: params.consideration.map((item: any) => ({
        itemType: item.itemType,
        token: item.token,
        identifierOrCriteria: item.identifierOrCriteria,
        startAmount: item.startAmount,
        endAmount: item.endAmount,
        recipient: item.recipient,
      })),
      orderType: params.orderType,
      startTime: params.startTime,
      endTime: params.endTime,
      zoneHash: params.zoneHash,
      salt: params.salt,
      conduitKey: params.conduitKey,
      totalOriginalConsiderationItems: params.totalOriginalConsiderationItems,
    },
    signature: orderData.protocol_data.signature,
  };
}

/**
 * Step 4: Execute the order
 */
async function executeOrder(
  orderHash: string,
  privateKey: string
): Promise<string> {
  console.log(`\n🔍 Fetching order ${orderHash}...`);

  // 1. Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(
    CONFIG.CONTRACT_ADDRESS,
    CONTRACT_ABI,
    wallet
  );

  // 2. Fetch order with signature
  const orderData = await fetchOrderWithSignature(orderHash);

  if (!orderData.protocol_data.signature) {
    throw new Error("Order signature is missing!");
  }

  console.log("✅ Order fetched successfully");
  console.log(
    `NFT: ${orderData.protocol_data.parameters.offer[0].token} #${orderData.protocol_data.parameters.offer[0].identifierOrCriteria}`
  );

  // 3. Calculate price
  const totalPrice = calculateTotalPrice(orderData);
  const priceInEth = ethers.formatEther(totalPrice);
  console.log(`💰 Total Price: ${priceInEth} ETH`);

  // 4. Check balance
  const balance = await provider.getBalance(wallet.address);
  if (balance < totalPrice) {
    throw new Error(
      `Insufficient balance. Need ${priceInEth} ETH, have ${ethers.formatEther(balance)} ETH`
    );
  }

  // 5. Format order
  const order = formatOrderForContract(orderData);

  // 6. Estimate gas
  console.log("\n⛽ Estimating gas...");
  const gasEstimate = await contract.buyNFT.estimateGas(order, {
    value: totalPrice,
  });
  console.log(`Gas estimate: ${gasEstimate.toString()}`);

  // 7. Execute transaction
  console.log("\n🚀 Executing purchase...");
  const tx = await contract.buyNFT(order, {
    value: totalPrice,
    gasLimit: (gasEstimate * 120n) / 100n, // 20% buffer
  });

  console.log(`📝 Transaction sent: ${tx.hash}`);
  console.log("⏳ Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
  console.log(`🎉 NFT purchased successfully!`);

  return tx.hash;
}

/**
 * Helper: Display available orders
 */
function displayOrders(listings: any[]) {
  console.log("\n📋 Available Orders:\n");
  listings.forEach((listing, index) => {
    const nft = listing.protocol_data.parameters.offer[0];
    const priceInEth = ethers.formatEther(listing.price.current.value);

    console.log(`${index + 1}. Order Hash: ${listing.order_hash}`);
    console.log(`   NFT: ${nft.token} #${nft.identifierOrCriteria}`);
    console.log(`   Price: ${priceInEth} ETH`);
    console.log(`   Status: ${listing.status}`);
    console.log("");
  });
}

/**
 * Main execution
 */
async function main() {
  // Load your listings data
  const listingsData = require("../response.json"); // Your API response file

  // Display available orders
  displayOrders(listingsData.listings);

  // Example: Execute the first order
  // REPLACE WITH YOUR PRIVATE KEY (use environment variables in production!)
  const PRIVATE_KEY = process.env.PRIVATE_KEY || "YOUR_PRIVATE_KEY";

  // Choose which order to buy (index 0 = first order)
  const orderToBuy = listingsData.listings[0];

  try {
    const txHash = await executeOrder(orderToBuy.order_hash, PRIVATE_KEY);
    console.log(`\n🔗 View on BaseScan: https://basescan.org/tx/${txHash}`);
  } catch (error) {
    console.error("\n❌ Error executing order:", error);
    throw error;
  }
}

// Uncomment to run
main().catch(console.error);

export { executeOrder, fetchOrderWithSignature, displayOrders };