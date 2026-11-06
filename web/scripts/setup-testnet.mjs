import { Wallet } from "ethers";
import { appendFileSync, chmodSync, existsSync } from "node:fs";

if (!existsSync(".env.local")) {
  console.error("Create web/.env.local from .env.example first, then run this script from web/ with --env-file=.env.local.");
  process.exit(1);
}
if (process.env.BASE_SEPOLIA_TREASURY_ADDRESS) {
  console.log("A treasury address is already configured. No keys or addresses were changed.");
} else {
  const wallet = Wallet.createRandom();
  appendFileSync(".env.local", `\n# Locally generated TESTNET treasury. Never send real assets here.\nBASE_SEPOLIA_TREASURY_ADDRESS=${wallet.address}\nBASE_SEPOLIA_TREASURY_PRIVATE_KEY=${wallet.privateKey}\n`);
  chmodSync(".env.local", 0o600);
  console.log("Testnet treasury saved to ignored .env.local. No private key was printed. Restart the app.");
}
