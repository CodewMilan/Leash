export const CHAIN_ID = 84532;
export const CHAIN_HEX = "0x14a34";
export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const PRICE_UNITS = "100000000";
export const PRICE_LABEL = "100 test USDC";
export const CONFIRMATIONS = 3;
export const EXPLORER = "https://sepolia.basescan.org";
export const ERC20_ABI = ["function transfer(address to,uint256 amount) returns (bool)", "function balanceOf(address owner) view returns (uint256)", "event Transfer(address indexed from,address indexed to,uint256 value)"];
export type GiftOrder = {
  id: string; buyer: string; recipient: string; treasury: string; createdAt: string;
  minimumBlock: number; amount: typeof PRICE_UNITS;
  status: "AWAITING_PAYMENT" | "PAID" | "CARD_READY";
  txHash?: string; paidAt?: string;
};
export type PublicPurchaseConfig = { configured: boolean; missing: string[]; treasury: string | null; chainId: number; token: string; price: string };
