"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SandboxCard } from "@/lib/server/lithic";
import styles from "./recipient.module.css";

type View = "loading" | "setup" | "signin" | "gift" | "review" | "pending" | "ready";
type CardResult = { card: SandboxCard | null; dashboardUrl?: string | null; error?: string };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/sandbox/${path}`, { ...init, cache: "no-store", headers: { "Content-Type": "application/json" } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The server could not complete this request.");
  return data;
}

async function loadSnapshot() {
  const session = await request("session");
  const result: CardResult | null = session.configured && session.authenticated ? await request("card") : null;
  return { session, result };
}

export default function GiftsPage() {
  const [view, setView] = useState<View>("loading");
  const [card, setCard] = useState<SandboxCard | null>(null);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const showCard = useCallback((data: CardResult) => {
    setCard(data.card);
    setDashboardUrl(data.dashboardUrl || null);
    setView(data.card ? "ready" : "gift");
  }, []);
  const applySnapshot = useCallback(({ session, result }: Awaited<ReturnType<typeof loadSnapshot>>) => {
    if (!session.configured) { setMissing(session.missing); setView("setup"); }
    else if (!session.authenticated) setView("signin");
    else if (result) showCard(result);
    setError("");
  }, [showCard]);
  const showFailure = useCallback((failure: unknown) => {
    setView("pending");
    setError(failure instanceof Error ? failure.message : "Could not check the sandbox card. Try again.");
  }, []);
  async function refresh() {
    try { applySnapshot(await loadSnapshot()); }
    catch (failure) { showFailure(failure); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    loadSnapshot().then(snapshot => { if (active) applySnapshot(snapshot); })
      .catch(failure => { if (active) showFailure(failure); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [applySnapshot, showFailure]);

  async function signIn(accessCode: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await request("session", { method: "POST", body: JSON.stringify({ accessCode }) });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Try again."); setBusy(false);
    }
  }
  async function issue() {
    if (busy) return;
    setBusy(true); setError(""); setView("pending");
    try { showCard(await request("card", { method: "POST" })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not complete issuance. Check status before retrying."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError("");
    try { await request("session", { method: "DELETE" }); setCard(null); setDashboardUrl(null); setView("signin"); }
    catch { setError("Could not sign out. Please try again."); }
    finally { setBusy(false); }
  }
  const step = view === "ready" ? 3 : view === "pending" ? 2 : view === "review" ? 1 : 0;
  const signedIn = ["gift", "review", "pending", "ready"].includes(view);

  return <div className={styles.app}>
    <header className={styles.header}>
      <Link href="/" className={styles.wordmark}>leash<span>gifts</span></Link>
      <span className={styles.demo}>Lithic sandbox</span>
    </header>
    <main className={styles.main}>
      <div className={styles.intro}>
        <h1>A little gift.<br />Your own virtual card.</h1>
        <p>Create a virtual card through Lithic’s sandbox API. Provider-issued test data, ready to inspect in your dashboard.</p>
      </div>
      <div className={styles.layout}>
        <aside className={styles.gift} aria-label="Received sample gift">
          <div className={styles.giftTop}>
            <span>From Milan, with love</span>
            <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 13h22v6H5zm3 6v10h16V19M16 13v16M16 13C5 13 7 2 12 5c3 2 4 8 4 8Zm0 0c11 0 9-11 4-8-3 2-4 8-4 8Z" stroke="currentColor" strokeWidth="1.5" /></svg>
          </div>
          <div className={styles.amount}>$100<span>Sample gift · USD reference value</span></div>
          <blockquote>“Something for your next adventure. Enjoy!”</blockquote>
          <div className={styles.giftBottom}><span>Gift #DEMO-001</span><span>Funding not connected</span></div>
        </aside>
        <section className={styles.flow} aria-label="Gift to sandbox card">
          <ol className={styles.steps}>
            {["Received", "Review", "Issuing", "Card ready"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={index <= step ? styles.activeStep : ""}><span>{index + 1}</span>{label}</li>)}
          </ol>
          <div className={styles.content}>
            {view === "loading" && <p role="status">Checking your sandbox connection…</p>}
            {view === "setup" && <>
              <h2>Connect your sandbox.</h2>
              <p>Set the following server environment variables and restart the app. No fake card will be generated.</p>
              <ul>{missing.map(name => <li key={name}><code>{name}</code></li>)}</ul>
              <button className={styles.primary} disabled={busy} onClick={() => { setBusy(true); void refresh(); }}>Check configuration</button>
            </>}
            {view === "signin" && <>
              <h2>Your gift is waiting.</h2>
              <p>Enter the local sandbox operator access code to create or recover this gift’s Lithic test card.</p>
              <form onSubmit={event => {
                event.preventDefault();
                const code = String(new FormData(event.currentTarget).get("accessCode") || "");
                event.currentTarget.reset(); void signIn(code);
              }}>
                <label className={styles.field}>Sandbox access code<input name="accessCode" type="password" autoComplete="current-password" required maxLength={512} /></label>
                <button className={styles.primary} disabled={busy}>{busy ? "Signing in…" : "Open received gift"}</button>
              </form>
              <p className={styles.note}>Configured as LITHIC_SANDBOX_ACCESS_CODE in web/.env.local. This protects the sandbox tools; it is not recipient identity verification.</p>
            </>}
            {view === "gift" && <>
              <h2>Turn this gift into a test card.</h2>
              <p>Generate one Lithic virtual card with a $100 lifetime spending limit. The card will appear in your Lithic sandbox.</p>
              <button className={styles.primary} disabled={busy} onClick={() => setView("review")}>Redeem to sandbox card <span aria-hidden="true">→</span></button>
              <p className={styles.note}>The received gift is a sample record. A spending limit does not deposit funds or prove crypto backing. No sender charge is made.</p>
            </>}
            {view === "review" && <>
              <h2>Ready to issue with Lithic.</h2>
              <p>The server will call Lithic’s sandbox API. No live customer verification or payment takes place.</p>
              <div className={styles.identity}><span>Provider</span><strong>Lithic sandbox</strong><span>Card type</span><strong>Virtual · multiple purchases</strong><span>Lifetime spending limit</span><strong>$100.00</strong></div>
              <form onSubmit={event => { event.preventDefault(); void issue(); }}>
                <label className={styles.checkbox}><input type="checkbox" required disabled={busy} /> I understand this creates a Lithic sandbox card, not a card for real purchases.</label>
                <button className={styles.primary} disabled={busy}>Generate Lithic sandbox card <span aria-hidden="true">→</span></button>
              </form>
            </>}
            {view === "pending" && <>
              <h2>{busy ? "Working with Lithic…" : "Let’s check your card status."}</h2>
              <p>{busy ? "The server is checking the provider and saving the gift’s card reference." : "If issuance was interrupted, the server looks for the same reserved card. It won’t issue a replacement after an uncertain result."}</p>
              <button className={styles.primary} disabled={busy} onClick={() => { setBusy(true); setError(""); void refresh(); }}>{busy ? "Please wait…" : "Check status & recover card"}</button>
            </>}
            {view === "ready" && card && <>
              <h2>Your Lithic card is ready.</h2>
              <p>Created through the provider API. Refresh reads its current status directly from Lithic.</p>
              <div className={styles.card}>
                <div><strong>leash</strong><span>LITHIC · SANDBOX ONLY</span></div>
                <p>•••• &nbsp; •••• &nbsp; •••• &nbsp; {card.lastFour}</p>
                <div><span>VIRTUAL · {card.state}</span><span>{card.expMonth} / {card.expYear}</span></div>
              </div>
              <div className={styles.balance}><span>Spending limit</span><strong>{money.format(card.spendLimit / 100)}</strong></div>
              <p className={styles.note}>Limit period: {card.spendLimitDuration}. This is not an available cash balance.</p>
              <p className={styles.reference}>Lithic card reference<br /><code>{card.token}</code></p>
              {dashboardUrl && <a className={styles.primary} href={dashboardUrl} target="_blank" rel="noreferrer">View card in Lithic <span aria-hidden="true">↗</span></a>}
              <button className={styles.secondary} disabled={busy} onClick={() => { setBusy(true); void refresh(); }}>{busy ? "Refreshing…" : "Refresh provider status"}</button>
              <p className={styles.note}>Inspect card details and test transactions in the Lithic dashboard. Full card numbers and security codes are never sent through this app.</p>
            </>}
          </div>
          <div role="status" aria-live="polite">{error && <p className={styles.error}>{error}</p>}</div>
        </section>
      </div>
      <footer className={styles.footer}>
        <p><strong>Real sandbox API · no real spending.</strong> Card issuance uses Lithic. The received gift is illustrative; wallet funding, crypto conversion and live KYC are not connected. One card is reserved on this server; signing out or clearing browser data does not reset it.</p>
        {signedIn && <button onClick={() => void signOut()} disabled={busy}>Sign out</button>}
      </footer>
    </main>
  </div>;
}
