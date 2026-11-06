"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PRODUCTS, priceCart, usd, type CartLine } from "@/lib/shop/catalog";
import type { ShopReceipt } from "@/lib/server/shop";
import type { ShopCardOption } from "@/lib/server/shop-access";
import styles from "./shop.module.css";

async function api(path: string, body?: unknown) {
  const response = await fetch(`/api/shop${path}`, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The shop request failed. Please try again.");
  return result;
}
const stateLabel: Record<ShopReceipt["status"], string> = { CREATED: "Ready to pay", AUTHORIZING: "Checking authorization", AUTHORIZED: "Authorized", CLEARING: "Checking settlement", PAID: "Paid in sandbox", DECLINED: "Not paid" };
const storageKey = "leash-shop-cart-v1";

export default function ShopPage() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cards, setCards] = useState<ShopCardOption[]>([]);
  const [source, setSource] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [history, setHistory] = useState<ShopReceipt[]>([]);
  const [active, setActive] = useState<ShopReceipt | null>(null);
  const [dashboard, setDashboard] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const cartTotal = cart.length ? priceCart(cart).total : 0;
  const quantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const unresolved = active && !["PAID", "DECLINED"].includes(active.status);

  function remember(order: ShopReceipt) {
    setActive(order); setHistory(current => [order, ...current.filter(item => item.id !== order.id)]);
    try { localStorage.setItem("leash-shop-last-order", order.id); } catch { /* Server orders are still recoverable. */ }
    if (order.status === "PAID") setCart([]);
  }
  async function load() {
    const data = await api("");
    const orders = data.authenticated ? (await api("/orders")).orders : [];
    setCards(data.cards); setSource(current => data.cards.some((card: ShopCardOption) => card.sourceId === current) ? current : data.cards[0]?.sourceId || "");
    setAuthenticated(data.authenticated); setDashboard(data.transactionDashboardUrl || null); setHistory(orders);
  }
  useEffect(() => {
    let alive = true;
    api("").then(async data => {
      const orders: ShopReceipt[] = data.authenticated ? (await api("/orders")).orders : [];
      if (!alive) return;
      setCards(data.cards); setSource(data.cards[0]?.sourceId || ""); setAuthenticated(data.authenticated); setDashboard(data.transactionDashboardUrl || null); setHistory(orders);
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (Array.isArray(stored) && stored.length) { priceCart(stored); setCart(stored.map(item => ({ sku: item.sku, quantity: item.quantity }))); }
        const last = orders.find(order => order.id === localStorage.getItem("leash-shop-last-order"));
        if (last) setActive(last);
      } catch { /* Ignore malformed local cart data; server pricing is authoritative. */ }
      const unresolvedOrder = orders.find(order => !["PAID", "DECLINED"].includes(order.status));
      if (unresolvedOrder) setActive(unresolvedOrder);
    }).catch(failure => { if (alive) setError(failure instanceof Error ? failure.message : "Could not connect to the sandbox shop."); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* Local persistence is optional. */ }
  }, [cart, loaded]);
  async function run(label: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError("");
    try { await work(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Something went wrong. Check this order before trying again."); }
    finally { lock.current = false; setBusy(""); }
  }
  function update(sku: string, delta: number) {
    if (busy || unresolved) return;
    setActive(null); setError("");
    setCart(current => {
      const found = current.find(item => item.sku === sku);
      const nextQuantity = (found?.quantity || 0) + delta;
      if (nextQuantity > 10 || nextQuantity < 0) return current;
      if (!found && nextQuantity) return [...current, { sku, quantity: nextQuantity }];
      return current.map(item => item.sku === sku ? { ...item, quantity: nextQuantity } : item).filter(item => item.quantity > 0);
    });
  }
  async function payExisting(order: ShopReceipt) {
    try {
      const result = await api(`/orders/${order.id}/pay`, {});
      remember(result.order);
    } catch (failure) {
      // A lost response is not a failed payment. Read status before displaying
      // recovery controls; never create a replacement order automatically.
      try {
        const recovered = (await api(`/orders/${order.id}`)).order;
        remember(recovered);
        if (recovered.status === "PAID" || recovered.status === "DECLINED") return;
      } catch { /* Keep the original order and expose only explicit recovery. */ }
      throw failure;
    }
  }
  async function checkout() {
    await run("Authorizing and settling with Lithic…", async () => {
      const { order } = await api("/orders", { sourceId: source, cart });
      remember(order);
      await payExisting(order);
    });
  }
  function newBag() {
    setActive(null); setCart([]); setError("");
    try { localStorage.removeItem("leash-shop-last-order"); } catch { /* Optional browser state. */ }
  }

  return <div className={styles.shop}>
    <div className={styles.environment}>A working sandbox store. Test payments only. No products will be shipped.</div>
    <header className={styles.header}>
      <Link className={styles.brand} href="/shop">Shagun<span>shop</span></Link>
      <nav aria-label="Store navigation"><a href="#collection">The collection</a><Link href="/dashboard">Send a Shagun</Link><a href="#bag">Bag <span>{quantity}</span></a></nav>
    </header>
    <main className={styles.main}>
      <section className={styles.intro}>
        <h1>Good things.<br /><span>For your everyday.</span></h1>
        <div><p>A fresh page. A long walk. A little refresh.<br />Put your gift card to good use.</p><a href="#collection">Explore the collection <span aria-hidden="true">↘</span></a></div>
      </section>
      <div className={styles.layout}>
        <section id="collection" className={styles.collection} aria-label="Product collection">
          <div className={styles.sectionHeading}><h2>The everyday collection</h2><span>03 essentials · USD</span></div>
          <div className={styles.products}>
            {PRODUCTS.map((product, index) => <article key={product.sku} className={styles.product}>
              <div className={styles.productImage} style={{ background: product.color }}><Image src={product.image} alt={product.name} width={1200} height={1800} sizes="(max-width: 600px) 90vw, (max-width: 1000px) 45vw, 23vw" priority={index === 0} /><span>{product.category}</span></div>
              <div className={styles.productTitle}><h3>{product.name}</h3><span>{usd(product.price)}</span></div>
              <p>{product.description}</p>
              <button disabled={!!busy || !!unresolved || (cart.find(item => item.sku === product.sku)?.quantity || 0) >= 10} onClick={() => update(product.sku, 1)} aria-label={`Add ${product.name} to bag`}>Add to bag <span aria-hidden="true">+</span></button>
            </article>)}
          </div>
          <div className={styles.about}><h2>A real checkout.<br />A safe place to try it.</h2><p>Choose something, pay with your Lithic sandbox card, and see an authorization followed by a settled transaction in your provider dashboard. Use the card from your claimed Shagun gift, with the purchase recorded by Lithic.</p></div>
        </section>
        <aside id="bag" className={styles.bag} aria-label="Shopping bag and checkout">
          {active ? <>
            <div className={styles.bagHeading}><h2>{active.status === "PAID" ? "Order placed." : active.status === "DECLINED" ? "Payment declined." : "Your order"}</h2><span>{stateLabel[active.status]}</span></div>
            <p className={styles.receiptIntro}>{active.status === "PAID" ? "Your sandbox purchase was approved and settled by Lithic. Nothing will be shipped." : active.status === "DECLINED" ? "The provider did not complete this purchase. No success has been assumed." : "This order is saved. Check the existing payment before starting another one."}</p>
            <ul className={styles.lines}>{active.items.map(item => <li key={item.sku}><span>{item.name}<small>Quantity {item.quantity}</small></span><strong>{usd(item.subtotal)}</strong></li>)}</ul>
            <div className={styles.total}><span>Total · USD</span><strong>{usd(active.total)}</strong></div>
            <dl className={styles.evidence}><div><dt>Paid with</dt><dd>•••• {active.lastFour}</dd></div><div><dt>Merchant</dt><dd>Shagun Shop</dd></div><div><dt>Provider status</dt><dd>{active.providerStatus || "Not confirmed"}</dd></div><div><dt>Result</dt><dd>{active.providerResult?.replaceAll("_", " ") || "Awaiting provider"}</dd></div></dl>
            {active.transactionToken && <p className={styles.reference}>Lithic transaction<br /><code>{active.transactionToken}</code></p>}
            <p className={styles.reference}>Order {active.id.slice(0, 8)}<br />Descriptor: {active.descriptor}</p>
            {(active.status === "CREATED" || active.status === "AUTHORIZED") && <button className={styles.pay} disabled={!!busy} onClick={() => void run("Completing this sandbox order…", () => payExisting(active))}>{active.status === "AUTHORIZED" ? "Settle authorized purchase" : "Pay this saved order"}</button>}
            <button className={styles.secondary} disabled={!!busy} onClick={() => void run("Checking Lithic payment status…", async () => remember((await api(`/orders/${active.id}`)).order))}>Refresh payment status</button>
            {dashboard && active.transactionToken && <a className={styles.secondary} href={dashboard} target="_blank" rel="noreferrer">View Lithic transactions ↗</a>}
            {["PAID", "DECLINED"].includes(active.status) && <button className={styles.secondary} disabled={!!busy} onClick={newBag}>{active.status === "PAID" || active.status === "DECLINED" ? "Start a new bag" : "Return to collection"}</button>}
          </> : <>
            <div className={styles.bagHeading}><h2>Your bag</h2><span>{quantity} {quantity === 1 ? "item" : "items"}</span></div>
            {!cart.length ? <div className={styles.empty}><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M10 17h28l3 25H7l3-25Zm7 2V12a7 7 0 0 1 14 0v7" stroke="currentColor" strokeWidth="1.5" /></svg><p>A little room for something good.</p><span>Pick an essential from the collection.</span></div> : <ul className={styles.lines}>{cart.map(item => {
              const product = PRODUCTS.find(product => product.sku === item.sku)!;
              return <li key={item.sku}><div><span>{product.name}</span><div className={styles.quantity}><button disabled={!!busy} aria-label={`Remove one ${product.name}`} onClick={() => update(item.sku, -1)}>−</button><span>{item.quantity}</span><button disabled={!!busy || item.quantity >= 10} aria-label={`Add one ${product.name}`} onClick={() => update(item.sku, 1)}>+</button></div></div><strong>{usd(product.price * item.quantity)}</strong></li>;
            })}</ul>}
            <div className={styles.delivery}><span>Delivery</span><span>Not shipped · sandbox</span></div>
            <div className={styles.total}><span>Total · USD</span><strong>{usd(cartTotal)}</strong></div>
            <label className={styles.cardLabel}>Pay with a sandbox card<select value={source} disabled={!loaded || !!busy || !cards.length} onChange={event => setSource(event.target.value)}><option value="" disabled>{!loaded ? "Checking your cards…" : "Select a sandbox card"}</option>{cards.map(card => <option key={card.sourceId} value={card.sourceId}>{card.label} · {card.state}</option>)}</select></label>
            {!cards.length && loaded && <p className={styles.loginNote}>{authenticated ? "No issued card is available in this session." : "Open your original Shagun claim link to access its card."} <Link href="/dashboard">Send a Shagun</Link>.</p>}
            <button className={styles.pay} disabled={!loaded || !!busy || !cart.length || !source} onClick={() => void checkout()}>Pay {usd(cartTotal)} in sandbox <span aria-hidden="true">→</span></button>
            <p className={styles.paymentNote}>Provider authorization + clearing. No real charge. No card number entered or exposed in this checkout.</p>
            <button className={styles.secondary} disabled={!!busy} onClick={() => void run("Refreshing available cards…", load)}>Refresh cards & orders</button>
          </>}
          <div role="status" aria-live="polite">{busy && <p className={styles.status}>{busy}</p>}{error && <p className={styles.error}>{error}</p>}</div>
        </aside>
      </div>
      {history.length > 0 && <section className={styles.history} aria-label="Your sandbox orders"><div className={styles.sectionHeading}><h2>Your orders</h2><span>Recorded on this server</span></div><ul>{history.map(order => <li key={order.id}><button disabled={!!busy} onClick={() => void run("Reading this order…", async () => remember((await api(`/orders/${order.id}`)).order))}><span>Order {order.id.slice(0, 8)}<small>{new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · •••• {order.lastFour}</small></span><span>{usd(order.total)}<small>{stateLabel[order.status]}</small></span></button></li>)}</ul></section>}
      <footer className={styles.footer}><Link className={styles.brand} href="/shop">Shagun<span>shop</span></Link><p>Illustrative products. Provider-recorded sandbox payments.<br />Lithic simulates merchant authorization and clearing; no merchant bank receives funds. This is not a Stripe/Razorpay test checkout.</p><Link href="/dashboard">Send a Shagun ↗</Link></footer>
    </main>
  </div>;
}
