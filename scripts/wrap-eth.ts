import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();
  
  console.log("🔄 Wrapping ETH to WETH on Sepolia");
  console.log("==================================");
  console.log("Account:", owner.address);
  
  // WETH contract on Sepolia
  const WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
  
  // WETH ABI (just the deposit function)
  const WETH_ABI = [
    "function deposit() payable",
    "function balanceOf(address) view returns (uint256)",
    "function withdraw(uint256) external"
  ];
  
  const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, owner);
  
  // Check current balances
  const ethBalance = await ethers.provider.getBalance(owner.address);
  const wethBalance = await weth.balanceOf(owner.address);
  
  console.log("\n💰 Current Balances:");
  console.log("ETH:", ethers.formatEther(ethBalance));
  console.log("WETH:", ethers.formatEther(wethBalance));
  
  // Amount to wrap (default 0.1 ETH, or specify as argument)
  const amountToWrap = process.env.WRAP_AMOUNT 
    ? ethers.parseEther(process.env.WRAP_AMOUNT) 
    : ethers.parseEther("0.1");
  
  console.log("\n⚙️  Wrapping", ethers.formatEther(amountToWrap), "ETH to WETH...");
  
  if (ethBalance < amountToWrap) {
    console.error("❌ Insufficient ETH balance!");
    console.log("You need at least", ethers.formatEther(amountToWrap), "ETH");
    console.log("Your balance:", ethers.formatEther(ethBalance), "ETH");
    return;
  }
  
  try {
    // Wrap ETH
    const tx = await weth.deposit({ value: amountToWrap });
    console.log("Transaction sent:", tx.hash);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ ETH wrapped successfully!");
    
    // Check new balances
    const newEthBalance = await ethers.provider.getBalance(owner.address);
    const newWethBalance = await weth.balanceOf(owner.address);
    
    console.log("\n💰 New Balances:");
    console.log("ETH:", ethers.formatEther(newEthBalance));
    console.log("WETH:", ethers.formatEther(newWethBalance));
    console.log("\n✅ You can now run the pool setup script:");
    console.log("npx hardhat run scripts/setup-pool.ts --network sepolia");
    
  } catch (error: any) {
    console.error("❌ Error wrapping ETH:");
    console.error(error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
