"use client";

import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const PARTS = [
  { name: "Whitechain", role: "Holds the dollars", bg: "#193ef9", light: true },
  { name: "World ID", role: "One verified human", bg: "#f955b2", light: false },
  { name: "Passkey", role: "Their phone confirms", bg: "#36d972", light: false },
  { name: "Vault", role: "Until they claim", bg: "#a199ff", light: false },
  { name: "RazorpayX", role: "UPI, test mode", bg: "#ff942e", light: false },
  { name: "Return", role: "Unclaimed comes back", bg: "#ffbfec", light: false },
  { name: "Envelope", role: "A link, not an account", bg: "#ffc0c0", light: false },
  { name: "Receipt", role: "Every step, on record", bg: "#1f1f1f", light: true },
];

export function Hood() {
  const ref = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !trackRef.current) return;
      gsap.to(trackRef.current, { id: "hood-scroll", xPercent: -50, duration: 48, ease: "none", repeat: -1 });
    },
    { scope: ref },
  );

  const setSpeed = (speed: number) => {
    const tween = gsap.getById("hood-scroll");
    if (tween) gsap.to(tween, { timeScale: speed, duration: 0.6, ease: "power2.out" });
  };

  return (
    <section ref={ref} id="hood" className="overflow-hidden border-t border-grey-02 py-16">
      <div className="px-4">
        <p className="tag">Under the hood</p>
        <h2 className="hero-title mt-4 max-w-[16ch] text-[clamp(32px,4vw,52px)]">What actually moves a gift</h2>
      </div>
      <div className="mt-8 overflow-hidden" onMouseEnter={() => setSpeed(0.15)} onMouseLeave={() => setSpeed(1)}>
        <div ref={trackRef} className="flex w-max gap-3 pl-4">
          {[...PARTS, ...PARTS].map((part, index) => (
            <article key={`${part.name}-${index}`} aria-hidden={index >= PARTS.length} className="w-[223px] shrink-0">
              <div className="flex aspect-[223/260] items-center justify-center" style={{ background: part.bg }}>
                <span className={`block h-16 w-16 border-2 ${part.light ? "border-white-00" : "border-ink"}`} />
              </div>
              <p className="mt-2.5 text-[17px] leading-tight tracking-[-0.01em]">{part.name}</p>
              <p className="font-mono text-[11px] tracking-[0.06em] text-grey-04 uppercase">{part.role}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
