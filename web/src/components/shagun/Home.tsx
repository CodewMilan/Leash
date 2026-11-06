"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FlipLink } from "@/components/FlipLink";
import { GiftRail } from "./Envelope";
import { Hood } from "./Hood";
import { inr, parseAmount, toPaise } from "@/lib/amounts";
import { EASE, gsap, prefersReducedMotion, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";

const LINE_1 = ["Send", "a", "{media}", "gift"];
const LINE_2 = ["that", "lands", "in", "UPI"];
const LETTER_STAGGER = 0.025;
const MEDIA = ["#36d972", "#ff942e", "#a199ff", "#ffc0c0", "#193ef9"];
const TYPED = [
  "25 dollars for Priya, back to me on Monday",
  "51 dollars for a judge's envelope",
  "One company gift per verified person",
  "11 dollars that returns if nobody claims it",
];
const CHIPS = [
  { label: "Envelope", fill: "#ff942e", text: "25 dollars for Priya, in an envelope, back to me on Monday if she does not open it.", amount: "25" },
  { label: "UPI test", fill: "#a199ff", text: "51 dollars for a judge. They tap the envelope and see a test UPI payout.", amount: "51" },
  { label: "World ID", fill: "#36d972", text: "One company gift per person. The second claim by the same human is refused.", amount: "25" },
  { label: "Comes back", fill: "#ffc0c0", text: "11 dollars that expires tonight. If nobody claims it, send it back to me.", amount: "11" },
  { label: "Company drop", fill: "#f955b2", text: "101 dollars for the Diwali desk. One envelope, one verified person.", amount: "101" },
];
const CASES = [
  { title: "Family abroad", caption: "Dollars leave you. They confirm on their phone. A test UPI payout is labelled as a test.", bg: "#ffbfec", stickers: ["No wallet", "One tap", "UPI test", "Comes back"] },
  { title: "A judge's envelope", caption: "One fingerprint. No gas popup. The explorer link sits next to the test payout id.", bg: "#ff942e", stickers: ["No gas", "NFC tap", "Receipt", "Test mode"] },
  { title: "A forwarded link", caption: "A different person fails World ID. Nothing moves. This is not scam-proof before the first claim.", bg: "#ffc0c0", stickers: ["Denied", "Stays put", "One human", "Not magic"] },
  { title: "An expired gift", caption: "If nobody claims it in time, the unclaimed dollars return to the sender on-chain.", bg: "#36d972", stickers: ["Expiry", "Return", "Pending", "Yours again"] },
  { title: "One per person", caption: "A campaign gift can be claimed once per verified human. Ordinary gifts can repeat.", bg: "#a199ff", stickers: ["Campaign", "One human", "No bots", "One at a time"] },
];
const STEPS = [
  ["Name the gift", "Amount, who it is for, and when it expires. One confirmation. The sender does not pay gas."],
  ["They open the envelope", "A tap or a link. Their phone confirms. World ID checks that a person is claiming it."],
  ["A test payout, labelled", "RazorpayX test mode shows the rupee amount. It is not live cash."],
  ["Or it comes back", "If nobody claims it in time, the unclaimed dollars return to the sender."],
];
const STICKERS = ["#ff942e", "#a199ff", "#36d972", "#ffc0c0", "#f955b2", "#ffbfec"];
const NODES = [
  { id: "sender", label: "Sender", note: "signs once, pays no gas", x: 16, y: 22, bg: "#ffbfec" },
  { id: "world", label: "World ID", note: "one verified human", x: 84, y: 22, bg: "#f955b2" },
  { id: "vault", label: "Vault", note: "holds the dollars", x: 16, y: 80, bg: "#36d972" },
  { id: "upi", label: "UPI test", note: "not live cash", x: 84, y: 80, bg: "#ff942e" },
];
const STAGE = [
  { label: "Sent", bg: "#ffbfec" },
  { label: "Claimed", bg: "#36d972" },
  { label: "UPI test", bg: "#ff942e" },
  { label: "Returned", bg: "#a199ff" },
  { label: "Denied", bg: "#193ef9" },
];

function letterCount(words: string[]) {
  return words.filter((word) => word !== "{media}").join("").length;
}
const FOLLOW_AT = (letterCount(LINE_1) + letterCount(LINE_2) - 1) * LETTER_STAGGER + 1.35;

function HeadlineLine({ words, startIndex }: { words: string[]; startIndex: number }) {
  let index = startIndex;
  return (
    <span className="block whitespace-nowrap">
      {words.map((word, wordIndex) => {
        if (word === "{media}") return <HeroMedia key="media" />;
        const letters = Array.from(word).map((char) => {
          const delay = index++;
          return (
            <span key={delay} className="relative -mb-[0.12em] -mr-[0.04em] inline-block overflow-hidden pb-[0.12em] pr-[0.04em] align-bottom">
              <span className="hero-letter" data-delay={delay * LETTER_STAGGER}>{char}</span>
            </span>
          );
        });
        return (
          <span key={word} className="inline-block whitespace-nowrap">
            {letters}
            {wordIndex < words.length - 1 ? "\u00a0" : null}
          </span>
        );
      })}
    </span>
  );
}

function HeroMedia() {
  return (
    <span className="hero-media relative mr-[0.12em] inline-block h-[0.72em] overflow-hidden align-[-0.04em]" data-hero-media aria-hidden="true">
      {[...MEDIA, MEDIA[0]].map((color, index) => (
        <span key={index} data-media-layer className="absolute inset-0" style={{ background: color, clipPath: index === 0 ? "inset(0%)" : "inset(100% 0% 0% 0%)" }}>
          <span className="absolute inset-[22%] rounded-full border-2 border-ink" />
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

function estimateFor(amount: string) {
  try { return inr(toPaise(parseAmount(amount), "84.00")); } catch { return "—"; }
}

export function Home() {
  const router = useRouter();
  const heroRef = useRef<HTMLElement>(null);
  const statementRef = useRef<HTMLElement>(null);
  const statementText = useRef<HTMLParagraphElement>(null);
  const casesRef = useRef<HTMLDivElement>(null);
  const howRef = useRef<HTMLElement>(null);
  const receiptsRef = useRef<HTMLElement>(null);
  const limitsRef = useRef<HTMLElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeRef = useRef(0);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState("");
  const [amount, setAmount] = useState("25");
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState(0);
  const estimate = estimateFor(amount);

  useGSAP(() => {
    if (prefersReducedMotion()) { setTyped(TYPED[0]); return; }
    gsap.utils.toArray<HTMLElement>(".hero-letter").forEach((el) => {
      gsap.to(el, { y: 0, duration: 1.25, ease: EASE.inOut, delay: Number(el.dataset.delay) });
    });
    gsap.to("[data-hero-media]", { width: "1.061em", marginLeft: 0, duration: 1.25, ease: EASE.inOut, delay: FOLLOW_AT });
    const layers = gsap.utils.toArray<HTMLElement>("[data-media-layer]");
    const cycle = gsap.timeline({ repeat: -1, delay: FOLLOW_AT + 1.4 });
    layers.slice(1).forEach((layer, index) => cycle.to(layer, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: EASE.inOut }, index * 1.5));
    cycle.set(layers.slice(1), { clipPath: "inset(100% 0% 0% 0%)" }, "+=0.9");
    gsap.to(".hero-follow", { opacity: 1, y: 0, duration: 0.7, ease: EASE.out, delay: FOLLOW_AT, stagger: 0.2 });
    gsap.to(".send-arrow-enter", { y: 0, duration: 0.7, ease: EASE.out, delay: FOLLOW_AT + 0.45 });
    const state = { chars: 0 };
    const typeTl = gsap.timeline({ repeat: -1, delay: FOLLOW_AT + 0.4 });
    TYPED.forEach((phrase) => {
      typeTl.to(state, { chars: phrase.length, duration: phrase.length * 0.045, ease: "none", onUpdate: () => setTyped(phrase.slice(0, Math.round(state.chars))) })
        .to(state, { chars: 0, duration: phrase.length * 0.02, ease: "none", delay: 1.6, onUpdate: () => setTyped(phrase.slice(0, Math.round(state.chars))) });
    });
  }, { scope: heroRef });

  const { contextSafe } = useGSAP({ scope: heroRef });
  const waveChip = contextSafe((el: HTMLElement) => {
    if (prefersReducedMotion()) return;
    gsap.to(el.querySelectorAll("[data-chip-letter]"), { keyframes: { y: [0, -3, 0] }, duration: 0.45, ease: EASE.spring, stagger: 0.018, overwrite: true });
  });
  const liftArrow = contextSafe((el: HTMLElement) => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(el.querySelector("[data-arrow-stack]"), { yPercent: 0 }, { yPercent: -50, duration: 0.65, ease: EASE.out, overwrite: true });
  });

  useGSAP(() => {
    if (prefersReducedMotion() || !statementText.current) return;
    SplitText.create(statementText.current, {
      type: "lines,words",
      wordsClass: "word",
      autoSplit: true,
      onSplit(self) {
        const tl = gsap.timeline({ scrollTrigger: { trigger: statementText.current, start: "top 80%", end: "bottom 40%", scrub: true } });
        self.lines.forEach((line) => tl.fromTo(line.querySelectorAll(".word"), { color: "#e1e1e1" }, { color: "#262626", stagger: 0.12, duration: 0.3, ease: "none" }, 0));
        return tl;
      },
    });
  }, { scope: statementRef });

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      ScrollTrigger.create({
        trigger: casesRef.current,
        start: "top top+=50",
        end: "bottom bottom",
        onUpdate: (self) => {
          const next = Math.min(CASES.length - 1, Math.floor(self.progress * CASES.length));
          if (next !== activeRef.current) { activeRef.current = next; setActive(next); }
        },
      });
    });
  }, { scope: casesRef });

  useGSAP(() => {
    const reduce = prefersReducedMotion();
    const duration = reduce ? 0 : 0.22;
    gsap.utils.toArray<HTMLElement>("[data-case-item]").forEach((el, index) => {
      gsap.to(el, { paddingLeft: index === active ? 20 : 0, color: index === active ? "#262626" : "#e1e1e1", duration, ease: EASE.out });
    });
    gsap.utils.toArray<HTMLElement>("[data-case-slide]").forEach((el, index) => {
      gsap.to(el, { clipPath: index <= active ? "inset(0% 0% 0% 0%)" : "inset(100% 0% 0% 0%)", duration, ease: EASE.out });
    });
    gsap.fromTo("[data-case-caption]", { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: reduce ? 0 : 0.35, ease: EASE.out });
    if (reduce) return;
    const stickers = gsap.utils.toArray<HTMLElement>("[data-sticker]");
    gsap.killTweensOf(stickers);
    gsap.fromTo(stickers, { x: 0, y: 0, rotation: 0, scale: 0.85, opacity: 1 }, {
      x: () => gsap.utils.random(-220, 220), y: () => gsap.utils.random(-180, 180), rotation: () => gsap.utils.random(-40, 40), scale: 1, duration: 0.8, ease: EASE.out, stagger: 0.012,
    });
    gsap.to(stickers, { opacity: 0, duration: 0.4, delay: 1.5, stagger: 0.01 });
  }, { dependencies: [active], scope: casesRef });

  useGSAP(() => {
    gsap.utils.toArray<HTMLElement>("[data-step]").forEach((el, index) => {
      ScrollTrigger.create({ trigger: el, start: "top center", end: "bottom center", onToggle: (self) => { if (self.isActive) setStep(index); } });
    });
  }, { scope: howRef });

  useGSAP(() => {
    const reduce = prefersReducedMotion();
    gsap.utils.toArray<HTMLElement>("[data-step]").forEach((el, index) => gsap.to(el, { opacity: index === step ? 1 : 0.32, duration: reduce ? 0 : 0.3, ease: EASE.out }));
    if (reduce) return;
    gsap.fromTo("[data-step-media]", { opacity: 0, scale: 0.3, y: 40 }, { keyframes: { opacity: [0, 1, 1], scale: [0.3, 1.05, 1], y: [40, -5, 0] }, duration: 0.6, ease: "none" });
  }, { dependencies: [step], scope: howRef });

  useGSAP(() => {
    if (prefersReducedMotion() || !bandRef.current) return;
    gsap.to(bandRef.current, { xPercent: -50, duration: 28, ease: "none", repeat: -1 });
  }, { scope: bandRef });

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.from("[data-receipt-card]", { y: 60, opacity: 0, duration: 0.8, ease: EASE.out, stagger: 0.1, scrollTrigger: { trigger: receiptsRef.current, start: "top 80%" } });
    gsap.utils.toArray<HTMLElement>("[data-receipt-float]").forEach((el, index) => {
      gsap.to(el, { keyframes: { x: [0, 10 - index * 6, -8, 0], y: [0, -8 + index * 3, 6, 0] }, duration: 7 + index, ease: "sine.inOut", repeat: -1 });
    });
    gsap.from("[data-sign-frame]", { opacity: 0, duration: 0.9, ease: EASE.out, scrollTrigger: { trigger: "[data-sign-frame]", start: "top 80%" } });
    gsap.to("[data-sign-line]", { strokeDashoffset: -24, duration: 1.2, ease: "none", repeat: -1 });
    gsap.utils.toArray<SVGCircleElement>("[data-sign-pulse]").forEach((dot, index) => {
      gsap.fromTo(dot, { attr: { cx: 50, cy: 50 }, opacity: 1 }, { attr: { cx: Number(dot.dataset.tx), cy: Number(dot.dataset.ty) }, opacity: 0.2, duration: 1.6, ease: EASE.inOut, repeat: -1, repeatDelay: 0.8, delay: index * 0.45 });
    });
  }, { scope: receiptsRef });

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.from("[data-limit-card]", { y: 40, opacity: 0, duration: 0.7, ease: EASE.out, stagger: 0.08, scrollTrigger: { trigger: limitsRef.current, start: "top 80%" } });
  }, { scope: limitsRef });

  useGSAP(() => {
    const reduce = prefersReducedMotion();
    gsap.to("[data-stage-indicator]", { xPercent: stage * 100, duration: reduce ? 0 : 0.4, ease: EASE.out });
    gsap.to("[data-stage-bg]", { backgroundColor: STAGE[stage].bg, duration: reduce ? 0 : 0.5, ease: EASE.out });
    if (!reduce) gsap.fromTo("[data-stage-mark]", { y: 40, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.6, ease: EASE.spring });
  }, { dependencies: [stage], scope: footerRef });

  const jumpTo = (index: number) => {
    const el = casesRef.current;
    if (!el || window.innerWidth < 1024) { setActive(index); return; }
    const top = el.getBoundingClientRect().top + window.scrollY - 50;
    const span = el.offsetHeight - (window.innerHeight - 50);
    window.scrollTo({ top: top + ((index + 0.5) / CASES.length) * span, behavior: "smooth" });
  };

  const submit = () => {
    const brief = text.trim() || typed || TYPED[0];
    router.push(`/dashboard?amount=${encodeURIComponent(amount)}&brief=${encodeURIComponent(brief)}`);
  };
  const current = CASES[active];

  return (
    <>
      <GiftRail />
      <main id="main" className="bg-white-00 text-ink lg:mr-[var(--rail-w)]">
        <section ref={heroRef} id="gift" className="flex flex-col items-center gap-8 px-4 pt-16 pb-14 lg:gap-12 lg:pt-24">
          <h1 className="hero-title w-full text-center text-[clamp(42px,7.4vw,104px)] text-ink">
            <span className="sr-only">Send a gift that lands in UPI</span>
            <span aria-hidden="true">
              <HeadlineLine words={LINE_1} startIndex={0} />
              <HeadlineLine words={LINE_2} startIndex={letterCount(LINE_1)} />
            </span>
          </h1>
          <p className="hero-follow max-w-[640px] text-center text-[18px] leading-snug lg:text-[22px]">
            Dollars leave you. They confirm with their phone. Rupees show up as a UPI test payout. If nobody claims it, it comes back.
          </p>
          <div className="hero-follow w-full max-w-[920px]">
            <form className="grid grid-cols-[1fr_88px] lg:grid-cols-[1fr_206px]" onSubmit={(event) => { event.preventDefault(); submit(); }}>
              <div className="relative h-[150px] bg-grey-01 lg:h-[206px]">
                <label htmlFor="gift-brief" className="sr-only">Describe the gift</label>
                <textarea id="gift-brief" ref={textareaRef} value={text} onChange={(event) => setText(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} className="absolute inset-0 resize-none bg-transparent p-4 text-[15px] leading-relaxed outline-none" />
                {!text && !focused ? <span className="pointer-events-none absolute top-4 left-4 text-[15px] text-grey-04">{typed}<span className="caret" /></span> : null}
                <label className="absolute bottom-3 left-3 flex items-center gap-2 bg-white-00 px-2 py-1 text-[13px]">
                  <span className="font-mono text-[10px] tracking-[0.08em] uppercase">USD</span>
                  <input value={amount} inputMode="decimal" autoComplete="off" onChange={(event) => setAmount(event.target.value)} className="w-14 bg-transparent outline-none" aria-label="Dollars" />
                  <span className="font-mono text-[12px]">{estimate}</span>
                </label>
              </div>
              <button type="submit" aria-label="Continue this gift in the dashboard" onMouseEnter={(event) => liftArrow(event.currentTarget)} className="relative flex items-center justify-center overflow-hidden bg-blue-03 text-white-00">
                <span className="send-arrow-enter absolute inset-0 overflow-hidden">
                  <span data-arrow-stack className="flex h-[200%] w-full flex-col">
                    <span className="flex h-1/2 items-center justify-center"><SendArrow /></span>
                    <span className="flex h-1/2 items-center justify-center"><SendArrow /></span>
                  </span>
                </span>
              </button>
            </form>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CHIPS.map((chip) => (
                <button key={chip.label} type="button" onMouseEnter={(event) => waveChip(event.currentTarget)} onClick={() => { setText(chip.text); setAmount(chip.amount); textareaRef.current?.focus(); }} className="flex h-[26px] items-center px-[9px] text-[13px]" style={{ background: chip.fill }}>
                  <span className="sr-only">{chip.label}</span>
                  <span aria-hidden="true">{Array.from(chip.label).map((char, index) => <span key={index} data-chip-letter className="inline-block whitespace-pre">{char}</span>)}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center font-mono text-[11px] tracking-[0.12em] text-grey-04 uppercase">Indicative · ₹84 · RazorpayX test mode</p>
          </div>
        </section>

        <section ref={statementRef} className="flex flex-col gap-4 px-4 py-20 lg:py-28">
          <p className="tag">Comes back</p>
          <div className="lg:grid lg:grid-cols-[28%_1fr]">
            <div />
            <p ref={statementText} className="max-w-[860px] text-[clamp(28px,3.2vw,50px)] leading-[1.05] tracking-[-0.03em]">
              Other gifts need an account on the other side. A Shagun waits for one person, then returns to you.
            </p>
          </div>
        </section>

        <div ref={casesRef} id="uses" className="lg:h-[500vh]">
          <section className="flex flex-col lg:sticky lg:top-[var(--header-h)] lg:h-[calc(100dvh-var(--header-h))]">
            <div className="border-b border-grey-02 px-4"><p className="tag">Who it&apos;s for</p></div>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(280px,38%)_1fr]">
              <ul className="flex flex-col px-4 pt-4">
                {CASES.map((item, index) => (
                  <li key={item.title}>
                    <button type="button" data-case-item onClick={() => jumpTo(index)} aria-current={index === active} className="text-left text-[clamp(28px,3.2vw,52px)] leading-[1.05] tracking-[-0.04em]" style={{ color: index === 0 ? "#262626" : "#e1e1e1", paddingLeft: index === 0 ? 20 : 0 }}>
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="relative min-h-[280px] lg:min-h-0">
                {CASES.map((item, index) => (
                  <div key={item.title} data-case-slide className="absolute inset-4 lg:inset-y-0 lg:right-0 lg:left-0" style={{ zIndex: index, background: item.bg, clipPath: index === 0 ? "inset(0%)" : "inset(100% 0% 0% 0%)" }} aria-hidden={index !== active} />
                ))}
                <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <span key={index} data-sticker className="absolute px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.06em] uppercase opacity-0" style={{ background: STICKERS[index % STICKERS.length], left: "46%", top: "42%" }}>{current.stickers[index % current.stickers.length]}</span>
                  ))}
                </div>
              </div>
            </div>
            <p data-case-caption className="max-w-[36rem] px-4 py-4 text-[16px] leading-snug">{current.caption}</p>
          </section>
        </div>

        <section ref={howRef} id="how" className="pt-8">
          <div className="flex items-end justify-between gap-4 px-4 pb-6">
            <div>
              <p className="tag">How a gift moves</p>
              <h2 className="hero-title mt-3 text-[clamp(32px,4vw,52px)]">Name it. They claim it. You can check it.</h2>
            </div>
            <Link href="/dashboard" className="hidden h-12 items-center bg-black-00 px-4 text-[15px] text-white-00 lg:flex">Send a gift</Link>
          </div>
          <div className="grid border-t border-grey-02 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="relative hidden lg:block">
              <div className="sticky top-[var(--header-h)] flex h-[calc(100dvh-var(--header-h))] items-center justify-center bg-grey-01">
                <div data-step-media className="w-[min(420px,70%)] bg-white-00 p-6">
                  <p className="font-mono text-[12px] text-grey-04">Step {String(step + 1).padStart(2, "0")}</p>
                  <p className="mt-6 text-[42px] tracking-[-0.05em]">${amount || "—"}</p>
                  <p className="mt-2 font-mono">{estimate} · test mode</p>
                </div>
              </div>
            </div>
            <ol className="lg:border-l lg:border-grey-02">
              {STEPS.map(([title, body], index) => (
                <li key={title} data-step className="flex min-h-[46vh] flex-col justify-center border-b border-grey-02 px-4 py-10 lg:min-h-[70vh] lg:px-10" style={{ opacity: index === 0 ? 1 : 0.32 }}>
                  <span className="font-mono text-[18px] text-grey-03">[ {String(index + 1).padStart(2, "0")} ]</span>
                  <h3 className="hero-title mt-2 text-[clamp(28px,3vw,46px)]">{title}</h3>
                  <p className="mt-3 max-w-[380px] text-[15px] leading-relaxed text-grey-04">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="overflow-hidden border-y border-grey-02 py-4">
          <div ref={bandRef} className="flex w-[200%] font-mono text-[12px] tracking-[0.16em] whitespace-nowrap uppercase">
            <span className="w-1/2">Envelope · Fingerprint · World ID · UPI test · Return ·&nbsp;</span>
            <span className="w-1/2">Envelope · Fingerprint · World ID · UPI test · Return ·&nbsp;</span>
          </div>
        </div>
        <Hood />

        <section ref={receiptsRef} id="receipts" className="px-4 py-20">
          <p className="tag">Receipts</p>
          <h2 className="hero-title mt-4 max-w-[14ch] text-[clamp(36px,5vw,64px)]">A record for every step that moves money</h2>
          <div className="mt-10 grid gap-px bg-grey-02 sm:grid-cols-3">
            {[["0", "gas from the sender", "The relayer pays the network fee."], ["1", "verified human", "Proof of Human is enough. No name is stored."], ["Test", "UPI, not live cash", "RazorpayX test mode. The rate is indicative."]].map(([figure, title, body]) => (
              <article key={title} data-receipt-card className="bg-white-00 p-6">
                <p data-receipt-float className="text-[56px] leading-none tracking-[-0.05em]">{figure}</p>
                <h3 className="mt-4 text-[22px] tracking-[-0.03em]">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-grey-04">{body}</p>
              </article>
            ))}
          </div>
          <div data-sign-frame className="relative mt-12 h-[420px] overflow-hidden bg-grey-01 lg:h-[520px]">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
              {NODES.map((node) => <line key={node.id} data-sign-line x1="50" y1="50" x2={node.x} y2={node.y} stroke="#262626" strokeWidth="1.4" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />)}
              {NODES.map((node) => <circle key={node.id} data-sign-pulse data-tx={node.x} data-ty={node.y} cx="50" cy="50" r="0.9" fill="#262626" />)}
            </svg>
            <p className="absolute top-1/2 left-1/2 w-40 -translate-x-1/2 -translate-y-1/2 text-center text-[22px] tracking-[-0.04em]">The gift</p>
            {NODES.map((node) => (
              <div key={node.id} className="absolute w-36 -translate-x-1/2 -translate-y-1/2 p-3" style={{ left: `${node.x}%`, top: `${node.y}%`, background: node.bg }}>
                <p className="text-[16px] tracking-[-0.03em]">{node.label}</p>
                <p className="text-[12px] leading-snug">{node.note}</p>
              </div>
            ))}
          </div>
        </section>

        <section ref={limitsRef} id="limits" className="border-t border-grey-02 px-4 py-20">
          <p className="tag">Limits</p>
          <h2 className="hero-title mt-4 max-w-[16ch] text-[clamp(32px,4vw,50px)]">What this demo will and will not claim</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {[["On the chain, real", "The gift, the claim, and the return are Whitechain testnet transactions."], ["The rupees, a test", "A payout id means the test API accepted it, not that a bank paid anyone."], ["Not scam-proof", "An unregistered envelope goes to the first verified claimer."]].map(([title, body]) => (
              <article key={title} data-limit-card className="border border-grey-02 p-5">
                <h3 className="text-[24px] tracking-[-0.03em]">{title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-grey-04">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <footer ref={footerRef} className="border-t border-grey-02">
          <div data-stage-bg className="relative flex h-[52vh] min-h-[360px] items-center justify-center" style={{ background: STAGE[0].bg }}>
            <p data-stage-mark className="text-[clamp(48px,7vw,96px)] tracking-[-0.06em]">{STAGE[stage].label}</p>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <div className="relative grid grid-cols-5 bg-white-00 text-[13px]" role="tablist" aria-label="Gift state">
                <span data-stage-indicator className="absolute inset-y-0 left-0 w-1/5 bg-black-00" />
                {STAGE.map((item, index) => (
                  <button key={item.label} type="button" role="tab" aria-selected={index === stage} onClick={() => setStage(index)} className={`relative z-10 min-h-11 px-3 ${index === stage ? "text-white-00" : "text-ink"}`}>{item.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
            <p className="max-w-[16rem] text-[15px] leading-relaxed text-grey-04">A Diwali gift in dollars, received in UPI. Built for ETHGlobal Mumbai.</p>
            <nav aria-label="The gift" className="flex flex-col gap-2"><p className="font-mono text-[12px] tracking-[0.08em] uppercase">The gift</p><FlipLink href="/dashboard" label="Send a gift" className="self-start" /><FlipLink href="/#how" label="How it moves" className="self-start" /></nav>
            <nav aria-label="Partners" className="flex flex-col gap-2"><p className="font-mono text-[12px] tracking-[0.08em] uppercase">Partners</p><FlipLink href="https://whitechain.io" label="Whitechain" className="self-start" /><FlipLink href="https://world.org/world-id" label="World ID" className="self-start" /></nav>
            <p className="font-mono text-[11px] tracking-[0.08em] text-grey-04 uppercase">Whitechain testnet · RazorpayX test mode</p>
          </div>
        </footer>
      </main>
    </>
  );
}
