import { getAddress, isAddress, ZeroAddress } from "ethers";
import { join } from "node:path";
import { CHAIN_ID, PRICE_UNITS, USDC_ADDRESS, type PublicPurchaseConfig } from "../purchase/model";
import { GiftOrders } from "./gift-orders";
import { LithicGiftService } from "./lithic";
import { BaseSepoliaPayments } from "./payment";
import { sandboxConfig } from "./sandbox-config";
export function purchaseConfig() {
  const config = sandboxConfig();
  const treasury = process.env.BASE_SEPOLIA_TREASURY_ADDRESS?.trim() || "";
  const treasuryValid = isAddress(treasury) && getAddress(treasury) !== ZeroAddress && treasury.toLowerCase() !== USDC_ADDRESS.toLowerCase();
  const missing = [...config.missing, ...(!treasuryValid ? ["BASE_SEPOLIA_TREASURY_ADDRESS"] : [])] as string[];
  const publicConfig: PublicPurchaseConfig = { configured: missing.length === 0, missing, treasury: treasuryValid ? getAddress(treasury) : null, chainId: CHAIN_ID, token: USDC_ADDRESS, price: PRICE_UNITS };
  return { ...config, treasury, directory: join(config.directory, "purchases"), publicConfig };
}
export function purchaseService() {
  const config = purchaseConfig();
  if (!config.publicConfig.configured) throw new Error("Configure the testnet payment and Lithic sandbox environment first.");
  return new GiftOrders(config, new BaseSepoliaPayments(), id => new LithicGiftService({ ...config, directory: join(config.directory, "cards", id) }));
}
