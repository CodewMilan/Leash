import type { ReactNode } from "react";

/** Mono tag sitting on a full-width rule, used at the top of every section. */
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-end border-b border-grey-02 ${className}`}>
      <span className="tag">{children}</span>
    </div>
  );
}
