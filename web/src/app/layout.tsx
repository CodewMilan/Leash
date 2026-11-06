import type { Metadata } from "next";
import { Geist_Mono, Urbanist } from "next/font/google";
import { WalletProvider } from "@/components/shagun/WalletProvider";
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
  title: "Shagun · A little gift. A lot of love.",
  description:
    "Send a Diwali gift in dollars without paying gas. The recipient claims it with a passkey as a sandbox virtual card, and the unspent balance comes back. Whitechain testnet, no real money.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${urbanist.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-full">
        <a className="skip-link" href="#main">Skip to content</a>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
