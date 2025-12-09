import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Real swap test - performs an actual swap and traces fee processing step-by-step
 * Use this after deploying a test collection and RARITY token
 */
async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();

  console.log(`\n🔄 REAL SWAP TEST WITH FEE TRACING`);
  console.log(`Account: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

  // Contract addresses
  const FACTORY = "0xe6DB176883e03661Ca6EE93B542A8661E8caA0C6";
  const HOOK = "0x7a19fdC7433095eE94488E9186220FAF72c768C4";
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";

  // TODO: Replace with your actual deployed collection address
  const TEST_COLLECTION = process.env.TEST_COLLECTION || ethers.ZeroAddress;

  if (TEST_COLLECTION === ethers.ZeroAddress) {
    console.error("❌ ERROR: Set TEST_COLLECTION environment variable");
    console.error("   Example: TEST_COLLECTION=0x... npx hardhat run scripts/test-real-swap.ts --network base\n");
    process.exit(1);
  }

  const factory = await ethers.getContractAt("NFTStrategyFactory", FACTORY);
  const hook = await ethers.getContractAt("NFTStrategyHook", HOOK);
  const router = await ethers.getContractAt("IUniswapV4Router04", ROUTER);

  // Get RARITY token for this collection
  const rarityToken = await factory.collectionToNFTStrategy(TEST_COLLECTION);
  if (rarityToken === ethers.ZeroAddress) {
    console.error(`❌ No RARITY token found for collection ${TEST_COLLECTION}`);
    console.error(`   Deploy one first via factory.launchNFTStrategy()\n`);
    process.exit(1);
  }

  console.log(`📋 Test Setup:`);
  console.log(`  Collection: ${TEST_COLLECTION}`);
  console.log(`  RARITY Token: ${rarityToken}\n`);

  // Check FeeContract status
  const activeFeeContract = await hook.getActiveFeeContract(rarityToken);
  console.log(`🏦 FeeContract Status:`);
  console.log(`  Active FeeContract: ${activeFeeContract}`);
  
  if (activeFeeContract !== ethers.ZeroAddress) {
    try {
      const feeContract = await ethers.getContractAt("FeeContract", activeFeeContract);
      const holdings = await feeContract.currentHoldings();
      const fees = await feeContract.currentFees();
      const isFull = await feeContract.isFull();
      console.log(`  Current Holdings: ${holdings}`);
      console.log(`  Current Fees: ${ethers.formatEther(fees)} ETH`);
      console.log(`  Is Full: ${isFull}\n`);
    } catch (err: any) {
      console.error(`  ⚠️ Could not read FeeContract: ${err.message}\n`);
    }
  } else {
    console.log(`  ⚠️ No FeeContract set - fees will go to founder wallets\n`);
  }

  // Check founder wallets
  const founderWallet1 = await hook.getFounderWallet1();
  const founderWallet2 = await hook.getFounderWallet2();
  const feeAddress = await hook.feeAddress();
  console.log(`👛 Founder Wallets:`);
  console.log(`  Founder Wallet 1: ${founderWallet1}`);
  console.log(`  Founder Wallet 2: ${founderWallet2}`);
  console.log(`  Fee Address: ${feeAddress}\n`);

  // Get initial balances
  const hookBalanceBefore = await ethers.provider.getBalance(HOOK);
  const founder1BalanceBefore = await ethers.provider.getBalance(founderWallet1);
  const founder2BalanceBefore = await ethers.provider.getBalance(founderWallet2);
  const feeAddressBalanceBefore = await ethers.provider.getBalance(feeAddress);
  
  if (activeFeeContract !== ethers.ZeroAddress) {
    const feeContractBalanceBefore = await ethers.provider.getBalance(activeFeeContract);
    console.log(`💰 Initial Balances:`);
    console.log(`  Hook: ${ethers.formatEther(hookBalanceBefore)} ETH`);
    console.log(`  FeeContract: ${ethers.formatEther(feeContractBalanceBefore)} ETH`);
    console.log(`  Founder Wallet 1: ${ethers.formatEther(founder1BalanceBefore)} ETH`);
    console.log(`  Founder Wallet 2: ${ethers.formatEther(founder2BalanceBefore)} ETH`);
    console.log(`  Fee Address: ${ethers.formatEther(feeAddressBalanceBefore)} ETH\n`);
  }

  // Prepare swap
  const amountIn = ethers.parseEther("0.001"); // 0.001 ETH
  const poolKey: [string, string, number, number, string] = [
    ethers.ZeroAddress, // ETH
    rarityToken,
    0,
    60,
    HOOK,
  ];

  console.log(`🔄 Performing Swap:`);
  console.log(`  Amount: ${ethers.formatEther(amountIn)} ETH`);
  console.log(`  Direction: ETH -> RARITY Token\n`);

  // Step 1: Estimate gas (this will simulate the full swap path)
  console.log(`Step 1: Estimating gas (full swap simulation)...`);
  try {
    const gasEstimate = await router.swapExactTokensForTokens.estimateGas(
      amountIn,
      0n,
      true,
      poolKey,
      "0x",
      deployer.address,
      Math.floor(Date.now() / 1000) + 300,
      { value: amountIn }
    );
    console.log(`  ✅ Gas estimate: ${gasEstimate.toString()}\n`);
  } catch (err: any) {
    console.error(`  ❌ GAS ESTIMATE FAILED!\n`);
    console.error(`  Error: ${err.message}\n`);
    
    // Detailed error analysis
    if (err.message.includes("VaultFeeTransferFailed")) {
      console.error(`  🔍 ROOT CAUSE: FeeContract.addFees() call failed`);
      console.error(`     The hook tried to send fees to FeeContract but it rejected the call.\n`);
      console.error(`  💡 SOLUTIONS:`);
      console.error(`     1. Check if FeeContract.hookAddress == ${HOOK}`);
      console.error(`     2. Verify FeeContract is deployed and callable`);
      console.error(`     3. Check FeeContract's addFees() function isn't reverting\n`);
    } else if (err.message.includes("OnlyHook")) {
      console.error(`  🔍 ROOT CAUSE: FeeContract rejected call (OnlyHook modifier)`);
      console.error(`     FeeContract expects msg.sender == its hookAddress\n`);
    } else if (err.message.includes("execution reverted")) {
      console.error(`  🔍 ROOT CAUSE: Contract execution reverted`);
      console.error(`     This could be from:`);
      console.error(`     - FeeContract.addFees() reverting`);
      console.error(`     - SafeTransferLib.forceSafeTransferETH() failing`);
      console.error(`     - Hook's _processFees() logic error\n`);
    }
    
    // Try to get revert reason
    if (err.data || err.error) {
      console.error(`  Error data:`, err.data || err.error);
    }
    
    process.exit(1);
  }

  // Step 2: Perform actual swap
  console.log(`Step 2: Performing actual swap...`);
  try {
    const tx = await router.swapExactTokensForTokens(
      amountIn,
      0n,
      true,
      poolKey,
      "0x",
      deployer.address,
      Math.floor(Date.now() / 1000) + 300,
      { value: amountIn, gasLimit: 10_000_000n }
    );
    
    console.log(`  ⏳ Transaction sent: ${tx.hash}`);
    console.log(`  Waiting for confirmation...\n`);
    
    const receipt = await tx.wait();
    console.log(`  ✅ Swap confirmed in block ${receipt?.blockNumber}\n`);

    // Analyze receipt for events
    if (receipt?.logs) {
      console.log(`📡 Events Emitted:`);
      for (const log of receipt.logs) {
        try {
          const parsed = hook.interface.parseLog(log as any);
          if (parsed) {
            console.log(`  ${parsed.name}:`, parsed.args);
          }
        } catch {
          // Not a hook event, skip
        }
      }
      console.log();
    }

    // Step 3: Check balances after swap
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for state to settle
    
    console.log(`💰 Final Balances:`);
    const hookBalanceAfter = await ethers.provider.getBalance(HOOK);
    const founder1BalanceAfter = await ethers.provider.getBalance(founderWallet1);
    const founder2BalanceAfter = await ethers.provider.getBalance(founderWallet2);
    const feeAddressBalanceAfter = await ethers.provider.getBalance(feeAddress);

    console.log(`  Hook: ${ethers.formatEther(hookBalanceAfter)} ETH (change: ${ethers.formatEther(hookBalanceAfter - hookBalanceBefore)} ETH)`);
    console.log(`  Founder Wallet 1: ${ethers.formatEther(founder1BalanceAfter)} ETH (change: ${ethers.formatEther(founder1BalanceAfter - founder1BalanceBefore)} ETH)`);
    console.log(`  Founder Wallet 2: ${ethers.formatEther(founder2BalanceAfter)} ETH (change: ${ethers.formatEther(founder2BalanceAfter - founder2BalanceBefore)} ETH)`);
    console.log(`  Fee Address: ${ethers.formatEther(feeAddressBalanceAfter)} ETH (change: ${ethers.formatEther(feeAddressBalanceAfter - feeAddressBalanceBefore)} ETH)`);

    if (activeFeeContract !== ethers.ZeroAddress) {
      const feeContractBalanceAfter = await ethers.provider.getBalance(activeFeeContract);
      const feeContract = await ethers.getContractAt("FeeContract", activeFeeContract);
      const feesAfter = await feeContract.currentFees();
      
      console.log(`  FeeContract: ${ethers.formatEther(feeContractBalanceAfter)} ETH (change: ${ethers.formatEther(feeContractBalanceAfter - (await ethers.provider.getBalance(activeFeeContract)))} ETH)`);
      console.log(`  FeeContract.currentFees: ${ethers.formatEther(feesAfter)} ETH\n`);
    }

    console.log(`\n✅ Swap completed successfully!\n`);

  } catch (err: any) {
    console.error(`  ❌ SWAP FAILED!\n`);
    console.error(`  Error: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});




