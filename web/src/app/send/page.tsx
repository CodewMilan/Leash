import type { Metadata } from "next";
import { Suspense } from "react";
import { SendWidget } from "@/components/shagun/SendWidget";

export const metadata: Metadata = {
  title: "Send a Shagun",
  description: "Send a gift in dollars from any app. The recipient claims it with a passkey as a sandbox virtual card.",
  robots: { index: false },
};

export default function SendPage() {
  return (
    <Suspense fallback={<div className="loading-block" aria-label="Loading" />}>
      <SendWidget />
    </Suspense>
  );
}
