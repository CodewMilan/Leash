"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

export const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#rules", label: "Made for humans" },
  { href: "/#inside", label: "Under the envelope" },
];
export function Wordmark({ className = "" }: { className?: string }) {
  return <span className={`wordmark ${className}`}>shagun<span className="wordmark-dot" aria-hidden="true">✳</span></span>;
}
export function Header() {
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <div className="header-inner">
      <Link href="/" aria-label="Shagun home"><Wordmark /></Link>
      <nav className="desktop-nav" aria-label="Main">{NAV.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>
      <Link href="/dashboard" className="header-cta">Send a shagun <ArrowUpRight size={17} aria-hidden="true" /></Link>
      <button className="menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close menu" : "Open menu"}>{open ? <X /> : <Menu />}</button>
    </div>
    {open && <nav className="mobile-menu" id="mobile-menu" aria-label="Mobile" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>{NAV.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>)}</nav>}
  </header>;
}
