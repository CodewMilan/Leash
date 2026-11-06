import { resolve } from "node:path";
import { LithicGiftService } from "./lithic";
export function sandboxConfig() {
  const apiKey = process.env.LITHIC_API_KEY?.trim();
  const accessCode = process.env.LITHIC_SANDBOX_ACCESS_CODE?.trim();
  const missing = [!apiKey && "LITHIC_API_KEY", (!accessCode || accessCode.length < 16) && "LITHIC_SANDBOX_ACCESS_CODE (at least 16 characters)"].filter(Boolean);
  return { apiKey: apiKey ?? "", accessCode: accessCode ?? "", missing,
    directory: resolve(/* turbopackIgnore: true */ process.env.LITHIC_DATA_DIR || ".data/lithic"),
    accountToken: process.env.LITHIC_ACCOUNT_TOKEN?.trim(),
    programToken: process.env.LITHIC_PROGRAM_TOKEN?.trim(),
  };
}
export function sandboxService() {
  const config = sandboxConfig();
  if (config.missing.length) throw new Error("Lithic sandbox configuration is incomplete.");
  return new LithicGiftService(config);
}
