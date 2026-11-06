import { parseAmount } from "./amounts";

export type GiftDesign = {
  id: string;
  name: string;
  tone: "tone-orange" | "tone-pink" | "tone-green" | "tone-lavender" | "tone-blue";
  heading: string;
  greeting: string;
};

/** Card designs a sender can choose. The id is stored with the gift and shown to the recipient. */
export const GIFT_DESIGNS: GiftDesign[] = [
  {
    id: "diwali",
    name: "Diwali",
    tone: "tone-orange",
    heading: "HAPPY DIWALI",
    greeting: "May your year glow bright.",
  },
  {
    id: "birthday",
    name: "Birthday",
    tone: "tone-pink",
    heading: "HAPPY BIRTHDAY",
    greeting: "Another trip around the sun.",
  },
  {
    id: "thanks",
    name: "Thank you",
    tone: "tone-green",
    heading: "THANK YOU",
    greeting: "For everything you do.",
  },
  {
    id: "wedding",
    name: "Wedding",
    tone: "tone-lavender",
    heading: "CONGRATULATIONS",
    greeting: "To a lifetime together.",
  },
  {
    id: "love",
    name: "Just because",
    tone: "tone-blue",
    heading: "A LITTLE SOMETHING FOR YOU",
    greeting: "With love, from miles away.",
  },
];
export const DEFAULT_DESIGN = "diwali";
export const designIds = GIFT_DESIGNS.map((d) => d.id) as [string, ...string[]];
export function designById(id: string | null | undefined) {
  return GIFT_DESIGNS.find((d) => d.id === id) || GIFT_DESIGNS[0];
}

export const GIFT_PRESETS = ["11", "25", "51", "101"];
export const MIN_GIFT_UNITS = 500_000n;
export const MAX_GIFT_UNITS = 1_000_000_000n;
export const MESSAGE_MAX = 140;

/** Parses a dollar amount and enforces the whole-cent gift range ($0.50 to the vault's $1,000 cap). */
export function giftUnits(value: string): bigint {
  const units = parseAmount(value.trim());
  if (units < MIN_GIFT_UNITS || units > MAX_GIFT_UNITS || units % 10_000n !== 0n)
    throw new Error("Choose a gift between $0.50 and $1,000 in whole cents.");
  return units;
}

export const EXPIRY_OPTIONS = [
  { seconds: 86_400, label: "24 hours" },
  { seconds: 259_200, label: "3 days" },
  { seconds: 604_800, label: "7 days" },
  { seconds: 300, label: "5 minutes · return demo" },
];
