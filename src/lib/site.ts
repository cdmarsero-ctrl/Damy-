/**
 * Site identity — the single source of truth for everything that tells the
 * outside world what this site is: HTML metadata, Open Graph, JSON-LD,
 * robots.txt, sitemap.xml and the llms.txt files that AI crawlers read.
 *
 * Everything here is safe to import from the Edge runtime (middleware) and
 * from client components: it reads only NEXT_PUBLIC_* variables and has no
 * server-only dependencies.
 */

export const SITE_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Lexicon";

/** Canonical origin, without a trailing slash. Every absolute URL — canonical
 *  links, the sitemap, JSON-LD — derives from this, so in production it must be
 *  the real public origin (https://…), not localhost. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export const SITE_TAGLINE = "Advanced English, B2 to C2";
/** The tagline mid-sentence: "Lexicon — advanced English, B2 to C2." */
export const SITE_TAGLINE_LOWER = SITE_TAGLINE.charAt(0).toLowerCase() + SITE_TAGLINE.slice(1);

export const SITE_DESCRIPTION =
  "Lexicon is an adaptive, AI-powered platform for advanced English learners at CEFR B2, C1 and C2: adaptive placement, spaced repetition, an AI conversation and debate partner, banded writing feedback, pronunciation scoring and IELTS, TOEFL and Cambridge exam preparation.";

export const SITE_KEYWORDS = [
  "advanced English",
  "English C1",
  "English C2",
  "English B2",
  "CEFR",
  "IELTS preparation",
  "TOEFL preparation",
  "Cambridge C1 Advanced",
  "Cambridge C2 Proficiency",
  "spaced repetition English",
  "adaptive placement test",
  "AI English tutor",
  "academic English",
  "professional English",
  "English idioms",
  "English pronunciation practice",
  "English writing feedback",
];

export const SITE_LOCALE = "en";

/** The person or organisation behind the site. Filled from environment
 *  variables so a fork can rebrand without touching code; every field is
 *  optional and simply omitted from the output when blank. */
export const SITE_AUTHOR = {
  name: (process.env.NEXT_PUBLIC_AUTHOR_NAME || "").trim(),
  url: (process.env.NEXT_PUBLIC_AUTHOR_URL || "").trim(),
  email: (process.env.NEXT_PUBLIC_CONTACT_EMAIL || "").trim(),
  /** Comma-separated list of profile URLs (GitHub, LinkedIn, X, …). Feeds the
   *  `sameAs` property in JSON-LD, which is how AI search engines link a site
   *  to the profiles they already know about. */
  sameAs: (process.env.NEXT_PUBLIC_SOCIAL_LINKS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^https?:\/\//.test(value)),
};

export const SOURCE_REPOSITORY = (process.env.NEXT_PUBLIC_SOURCE_URL || "").trim();

export interface PublicPage {
  /** Path from the site root, always starting with "/". */
  path: string;
  /** Short title, used in navigation, the sitemap and llms.txt. */
  title: string;
  /** One sentence: what the page tells a visitor or a crawler. */
  description: string;
  /** Show in the public header. The rest still appear in the footer,
   *  sitemap and llms.txt. */
  nav?: boolean;
  /** Sitemap hints. */
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
}

/**
 * Every page a visitor can read without signing in.
 *
 * The middleware lets these through unauthenticated, the sitemap lists them,
 * llms.txt links them, and the header and footer are built from them — so
 * adding a public page is a matter of adding a row here and a route.
 */
export const PUBLIC_PAGES: readonly PublicPage[] = [
  {
    path: "/",
    title: "Home",
    description: `${SITE_NAME}: an adaptive, AI-powered platform for mastering English at CEFR B2, C1 and C2.`,
    priority: 1,
    changeFrequency: "weekly",
  },
  {
    path: "/about",
    title: "About",
    description: `What ${SITE_NAME} is, who it is for, the thinking behind it and how to get in touch.`,
    nav: true,
    priority: 0.9,
    changeFrequency: "monthly",
  },
  {
    path: "/features",
    title: "Features",
    description:
      "Adaptive placement, spaced repetition, an AI conversation and debate partner, writing studio, pronunciation lab, exam preparation, analytics and offline study.",
    nav: true,
    priority: 0.9,
    changeFrequency: "monthly",
  },
  {
    path: "/levels",
    title: "Levels",
    description:
      "What CEFR B2, C1 and C2 mean in practice, where learners at each level plateau, and what Lexicon works on at each one.",
    nav: true,
    priority: 0.8,
    changeFrequency: "monthly",
  },
  {
    path: "/how-it-works",
    title: "How it works",
    description:
      "The placement engine, the spaced-repetition scheduler, how AI feedback is produced and checked, and what happens offline.",
    nav: true,
    priority: 0.8,
    changeFrequency: "monthly",
  },
  {
    path: "/exam-preparation",
    title: "Exam preparation",
    description:
      "Timed IELTS, TOEFL, Cambridge C1 Advanced and C2 Proficiency modules with indicative score conversion.",
    nav: true,
    priority: 0.8,
    changeFrequency: "monthly",
  },
  {
    path: "/faq",
    title: "FAQ",
    description: `Answers to the questions people ask before they start with ${SITE_NAME}: levels, the placement test, AI, pricing, privacy and offline use.`,
    nav: true,
    priority: 0.7,
    changeFrequency: "monthly",
  },
  {
    path: "/login",
    title: "Sign in",
    description: `Sign in to ${SITE_NAME}.`,
    priority: 0.3,
    changeFrequency: "yearly",
  },
  {
    path: "/register",
    title: "Create an account",
    description: `Create a free ${SITE_NAME} account and take the adaptive placement test.`,
    priority: 0.5,
    changeFrequency: "yearly",
  },
];

/** Machine-readable resources that are public but do not belong in the
 *  sitemap or the navigation. The middleware must let these through too. */
export const PUBLIC_RESOURCE_PATHS = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/opengraph-image",
  "/manifest.webmanifest",
  "/offline",
] as const;

/** Route prefixes that must never be crawled or indexed: everything behind the
 *  session cookie, and the API. Shared by robots.txt and the response headers. */
export const PRIVATE_PATH_PREFIXES = [
  "/api/",
  "/dashboard",
  "/onboarding",
  "/placement",
  "/path",
  "/lesson",
  "/review",
  "/lexicon",
  "/tutor",
  "/debate",
  "/writing",
  "/pronunciation",
  "/exams",
  "/achievements",
  "/leaderboard",
  "/analytics",
  "/settings",
  "/offline",
] as const;

/** Absolute URL for a site path. Accepts "/about" or "about". */
export function absoluteUrl(path = "/"): string {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return normalised === "/" ? `${SITE_URL}/` : `${SITE_URL}${normalised}`;
}

export function findPublicPage(path: string): PublicPage | undefined {
  return PUBLIC_PAGES.find((page) => page.path === path);
}

/** Pages worth showing to a human in the header. */
export const NAV_PAGES = PUBLIC_PAGES.filter((page) => page.nav);
