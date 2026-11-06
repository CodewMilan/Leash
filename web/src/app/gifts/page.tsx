"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EXPLORER, type GiftOrder, type PublicPurchaseConfig } from "@/lib/purchase/model";
import { connectBrowserWallet, injectedWallet, payTestUsdc, walletError } from "@/lib/purchase/wallet";
import type { SandboxCard } from "@/lib/server/lithic";
import styles from "./recipient.module.css";

async function api(path: string, body?: Record<string, unknown>, method = body ? "POST" : "GET") {
  const response = await fetch(`/api/${path}`, { method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request failed. Refresh and try again.");
  return data;
}
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const statusLabel = { AWAITING_PAYMENT: "Awaiting payment", PAID: "Payment verified", CARD_READY: "Card issued" };
type CardView = { card: SandboxCard; dashboardUrl?: string | null };

export default function GiftsPage() {
  const [config, setConfig] = useState<PublicPurchaseConfig | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [orders, setOrders] = useState<GiftOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardView, setCardView] = useState<CardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recoveryHash, setRecoveryHash] = useState("");
  const lock = useRef(false);
  const order = orders.find(value => value.id === selectedId) || null;

  const mergeOrder = useCallback((value: GiftOrder) => {
    setOrders(current => [value, ...current.filter(item => item.id !== value.id)]);
    setSelectedId(value.id);
  }, []);
  const load = useCallback(async () => {
    const state = await api("wallet");
    setConfig(state.config); setWallet(state.wallet);
    if (state.wallet && state.config.configured) setOrders((await api("orders")).orders);
    else { setOrders([]); setSelectedId(null); setCardView(null); }
  }, []);
  useEffect(() => {
    let active = true;
    api("wallet").then(async state => {
      const result = state.wallet && state.config.configured ? await api("orders") : { orders: [] };
      if (!active) return;
      setConfig(state.config); setWallet(state.wallet); setOrders(result.orders);
    }).catch(failure => { if (active) setError(walletError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let provider;
    try { provider = injectedWallet(); } catch { return; }
    const changed = (...args: unknown[]) => {
      const addresses = args[0];
      if (!wallet || (Array.isArray(addresses) && typeof addresses[0] === "string" && same(addresses[0], wallet))) return;
      void api("wallet", undefined, "DELETE").then(() => {
        setWallet(null); setOrders([]); setSelectedId(null); setCardView(null);
        setNotice("Wallet account changed. Connect and sign in again.");
      }).catch(() => setError("Wallet changed. Reload and sign in again before continuing."));
    };
    provider.on?.("accountsChanged", changed);
    return () => provider.removeListener?.("accountsChanged", changed);
  }, [wallet]);
  async function run(label: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError(""); setNotice("");
    try { await work(); }
    catch (failure) { setError(walletError(failure)); }
    finally { lock.current = false; setBusy(""); }
  }
  async function connect() {
    await run("Confirm sign-in in your wallet…", async () => {
      const connection = await connectBrowserWallet();
      const challenge = await api("wallet", { action: "challenge", address: connection.address });
      const signature = await connection.signer.signMessage(challenge.message);
      await api("wallet", { action: "verify", nonce: challenge.nonce, signature });
      await load();
    });
  }
  async function checkPayment(value: GiftOrder, hash?: string) {
    const result = await api(`orders/${value.id}/payment`, { ...(hash ? { txHash: hash } : {}) });
    mergeOrder(result.order);
    setNotice(result.confirmed ? "Payment verified on Base Sepolia. The recipient can now issue the card." : "Waiting for the transaction and three confirmations. Check again shortly; don’t pay again.");
    if (result.confirmed) { try { localStorage.removeItem(`leash-payment-${value.id}`); } catch { /* Server already has the hash. */ } }
  }
  async function pay() {
    if (!order) return;
    await run("Confirm the test-USDC transfer in your wallet…", async () => {
      let pending = order.txHash;
      if (!pending) { try { pending = localStorage.getItem(`leash-payment-${order.id}`) || undefined; } catch { /* Wallet hash recovery remains available manually. */ } }
      if (pending) { await checkPayment(order, pending); return; }
      const hash = await payTestUsdc(order.buyer, order.treasury);
      // Persist immediately after broadcast. If the API fails, the exact hash can
      // be resubmitted after reload; no second payment is sent automatically.
      try { localStorage.setItem(`leash-payment-${order.id}`, hash); } catch { /* Also retain it in visible state. */ }
      mergeOrder({ ...order, txHash: hash }); setRecoveryHash(hash);
      setNotice(`Transaction submitted: ${hash}. Keep this hash if you reload.`);
      await checkPayment(order, hash);
    });
  }
  async function openOrder(value: GiftOrder) {
    setSelectedId(value.id); setCardView(null); setRecoveryHash(""); setError(""); setNotice("");
    if (wallet && same(value.recipient, wallet) && value.status !== "AWAITING_PAYMENT") {
      await run("Checking Lithic card…", async () => {
        const data = await api(`orders/${value.id}/card`);
        if (data.card) { setCardView(data); }
      });
    }
  }
  const recipient = !!wallet && !!order && same(order.recipient, wallet);
  const buyer = !!wallet && !!order && same(order.buyer, wallet);
  const step = cardView || order?.status === "CARD_READY" ? 3 : order?.status === "PAID" ? 2 : order ? 1 : 0;

  return <div className={styles.app}>
    <header className={styles.header}>
      <Link href="/gifts" className={styles.wordmark}>leash<span>gifts</span></Link>
      <div className={styles.headerActions}><span className={styles.demo}>Base Sepolia · Lithic sandbox</span>{wallet && <button disabled={!!busy} onClick={() => void run("Disconnecting…", async () => { await api("wallet", undefined, "DELETE"); await load(); })}>{short(wallet)} · Disconnect</button>}</div>
    </header>
    <main className={styles.main}>
      <div className={styles.intro}><h1>Pay with your wallet.<br />Give a little possibility.</h1><p>Buy a gift with test USDC. Its recipient connects their wallet and receives a provider-issued sandbox card.</p></div>
      <div className={styles.layout}>
        <aside className={styles.gift} aria-label="Testnet gift card purchase">
          <div className={styles.giftTop}><span>{order ? `Gift ${short(order.id)}` : "A gift, ready for someone"}</span><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 13h22v6H5zm3 6v10h16V19M16 13v16M16 13C5 13 7 2 12 5c3 2 4 8 4 8Zm0 0c11 0 9-11 4-8-3 2-4 8-4 8Z" stroke="currentColor" strokeWidth="1.5" /></svg></div>
          <div className={styles.amount}>100<span>test USDC · Base Sepolia</span></div>
          <blockquote>{order ? (recipient ? "This one’s for you." : "A little something, on its way.") : "For their next little adventure."}</blockquote>
          <div className={styles.giftBottom}><span>{order ? statusLabel[order.status] : "$100 sandbox card limit"}</span><span>No real money</span></div>
        </aside>
        <section className={styles.flow} aria-label="Buy a testnet gift card">
          <ol className={styles.steps}>{["Connect", "Pay USDC", "Verify", "Card ready"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={index <= step ? styles.activeStep : ""}><span>{index + 1}</span>{label}</li>)}</ol>
          <div className={styles.content}>
            {loading ? <p role="status">Loading your gifts…</p> : !config?.configured ? <>
              <h2>Finish checkout setup.</h2><p>The local server needs its testnet receiving address and Lithic sandbox credentials.</p>
              <ul>{config?.missing.map(name => <li key={name}><code>{name}</code></li>)}</ul>
              <button className={styles.primary} disabled={!!busy} onClick={() => void run("Checking setup…", load)}>Check configuration</button>
            </> : !wallet ? <>
              <h2>Your wallet. Their next adventure.</h2><p>Connect an EVM browser wallet, then sign a message to prove ownership. Sign-in doesn’t move money.</p>
              <button className={styles.primary} disabled={!!busy} onClick={() => void connect()}>Connect wallet <span aria-hidden="true">→</span></button>
              <p className={styles.note}>You’ll need 100 test USDC and Base Sepolia ETH for fees. Every transfer requires your wallet approval.</p>
              <div className={styles.faucets}><a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC ↗</a><a href="https://docs.base.org/base-chain/tools/network-faucets" target="_blank" rel="noreferrer">Get test ETH ↗</a></div>
            </> : !order ? <>
              <h2>Who’s the gift for?</h2><p>Buy it for yourself or enter another wallet. Only that recipient can generate and view its card.</p>
              <form onSubmit={event => { event.preventDefault(); const address = String(new FormData(event.currentTarget).get("recipient") || ""); void run("Preparing your gift…", async () => { const result = await api("orders", { recipient: address }); mergeOrder(result.order); setCardView(null); }); }}>
                <label className={styles.field}>Recipient wallet <span className={styles.optional}>(optional · defaults to your wallet)</span><input name="recipient" placeholder="0x…" autoComplete="off" maxLength={42} /></label>
                <div className={styles.identity}><span>Testnet purchase</span><strong>100 USDC</strong><span>Sandbox card limit</span><strong>$100 lifetime</strong></div>
                <button className={styles.primary} disabled={!!busy}>Prepare gift <span aria-hidden="true">→</span></button>
              </form>
            </> : <>
              <div className={styles.orderNav}><button onClick={() => { setSelectedId(null); setCardView(null); setNotice(""); setError(""); }} disabled={!!busy}>← Back to gifts</button><span>{statusLabel[order.status]}</span></div>
              {order.status === "AWAITING_PAYMENT" ? <>
                <h2>{buyer ? "Ready for your testnet payment." : "Waiting for the sender’s payment."}</h2>
                <p>The server verifies an exact 100 test-USDC transfer and three confirmations before unlocking card issuance.</p>
                <div className={styles.identity}><span>Recipient</span><strong title={order.recipient}>{short(order.recipient)}</strong><span>Network</span><strong>Base Sepolia only</strong><span>Receiving treasury</span><strong title={order.treasury}>{short(order.treasury)}</strong></div>
                {buyer && <>
                  <button className={styles.primary} disabled={!!busy} onClick={() => void pay()}>{order.txHash ? "Check submitted payment" : "Pay 100 test USDC"} <span aria-hidden="true">→</span></button>
                  <p className={styles.note}>No real USDC is accepted. Paying sends test tokens to the local testnet treasury, not directly to Lithic.</p>
                  <details className={styles.recovery}><summary>Already paid or replaced a transaction?</summary><p>Paste its hash to verify the payment without sending again.</p><label className={styles.field}>Transaction hash<input value={recoveryHash} onChange={event => setRecoveryHash(event.target.value)} placeholder="0x…" maxLength={66} /></label><button className={styles.secondary} disabled={!!busy || !/^0x[0-9a-fA-F]{64}$/.test(recoveryHash)} onClick={() => void run("Verifying payment…", () => checkPayment(order, recoveryHash))}>Verify this transaction</button></details>
                </>}
              </> : !recipient ? <>
                <h2>{order.status === "CARD_READY" ? "Your gift has been redeemed." : "Paid. Ready for your recipient."}</h2><p>The recipient should open this app, connect wallet <strong>{short(order.recipient)}</strong>, and find this gift in their list.</p><p className={styles.note}>Payment was made once by the sender. The recipient won’t be charged again.</p>
              </> : cardView ? <>
                <h2>Your Lithic card is ready.</h2><p>Your verified testnet purchase unlocked this provider-issued sandbox card.</p>
                <div className={styles.card}><div><strong>leash</strong><span>LITHIC · SANDBOX ONLY</span></div><p>•••• &nbsp; •••• &nbsp; •••• &nbsp; {cardView.card.lastFour}</p><div><span>VIRTUAL · {cardView.card.state}</span><span>{cardView.card.expMonth} / {cardView.card.expYear}</span></div></div>
                <div className={styles.balance}><span>Sandbox spending limit</span><strong>${(cardView.card.spendLimit / 100).toFixed(2)}</strong></div><p className={styles.note}>Limit period: {cardView.card.spendLimitDuration}. This is not a deposited cash balance.</p>
                {cardView.dashboardUrl && <a className={styles.primary} href={cardView.dashboardUrl} target="_blank" rel="noreferrer">View in Lithic ↗</a>}
                <button className={styles.secondary} disabled={!!busy} onClick={() => void openOrder(order)}>Refresh provider card</button>
              </> : <>
                <h2>Your payment is verified.</h2><p>Generate the gift’s Lithic sandbox virtual card. The server will recheck payment and reserve this gift before calling Lithic.</p>
                <form onSubmit={event => { event.preventDefault(); void run("Issuing with Lithic…", async () => { const data = await api(`orders/${order.id}/card`, {}, "POST"); setCardView(data); mergeOrder(data.order); }); }}>
                  <label className={styles.checkbox}><input type="checkbox" required disabled={!!busy} /> I understand this is a sandbox card for test spending only.</label>
                  <button className={styles.primary} disabled={!!busy}>Generate sandbox card <span aria-hidden="true">→</span></button>
                </form>
                <button className={styles.secondary} disabled={!!busy} onClick={() => void openOrder(order)}>Check status & recover existing card</button>
              </>}
              {order.txHash && <p className={styles.reference}>Payment receipt<br /><a href={`${EXPLORER}/tx/${order.txHash}`} target="_blank" rel="noreferrer">{short(order.txHash)} · View on BaseScan ↗</a></p>}
            </>}
          </div>
          <div role="status" aria-live="polite">{busy && <p className={styles.note}>{busy}</p>}{notice && <p className={styles.notice}>{notice}</p>}{error && <p className={styles.error}>{error}</p>}</div>
        </section>
      </div>
      {wallet && config?.configured && <section className={styles.inbox} aria-label="Your gifts">
        <div className={styles.inboxHeader}><h2>Your gifts</h2><div><button disabled={!!busy} onClick={() => void run("Refreshing gifts…", load)}>Refresh</button><button disabled={!!busy} onClick={() => { setSelectedId(null); setCardView(null); setError(""); }}>New gift</button></div></div>
        {!orders.length ? <p>No gifts yet. Prepare your first gift above, or ask a sender to use your connected wallet address.</p> : <ul>{orders.map(value => <li key={value.id}><button disabled={!!busy} onClick={() => void openOrder(value)} aria-pressed={selectedId === value.id}><span><strong>{same(value.recipient, wallet) ? "For you" : `To ${short(value.recipient)}`}</strong><small>{short(value.id)} · {same(value.buyer, wallet) ? "You bought this" : `From ${short(value.buyer)}`}</small></span><span>100 test USDC<small>{statusLabel[value.status]}</small></span></button></li>)}</ul>}
      </section>}
      <footer className={styles.footer}><p><strong>Testnet purchase · sandbox issuance.</strong> Wallet payments use Base Sepolia test USDC. Lithic issues sandbox cards independently; this does not convert crypto into card funds. No mainnet payments, live KYC or real-world card purchases are supported.</p><Link href="/sandbox">Operator sandbox</Link></footer>
    </main>
  </div>;
}
