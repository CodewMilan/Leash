import { Header } from "@/components/Header";
import { Claim } from "@/components/shagun/Claim";
import { notFound } from "next/navigation";
export const metadata = { title: "Gift receipt · Chinki", robots: { index: false, follow: false } };
export default async function ReceiptPage({ params }: { params: Promise<{ giftId: string }> }) {
  const { giftId } = await params;
  if (!/^0x[a-f0-9]{64}$/i.test(giftId)) notFound();
  return <><Header /><Claim giftId={giftId} receipt /></>;
}
