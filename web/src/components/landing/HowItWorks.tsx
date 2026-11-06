"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Device, type DeviceState } from "@/components/Device";
import { SectionLabel } from "@/components/SectionLabel";
import { EASE, gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/lib/gsap";

const STEPS: { title: string; body: string; state: DeviceState; where: string; amount: string; recipient: string }[] = [
  {
    title: "Speak to it",
    body: "Press the button and say what to pay. Point the camera at a bill or QR code if there is one.",
    state: "listening",
    where: "On the device",
    amount: "",
    recipient: "",
  },
  {
    title: "0G decides",
    body: "The 0G AI reads the request and returns a decision with a request ID. The device saves it to 0G Storage.",
    state: "thinking",
    where: "0G",
    amount: "",
    recipient: "",
  },
  {
    title: "Your thumb, when it matters",
    body: "Over your limit, the device's own screen shows the real amount. Thumb on the sensor, then World ID on your phone.",
    state: "thumb",
    where: "Device + World ID",
    amount: "20.00",
    recipient: "Photographer",
  },
  {
    title: "Paid on Hedera",
    body: "The device signs a USDC payment over x402. Receipt on HashScan, entry in the spend log.",
    state: "paid",
    where: "Hedera",
    amount: "20.00",
    recipient: "Photographer",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);

  useGSAP(
    () => {
      gsap.utils.toArray<HTMLElement>("[data-step]").forEach((el, i) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top center",
          end: "bottom center",
          onToggle: (self) => {
            if (self.isActive) setStep(i);
          },
        });
      });
    },
    { scope: ref },
  );

  useGSAP(
    () => {
      const reduce = prefersReducedMotion();
      gsap.utils.toArray<HTMLElement>("[data-step]").forEach((el, i) => {
        gsap.to(el, { opacity: i === step ? 1 : 0.32, duration: reduce ? 0 : 0.3, ease: EASE.out });
      });
      if (reduce) return;
      gsap.fromTo(
        "[data-step-media]",
        { opacity: 0, scale: 0.3, y: 40 },
        { keyframes: { opacity: [0, 1, 1], scale: [0.3, 1.05, 1], y: [40, -5, 0] }, duration: 0.6, ease: "none" },
      );
    },
    { dependencies: [step], scope: ref },
  );

  const s = STEPS[step];

  return (
    <section ref={ref} id="how" className="flex flex-col gap-[30px] pt-[60px]">
      <div>
        <SectionLabel>How Leash works</SectionLabel>
        <div className="flex items-end justify-between gap-[20px] px-[15px] pt-[16px]">
          <h2 className="display-2 font-normal">Speak it. Check it. Pay it.</h2>
          <Link
            href="/dashboard"
            className="hidden h-[44px] shrink-0 items-center bg-black-00 px-[22px] text-[14px] text-white-00 lg:flex"
          >
            Open Dashboard
          </Link>
        </div>
      </div>

      <div className="grid border-t border-grey-02 lg:grid-cols-[minmax(0,58%)_minmax(0,1fr)]">
        <div className="relative hidden lg:block">
          <div className="sticky top-[var(--header-h)] flex h-[calc(100dvh-var(--header-h))] items-center justify-center bg-grey-01">
            <span className="absolute left-[16px] top-[16px] font-mono text-[11px] uppercase tracking-[0.08em] text-grey-04">
              Step {String(step + 1).padStart(2, "0")} · {s.where}
            </span>
            <div data-step-media className="w-[min(300px,30vh)]">
              <Device state={s.state} amount={s.amount} recipient={s.recipient} className="h-auto w-full" />
            </div>
          </div>
        </div>

        <ol className="flex flex-col lg:border-l lg:border-grey-02">
          {STEPS.map((st, i) => (
            <li
              key={st.title}
              data-step
              className="flex min-h-[44vh] flex-col justify-center gap-[14px] border-b border-grey-02 px-[15px] py-[40px] lg:min-h-[70vh] lg:px-[34px]"
              style={{ opacity: i === 0 ? 1 : 0.32 }}
            >
              <span className="font-mono text-[18px] text-grey-03">[ {String(i + 1).padStart(2, "0")} ]</span>
              <h3 className="display-3 font-normal">{st.title}</h3>
              <p className="max-w-[380px] text-[15px] leading-[1.4] text-grey-04">{st.body}</p>
              <div className="mt-[10px] w-[180px] lg:hidden">
                <Device state={st.state} amount={st.amount} recipient={st.recipient} className="h-auto w-full" />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
