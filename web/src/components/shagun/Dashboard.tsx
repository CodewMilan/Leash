"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Copy, Download, Gift, LogOut, RefreshCw } from "lucide-react";
import { id, keccak256, randomBytes, hexlify } from "ethers";
import QRCode from "qrcode";
import { authorizationTypes, giftNonce, TOKEN_DOMAIN, ZeroHash, type GiftTerms } from "@/lib/chain";
import { inr, parseAmount, toPaise, tokenAmount } from "@/lib/amounts";
import { api } from "@/lib/client-api";
import type { AppStatus, GiftView } from "@/lib/types";
import { useSender } from "./SenderProvider";
import { AppEnvelope } from "./AppEnvelope";
import { EmptyGifts, ReceiptTimeline, ReturnNotice, SetupPanel, StatusBadge, TestBanner } from "./Shared";

const SenderProvider = dynamic(() => import("./SenderProvider"), { ssr: false, loading: () => <div className="loading-block" aria-label="Loading sender sign-in" /> });
export function Dashboard() { return <SenderProvider><SenderDashboard /></SenderProvider>; }
function SenderDashboard() {
  const sender = useSender();
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [amount, setAmount] = useState("25");
  const [label, setLabel] = useState("A little Diwali love");
  const [expiry, setExpiry] = useState("86400");
  const [campaign, setCampaign] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [gifts, setGifts] = useState<GiftView[]>([]);
  const [selected, setSelected] = useState<GiftView | null>(null);
  const [claimLink, setClaimLink] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [copied, setCopied] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const session = await api<{ sender: string | null }>("session");
      setFrom(session.sender);
      if (session.sender) {
        const result = await api<{ gifts: GiftView[] }>("gifts");
        setGifts(result.gifts); setHistoryError("");
        setSelected((current) => current ? result.gifts.find((g) => g.id === current.id) || current : null);
      }
    } catch (e) { setHistoryError(e instanceof Error ? e.message : "Could not refresh your gifts."); }
  }, []);
  useEffect(() => {
    api<AppStatus>("status").then(setStatus).catch(() => {});
    api<{ sender: string | null }>("session", {}).then((s) => { setFrom(s.sender); if (s.sender) void refresh(); }).catch(() => {});
    const initial = new URLSearchParams(window.location.search).get("amount");
    if (initial) { try { parseAmount(initial); queueMicrotask(() => setAmount(initial)); } catch { /* Fall back to the default. */ } }
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 8_000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (from) api<{ balance: string }>("balance").then((r) => setBalance(r.balance)).catch(() => setBalance(null));
  }, [from]);
  useEffect(() => {
    if (!selected?.createdTx || selected.status !== "sent") return;
    const secret = sessionStorage.getItem(`shagun-envelope:${selected.id}`);
    if (!secret) return;
    const link = `${window.location.origin}/claim/${selected.id}#${secret}`;
    queueMicrotask(() => setClaimLink(link));
    QRCode.toDataURL(link, { width: 240, margin: 2, errorCorrectionLevel: "M" }).then(setQr).catch(() => {});
  }, [selected?.id, selected?.createdTx, selected?.status]);
  async function connect() {
    setBusy("Connecting your account…"); setError("");
    try { const account = await sender.connect(); if (account) { setFrom(account); await refresh(); } }
    catch (e) { setError(e instanceof Error ? e.message : "Sign-in could not complete."); }
    finally { setBusy(""); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); setError(""); setClaimLink(""); setQr(""); setBusy("Preparing your gift…");
    try {
      if (!from || from !== sender.account) throw new Error("Sign in and confirm your sender account first.");
      const units = parseAmount(amount);
      if (balance !== null && BigInt(balance) < units) throw new Error("Your demo account needs more test dollars before you can send this gift.");
      const config = await api<{ vault: string }>("gift-config");
      const secret = hexlify(randomBytes(32));
      const terms: GiftTerms = { from, amount: String(units), expiry: Math.floor(Date.now() / 1000) + Number(expiry), secretHash: keccak256(secret), boundHuman: ZeroHash, campaignId: campaign.trim() ? id(campaign.trim().toLowerCase()) : ZeroHash, salt: hexlify(randomBytes(32)) };
      const nonce = giftNonce(config.vault, terms);
      const validAfter = 0, validBefore = Math.floor(Date.now() / 1000) + 300;
      // Keep the envelope key in this tab only; it is never included in API URL paths or analytics.
      sessionStorage.setItem(`shagun-envelope:${nonce}`, secret);
      setBusy("Confirm the gift in your account…");
      const signer = await sender.signer();
      const signature = await signer.signTypedData(TOKEN_DOMAIN, authorizationTypes, { from, to: config.vault, value: terms.amount, validAfter, validBefore, nonce });
      setBusy("Submitting your sponsored gift…");
      const gift = await api<GiftView>("gifts", { terms, validAfter, validBefore, signature, label });
      setSelected(gift); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Your gift could not be submitted."); }
    finally { setBusy(""); }
  }
  let estimate = "—";
  try { estimate = inr(toPaise(parseAmount(amount), status?.rate || "84.00")); } catch { /* Inline validation occurs on submission. */ }
  const signedIn = from !== null && from === sender.account;
  const canSend = signedIn && status?.services.filter((s) => ["Gift storage", "Whitechain"].includes(s.name)).every((s) => s.ready);
  return <main id="main" className="app-shell enter"><div className="eyebrow">YOUR GOOD WISHES, ALL IN ONE PLACE.</div><div className="app-heading"><div><h1>A little goes a long way.</h1><p>Send an envelope. Follow its journey. Make someone&apos;s day.</p></div><div className="session-info">{signedIn ? <><span className="mono">{from.slice(0, 6)}…{from.slice(-4)} · ${tokenAmount(balance)}</span><button className="button secondary small" aria-label="Sign out" onClick={async () => { try { await sender.logout(); setFrom(null); setGifts([]); setSelected(null); setClaimLink(""); setQr(""); Object.keys(sessionStorage).filter((k) => k.startsWith("shagun-envelope:")).forEach((k) => sessionStorage.removeItem(k)); } catch (e) { setError(e instanceof Error ? e.message : "Could not sign out."); } }}><LogOut size={16} /></button></> : <button className="button dark small" onClick={connect} disabled={!!busy || !sender.ready || !process.env.NEXT_PUBLIC_PRIVY_APP_ID}>{sender.authenticated ? "Confirm sender account" : "Sign in to send"}<ArrowUpRight size={16} /></button>}</div></div><TestBanner />
    <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><h2>Put a little love in it.</h2><Gift size={20} strokeWidth={1.5} /></div><form className="panel-body form-stack" onSubmit={send} aria-busy={!!busy}>
      <div><label className="field-label" htmlFor="gift-amount">GIFT AMOUNT · DOLLARS</label><input className="field-input large" id="gift-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required maxLength={10} /><div className="amount-presets mt-3">{["11", "25", "51", "101"].map((v) => <button type="button" key={v} aria-pressed={v === amount} onClick={() => setAmount(v)}>${v}</button>)}</div></div>
      <div><label className="field-label" htmlFor="gift-label">A NOTE FOR YOUR RECORDS</label><input className="field-input" id="gift-label" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} autoComplete="off" /></div>
      <div className="field-row"><div><label className="field-label" htmlFor="expiry">CLAIM WITHIN</label><select className="field-input" id="expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)}><option value="86400">24 hours</option><option value="259200">3 days</option><option value="604800">7 days</option><option value="300">5 minutes · return demo</option></select></div><div><label className="field-label" htmlFor="campaign">CAMPAIGN · OPTIONAL</label><input className="field-input" id="campaign" placeholder="e.g. diwali-2026" value={campaign} onChange={(e) => setCampaign(e.target.value)} maxLength={60} autoComplete="off" /></div></div>
      <p className="microcopy">Use the same campaign name across envelopes to allow one gift per verified human.</p>
      <div className="quote"><div><p>Indicative UPI test payout</p><strong className="mono">{estimate}</strong></div><div><p>Network fee for you</p><strong className="mono">$0.00</strong></div></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className="button primary full" disabled={!!busy || !canSend} type="submit">{busy || "Confirm & send gift"}<ArrowUpRight size={20} /></button>
      {!signedIn && <p className="microcopy">{process.env.NEXT_PUBLIC_PRIVY_APP_ID ? "Sign in above, then confirm your sender account to continue." : "Sender sign-in is being set up. You can preview an envelope while services are connected."}</p>}
      {busy && <p role="status" className="microcopy">{busy} Keep this tab open.</p>}
    </form></section>
    <div><section className="panel"><div className="panel-heading"><h2>{selected ? "Your gift&apos;s journey" : "Sealed with good wishes."}</h2>{selected && <StatusBadge gift={selected} />}</div>{selected ? <div className="panel-body"><p className="mono mb-4">${tokenAmount(selected.amount)}</p><ReceiptTimeline gift={selected} />{claimLink && selected.status === "sent" && <><div className="qr-wrap">{qr && <Image src={qr} alt="QR code to claim this gift" width={180} height={180} unoptimized />}</div><label className="field-label" htmlFor="claim-link">YOUR ENVELOPE LINK · KEEP PRIVATE</label><div className="claim-link"><input id="claim-link" className="field-input" value={claimLink} readOnly /><button className="button dark small" type="button" aria-label="Copy envelope link" onClick={async () => { try { await navigator.clipboard.writeText(claimLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Copy the envelope link from the field above."); } }}>{copied ? <Check size={18} /> : <Copy size={18} />}</button></div><p className="field-hint">Share privately, or write this URL to your NFC sticker. Save it before closing this tab.</p></>}{selected.error && <p role="alert" className="notice error mt-4">{selected.error}</p>}</div> : <><AppEnvelope amount={/^\d{1,3}$/.test(amount) ? amount : "25"} /><div className="panel-body"><ReturnNotice /></div></>}</section><SetupPanel status={status} /></div></div>
    <section className="panel history"><div className="panel-heading"><h2>Your envelopes</h2><div className="flex gap-2"><button className="button secondary small" aria-label="Refresh gifts" onClick={() => void refresh()}><RefreshCw size={16} /></button><a className="button secondary small" href={signedIn ? "/api/gifts/export" : undefined} aria-disabled={!signedIn}><Download size={16} /> CSV</a></div></div>{historyError && signedIn && <div className="notice error" role="alert">{historyError}</div>}{gifts.length === 0 ? <EmptyGifts /> : <div className="table-scroll"><table className="gift-table"><thead><tr><th>ENVELOPE</th><th>AMOUNT</th><th>STATUS</th><th>RECEIPT</th></tr></thead><tbody>{gifts.map((gift) => <tr key={gift.id}><td><button className="text-left" onClick={() => { setSelected(gift); setClaimLink(""); setQr(""); }}>{gift.label}<br /><small className="muted">{new Date(gift.createdAt).toLocaleDateString()}</small></button></td><td className="mono">${tokenAmount(gift.amount)}</td><td><StatusBadge gift={gift} /></td><td><Link href={`/gifts/${gift.id}`} aria-label={`View receipt for ${gift.label}`}><ArrowUpRight size={20} /></Link></td></tr>)}</tbody></table></div>}</section>
  </main>;
}
