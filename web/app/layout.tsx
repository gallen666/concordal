import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Header from "./components/Header";
import { LanguageProvider } from "./lib/i18n";
import Footer from "./components/Footer";
import Analytics from "./components/Analytics";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://trading-agents-platform.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Concordal — Decision Support",
  description:
    "Five AI analysts debate every ticker — fundamentals + sentiment + news + technical + macro. " +
    "Real SEC EDGAR / Reddit / OpenBB data. Decision support, not investment advice.",
  // hreflang: the same content at the same URL, served in the language
  // chosen via the in-page LanguageProvider toggle. Both en and zh-CN
  // point at the same canonical because we don't fork URLs by locale.
  alternates: {
    canonical: "/",
    languages: {
      "en": "/",
      "zh-CN": "/",
    },
  },
  openGraph: {
    title: "Concordal — Multi-Agent AI Decision Support",
    description: "Five AI analysts debate every ticker. Real data, cross-validated.",
    url: SITE,
    siteName: "Concordal",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Concordal",
    description: "Multi-agent AI decision support for stocks + crypto.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen flex flex-col">
        <LanguageProvider>
          <Analytics />
          <Header />
          <main className="flex-1 w-full">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
