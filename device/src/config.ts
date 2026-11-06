import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { DEVICE_ROOT, parseConfig, type Config } from "./core/config.js";

export { ConfigError, DEVICE_ROOT, type Config } from "./core/config.js";

loadDotenv({ path: path.join(DEVICE_ROOT, ".env"), quiet: true });
loadDotenv({ path: path.join(DEVICE_ROOT, "..", ".env"), quiet: true });

export const config: Config = parseConfig(process.env);
