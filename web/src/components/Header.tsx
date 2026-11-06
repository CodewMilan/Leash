"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FlipLink } from "@/components/FlipLink";
import { EASE, gsap, useGSAP } from "@/lib/gsap";

export const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#cases", label: "When it pays" },
  { href: "/#hood", label: "Under the hood" },
  { href: "/#rules", label: "Spend rules" },
  { href: "/#inside", label: "What's inside" },
];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center font-book text-[24px] font-semibold tracking-[-0.06em] ${className}`}>
      leash
    </span>
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
        gsap.fromTo(
          el.querySelectorAll("a"),
          { opacity: 0, y: -6 },
          { opacity: 1, y: 0, duration: 0.3, ease: EASE.out, stagger: 0.03 },
        );
      } else {
        gsap.to(el, {
          opacity: 0,
          y: -6,
          duration: 0.2,
          ease: EASE.out,
          onComplete: () => {
            gsap.set(el, { display: "none" });
          },
        });
      }
    },
    { dependencies: [open] },
  );

  return (
    <header className="sticky top-0 z-40 border-b border-grey-02 bg-white-00">
      <div className="relative hidden h-[var(--header-h)] items-center lg:flex" style={{ paddingLeft: 70 }}>
        <Link href="/" aria-label="Leash home">
          <Wordmark />
        </Link>
        <nav
          aria-label="Main"
          className="absolute flex -translate-x-1/2 items-center gap-[16px] whitespace-nowrap text-[15px] xl:gap-[30px]"
          style={{ left: "calc(50% - 76px)" }}
        >
          {NAV.map((item) => (
            <FlipLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
        <div className="ml-auto flex h-full items-center">
          <FlipLink href="/fund" label="Top up" className="mr-[24px] hidden text-[15px] xl:inline-flex" />
          <FlipLink href="/merchant" label="Merchants" className="mr-[30px] text-[15px]" />
          <FlipLink
            href="/dashboard"
            label="Open Dashboard"
            className="flex h-full w-[var(--rail-w)] items-center justify-center bg-black-00 text-[15px] text-white-00"
          />
        </div>
      </div>

      <div className="flex h-[44px] items-center justify-between pl-[15px] lg:hidden">
        <Link href="/" aria-label="Leash home">
          <Wordmark className="text-[20px]" />
        </Link>
        <div className="flex h-full items-center">
          <Link href="/dashboard" className="flex h-full items-center bg-black-00 px-[14px] text-[14px] text-white-00">
            Dashboard
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="flex h-full w-[48px] items-center justify-center"
          >
            <span className="relative block h-[12px] w-[20px]">
              <span
                className="absolute left-0 h-[1.5px] w-full bg-ink transition-transform duration-300"
                style={{ top: open ? 5 : 0, transform: open ? "rotate(45deg)" : "none" }}
              />
              <span
                className="absolute left-0 top-[5px] h-[1.5px] w-full bg-ink transition-opacity duration-200"
                style={{ opacity: open ? 0 : 1 }}
              />
              <span
                className="absolute left-0 h-[1.5px] w-full bg-ink transition-transform duration-300"
                style={{ top: open ? 5 : 10, transform: open ? "rotate(-45deg)" : "none" }}
              />
            </span>
          </button>
        </div>
      </div>
      <div
        id="mobile-menu"
        ref={menuRef}
        className="hidden flex-col gap-[14px] border-t border-grey-02 bg-white-00 px-[15px] py-[20px] text-[22px] lg:hidden"
      >
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
            {item.label}
          </Link>
        ))}
        <Link href="/dashboard" onClick={() => setOpen(false)}>
          Live log
        </Link>
        <Link href="/fund" onClick={() => setOpen(false)}>
          Top up your Leash
        </Link>
        <Link href="/merchant" onClick={() => setOpen(false)}>
          For merchants
        </Link>
      </div>
    </header>
  );
}
