"use client";

import Link from "next/link";
import { useRef } from "react";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

type FlipLinkProps = {
  href: string;
  label: string;
  className?: string;
  onClick?: () => void;
};

/** Link whose letters flip over one by one on hover. */
export function FlipLink({ href, label, className = "", onClick }: FlipLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { contextSafe } = useGSAP({ scope: ref });

  const flip = contextSafe(() => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      ".flip-letter",
      { rotateX: 0 },
      { rotateX: 360, duration: 0.5, ease: EASE.flip, stagger: 0.035, overwrite: true },
    );
  });

  return (
    <Link
      ref={ref}
      href={href}
      onClick={onClick}
      onMouseEnter={flip}
      onFocus={flip}
      className={`flip-host outline-none focus-visible:underline ${className}`}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">
        {Array.from(label).map((ch, i) => (
          <span key={i} className="flip-letter">
            {ch}
          </span>
        ))}
      </span>
    </Link>
  );
}
