import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { InlineScript } from "@/components/InlineScript";
import { MotionProvider } from "@/components/motion";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "IntentReceipt · Accountability for agentic commerce on PayPal",
  description:
    "Receipts for what the AI was asked to do. Signed intent records for agent-initiated PayPal orders, and an AI dispute analyst with verified evidence.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#121417" },
  ],
};

// Runs before paint so the saved or system theme never flashes (no hydration mismatch:
// React does not own data-theme). A saved choice wins; otherwise follow the OS live.
const themeScript = `(function(){try{var d=document.documentElement,m=matchMedia('(prefers-color-scheme: dark)');function a(){var s=localStorage.getItem('ir-theme');d.dataset.theme=s==='light'||s==='dark'?s:(m.matches?'dark':'light')}a();m.addEventListener('change',a)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body className="min-h-full flex flex-col">
        <MotionProvider>
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
              <span>IntentReceipt · MIT licensed · Fernhill Outfitters is fictional</span>
            </div>
          </footer>
        </MotionProvider>
      </body>
    </html>
  );
}
