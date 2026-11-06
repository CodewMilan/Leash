import { Gift, ArrowUpRight } from "lucide-react";

/** Application illustration, independent of the landing page's editorial components. */
export function AppEnvelope({ amount = "25" }: { amount?: string }) {
  return <div className="envelope-stage tone-pink is-small" aria-hidden="true"><div className="envelope-object"><div className="gift-note"><span className="note-label">A LITTLE SOMETHING FOR YOU</span><span className="note-amount">${amount}</span><span className="note-greeting">With love, from miles away.</span></div><div className="envelope-back" /><div className="envelope-face"><span className="envelope-brand">shagun</span><span className="envelope-seal"><Gift size={24} strokeWidth={1.5} /></span><ArrowUpRight size={20} className="envelope-arrow" /></div><div className="envelope-fold" /></div></div>;
}
