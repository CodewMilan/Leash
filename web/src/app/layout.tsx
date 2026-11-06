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
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  openGraph: { title: "Chinki · Prepaid gift cards, paid in USDT", images: ["/brand/chinki-cover.png"] },
  icons: { icon: "/brand/chinki-rabbit.png", apple: "/brand/chinki-rabbit.png" },
  title: "Chinki · Prepaid gift cards, paid in USDT",
  description:
    "Pay in USDT without gas. The recipient claims a prepaid dollar gift card with a passkey, with no wallet or crypto, and the unspent balance comes back. Whitechain testnet and Lithic sandbox, no real money.",
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
