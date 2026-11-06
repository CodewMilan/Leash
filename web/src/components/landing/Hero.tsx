"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DeviceGlyph, type DeviceState } from "@/components/Device";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const LINE_1 = ["Your", "agent", "{media}", "pays."];
const LINE_2 = ["Your", "thumb", "decides."];
const LETTER_STAGGER = 0.025;
const FOLLOW_AT = 2.025;

const MEDIA: { state: DeviceState; bg: string }[] = [
  { state: "auto", bg: "#36d972" },
  { state: "thumb", bg: "#ff942e" },
  { state: "paid", bg: "#a199ff" },
  { state: "offline", bg: "#ffc0c0" },
  { state: "listening", bg: "#2d4ff9" },
];

const CHIPS = [
  { label: "Chai stall", fill: "#ff942e", prompt: "Pay the chai stall for 2 chais" },
  { label: "Photo print", fill: "#a199ff", prompt: "Pay the photo print kiosk for 4 prints" },
  { label: "Over the limit", fill: "#36d972", prompt: "Pay the photographer 20 dollars" },
  { label: "Brain offline", fill: "#ffc0c0", prompt: "Pay the cab driver 3 dollars (with 0G unreachable)" },
  { label: "World ID", fill: "#f955b2", prompt: "Pay rent of 40 dollars, I'll approve on my phone" },
];

const TYPED = [
  "Pay the photographer 20 dollars",
  "Pay the chai stall for 2 chais",
  "Print 4 photos at the kiosk",
  "Tip the delivery rider 1 dollar",
];

function HeadlineLine({ words, startIndex }: { words: string[]; startIndex: number }) {
  let i = startIndex;
  return (
    <span className="block whitespace-nowrap">
      {words.map((word, w) => {
        if (word === "{media}") return <HeroMedia key={w} />;
        const letters = Array.from(word).map((ch) => {
          const idx = i++;
          return (
            <span
              key={idx}
              className="relative -mb-[0.12em] -mr-[0.04em] inline-block overflow-hidden pb-[0.12em] pr-[0.04em] align-bottom"
            >
              <span className="hero-letter" data-delay={idx * LETTER_STAGGER}>
                {ch}
              </span>
            </span>
          );
        });
        return (
          <span key={w} className="inline-block whitespace-nowrap">
            {letters}
            {w < words.length - 1 && "\u00a0"}
          </span>
        );
      })}
    </span>
  );
}

function HeroMedia() {
  return (
    <span
      className="hero-media relative mr-[0.22em] inline-block h-[0.78em] overflow-hidden align-[-0.02em]"
      data-hero-media
      aria-hidden="true"
    >
      {[...MEDIA, MEDIA[0]].map((m, i) => (
        <span
          key={i}
          data-media-layer
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: m.bg, clipPath: i === 0 ? "inset(0%)" : "inset(100% 0% 0% 0%)" }}
        >
          <DeviceGlyph state={m.state} className="h-[78%] w-auto" />
        </span>
      ))}
    </span>
  );
}

function SendArrow() {
  return (
    <svg viewBox="0 0 80 80" className="h-[42%] w-auto" aria-hidden="true">
      <path d="M40 70 V12 M14 36 L40 10 L66 36" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="square" />
    </svg>
  );
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState("");

  const lettersInLine1 = LINE_1.filter((w) => w !== "{media}").join("").length;

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        setTyped(TYPED[0]);
        return;
      }

      gsap.utils.toArray<HTMLElement>(".hero-letter").forEach((el) => {
        gsap.to(el, { y: 0, duration: 1.25, ease: EASE.inOut, delay: Number(el.dataset.delay) });
      });

      gsap.to("[data-hero-media]", {
        width: "1.061em",
        marginLeft: 0,
        duration: 1.25,
        ease: EASE.inOut,
        delay: FOLLOW_AT,
      });

      const layers = gsap.utils.toArray<HTMLElement>("[data-media-layer]");
      const cycle = gsap.timeline({ repeat: -1, delay: FOLLOW_AT + 1.4 });
      layers.slice(1).forEach((layer, i) => {
        cycle.to(layer, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: EASE.inOut }, i * 1.5);
      });
      cycle.set(layers.slice(1), { clipPath: "inset(100% 0% 0% 0%)" }, "+=0.9");

      gsap.to(".hero-follow", {
        opacity: 1,
        y: 0,
        duration: 0.7,
        ease: EASE.out,
        delay: FOLLOW_AT,
        stagger: 0.2,
      });

      gsap.to(".send-arrow-enter", { y: 0, duration: 0.7, ease: EASE.out, delay: 2.4 });

      const state = { chars: 0 };
      const typeTl = gsap.timeline({ repeat: -1, delay: FOLLOW_AT + 0.4 });
      TYPED.forEach((phrase) => {
        typeTl
          .to(state, {
            chars: phrase.length,
            duration: phrase.length * 0.045,
            ease: "none",
            onUpdate: () => setTyped(phrase.slice(0, Math.round(state.chars))),
          })
          .to(state, {
            chars: 0,
            duration: phrase.length * 0.02,
            ease: "none",
            delay: 1.6,
            onUpdate: () => setTyped(phrase.slice(0, Math.round(state.chars))),
          });
      });
    },
    { scope: ref },
  );

  const { contextSafe } = useGSAP({ scope: ref });

  const waveChip = contextSafe((el: HTMLElement) => {
    if (prefersReducedMotion()) return;
    gsap.to(el.querySelectorAll("[data-chip-letter]"), {
      keyframes: { y: [0, -3, 0] },
      duration: 0.45,
      ease: EASE.spring,
      stagger: 0.018,
      overwrite: true,
    });
  });

  const liftArrow = contextSafe((el: HTMLElement) => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      el.querySelector("[data-arrow-stack]"),
      { yPercent: 0 },
      { yPercent: -50, duration: 0.65, ease: EASE.out, overwrite: true },
    );
  });

  const submit = () => {
    router.push("/dashboard");
  };

  return (
    <section ref={ref} className="flex flex-col items-center gap-[30px] px-[15px] pb-[60px] pt-[70px] lg:gap-[50px] lg:pt-[110px]">
      <h1 className="display-1 w-full text-center font-book font-normal text-ink">
        <span className="sr-only">Your agent pays. Your thumb decides.</span>
        <span aria-hidden="true">
          <HeadlineLine words={LINE_1} startIndex={0} />
          <HeadlineLine words={LINE_2} startIndex={lettersInLine1} />
        </span>
      </h1>

      <p className="hero-follow max-w-[640px] text-center text-[18px] leading-[1.3] text-ink lg:text-[22px]">
        Leash is a handheld AI assistant that pays for things for you, and can never spend over your limit without your
        thumb.
      </p>

      <div className="hero-follow w-full max-w-[920px]">
        <form
          className="grid grid-cols-[1fr_96px] lg:grid-cols-[1fr_210px]"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="relative h-[150px] bg-grey-01 lg:h-[210px]">
            <label htmlFor="hero-prompt" className="sr-only">
              Tell Leash what to pay
            </label>
            <textarea
              id="hero-prompt"
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="absolute inset-0 resize-none bg-transparent p-[16px] text-[14px] leading-[1.4] text-ink outline-none lg:p-[20px] lg:text-[15px]"
            />
            {!text && !focused && (
              <span className="pointer-events-none absolute left-[16px] top-[16px] text-[14px] text-grey-04 lg:left-[20px] lg:top-[20px] lg:text-[15px]">
                {typed}
                <span className="caret" />
              </span>
            )}
            <span
              className="absolute bottom-[14px] left-[14px] flex h-[30px] w-[30px] items-center justify-center bg-white-00 lg:bottom-[20px] lg:left-[20px]"
              title="On the device you just press and talk"
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]">
                <rect x="5.5" y="1.5" width="5" height="8" rx="2.5" fill="none" stroke="#262626" strokeWidth="1.3" />
                <path d="M3 8 a5 5 0 0 0 10 0 M8 13 v2" fill="none" stroke="#262626" strokeWidth="1.3" />
              </svg>
            </span>
          </div>
          <button
            type="submit"
            aria-label="See it in the live log"
            onMouseEnter={(e) => liftArrow(e.currentTarget)}
            className="group relative flex items-center justify-center overflow-hidden bg-blue-03 text-white-00"
          >
            <span className="send-arrow-enter absolute inset-0 overflow-hidden">
              <span data-arrow-stack className="flex h-[200%] w-full flex-col">
                <span className="flex h-1/2 items-center justify-center">
                  <SendArrow />
                </span>
                <span className="flex h-1/2 items-center justify-center">
                  <SendArrow />
                </span>
              </span>
            </span>
          </button>
        </form>
        <div className="mt-[6px] flex flex-wrap gap-[4px]">
          {CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onMouseEnter={(e) => waveChip(e.currentTarget)}
              onClick={() => {
                setText(chip.prompt);
                textareaRef.current?.focus();
              }}
              className="flex h-[26px] items-center px-[9px] text-[13px] text-ink"
              style={{ background: chip.fill }}
            >
              <span className="sr-only">{chip.label}</span>
              <span aria-hidden="true">
                {Array.from(chip.label).map((ch, i) => (
                  <span key={i} data-chip-letter className="inline-block whitespace-pre">
                    {ch}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
