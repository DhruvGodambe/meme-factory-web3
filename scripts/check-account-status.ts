import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("🔍 Checking account status for:", deployer.address);
  
  const latestNonce = await ethers.provider.getTransactionCount(deployer.address, 'latest');
  const pendingNonce = await ethers.provider.getTransactionCount(deployer.address, 'pending');
  const balance = await ethers.provider.getBalance(deployer.address);
  
  console.log("📊 Account Status:");
  console.log("   Latest nonce:", latestNonce);
  console.log("   Pending nonce:", pendingNonce);
  console.log("   Difference:", pendingNonce - latestNonce);
  console.log("   Balance:", ethers.formatEther(balance), "ETH");
  
  if (pendingNonce > latestNonce) {
    console.log("\n⚠️  There are", pendingNonce - latestNonce, "pending transaction(s)");
    console.log("💡 Solutions:");
    console.log("   1. Wait for transactions to confirm (recommended)");
    console.log("   2. Cancel pending transactions by sending a transaction with higher gas and same nonce");
    console.log("   3. Use a different account");
    console.log("   4. Reset account state in MetaMask (Settings > Advanced > Clear activity and nonce data)");
  } else {
    console.log("\n✅ No pending transactions, ready to deploy");
  }
  
  // Check recent transactions
  console.log("\n🔍 Checking recent transactions...");
  try {
    const latestBlock = await ethers.provider.getBlock('latest');
    const currentBlock = latestBlock?.number || 0;
    const startBlock = Math.max(0, currentBlock - 100); // Check last 100 blocks
    
    console.log("   Searching blocks", startBlock, "to", currentBlock);
    
    let recentTxCount = 0;
    for (let blockNum = startBlock; blockNum <= currentBlock; blockNum++) {
      try {
        const block = await ethers.provider.getBlock(blockNum, true);
        if (block?.transactions) {
          for (const tx of block.transactions) {
            if (typeof tx === 'object' && tx.from?.toLowerCase() === deployer.address.toLowerCase()) {
              console.log(`   Block ${blockNum}: TX ${tx.hash} (nonce: ${tx.nonce})`);
              recentTxCount++;
            }
          }
        }
      } catch (e) {
        // Skip if can't read block
      }
    }
    
    if (recentTxCount === 0) {
      console.log("   No recent transactions found");
    } else {
      console.log("   Found", recentTxCount, "recent transaction(s)");
    }
  } catch (e) {
    console.log("   Could not check recent transactions:", e);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});