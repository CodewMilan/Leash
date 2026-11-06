import { ArrowUpRight, Fingerprint, Gift, ShieldCheck } from "lucide-react";

export function Envelope({ tone = "pink", amount = "25", small = false }: { tone?: "pink" | "green" | "orange" | "lavender" | "blue"; amount?: string; small?: boolean }) {
  return <div className={`envelope-stage tone-${tone} ${small ? "is-small" : ""}`} aria-hidden="true">
    <div className="envelope-object"><div className="gift-note"><span className="note-label">A LITTLE SOMETHING FOR YOU</span><span className="note-amount">${amount}</span><span className="note-greeting">With love, from miles away.</span><span className="note-flower">✳</span></div><div className="envelope-back" /><div className="envelope-face"><span className="envelope-brand">shagun</span><span className="envelope-seal"><Gift size={24} strokeWidth={1.5} /></span><ArrowUpRight size={20} className="envelope-arrow" /></div><div className="envelope-fold" /></div>
  </div>;
}
export function GiftRail() {
  return <aside className="gift-rail" aria-label="How your gift travels"><div className="rail-title">GOOD WISHES, DELIVERED.</div><div className="rail-poster tone-pink"><span>01 / SEND</span><Gift size={64} strokeWidth={1} /><p>A little love.</p></div><div className="rail-poster tone-green"><span>02 / VERIFY</span><Fingerprint size={64} strokeWidth={1} /><p>One real human.</p></div><div className="rail-poster tone-lavender"><span>03 / RECEIVE</span><ArrowUpRight size={64} strokeWidth={1} /><p>Straight to UPI.*</p></div><div className="rail-bottom"><ShieldCheck size={16} /><span>* TEST PAYOUTS</span></div></aside>;
}
