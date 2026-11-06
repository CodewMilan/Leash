export type Network = "testnet" | "mainnet" | "previewnet";

const MIRROR: Record<Network, string> = {
  testnet: "https://testnet.mirrornode.hedera.com",
  mainnet: "https://mainnet.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com",
};

export type DashboardConfig = {
  network: Network;
  accountId: string | null;
  topicId: string | null;
  usdcTokenId: string | null;
};

export function readConfig(): { config: DashboardConfig; missing: string[] } {
  const rawNetwork = process.env.NEXT_PUBLIC_HEDERA_NETWORK;
  const network: Network = rawNetwork === "mainnet" || rawNetwork === "previewnet" ? rawNetwork : "testnet";
  const config: DashboardConfig = {
    network,
    accountId: process.env.NEXT_PUBLIC_LEASH_ACCOUNT_ID || null,
    topicId: process.env.NEXT_PUBLIC_HCS_TOPIC_ID || null,
    usdcTokenId: process.env.NEXT_PUBLIC_USDC_TOKEN_ID || null,
  };
  const missing: string[] = [];
  if (!rawNetwork) missing.push("NEXT_PUBLIC_HEDERA_NETWORK");
  if (!config.accountId) missing.push("NEXT_PUBLIC_LEASH_ACCOUNT_ID");
  if (!config.topicId) missing.push("NEXT_PUBLIC_HCS_TOPIC_ID");
  if (!config.usdcTokenId) missing.push("NEXT_PUBLIC_USDC_TOKEN_ID");
  return { config, missing };
}

export const hashscanTx = (network: Network, consensusTimestamp: string) =>
  `https://hashscan.io/${network}/transaction/${consensusTimestamp}`;
export const hashscanTopic = (network: Network, topicId: string) => `https://hashscan.io/${network}/topic/${topicId}`;
export const hashscanAccount = (network: Network, accountId: string) =>
  `https://hashscan.io/${network}/account/${accountId}`;

async function getJson<T>(network: Network, path: string): Promise<T> {
  const res = await fetch(`${MIRROR[network]}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Mirror node ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

/** HashScan link for a payer-style transaction ID (`0.0.x@seconds.nanos`). */
export const hashscanTxId = (network: Network, txId: string) =>
  `https://hashscan.io/${network}/transaction/${txId.replace("@", "-").replace(/\.(\d+)$/, "-$1")}`;
export const zgChainscanTx = (txHash: string) => `https://chainscan-galileo.0g.ai/tx/${txHash}`;

/** What the device writes to the HCS spend log for each payment (device/src/hedera/spendLog.ts). */
export type SpendEntry = {
  v?: number;
  kind?: "payment";
  hederaTxId?: string;
  amountUsdc?: string;
  tokenId?: string;
  payTo?: string;
  merchant?: string;
  resource?: string;
  overLimit?: boolean;
  approvals?: { fingerprint: boolean; world: boolean; worldReference?: string };
  zgRequestId?: string;
  memoryRootHash?: string;
  memoryTxHash?: string;
  at?: string;
};

export type LogMessage = {
  sequence: number;
  timestamp: string;
  raw: string;
  entry: SpendEntry | null;
};

export type Transfer = {
  id: string;
  timestamp: string;
  result: string;
  amount: number;
  counterparty: string | null;
};

export type Balances = {
  hbar: number;
  usdc: number | null;
};

function decodeBase64Utf8(b64: string) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function fetchSpendLog(network: Network, topicId: string): Promise<LogMessage[]> {
  const data = await getJson<{
    messages: { sequence_number: number; consensus_timestamp: string; message: string }[];
  }>(network, `/api/v1/topics/${topicId}/messages?order=desc&limit=50`);
  return data.messages.map((m) => {
    const raw = decodeBase64Utf8(m.message);
    let entry: SpendEntry | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") entry = parsed as SpendEntry;
    } catch {
      entry = null;
    }
    return { sequence: m.sequence_number, timestamp: m.consensus_timestamp, raw, entry };
  });
}

const decimalsCache = new Map<string, number>();

async function tokenDecimals(network: Network, tokenId: string) {
  const cached = decimalsCache.get(tokenId);
  if (cached !== undefined) return cached;
  const token = await getJson<{ decimals: string }>(network, `/api/v1/tokens/${tokenId}`);
  const d = Number(token.decimals);
  decimalsCache.set(tokenId, d);
  return d;
}

export async function fetchBalances(network: Network, accountId: string, usdcTokenId: string): Promise<Balances> {
  const [account, decimals] = await Promise.all([
    getJson<{ balance: { balance: number; tokens: { token_id: string; balance: number }[] } }>(
      network,
      `/api/v1/accounts/${accountId}`,
    ),
    tokenDecimals(network, usdcTokenId),
  ]);
  const usdc = account.balance.tokens.find((t) => t.token_id === usdcTokenId);
  return {
    hbar: account.balance.balance / 1e8,
    usdc: usdc ? usdc.balance / 10 ** decimals : null,
  };
}

export async function fetchUsdcTransfers(
  network: Network,
  accountId: string,
  usdcTokenId: string,
): Promise<Transfer[]> {
  const [data, decimals] = await Promise.all([
    getJson<{
      transactions: {
        transaction_id: string;
        consensus_timestamp: string;
        result: string;
        token_transfers?: { token_id: string; account: string; amount: number }[];
      }[];
    }>(network, `/api/v1/transactions?account.id=${accountId}&order=desc&limit=50`),
    tokenDecimals(network, usdcTokenId),
  ]);
  return data.transactions
    .filter((t) => t.token_transfers?.some((tt) => tt.token_id === usdcTokenId && tt.account === accountId))
    .map((t) => {
      const usdc = t.token_transfers!.filter((tt) => tt.token_id === usdcTokenId);
      const mine = usdc.find((tt) => tt.account === accountId)!;
      const other = usdc.find((tt) => tt.account !== accountId && Math.sign(tt.amount) !== Math.sign(mine.amount));
      return {
        id: t.transaction_id,
        timestamp: t.consensus_timestamp,
        result: t.result,
        amount: mine.amount / 10 ** decimals,
        counterparty: other?.account ?? null,
      };
    });
}

export function formatTimestamp(ts: string) {
  const ms = Number(ts.split(".")[0]) * 1000;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
