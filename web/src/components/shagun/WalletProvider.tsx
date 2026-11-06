"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { InjectedSenderProvider } from "./InjectedSenderProvider";

const PrivySenderProvider = dynamic(() => import("./SenderProvider"), { ssr: false });

/** One sender wallet connection for the whole site, so the header and the app share it. */
export function WalletProvider({ children }: { children: ReactNode }) {
  if (process.env.NEXT_PUBLIC_PRIVY_APP_ID)
    return <PrivySenderProvider>{children}</PrivySenderProvider>;
  return <InjectedSenderProvider>{children}</InjectedSenderProvider>;
}
