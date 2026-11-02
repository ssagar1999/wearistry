import type { Metadata } from "next";
import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import BottomNav from "@/components/BottomNav";
import Header from "@/components/Header";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-newsreader" });
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "Wearistry (कथा) — Pre-loved fashion across India",
  description: "Buy, sell and exchange curated pre-loved clothing from Indian cities. Give good clothes another story.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <Header />
        <main className="mx-auto max-w-[1380px] px-4 md:px-8 lg:px-14 pb-20">{children}</main>
        <BottomNav />
        <footer className="border-t border-line py-10 pb-24 md:pb-10 text-center text-sm text-umber">
          © Wearistry · Made in India · All prices in ₹ · Domestic shipping only
        </footer>
      </body>
    </html>
  );
}
