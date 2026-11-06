import type { Metadata } from "next";
import { Suspense } from "react";
import { Header } from "@/components/Header";
import { Dashboard } from "@/components/shagun/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard · Shagun",
  description: "Send a gift and follow its status from authorization through claim, payout, or return.",
};

export default function DashboardPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<div className="loading-block" aria-label="Loading" />}>
        <Dashboard />
      </Suspense>
    </>
  );
}
