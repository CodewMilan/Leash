"use client";

import { useEffect, useRef, useState } from "react";
import LithicEmbed, { CardDetailsRequestError, Environment, type CardEmbed } from "lithic-embed";
import { api } from "@/lib/client-api";

type CardInfo = {
  cardToken: string;
  lastFour: string;
  expMonth: string | null;
  expYear: string | null;
  state: string;
  spendLimit: number;
  spendLimitDuration: string;
};

const FIELD_STYLE = { color: "#262626", "font-size": "18px", "font-family": "ui-monospace, monospace" };

export function CardPhase0() {
  const [card, setCard] = useState<CardInfo | null>(null);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const embed = useRef<CardEmbed | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api("session", {});
        const info = await api<CardInfo>("cards/phase0");
        if (cancelled) return;
        setCard(info);
        const { session } = await api<{ session: string }>("cards/phase0/embed", {});
        if (cancelled) return;
        const card = new LithicEmbed(Environment.SANDBOX).card(session, { syncStyles: false });
        await card.mount({
          pan: { selector: "#lithic-pan", styles: FIELD_STYLE },
          expMonth: { selector: "#lithic-exp-month", styles: FIELD_STYLE },
          expYear: { selector: "#lithic-exp-year", styles: FIELD_STYLE },
          cvv: { selector: "#lithic-cvv", styles: FIELD_STYLE },
        });
        if (cancelled) return;
        embed.current = card;
        setMounted(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "The sandbox card could not be shown.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (!embed.current) return;
    try {
      await embed.current.toggleMasking();
      setRevealed((value) => !value);
    } catch (e) {
      setError(
        e instanceof CardDetailsRequestError
          ? "The card session expired. Reload the page to show the details again."
          : "Card details could not be loaded.",
      );
    }
  }

  return (
    <main id="main" className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 py-12">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-grey-04">Lithic · SANDBOX · Phase 0</p>
      <h1 className="text-[40px] leading-none tracking-[-0.05em]">Sandbox virtual card</h1>
      <p className="text-[15px] text-grey-04">
        This card only works inside the Lithic sandbox. It cannot buy real goods. Card details render inside Lithic-hosted frames and never pass through Chinki&apos;s server.
      </p>
      <section className="flex flex-col gap-5 border border-grey-02 bg-white-00 p-6" aria-live="polite">
        <div className="flex items-center justify-between font-mono text-[12px] uppercase tracking-[0.08em]">
          <span>{card ? `•••• ${card.lastFour} · ${card.state}` : "Loading card"}</span>
          <span>{card ? `$${(card.spendLimit / 100).toFixed(2)} budget` : ""}</span>
        </div>
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-grey-04">Number</p>
          <div id="lithic-pan" className="h-7" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-grey-04">Expiry</p>
            <div className="flex items-center gap-1">
              <div id="lithic-exp-month" className="h-7 w-8" />
              <span aria-hidden>/</span>
              <div id="lithic-exp-year" className="h-7 w-14" />
            </div>
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-grey-04">CVV</p>
            <div id="lithic-cvv" className="h-7" />
          </div>
        </div>
        {mounted ? (
          <button
            type="button"
            onClick={toggle}
            className="self-start border border-grey-03 px-4 py-2 font-mono text-[12px] uppercase tracking-[0.08em]"
          >
            {revealed ? "Hide details" : "Show details"}
          </button>
        ) : !error ? (
          <p className="text-[13px] text-grey-04">Opening a card session with Lithic…</p>
        ) : null}
      </section>
      {error ? <p role="alert" className="border border-red-00 p-4 text-[14px] text-red-00">{error}</p> : null}
    </main>
  );
}
