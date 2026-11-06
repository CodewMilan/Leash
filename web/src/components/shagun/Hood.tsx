"use client";

import { useRef } from "react";
import { Blocks, CreditCard, Fingerprint, Mail, ReceiptText, ScanFace, Undo2, Vault } from "lucide-react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const PARTS = [
  { name: "Whitechain", role: "Test USDT, no gas", bg: "#193ef9", light: true, Icon: Blocks },
  { name: "World ID", role: "One verified human", bg: "#f955b2", light: false, Icon: ScanFace },
  { name: "Passkey", role: "Their phone confirms", bg: "#36d972", light: false, Icon: Fingerprint },
  { name: "Vault", role: "Holds it until claimed", bg: "#a199ff", light: false, Icon: Vault },
  { name: "Lithic", role: "Sandbox virtual card", bg: "#ff942e", light: false, Icon: CreditCard },
  { name: "Return", role: "Unspent comes back", bg: "#ffbfec", light: false, Icon: Undo2 },
  { name: "Envelope", role: "A link, not an account", bg: "#ffc0c0", light: false, Icon: Mail },
  { name: "Receipt", role: "Every step, on record", bg: "#1f1f1f", light: true, Icon: ReceiptText },
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
        <h2 className="hero-title mt-4 max-w-[18ch] text-balance text-[clamp(32px,4vw,52px)]">What actually moves a gift</h2>
      </div>
      <div className="mt-8 overflow-hidden" onMouseEnter={() => setSpeed(0.15)} onMouseLeave={() => setSpeed(1)}>
        <div ref={trackRef} className="flex w-max gap-3 pl-4">
          {[...PARTS, ...PARTS].map((part, index) => (
            <article key={`${part.name}-${index}`} aria-hidden={index >= PARTS.length} className="w-[223px] shrink-0">
              <div className="flex aspect-[223/260] items-center justify-center" style={{ background: part.bg }}>
                <part.Icon size={64} strokeWidth={1.25} className={part.light ? "text-white-00" : "text-ink"} aria-hidden="true" />
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
