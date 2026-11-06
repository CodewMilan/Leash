import { AbiCoder, id, keccak256, ZeroHash } from "ethers";

export const WHITECHAIN = {
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io"] } },
  blockExplorers: {
    default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" },
  },
  testnet: true,
} as const;
export const USDT_ADDRESS = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
export const TOKEN_DOMAIN = {
  name: "Tether USD",
  version: "1",
  chainId: 1874,
  verifyingContract: USDT_ADDRESS,
};
export const authorizationTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
// Legacy ABI field `human` carries the server-derived passkey recipient commitment.
// It does not represent World ID or a proof of person uniqueness.
export const claimTypes = {
  Claim: [
    { name: "giftId", type: "bytes32" },
    { name: "human", type: "bytes32" },
    { name: "session", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
};
export type GiftTerms = {
  from: string;
  amount: string;
  expiry: number;
  secretHash: string;
  boundHuman: string;
  campaignId: string;
  salt: string;
};
export const TERMS_TYPEHASH = id(
  "GiftTerms(uint256 chainId,address vault,address from,uint256 amount,uint256 expiry,bytes32 secretHash,bytes32 boundHuman,bytes32 campaignId,bytes32 salt)",
);
export function giftNonce(vault: string, t: GiftTerms, chainId = 1874) {
  return keccak256(
    AbiCoder.defaultAbiCoder().encode(
      [
        "bytes32",
        "uint256",
        "address",
        "address",
        "uint256",
        "uint256",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
      ],
      [
        TERMS_TYPEHASH,
        chainId,
        vault,
        t.from,
        t.amount,
        t.expiry,
        t.secretHash,
        t.boundHuman,
        t.campaignId,
        t.salt,
      ],
    ),
  );
}
export const vaultAbi = [
  "function createGiftWithAuthorization((address from,uint256 amount,uint256 expiry,bytes32 secretHash,bytes32 boundHuman,bytes32 campaignId,bytes32 salt) t,uint256 validAfter,uint256 validBefore,bytes signature) returns (bytes32)",
  "function claim(bytes32 giftId,bytes32 secret,bytes32 human,bytes32 session,bytes32 nonce,uint256 deadline,bytes signature)",
  "function cashOut(bytes32 giftId,bytes32 payoutRef)",
  "function spend(bytes32 giftId,uint256 amount,bytes32 spendRef)",
  "function closeClaimed(bytes32 giftId)",
  "function refundExpired(bytes32 giftId)",
  "function gifts(bytes32) view returns (address sender,uint256 amount,uint256 expiry,bytes32 secretHash,bytes32 boundHuman,bytes32 campaignId,bytes32 human,uint8 state,uint256 spent)",
  "function usedSpendRefs(bytes32) view returns (bool)",
  "function usdt() view returns (address)",
  "function relayer() view returns (address)",
  "function operator() view returns (address)",
  "function attester() view returns (address)",
  "event GiftCreated(bytes32 indexed giftId,address indexed sender,uint256 amount,uint256 expiry,bytes32 campaignId)",
  "event GiftClaimed(bytes32 indexed giftId,bytes32 indexed human)",
  "event CashOut(bytes32 indexed giftId,uint256 amount,bytes32 payoutRef)",
  "event Spent(bytes32 indexed giftId,uint256 amount,bytes32 indexed spendRef,uint256 remaining)",
  "event Returned(bytes32 indexed giftId,address indexed sender,uint256 amount)",
];
export { ZeroHash };
export const explorerTx = (hash: string) => `${WHITECHAIN.blockExplorers.default.url}/tx/${hash}`;
