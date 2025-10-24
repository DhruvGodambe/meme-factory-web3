import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function latestRestrictedJson(baseDir: string): string {
  const files = fs.readdirSync(baseDir)
    .filter(f => f.startsWith("deployment-restricted-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error("No deployment-restricted-*.json found");
  return path.join(baseDir, files[0]);
}

async function main() {
  const baseDir = path.join(__dirname, "../");
  const restrictedPath = latestRestrictedJson(baseDir);
  const fullPath = path.join(baseDir, "deployment-full-1760552128122.json");
  if (!fs.existsSync(fullPath)) throw new Error(`Missing ${fullPath}`);

  const restricted = JSON.parse(fs.readFileSync(restrictedPath, "utf-8"));
  const full = JSON.parse(fs.readFileSync(fullPath, "utf-8"));

  const tokenAddr = restricted.token as string;
  const factoryAddr = full.contracts.FeeHookFactory as string;

  const token = await ethers.getContractAt("RestrictedToken", tokenAddr);
  const tx = await token.setFeeHookFactory(factoryAddr);
  await tx.wait();

  // Read back
  const onchainFactory = await (token as any).feeHookFactory();
  console.log("Bound feeHookFactory:", onchainFactory);

  // Update JSON and save as new file
  const updated = {
    ...restricted,
    config: {
      ...restricted.config,
      feeHookFactory: factoryAddr,
      liquidityLoading: false
    }
  };
  const outPath = restrictedPath.replace('.json', '-with-factory.json');
  fs.writeFileSync(outPath, JSON.stringify(updated, null, 2));
  console.log("Updated JSON:", outPath);
}

main().then(()=>process.exit(0)).catch((e)=>{ console.error(e); process.exit(1); });
