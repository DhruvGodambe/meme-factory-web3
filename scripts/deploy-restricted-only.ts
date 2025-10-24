import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Load addresses from the provided deployment JSON (latest set)
  const file = process.env.DEPLOY_JSON || path.join(__dirname, "../deployment-full-1760552128122.json");
  if (!fs.existsSync(file)) throw new Error(`Deployment file not found: ${file}`);
  const dep = JSON.parse(fs.readFileSync(file, "utf-8"));

  const POOL_MANAGER = dep.contracts.PoolManager as string;
  const FEE_HOOK    = dep.contracts.FeeHook as string;
  const ROUTER      = dep.contracts.UniversalRouter as string;
  const TREASURY    = dep.treasury as string;

  console.log("\n🚀 Deploying updated RestrictedToken (hook-enforced)…\n");
  console.log({ POOL_MANAGER, FEE_HOOK, ROUTER, TREASURY });

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  // Deploy new token
  const RestrictedToken = await ethers.getContractFactory("RestrictedToken");
  const token = await RestrictedToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();

  console.log("✅ RestrictedToken deployed:", tokenAddress);
  console.log("   Symbol:", await token.symbol());
  console.log("   Name:  ", await token.name());

  // Configure token
  console.log("\n⚙️  Configuring token…");
  let tx = await token.setPoolManager(POOL_MANAGER); await tx.wait();
  tx = await token.setHook(FEE_HOOK); await tx.wait();
  tx = await token.setSwapRouter(ROUTER); await tx.wait();

  // Whitelist essential addresses
  tx = await token.setWhitelist(FEE_HOOK, true); await tx.wait();
  tx = await token.setWhitelist(POOL_MANAGER, true); await tx.wait();
  tx = await token.setWhitelist(ROUTER, true); await tx.wait();
  tx = await token.setWhitelist(TREASURY, true); await tx.wait();

  // Enable trading and keep enforceHookOnly default true
  tx = await token.setTradingEnabled(true); await tx.wait();

  // Save a small deployment record
  const out = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    timestamp: Date.now(),
    token: tokenAddress,
    config: { POOL_MANAGER, FEE_HOOK, ROUTER, TREASURY, tradingEnabled: true, enforceHookOnly: true }
  };
  const outPath = path.join(__dirname, `../deployment-restricted-${out.timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\n💾 Saved:", outPath);

  console.log("\n✅ Done. New token is ready and restricted to hook-based flows.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
