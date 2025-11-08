import { ethers } from "ethers";

// Configuration
const CONFIG = {
  BASE_RPC: process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY",
  CONTRACT_ADDRESS: "0xaA46dd2434dE4b06Da8D4F7f0Ace4e152EecbbA6", // Updated with new deployment
  SEAPORT_V16_ADDRESS: "0x0000000000000068f116a894984e2db1123eb395",
};

// Contract ABI - focused on buyNFTBasic function
const CONTRACT_ABI = [
  "function buyNFTBasic((address considerationToken, uint256 considerationIdentifier, uint256 considerationAmount, address offerer, address zone, address offerToken, uint256 offerIdentifier, uint256 offerAmount, uint8 basicOrderType, uint256 startTime, uint256 endTime, bytes32 zoneHash, uint256 salt, bytes32 offererConduitKey, bytes32 fulfillerConduitKey, uint256 totalOriginalAdditionalRecipients, (uint256 amount, address recipient)[] additionalRecipients, bytes signature) parameters) external payable",
  "function owner() external view returns (address)",
  "function SEAPORT_ADDRESS() external view returns (address)",
];

/**
 * Test NFT purchase using BasicOrder (most gas efficient)
 */
async function testBasicOrderPurchase(privateKey: string) {
  console.log("🌊 Testing OpenSea NFT Purchase with Basic Order");
  console.log("=".repeat(60));

  // 1. Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(
    CONFIG.CONTRACT_ADDRESS,
    CONTRACT_ABI,
    wallet
  );

  console.log("Network: Base Mainnet");
  console.log("Buyer Address:", wallet.address);
  console.log("Contract Address:", CONFIG.CONTRACT_ADDRESS);

  // 2. Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log("Account Balance:", ethers.formatEther(balance), "ETH");

  // 3. The fulfillment data from OpenSea API
  const fulfillmentData = {
    "protocol": "seaport1.6",
    "fulfillment_data": {
      "transaction": {
        "function": "fulfillBasicOrder_efficient_6GL6yc((address,uint256,uint256,address,address,address,uint256,uint256,uint8,uint256,uint256,bytes32,uint256,bytes32,bytes32,uint256,(uint256,address)[],bytes))",
        "chain": 8453,
        "to": "0x0000000000000068f116a894984e2db1123eb395",
        "value": "90000000000000",
        "input_data": {
          "parameters": {
            "considerationToken": "0x0000000000000000000000000000000000000000",
            "considerationIdentifier": "0",
            "considerationAmount": "86850000000000",
            "offerer": "0x962fa344bbbf9276d01700eb7d7588031473f44d",
            "zone": "0x0000000000000000000000000000000000000000",
            "offerToken": "0x25b2ed7149fb8a05f6ef9407d9c8f878f59cd1e1",
            "offerIdentifier": "12339",
            "offerAmount": "1",
            "basicOrderType": 0,
            "startTime": "1762529668",
            "endTime": "1765121668",
            "zoneHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
            "salt": "27855337018906766782546881864045825683096516384821792734239252325679606678002",
            "offererConduitKey": "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
            "fulfillerConduitKey": "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
            "totalOriginalAdditionalRecipients": "2",
            "additionalRecipients": [
              {
                "amount": "900000000000",
                "recipient": "0x0000a26b00c1f0df003000390027140000faa719"
              },
              {
                "amount": "2250000000000",
                "recipient": "0x40fbfe5312330f278824ddbb7521ab77409192f0"
              }
            ],
            "signature": "0xf058d2b58cae45bb56b211cbfedd274a785aaf455c876519f550f80ce7731f6246cd90051c4ed8d6fe207532d8cdad97754eab46c67837253ca000b3c514df6b000009ef7bb3ebd7abb0755eedc02a59c9d07512df4451c2039aea38c4bf1845999762d34b12e74ee846c338466455cad0c77d7d37d1f8072d72ed279c9c9e7f80a2b5b57ef4dacd9316acf92b8ee6fc92391a8fc6a059b5eba4a9f9cbe862cb2ee4bd1c9b025a0fa638c98768fdaccfd11c3b8896e71f1f9b7d4b940cc40bed6977d1"
          }
        }
      }
    }
  };

  const params = fulfillmentData.fulfillment_data.transaction.input_data.parameters;
  const totalValue = BigInt(fulfillmentData.fulfillment_data.transaction.value);

  console.log("\n📋 Order Details:");
  console.log("NFT Contract:", params.offerToken);
  console.log("Token ID:", params.offerIdentifier);
  console.log("Total Price:", ethers.formatEther(totalValue), "ETH");
  console.log("Seller:", params.offerer);

  // 4. Verify balance is sufficient
  if (balance < totalValue) {
    throw new Error(
      `Insufficient balance. Need ${ethers.formatEther(totalValue)} ETH, have ${ethers.formatEther(balance)} ETH`
    );
  }

  // 5. Format the BasicOrderParameters struct
  const basicOrderParams = {
    considerationToken: params.considerationToken,
    considerationIdentifier: params.considerationIdentifier,
    considerationAmount: params.considerationAmount,
    offerer: params.offerer,
    zone: params.zone,
    offerToken: params.offerToken,
    offerIdentifier: params.offerIdentifier,
    offerAmount: params.offerAmount,
    basicOrderType: params.basicOrderType,
    startTime: params.startTime,
    endTime: params.endTime,
    zoneHash: params.zoneHash,
    salt: params.salt,
    offererConduitKey: params.offererConduitKey,
    fulfillerConduitKey: params.fulfillerConduitKey,
    totalOriginalAdditionalRecipients: params.totalOriginalAdditionalRecipients,
    additionalRecipients: params.additionalRecipients,
    signature: params.signature,
  };

  console.log("\n⛽ Estimating gas...");
  
  try {
    // 6. Estimate gas
    const gasEstimate = await contract.buyNFTBasic.estimateGas(basicOrderParams, {
      value: totalValue,
    });
    console.log("Gas estimate:", gasEstimate.toString());

    // 7. Get current gas price
    const feeData = await provider.getFeeData();
    console.log("Current gas price:", feeData.gasPrice?.toString(), "wei");

    // 8. Calculate transaction cost
    const gasCost = gasEstimate * (feeData.gasPrice || BigInt(1000000));
    const totalCost = totalValue + gasCost;
    
    console.log("\n💰 Cost Breakdown:");
    console.log("NFT Price:", ethers.formatEther(totalValue), "ETH");
    console.log("Gas Cost:", ethers.formatEther(gasCost), "ETH");
    console.log("Total Cost:", ethers.formatEther(totalCost), "ETH");

    if (balance < totalCost) {
      throw new Error(
        `Insufficient balance for total cost. Need ${ethers.formatEther(totalCost)} ETH, have ${ethers.formatEther(balance)} ETH`
      );
    }

    // 9. Execute the purchase
    console.log("\n🚀 Executing NFT purchase...");
    console.log("⚠️  This will spend real ETH on Base Mainnet!");
    
    // Add a safety check - only proceed if explicitly confirmed
    const isConfirmed = process.env.CONFIRM_PURCHASE === "true";
    if (!isConfirmed) {
      console.log("🛑 Purchase not confirmed. Set CONFIRM_PURCHASE=true in .env to proceed");
      console.log("This is a safety measure to prevent accidental purchases.");
      return;
    }

    const tx = await contract.buyNFTBasic(basicOrderParams, {
      value: totalValue,
      gasLimit: (gasEstimate * 120n) / 100n, // 20% buffer
      gasPrice: feeData.gasPrice,
    });

    console.log("📝 Transaction sent:", tx.hash);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log("✅ Transaction confirmed!");
      console.log("Block number:", receipt.blockNumber);
      console.log("Gas used:", receipt.gasUsed.toString());
      console.log("Actual gas cost:", ethers.formatEther(receipt.gasUsed * receipt.gasPrice), "ETH");
      
      console.log("\n🎉 NFT PURCHASE SUCCESSFUL!");
      console.log("🔗 View on BaseScan:", `https://basescan.org/tx/${tx.hash}`);
      console.log("🌊 View on OpenSea:", `https://opensea.io/assets/base/${params.offerToken}/${params.offerIdentifier}`);
      
      return tx.hash;
    } else {
      throw new Error("Transaction failed");
    }

  } catch (error: any) {
    console.error("❌ Purchase failed:", error.message);
    
    if (error.message.includes("insufficient funds")) {
      console.log("\n💡 Insufficient funds. Please add more ETH to your wallet.");
    } else if (error.message.includes("execution reverted")) {
      console.log("\n💡 Transaction reverted. Possible reasons:");
      console.log("- Order might have expired or been filled");
      console.log("- NFT might no longer be available");
      console.log("- Price might have changed");
    } else if (error.message.includes("replacement fee too low")) {
      console.log("\n💡 Gas price too low. Try increasing gas price.");
    }
    
    throw error;
  }
}

/**
 * Verify contract is working
 */
async function verifyContract() {
  console.log("\n🔍 Verifying Contract Setup...");
  
  const provider = new ethers.JsonRpcProvider(CONFIG.BASE_RPC);
  const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  
  try {
    const seaportAddress = await contract.SEAPORT_ADDRESS();
    const owner = await contract.owner();
    
    console.log("✅ Contract verified:");
    console.log("- Seaport Address:", seaportAddress);
    console.log("- Contract Owner:", owner);
    
    if (seaportAddress.toLowerCase() !== CONFIG.SEAPORT_V16_ADDRESS.toLowerCase()) {
      throw new Error("Seaport address mismatch!");
    }
    
    return true;
  } catch (error: any) {
    console.error("❌ Contract verification failed:", error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log("🚀 OpenSea Basic Order Test");
  console.log("=".repeat(40));
  
  // Get private key from environment
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not found in environment variables");
  }

  // Verify contract first
  const isVerified = await verifyContract();
  if (!isVerified) {
    throw new Error("Contract verification failed");
  }

  // Test the purchase
  await testBasicOrderPurchase(PRIVATE_KEY);
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
}

export { testBasicOrderPurchase, verifyContract };