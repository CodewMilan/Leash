import { schema } from "./001_initial";
export const migrations = [
  { version: 1, name: "Shagun foundation", sql: schema },
] as const;
