"use client";

import { useRef } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const PARTS = [
  { name: "0G Compute", role: "Decides every payment", bg: "#a199ff", glyph: "brain" },
  { name: "0G Storage", role: "Remembers each decision", bg: "#ffbfec", glyph: "stack" },
  { name: "Hedera x402", role: "Pays per request", bg: "#2d4ff9", glyph: "arrow" },
  { name: "USDC on Hedera", role: "What gets paid", bg: "#36d972", glyph: "coin" },
  { name: "HCS topic", role: "Public spend log", bg: "#ff942e", glyph: "list" },
  { name: "World ID Agent Pass", role: "A real human said yes", bg: "#f955b2", glyph: "eye" },
  { name: "Raspberry Pi 4", role: "Holds the keys, signs", bg: "#1f1f1f", glyph: "chip" },
  { name: "Whisper", role: "Speech to text, offline", bg: "#ededed", glyph: "wave" },
  { name: "Fingerprint sensor", role: "Your thumb", bg: "#ffc0c0", glyph: "thumb" },
  { name: "Pi Camera", role: "Reads bills and QR codes", bg: "#a4bf4d", glyph: "qr" },
];

function Glyph({ kind, light }: { kind: string; light: boolean }) {
  const c = light ? "#fafafa" : "#262626";
  const common = { fill: "none", stroke: c, strokeWidth: 6, strokeLinecap: "square" as const };
  switch (kind) {
    case "brain":
      return (
        <g {...common}>
          <circle cx="60" cy="60" r="34" />
          <path d="M60 26 V94 M34 46 H86 M34 74 H86" />
        </g>
      );
    case "stack":
      return (
        <g {...common}>
          <rect x="28" y="28" width="64" height="16" />
          <rect x="28" y="52" width="64" height="16" />
          <rect x="28" y="76" width="64" height="16" />
        </g>
      );
    case "arrow":
      return <path {...common} d="M24 60 H92 M68 36 L92 60 L68 84" />;
    case "coin":
      return (
        <g {...common}>
          <circle cx="60" cy="60" r="34" />
          <path d="M60 40 V80 M48 50 H68 a8 8 0 0 1 0 16 H52" />
        </g>
      );
    case "list":
      return <path {...common} d="M30 36 H90 M30 56 H90 M30 76 H70 M30 96 H80" />;
    case "eye":
      return (
        <g {...common}>
          <circle cx="60" cy="60" r="34" />
          <circle cx="60" cy="60" r="12" />
        </g>
      );
    case "chip":
      return (
        <g {...common}>
          <rect x="34" y="34" width="52" height="52" />
          <path d="M46 34 V22 M60 34 V22 M74 34 V22 M46 86 V98 M60 86 V98 M74 86 V98" />
        </g>
      );
    case "wave":
      return <path {...common} d="M24 60 h8 M40 44 v32 M54 30 v60 M68 46 v28 M82 38 v44 M96 60 h-4" />;
    case "thumb":
      return (
        <g {...common}>
          <path d="M40 62 a20 20 0 0 1 40 0" />
          <path d="M30 70 a30 30 0 0 1 60 -10" />
          <path d="M50 64 a10 10 0 0 1 20 -2" />
        </g>
      );
    default:
      return (
        <g fill={c}>
          {[0, 1, 2, 3, 4].map((r) =>
            [0, 1, 2, 3, 4].map((col) =>
              (r * 5 + col) % 3 !== 1 ? <rect key={`${r}${col}`} x={30 + col * 12} y={30 + r * 12} width="10" height="10" /> : null,
            ),
          )}
        </g>
      );
  }
}

function Card({ p }: { p: (typeof PARTS)[number] }) {
  const light = p.bg === "#1f1f1f" || p.bg === "#2d4ff9";
  return (
    <div className="flex w-[223px] shrink-0 flex-col gap-[10px]">
      <div className="flex aspect-[223/260] items-center justify-center" style={{ background: p.bg }}>
        <svg viewBox="0 0 120 120" className="w-[52%]" aria-hidden="true">
          <Glyph kind={p.glyph} light={light} />
        </svg>
      </div>
      <div>
        <p className="text-[17px] leading-[1.15] tracking-[-0.01em]">{p.name}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-grey-04">{p.role}</p>
      </div>
    </div>
  );
}

export function UnderTheHood() {
  const ref = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  const { contextSafe } = useGSAP(
    () => {
      if (prefersReducedMotion() || !trackRef.current) return;
      tweenRef.current = gsap.to(trackRef.current, { xPercent: -50, duration: 60, ease: "none", repeat: -1 });
    },
    { scope: ref },
  );

  const setSpeed = contextSafe((speed: number) => {
    if (tweenRef.current) gsap.to(tweenRef.current, { timeScale: speed, duration: 0.6, ease: "power2.out" });
  });

  return (
    <section ref={ref} id="hood" className="flex flex-col gap-[30px] overflow-hidden pb-[90px] pt-[90px]">
      <SectionLabel>Under the hood</SectionLabel>
      <div
        className="overflow-hidden"
        onMouseEnter={() => setSpeed(0.15)}
        onMouseLeave={() => setSpeed(1)}
      >
        <div ref={trackRef} className="flex w-max gap-[12px] pl-[15px]">
          {[...PARTS, ...PARTS].map((p, i) => (
            <div key={i} aria-hidden={i >= PARTS.length} className="pr-0">
              <Card p={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
