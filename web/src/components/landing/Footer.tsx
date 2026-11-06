"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Device, STATE_META, type DeviceState } from "@/components/Device";
import { FlipLink } from "@/components/FlipLink";
import { Wordmark } from "@/components/Header";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const STAGE: { state: DeviceState; label: string; bg: string; amount: string; recipient: string }[] = [
  { state: "listening", label: "Listen", bg: "#2d4ff9", amount: "", recipient: "" },
  { state: "auto", label: "Auto-pay", bg: "#36d972", amount: "0.60", recipient: "Chai stall" },
  { state: "thumb", label: "Thumb", bg: "#ff942e", amount: "20.00", recipient: "Photographer" },
  { state: "paid", label: "Paid", bg: "#a199ff", amount: "20.00", recipient: "Photographer" },
  { state: "offline", label: "Offline", bg: "#ffc0c0", amount: "", recipient: "" },
];

const LINKS = [
  {
    title: "Product",
    links: [
      { href: "/#how", label: "How it works" },
      { href: "/#rules", label: "Spend rules" },
      { href: "/#simulator", label: "Simulator" },
      { href: "/dashboard", label: "Live log" },
    ],
  },
  {
    title: "When it pays",
    links: [
      { href: "/#cases", label: "Small buys" },
      { href: "/#cases", label: "Big buys" },
      { href: "/#cases", label: "Brain offline" },
      { href: "/#cases", label: "Denied" },
    ],
  },
  {
    title: "Built with",
    links: [
      { href: "https://0g.ai", label: "0G" },
      { href: "https://hedera.com", label: "Hedera" },
      { href: "https://world.org", label: "World" },
      { href: "https://ethglobal.com/events/mumbai", label: "ETHGlobal Mumbai" },
    ],
  },
];

export function Footer() {
  const ref = useRef<HTMLElement>(null);
  const [sel, setSel] = useState(2);

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.to("[data-stage-indicator]", { xPercent: sel * 100, duration: reduce ? 0 : 0.4, ease: EASE.out });
      gsap.to("[data-stage-bg]", { backgroundColor: STAGE[sel].bg, duration: reduce ? 0 : 0.5, ease: EASE.out });
      if (!reduce) {
        gsap.fromTo(
          "[data-stage-device]",
          { y: 40, scale: 0.92, opacity: 0 },
          { y: 0, scale: 1, opacity: 1, duration: 0.6, ease: EASE.spring },
        );
      }
    },
    { dependencies: [sel], scope: ref },
  );

  const current = STAGE[sel];

  return (
    <footer ref={ref} className="relative z-10 mt-[120px] grid border-t border-grey-02 bg-white-00">
      <div data-stage-bg className="relative flex h-[62vh] min-h-[420px] items-center justify-center overflow-hidden" style={{ background: STAGE[2].bg }}>
        <div data-stage-device className="w-[min(260px,26vh)]">
          <Device state={current.state} amount={current.amount} recipient={current.recipient} className="h-auto w-full" />
        </div>
        <span className="absolute left-[15px] top-[14px] font-mono text-[11px] uppercase tracking-[0.08em]">
          {STATE_META[current.state].caption}
        </span>
        <div className="absolute bottom-[15px] left-1/2 -translate-x-1/2">
          <div className="relative grid grid-cols-5 bg-white-00 text-[13px]" role="tablist" aria-label="Device state">
            <span data-stage-indicator className="absolute bottom-0 left-0 top-0 w-1/5 bg-black-00" />
            {STAGE.map((s, i) => (
              <button
                key={s.state}
                type="button"
                role="tab"
                aria-selected={i === sel}
                onClick={() => setSel(i)}
                className="relative z-10 h-[30px] w-[78px] transition-colors duration-200 lg:w-[90px]"
                style={{ color: i === sel ? "#fafafa" : "#262626" }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-[30px] px-[15px] py-[40px] lg:grid-cols-[1fr_auto] lg:py-[50px]">
        <div className="flex flex-col gap-[14px]">
          <Wordmark className="text-[34px]" />
          <p className="max-w-[320px] text-[14px] leading-[1.4] text-grey-04">
            A handheld AI assistant that pays for things for you, but can never spend over your limit without your
            thumb.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-[30px] text-[15px] sm:grid-cols-3 lg:gap-[70px]">
          {LINKS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-[6px]">
              <p className="mb-[4px] font-mono text-[11px] uppercase tracking-[0.08em] text-grey-04">{col.title}</p>
              {col.links.map((l) => (
                <FlipLink key={l.label} href={l.href} label={l.label} className="self-start" />
              ))}
            </nav>
          ))}
        </div>
      </div>

      <div className="flex h-[60px] items-center justify-between border-t border-grey-02 pl-[15px] text-[13px] text-grey-04">
        <span>© 2026 Leash · Built at ETHGlobal Mumbai</span>
        <Link href="/dashboard" className="flex h-full items-center bg-black-00 px-[24px] text-[14px] text-white-00">
          Open Dashboard
        </Link>
      </div>
    </footer>
  );
}
