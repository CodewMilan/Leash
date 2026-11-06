import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { CardPhase0 } from "@/components/shagun/CardPhase0";

export const metadata = { title: "Sandbox card · Chinki", robots: { index: false, follow: false } };

export default function CardPhase0Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <><Header /><CardPhase0 /></>;
}
