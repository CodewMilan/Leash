import { Header } from "@/components/Header";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Inside } from "@/components/landing/Inside";
import { Rail } from "@/components/landing/Rail";
import { Simulator } from "@/components/landing/Simulator";
import { SpendRules } from "@/components/landing/SpendRules";
import { Statement } from "@/components/landing/Statement";
import { UnderTheHood } from "@/components/landing/UnderTheHood";
import { UseCases } from "@/components/landing/UseCases";
import { WatchLive } from "@/components/landing/WatchLive";
import { WhoSigns } from "@/components/landing/WhoSigns";

export default function Home() {
  return (
    <>
      <Header />
      <Rail />
      <main className="border-grey-02 lg:mr-[var(--rail-w)] lg:ml-[var(--gutter)] lg:border-x">
        <Hero />
        <Simulator />
        <Statement />
        <UseCases />
        <HowItWorks />
        <UnderTheHood />
        <SpendRules />
        <WhoSigns />
        <Inside />
        <WatchLive />
        <Footer />
      </main>
    </>
  );
}
