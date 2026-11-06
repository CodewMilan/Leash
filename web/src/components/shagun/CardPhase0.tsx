"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { api } from "@/lib/client-api";

type CardInfo = {
  cardId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  status: string;
  currency: string;
  allTimeLimit: number | null;
  publishableKey: string;
};
type Retrievable = StripeJs & {
  retrieveIssuingCard(card: string, options: { ephemeralKeySecret: string; nonce: string }): Promise<unknown>;
};

const ELEMENT_STYLE = { base: { color: "#262626", fontSize: "18px", fontFamily: "ui-monospace, monospace" } };
const REFRESH_MS = 14 * 60 * 1000;

async function credentials(stripe: StripeJs, cardId: string) {
  const { nonce, error } = await stripe.createEphemeralKeyNonce({ issuingCard: cardId });
  if (!nonce) throw new Error(error?.message || "Stripe.js could not create a nonce.");
  const { ephemeralKeySecret } = await api<{ ephemeralKeySecret: string }>("cards/phase0/ephemeral-key", { nonce });
  return { nonce, ephemeralKeySecret };
}

export function CardPhase0() {
  const [card, setCard] = useState<CardInfo | null>(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(false);
  const number = useRef<HTMLDivElement>(null);
  const cvc = useRef<HTMLDivElement>(null);
  const expiry = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const cleanups: (() => void)[] = [];
    (async () => {
      try {
        await api("session", {});
        const info = await api<CardInfo>("cards/phase0");
        if (cancelled) return;
        setCard(info);
        const stripe = (await loadStripe(info.publishableKey)) as Retrievable | null;
        if (!stripe) throw new Error("Stripe.js did not load.");
        const first = await credentials(stripe, info.cardId);
        await stripe.retrieveIssuingCard(info.cardId, first);
        if (cancelled || !number.current || !cvc.current || !expiry.current) return;
        const elements = stripe.elements();
        const options = { issuingCard: info.cardId, ...first, style: ELEMENT_STYLE };
        const mounted = [
          elements.create("issuingCardNumberDisplay", options),
          elements.create("issuingCardCvcDisplay", options),
          elements.create("issuingCardExpiryDisplay", options),
        ];
        mounted[0].mount(number.current);
        mounted[1].mount(cvc.current);
        mounted[2].mount(expiry.current);
        cleanups.push(() => mounted.forEach((element) => element.destroy()));
        setShown(true);
        timer = window.setInterval(async () => {
          try {
            const next = await credentials(stripe, info.cardId);
            mounted.forEach((element) => element.update(next));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Card details could not be refreshed.");
          }
        }, REFRESH_MS);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "The sandbox card could not be shown.");
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return (
    <main id="main" className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 py-12">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-grey-04">Stripe Issuing · TEST MODE · Phase 0</p>
      <h1 className="text-[40px] leading-none tracking-[-0.05em]">Sandbox virtual card</h1>
      <p className="text-[15px] text-grey-04">
        This card only works inside the Stripe sandbox. It cannot buy real goods. Card details render inside Stripe-hosted frames and never pass through Shagun&apos;s server.
      </p>
      <section className="flex flex-col gap-5 border border-grey-02 bg-white-00 p-6" aria-live="polite">
        <div className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.08em]">
          <span>{card ? `${card.brand} · ${card.status}` : "Loading card"}</span>
          <span>{card?.allTimeLimit != null ? `$${(card.allTimeLimit / 100).toFixed(2)} budget` : ""}</span>
        </div>
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-grey-04">Number</p>
          <div ref={number} className="min-h-6" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-grey-04">Expiry</p>
            <div ref={expiry} className="min-h-6" />
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-grey-04">CVC</p>
            <div ref={cvc} className="min-h-6" />
          </div>
        </div>
        {!shown && !error ? <p className="text-[13px] text-grey-04">Requesting card details from Stripe…</p> : null}
      </section>
      {error ? <p role="alert" className="border border-red-00 p-4 text-[14px] text-red-00">{error}</p> : null}
    </main>
  );
}
