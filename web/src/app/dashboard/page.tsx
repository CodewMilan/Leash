import type { Metadata } from "next";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Dashboard · Shagun",
  description: "Send a gift and follow its status from authorization through claim, payout, or return.",
};

export default function DashboardPage() {
  return (
    <>
      <Header />
      <main className="min-h-[calc(100dvh-var(--header-h))] border-grey-02 px-[15px] py-16 lg:mx-[var(--gutter)] lg:border-x lg:px-10">
        <h1 className="text-[40px] tracking-[-0.04em]">Dashboard</h1>
        <p className="mt-4 max-w-[36rem] text-[18px] leading-snug text-grey-04">
          Gift status will show here once a gift is authorized.
        </p>
      </main>
    </>
  );
}
