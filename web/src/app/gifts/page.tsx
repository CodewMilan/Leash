"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { completeGift, initialGift, parseGift, purchaseGift, redeemGift, storageKey, type GiftDemo } from "@/lib/gift-demo";
import styles from "./recipient.module.css";

const changeEvent = "leash:gift-demo-change";

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, listener);
  };
}

function getSnapshot(): string | null | undefined {
  try { return localStorage.getItem(storageKey); }
  catch { return "storage-unavailable"; }
}

function getServerSnapshot(): undefined { return undefined; }

export default function GiftsPage() {
  const rawGift = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const loaded = rawGift !== undefined;
  let gift = initialGift;
  let storageError = "";
  try { gift = parseGift(rawGift ?? null); }
  catch { storageError = "Saved demo data could not be read. Enable browser storage or reset the demo to continue."; }
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timeout, setTimeoutDemo] = useState(false);
  const lock = useRef(false);
  function save(next: GiftDemo) {
    localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(changeEvent));
  }
  async function issue() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError("");
    try {
      // Re-read persisted state so a stale view cannot issue a second demo card.
      const current = parseGift(localStorage.getItem(storageKey));
      const pending = redeemGift(current);
      save(pending);
      await new Promise(resolve => window.setTimeout(resolve, 900));
      if (timeout) { setError("The demo provider timed out. Your gift is reserved. Check status to recover the same card."); return; }
      save(completeGift(pending));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save the demo. Enable browser storage and try again."); }
    finally { lock.current = false; setBusy(false); }
  }
  function reconcile() {
    try { save(completeGift(parseGift(localStorage.getItem(storageKey)))); setError(""); }
    catch { setError("Could not recover the demo card. Try reloading this page."); }
  }
  function reset() {
    try { save({ ...initialGift }); setSignedIn(false); setError(""); setTimeoutDemo(false); }
    catch { setError("Browser storage is unavailable. Enable it and try again."); }
  }
  const step = gift.stage === "received" ? 0 : gift.stage === "ready" ? 3 : gift.stage === "provisioning" ? 2 : 1;
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  return <div className={styles.app}>
    <header className={styles.header}><Link href="/" className={styles.wordmark}>leash<span>gifts</span></Link><span className={styles.demo}>Interactive demo</span></header>
    <main className={styles.main}>
      <div className={styles.intro}><h1>A little gift.<br />A world of possibilities.</h1><p>Milan sent you something good. Turn your gift into a virtual card, in a few simple steps.</p></div>
      <div className={styles.layout}>
        <aside className={styles.gift} aria-label="Your received demo gift">
          <div className={styles.giftTop}><span>From Milan, with love</span><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 13h22v6H5zm3 6v10h16V19M16 13v16M16 13C5 13 7 2 12 5c3 2 4 8 4 8Zm0 0c11 0 9-11 4-8-3 2-4 8-4 8Z" stroke="currentColor" strokeWidth="1.5" /></svg></div>
          <div className={styles.amount}>$100<span>USD gift value</span></div>
          <blockquote>“Something for your next adventure. Enjoy!”</blockquote>
          <div className={styles.giftBottom}><span>Gift #DEMO-001</span><span>Illustrative funds</span></div>
        </aside>
        <section className={styles.flow} aria-label="Redeem your gift">
          <ol className={styles.steps}>{["Received", "Onboarding", "Issuing", "Card ready"].map((label, i) => <li key={label} aria-current={step === i ? "step" : undefined} className={i <= step ? styles.activeStep : ""}><span>{i + 1}</span>{label}</li>)}</ol>
          {!loaded ? <p role="status">Loading your gift…</p> : storageError ? <div className={styles.content}><h2>Let’s recover your demo.</h2><p>{storageError}</p></div> : !signedIn ? <div className={styles.content}><h2>Your gift is waiting.</h2><p>No crypto knowledge needed. Enter the recipient demo to see your gift and try redemption.</p><button className={styles.primary} onClick={() => setSignedIn(true)}>Enter recipient demo <span aria-hidden="true">→</span></button><p className={styles.note}>Demo recipient: Alex. No account is created and no real authentication takes place.</p></div>
          : gift.stage === "received" ? <div className={styles.content}><h2>Hi Alex. This one’s yours.</h2><p>Your $100 gift is ready to redeem. Create one virtual card for this gift and spend its balance over multiple purchases.</p><button className={styles.primary} onClick={() => { try { save({ ...gift, stage: "onboarding" }); } catch { setError("Enable browser storage to continue."); } }}>Redeem to virtual card <span aria-hidden="true">→</span></button><p className={styles.note}>The gift is already funded in this demo. Milan won’t be charged again.</p></div>
          : gift.stage === "onboarding" ? <div className={styles.content}><h2>Let’s get your card ready.</h2><p>Live cards require provider onboarding and identity verification. This demo uses a fictional recipient; please don’t enter personal documents.</p><form onSubmit={e => { e.preventDefault(); void issue(); }}><div className={styles.identity}><span>Demo cardholder</span><strong>Alex Morgan</strong><span>Verification</span><strong>Simulated approval</strong></div><label className={styles.checkbox}><input type="checkbox" required /> I understand this is a demo card with no real spending capability.</label><label className={styles.checkbox}><input type="checkbox" checked={timeout} onChange={e => setTimeoutDemo(e.target.checked)} /> Simulate a provider timeout to test recovery</label><button className={styles.primary} disabled={busy}>Generate demo virtual card <span aria-hidden="true">→</span></button></form></div>
          : gift.stage === "provisioning" ? <div className={styles.content}><h2>{busy ? "Preparing your card…" : "Your gift is safely reserved."}</h2><p>{busy ? "Reserving this gift and creating its demo card." : "Check the provider status to finish this redemption. We’ll recover the same card, without charging or redeeming again."}</p><button className={styles.primary} disabled={busy} onClick={reconcile}>{busy ? "Generating…" : "Check status & recover card"}</button></div>
          : <div className={styles.content}><h2>Your next adventure is ready.</h2><p>One gift. One virtual card. Your remaining balance stays available for future purchases.</p><div className={styles.card}><div><strong>leash</strong><span>DEMO · NOT FOR PAYMENT</span></div><p>•••• &nbsp; •••• &nbsp; •••• &nbsp; 0001</p><div><span>ALEX MORGAN</span><span>Virtual gift card</span></div></div><div className={styles.balance}><span>Available demo balance</span><strong>{money.format(gift.balance / 100)}</strong></div><button className={styles.primary} disabled={gift.spent} onClick={() => { try { save(purchaseGift(parseGift(localStorage.getItem(storageKey)))); } catch { setError("Purchase unavailable. Reload to refresh your balance."); } }}>{gift.spent ? "Demo purchase completed" : "Simulate a $25 purchase"}</button>{gift.spent && <p className={styles.note}>Demo store · $25.00 · Simulated purchase. No money moved.</p>}<p className={styles.note}>This gift has been redeemed. A second card cannot be generated in this demo.</p></div>}
          <div role="status" aria-live="polite">{error && <p className={styles.error}>{error}</p>}</div>
        </section>
      </div>
      <footer className={styles.footer}><p><strong>Demo mode.</strong> Gift funding, recipient login, onboarding, card issuance and purchases are simulated locally. Bridge and Stripe are not connected. No real card details are generated.</p><button onClick={reset} disabled={!loaded || busy}>Reset demo</button></footer>
    </main>
  </div>;
}
