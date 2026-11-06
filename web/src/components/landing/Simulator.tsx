"use client";

import { useRef, useState } from "react";
import { ControlRow } from "@/components/ControlRow";
import { Device, STATE_META, type DeviceState } from "@/components/Device";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

function decide(limit: number, amount: number, signal: number): DeviceState {
  if (signal < 10) return "offline";
  return amount <= limit ? "auto" : "thumb";
}

export function Simulator() {
  const ref = useRef<HTMLElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(5);
  const [amount, setAmount] = useState(2);
  const [signal, setSignal] = useState(100);

  const state = decide(limit, amount, signal);
  const recipient = amount <= 5 ? "Chai stall" : "Photographer";

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-sim-frame]", {
        opacity: 0,
        duration: 0.9,
        ease: EASE.out,
        scrollTrigger: { trigger: ref.current, start: "top 85%" },
      });
      gsap.from("[data-sim-panel]", {
        x: -24,
        opacity: 0,
        duration: 0.7,
        ease: EASE.out,
        scrollTrigger: { trigger: ref.current, start: "top 70%" },
      });
    },
    { scope: ref },
  );

  useGSAP(
    () => {
      if (prefersReducedMotion() || !deviceRef.current) return;
      gsap.fromTo(deviceRef.current, { scale: 0.97 }, { scale: 1, duration: 0.45, ease: EASE.spring });
      if (state === "thumb") {
        gsap.fromTo(
          deviceRef.current,
          { x: 0 },
          { keyframes: { x: [0, -5, 5, -4, 4, -2, 2, 0] }, duration: 0.5, ease: "none" },
        );
      }
    },
    { dependencies: [state], scope: ref },
  );

  return (
    <section ref={ref} id="simulator" className="relative w-full border-t border-grey-02" aria-label="Leash simulator">
      <div className="relative grid lg:min-h-[860px] lg:grid-cols-[400px_1fr]">
        <div className="order-2 px-[15px] pb-[30px] lg:order-1 lg:px-0 lg:pb-0">
          <div className="lg:sticky lg:top-[var(--header-h)] lg:mt-[200px]">
            <div data-sim-panel className="border border-grey-02 bg-white-00 p-[16px] lg:ml-[-1px] lg:w-[380px]">
              <p className="mb-[6px] text-[22px] tracking-[-0.02em]">Leash simulator</p>
              <p className="mb-[10px] text-[13px] leading-[1.35] text-grey-04">
                Drag the controls to see what the device does. This is an illustration, not a live device.
              </p>
              <ControlRow label="Spend limit (USDC)" value={limit} min={1} max={20} step={1} onChange={setLimit} />
              <ControlRow
                label="Amount (USDC)"
                value={amount}
                min={0.5}
                max={40}
                step={0.5}
                onChange={setAmount}
                format={(v) => v.toFixed(1)}
              />
              <ControlRow label="0G signal (%)" value={signal} min={0} max={100} step={1} onChange={setSignal} />
              <div className="mt-[10px] flex items-center gap-[8px] border-t border-grey-02 pt-[12px] font-mono text-[11px] uppercase tracking-[0.06em]">
                <span className="h-[8px] w-[8px]" style={{ background: STATE_META[state].accent }} />
                {STATE_META[state].caption}
              </div>
            </div>
          </div>
        </div>

        <div data-sim-frame className="dot-grid order-1 flex items-center justify-center py-[40px] lg:order-2 lg:py-[80px]">
          <div ref={deviceRef} className="w-[230px] lg:w-[330px]">
            <Device
              state={state}
              amount={amount.toFixed(2)}
              recipient={state === "offline" ? "" : recipient}
              limit={limit.toFixed(2)}
              className="h-auto w-full drop-shadow-[0_30px_40px_rgba(0,0,0,0.12)]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
