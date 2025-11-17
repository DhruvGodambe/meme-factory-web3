import fs from "fs";
import path from "path";

const CONTRACTS_TO_CHECK = [
  { name: "NFTStrategyHookMiner", dir: "NFTStrategyHookMiner.sol" },
  { name: "NFTStrategyHook", dir: "amock/NFTStrategyHook.sol" },
  { name: "FeeContract", dir: "amock/FeeContract.sol" },
  { name: "OpenSeaNFTBuyer", dir: "amock/OpenSeaPort.sol" },
];

const EIP170_LIMIT = 24576; // 24 KB in bytes

function findArtifact(contractName: string, contractDir: string): string | null {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    contractDir,
    `${contractName}.json`
  );

  if (fs.existsSync(artifactPath)) return artifactPath;
  return null;
}

function getBytecodeSize(bytecode: string): number {
  // Remove '0x' prefix and calculate size in bytes (2 hex chars = 1 byte)
  if (!bytecode || bytecode === "0x") return 0;
  return (bytecode.length - 2) / 2;
}

async function main() {
  console.log("📊 Checking Contract Bytecode Sizes");
  console.log("=".repeat(70));
  console.log(`EIP-170 Limit: ${EIP170_LIMIT} bytes (24 KB)\n`);

  let hasExceeded = false;
  const results: Array<{ name: string; size: number; status: string }> = [];

  for (const contract of CONTRACTS_TO_CHECK) {
    const artifactPath = findArtifact(contract.name, contract.dir);
    
    if (!artifactPath) {
      console.log(`⚠️  ${contract.name}: Artifact not found at expected path`);
      continue;
    }

    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
      const bytecode = artifact.bytecode || artifact.data?.bytecode?.object || "";
      const size = getBytecodeSize(bytecode);
      const sizeKB = (size / 1024).toFixed(2);
      const percentage = ((size / EIP170_LIMIT) * 100).toFixed(1);
      const status = size > EIP170_LIMIT ? "❌ EXCEEDS 24KB LIMIT" : "✅ OK";
      
      if (size > EIP170_LIMIT) hasExceeded = true;

      results.push({ name: contract.name, size, status });

      console.log(`${contract.name}:`);
      console.log(`  Size: ${size.toLocaleString()} bytes (${sizeKB} KB)`);
      console.log(`  Percentage of limit: ${percentage}%`);
      console.log(`  Status: ${status}`);
      console.log("");
    } catch (err: any) {
      console.log(`❌ ${contract.name}: Error reading artifact - ${err.message}`);
      console.log("");
    }
  }

  console.log("=".repeat(70));
  console.log("\n📋 Summary:");
  
  const exceeded = results.filter(r => r.size > EIP170_LIMIT);
  const ok = results.filter(r => r.size <= EIP170_LIMIT);

  if (exceeded.length > 0) {
    console.log(`\n❌ Contracts exceeding 24KB limit (${exceeded.length}):`);
    exceeded.forEach(r => {
      const sizeKB = (r.size / 1024).toFixed(2);
      const overage = r.size - EIP170_LIMIT;
      console.log(`   - ${r.name}: ${r.size.toLocaleString()} bytes (${sizeKB} KB) - ${overage.toLocaleString()} bytes over limit`);
    });
  }

  if (ok.length > 0) {
    console.log(`\n✅ Contracts within limit (${ok.length}):`);
    ok.forEach(r => {
      const sizeKB = (r.size / 1024).toFixed(2);
      console.log(`   - ${r.name}: ${r.size.toLocaleString()} bytes (${sizeKB} KB)`);
    });
  }

  if (hasExceeded) {
    console.log("\n⚠️  WARNING: Some contracts exceed the EIP-170 24KB limit!");
    console.log("   Consider splitting contracts or using libraries/proxies.");
    process.exit(1);
  } else {
    console.log("\n✅ All contracts are within the EIP-170 24KB limit!");
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

