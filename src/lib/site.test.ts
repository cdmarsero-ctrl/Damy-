import { describe, expect, it } from "vitest";

import robots, { AI_CRAWLERS } from "@/app/robots";
import sitemap from "@/app/sitemap";

import { buildLlmsFullTxt, buildLlmsTxt } from "./llms";
import { faqJsonLd, pageMetadata, siteJsonLd, softwareApplicationJsonLd } from "./seo";
import {
  absoluteUrl,
  NAV_PAGES,
  PRIVATE_PATH_PREFIXES,
  PUBLIC_PAGES,
  PUBLIC_RESOURCE_PATHS,
  SITE_URL,
} from "./site";
import { blockToMarkdown, FAQ, FEATURES, INFO_PAGES, infoPageToMarkdown } from "./site-content";

describe("site registry", () => {
  it("has unique, root-relative paths", () => {
    const paths = PUBLIC_PAGES.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) expect(path.startsWith("/")).toBe(true);
  });

  it("never lists a private route as public", () => {
    for (const page of PUBLIC_PAGES) {
      for (const prefix of PRIVATE_PATH_PREFIXES) {
        expect(page.path.startsWith(prefix)).toBe(false);
      }
    }
  });

  it("registers every information page", () => {
    for (const page of INFO_PAGES) {
      expect(PUBLIC_PAGES.some((entry) => entry.path === page.path)).toBe(true);
    }
    expect(NAV_PAGES.length).toBeGreaterThanOrEqual(5);
  });

  it("builds absolute URLs without double slashes", () => {
    expect(absoluteUrl("/")).toBe(`${SITE_URL}/`);
    expect(absoluteUrl("/about")).toBe(`${SITE_URL}/about`);
    expect(absoluteUrl("about")).toBe(`${SITE_URL}/about`);
    expect(SITE_URL.endsWith("/")).toBe(false);
  });
});

describe("sitemap", () => {
  it("lists every public page with an absolute URL", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(PUBLIC_PAGES.length);
    for (const page of PUBLIC_PAGES) {
      const entry = entries.find((candidate) => candidate.url === absoluteUrl(page.path));
      expect(entry, page.path).toBeDefined();
      expect(entry?.url.startsWith("http")).toBe(true);
    }
  });

  it("never lists a private route", () => {
    for (const entry of sitemap()) {
      const path = entry.url.slice(SITE_URL.length);
      for (const prefix of PRIVATE_PATH_PREFIXES) expect(path.startsWith(prefix)).toBe(false);
    }
  });
});

describe("robots", () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

  it("allows every crawler on the public site and blocks private routes", () => {
    const wildcard = rules.find((rule) => rule.userAgent === "*");
    expect(wildcard?.allow).toBe("/");
    expect(wildcard?.disallow).toEqual([...PRIVATE_PATH_PREFIXES]);
  });

  it("names the major AI crawlers explicitly", () => {
    for (const bot of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Bingbot"]) {
      expect(AI_CRAWLERS).toContain(bot);
      const rule = rules.find((candidate) => candidate.userAgent === bot);
      expect(rule?.allow, bot).toBe("/");
    }
  });

  it("points at the sitemap with an absolute URL", () => {
    expect(result.sitemap).toBe(absoluteUrl("/sitemap.xml"));
  });

  it("keeps every machine-readable resource off the disallow list", () => {
    for (const path of PUBLIC_RESOURCE_PATHS) {
      if (path === "/offline") continue; // the offline fallback is intentionally not indexed
      for (const prefix of PRIVATE_PATH_PREFIXES) expect(path.startsWith(prefix)).toBe(false);
    }
  });
});

describe("llms.txt", () => {
  const short = buildLlmsTxt();
  const full = buildLlmsFullTxt();

  it("follows the llms.txt shape: H1, blockquote summary, link sections", () => {
    const lines = short.split("\n");
    expect(lines[0]).toMatch(/^# /);
    expect(lines[2]).toMatch(/^> /);
    expect(short).toContain("\n## Pages\n");
  });

  it("links every navigable public page", () => {
    for (const page of PUBLIC_PAGES) {
      if (page.path === "/login" || page.path === "/register") continue;
      expect(short).toContain(`](${absoluteUrl(page.path)})`);
    }
  });

  it("carries the full content of every feature, page and FAQ entry", () => {
    for (const feature of FEATURES) expect(full).toContain(`### ${feature.title}`);
    for (const page of INFO_PAGES) expect(full).toContain(`## ${page.title}`);
    for (const item of FAQ) {
      expect(full).toContain(`### ${item.question}`);
      expect(full).toContain(item.answer);
    }
  });

  it("renders tables and lists as Markdown", () => {
    expect(blockToMarkdown({ type: "list", items: ["a", "b"] })).toBe("- a\n- b");
    expect(blockToMarkdown({ type: "table", headers: ["x", "y"], rows: [["1", "2"]] })).toBe(
      "| x | y |\n| --- | --- |\n| 1 | 2 |",
    );
    for (const page of INFO_PAGES) expect(infoPageToMarkdown(page)).toContain(page.lead);
  });
});

describe("seo", () => {
  it("derives a canonical URL and cards for a registered page", () => {
    const meta = pageMetadata("/about");
    expect(meta.alternates?.canonical).toBe(absoluteUrl("/about"));
    expect(meta.openGraph?.url).toBe(absoluteUrl("/about"));
    expect(meta.description).toBeTruthy();
  });

  it("refuses to build metadata for an unregistered page", () => {
    expect(() => pageMetadata("/not-a-page")).toThrow(/PUBLIC_PAGES/);
  });

  it("emits schema.org graphs with the site identity", () => {
    const site = siteJsonLd();
    expect(site["@graph"].map((node) => node["@type"])).toEqual(["Organization", "WebSite"]);
    const app = softwareApplicationJsonLd();
    expect(app.applicationCategory).toBe("EducationalApplication");
    expect(app.isAccessibleForFree).toBe(true);
    const faq = faqJsonLd();
    expect(faq.mainEntity).toHaveLength(FAQ.length);
  });
});
