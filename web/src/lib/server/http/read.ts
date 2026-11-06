import { Contract, JsonRpcProvider } from "ethers";
import { AppError, officialToken, rpcUrl, vaultAddress } from "../config";
import { csvCell, tokenAmount } from "../../amounts";
import { getGift, publicGift, canViewGift, type GiftRow } from "../gifts/repository";
import { sql } from "../db";
import type { Session } from "../auth/session";
import { json } from "./response";
export async function readResource(path: string, s: Session): Promise<Response | null> {
  if (path === "gift-config") return json({ vault: vaultAddress(), chainId: 1874 });
  if (path === "session") return json({ sender: s.sender, passkey: !!s.credential_id });
  if (path === "gifts" || path === "gifts/export") {
    if (!s.sender) throw new AppError("Sign in as a sender first.", 401);
    const rows = await sql<GiftRow>(
      `SELECT g.*,p.payout_id,p.status AS payout_status,c.status AS card_status,c.budget_cents AS card_budget,c.reserved_cents AS card_reserved,c.cleared_cents AS card_cleared FROM gifts g LEFT JOIN payouts p ON p.gift_id=g.id LEFT JOIN gift_cards c ON c.gift_id=g.id WHERE g.sender=$1 ORDER BY g.created_at DESC LIMIT 500`,
      [s.sender],
    );
    if (path === "gifts/export") {
      const header = [
        "Gift ID",
        "Label",
        "USDT",
        "Status",
        "Expires (UTC)",
        "Create transaction",
        "Claim transaction",
        "Return transaction",
        "Card status",
        "Card budget (USD cents)",
        "Card holds (USD cents)",
        "Card spending (USD cents)",
        "UPI test payout ID",
        "UPI test payout status",
      ];
      const csv = [
        header,
        ...rows.map((g) => [
          g.id,
          g.label,
          tokenAmount(g.amount, 6).replaceAll(",", ""),
          g.status,
          new Date(Number(g.expiry) * 1000).toISOString(),
          g.created_tx,
          g.claim_tx,
          g.refund_tx,
          g.card_status,
          g.card_budget,
          g.card_reserved,
          g.card_cleared,
          g.payout_id,
          g.payout_status,
        ]),
      ]
        .map((r) => r.map(csvCell).join(","))
        .join("\r\n");
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="shagun-gifts.csv"',
          "cache-control": "no-store",
        },
      });
    }
    return json({ gifts: rows.map((g) => publicGift(g, true)) });
  }
  if (path === "balance") {
    if (!s.sender) throw new AppError("Sign in as a sender first.", 401);
    const provider = new JsonRpcProvider(rpcUrl());
    try {
      if ((await provider.getNetwork()).chainId !== 1874n)
        throw new AppError("Whitechain configuration has the wrong chain ID.", 503);
      const token = new Contract(
        officialToken(),
        ["function balanceOf(address) view returns(uint256)"],
        provider,
      );
      return json({ balance: String(await token.balanceOf(s.sender)) });
    } finally {
      provider.destroy();
    }
  }
  if (/^gifts\/0x[a-f0-9]{64}$/i.test(path)) {
    const g = await getGift(path.split("/")[1]);
    return json(publicGift(g, await canViewGift(g, s)));
  }
  return null;
}
