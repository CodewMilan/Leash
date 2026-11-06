"use client";

import { useRef } from "react";
import { Device } from "@/components/Device";
import { SectionLabel } from "@/components/SectionLabel";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const CARDS = [
  {
    title: "Its own screen",
    body: "The amount and recipient come from the payment the device is about to sign, not from the agent's word.",
    bg: "#2d4ff9",
    state: "thumb" as const,
  },
  {
    title: "Two approvals",
    body: "Your fingerprint on the device and a fresh World ID check on your phone. Both, or nothing.",
    bg: "#ffbfec",
    state: "paid" as const,
  },
  {
    title: "A brain it can't fake",
    body: "Every decision goes through 0G. No 0G, no payment: safe mode, red light.",
    bg: "#36d972",
    state: "offline" as const,
  },
];

export function Inside() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-inside-card]", {
        y: 60,
        opacity: 0,
        duration: 0.8,
        ease: EASE.out,
        stagger: 0.1,
        scrollTrigger: { trigger: "[data-inside-grid]", start: "top 80%" },
      });
      gsap.utils.toArray<HTMLElement>("[data-inside-device]").forEach((el, i) => {
        gsap.to(el, {
          keyframes: { x: [0, 14 - i * 8, -10 + i * 6, 0], y: [0, -10 + i * 4, 12 - i * 5, 0] },
          duration: 9 + i,
          ease: "sine.inOut",
          repeat: -1,
        });
      });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} id="inside" className="flex flex-col items-center gap-[30px] pt-[120px] lg:gap-[60px]">
      <SectionLabel className="w-full">What&apos;s inside</SectionLabel>
      <h2 className="display-2 px-[15px] text-center font-normal">Your agent&apos;s entire safety net</h2>
      <div data-inside-grid className="grid w-full gap-[10px] px-[15px] lg:grid-cols-3">
        {CARDS.map((c) => (
          <article key={c.title} data-inside-card className="flex flex-col gap-[14px]">
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden" style={{ background: c.bg }}>
              <div data-inside-device className="w-[34%]">
                <Device state={c.state} amount="20.00" recipient="Photographer" className="h-auto w-full" />
              </div>
            </div>
            <h3 className="text-[26px] tracking-[-0.02em]">{c.title}</h3>
            <p className="max-w-[400px] text-[15px] leading-[1.4] text-grey-04">{c.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
