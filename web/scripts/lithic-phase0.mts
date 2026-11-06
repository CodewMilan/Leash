import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LithicError, lithic } from "../src/lib/server/cards/lithic";
import { PHASE0_LIMIT_CENTS, PHASE0_PURPOSE } from "../src/lib/server/cards/webhooks";

const usage = `Usage: pnpm lithic:phase0 <command>
  check                       Confirm the sandbox key works and show ASA enrollment
  enroll <public-url>         Point ASA at <public-url>/api/webhooks/lithic/asa and save its secret
  subscribe <public-url>      Send events to <public-url>/api/webhooks/lithic/events and save its secret
  card [--visa]               Create (paused), open and save the Phase 0 virtual card
  authorize <cents> [--clear] Simulate a purchase on LITHIC_PHASE0_CARD_TOKEN`;

const PROGRAMS = {
  mastercard: "00000000-0000-0000-2000-000000000000",
  visa: "00000000-0000-0000-1000-000000000000",
};
const ENV_FILE = new URL("../.env.local", import.meta.url);

type Card = {
  token: string;
  pan?: string;
  last_four: string;
  state: string;
  type: string;
  spend_limit: number;
  spend_limit_duration: string;
  exp_month?: string;
  exp_year?: string;
  tags?: Record<string, string> | null;
};
type Transaction = {
  token: string;
  status: string;
  result: string;
  amount?: number;
  events?: { type: string; result: string; amount: number }[];
};

const print = (data: unknown) => console.log(JSON.stringify(data, null, 2));
const pause = () => new Promise((resolve) => setTimeout(resolve, 1_100));

function cents(raw: string | undefined) {
  const value = Number(raw);
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000)
    throw new Error("Pass a whole number of cents between 1 and 1000000.");
  return value;
}

function publicUrl(raw: string | undefined) {
  const url = raw ? new URL(raw) : null;
  if (url?.protocol !== "https:") throw new Error("Pass the public https URL of this site.");
  return url.origin;
}

/** Writes a value into the gitignored web/.env.local without echoing it. */
function saveEnv(name: string, value: string) {
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current}${current && !current.endsWith("\n") ? "\n" : ""}${line}\n`;
  writeFileSync(ENV_FILE, next);
  console.error(`Saved ${name} to web/.env.local. Restart the dev server to pick it up.`);
}

function describe(card: Card) {
  return {
    card: card.token,
    lastFour: card.last_four,
    exp: card.exp_month ? `${card.exp_month}/${card.exp_year}` : null,
    state: card.state,
    type: card.type,
    spendLimit: card.spend_limit,
    spendLimitDuration: card.spend_limit_duration,
    purpose: card.tags?.purpose ?? null,
  };
}

async function check() {
  const cards = await lithic<{ data: Card[] }>("cards?page_size=1");
  const asa = await lithic<{ enrolled: boolean }>("responder_endpoints?type=AUTH_STREAM_ACCESS");
  print({ sandbox: true, keyWorks: true, cardsVisible: cards.data.length, asaEnrolled: asa.enrolled });
}

async function enroll(origin: string) {
  const url = `${origin}/api/webhooks/lithic/asa`;
  await lithic("responder_endpoints", { body: { type: "AUTH_STREAM_ACCESS", url } });
  await pause();
  const { secret } = await lithic<{ secret: string }>("auth_stream/secret");
  saveEnv("LITHIC_ASA_SECRET", secret);
  print({ enrolled: true, url });
}

async function subscribe(origin: string) {
  const url = `${origin}/api/webhooks/lithic/events`;
  const subscription = await lithic<{ token: string }>("event_subscriptions", {
    body: { url, description: "Shagun Phase 0 sandbox" },
  });
  const { secret } = await lithic<{ secret: string }>(
    `event_subscriptions/${subscription.token}/secret`,
  );
  saveEnv("LITHIC_EVENTS_SECRET", secret);
  print({ subscription: subscription.token, url });
}

async function card(network: keyof typeof PROGRAMS) {
  const existing = process.env.LITHIC_PHASE0_CARD_TOKEN;
  if (existing) return print(describe(await lithic<Card>(`cards/${existing}`)));
  const created = await lithic<Card>("cards", {
    body: {
      type: "VIRTUAL",
      state: "PAUSED",
      memo: "Shagun Phase 0 sandbox",
      spend_limit: PHASE0_LIMIT_CENTS,
      spend_limit_duration: "FOREVER",
      tags: { purpose: PHASE0_PURPOSE },
      card_program_token: PROGRAMS[network],
    },
  });
  await pause();
  const opened = await lithic<Card>(`cards/${created.token}`, {
    method: "PATCH",
    body: { state: "OPEN" },
  });
  saveEnv("LITHIC_PHASE0_CARD_TOKEN", opened.token);
  print({ network, ...describe(opened) });
}

async function authorize(amount: number, clear: boolean) {
  const token = process.env.LITHIC_PHASE0_CARD_TOKEN;
  if (!token) throw new Error("Set LITHIC_PHASE0_CARD_TOKEN first (run: pnpm lithic:phase0 card).");
  const { pan } = await lithic<Card>(`cards/${token}`);
  if (!pan) throw new Error("The sandbox did not return a PAN for this card.");
  let transaction: string;
  try {
    ({ token: transaction } = await lithic<{ token: string }>("simulate/authorize", {
      body: {
        amount,
        pan,
        descriptor: "Shagun Test Merchant",
        mcc: "5947",
        merchant_currency: "USD",
        merchant_acceptor_id: "SHAGUN0001",
      },
    }));
  } catch (error) {
    if (!(error instanceof LithicError) || error.status !== 422) throw error;
    return print({ approved: false, declinedBeforeAsa: error.message, amount });
  }
  await pause();
  const authorized = await lithic<Transaction>(`transactions/${transaction}`);
  print({
    transaction,
    approved: authorized.result === "APPROVED",
    status: authorized.status,
    result: authorized.result,
    amount,
  });
  if (clear && authorized.result === "APPROVED") {
    await lithic("simulate/clearing", { body: { token: transaction } });
    await pause();
    const cleared = await lithic<Transaction>(`transactions/${transaction}`);
    print({
      transaction,
      status: cleared.status,
      events: cleared.events?.map((e) => ({ type: e.type, result: e.result, amount: e.amount })),
    });
  }
}

const [command, arg, flag] = process.argv.slice(2);
try {
  if (command === "check") await check();
  else if (command === "enroll") await enroll(publicUrl(arg));
  else if (command === "subscribe") await subscribe(publicUrl(arg));
  else if (command === "card") await card(arg === "--visa" ? "visa" : "mastercard");
  else if (command === "authorize") await authorize(cents(arg), flag === "--clear");
  else {
    console.error(usage);
    process.exitCode = 1;
  }
} catch (error) {
  const e = error as { message?: string; status?: number; debuggingRequestId?: string | null };
  console.error(
    JSON.stringify({
      error: error instanceof LithicError ? "LithicError" : "Error",
      status: e.status ?? null,
      debuggingRequestId: e.debuggingRequestId ?? null,
      message: e.message,
    }),
  );
  process.exitCode = 1;
}
