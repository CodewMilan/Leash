import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { MerchantSetup } from "@/components/wallet/MerchantSetup";

export const metadata: Metadata = {
  title: "For merchants · Leash",
  description: "Connect your Hedera wallet and start receiving USDC from Leash devices over x402.",
};

export default function MerchantPage() {
  return (
    <>
      <Header />
      <main className="min-h-[calc(100dvh-var(--header-h))] border-grey-02 lg:mx-[var(--gutter)] lg:border-x">
        <MerchantSetup />
      </main>
    </>
  );
}
