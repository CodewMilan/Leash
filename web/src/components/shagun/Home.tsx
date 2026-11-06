"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FlipLink } from "@/components/FlipLink";
import { GiftRail } from "./Envelope";
import { Hood } from "./Hood";
import { parseAmount } from "@/lib/amounts";
import { MESSAGE_MAX } from "@/lib/designs";
import { EASE, gsap, prefersReducedMotion, ScrollTrigger, SplitText, useGSAP } from "@/lib/gsap";

const LINE_1 = ["Send", "a", "{media}", "gift"];
const LINE_2 = ["that", "becomes", "a", "card"];
const LETTER_STAGGER = 0.025;
const MEDIA = ["#36d972", "#ff942e", "#a199ff", "#ffc0c0", "#193ef9"];
const TYPED = [
  "Happy Diwali, Priya. Treat yourself this week.",
  "For the judges. Tap, verify, spend it on something good.",
  "One for every teammate. Thanks for the late nights.",
  "Shubh Deepavali! If you don't open it, it comes back to me.",
];
const CHIPS = [
  { label: "Diwali", fill: "#ff942e", text: "Happy Diwali, Priya. Buy yourself something bright.", amount: "25" },
  { label: "For a judge", fill: "#a199ff", text: "For the judges. Tap, verify, and spend it on something good.", amount: "51" },
  { label: "Team drop", fill: "#36d972", text: "One for every teammate. Thanks for the late nights.", amount: "101" },
  { label: "Birthday", fill: "#ffc0c0", text: "Happy birthday! Lunch is on me.", amount: "11" },
  { label: "Thank you", fill: "#f955b2", text: "Thank you for everything this year.", amount: "25" },
];
const CASES = [
  {
    title: "Family abroad",
    caption: "You send test USDT from MetaMask. They confirm on their phone and get a virtual card for the amount. No wallet on their side.",
    bg: "#ffbfec",
    stickers: ["No wallet", "One tap", "Virtual card", "Comes back"],
    ticket: { tag: "Card ready", amount: "$25", line: "Priya · •••• 4142", foot: "Lithic sandbox" },
  },
  {
    title: "A judge's envelope",
    caption: "One tap on the envelope, one fingerprint, no gas popup. The card shows up in the browser, next to the explorer link.",
    bg: "#ff942e",
    stickers: ["No gas", "NFC tap", "Receipt", "Sandbox"],
    ticket: { tag: "Claimed", amount: "$51", line: "Passkey ✓ · Gift link ✓", foot: "Whitechain tx linked" },
  },
  {
    title: "A forwarded link",
    caption: "Once a gift is claimed, card access requires the original passkey. Before the first claim, anyone with the private link can claim it.",
    bg: "#ffc0c0",
    stickers: ["Denied", "Stays put", "Passkey", "Not magic"],
    ticket: { tag: "Denied", amount: "$25", line: "Different passkey", foot: "Nothing moved" },
  },
  {
    title: "An expired gift",
    caption: "If nobody claims it in time, the whole gift returns to the sender on-chain. If a card was used, only what's left comes back.",
    bg: "#36d972",
    stickers: ["Expiry", "Return", "Unspent", "Yours again"],
    ticket: { tag: "Returned", amount: "$17", line: "$8 spent · $17 back", foot: "To the sender" },
  },
  {
    title: "One per passkey",
    caption: "A company drop allows one gift per passkey. This limits repeat claims with that passkey; it does not verify a unique person.",
    bg: "#a199ff",
    stickers: ["Campaign", "Passkey", "Same key", "One each"],
    ticket: { tag: "Refused", amount: "$101", line: "Second claim, same passkey", foot: "One per passkey" },
  },
];
const STEPS = [
  ["Name the gift", "Amount, a note, and when it expires. You sign once in MetaMask; Shagun pays the gas."],
  ["They open the envelope", "A tap or a private link. They confirm with a passkey, then claim the gift on their phone."],
  ["They get a card", "A Lithic sandbox virtual card with the gift as its limit. Purchases are simulated; no real money moves."],
  ["The rest comes back", "When the gift expires, the card closes and the unspent USDT returns to you. An unclaimed gift returns in full."],
];
const STICKERS = ["#ff942e", "#a199ff", "#36d972", "#ffc0c0", "#f955b2", "#ffbfec"];
const NODES = [
  { id: "sender", label: "Sender", note: "signs once, pays no gas", x: 16, y: 22, bg: "#ffbfec" },
  { id: "passkey", label: "Passkey", note: "protects the gift claim", x: 84, y: 22, bg: "#f955b2" },
  { id: "vault", label: "Vault", note: "holds the USDT", x: 16, y: 80, bg: "#36d972" },
  { id: "card", label: "Virtual card", note: "Lithic sandbox", x: 84, y: 80, bg: "#ff942e" },
];
const STAGE = [
  { label: "Sent", bg: "#ffbfec" },
  { label: "Claimed", bg: "#36d972" },
  { label: "Card", bg: "#ff942e" },
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

function dollars(amount: string) {
  try { parseAmount(amount); } catch { return null; }
  return Number(amount);
}
const usd = (value: number) => `$${value.toFixed(2)}`;

function Check({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-grey-02 py-3 first:border-t-0">
      <span className="grid h-7 w-7 shrink-0 place-items-center bg-green-00 text-[14px]" aria-hidden="true">✓</span>
      <span className="flex-1">
        <span className="block text-[16px] tracking-[-0.02em]">{label}</span>
        <span className="block text-[13px] text-grey-04">{note}</span>
      </span>
    </div>
  );
}

function StepVisual({ step, amount }: { step: number; amount: number }) {
  const spent = Math.round(amount * 32) / 100;
  if (step === 0)
    return (
      <div className="bg-white-00 p-5">
        <p className="font-mono text-[11px] tracking-[0.08em] text-grey-04 uppercase">New gift</p>
        <p className="mt-4 text-[44px] leading-none tracking-[-0.05em]">{usd(amount)}</p>
        <p className="mt-1 text-[13px] text-grey-04">test USDT · expires in 7 days</p>
        <p className="mt-5 border-l-2 border-orange-00 pl-3 text-[15px] leading-snug">Happy Diwali, Priya. Treat yourself this week.</p>
        <p className="mt-6 flex h-11 items-center justify-center bg-black-00 text-[14px] text-white-00">Sign once · no gas</p>
      </div>
    );
  if (step === 1)
    return (
      <div className="bg-white-00 p-5">
        <p className="font-mono text-[11px] tracking-[0.08em] text-grey-04 uppercase">Opening the envelope</p>
        <div className="mt-3">
          <Check label="Passkey" note="This phone, confirmed" />
          <Check label="Gift link" note="The private envelope key" />
          <Check label="Claim" note="Recorded on Whitechain" />
        </div>
      </div>
    );
  if (step === 2)
    return (
      <div>
        <div className="flex aspect-[1.586] flex-col justify-between bg-black-00 p-5 text-white-00">
          <div className="flex items-start justify-between">
            <span className="text-[20px] tracking-[-0.04em]">shagun</span>
            <span className="bg-orange-00 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink uppercase">Sandbox</span>
          </div>
          <p className="font-mono text-[18px] tracking-[0.12em]">•••• •••• •••• 4142</p>
          <div className="flex items-end justify-between font-mono text-[11px] tracking-[0.06em] uppercase">
            <span>Priya</span>
            <span>Lithic</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-grey-02">
          <p className="bg-white-00 p-4"><span className="block text-[12px] text-grey-04">Limit</span><span className="text-[20px] tracking-[-0.03em]">{usd(amount)}</span></p>
          <p className="bg-white-00 p-4"><span className="block text-[12px] text-grey-04">Spent</span><span className="text-[20px] tracking-[-0.03em]">{usd(spent)}</span></p>
        </div>
      </div>
    );
  return (
    <div className="bg-white-00 p-5">
      <p className="font-mono text-[11px] tracking-[0.08em] text-grey-04 uppercase">Gift closed</p>
      <p className="mt-4 text-[44px] leading-none tracking-[-0.05em]">{usd(amount - spent)}</p>
      <p className="mt-1 text-[13px] text-grey-04">returned to you on Whitechain</p>
      <div className="mt-6 h-2 w-full bg-purple-00" aria-hidden="true">
        <div className="h-full bg-ink" style={{ width: "32%" }} />
      </div>
      <div className="mt-2 flex justify-between text-[13px]">
        <span>{usd(spent)} spent</span>
        <span className="text-grey-04">{usd(amount - spent)} back</span>
      </div>
    </div>
  );
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
  const value = dollars(amount);

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
    const area = stickers[0]?.parentElement?.getBoundingClientRect();
    const spreadX = Math.min(220, (area?.width ?? 440) * 0.36);
    const spreadY = Math.min(180, (area?.height ?? 360) * 0.36);
    gsap.fromTo(stickers, { x: 0, y: 0, rotation: 0, scale: 0.85, opacity: 1 }, {
      x: () => gsap.utils.random(-spreadX, spreadX), y: () => gsap.utils.random(-spreadY, spreadY), rotation: () => gsap.utils.random(-40, 40), scale: 1, duration: 0.8, ease: EASE.out, stagger: 0.012,
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
    gsap.utils.toArray<HTMLElement>("[data-sign-pulse]").forEach((dot, index) => {
      gsap.fromTo(dot, { left: "50%", top: "50%", opacity: 1 }, { left: `${dot.dataset.tx}%`, top: `${dot.dataset.ty}%`, opacity: 0.2, duration: 1.6, ease: EASE.inOut, repeat: -1, repeatDelay: 0.8, delay: index * 0.45 });
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
    const query = new URLSearchParams({ amount: value === null ? "25" : amount });
    if (text.trim()) query.set("brief", text.trim());
    router.push(`/dashboard?${query}`);
  };
  const current = CASES[active];

  return (
    <>
      <GiftRail />
      <main id="main" className="bg-white-00 text-ink lg:mr-[var(--rail-w)]">
        <section ref={heroRef} id="gift" className="flex flex-col items-center gap-8 px-4 pt-16 pb-14 lg:gap-12 lg:pt-24">
          <h1 className="hero-title w-full text-center text-[clamp(42px,7.4vw,104px)] text-ink">
            <span className="sr-only">Send a gift that becomes a card</span>
            <span aria-hidden="true">
              <HeadlineLine words={LINE_1} startIndex={0} />
              <HeadlineLine words={LINE_2} startIndex={letterCount(LINE_1)} />
            </span>
          </h1>
          <p className="hero-follow max-w-[640px] text-center text-[18px] leading-snug lg:text-[22px]">
            You send dollars without paying gas. The recipient opens it with a passkey on their phone and gets a virtual card. Whatever they don&apos;t spend comes back to you.
          </p>
          <div className="hero-follow w-full max-w-[920px]">
            <form className="grid grid-cols-[1fr_88px] lg:grid-cols-[1fr_206px]" onSubmit={(event) => { event.preventDefault(); submit(); }}>
              <div className="relative h-[150px] bg-grey-01 has-[textarea:focus-visible]:shadow-[inset_0_0_0_2px_#262626] lg:h-[206px]">
                <label htmlFor="gift-brief" className="sr-only">A note for them</label>
                <textarea id="gift-brief" name="note" autoComplete="off" ref={textareaRef} value={text} maxLength={MESSAGE_MAX} onChange={(event) => setText(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }} className="absolute inset-0 resize-none bg-transparent p-4 pb-14 text-[15px] leading-relaxed outline-none" />
                {!text && !focused ? <span className="pointer-events-none absolute top-4 right-4 left-4 text-[15px] text-grey-04">{typed}<span className="caret" /></span> : null}
                <label className="absolute bottom-3 left-3 flex h-9 items-center gap-2 bg-white-00 px-3 text-[14px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink">
                  <span className="text-grey-04">$</span>
                  <input name="amount" value={amount} inputMode="decimal" autoComplete="off" spellCheck={false} onChange={(event) => setAmount(event.target.value.trim())} className="w-16 bg-transparent outline-none" aria-label="Gift amount in dollars" aria-invalid={value === null} aria-describedby="hero-amount-note" />
                  <span id="hero-amount-note" className={`font-mono text-[11px] tracking-[0.06em] uppercase ${value === null ? "text-red-00" : "text-grey-04"}`}>{value === null ? "Up to $1,000" : "test USDT"}</span>
                </label>
              </div>
              <button type="submit" aria-label="Continue this gift in the dashboard" onMouseEnter={(event) => liftArrow(event.currentTarget)} className="relative flex items-center justify-center overflow-hidden bg-blue-03 text-white-00">
                <span className="send-arrow-enter absolute inset-0 overflow-hidden">
                  <span data-arrow-stack className="flex h-[200%] w-full flex-col">
                    <span className="flex h-1/2 items-center justify-center"><SendArrow /></span>
                    <span className="flex h-1/2 items-center justify-center"><SendArrow /></span>
                  </span>
                </span>
                <span className="absolute bottom-3 hidden font-mono text-[11px] tracking-[0.08em] uppercase lg:block" aria-hidden="true">Start the gift</span>
              </button>
            </form>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CHIPS.map((chip) => (
                <button key={chip.label} type="button" onMouseEnter={(event) => waveChip(event.currentTarget)} onClick={() => { setText(chip.text); setAmount(chip.amount); textareaRef.current?.focus(); }} className="flex h-9 items-center px-3 text-[13px] lg:h-[26px] lg:px-[9px]" style={{ background: chip.fill }}>
                  <span className="sr-only">{chip.label}</span>
                  <span aria-hidden="true">{Array.from(chip.label).map((char, index) => <span key={index} data-chip-letter className="inline-block whitespace-pre">{char}</span>)}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center font-mono text-[11px] tracking-[0.12em] text-grey-04 uppercase">Whitechain testnet · Lithic sandbox card · No real money</p>
          </div>
        </section>

        <section ref={statementRef} className="flex flex-col gap-4 px-4 py-20 lg:py-28">
          <p className="tag">Comes back</p>
          <div className="lg:grid lg:grid-cols-[28%_1fr]">
            <div />
            <p ref={statementText} className="max-w-[860px] text-[clamp(28px,3.2vw,50px)] leading-[1.05] tracking-[-0.03em]">
              Most gifts need an app on the other side. A Shagun needs a phone and a person, and whatever goes unspent comes back to you.
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
              <div className="relative min-h-[300px] overflow-hidden lg:min-h-0">
                {CASES.map((item, index) => (
                  <div key={item.title} data-case-slide className="absolute inset-4 grid place-items-center lg:inset-y-0 lg:right-0 lg:left-0" style={{ zIndex: index, background: item.bg, clipPath: index === 0 ? "inset(0%)" : "inset(100% 0% 0% 0%)" }} aria-hidden={index !== active}>
                    <div className="w-[min(300px,78%)] bg-white-00 p-5 shadow-[0_18px_40px_rgba(38,38,38,0.12)] lg:w-[min(360px,60%)] lg:p-7">
                      <p className="flex items-center justify-between font-mono text-[11px] tracking-[0.08em] uppercase">
                        <span>{item.ticket.tag}</span>
                        <span className="text-grey-04">{item.ticket.foot}</span>
                      </p>
                      <p className="mt-5 text-[clamp(44px,5vw,72px)] leading-none tracking-[-0.05em]">{item.ticket.amount}</p>
                      <p className="mt-3 border-t border-grey-02 pt-3 text-[15px]">{item.ticket.line}</p>
                    </div>
                  </div>
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
                <div data-step-media className="w-[min(380px,70%)]">
                  <p className="mb-3 font-mono text-[12px] text-grey-04">Step {String(step + 1).padStart(2, "0")} of {STEPS.length}</p>
                  <StepVisual step={step} amount={value ?? 25} />
                </div>
              </div>
            </div>
            <ol className="lg:border-l lg:border-grey-02">
              {STEPS.map(([title, body], index) => (
                <li key={title} data-step className="flex min-h-[46vh] flex-col justify-center border-b border-grey-02 px-4 py-10 lg:min-h-[70vh] lg:px-10" style={{ opacity: index === 0 ? 1 : 0.32 }}>
                  <span className="font-mono text-[18px] text-grey-03">[ {String(index + 1).padStart(2, "0")} ]</span>
                  <h3 className="hero-title mt-2 text-[clamp(28px,3vw,46px)]">{title}</h3>
                  <p className="mt-3 max-w-[380px] text-[15px] leading-relaxed text-grey-04">{body}</p>
                  <div className="mt-6 max-w-[360px] bg-grey-01 p-4 lg:hidden" aria-hidden="true">
                    <StepVisual step={index} amount={value ?? 25} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <div className="overflow-hidden border-y border-grey-02 py-4">
          <div ref={bandRef} className="flex w-[200%] font-mono text-[12px] tracking-[0.16em] whitespace-nowrap uppercase">
            <span className="w-1/2">Envelope · Passkey · Private link · Virtual card · Comes back · No gas · One claim ·&nbsp;</span>
            <span className="w-1/2" aria-hidden="true">Envelope · Passkey · Private link · Virtual card · Comes back · No gas · One claim ·&nbsp;</span>
          </div>
        </div>
        <Hood />

        <section ref={receiptsRef} id="receipts" className="px-4 py-20">
          <p className="tag">Receipts</p>
          <h2 className="hero-title mt-4 max-w-[14ch] text-[clamp(36px,5vw,64px)]">A record for every step that moves money</h2>
          <div className="mt-10 grid gap-px bg-grey-02 sm:grid-cols-3">
            {[["0", "gas from the sender", "The relayer pays the network fee."], ["1", "claim per gift", "A passkey and the private gift link protect each claim."], ["$0", "real money", "Test USDT and a Lithic sandbox card. Purchases are simulated."]].map(([figure, title, body]) => (
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
            </svg>
            {NODES.map((node) => <span key={node.id} data-sign-pulse data-tx={node.x} data-ty={node.y} className="absolute top-1/2 left-1/2 -mt-1 -ml-1 h-2 w-2 rounded-full bg-ink" aria-hidden="true" />)}
            <p className="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 bg-ink px-4 py-2 text-center text-[20px] tracking-[-0.04em] text-white-00">The gift</p>
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
            {[["On the chain, real", "The gift, the claim and the return are Whitechain testnet transactions in official test USDT."], ["The card, a sandbox", "The Lithic card is genuine but sandboxed. It is not on a card network; purchases are simulated."], ["Not scam-proof", "Anyone with an unclaimed gift’s private link can claim it with a passkey. After that, card access requires the original passkey."]].map(([title, body]) => (
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
            <p className="max-w-[16rem] text-[15px] leading-relaxed text-grey-04">A Diwali gift in dollars that arrives as a card. Built for ETHGlobal Mumbai.</p>
            <nav aria-label="The gift" className="flex flex-col gap-2"><p className="font-mono text-[12px] tracking-[0.08em] uppercase">The gift</p><FlipLink href="/dashboard" label="Send a gift" className="self-start" /><FlipLink href="/#how" label="How it moves" className="self-start" /></nav>
            <nav aria-label="Partners" className="flex flex-col gap-2"><p className="font-mono text-[12px] tracking-[0.08em] uppercase">Partners</p><FlipLink href="https://whitechain.io" label="Whitechain" className="self-start" /><FlipLink href="https://www.lithic.com" label="Lithic" className="self-start" /></nav>
            <p className="font-mono text-[11px] tracking-[0.08em] text-grey-04 uppercase">Whitechain testnet · Lithic sandbox · No real money</p>
          </div>
        </footer>
      </main>
    </>
  );
}
