import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Live log · Leash",
  description: "Every Leash payment, its HashScan receipt and its 0G request ID, read live from Hedera.",
};

export default function DashboardPage() {
  return (
    <>
      <Header />
      <main className="min-h-[calc(100dvh-var(--header-h))] border-grey-02 lg:mx-[var(--gutter)] lg:border-x">
        <Dashboard />
      </main>
    </>
  );
}
