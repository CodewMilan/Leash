"use client";

import Link from "next/link";
import { useRef } from "react";
import { Device } from "@/components/Device";
import { SectionLabel } from "@/components/SectionLabel";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const NODES = [
  { id: "zg", label: "0G", note: "decides, signs nothing", x: 16, y: 22, bg: "#a199ff" },
  { id: "world", label: "World ID", note: "proof from your phone", x: 84, y: 22, bg: "#f955b2" },
  { id: "merchant", label: "Merchant", note: "receives, signs nothing", x: 16, y: 80, bg: "#ff942e" },
  { id: "hedera", label: "Hedera", note: "settles + spend log", x: 84, y: 80, bg: "#36d972" },
];

export function WhoSigns() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-sign-frame]", {
        opacity: 0,
        duration: 0.9,
        ease: EASE.out,
        scrollTrigger: { trigger: ref.current, start: "top 80%" },
      });
      gsap.to("[data-sign-line]", { strokeDashoffset: -24, duration: 1.2, ease: "none", repeat: -1 });
      gsap.utils.toArray<SVGCircleElement>("[data-sign-pulse]").forEach((dot, i) => {
        const tx = Number(dot.dataset.tx);
        const ty = Number(dot.dataset.ty);
        gsap.fromTo(
          dot,
          { attr: { cx: 50, cy: 51 }, opacity: 1 },
          {
            attr: { cx: tx, cy: ty },
            opacity: 0.2,
            duration: 1.6,
            ease: EASE.inOut,
            repeat: -1,
            repeatDelay: 0.8,
            delay: i * 0.45,
          },
        );
      });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className="flex flex-col gap-[30px] pt-[60px]">
      <SectionLabel>Who signs what</SectionLabel>
      <div data-sign-frame className="relative mx-[15px] h-[520px] overflow-hidden bg-grey-01 lg:h-[700px]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {NODES.map((n) => (
            <line
              key={n.id}
              data-sign-line
              x1="50"
              y1="51"
              x2={n.x}
              y2={n.y}
              stroke="#262626"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {NODES.map((n) => (
            <circle key={n.id} data-sign-pulse data-tx={n.x} data-ty={n.y} cx="50" cy="51" r="0.8" fill="#262626" />
          ))}
        </svg>

        <div className="absolute left-1/2 top-1/2 w-[150px] -translate-x-1/2 -translate-y-1/2 lg:w-[210px]">
          <Device state="paid" amount="20.00" recipient="Photographer" className="h-auto w-full" />
          <p className="mt-[10px] text-center font-mono text-[11px] uppercase tracking-[0.06em]">
            Leash device · signs everything
          </p>
        </div>

        {NODES.map((n) => (
          <div
            key={n.id}
            className={`absolute flex -translate-x-1/2 gap-[6px] ${n.y < 50 ? "-translate-y-full flex-col-reverse" : "flex-col"}`}
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
          >
            <div className="px-[12px] py-[8px] text-[15px] lg:text-[18px]" style={{ background: n.bg }}>
              {n.label}
            </div>
            <p className="max-w-[150px] font-mono text-[10px] uppercase tracking-[0.06em] text-grey-04 lg:text-[11px]">
              {n.note}
            </p>
          </div>
        ))}

        <Link
          href="/dashboard"
          className="absolute bottom-0 right-0 flex h-[44px] items-center bg-black-00 px-[22px] text-[14px] text-white-00"
        >
          See signed payments
        </Link>
      </div>
    </section>
  );
}
