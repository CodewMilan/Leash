import type { Metadata } from "next";
import { Suspense } from "react";
import { SendWidget } from "@/components/shagun/SendWidget";

export const metadata: Metadata = {
  title: "Send a Chinki",
  description: "Send a prepaid gift card from any app, paid in USDT. The recipient claims it with a passkey as a sandbox prepaid card.",
  robots: { index: false },
};

export default function SendPage() {
  return (
    <Suspense fallback={<div className="loading-block" aria-label="Loading" />}>
      <SendWidget />
    </Suspense>
  );
}
