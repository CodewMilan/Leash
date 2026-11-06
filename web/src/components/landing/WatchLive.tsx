"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ControlRow } from "@/components/ControlRow";
import { Device } from "@/components/Device";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

export function WatchLive() {
  const ref = useRef<HTMLElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const [led, setLed] = useState("#36d972");
  const [buzz, setBuzz] = useState(4);
  const [brightness, setBrightness] = useState(100);

  const { contextSafe } = useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-watch-copy] > *", {
        y: 30,
        opacity: 0,
        duration: 0.7,
        ease: EASE.out,
        stagger: 0.08,
        scrollTrigger: { trigger: ref.current, start: "top 75%" },
      });
    },
    { scope: ref },
  );

  const shake = contextSafe((amp: number) => {
    if (prefersReducedMotion() || !deviceRef.current || amp === 0) return;
    gsap.fromTo(
      deviceRef.current,
      { x: 0 },
      { keyframes: { x: [0, -amp, amp, -amp * 0.7, amp * 0.7, 0] }, duration: 0.45, ease: "none", overwrite: true },
    );
  });

  return (
    <section
      ref={ref}
      className="ml-auto grid max-w-full grid-cols-1 items-center gap-[30px] px-[15px] pt-[120px] lg:grid-cols-[40.53%_50.2%] lg:gap-x-[9.27%] lg:px-0"
    >
      <div className="relative aspect-[0.858] w-full overflow-hidden bg-grey-01">
        <div className="absolute left-0 top-0 z-10 w-[250px] border-b border-r border-grey-02 bg-white-00 p-[12px]">
          <label className="mb-[6px] flex items-center gap-[8px]">
            <span className="sr-only">LED colour</span>
            <span className="relative h-[22px] w-[22px] overflow-hidden" style={{ background: led }}>
              <input
                type="color"
                value={led}
                onChange={(e) => setLed(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </span>
            <span className="font-mono text-[12px] uppercase">{led.replace("#", "")}</span>
            <span className="ml-auto font-mono text-[12px]">{brightness}%</span>
          </label>
          <ControlRow
            label="Buzz"
            value={buzz}
            min={0}
            max={10}
            step={1}
            onChange={(v) => {
              setBuzz(v);
              shake(v);
            }}
          />
          <ControlRow label="LED" value={brightness} min={0} max={100} step={1} onChange={setBrightness} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div ref={deviceRef} className="w-[52%]">
            <Device
              state="thumb"
              amount="20.00"
              recipient="Photographer"
              led={led}
              ledLevel={brightness / 100}
              className="h-auto w-full"
            />
          </div>
        </div>
      </div>

      <div data-watch-copy className="flex max-w-[620px] flex-col gap-[16px] lg:pr-[30px]">
        <h2 className="display-2 font-normal">Watch it pay, live</h2>
        <p className="text-[16px] leading-[1.4]">
          Every payment, its HashScan receipt and the 0G request ID behind it, as they land on Hedera.
        </p>
        <div className="mt-[14px] grid grid-cols-[1fr_auto]">
          <span className="flex h-[46px] items-center bg-grey-01 px-[14px] font-mono text-[12px] uppercase tracking-[0.04em] text-grey-04">
            Hedera testnet · public mirror node
          </span>
          <Link href="/dashboard" className="flex h-[46px] items-center bg-black-00 px-[24px] text-[14px] text-white-00">
            Open dashboard
          </Link>
        </div>
        <p className="text-[12px] text-grey-04">Real network data only. If something isn&apos;t set up, the dashboard says so.</p>
      </div>
    </section>
  );
}
