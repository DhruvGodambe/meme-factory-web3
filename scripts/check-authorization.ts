import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const file = process.env.DEPLOY_JSON || path.join(__dirname, "../deployment-full-1760550087393.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Deployment file not found: ${file}`);
  }
  const dep = JSON.parse(fs.readFileSync(file, "utf-8"));

  const hookAddr = dep.contracts.FeeHook as string;
  const tokenAddr = dep.contracts.RestrictedToken as string;
  const factoryAddr = dep.contracts.FeeHookFactory as string;
  const routerAddr = dep.contracts.UniversalRouter as string;

  const hook = await ethers.getContractAt("FeeHook", hookAddr);
  const factory = await ethers.getContractAt("FeeHookFactory", factoryAddr);

  const poolId = await hook.getPoolForCollection(tokenAddr);
  const authorized = await hook.isPoolAuthorized(poolId);
  const loading = await (factory as any).loadingLiquidity();
  const restrict = await (factory as any).routerRestrict();
  const routerOk = await (factory as any).validRouters(routerAddr);

  console.log("Addresses:");
  console.log("  Hook:", hookAddr);
  console.log("  Token:", tokenAddr);
  console.log("  Factory:", factoryAddr);
  console.log("  Router:", routerAddr);
  console.log("");
  console.log("Hook -> Pool linkage:");
  console.log("  poolId:", poolId);
  console.log("  authorized:", authorized);
  console.log("");
  console.log("Factory gates:");
  console.log("  loadingLiquidity:", loading);
  console.log("  routerRestrict:", restrict);
  console.log("  router whitelisted:", routerOk);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
