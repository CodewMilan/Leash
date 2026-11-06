"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FlipLink } from "@/components/FlipLink";
import { EASE, gsap, useGSAP } from "@/lib/gsap";

export const NAV = [
  { href: "/#uses", label: "Who it's for" },
  { href: "/#how", label: "How it moves" },
  { href: "/#receipts", label: "Receipts" },
  { href: "/#limits", label: "Limits" },
];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center text-[22px] font-medium tracking-[-0.07em] ${className}`}>shagun</span>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = menuRef.current;
      if (!el) return;
      if (open) {
        gsap.set(el, { display: "flex" });
        gsap.fromTo(el, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE.out });
        gsap.fromTo(el.querySelectorAll("a"), { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE.out, stagger: 0.03 });
      } else {
        gsap.to(el, {
          opacity: 0,
          y: -6,
          duration: 0.2,
          ease: EASE.out,
          onComplete: () => gsap.set(el, { display: "none" }),
        });
      }
    },
    { dependencies: [open] },
  );

  return (
    <header className="sticky top-0 z-40 border-b border-grey-02 bg-white-00">
      <div className="relative hidden h-[var(--header-h)] items-center px-5 lg:flex">
        <Link href="/" aria-label="Shagun home">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="absolute left-1/2 flex -translate-x-1/2 items-center gap-6 text-[15px]">
          {NAV.map((item) => (
            <FlipLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
        <div className="ml-auto flex h-full items-center">
          <FlipLink href="/dashboard" label="Dashboard" className="mr-6 text-[15px]" />
          <FlipLink href="/dashboard" label="Send a gift" className="flex h-full items-center bg-black-00 px-5 text-[15px] text-white-00" />
        </div>
      </div>

      <div className="flex h-[var(--header-h)] items-center justify-between px-4 lg:hidden">
        <Link href="/" aria-label="Shagun home">
          <Wordmark />
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
          className="grid h-11 w-11 place-items-center"
        >
          <span className="relative block h-3 w-5" aria-hidden="true">
            <span className="absolute left-0 h-[1.5px] w-full bg-ink" style={{ top: open ? 5 : 0, transform: open ? "rotate(45deg)" : "none" }} />
            <span className="absolute left-0 top-[5px] h-[1.5px] w-full bg-ink" style={{ opacity: open ? 0 : 1 }} />
            <span className="absolute left-0 h-[1.5px] w-full bg-ink" style={{ top: open ? 5 : 10, transform: open ? "rotate(-45deg)" : "none" }} />
          </span>
        </button>
      </div>
      <div id="mobile-menu" ref={menuRef} className="flex-col gap-4 border-t border-grey-02 px-4 py-5 text-[22px] lg:hidden" style={{ display: "none" }}>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
            {item.label}
          </Link>
        ))}
        <Link href="/dashboard" onClick={() => setOpen(false)}>
          Send a gift
        </Link>
      </div>
    </header>
  );
}
