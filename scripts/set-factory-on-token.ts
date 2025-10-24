import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const tokenAddr = process.env.TOKEN as string;
  const depPath = process.env.DEPLOY_JSON || "deployment-full-1760552128122.json";
  if (!tokenAddr) throw new Error("Set TOKEN=0x... env var");
  if (!fs.existsSync(depPath)) throw new Error(`Missing ${depPath}`);
  const dep = JSON.parse(fs.readFileSync(depPath, "utf-8"));
  const factoryAddr = dep.contracts.FeeHookFactory as string;
  const token = await ethers.getContractAt("RestrictedToken", tokenAddr);
  const tx = await token.setFeeHookFactory(factoryAddr);
  await tx.wait();
  console.log("Factory set to", factoryAddr);
}

main().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });
