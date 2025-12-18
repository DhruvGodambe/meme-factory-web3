import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import type { Contract, Signer } from "ethers";

const TEST_COLLECTION =
  process.env.TEST_COLLECTION && process.env.TEST_COLLECTION !== ""
    ? process.env.TEST_COLLECTION
    : "0x25b2ed7149fb8a05f6ef9407d9c8f878f59cd1e1";

const DEFAULT_SWAP_AMOUNT_WEI = parseEtherAmount(process.env.SWAP_AMOUNT_ETH, "0.0003");
const FEE_TEST_AMOUNT_WEI = parseEtherAmount(process.env.FEE_TEST_AMOUNT_ETH, "0.1");
const GAS_BUMP_PERCENT = clampPercent(process.env.GAS_BUMP_PERCENT, 25);

/**
 * Comprehensive swap simulation script to test fee processing and identify errors
 * This simulates the full swap path including hook fee collection and distribution
 */
async function main() {
  const hre: HardhatRuntimeEnvironment = require("hardhat");
  const [deployer] = await ethers.getSigners();

  console.log(`\n🧪 Swap & Fee Processing Test`);
  console.log(`Using account: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`Network: Chain ID ${chainId}\n`);

  // Base network addresses
  const POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b";
  const POSITION_MANAGER = "0x7c5f5a4bbd8fd63184577525326123b519429bdc";
  const UNIVERSAL_ROUTER = "0x6ff5693b99212da76ad316178a184ab56d299b43";
  const ROUTER = "0x00000000000044a361Ae3cAc094c9D1b14Eece97";

  // Contract addresses (update these to match your deployment)
  const FACTORY = "0x1F649F2EC09b7814D313d12AC7DfC12F84412e99";
  const HOOK = "0x9c3fb59C7a27a8d141A5E3a664ece6798eaB28c4";
  const RESTRICTED_TOKEN = "0x556f013930CdE5A5D64f352FbC13a4051d80205C";
  const OPEN_SEA_BUYER = "0x1df4E3643Dc9119Df655a0BfA9502AB9FaA6356c";

  console.log("📋 Contract Addresses:");
  console.log(`  Factory: ${FACTORY}`);
  console.log(`  Hook: ${HOOK}`);
  console.log(`  RestrictedToken: ${RESTRICTED_TOKEN}`);
  console.log(`  Router: ${ROUTER}\n`);
  console.log(
    `⚙️ Config: swapAmount=${ethers.formatEther(DEFAULT_SWAP_AMOUNT_WEI)} ETH | feeTest=${ethers.formatEther(
      FEE_TEST_AMOUNT_WEI
    )} ETH | gasBump=${GAS_BUMP_PERCENT}%\n`
  );

  // Get contract instances
  const factory = await ethers.getContractAt("NFTStrategyFactory", FACTORY);
  const hook = await ethers.getContractAt("NFTStrategyHook", HOOK);
  const router = await ethers.getContractAt("IUniswapV4Router04", ROUTER);

  // --- STEP 1: Check Factory Configuration ---
  console.log("=== 📊 Factory Configuration ===");
  try {
    const hookAddress = await factory.hookAddress();
    const feeToLaunch = await factory.feeToLaunch();
    const publicLaunches = await factory.publicLaunches();
    const routerRestrict = await factory.routerRestrict();
    const feeAddress = await factory.feeAddress();

    console.log(`  Hook Address: ${hookAddress}`);
    console.log(`  Fee to Launch: ${feeToLaunch.toString()} wei (${ethers.formatEther(feeToLaunch)} ETH)`);
    console.log(`  Public Launches: ${publicLaunches}`);
    console.log(`  Router Restrict: ${routerRestrict}`);
    console.log(`  Fee Address: ${feeAddress}\n`);

    if (hookAddress.toLowerCase() !== HOOK.toLowerCase()) {
      console.error(`  ⚠️ WARNING: Factory hook address (${hookAddress}) != expected hook (${HOOK})`);
    }
  } catch (err: any) {
    console.error(`  ❌ Failed to read factory config: ${err.message}\n`);
  }

  // --- STEP 2: Check Hook Configuration ---
  console.log("=== 📊 Hook Configuration ===");
  try {
    const hookFactory = await hook.nftStrategyFactory();
    const hookManager = await hook.manager();
    const hookFeeAddress = await hook.feeAddress();
    const routerAddress = await hook.routerAddress();
    const openSeaBuyer = await hook.openSeaBuyer();
    const founderWallet1 = await hook.getFounderWallet1();
    const founderWallet2 = await hook.getFounderWallet2();
    const brandAssetEnabled = await hook.brandAssetEnabled();

    console.log(`  NFTStrategyFactory: ${hookFactory}`);
    console.log(`  Pool Manager: ${hookManager}`);
    console.log(`  Fee Address: ${hookFeeAddress}`);
    console.log(`  Router Address: ${routerAddress}`);
    console.log(`  OpenSea Buyer: ${openSeaBuyer}`);
    console.log(`  Founder Wallet 1: ${founderWallet1}`);
    console.log(`  Founder Wallet 2: ${founderWallet2}`);
    console.log(`  Brand Asset Enabled: ${brandAssetEnabled}\n`);

    if (hookFactory.toLowerCase() !== FACTORY.toLowerCase()) {
      console.error(`  ⚠️ WARNING: Hook factory (${hookFactory}) != expected factory (${FACTORY})`);
    }
    if (routerAddress.toLowerCase() !== ROUTER.toLowerCase()) {
      console.error(`  ⚠️ WARNING: Hook router (${routerAddress}) != expected router (${ROUTER})`);
    }
  } catch (err: any) {
    console.error(`  ❌ Failed to read hook config: ${err.message}\n`);
  }

  // --- STEP 3: Test Fee Calculation ---
  console.log("=== 🧮 Fee Calculation Test ===");
  try {
    const testCollection = ethers.ZeroAddress; // Will use any collection for testing
    const feeForBuy = await hook.calculateFee(testCollection, true);
    const feeForSell = await hook.calculateFee(testCollection, false);

    console.log(`  Fee for Buy: ${feeForBuy} basis points (${(Number(feeForBuy) / 100).toFixed(2)}%)`);
    console.log(`  Fee for Sell: ${feeForSell} basis points (${(Number(feeForSell) / 100).toFixed(2)}%)\n`);
  } catch (err: any) {
    console.error(`  ❌ Failed to calculate fees: ${err.message}\n`);
  }

  // --- STEP 4: Test FeeContract Status for a RARITY Token ---
  console.log("=== 🏦 FeeContract Status Test ===");
  if (TEST_COLLECTION !== ethers.ZeroAddress) {
    try {
      // Get the RARITY token for this collection
      const rarityToken = await factory.collectionToNFTStrategy(TEST_COLLECTION);
      if (rarityToken !== ethers.ZeroAddress) {
        console.log(`  Collection: ${TEST_COLLECTION}`);
        console.log(`  RARITY Token: ${rarityToken}`);

        const hasFeeContract = await hook.hasFeeContract(rarityToken);
        const activeFeeContract = await hook.getActiveFeeContract(rarityToken);
        const isFull = await hook.isActiveFeeContractFull(rarityToken);

        console.log(`  Has FeeContract: ${hasFeeContract}`);
        console.log(`  Active FeeContract: ${activeFeeContract}`);
        console.log(`  FeeContract Full: ${isFull}\n`);

        if (activeFeeContract !== ethers.ZeroAddress) {
          try {
            const feeContract = await ethers.getContractAt("FeeContract", activeFeeContract);
            const currentHoldings = await feeContract.currentHoldings();
            const currentFees = await feeContract.currentFees();
            console.log(`  FeeContract Holdings: ${currentHoldings}`);
            console.log(`  FeeContract Fees: ${ethers.formatEther(currentFees)} ETH\n`);
          } catch (err: any) {
            console.error(`  ⚠️ Could not read FeeContract details: ${err.message}\n`);
          }
        }
      } else {
        console.log(`  ⚠️ No RARITY token found for collection ${TEST_COLLECTION}\n`);
      }
    } catch (err: any) {
      console.error(`  ❌ Failed to check FeeContract status: ${err.message}\n`);
    }
  } else {
    console.log(`  ⚠️ Skipping - no test collection address provided\n`);
  }

  // --- STEP 5: Run Swap + Fee Verification ---
  console.log("=== 🔄 Swap Simulation Test ===");
  console.log("  Testing swap path with fee processing...\n");

  if (TEST_COLLECTION === ethers.ZeroAddress) {
    console.log(`  ⚠️ Skipping swap test - set TEST_COLLECTION=0x... before running.\n`);
  } else {
    await runSwapFeeVerification({
      factory: factory as unknown as Contract,
      hook: hook as unknown as Contract,
      router: router as unknown as Contract,
      deployer,
      hookAddress: HOOK,
      collectionAddress: TEST_COLLECTION,
    });
  }

  // --- STEP 6: Test Fee Distribution Math ---
  console.log("=== 💰 Fee Distribution Math Test ===");
  const testFeeAmount = FEE_TEST_AMOUNT_WEI;
  const TOTAL_BIPS = 10000n;
  const VAULT_FEE_PORTION = 1400n; // 14%
  const FOUNDER_FEE_PORTION_1 = 25n; // 0.25%
  const FOUNDER_FEE_PORTION_2 = 75n; // 0.75%
  const FOUNDER_FEE_PORTION = 100n; // 1%

  const vaultAmount = (testFeeAmount * VAULT_FEE_PORTION) / TOTAL_BIPS;
  const founderAmount1 = (testFeeAmount * FOUNDER_FEE_PORTION_1) / TOTAL_BIPS;
  const founderAmount2 = (testFeeAmount * FOUNDER_FEE_PORTION_2) / TOTAL_BIPS;
  const total = vaultAmount + founderAmount1 + founderAmount2;
  const remainder = testFeeAmount - total;

  console.log(`  Test Fee Amount: ${ethers.formatEther(testFeeAmount)} ETH`);
  console.log(`  Vault Amount (14%): ${ethers.formatEther(vaultAmount)} ETH`);
  console.log(`  Founder 1 (0.25%): ${ethers.formatEther(founderAmount1)} ETH`);
  console.log(`  Founder 2 (0.75%): ${ethers.formatEther(founderAmount2)} ETH`);
  console.log(`  Total Distributed: ${ethers.formatEther(total)} ETH`);
  console.log(`  Remaining / LP share: ${ethers.formatEther(remainder)} ETH\n`);

  // --- STEP 7: Check Hook Balance ---
  console.log("=== 💼 Hook Contract Balance ===");
  try {
    const hookBalance = await ethers.provider.getBalance(HOOK);
    console.log(`  Hook Balance: ${ethers.formatEther(hookBalance)} ETH\n`);
  } catch (err: any) {
    console.error(`  ❌ Failed to check hook balance: ${err.message}\n`);
  }

  console.log("✅ Test suite complete!\n");
  console.log("📝 Next steps:");
  console.log("  1. If swap simulation failed, check the error message above");
  console.log("  2. Verify FeeContract configuration matches the hook address");
  console.log("  3. Check that routerAddress and openSeaBuyer are set correctly");
  console.log("  4. Ensure founder wallets are configured (not zero addresses)\n");
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

type SwapFeeTestParams = {
  factory: Contract;
  hook: Contract;
  router: Contract;
  deployer: Signer;
  hookAddress: string;
  collectionAddress: string;
  amountInWei?: bigint;
  poolFee?: number;
  tickSpacing?: number;
};

type AddressMap = Record<string, string>;

async function runSwapFeeVerification({
  factory,
  hook,
  router,
  deployer,
  hookAddress,
  collectionAddress,
  amountInWei = DEFAULT_SWAP_AMOUNT_WEI,
  poolFee = 0,
  tickSpacing = 60,
}: SwapFeeTestParams) {
  console.log(`  Collection: ${collectionAddress}`);

  const rarityToken = await factory.collectionToNFTStrategy(collectionAddress);
  if (rarityToken === ethers.ZeroAddress) {
    console.log(`  ⚠️ No RARITY token found for ${collectionAddress}\n`);
    return;
  }

  console.log(`  RARITY Token: ${rarityToken}`);
  console.log(`  Swap Amount: ${ethers.formatEther(amountInWei)} ETH`);

  const poolKey: [string, string, number, number, string] = [
    ethers.ZeroAddress,
    rarityToken,
    poolFee,
    tickSpacing,
    hookAddress,
  ];

  const founderWallet1 = await hook.getFounderWallet1();
  const founderWallet2 = await hook.getFounderWallet2();
  const feeAddress = await hook.feeAddress();
  const activeFeeContract = await hook.getActiveFeeContract(rarityToken);
  const deployerAddress = await deployer.getAddress();

  const trackedAddresses: AddressMap = {
    hook: hookAddress,
    founderWallet1,
    founderWallet2,
    feeAddress,
  };

  if (activeFeeContract !== ethers.ZeroAddress) {
    trackedAddresses.feeContract = activeFeeContract;
  } else {
    console.log("  ⚠️ No active FeeContract; fees will flow to founder wallets + feeAddress.");
  }

  const gasOverrides = await buildGasOverrides(GAS_BUMP_PERCENT);
  console.log(
    `  Gas overrides -> maxFee: ${formatGwei(gasOverrides.maxFeePerGas)} | priority: ${formatGwei(
      gasOverrides.maxPriorityFeePerGas
    )}`
  );

  console.log("  Tracking addresses for balance deltas:");
  for (const [label, address] of Object.entries(trackedAddresses)) {
    console.log(`    ${label}: ${address}`);
  }

  const beforeBalances = await snapshotBalances(trackedAddresses);
  const deadline = Math.floor(Date.now() / 1000) + 300;

  console.log("  ➤ Static swap call (reverts if hook logic fails)...");
  try {
    await router.swapExactTokensForTokens.staticCall(
      amountInWei,
      0n,
      true,
      poolKey,
      "0x",
      deployerAddress,
      deadline,
      { value: amountInWei }
    );
    console.log("    ✅ Static call succeeded");
  } catch (err: any) {
    console.error("    ❌ Static call failed:", err?.message ?? err);
    if (err?.data) {
      console.error("    Error data:", err.data);
    }
    console.log();
    return;
  }

  console.log("  ➤ Executing live swap...");
  let receipt;
  try {
    const tx = await router.swapExactTokensForTokens(
      amountInWei,
      0n,
      true,
      poolKey,
      "0x",
      deployerAddress,
      deadline,
      { value: amountInWei, gasLimit: 10_000_000n, ...gasOverrides }
    );
    console.log(`    ⏳ Tx hash: ${tx.hash}`);
    receipt = await tx.wait();
    console.log(`    ✅ Confirmed in block ${receipt?.blockNumber ?? "?"}`);
  } catch (err: any) {
    console.error("    ❌ Swap failed:", err?.message ?? err);
    if (err?.data) {
      console.error("    Error data:", err.data);
    }
    console.log();
    return;
  }

  console.log("  ➤ Balance deltas:");
  const afterBalances = await snapshotBalances(trackedAddresses);
  for (const [label, before] of Object.entries(beforeBalances)) {
    const after = afterBalances[label];
    const delta = after - before;
    console.log(`    ${label.padEnd(14)} ${formatBalance(after)} (${formatDelta(delta)})`);
  }

  if (activeFeeContract !== ethers.ZeroAddress) {
    try {
      const feeContract = await ethers.getContractAt("FeeContract", activeFeeContract);
      const currentFees = await feeContract.currentFees();
      const holdings = await feeContract.currentHoldings();
      console.log(`    FeeContract currentFees: ${ethers.formatEther(currentFees)} ETH`);
      console.log(`    FeeContract holdings: ${holdings}`);
    } catch (err: any) {
      console.error(`    ⚠️ Could not inspect FeeContract: ${err?.message ?? err}`);
    }
  }

  if (receipt?.logs?.length) {
    console.log("  ➤ Hook events:");
    for (const log of receipt.logs) {
      try {
        const parsed = hook.interface.parseLog(log as any);
        if (parsed) {
          console.log(`    ${parsed.name}:`, parsed.args);
        }
      } catch {
        // ignore unrelated logs
      }
    }
  }

  console.log();
}

async function snapshotBalances(addresses: AddressMap) {
  const balances: Record<string, bigint> = {};
  for (const [label, address] of Object.entries(addresses)) {
    balances[label] = await ethers.provider.getBalance(address);
  }
  return balances;
}

function formatDelta(delta: bigint) {
  if (delta === 0n) {
    return "no change";
  }
  const prefix = delta > 0n ? "+" : "-";
  const absolute = delta > 0n ? delta : -delta;
  return `${prefix}${ethers.formatEther(absolute)} ETH`;
}

function formatBalance(value: bigint) {
  return `${ethers.formatEther(value)} ETH`;
}

function parseEtherAmount(raw: string | undefined, fallback: string) {
  const candidate = raw && raw.trim() !== "" ? raw : fallback;
  try {
    return ethers.parseEther(candidate);
  } catch (err) {
    console.warn(
      `[swap-test] Invalid ether amount "${raw ?? ""}", falling back to ${fallback}. Error: ${
        (err as Error)?.message ?? err
      }`
    );
    return ethers.parseEther(fallback);
  }
}

function clampPercent(raw: string | undefined, fallback: number) {
  if (!raw || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 0), 500);
}

function formatGwei(value: bigint) {
  return `${ethers.formatUnits(value, "gwei")} gwei`;
}

function applyPercentBump(value: bigint, percent: number) {
  if (percent <= 0) return value;
  return (value * BigInt(100 + percent)) / 100n;
}

async function buildGasOverrides(percent: number) {
  const feeData = await ethers.provider.getFeeData();
  const fallbackPriority = ethers.parseUnits("1", "gwei");
  const fallbackMax = ethers.parseUnits("30", "gwei");
  const maxPriorityFeePerGas = applyPercentBump(
    feeData.maxPriorityFeePerGas ?? fallbackPriority,
    percent
  );
  const baseMax =
    feeData.maxFeePerGas ??
    feeData.gasPrice ??
    applyPercentBump(fallbackMax, percent);
  const maxFeePerGas = applyPercentBump(baseMax, percent);
  return { maxFeePerGas, maxPriorityFeePerGas };
}

