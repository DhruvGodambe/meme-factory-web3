import { ethers } from "hardhat";

// Helper function to encode hook permissions
function getHookPermissions() {
  return {
    beforeInitialize: false,
    afterInitialize: false,
    beforeAddLiquidity: false,
    afterAddLiquidity: false,
    beforeRemoveLiquidity: false,
    afterRemoveLiquidity: false,
    beforeSwap: true,  // Our hook implements beforeSwap
    afterSwap: false,
    beforeDonate: false,
    afterDonate: false,
    beforeSwapReturnDelta: false,
    afterSwapReturnDelta: false,
    afterAddLiquidityReturnDelta: false,
    afterRemoveLiquidityReturnDelta: false
  };
}

async function main() {
  // Load deployment info
  const fs = require('fs');
  let deploymentInfo: any;
  
  try {
    deploymentInfo = JSON.parse(fs.readFileSync('deployment-info.json', 'utf8'));
  } catch (error) {
    console.error("❌ Could not load deployment-info.json");
    process.exit(1);
  }

  const [owner] = await ethers.getSigners();
  console.log("🚀 Setting up Uniswap v4 Pool");
  console.log("============================");
  console.log("Account:", owner.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(owner.address)), "ETH");

  const tokenAddress = deploymentInfo.contracts.RestrictedToken;
  const hookAddress = deploymentInfo.contracts.FeeHook;
  const poolManagerAddress = deploymentInfo.contracts.PoolManager;

  console.log("\n📝 Contract Addresses:");
  console.log("RestrictedToken:", tokenAddress);
  console.log("FeeHook:", hookAddress);
  console.log("PoolManager:", poolManagerAddress);

  // Get contracts
  const poolManager = await ethers.getContractAt("IPoolManager", poolManagerAddress);
  const restrictedToken = await ethers.getContractAt("RestrictedToken", tokenAddress);

  // WETH address on Sepolia
  const WETH_SEPOLIA = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9";
  const weth = await ethers.getContractAt("IERC20", WETH_SEPOLIA);
  
  // Sort tokens (Uniswap requires token0 < token1)
  const token0 = tokenAddress.toLowerCase() < WETH_SEPOLIA.toLowerCase() ? tokenAddress : WETH_SEPOLIA;
  const token1 = tokenAddress.toLowerCase() < WETH_SEPOLIA.toLowerCase() ? WETH_SEPOLIA : tokenAddress;
  
  console.log("\n💧 Pool Configuration:");
  console.log("====================");
  console.log("Token0:", token0);
  console.log("Token1:", token1);
  console.log("Hook:", hookAddress);

  // Pool parameters
  const fee = 3000; // 0.3% fee tier
  const tickSpacing = 60;
  const sqrtPriceX96 = "79228162514264337593543950336"; // 1:1 price
  const hookData = "0x"; // Empty hook data

  console.log("Fee Tier:", fee / 10000, "%");
  console.log("Tick Spacing:", tickSpacing);
  console.log("Initial Price: 1:1");

  // Check balances
  console.log("\n� Current Balances:");
  console.log("===================");
  const rstBalance = await restrictedToken.balanceOf(owner.address);
  const wethBalance = await weth.balanceOf(owner.address);
  console.log("RST:", ethers.formatEther(rstBalance));
  console.log("WETH:", ethers.formatEther(wethBalance));

  if (wethBalance === 0n) {
    console.log("\n⚠️  WARNING: You have 0 WETH!");
    console.log("You need WETH to create the pool. Options:");
    console.log("1. Wrap ETH: https://sepolia.etherscan.io/address/" + WETH_SEPOLIA + "#writeContract");
    console.log("2. Call deposit() with some ETH (e.g., 0.1 ETH)");
    console.log("\nRun this script again after getting WETH.");
    return;
  }

  // Step 1: Approve tokens
  console.log("\n📋 Step 1: Approving Tokens");
  console.log("===========================");
  
  const rstAllowance = await restrictedToken.allowance(owner.address, poolManagerAddress);
  const wethAllowance = await weth.allowance(owner.address, poolManagerAddress);
  
  const amountToApprove = ethers.parseEther("1000000"); // Approve large amount
  
  if (rstAllowance < ethers.parseEther("10000")) {
    console.log("Approving RST...");
    const tx1 = await restrictedToken.approve(poolManagerAddress, amountToApprove);
    await tx1.wait();
    console.log("✅ RST approved");
  } else {
    console.log("✅ RST already approved");
  }

  if (wethAllowance < ethers.parseEther("1")) {
    console.log("Approving WETH...");
    const tx2 = await weth.approve(poolManagerAddress, amountToApprove);
    await tx2.wait();
    console.log("✅ WETH approved");
  } else {
    console.log("✅ WETH already approved");
  }

  // Step 2: Initialize Pool
  console.log("\n📋 Step 2: Initializing Pool");
  console.log("============================");
  
  try {
    // Create PoolKey structure
    const poolKey = {
      currency0: token0,
      currency1: token1,
      fee: fee,
      tickSpacing: tickSpacing,
      hooks: hookAddress
    };

    console.log("Pool Key:", JSON.stringify(poolKey, null, 2));
    console.log("\nAttempting to initialize pool...");

    // Initialize the pool
    const initTx = await poolManager.initialize(
      poolKey,
      sqrtPriceX96
    );
    
    console.log("Transaction sent:", initTx.hash);
    const receipt = await initTx.wait();
    if (receipt) {
      console.log("✅ Pool initialized successfully!");
      console.log("Gas used:", receipt.gasUsed.toString());
    }

  } catch (error: any) {
    if (error.message.includes("PoolAlreadyInitialized")) {
      console.log("✅ Pool already initialized!");
    } else {
      console.error("❌ Error initializing pool:");
      console.error(error.message);
      console.log("\nThis might be because:");
      console.log("1. Hook permissions are incorrect");
      console.log("2. Pool Manager doesn't recognize the hook");
      console.log("3. Gas estimation failed");
      console.log("\nTry checking the hook deployment and permissions.");
    }
  }

  // Step 3: Add Liquidity (using PositionManager or ModifyLiquidity)
  console.log("\n� Step 3: Adding Liquidity");
  console.log("===========================");
  console.log("⚠️  Adding liquidity requires calling modifyLiquidity on PoolManager");
  console.log("This is a complex operation that requires:");
  console.log("1. Position Manager contract (if using v4-periphery)");
  console.log("2. Or direct modifyLiquidity call with proper parameters");
  console.log("3. Tick range selection");
  console.log("4. Liquidity amount calculation");
  
  console.log("\n💡 Recommended Approach:");
  console.log("Use Uniswap v4 frontend (when available) or PositionManager contract");

  console.log("\n✅ Pool Setup Complete!");
  console.log("======================");
  console.log("Your pool is initialized (or already exists)");
  console.log("View your pool on block explorer:");
  console.log("Token:", "https://sepolia.etherscan.io/address/" + tokenAddress);
  console.log("Hook:", "https://sepolia.etherscan.io/address/" + hookAddress);
  console.log("\nTo add liquidity, you can:");
  console.log("1. Use Uniswap v4 interface (when available)");
  console.log("2. Use v4-periphery PositionManager");
  console.log("3. Call PoolManager.modifyLiquidity() directly");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
