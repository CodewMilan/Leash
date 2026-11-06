import type { Metadata } from "next";
import { Geist_Mono, Urbanist } from "next/font/google";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Leash Gifts · A little gift. A world of possibilities.",
  description:
    "Receive a gift and explore redeeming it into a virtual card. An interactive demo with simulated funding and card issuance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${urbanist.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
