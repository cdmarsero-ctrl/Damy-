import type { MetadataRoute } from "next";

import { absoluteUrl, PRIVATE_PATH_PREFIXES } from "@/lib/site";

/**
 * Crawler policy.
 *
 * The public pages are open to every crawler, and the AI crawlers are named
 * explicitly rather than left to the wildcard: several of them honour only a
 * rule addressed to them by name, and an operator reading this file should
 * see at a glance that AI indexing is a decision, not an oversight.
 *
 * Everything behind the session cookie is disallowed. Those routes would
 * only redirect a crawler to /login anyway, but saying so here keeps
 * `?next=/dashboard` login URLs out of the index.
 */

/** Crawlers operated by AI search engines and assistants. Reviewed against
 *  each operator's published documentation; see docs/AI-DISCOVERABILITY.md. */
export const AI_CRAWLERS = [
  // OpenAI — ChatGPT search, browsing, and training
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  // Anthropic — Claude
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  // Google — Gemini and AI Overviews (Google-Extended governs Gemini training)
  "Googlebot",
  "Google-Extended",
  // Microsoft — Bing and Copilot
  "Bingbot",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Apple — Siri and Apple Intelligence
  "Applebot",
  "Applebot-Extended",
  // Meta AI
  "meta-externalagent",
  "FacebookBot",
  // Amazon — Alexa
  "Amazonbot",
  // DuckDuckGo — DuckAssist
  "DuckAssistBot",
  // Mistral
  "MistralAI-User",
  // Cohere
  "cohere-ai",
  // You.com
  "YouBot",
  // ByteDance — Doubao
  "Bytespider",
  // Common Crawl — the corpus most open models are trained on
  "CCBot",
] as const;

const DISALLOW = [...PRIVATE_PATH_PREFIXES];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/").replace(/\/$/, ""),
  };
}
