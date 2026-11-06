import { ContractFactory, JsonRpcProvider, Wallet, isAddress } from "ethers";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { officialToken, required, rpcUrl } from "../src/lib/server/config";

if (!process.argv.includes("--confirm-testnet"))
  throw new Error("Pass --confirm-testnet to authorize a real testnet deployment.");
const provider = new JsonRpcProvider(rpcUrl());
try {
  if ((await provider.getNetwork()).chainId !== 1874n)
    throw new Error("Deployment requires Whitechain 1874.");
  const relayer = new Wallet(required("RELAYER_PRIVATE_KEY"), provider);
  const attester = new Wallet(required("ATTESTER_PRIVATE_KEY"));
  const treasury = required("PAYOUT_TREASURY_ADDRESS");
  if (!isAddress(treasury)) throw new Error("PAYOUT_TREASURY_ADDRESS must be an address.");
  const artifact = JSON.parse(
    await readFile(resolve("../contracts/artifacts/ShagunVault.json"), "utf8"),
  );
  const admin = required("VAULT_ADMIN_ADDRESS");
  if (!isAddress(admin)) throw new Error("VAULT_ADMIN_ADDRESS must be an address.");
  const vault = await new ContractFactory(artifact.abi, artifact.bytecode, relayer).deploy(
    officialToken(),
    relayer.address,
    attester.address,
    relayer.address,
    treasury,
    admin,
  );
  const tx = vault.deploymentTransaction();
  if (!tx) throw new Error("Deployment transaction is missing.");
  console.log(`Deployment submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Deployment did not confirm.");
  const record = {
    chainId: 1874,
    vault: await vault.getAddress(),
    token: officialToken(),
    relayer: relayer.address,
    attester: attester.address,
    operator: relayer.address,
    treasury,
    admin,
    block: receipt.blockNumber,
    transaction: tx.hash,
    verified: false,
    compiler: artifact.compiler,
  };
  await mkdir("../deployments", { recursive: true });
  await writeFile(
    `../deployments/whitechain-${receipt.blockNumber}.json`,
    JSON.stringify(record, null, 2),
  );
  console.log(JSON.stringify(record, null, 2));
} finally {
  provider.destroy();
}
