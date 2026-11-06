import { decodePaymentRequiredHeader, encodePaymentRequiredHeader } from "@x402/core/http";
import {
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  TokenId,
  TopicMessageSubmitTransaction,
  TransactionId,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { describe, expect, it } from "vitest";
import {
  buildTransfer,
  decodeTransfer,
  PaymentRejected,
  pickRequirement,
  samePayment,
  type PaymentRequired,
  type Requirement,
} from "../src/core/transfer.js";

const DEVICE = "0.0.1001";
const MERCHANT = "0.0.2002";
const FEE_PAYER = "0.0.7162784";
const USDC = "0.0.429274";

const requirement = (over: Partial<Requirement> = {}): Requirement => ({
  scheme: "exact",
  network: "hedera:testnet",
  asset: USDC,
  amount: "20000000",
  payTo: MERCHANT,
  maxTimeoutSeconds: 120,
  extra: { feePayer: FEE_PAYER },
  ...over,
});

const paymentRequired = (accepts: Requirement[]): PaymentRequired => ({
  x402Version: 2,
  resource: { url: "http://merchant.local/photo?amount=20", description: "Photo", mimeType: "application/json" },
  accepts,
});

function frozen(tx: TransferTransaction | TopicMessageSubmitTransaction) {
  const client = Client.forTestnet();
  try {
    return tx.freezeWith(client).toBytes();
  } finally {
    client.close();
  }
}

describe("pickRequirement", () => {
  it("picks the exact USDC offer on our network from a real PAYMENT-REQUIRED header", () => {
    const header = encodePaymentRequiredHeader(
      paymentRequired([requirement({ network: "eip155:84532", asset: "0xusdc" }), requirement()]),
    );
    expect(pickRequirement(decodePaymentRequiredHeader(header), "testnet", USDC)).toMatchObject({ payTo: MERCHANT, amount: "20000000" });
  });

  it("refuses when the merchant only offers other tokens or networks", () => {
    expect(() => pickRequirement(paymentRequired([requirement({ asset: "0.0.1234" })]), "testnet", USDC)).toThrow(PaymentRejected);
    expect(() => pickRequirement(paymentRequired([requirement()]), "mainnet", USDC)).toThrow(/hedera:mainnet/);
    expect(() => pickRequirement(paymentRequired([]), "testnet", USDC)).toThrow(/offered: nothing/);
  });

  it("refuses terms without a facilitator fee payer", () => {
    expect(() => pickRequirement(paymentRequired([requirement({ extra: {} })]), "testnet", USDC)).toThrow(/fee payer/);
  });
});

describe("buildTransfer + decodeTransfer", () => {
  it("round-trips the exact payment through real Hedera transaction bytes", () => {
    const tx = buildTransfer(requirement(), DEVICE, "testnet");
    expect(decodeTransfer(tx.toBytes(), FEE_PAYER)).toEqual({ tokenId: USDC, payFrom: DEVICE, payTo: MERCHANT, amount: 20_000_000n });
  });

  it("still decodes the same payment after the device signs it", async () => {
    const key = PrivateKey.generateECDSA();
    const tx = buildTransfer(requirement({ amount: "500000" }), DEVICE, "testnet");
    const before = decodeTransfer(tx.toBytes(), FEE_PAYER);
    const signed = await tx.sign(key);
    expect(samePayment(decodeTransfer(signed.toBytes(), FEE_PAYER), before)).toBe(true);
  });

  it("refuses bytes paid for by someone other than the facilitator", () => {
    const tx = buildTransfer(requirement(), DEVICE, "testnet");
    expect(() => decodeTransfer(tx.toBytes(), "0.0.5555")).toThrow(/facilitator/);
  });

  it("refuses a transfer that also moves HBAR", () => {
    const token = TokenId.fromString(USDC);
    const tx = new TransferTransaction()
      .addTokenTransfer(token, AccountId.fromString(DEVICE), -1_000_000n)
      .addTokenTransfer(token, AccountId.fromString(MERCHANT), 1_000_000n)
      .addHbarTransfer(AccountId.fromString(DEVICE), Hbar.fromTinybars(-5))
      .addHbarTransfer(AccountId.fromString(MERCHANT), Hbar.fromTinybars(5))
      .setTransactionId(TransactionId.generate(AccountId.fromString(FEE_PAYER)));
    expect(() => decodeTransfer(frozen(tx), FEE_PAYER)).toThrow(/more than a token transfer/);
  });

  it("refuses a transfer that splits the money between two recipients", () => {
    const token = TokenId.fromString(USDC);
    const tx = new TransferTransaction()
      .addTokenTransfer(token, AccountId.fromString(DEVICE), -2_000_000n)
      .addTokenTransfer(token, AccountId.fromString(MERCHANT), 1_000_000n)
      .addTokenTransfer(token, AccountId.fromString("0.0.6666"), 1_000_000n)
      .setTransactionId(TransactionId.generate(AccountId.fromString(FEE_PAYER)));
    expect(() => decodeTransfer(frozen(tx), FEE_PAYER)).toThrow(/single transfer/);
  });

  it("refuses a transfer of two different tokens", () => {
    const tx = new TransferTransaction()
      .addTokenTransfer(TokenId.fromString(USDC), AccountId.fromString(DEVICE), -1n)
      .addTokenTransfer(TokenId.fromString(USDC), AccountId.fromString(MERCHANT), 1n)
      .addTokenTransfer(TokenId.fromString("0.0.777"), AccountId.fromString(DEVICE), -1n)
      .addTokenTransfer(TokenId.fromString("0.0.777"), AccountId.fromString(MERCHANT), 1n)
      .setTransactionId(TransactionId.generate(AccountId.fromString(FEE_PAYER)));
    expect(() => decodeTransfer(frozen(tx), FEE_PAYER)).toThrow(/more than one token/);
  });

  it("refuses bytes that are not a transfer at all", () => {
    const tx = new TopicMessageSubmitTransaction()
      .setTopicId("0.0.4242")
      .setMessage("hello")
      .setTransactionId(TransactionId.generate(AccountId.fromString(FEE_PAYER)));
    expect(() => decodeTransfer(frozen(tx), FEE_PAYER)).toThrow(/more than a token transfer/);
  });

  it("samePayment notices any change in amount, recipient, sender or token", () => {
    const p = { amount: 1n, payTo: MERCHANT, payFrom: DEVICE, tokenId: USDC };
    expect(samePayment(p, { ...p })).toBe(true);
    expect(samePayment(p, { ...p, amount: 2n })).toBe(false);
    expect(samePayment(p, { ...p, payTo: "0.0.3" })).toBe(false);
    expect(samePayment(p, { ...p, payFrom: "0.0.3" })).toBe(false);
    expect(samePayment(p, { ...p, tokenId: "0.0.3" })).toBe(false);
  });
});
