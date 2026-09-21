import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";

import { JsonLd } from "@/components/layout/json-ld";
import { ThemeScript } from "@/components/layout/theme-script";
import { siteJsonLd } from "@/lib/seo";
import {
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LOCALE,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

/**
 * Site-wide metadata. `metadataBase` is what turns every relative canonical
 * and Open Graph URL into an absolute one, so NEXT_PUBLIC_APP_URL must be the
 * real public origin in production. Public pages refine these values through
 * `pageMetadata()`; private pages inherit them and are never indexed anyway.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  category: "education",
  ...(SITE_AUTHOR.name
    ? {
        authors: [{ name: SITE_AUTHOR.name, ...(SITE_AUTHOR.url ? { url: SITE_AUTHOR.url } : {}) }],
        creator: SITE_AUTHOR.name,
        publisher: SITE_AUTHOR.name,
      }
    : { publisher: SITE_NAME }),
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: SITE_LOCALE === "en" ? "en_GB" : SITE_LOCALE,
    url: "/",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description:
      "Adaptive placement, spaced repetition, an AI conversation partner and exam preparation for advanced English learners.",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description:
      "Adaptive placement, spaced repetition, an AI conversation partner and exam preparation for advanced English learners.",
  },
  robots: {
    index: true,
    follow: true,
    // Let search engines and AI answer engines quote as much as they need:
    // a truncated snippet is how a product gets described wrongly.
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom must not be disabled — WCAG 2.1 SC 1.4.4 (Resize Text).
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a22" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={SITE_LOCALE}
      suppressHydrationWarning
      className={`${inter.variable} ${serif.variable}`}
    >
      <head>
        <ThemeScript />
        <JsonLd data={siteJsonLd()} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
