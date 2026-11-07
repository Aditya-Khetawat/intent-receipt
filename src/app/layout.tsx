import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "IntentReceipt",
  description: "Receipts for what the AI was asked to do. Signed intent records for agent-initiated PayPal orders, and an AI dispute analyst with verified evidence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 btn btn-secondary">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-line mt-16">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-3 flex flex-col sm:flex-row gap-2 justify-between">
            <span>Sandbox only. Seeded history and simulated disputes are labelled. No real money moves.</span>
            <span>
              IntentReceipt · MIT licensed · Fernhill Outfitters is fictional
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
