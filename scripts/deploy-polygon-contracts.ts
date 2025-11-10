import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  
  // Check minimum balance required (estimate)
  const minRequiredBalance = ethers.parseEther("0.1");
  if (balance < minRequiredBalance) {
    console.log("⚠️  WARNING: Account balance is low. Consider funding the account.");
    console.log("   Minimum recommended:", ethers.formatEther(minRequiredBalance), "ETH");
  }
  
  // Get current gas prices with retry logic
  let feeData;
  let gasRetries = 0;
  while (gasRetries < 3) {
    try {
      feeData = await ethers.provider.getFeeData();
      break;
    } catch (error) {
      gasRetries++;
      console.log(`Retrying gas price fetch (${gasRetries}/3)...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  if (!feeData) {
    console.log("⚠️  Could not fetch gas prices, using defaults");
    feeData = {
      gasPrice: BigInt(20_000_000_000), // 20 gwei default
      maxFeePerGas: BigInt(30_000_000_000), // 30 gwei default
      maxPriorityFeePerGas: BigInt(2_000_000_000) // 2 gwei default
    };
  }
  
  console.log("Current gas price:", feeData.gasPrice?.toString(), "wei");
  console.log("Current maxFeePerGas:", feeData.maxFeePerGas?.toString(), "wei");
  console.log("Current maxPriorityFeePerGas:", feeData.maxPriorityFeePerGas?.toString(), "wei");

  // Network detection and optimization
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log("🌐 Detected network chain ID:", chainId);
  
  let isBaseNetwork = chainId === 8453 || chainId === 84532; // Base mainnet or testnet
  if (isBaseNetwork) {
    console.log("🔵 Base network detected - using optimized settings for Base L2");
  } else {
    console.log("🟣 Polygon network detected");
  }

  // Network-specific addresses
  const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
  const POSITION_MANAGER = "0x7c5f5a4bbd8fd63184577525326123b519429bdc";
  const UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
  const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
  const FEE_ADDRESS = "0xF93E7518F79C2E1978D6862Dbf161270040e623E";
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97"
  
  console.log("\n=== Step 1: Deploy RestrictedToken ===");
  
  // Small delay before first deployment
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const RestrictedToken = await ethers.getContractFactory("RestrictedToken");
  const restrictedToken = await RestrictedToken.deploy();
  await restrictedToken.waitForDeployment();
  const restrictedTokenAddress = await restrictedToken.getAddress();
  console.log("RestrictedToken deployed to:", restrictedTokenAddress);

  // Delay between deployments
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n=== Step 2: Deploy OpenSeaNFTBuyer ===");
  const OpenSeaNFTBuyer = await ethers.getContractFactory("OpenSeaNFTBuyer");
  const openSeaBuyer = await OpenSeaNFTBuyer.deploy();
  await openSeaBuyer.waitForDeployment();
  const openSeaBuyerAddress = await openSeaBuyer.getAddress();
  console.log("OpenSeaNFTBuyer deployed to:", openSeaBuyerAddress);

  // Delay between deployments
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n=== Step 3: Deploy FakeNFTCollection ===");
  const FakeNFTCollection = await ethers.getContractFactory("FakeNFTCollection");
  const nftCollection = await FakeNFTCollection.deploy(
    "Test NFT Collection",
    "TEST",
    "https://api.example.com/metadata/"
  );
  await nftCollection.waitForDeployment();
  const nftCollectionAddress = await nftCollection.getAddress();
  console.log("FakeNFTCollection deployed to:", nftCollectionAddress);

  // Delay between deployments
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("\n=== Step 4: Deploy NFTStrategyHookMiner ===");
  const NFTStrategyHookMiner = await ethers.getContractFactory("NFTStrategyHookMiner");
  const hookMiner = await NFTStrategyHookMiner.deploy(
    POOL_MANAGER,
    FEE_ADDRESS
  );
  await hookMiner.waitForDeployment();
  const hookMinerAddress = await hookMiner.getAddress();
  console.log("NFTStrategyHookMiner deployed to:", hookMinerAddress);

  // The V4Router address on Polygon
  // TODO: Replace this with the actual Uniswap V4 Router address on Polygon when available
   // Using Universal Router as fallback
  
//   if (V4_ROUTER_ADDRESS === ethers.ZeroAddress) {
//     console.log("WARNING: Using Universal Router as V4Router. Update when V4Router is deployed on Polygon.");
//   }

  console.log("\n=== Step 5: Deploy NFTStrategyFactory (needed for hook deployment) ===");
  
  // Wait a bit before deployment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const NFTStrategyFactory = await ethers.getContractFactory("NFTStrategyFactory");
  const factory = await NFTStrategyFactory.deploy(
    POSITION_MANAGER,
    PERMIT2,
    POOL_MANAGER,
    UNIVERSAL_ROUTER,
    ROUTER,
    FEE_ADDRESS,
    restrictedTokenAddress,
    ethers.ZeroAddress // Will be set after hook deployment
  );
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("NFTStrategyFactory deployed to:", factoryAddress);

  console.log("\n=== Step 6: Mine Salt for NFTStrategyHook ===");
  
  // Check if salt is already mined
  const [existingHookAddress, existingSalt, isMined] = await hookMiner.getMinedData();
  if (isMined) {
    console.log("✅ Salt already mined!");
    console.log("Mined Hook Address:", existingHookAddress);
    console.log("Mined Salt:", existingSalt);
  } else {
    console.log("⏳ Mining salt with optimized parameters for Base network...");
    console.log("💡 Using adaptive mining strategy...");
    
    // Pre-mining analysis
    console.log("🔍 Analyzing mining conditions...");
    try {
      const estimatedGas = await hookMiner.mineSalt.estimateGas(
        restrictedTokenAddress,
        factoryAddress,
        FEE_ADDRESS
      );
      console.log("📊 Estimated gas for mining:", estimatedGas.toString());
      
      // If estimation fails or is too high, warn user
      if (estimatedGas > BigInt(25_000_000)) {
        console.log("⚠️  Warning: High gas estimation detected. This might indicate mining difficulty.");
        console.log("   Consider waiting for better network conditions or using a different approach.");
      }
    } catch (estimateError) {
      console.log("⚠️  Could not estimate gas - proceeding with adaptive strategy");
    }
    
    // Wait for next block to avoid nonce issues
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get current network conditions
    const latestBlock = await ethers.provider.getBlock('latest');
    const baseGasLimit = latestBlock?.gasLimit ? Number(latestBlock.gasLimit) * 0.8 : 30_000_000;
    
    console.log("📊 Network Analysis:");
    console.log("   Latest block gas limit:", latestBlock?.gasLimit?.toString());
    console.log("   Recommended max gas:", Math.floor(baseGasLimit).toLocaleString());
    
    let attempts = 0;
    const maxAttempts = 8; // Increased attempts
    let mineSaltTx;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`🎯 Mining attempt ${attempts}/${maxAttempts}...`);
        
        // Optimized gas strategy for Base network
        let gasLimit, gasPrice;
        
        if (attempts <= 3) {
          // Conservative approach first
          gasLimit = Math.min(5_000_000 + (attempts * 2_000_000), 15_000_000);
          gasPrice = feeData.gasPrice ? 
            BigInt(Math.floor(Number(feeData.gasPrice) * (1 + attempts * 0.05))) : 
            BigInt(1_000_000_000); // 1 gwei base
        } else if (attempts <= 6) {
          // Moderate increase
          gasLimit = Math.min(12_000_000 + (attempts * 3_000_000), 25_000_000);
          gasPrice = feeData.gasPrice ? 
            BigInt(Math.floor(Number(feeData.gasPrice) * (1.2 + attempts * 0.1))) : 
            BigInt(2_000_000_000); // 2 gwei
        } else {
          // Aggressive final attempts
          gasLimit = Math.min(20_000_000 + (attempts * 2_000_000), Math.floor(baseGasLimit));
          gasPrice = feeData.gasPrice ? 
            BigInt(Math.floor(Number(feeData.gasPrice) * (1.5 + attempts * 0.15))) : 
            BigInt(5_000_000_000); // 5 gwei
        }
        
        console.log(`   Strategy: ${attempts <= 3 ? 'Conservative' : attempts <= 6 ? 'Moderate' : 'Aggressive'}`);
        console.log(`   Gas limit: ${gasLimit.toLocaleString()}`);
        console.log(`   Gas price: ${(Number(gasPrice) / 1e9).toFixed(2)} gwei`);
        
        // Add transaction options for Base network
        const txOptions: any = {
          gasLimit: gasLimit,
          gasPrice: gasPrice,
          nonce: await ethers.provider.getTransactionCount(deployer.address, 'pending')
        };
        
        // For Base network, we might want to use EIP-1559
        if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas && attempts > 3) {
          delete txOptions.gasPrice;
          txOptions.maxFeePerGas = BigInt(Math.floor(Number(feeData.maxFeePerGas) * (1.2 + attempts * 0.1)));
          txOptions.maxPriorityFeePerGas = BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * (1.1 + attempts * 0.05)));
          console.log(`   Max fee per gas: ${(Number(txOptions.maxFeePerGas) / 1e9).toFixed(2)} gwei`);
          console.log(`   Max priority fee: ${(Number(txOptions.maxPriorityFeePerGas) / 1e9).toFixed(2)} gwei`);
        }
        
        mineSaltTx = await hookMiner.mineSalt(
          restrictedTokenAddress,
          factoryAddress,
          FEE_ADDRESS,
          txOptions
        );
        
        console.log("⏳ Salt mining transaction submitted:", mineSaltTx.hash);
        console.log("⏳ Waiting for confirmation...");
        
        // Increased timeout for mining operations
        const receipt = await mineSaltTx.wait(1);
        if (receipt) {
          if (receipt.status === 1) {
            console.log("✅ Salt mining successful in block:", receipt.blockNumber);
            console.log("Gas used:", receipt.gasUsed.toString());
            console.log("Effective gas price:", receipt.gasPrice?.toString(), "wei");
            break;
          } else {
            console.log(`❌ Attempt ${attempts} failed - transaction reverted`);
            if (attempts < maxAttempts) {
              console.log("🔄 Retrying with optimized parameters...");
              await new Promise(resolve => setTimeout(resolve, 2000 + attempts * 1000));
            }
          }
        }
        
      } catch (error: any) {
        console.log(`❌ Attempt ${attempts} failed:`, error.message);
        
        // Analyze the error for better retry strategy
        if (error.message.includes('gas') || error.message.includes('limit')) {
          console.log("💡 Gas-related error detected, adjusting strategy...");
        } else if (error.message.includes('nonce')) {
          console.log("💡 Nonce error detected, refreshing nonce...");
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (error.message.includes('reverted') && attempts <= 6) {
          console.log("� Transaction reverted - the mining might need more computational power");
        }
        
        if (attempts < maxAttempts) {
          const waitTime = Math.min(3000 + attempts * 2000, 15000);
          console.log(`🔄 Waiting ${waitTime/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          console.log("💀 All mining attempts failed. Solutions:");
          console.log("1. 🔧 Try with even higher gas limits manually");
          console.log("2. ⏰ Wait for network congestion to decrease");
          console.log("3. 🌐 Switch to a faster/less congested RPC endpoint");
          console.log("4. 💻 Consider mining salt off-chain with a dedicated script");
          console.log("5. 🔄 Run the script again - sometimes it works on retry");
          console.log("6. 📈 Check Base network gas tracker for optimal timing");
          
          // Don't throw immediately, let's try a final Hail Mary attempt
          if (attempts === maxAttempts) {
            console.log("🚨 Final attempt with maximum settings...");
            try {
              const hailMaryTx = await hookMiner.mineSalt(
                restrictedTokenAddress,
                factoryAddress,
                FEE_ADDRESS,
                {
                  gasLimit: Math.floor(baseGasLimit * 0.9),
                  gasPrice: feeData.gasPrice ? BigInt(Number(feeData.gasPrice) * 3) : BigInt(10_000_000_000),
                  nonce: await ethers.provider.getTransactionCount(deployer.address, 'pending')
                }
              );
              const hailMaryReceipt = await hailMaryTx.wait(1);
              if (hailMaryReceipt && hailMaryReceipt.status === 1) {
                console.log("🎉 Hail Mary attempt succeeded!");
                break;
              }
            } catch (finalError: any) {
              console.log("💀 Final attempt also failed:", finalError.message);
            }
          }
          
          throw new Error(`Salt mining failed after ${maxAttempts} attempts: ${error.message}`);
        }
      }
    }
  }
  
  // Get the final mined values after mining is complete
  const [finalMinedHookAddress, finalMinedSalt] = await hookMiner.getMinedData();
  console.log("Mined Hook Address:", finalMinedHookAddress);
  console.log("Mined Salt:", finalMinedSalt);

  console.log("\n=== Step 7: Deploy NFTStrategyHook using CREATE2 ===");
  console.log("⏳ Deploying hook with CREATE2 (mined salt)...");
  
  // Wait before deployment
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log("Using mined address:", finalMinedHookAddress);
  console.log("Using mined salt:", finalMinedSalt);
  console.log("Using mined address:", finalMinedHookAddress);
  console.log("Using mined salt:", finalMinedSalt);
  
  let deployHookTx;
  let deployAttempts = 0;
  const maxDeployAttempts = 3;
  
  while (deployAttempts < maxDeployAttempts) {
    try {
      deployAttempts++;
      console.log(`🚀 Deployment attempt ${deployAttempts}/${maxDeployAttempts}...`);
      
      const deployGasLimit = 5_000_000 + (deployAttempts * 1_000_000);
      const deployGasPrice = feeData.gasPrice ? BigInt(Math.floor(Number(feeData.gasPrice) * (1 + deployAttempts * 0.2))) : BigInt(1_000_000);
      
      deployHookTx = await hookMiner.deployHook(
        restrictedTokenAddress,
        factoryAddress,
        FEE_ADDRESS,
        {
          gasLimit: deployGasLimit,
          gasPrice: deployGasPrice
        }
      );
      
      console.log("⏳ Waiting for deployment transaction...");
      const deployReceipt = await deployHookTx.wait(2);
      
      if (deployReceipt && deployReceipt.status === 1) {
        console.log("✅ Hook deployed successfully!");
        console.log("Gas used:", deployReceipt.gasUsed.toString());
        break;
      } else {
        console.log(`❌ Deployment attempt ${deployAttempts} failed`);
        if (deployAttempts < maxDeployAttempts) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
    } catch (error: any) {
      console.log(`❌ Deployment attempt ${deployAttempts} failed:`, error.message);
      if (deployAttempts >= maxDeployAttempts) {
        throw new Error(`Hook deployment failed after ${maxDeployAttempts} attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  const actualHookAddress = await hookMiner.getHook();
  console.log("NFTStrategyHook deployed to:", actualHookAddress);
  
  if (actualHookAddress.toLowerCase() !== finalMinedHookAddress.toLowerCase()) {
    throw new Error("Hook address mismatch!");
  }

  console.log("\n=== Step 8: Configure Hook with OpenSeaBuyer ===");
  
  // First set the OpenSeaBuyer in the hook
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    // Use direct contract call instead of ethers contract factory attachment
    const setOpenSeaTx = await deployer.sendTransaction({
      to: actualHookAddress,
      data: ethers.id("setOpenSeaBuyer(address)").slice(0, 10) + 
            ethers.zeroPadValue(openSeaBuyerAddress, 32).slice(2),
      gasLimit: 100000
    });
    await setOpenSeaTx.wait();
    console.log("✅ OpenSeaBuyer address set in Hook:", openSeaBuyerAddress);
  } catch (error: any) {
    console.log("⚠️  OpenSeaBuyer configuration failed - will need manual setup");
    console.log("Error:", error.message);
    console.log("📋 Manual configuration needed:");
    console.log(`   hook.setOpenSeaBuyer("${openSeaBuyerAddress}")`);
  }

  // Configure router address in hook (needed for FeeContract deployments)
  try {
    console.log("⏳ Setting router address in hook...");
    const setRouterTx = await deployer.sendTransaction({
      to: actualHookAddress,
      data: ethers.id("setRouterAddress(address)").slice(0, 10) + 
            ethers.zeroPadValue(ROUTER, 32).slice(2),
      gasLimit: 100000
    });
    await setRouterTx.wait();
    console.log("✅ Router address set in Hook:", ROUTER);
  } catch (error: any) {
    console.log("⚠️  Router address configuration failed");
    console.log("📋 Manual configuration needed:");
    console.log(`   hook.setRouterAddress("${ROUTER}")`);
  }

  console.log("\n=== Step 9: Configure Factory ===");
  
  // Wait a bit before next transaction to avoid nonce issues
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Set the restricted token hook address to the NFTStrategyHook address
  const setRestrictedHookTx = await factory.setRestrictedTokenHookAddress(actualHookAddress);
  await setRestrictedHookTx.wait();
  console.log("Restricted token hook address set to NFTStrategyHook:", actualHookAddress);

  await new Promise(resolve => setTimeout(resolve, 1000));

  const setHookTx = await factory.updateHookAddress(actualHookAddress);
  await setHookTx.wait();
  console.log("Hook address set in factory");

  const setFeeTx = await factory.updateFeeToLaunch(ethers.parseEther("0.01")); // Example: 0.01 ETH fee
  await setFeeTx.wait();
  console.log("Fee to launch set");

  const setPublicTx = await factory.setPublicLaunches(true);
  await setPublicTx.wait();
  console.log("Public launches enabled");

  const setCollectionOwnerTx = await factory.setCollectionOwnerLaunches(true);
  await setCollectionOwnerTx.wait();
  console.log("Collection owner launches enabled");

  console.log("\n=== Step 10: Configure RestrictedToken ===");
  const setPoolManagerTx = await restrictedToken.setPoolManager(POOL_MANAGER);
  await setPoolManagerTx.wait();
  console.log("PoolManager set in RestrictedToken");

  const setHookTx2 = await restrictedToken.setHook(actualHookAddress);
  await setHookTx2.wait();
  console.log("Hook set in RestrictedToken");

  const setRouterTx = await restrictedToken.setSwapRouter(UNIVERSAL_ROUTER);
  await setRouterTx.wait();
  console.log("Router set in RestrictedToken");

  // Enable trading
  const enableTradingTx = await restrictedToken.setTradingEnabled(true);
  await enableTradingTx.wait();
  console.log("Trading enabled for RestrictedToken");

  console.log("\n=== Step 11: Save Deployment Info ===");
  const deploymentInfo = {
    network: "polygon",
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      NFTStrategyHookMiner: hookMinerAddress,
      NFTStrategyHook: actualHookAddress,
      NFTStrategyFactory: factoryAddress,
      RestrictedToken: restrictedTokenAddress,
      FakeNFTCollection: nftCollectionAddress,
      OpenSeaNFTBuyer: openSeaBuyerAddress,
      minedHookAddress: finalMinedHookAddress,
      minedSalt: finalMinedSalt,
    },
    config: {
      poolManager: POOL_MANAGER,
      positionManager: POSITION_MANAGER,
      universalRouter: UNIVERSAL_ROUTER,
      permit2: PERMIT2,
      router: UNIVERSAL_ROUTER,
      feeAddress: FEE_ADDRESS,
      restrictedTokenAddress: restrictedTokenAddress,
      restrictedTokenHookAddress: actualHookAddress, // Same as NFTStrategyHook
    }
  };

  const filename = `deployment-polygon-${Date.now()}.json`;
  const filepath = path.join(__dirname, "..", filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to:", filename);

  console.log("\n=== Step 12: Additional Configuration (Optional) ===");
  
  // TWAP increment is already set to 1 ether in the contract

  // Optionally set router restrictions
  try {
    const setRouterRestrictTx = await factory.setRouterRestrict(true);
    await setRouterRestrictTx.wait();
    console.log("Router restrictions enabled");
  } catch (error) {
    console.log("Could not set router restrictions (may not be in contract)");
  }

  console.log("\n=== Deployment Summary ===");
  console.log("✓ NFTStrategyHookMiner:", hookMinerAddress);
  console.log("✓ NFTStrategyHook:", actualHookAddress);
  console.log("✓ NFTStrategyFactory:", factoryAddress);
  console.log("✓ RestrictedToken:", restrictedTokenAddress);
  console.log("✓ FakeNFTCollection:", nftCollectionAddress);
  console.log("✓ OpenSeaNFTBuyer:", openSeaBuyerAddress);
  console.log("✓ Mined Salt:", finalMinedSalt);
  console.log("\n📋 Configuration:");
  console.log("  - Public Launches: ENABLED");
  console.log("  - Collection Owner Launches: ENABLED");
  console.log("  - Launch Fee: 0.01 MATIC");
  console.log("  - Hook Address:", actualHookAddress);
  console.log("  - RestrictedToken Hook:", actualHookAddress);
  console.log("\n🔗 To launch a new NFTStrategy:");
  console.log(`  factory.launchNFTStrategy("${nftCollectionAddress}", "Token Name", "SYMBOL")`);
  console.log("\n📝 Next steps:");
  console.log("1. Verify all contracts on Polygonscan");
  console.log("2. Transfer ownership if needed");
  console.log("3. Fund the factory for TWAP operations");
  console.log("4. Test with the FakeNFTCollection launch");
  console.log("5. If OpenSeaBuyer config failed, manually call:");
  console.log(`   hook.setOpenSeaBuyer("${openSeaBuyerAddress}")`);
  console.log("6. Deploy FeeContracts for collections:");
  console.log("   hook.deployNewFeeContract(rarityTokenAddress)");
  console.log("7. Configure hook router address:");
  console.log(`   hook.setRouterAddress("${ROUTER}")`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

