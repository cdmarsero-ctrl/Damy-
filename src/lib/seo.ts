import type { Metadata } from "next";

import {
  absoluteUrl,
  findPublicPage,
  SITE_AUTHOR,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LOCALE,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  SOURCE_REPOSITORY,
} from "./site";
import { FAQ, type FaqItem } from "./site-content";

/** Served by src/app/opengraph-image.tsx. */
export const OG_IMAGE_PATH = "/opengraph-image";

/**
 * Per-page metadata for a public page: title, description, canonical URL and
 * Open Graph / Twitter cards, all derived from the PUBLIC_PAGES registry so a
 * page cannot ship without them.
 */
export function pageMetadata(path: string, overrides: Metadata = {}): Metadata {
  const page = findPublicPage(path);
  if (!page) throw new Error(`pageMetadata: ${path} is not registered in PUBLIC_PAGES`);

  const isHome = path === "/";
  const title = isHome ? `${SITE_NAME} — ${SITE_TAGLINE}` : page.title;
  const description = page.description;
  const url = absoluteUrl(path);
  // A page-level `openGraph` replaces the layout's whole object, including the
  // image the opengraph-image.tsx convention attaches there — so it is named
  // explicitly, or link previews silently lose their card.
  const images = [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: `${SITE_NAME} — ${SITE_TAGLINE}` }];

  return {
    title: isHome ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: SITE_NAME,
      locale: SITE_LOCALE === "en" ? "en_GB" : SITE_LOCALE,
      title: isHome ? title : `${page.title} · ${SITE_NAME}`,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: isHome ? title : `${page.title} · ${SITE_NAME}`,
      description,
      images,
    },
    ...overrides,
  };
}

/* ----------------------------------------------------------------- JSON-LD */

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#application`;

function author() {
  if (!SITE_AUTHOR.name) return undefined;
  return {
    "@type": "Person",
    name: SITE_AUTHOR.name,
    ...(SITE_AUTHOR.url ? { url: SITE_AUTHOR.url } : {}),
    ...(SITE_AUTHOR.email ? { email: SITE_AUTHOR.email } : {}),
    ...(SITE_AUTHOR.sameAs.length ? { sameAs: SITE_AUTHOR.sameAs } : {}),
  };
}

/** Site-wide graph: the organisation, the website and its search-free
 *  navigation. Emitted once, from the root layout. */
export function siteJsonLd() {
  const person = author();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: {
          "@type": "ImageObject",
          url: absoluteUrl("/icons/icon-512.svg"),
        },
        description: SITE_DESCRIPTION,
        ...(SITE_AUTHOR.email ? { email: SITE_AUTHOR.email } : {}),
        ...(SITE_AUTHOR.sameAs.length ? { sameAs: SITE_AUTHOR.sameAs } : {}),
        ...(person ? { founder: person } : {}),
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        description: SITE_DESCRIPTION,
        inLanguage: SITE_LOCALE,
        publisher: { "@id": ORGANIZATION_ID },
      },
    ],
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "WebApplication"],
    "@id": APP_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    description: SITE_DESCRIPTION,
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "Language learning",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires JavaScript. Speech features use the Web Speech API.",
    inLanguage: SITE_LOCALE,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    keywords: SITE_KEYWORDS.join(", "),
    featureList: [
      "Adaptive placement test (item-response theory)",
      "Personalised learning paths for CEFR B2, C1 and C2",
      "Fifteen exercise types",
      "Spaced repetition (SM-2 with learning steps)",
      "AI conversation partner and debate opponent",
      "Writing studio with banded feedback",
      "Pronunciation lab (on-device speech recognition)",
      "IELTS, TOEFL, Cambridge C1 Advanced and C2 Proficiency exam modules",
      "Analytics and weekly report",
      "Offline study",
      "WCAG 2.1 AA accessibility",
    ],
    educationalLevel: ["CEFR B2", "CEFR C1", "CEFR C2"],
    teaches: "Advanced English: register, connotation, idiom, academic and professional writing, exam technique",
    publisher: { "@id": ORGANIZATION_ID },
    ...(SOURCE_REPOSITORY ? { codeRepository: SOURCE_REPOSITORY } : {}),
  };
}

export function webPageJsonLd(path: string) {
  const page = findPublicPage(path);
  if (!page) throw new Error(`webPageJsonLd: ${path} is not registered in PUBLIC_PAGES`);
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${absoluteUrl(path)}#webpage`,
    url: absoluteUrl(path),
    name: `${page.title} · ${SITE_NAME}`,
    description: page.description,
    inLanguage: SITE_LOCALE,
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": APP_ID },
  };
}

export function breadcrumbJsonLd(path: string) {
  const page = findPublicPage(path);
  if (!page) throw new Error(`breadcrumbJsonLd: ${path} is not registered in PUBLIC_PAGES`);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: page.title, item: absoluteUrl(path) },
    ],
  };
}

export function faqJsonLd(items: readonly FaqItem[] = FAQ) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${absoluteUrl("/faq")}#faq`,
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
