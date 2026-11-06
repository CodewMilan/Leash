import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { FundLeash } from "@/components/wallet/FundLeash";

export const metadata: Metadata = {
  title: "Fund your Leash · Leash",
  description: "Send USDC and HBAR to your Leash device from your own Hedera wallet.",
};

export default function FundPage() {
  return (
    <>
      <Header />
      <main className="min-h-[calc(100dvh-var(--header-h))] border-grey-02 lg:mx-[var(--gutter)] lg:border-x">
        <FundLeash />
      </main>
    </>
  );
}
