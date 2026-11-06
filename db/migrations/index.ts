import { schema } from "./001_initial";
import { schema as giftDesign } from "./002_gift_design";
export const migrations = [
  { version: 1, name: "Shagun foundation", sql: schema },
  { version: 2, name: "Gift design and sealed note", sql: giftDesign },
] as const;
