import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { MERCHANT_ROOT, parseMerchantConfig } from "./config.js";

loadDotenv({ path: path.join(MERCHANT_ROOT, ".env"), quiet: true });
loadDotenv({ path: path.join(MERCHANT_ROOT, "..", ".env"), quiet: true });

export const config = parseMerchantConfig(process.env);
