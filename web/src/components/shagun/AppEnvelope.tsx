import { Gift, ArrowUpRight } from "lucide-react";
import { designById } from "@/lib/designs";

/** Application illustration, independent of the landing page's editorial components. */
export function AppEnvelope({
  amount = "25",
  design = "love",
  note,
}: {
  amount?: string;
  design?: string;
  note?: string;
}) {
  const d = designById(design);
  return (
    <div className={`envelope-stage ${d.tone} is-small`} aria-hidden="true">
      <div className="envelope-object">
        <div className="gift-note">
          <span className="note-label">{d.heading}</span>
          <span className="note-amount">${amount}</span>
          <span className="note-greeting">{note || d.greeting}</span>
        </div>
        <div className="envelope-back" />
        <div className="envelope-face">
          <span className="envelope-brand">chinki</span>
          <span className="envelope-seal">
            <Gift size={24} strokeWidth={1.5} />
          </span>
          <ArrowUpRight size={20} className="envelope-arrow" />
        </div>
        <div className="envelope-fold" />
      </div>
    </div>
  );
}
