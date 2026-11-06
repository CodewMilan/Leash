"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Device, type DeviceState } from "@/components/Device";
import { SectionLabel } from "@/components/SectionLabel";
import { EASE, gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/lib/gsap";

type Case = {
  title: string;
  caption: string;
  state: DeviceState;
  bg: string;
  ink: string;
  amount: string;
  recipient: string;
  stickers: string[];
};

const CASES: Case[] = [
  {
    title: "Small buys",
    caption: "Two chais, under your 5 USDC limit. The device checks the limit, signs and pays on its own.",
    state: "auto",
    bg: "#2d4ff9",
    ink: "#fafafa",
    amount: "0.60",
    recipient: "Chai stall",
    stickers: ["UNDER YOUR LIMIT", "AUTO-PAID", "NO TAPS NEEDED"],
  },
  {
    title: "Big buys",
    caption: "Over the limit, the device buzzes and shows the real amount. Your thumb first, then World ID.",
    state: "thumb",
    bg: "#1f1f1f",
    ink: "#fafafa",
    amount: "20.00",
    recipient: "Photographer",
    stickers: ["YOUR THUMB", "WORLD ID", "REAL AMOUNT"],
  },
  {
    title: "Brain offline",
    caption: "If 0G can't be reached, the light turns red. Leash can still talk, but it never pays.",
    state: "offline",
    bg: "#ffc0c0",
    ink: "#262626",
    amount: "3.00",
    recipient: "Cab",
    stickers: ["SAFE MODE", "NO 0G, NO PAY", "RED LIGHT"],
  },
  {
    title: "Denied",
    caption: "Wrong thumb, or a cancelled or expired World ID check: nothing is signed, nothing moves.",
    state: "refused",
    bg: "#ff942e",
    ink: "#262626",
    amount: "40.00",
    recipient: "Unknown shop",
    stickers: ["NOTHING MOVES", "NOT SIGNED", "REFUSED"],
  },
  {
    title: "Spend log",
    caption: "Every payment gets a public receipt on HashScan and a device-signed entry in a Hedera topic.",
    state: "paid",
    bg: "#a199ff",
    ink: "#262626",
    amount: "2.00",
    recipient: "Photo print",
    stickers: ["HASHSCAN", "HCS TOPIC", "USDC"],
  },
  {
    title: "Memory",
    caption: "Each decision is saved to 0G Storage with its request ID, so you can check why it paid.",
    state: "thinking",
    bg: "#36d972",
    ink: "#262626",
    amount: "2.00",
    recipient: "Chai stall",
    stickers: ["0G STORAGE", "REQUEST ID", "AUDIT TRAIL"],
  },
];

const STICKER_COLORS = ["#36d972", "#ff942e", "#fafafa", "#ffbfec", "#a199ff"];

function Artwork({ c }: { c: Case }) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <span
        className="absolute left-[18px] top-[16px] font-mono text-[11px] uppercase tracking-[0.08em]"
        style={{ color: c.ink }}
      >
        {c.title}
      </span>
      <div className="absolute bottom-[-14%] right-[8%] w-[46%] rotate-[-7deg]">
        <Device state={c.state} amount={c.amount} recipient={c.recipient} className="h-auto w-full" />
      </div>
      <p
        className="absolute bottom-[18px] left-[18px] max-w-[44%] text-[clamp(22px,2.4vw,40px)] leading-[0.95] tracking-[-0.04em]"
        style={{ color: c.ink }}
      >
        {c.stickers[0].toLowerCase()}
      </p>
    </div>
  );
}

export function UseCases() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        ScrollTrigger.create({
          trigger: scrollerRef.current,
          start: "top top+=50",
          end: "bottom bottom",
          onUpdate: (self) => {
            const idx = Math.min(CASES.length - 1, Math.floor(self.progress * CASES.length));
            if (idx !== activeRef.current) {
              activeRef.current = idx;
              setActive(idx);
            }
          },
        });
      });
    },
    { scope: scrollerRef },
  );

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      const d = reduce ? 0 : 0.22;
      gsap.utils.toArray<HTMLElement>("[data-case-item]").forEach((el, i) => {
        gsap.to(el, {
          paddingLeft: i === active ? 20 : 0,
          color: i === active ? "#262626" : "#e1e1e1",
          duration: d,
          ease: EASE.out,
        });
      });
      gsap.utils.toArray<HTMLElement>("[data-case-slide]").forEach((el, i) => {
        gsap.to(el, {
          clipPath: i <= active ? "inset(0% 0% 0% 0%)" : "inset(100% 0% 0% 0%)",
          duration: d,
          ease: EASE.out,
        });
      });
      gsap.fromTo("[data-case-caption]", { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: reduce ? 0 : 0.35, ease: EASE.out });

      if (reduce) return;
      const stickers = gsap.utils.toArray<HTMLElement>("[data-sticker]");
      gsap.killTweensOf(stickers);
      gsap.fromTo(
        stickers,
        { x: 0, y: 0, rotation: 0, scale: 0.85, opacity: 1 },
        {
          x: () => gsap.utils.random(-260, 260),
          y: () => gsap.utils.random(-230, 230),
          rotation: () => gsap.utils.random(-50, 50),
          scale: 1,
          duration: 0.8,
          ease: EASE.out,
          stagger: 0.012,
        },
      );
      gsap.to(stickers, { opacity: 0, duration: 0.4, delay: 1.6, stagger: 0.01 });
    },
    { dependencies: [active], scope: scrollerRef },
  );

  const jumpTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el || window.innerWidth < 1024) {
      setActive(i);
      return;
    }
    const top = el.getBoundingClientRect().top + window.scrollY - 50;
    const span = el.offsetHeight - (window.innerHeight - 50);
    window.scrollTo({ top: top + ((i + 0.5) / CASES.length) * span, behavior: "smooth" });
  };

  const current = CASES[active];

  return (
    <div ref={scrollerRef} id="cases" className="lg:h-[560vh]">
      <section className="flex flex-col overflow-x-clip pb-[20px] lg:sticky lg:top-[var(--header-h)] lg:h-[calc(100dvh-var(--header-h))]">
        <SectionLabel>When it pays</SectionLabel>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[clamp(360px,31.72vw,609px)_minmax(0,1fr)]">
          <ul className="flex flex-col px-[15px] pt-[20px] lg:pt-[24px]">
            {CASES.map((c, i) => (
              <li key={c.title}>
                <button
                  type="button"
                  data-case-item
                  onClick={() => jumpTo(i)}
                  aria-current={i === active ? "true" : undefined}
                  className="text-left text-[clamp(34px,3.6vw,58px)] leading-[1.02] tracking-[-0.04em]"
                  style={{ color: i === 0 ? "#262626" : "#e1e1e1", paddingLeft: i === 0 ? 20 : 0 }}
                >
                  {c.title}
                </button>
              </li>
            ))}
          </ul>

          <div className="relative min-h-[360px] px-[15px] pt-[20px] lg:min-h-0 lg:px-0 lg:pt-0">
            <div className="relative h-full w-full lg:max-w-[760px]">
              {CASES.map((c, i) => (
                <div
                  key={c.title}
                  data-case-slide
                  className="absolute inset-0"
                  style={{
                    zIndex: i,
                    background: c.bg,
                    clipPath: i === 0 ? "inset(0% 0% 0% 0%)" : "inset(100% 0% 0% 0%)",
                  }}
                  aria-hidden={i !== active}
                >
                  <Artwork c={c} />
                </div>
              ))}
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" aria-hidden="true">
                {Array.from({ length: 12 }).map((_, i) => (
                  <span
                    key={i}
                    data-sticker
                    className="absolute px-[8px] py-[4px] font-mono text-[11px] font-semibold uppercase leading-[1.1] text-ink opacity-0"
                    style={{ background: STICKER_COLORS[i % STICKER_COLORS.length] }}
                  >
                    {current.stickers[i % current.stickers.length]}
                  </span>
                ))}
              </div>
            </div>
            <Link
              href="/dashboard"
              className="absolute right-0 top-0 z-30 hidden h-[40px] items-center bg-black-00 px-[20px] text-[14px] text-white-00 lg:flex"
            >
              Open Dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-[10px] px-[15px] pt-[20px] lg:grid-cols-[clamp(360px,31.72vw,609px)_1fr]">
          <p data-case-caption className="max-w-[340px] text-[16px] leading-[1.3]">
            {current.caption}
          </p>
          <Link href="/dashboard" className="self-start text-[14px] underline underline-offset-4">
            See the live log
          </Link>
        </div>
      </section>
    </div>
  );
}
