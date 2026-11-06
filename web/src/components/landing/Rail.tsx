"use client";

import { useRef, useState } from "react";
import { DeviceGlyph, STATE_META, type DeviceState } from "@/components/Device";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const POSTERS: { state: DeviceState; bg: string }[] = [
  { state: "auto", bg: "#36d972" },
  { state: "thumb", bg: "#ff942e" },
  { state: "listening", bg: "#2d4ff9" },
  { state: "paid", bg: "#a199ff" },
  { state: "offline", bg: "#ffc0c0" },
  { state: "thinking", bg: "#ffbfec" },
  { state: "refused", bg: "#1f1f1f" },
];

function Poster({ p }: { p: (typeof POSTERS)[number] }) {
  const dark = p.bg === "#1f1f1f" || p.bg === "#2d4ff9";
  return (
    <div className="flex h-[176px] w-full flex-col justify-between p-[10px]" style={{ background: p.bg }}>
      <span className={`font-mono text-[10px] uppercase leading-[1.1] tracking-[0.06em] ${dark ? "text-white-00" : "text-ink"}`}>
        {STATE_META[p.state].label}
      </span>
      <DeviceGlyph state={p.state} className="mx-auto h-[96px] w-auto" />
      <span className={`text-[12px] leading-[1.1] ${dark ? "text-white-00" : "text-ink"}`}>{STATE_META[p.state].caption}</span>
    </div>
  );
}

/** Fixed right-hand rail of device-state posters, scrolling forever; opens into a wider panel. */
export function Rail() {
  const ref = useRef<HTMLElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const [open, setOpen] = useState(false);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !colRef.current) return;
      tweenRef.current = gsap.to(colRef.current, { yPercent: -50, duration: 40, ease: "none", repeat: -1 });
    },
    { scope: ref },
  );

  useGSAP(
    () => {
      gsap.to("[data-rail-panel]", {
        x: open ? 0 : 340,
        duration: prefersReducedMotion() ? 0 : 0.45,
        ease: EASE.out,
      });
      gsap.to("[data-rail-chevron]", { rotate: open ? 180 : 0, duration: 0.3, ease: EASE.out });
    },
    { dependencies: [open], scope: ref },
  );

  const setSpeed = (s: number) => {
    if (tweenRef.current) gsap.to(tweenRef.current, { timeScale: s, duration: 0.5 });
  };

  return (
    <aside
      ref={ref}
      aria-label="Device states"
      className="pointer-events-none fixed bottom-0 right-0 top-[var(--header-h)] z-30 hidden w-[calc(var(--rail-w)+340px)] overflow-hidden lg:block"
    >
      <div
        data-rail-panel
        className="pointer-events-auto absolute inset-y-0 right-0 flex w-[calc(var(--rail-w)+340px)] border-l border-grey-02 bg-white-00"
        style={{ transform: "translateX(340px)" }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-[27px] shrink-0 flex-col items-center gap-[10px] border-r border-grey-02 pt-[14px] text-[12px]"
        >
          <svg data-rail-chevron viewBox="0 0 10 10" className="h-[10px] w-[10px]" aria-hidden="true">
            <path d="M7 1 L3 5 L7 9" fill="none" stroke="#262626" strokeWidth="1.5" />
          </svg>
          <span className="whitespace-nowrap [writing-mode:vertical-rl] rotate-180">Device states</span>
        </button>

        <div
          className="relative w-[131px] shrink-0 overflow-hidden"
          onMouseEnter={() => setSpeed(0.2)}
          onMouseLeave={() => setSpeed(1)}
        >
          <div ref={colRef} className="flex flex-col gap-[6px] p-[6px]">
            {[...POSTERS, ...POSTERS].map((p, i) => (
              <div key={i} aria-hidden={i >= POSTERS.length}>
                <Poster p={p} />
              </div>
            ))}
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto border-l border-grey-02 p-[16px]">
          <p className="mb-[4px] text-[22px] tracking-[-0.02em]">What the screen tells you</p>
          <p className="mb-[16px] text-[13px] text-grey-04">Every state the device can be in, and what it means.</p>
          <ul className="flex flex-col gap-[10px]">
            {POSTERS.map((p) => (
              <li key={p.state} className="flex items-center gap-[10px] border-b border-grey-02 pb-[10px]">
                <span className="h-[10px] w-[10px] shrink-0" style={{ background: STATE_META[p.state].accent }} />
                <span className="font-mono text-[11px] uppercase tracking-[0.06em]">{STATE_META[p.state].label}</span>
                <span className="ml-auto text-right text-[13px] text-grey-04">{STATE_META[p.state].caption}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
