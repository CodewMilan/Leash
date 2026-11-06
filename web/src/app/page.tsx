import { Header } from "@/components/Header";

export default function Home() {
  return (
    <>
      <Header />
      <main className="min-h-[calc(100dvh-var(--header-h))] border-grey-02 px-[15px] py-16 lg:mx-[var(--gutter)] lg:border-x lg:px-10">
        <h1 className="display-1">Shagun</h1>
        <p className="mt-6 max-w-[36rem] text-[18px] leading-snug text-grey-04">
          Send a Diwali gift in dollars. The recipient claims it with their phone and receives rupees in UPI.
          Unclaimed gifts return to the sender.
        </p>
      </main>
    </>
  );
}
