import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function testBaseConnection() {
  console.log("🧪 Testing Base Mainnet RPC Connection");
  console.log("=".repeat(50));

  // Test different RPC endpoints
  const rpcEndpoints = [
    {
      name: "Environment Variable (BASE_RPC_URL)",
      url: process.env.BASE_RPC_URL
    },
    {
      name: "Environment Variable (BASE_MAINNET_RPC_URL)", 
      url: process.env.BASE_MAINNET_RPC_URL
    },
    {
      name: "Public Base RPC",
      url: "https://mainnet.base.org"
    },
    {
      name: "Alchemy Base (if API key available)",
      url: process.env.ALCHEMY_API_KEY ? `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}` : null
    },
    {
      name: "Infura Base (if API key available)",
      url: process.env.INFURA_API_KEY ? `https://base-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}` : null
    }
  ];

  console.log("📋 Available Environment Variables:");
  console.log("- BASE_RPC_URL:", process.env.BASE_RPC_URL ? "✅ Set" : "❌ Not set");
  console.log("- BASE_MAINNET_RPC_URL:", process.env.BASE_MAINNET_RPC_URL ? "✅ Set" : "❌ Not set");
  console.log("- ALCHEMY_API_KEY:", process.env.ALCHEMY_API_KEY ? "✅ Set" : "❌ Not set");
  console.log("- INFURA_API_KEY:", process.env.INFURA_API_KEY ? "✅ Set" : "❌ Not set");
  console.log("- PRIVATE_KEY:", process.env.PRIVATE_KEY ? "✅ Set" : "❌ Not set");

  console.log("\n🔍 Testing RPC Endpoints:");
  
  for (const endpoint of rpcEndpoints) {
    if (!endpoint.url) {
      console.log(`\n❌ ${endpoint.name}: Not available`);
      continue;
    }

    try {
      console.log(`\n⏳ Testing ${endpoint.name}...`);
      console.log(`   URL: ${endpoint.url.replace(/\/[a-f0-9]{32}/i, '/***API_KEY***')}`);
      
      const provider = new ethers.JsonRpcProvider(endpoint.url);
      
      // Test basic connection
      const network = await provider.getNetwork();
      console.log(`   ✅ Connected! Chain ID: ${network.chainId}`);
      
      if (network.chainId !== 8453n) {
        console.log(`   ⚠️  Wrong chain ID! Expected 8453, got ${network.chainId}`);
        continue;
      }
      
      // Test block number
      const blockNumber = await provider.getBlockNumber();
      console.log(`   ✅ Latest block: ${blockNumber}`);
      
      // Test gas price
      const feeData = await provider.getFeeData();
      console.log(`   ✅ Gas price: ${feeData.gasPrice?.toString()} wei`);
      
      // Test balance (if private key available)
      if (process.env.PRIVATE_KEY) {
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const balance = await provider.getBalance(wallet.address);
        console.log(`   ✅ Wallet balance: ${ethers.formatEther(balance)} ETH`);
        console.log(`   📝 Wallet address: ${wallet.address}`);
      }
      
      console.log(`   🎉 ${endpoint.name} is working perfectly!`);
      
    } catch (error: any) {
      console.log(`   ❌ ${endpoint.name} failed:`);
      console.log(`      Error: ${error.message}`);
      
      if (error.message.includes("Must be authenticated")) {
        console.log(`      💡 Suggestion: Check your API key in the RPC URL`);
      } else if (error.message.includes("network")) {
        console.log(`      💡 Suggestion: Check network connectivity`);
      } else if (error.message.includes("rate limit")) {
        console.log(`      💡 Suggestion: Rate limited, try a different endpoint`);
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("📊 RECOMMENDATIONS:");
  console.log("=".repeat(50));
  
  console.log("\n1. 🔑 Set up your .env file with one of these:");
  console.log("   BASE_RPC_URL=https://mainnet.base.org");
  console.log("   # OR with Alchemy:");
  console.log("   BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY");
  console.log("   # OR with Infura:");
  console.log("   BASE_RPC_URL=https://base-mainnet.infura.io/v3/YOUR_API_KEY");
  
  console.log("\n2. 🔐 Make sure your PRIVATE_KEY is set:");
  console.log("   PRIVATE_KEY=your_private_key_here");
  
  console.log("\n3. 💰 Fund your wallet with Base ETH:");
  console.log("   - Bridge from Ethereum mainnet");
  console.log("   - Buy directly on Base DEXes");
  console.log("   - Use faucets for testnet");
  
  console.log("\n4. 🚀 Once setup, run deployment:");
  console.log("   npx hardhat run scripts/deploy-opensea-base.ts --network base");
}

// Test Hardhat network configuration
async function testHardhatConfig() {
  console.log("\n🔧 Testing Hardhat Network Configuration:");
  
  try {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    
    console.log("✅ Hardhat config is working!");
    console.log("   Network:", network.name || `Chain ID ${network.chainId}`);
    console.log("   Chain ID:", network.chainId.toString());
    console.log("   Deployer:", deployer.address);
    
    if (network.chainId === 8453n) {
      const balance = await ethers.provider.getBalance(deployer.address);
      console.log("   Balance:", ethers.formatEther(balance), "ETH");
      
      if (balance === 0n) {
        console.log("   ⚠️  WARNING: Account has no ETH for gas fees!");
      }
    }
    
  } catch (error: any) {
    console.log("❌ Hardhat config failed:");
    console.log("   Error:", error.message);
    
    if (error.message.includes("Must be authenticated")) {
      console.log("   💡 Fix: Update your BASE_RPC_URL with a valid API key");
    }
  }
}

async function main() {
  await testBaseConnection();
  await testHardhatConfig();
  
  console.log("\n✨ Connection test completed!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });