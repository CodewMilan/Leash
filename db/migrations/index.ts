import { schema } from "./001_initial";
import { schema as giftDesign } from "./002_gift_design";
import { schema as giftCards } from "./003_gift_cards";
import { schema as cardLedger } from "./004_card_ledger";
export const migrations = [
  { version: 1, name: "Shagun foundation", sql: schema },
  { version: 2, name: "Gift design and sealed note", sql: giftDesign },
  { version: 3, name: "Gift-sized sandbox cards", sql: giftCards },
  { version: 4, name: "Gift card ledger", sql: cardLedger },
] as const;
