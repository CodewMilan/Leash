import type Stripe from "stripe";
import { assertSandbox, stripe } from "../src/lib/server/cards/stripe";
import { PHASE0_LIMIT_CENTS, PHASE0_PURPOSE } from "../src/lib/server/cards/webhooks";

const usage = `Usage: pnpm stripe:phase0 <command>
  check                 Show the sandbox Issuing balance
  fund <cents>          Add sandbox test funds to the Issuing balance (US accounts)
  card                  Create, activate and print the Phase 0 virtual card
  authorize <cents> [--capture]
                        Simulate a purchase on STRIPE_PHASE0_CARD_ID`;

const print = (data: unknown) => console.log(JSON.stringify(data, null, 2));

function cents(raw: string | undefined) {
  const value = Number(raw);
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000)
    throw new Error("Pass a whole number of cents between 1 and 1000000.");
  return value;
}

async function check() {
  const balance = await stripe().balance.retrieve();
  assertSandbox(balance);
  const issuing = balance.issuing?.available ?? [];
  print({ livemode: balance.livemode, issuingAvailable: issuing });
  if (!issuing.some((b) => b.currency === "usd" && b.amount > 0))
    console.error("No USD Issuing test balance yet. Run: pnpm stripe:phase0 fund 10000");
}

async function fund(amount: number) {
  const topup = await stripe().topups.create(
    {
      amount,
      currency: "usd",
      description: "Shagun Phase 0 sandbox funds",
      destination_balance: "issuing",
    } as Stripe.TopupCreateParams,
    { idempotencyKey: `shagun-phase0-topup-${amount}-${new Date().toISOString().slice(0, 13)}` },
  );
  assertSandbox(topup);
  print({ topup: topup.id, amount: topup.amount, status: topup.status });
}

async function card() {
  const client = stripe();
  const existing = process.env.STRIPE_PHASE0_CARD_ID;
  if (existing) {
    const found = await client.issuing.cards.retrieve(existing);
    assertSandbox(found);
    return print(describe(found));
  }
  const cardholder = await client.issuing.cardholders.create(
    {
      type: "individual",
      name: "Shagun Sandbox",
      email: "sandbox@shagun.test",
      status: "active",
      individual: {
        first_name: "Shagun",
        last_name: "Sandbox",
        dob: { day: 1, month: 11, year: 1990 },
        card_issuing: {
          user_terms_acceptance: { date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" },
        },
      },
      billing: {
        address: {
          line1: "123 Main Street",
          city: "San Francisco",
          state: "CA",
          postal_code: "94111",
          country: "US",
        },
      },
      metadata: { purpose: PHASE0_PURPOSE },
    },
    { idempotencyKey: "shagun-phase0-cardholder-v1" },
  );
  assertSandbox(cardholder);
  const created = await client.issuing.cards.create(
    {
      cardholder: cardholder.id,
      type: "virtual",
      currency: "usd",
      status: "inactive",
      spending_controls: {
        spending_limits: [{ amount: PHASE0_LIMIT_CENTS, interval: "all_time" }],
      },
      metadata: { purpose: PHASE0_PURPOSE },
    },
    { idempotencyKey: "shagun-phase0-card-v1" },
  );
  assertSandbox(created);
  const active = await client.issuing.cards.update(created.id, { status: "active" });
  assertSandbox(active);
  print({ cardholder: cardholder.id, ...describe(active) });
  console.error(`Add to web/.env.local: STRIPE_PHASE0_CARD_ID=${active.id}`);
}

function describe(c: Stripe.Issuing.Card) {
  return {
    card: c.id,
    brand: c.brand,
    last4: c.last4,
    exp: `${c.exp_month}/${c.exp_year}`,
    status: c.status,
    currency: c.currency,
    allTimeLimit:
      c.spending_controls.spending_limits?.find((l) => l.interval === "all_time")?.amount ?? null,
    purpose: c.metadata?.purpose ?? null,
  };
}

async function authorize(amount: number, capture: boolean) {
  const client = stripe();
  const cardId = process.env.STRIPE_PHASE0_CARD_ID;
  if (!cardId) throw new Error("Set STRIPE_PHASE0_CARD_ID first (run: pnpm stripe:phase0 card).");
  const authorization = await client.testHelpers.issuing.authorizations.create({
    card: cardId,
    amount,
    currency: "usd",
    merchant_data: {
      category: "gift_card_novelty_and_souvenir_shops",
      name: "Shagun Test Merchant",
      city: "Mumbai",
      country: "IN",
      network_id: "shagun0001",
    },
  });
  assertSandbox(authorization);
  const history = authorization.request_history.at(-1);
  print({
    authorization: authorization.id,
    approved: authorization.approved,
    status: authorization.status,
    amount: authorization.amount,
    reason: history?.reason ?? null,
    reasonMessage: history?.reason_message ?? null,
  });
  if (capture && authorization.approved) {
    const captured = await client.testHelpers.issuing.authorizations.capture(authorization.id);
    assertSandbox(captured);
    const transactions = await client.issuing.transactions.list({ card: cardId, limit: 3 });
    print({
      captured: captured.id,
      status: captured.status,
      transactions: transactions.data.map((t) => ({ id: t.id, type: t.type, amount: t.amount })),
    });
  }
}

const [command, arg, flag] = process.argv.slice(2);
try {
  if (command === "check") await check();
  else if (command === "fund") await fund(cents(arg));
  else if (command === "card") await card();
  else if (command === "authorize") await authorize(cents(arg), flag === "--capture");
  else {
    console.error(usage);
    process.exitCode = 1;
  }
} catch (error) {
  const e = error as { type?: string; code?: string; message?: string };
  console.error(
    JSON.stringify({ error: e.type || "Error", code: e.code ?? null, message: e.message }),
  );
  process.exitCode = 1;
}
