import { AccountId, Hbar, TokenAssociateTransaction, TokenId, TransferTransaction, type Signer, type Transaction } from "@hiero-ledger/sdk";

export const USDC_DECIMALS = 6;

/** "12.5" -> 12500000n. Throws on anything that isn't a positive amount with at most `decimals` places. */
export function parseAmount(text: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new Error("Enter an amount like 10 or 2.5");
  const frac = m[2] ?? "";
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  const units = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  if (units <= 0n) throw new Error("Amount must be above zero");
  return units;
}

/** Lets an account receive USDC. Signed in the account owner's own wallet. */
export function buildAssociate(accountId: string, tokenId: string): TokenAssociateTransaction {
  return new TokenAssociateTransaction().setAccountId(AccountId.fromString(accountId)).setTokenIds([TokenId.fromString(tokenId)]);
}

/** Sends USDC or HBAR from the owner's wallet to their Leash device. */
export function buildTopUp(args: { from: string; to: string; asset: "usdc" | "hbar"; units: bigint; usdcTokenId: string }): TransferTransaction {
  if (args.from === args.to) throw new Error("The wallet and the Leash device are the same account");
  const from = AccountId.fromString(args.from);
  const to = AccountId.fromString(args.to);
  const tx = new TransferTransaction();
  if (args.asset === "usdc") {
    const token = TokenId.fromString(args.usdcTokenId);
    tx.addTokenTransfer(token, from, -args.units).addTokenTransfer(token, to, args.units);
  } else {
    tx.addHbarTransfer(from, Hbar.fromTinybars((-args.units).toString())).addHbarTransfer(to, Hbar.fromTinybars(args.units.toString()));
  }
  return tx.setTransactionMemo("Leash top-up");
}

/** Freezes, asks the wallet to sign and submit, and waits for consensus. Returns the transaction ID. */
export async function executeInWallet(tx: Transaction, signer: Signer): Promise<string> {
  const frozen = await tx.freezeWithSigner(signer);
  const response = await frozen.executeWithSigner(signer);
  const receipt = await response.getReceiptWithSigner(signer);
  const status = receipt.status.toString();
  if (status !== "SUCCESS") throw new Error(`Hedera rejected the transaction: ${status}`);
  return response.transactionId.toString();
}
