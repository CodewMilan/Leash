"use client";

import { useRef } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { gsap, prefersReducedMotion, SplitText, useGSAP } from "@/lib/gsap";

export function Statement() {
  const ref = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !textRef.current) return;
      SplitText.create(textRef.current, {
        type: "lines,words",
        wordsClass: "word",
        autoSplit: true,
        onSplit(self) {
          const tl = gsap.timeline({
            scrollTrigger: { trigger: textRef.current, start: "top 80%", end: "bottom 40%", scrub: true },
          });
          self.lines.forEach((line) => {
            tl.fromTo(
              line.querySelectorAll(".word"),
              { color: "#e1e1e1" },
              { color: "#262626", stagger: 0.12, duration: 0.3, ease: "none" },
              0,
            );
          });
          return tl;
        },
      });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className="flex flex-col gap-[15px] pb-[120px] pt-[90px]">
      <SectionLabel>Why a leash</SectionLabel>
      <div className="grid px-[15px] lg:grid-cols-[38%_1fr]">
        <div />
        <p ref={textRef} className="statement max-w-[860px] text-ink">
          Agents can now spend your money, and they can be tricked into it. Leash keeps the AI in charge of thinking
          and your thumb in charge of paying.
        </p>
      </div>
    </section>
  );
}
