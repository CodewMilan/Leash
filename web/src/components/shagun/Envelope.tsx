"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const POSTERS = [
  { bg: "#ffbfec", k: "Sent", t: "$11", d: "Funded on Whitechain and waiting in the vault. Share the link or tap the envelope." },
  { bg: "#36d972", k: "Passkey claimed", t: "$25", d: "Claimed with the private gift link and a passkey. The same passkey opens the card." },
  { bg: "#ff942e", k: "Prepaid card", t: "$51", d: "A prepaid Lithic sandbox card loaded with the gift. Purchases are simulated." },
  { bg: "#a199ff", k: "Comes back", t: "$101", d: "At expiry the unspent USDT returns to the sender. Unclaimed gifts return in full." },
  { bg: "#193ef9", k: "Link denied", t: "$25", light: true, d: "A gift can only be claimed once. A campaign also refuses a second gift claimed with the same passkey." },
];

function Poster({ poster }: { poster: (typeof POSTERS)[number] }) {
  return (
    <div className={`flex h-[168px] flex-col justify-between p-3 ${poster.light ? "text-white-00" : "text-ink"}`} style={{ background: poster.bg }}>
      <span className="font-mono text-[10px] tracking-[0.08em] uppercase">{poster.k}</span>
      <span className="text-[32px] leading-none tracking-[-0.05em]">{poster.t}</span>
      <span className="text-[13px]">shagun</span>
    </div>
  );
}

export function GiftRail() {
  const ref = useRef<HTMLElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !colRef.current) return;
      gsap.to(colRef.current, { id: "gift-rail-scroll", yPercent: -50, duration: 36, ease: "none", repeat: -1 });
    },
    { scope: ref },
  );

  useGSAP(
    () => {
      gsap.to("[data-rail-panel]", { x: open ? 0 : 340, duration: prefersReducedMotion() ? 0 : 0.45, ease: EASE.out });
      gsap.to("[data-rail-chevron]", { rotate: open ? 180 : 0, duration: 0.3, ease: EASE.out });
    },
    { dependencies: [open], scope: ref },
  );

  const setSpeed = (speed: number) => {
    const tween = gsap.getById("gift-rail-scroll");
    if (tween) gsap.to(tween, { timeScale: speed, duration: 0.5 });
  };

  return (
    <aside ref={ref} aria-label="Gift states" className="pointer-events-none fixed top-[var(--header-h)] right-0 bottom-0 z-30 hidden w-[calc(var(--rail-w)+340px)] overflow-hidden lg:block">
      <div data-rail-panel className="pointer-events-auto absolute inset-y-0 right-0 flex w-[calc(var(--rail-w)+340px)] border-l border-grey-02 bg-white-00" style={{ transform: "translateX(340px)" }}>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-7 shrink-0 flex-col items-center gap-2 border-r border-grey-02 pt-3 text-[12px]">
          <svg data-rail-chevron viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden="true">
            <path d="M7 1 L3 5 L7 9" fill="none" stroke="#262626" strokeWidth="1.5" />
          </svg>
          <span className="rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">{open ? "Close" : "What it can do"}</span>
        </button>
        <div className="relative w-[calc(var(--rail-w)-28px)] shrink-0 overflow-hidden" onMouseEnter={() => setSpeed(0.2)} onMouseLeave={() => setSpeed(1)}>
          <div ref={colRef} className="flex flex-col gap-1.5 p-1.5">
            {[...POSTERS, ...POSTERS].map((poster, index) => (
              <div key={`${poster.k}-${index}`} aria-hidden={index >= POSTERS.length}>
                <Poster poster={poster} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto border-l border-grey-02 p-4" inert={!open}>
          <p className="text-[22px] tracking-[-0.03em]">What the envelope can do</p>
          <p className="mt-1 mb-4 text-[13px] text-grey-04">Every state in the demo, and what it means.</p>
          <ul>
            {POSTERS.map((poster) => (
              <li key={poster.k} className="border-b border-grey-02 py-3">
                <p className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0" style={{ background: poster.bg }} />
                  <span className="font-mono text-[11px] tracking-[0.06em] uppercase">{poster.k}</span>
                </p>
                <p className="mt-1 pl-[22px] text-[13px] leading-snug text-grey-04">{poster.d}</p>
              </li>
            ))}
          </ul>
          <Link href="/dashboard" className="mt-auto flex min-h-11 items-center justify-center bg-black-00 text-[14px] text-white-00">
            Send a gift
          </Link>
        </div>
      </div>
    </aside>
  );
}

export function Envelope({ amount, small = false }: { amount: string; small?: boolean }) {
  return (
    <div className={`envelope-stage ${small ? "is-small" : ""}`} aria-hidden="true">
      <div className="envelope-object">
        <div className="envelope-back" />
        <div className="gift-note">
          <span className="note-label">SHAGUN</span>
          <span className="note-amount">${amount}</span>
          <span className="note-greeting">A little gift. A lot of love.</span>
        </div>
        <div className="envelope-face" />
        <div className="envelope-fold" />
        <div className="envelope-seal">
          <span className="block h-3 w-3 border border-ink" />
        </div>
        <span className="envelope-brand">shagun</span>
      </div>
    </div>
  );
}
