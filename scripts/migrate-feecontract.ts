import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";

async function safeDelay(ms = 1500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();

  console.log(`\n🔄 Migrating FeeContract - Redeploying Hook with Updated FeeContract`);
  console.log(`🚀 Deploying with account: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const networkName =
    chainId === 8453 || chainId === 84532
      ? "base"
      : chainId === 11155111
      ? "sepolia"
      : "polygon";
  console.log(`🌐 Network: ${networkName} (${chainId})`);

  // Verify we're on Base Mainnet (chainId 8453)
  if (chainId !== 8453) {
    console.warn(`⚠️  WARNING: Expected Base Mainnet (chainId 8453), but connected to chainId ${chainId}`);
    console.warn(`   Contract addresses are for Base Mainnet. Proceed with caution.`);
  }

  // Load existing contract addresses from README.md (Base Mainnet)
  console.log("\n📂 Loading existing contract addresses from Base Mainnet...");
  
  // Base Mainnet addresses from README.md
  // Source: https://github.com/.../README.md (Latest Deployment - Base Mainnet section)
  const EXISTING_CONTRACTS = {
    NFTStrategyFactory: "0x6E4Eef9b5ff69E7c22bB5EAD0a7dCc62ad567039",
    NFTStrategyHook: "0xcd1d8048FC7bfec63118a5bF54D477dE3D3168C4",
    NFTStrategy: "0x9a6204114d072cdfcf5cebb6e4f93b0e72528ee3",
    FeeContract: "0x7b672e5e87da80656b43622ddc40c4b3dc6253ed",
    NFTStrategyHookMiner: "0x58e925B1b1929565A878808010aea19097793111",
    OpenSeaNFTBuyer: "0x1df4E3643Dc9119Df655a0BfA9502AB9FaA6356c",
    RestrictedToken: "0x11bd3952C622D69551DcE28b5b9769CA39c88dBc",
  };

  console.log(`✅ Loaded Base Mainnet addresses:`);
  console.log(`   Factory: ${EXISTING_CONTRACTS.NFTStrategyFactory}`);
  console.log(`   Old Hook: ${EXISTING_CONTRACTS.NFTStrategyHook}`);
  console.log(`   Hook Miner: ${EXISTING_CONTRACTS.NFTStrategyHookMiner}`);
  console.log(`   RestrictedToken: ${EXISTING_CONTRACTS.RestrictedToken}`);
  console.log(`   OpenSeaNFTBuyer: ${EXISTING_CONTRACTS.OpenSeaNFTBuyer}`);

  const feeData = await ethers.provider.getFeeData();
  const gasBump = 3;
  const maxFeePerGas = feeData.maxFeePerGas
    ? BigInt(Math.floor(Number(feeData.maxFeePerGas) * gasBump))
    : BigInt(20_000_000_000);
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
    ? BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * gasBump))
    : BigInt(2_000_000_000);

  const txOpts = {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit: 12_000_000,
  };

  const deploymentSummary = {
    openSeaBuyerRedeployed: false,
    hookMinerRedeployed: false,
    hookRedeployed: false,
  };

  console.log(`\n⛽ Gas config:
  MaxFee: ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei
  PriorityFee: ${ethers.formatUnits(maxPriorityFeePerGas, "gwei")} gwei`);

  // Nonce management helper - always use "pending" to account for pending transactions
  async function getNextNonce() {
    return await ethers.provider.getTransactionCount(deployer.address, "pending");
  }

  // --- addresses from existing Base Mainnet deployment ---
  const FACTORY_ADDRESS = EXISTING_CONTRACTS.NFTStrategyFactory;
  const RESTRICTED_TOKEN = EXISTING_CONTRACTS.RestrictedToken;
  const OLD_HOOK_ADDRESS = EXISTING_CONTRACTS.NFTStrategyHook;
  const HOOK_MINER_ADDRESS = EXISTING_CONTRACTS.NFTStrategyHookMiner;
  const OPEN_SEA_BUYER = EXISTING_CONTRACTS.OpenSeaNFTBuyer;
  const FEE_ADDRESS = deployer.address; // Use current deployer as fee address

  // Get addresses from factory if needed
  const factory = await ethers.getContractAt("NFTStrategyFactory", FACTORY_ADDRESS);
  const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";

  // --- STEP 1: Verify OpenSeaNFTBuyer has correct interface ---
  console.log("\n=== 🔍 Verifying OpenSeaNFTBuyer Interface ===");
  try {
    const openSeaBuyer = await ethers.getContractAt("OpenSeaNFTBuyer", OPEN_SEA_BUYER);
    // Try to get the interface - if it has buyNFTBasic, it's the new version
    const hasBuyNFTBasic = openSeaBuyer.interface.hasFunction("buyNFTBasic");
    if (!hasBuyNFTBasic) {
      console.log("⚠️  OpenSeaNFTBuyer doesn't have buyNFTBasic - needs redeployment");
      console.log("   This will be handled in the migration");
    } else {
      console.log("✅ OpenSeaNFTBuyer has correct interface");
    }
  } catch (err: any) {
    console.log("⚠️  Could not verify OpenSeaNFTBuyer:", err.message);
  }

  // --- STEP 2: Redeploy OpenSeaNFTBuyer if needed ---
  let openSeaBuyerAddress = OPEN_SEA_BUYER;
  try {
    const openSeaBuyer = await ethers.getContractAt("OpenSeaNFTBuyer", OPEN_SEA_BUYER);
    const hasBuyNFTBasic = openSeaBuyer.interface.hasFunction("buyNFTBasic");
    if (!hasBuyNFTBasic) {
      console.log("\n=== 🌊 Redeploying OpenSeaNFTBuyer ===");
      const OpenSeaFactory = await ethers.getContractFactory("OpenSeaNFTBuyer");
      const newOpenSeaBuyer = await OpenSeaFactory.deploy({
        ...txOpts,
        nonce: await ethers.provider.getTransactionCount(deployer.address, "latest"),
      });
      await newOpenSeaBuyer.waitForDeployment();
      openSeaBuyerAddress = await newOpenSeaBuyer.getAddress();
      console.log(`✅ New OpenSeaNFTBuyer deployed at: ${openSeaBuyerAddress}`);
      deploymentSummary.openSeaBuyerRedeployed = true;
      await safeDelay();
    }
  } catch (err: any) {
    console.log("⚠️  OpenSeaNFTBuyer redeployment skipped:", err.message);
  }

  // Helper function to deploy HookMiner with optimized gas estimation
  async function deployHookMinerWithRetry() {
    const HookMinerFactory = await ethers.getContractFactory("NFTStrategyHookMiner");
    
    // Get current block to check gas limit
    const block = await ethers.provider.getBlock("latest");
    const blockGasLimit = block?.gasLimit || BigInt(30_000_000);
    const safeGasLimit = blockGasLimit * BigInt(70) / BigInt(100); // Use 70% of block limit for safety
    
    // Estimate gas first (deployment estimation)
    console.log("   Estimating gas for HookMiner deployment...");
    let estimatedGas: bigint;
    try {
      const deployTx = await HookMinerFactory.getDeployTransaction(POOL_MANAGER, FEE_ADDRESS);
      estimatedGas = await ethers.provider.estimateGas(deployTx);
      console.log(`   Estimated gas: ${estimatedGas.toString()}`);
      
      // If estimate exceeds safe limit, the contract bytecode might be too large
      if (estimatedGas > safeGasLimit) {
        console.log(`   ⚠️  Estimated gas (${estimatedGas.toString()}) exceeds safe limit (${safeGasLimit.toString()})`);
        console.log(`   Contract bytecode may be too large for single transaction deployment.`);
      }
    } catch (err: any) {
      console.log(`   ⚠️  Gas estimation failed: ${err.message}`);
      // If estimation fails, use conservative estimate based on bytecode size
      estimatedGas = BigInt(Math.min(Number(safeGasLimit), 18_000_000));
    }
    
    // Use 110% of estimate but cap at safe limit (70% of block gas limit)
    const maxGasLimit = Number(safeGasLimit);
    const gasLimit = Number(estimatedGas * BigInt(110) / BigInt(100));
    const finalGasLimit = Math.min(gasLimit, maxGasLimit);
    
    console.log(`   Block gas limit: ${blockGasLimit.toString()}`);
    console.log(`   Safe gas limit: ${maxGasLimit.toLocaleString()}`);
    console.log(`   Using gas limit: ${finalGasLimit.toLocaleString()}`);
    
    // Try deployment with retries at different gas limits
    const gasLimits = [
      finalGasLimit,
      Math.floor(finalGasLimit * 0.95), // 95% if first fails
      Math.floor(finalGasLimit * 0.90), // 90% if second fails
      Math.min(18_000_000, maxGasLimit), // Conservative fallback
    ].filter(g => g > 0);
    
    for (let i = 0; i < gasLimits.length; i++) {
      const gasLimitToTry = gasLimits[i];
      try {
        console.log(`   Attempt ${i + 1}/${gasLimits.length} with gas limit: ${gasLimitToTry.toLocaleString()}`);
        const newHookMiner = await HookMinerFactory.deploy(POOL_MANAGER, FEE_ADDRESS, {
          ...txOpts,
          gasLimit: gasLimitToTry,
          nonce: await getNextNonce(),
        });
        await newHookMiner.waitForDeployment();
        const address = await newHookMiner.getAddress();
        console.log(`✅ HookMiner deployed successfully at: ${address}`);
        return newHookMiner;
      } catch (err: any) {
        if (i === gasLimits.length - 1) {
          const errorMsg = err.receipt?.status === 0 
            ? `Transaction reverted - contract bytecode may be too large`
            : err.message;
          throw new Error(`HookMiner deployment failed after ${gasLimits.length} attempts: ${errorMsg}`);
        }
        console.log(`   ⚠️  Attempt ${i + 1} failed: ${err.message || "Unknown error"}`);
        if (err.receipt?.status === 0) {
          console.log(`   Transaction reverted (status: 0) - trying lower gas limit...`);
        }
        await safeDelay(2000); // Wait before retry
      }
    }
    
    throw new Error("HookMiner deployment failed - all retries exhausted");
  }

  // --- STEP 3: Check existing Hook Miner or deploy new one ---
  console.log("\n=== ⛏️  Setting up Hook Miner ===");
  let hookMinerAddress = HOOK_MINER_ADDRESS;
  let hookMiner;

  try {
    hookMiner = await ethers.getContractAt("NFTStrategyHookMiner", hookMinerAddress);
    console.log(`✅ Found existing Hook Miner at: ${hookMinerAddress}`);
    
    // Check if salt is already mined
    const [existingHook, existingSalt, saltAlreadyMined] = await hookMiner.getMinedData();
    if (saltAlreadyMined) {
      console.log(`⚠️  Salt already mined in existing Hook Miner:`);
      console.log(`   Mined Hook: ${existingHook}`);
      console.log(`   Mined Salt: ${existingSalt}`);
      
      // Since FeeContract bytecode changed, hook bytecode changed, so we need a new salt
      // We'll need to deploy a new HookMiner to store the new salt
      console.log("\n💡 Since hook bytecode changed (FeeContract updated), we need a new salt.");
      console.log("   Deploying a new HookMiner to store the new salt...");
      
      const newHookMiner = await deployHookMinerWithRetry();
      hookMinerAddress = await newHookMiner.getAddress();
      hookMiner = newHookMiner;
      console.log(`   (Old Hook Miner: ${HOOK_MINER_ADDRESS} - can be kept for reference)`);
      deploymentSummary.hookMinerRedeployed = true;
      await safeDelay();
    } else {
      console.log(`✅ Existing Hook Miner has no salt stored - can be used`);
    }
  } catch (err: any) {
    console.log("⚠️  Hook Miner not found or error accessing, deploying new one...");
    const newHookMiner = await deployHookMinerWithRetry();
    hookMinerAddress = await newHookMiner.getAddress();
    hookMiner = newHookMiner;
    deploymentSummary.hookMinerRedeployed = true;
    await safeDelay();
  }

  // --- STEP 4: Salt compute + store + CREATE2 deploy new Hook ---
  console.log("\n=== 🔄 Salt Simulation + New Hook Deployment ===");

  // Check hook miner ownership
  const hookMinerOwner = await hookMiner.owner();
  console.log(`🔑 Hook Miner Owner: ${hookMinerOwner}`);
  console.log(`   Deployer: ${deployer.address}`);
  const isOwner = hookMinerOwner.toLowerCase() === deployer.address.toLowerCase();
  console.log(`   Is Deployer Owner: ${isOwner ? "✅ YES" : "❌ NO"}`);

  const [existingHook, existingSalt, isMined] = await hookMiner.getMinedData();
  let finalHookAddr: string, finalSalt: string;

  // Since FeeContract bytecode changed, we need a new salt
  console.log("\n🧮 Computing new salt for updated FeeContract bytecode...");
  const [predictedHook, predictedSalt] = await (hookMiner as any).simulateSalt(
    RESTRICTED_TOKEN,
    FACTORY_ADDRESS,
    FEE_ADDRESS
  );
  console.log(`   Predicted Hook: ${predictedHook}`);
  console.log(`   Predicted Salt: ${predictedSalt}`);

  // Check if this salt is already stored
  const [storedHook, storedSalt, storedIsMined] = await hookMiner.getMinedData();
  if (storedIsMined && storedHook.toLowerCase() === predictedHook.toLowerCase()) {
    console.log("ℹ️  Salt already mined on-chain for this bytecode");
    finalHookAddr = storedHook;
    finalSalt = storedSalt;
  } else {
    if (!isOwner) {
      console.error("❌ ERROR: Deployer is not the owner of Hook Miner!");
      console.error(`   Owner: ${hookMinerOwner}`);
      console.error(`   Deployer: ${deployer.address}`);
      console.error("\n💡 Solutions:");
      console.error("   1. Use the owner account to run this script");
      console.error("   2. Or have the owner call storeSalt() manually");
      console.error("   3. Or transfer ownership to deployer first");
      throw new Error("Deployer is not the owner of Hook Miner");
    }

    if (storedIsMined) {
      console.log("⚠️  WARNING: Salt already mined for different bytecode!");
      console.log(`   Stored Hook: ${storedHook}`);
      console.log(`   Predicted Hook: ${predictedHook}`);
      console.log("   This means the hook bytecode changed. You may need to:");
      console.log("   1. Deploy a new HookMiner contract, OR");
      console.log("   2. Use a different RestrictedToken/Factory/FeeAddress combination");
      throw new Error("Salt already mined for different hook bytecode. Hook bytecode must have changed.");
    }

    console.log("💾 Storing new salt...");
    try {
      const storeSaltTx = await hookMiner.storeSalt(predictedHook, predictedSalt, {
        ...txOpts,
        gasLimit: 15_000_000,
      });
      const storeReceipt = await storeSaltTx.wait();
      console.log(
        `✅ Salt stored (gasUsed: ${storeReceipt?.gasUsed.toString() || "unknown"})`
      );

      const [hook, salt] = await hookMiner.getMinedData();
      finalHookAddr = hook;
      finalSalt = salt;
    } catch (error: any) {
      console.error("❌ Failed to store salt:", error.message);
      if (error.reason) {
        console.error("   Reason:", error.reason);
      }
      throw error;
    }
  }

  // Safety check before CREATE2
  console.log("\n🧪 Dry-running CREATE2 deployment (staticCall)...");
  try {
    await hookMiner.deployHook.staticCall(
      RESTRICTED_TOKEN,
      FACTORY_ADDRESS,
      FEE_ADDRESS
    );
    console.log("✅ CREATE2 dry-run success, ready to deploy");
  } catch (err: any) {
    console.error("❌ CREATE2 dry-run reverted:", err.message);
    console.error(
      "⚠️  Check if Hook bytecode, constructor args, or salt mismatch"
    );
    process.exit(1);
  }

  console.log("🚀 Deploying new Hook via CREATE2...");
  const deployHookTx = await hookMiner.deployHook(
    RESTRICTED_TOKEN,
    FACTORY_ADDRESS,
    FEE_ADDRESS,
    { ...txOpts, gasLimit: 10_000_000 }
  );
  const deployReceipt = await deployHookTx.wait();
  console.log(
    `✅ New Hook deployed (gasUsed: ${deployReceipt?.gasUsed.toString() || "unknown"})`
  );

  const actualHookAddr = await hookMiner.getHook();
  console.log(`📦 New Hook deployed at: ${actualHookAddr}`);
  deploymentSummary.hookRedeployed = true;

  if (actualHookAddr.toLowerCase() === OLD_HOOK_ADDRESS.toLowerCase()) {
    console.log("⚠️  WARNING: New hook address matches old hook address!");
    console.log("   This means the bytecode didn't change or salt collision occurred.");
  } else {
    console.log(`✅ New hook address differs from old: ${OLD_HOOK_ADDRESS}`);
  }

  // --- STEP 5: Configure new Hook ---
  console.log("\n=== ⚙️ Configuring New Hook ===");
  const newHook = await ethers.getContractAt("NFTStrategyHook", actualHookAddr);

  const highGas = {
    ...txOpts,
    gasLimit: 10_000_000,
    maxFeePerGas: txOpts.maxFeePerGas * BigInt(2),
    maxPriorityFeePerGas: txOpts.maxPriorityFeePerGas * BigInt(2),
  };

  // Set router address
  try {
    const setRouterTx = await newHook.setRouterAddress(ROUTER, highGas);
    await setRouterTx.wait();
    console.log("✅ Router address set in new hook");
    await safeDelay();
  } catch (err: any) {
    console.log("⚠️  Could not set router address:", err.message);
  }

  // Set OpenSea buyer address
  try {
    const setOpenSeaTx = await newHook.setOpenSeaBuyer(openSeaBuyerAddress, highGas);
    await setOpenSeaTx.wait();
    console.log("✅ OpenSea buyer address set in new hook");
    await safeDelay();
  } catch (err: any) {
    console.log("⚠️  Could not set OpenSea buyer:", err.message);
  }

  // --- STEP 6: Update Factory to use new Hook ---
  console.log("\n=== 🔄 Updating Factory to New Hook ===");
  
  // Wait a bit to ensure any pending transactions are processed
  await safeDelay(2000);
  
  const factoryTxs = [
    {
      name: "updateHookAddress",
      call: async () => {
        const nonce = await getNextNonce();
        return factory.updateHookAddress(actualHookAddr, {
          ...highGas,
          nonce: nonce,
        });
      },
    },
    {
      name: "setRestrictedTokenHookAddress",
      call: async () => {
        const nonce = await getNextNonce();
        return factory.setRestrictedTokenHookAddress(actualHookAddr, {
          ...highGas,
          nonce: nonce,
        });
      },
    },
  ];

  for (const txInfo of factoryTxs) {
    let retries = 3;
    while (retries > 0) {
      try {
        console.log(`⏳ Sending ${txInfo.name}...`);
        const tx = await txInfo.call();
        console.log(`   Transaction hash: ${tx.hash}`);
        console.log(`   Waiting for confirmation...`);
        const receipt = await tx.wait();
        console.log(
          `✅ ${txInfo.name} confirmed (${receipt?.gasUsed.toString()} gas)`
        );
        await safeDelay(3000); // Longer delay between factory updates
        break; // Success, exit retry loop
      } catch (error: any) {
        retries--;
        if (error.message?.includes("replacement transaction underpriced") || 
            error.message?.includes("nonce") ||
            error.code === -32000) {
          if (retries > 0) {
            console.log(`⚠️  Transaction conflict detected. Waiting 5 seconds and retrying... (${retries} retries left)`);
            await safeDelay(5000);
            // Wait for pending transactions to clear
            continue;
          } else {
            throw new Error(`Failed to send ${txInfo.name} after retries: ${error.message}`);
          }
        } else {
          throw error;
        }
      }
    }
  }
  console.log("✅ Factory updated to use new hook");

  // --- STEP 7: Migration Notes ---
  console.log("\n=== 📝 Migration Notes ===");
  console.log("⚠️  IMPORTANT: FeeContract deployment is manual.");
  console.log("   To deploy new FeeContracts for RARITY tokens, use:");
  console.log("   - newHook.deployNewFeeContract(rarityToken) - for new deployments");
  console.log("   - newHook.forceRotateFeeContract(rarityToken) - to rotate existing ones");
  console.log("   Existing FeeContract instances tied to previous hook remain active until manually rotated.");

  // --- Save migration ---
  const migration = {
    network: networkName,
    chainId: chainId,
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    migrationType: "FeeContract Update - Smart Buy with Floor Price",
    description: "Redeployed hook with updated FeeContract that includes smartBuyNFT with floor price comparison between OpenSea and previous FeeContract",
    oldDeployment: {
      hook: OLD_HOOK_ADDRESS,
      openSeaBuyer: OPEN_SEA_BUYER,
      feeContract: EXISTING_CONTRACTS.FeeContract,
    },
    newDeployment: {
      hook: actualHookAddr,
      openSeaBuyer: openSeaBuyerAddress,
      salt: finalSalt,
    },
    redeployments: {
      openSeaBuyer: deploymentSummary.openSeaBuyerRedeployed,
      hookMiner: deploymentSummary.hookMinerRedeployed,
      hook: deploymentSummary.hookRedeployed,
    },
    contracts: {
      NFTStrategyFactory: FACTORY_ADDRESS,
      NFTStrategyHookMiner: hookMinerAddress,
      NFTStrategyHook: actualHookAddr,
      RestrictedToken: RESTRICTED_TOKEN,
      OpenSeaNFTBuyer: openSeaBuyerAddress,
      oldHook: OLD_HOOK_ADDRESS,
      oldFeeContract: EXISTING_CONTRACTS.FeeContract,
      // All other existing contracts remain unchanged
      existingContracts: EXISTING_CONTRACTS,
    },
  };

  const filename = `migration-feecontract-${networkName}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(__dirname, "..", filename),
    JSON.stringify(migration, null, 2)
  );
  console.log(`\n💾 Migration saved: ${filename}`);

  console.log("\n🎉 Migration complete! New hook deployed with updated FeeContract.\n");
  console.log("📋 Summary:");
  console.log(
    `   OpenSea Buyer: ${deploymentSummary.openSeaBuyerRedeployed ? "redeployed" : "reused"} @ ${openSeaBuyerAddress}`
  );
  console.log(
    `   Hook Miner: ${deploymentSummary.hookMinerRedeployed ? "redeployed" : "reused"} @ ${hookMinerAddress}`
  );
  console.log(`   Old Hook: ${OLD_HOOK_ADDRESS}`);
  console.log(`   New Hook: ${actualHookAddr}`);
  console.log(`   Factory Updated: ✅`);
  console.log("   Next Steps: Deploy FeeContracts manually using newHook.deployNewFeeContract(rarityToken)\n");
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});

