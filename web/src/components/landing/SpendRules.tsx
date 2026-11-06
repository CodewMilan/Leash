"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

type Mode = "demo" | "production";

const RULES = [
  {
    name: "Auto",
    badge: null,
    amount: "≤ 5",
    unit: "USDC",
    sub: "per payment",
    pitch: "Small buys pay themselves.",
    cta: "See auto-payments",
    points: ["Limit checked on the device", "Signed by the device", "Logged on Hedera"],
    dark: false,
  },
  {
    name: "Thumb",
    badge: "Your call",
    amount: "> 5",
    unit: "USDC",
    sub: "per payment",
    pitch: "Nothing moves until you say so.",
    cta: "See approved payments",
    points: ["Real amount on the device screen", "Fingerprint on the device", "Fresh World ID check on your phone"],
    dark: true,
  },
  {
    name: "Refuse",
    badge: null,
    amount: "0",
    unit: "USDC",
    sub: "moves",
    pitch: "Denied, expired or cancelled.",
    cta: "How refusals work",
    points: ["Nothing is signed", "Screen shows Payment refused", "The agent is told no"],
    dark: false,
  },
];

const KEY_LINE: Record<Mode, string> = {
  demo: "Keys are files on the device for the demo.",
  production: "Keys live in a secure element, next to the fingerprint check.",
};

export function SpendRules() {
  const ref = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<Mode>("demo");

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.to("[data-mode-pill]", {
        xPercent: mode === "demo" ? 0 : 100,
        duration: reduce ? 0 : 0.35,
        ease: EASE.out,
      });
      gsap.fromTo(
        "[data-key-line]",
        { yPercent: 60, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: reduce ? 0 : 0.35, ease: EASE.out, stagger: 0.04 },
      );
    },
    { dependencies: [mode], scope: ref },
  );

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-rule-card]", {
        y: 40,
        opacity: 0,
        duration: 0.7,
        ease: EASE.out,
        stagger: 0.08,
        scrollTrigger: { trigger: "[data-rule-grid]", start: "top 80%" },
      });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} id="rules" className="flex flex-col gap-[30px] pb-[60px] pt-[60px]">
      <div>
        <SectionLabel>Spend rules</SectionLabel>
        <div className="flex flex-col gap-[20px] px-[15px] pt-[16px] lg:flex-row lg:items-end lg:justify-between">
          <h2 className="display-2 max-w-[760px] font-normal">Small buys pay themselves. Big ones wait for you.</h2>
          <div className="flex items-center gap-[12px]">
            <div className="relative grid grid-cols-2 bg-grey-01 p-[3px] text-[13px]" role="group" aria-label="Key storage">
              <span data-mode-pill className="absolute bottom-[3px] left-[3px] top-[3px] w-[calc(50%-3px)] bg-white-00" />
              {(["demo", "production"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className="relative z-10 px-[14px] py-[6px] capitalize"
                >
                  {m === "demo" ? "Demo device" : "Production"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-[15px] flex flex-col justify-between gap-[8px] bg-grey-01 px-[16px] py-[14px] text-[14px] lg:flex-row lg:items-center">
        <p>
          <span className="font-medium">Brain offline</span>
          <span className="text-grey-04"> · Leash can still talk, it never pays.</span>
        </p>
        <Link href="/#cases" className="underline underline-offset-4">
          How safe mode works →
        </Link>
      </div>

      <div data-rule-grid className="mx-[15px] grid gap-[10px] lg:grid-cols-3">
        {RULES.map((r) => (
          <article
            key={r.name}
            data-rule-card
            className={`flex flex-col gap-[18px] p-[20px] ${r.dark ? "bg-black-00 text-white-00" : "border border-grey-02 bg-white-00"}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[24px] tracking-[-0.02em]">{r.name}</h3>
              {r.badge && <span className="bg-green-00 px-[8px] py-[3px] font-mono text-[11px] uppercase text-ink">{r.badge}</span>}
            </div>
            <p className="flex items-baseline gap-[8px]">
              <span className="text-[64px] leading-none tracking-[-0.05em]">{r.amount}</span>
              <span className={`text-[15px] ${r.dark ? "text-grey-03" : "text-grey-04"}`}>
                {r.unit} {r.sub}
              </span>
            </p>
            <p className={`text-[15px] ${r.dark ? "text-grey-03" : "text-grey-04"}`}>{r.pitch}</p>
            <Link
              href={r.name === "Refuse" ? "/#cases" : "/dashboard"}
              className={`flex h-[42px] items-center justify-center text-[14px] ${r.dark ? "bg-white-00 text-ink" : "bg-black-00 text-white-00"}`}
            >
              {r.cta}
            </Link>
            <div className={`h-px ${r.dark ? "bg-grey-04" : "bg-grey-02"}`} />
            <ul className="flex flex-col gap-[8px] text-[14px]">
              {r.points.map((pt) => (
                <li key={pt} className="flex gap-[8px]">
                  <span aria-hidden="true">+</span>
                  {pt}
                </li>
              ))}
              <li className="flex gap-[8px] overflow-hidden">
                <span aria-hidden="true">+</span>
                <span data-key-line className="inline-block">
                  {KEY_LINE[mode]}
                </span>
              </li>
            </ul>
          </article>
        ))}
      </div>

      <p className="px-[15px] text-[13px] leading-[1.4] text-grey-04">
        The demo limit is 5 USDC on Hedera testnet; set your own. Every rule runs on the device itself, so a tricked
        agent or a hacked phone can&apos;t change it.
      </p>
    </section>
  );
}
