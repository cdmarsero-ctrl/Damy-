# Discoverability: search engines and AI assistants

How the public side of the site is exposed to search engines (Google, Bing, DuckDuckGo)
and to AI assistants and answer engines (ChatGPT, Claude, Gemini, Copilot, Perplexity,
Apple Intelligence, Meta AI and the rest), what each mechanism does, and what an operator
has to do after deploying.

Nothing in this document affects learner data. Every route behind the session cookie is
disallowed to crawlers, redirects them to `/login` if they try anyway, and carries an
`X-Robots-Tag: noindex` header on the API.

---

## The public surface

| Route | What it is | Who reads it |
|---|---|---|
| `/` | Landing page | Everyone |
| `/about` | What the product is, who it is for, who is behind it, how to get in touch | Everyone; the page AI assistants cite when asked "what is Lexicon?" |
| `/features` | Every feature, with what it claims and what it does not | Everyone |
| `/levels` | CEFR B2, C1 and C2 in practice | Everyone |
| `/how-it-works` | Placement engine, spaced repetition, AI layer, offline model | Everyone |
| `/exam-preparation` | IELTS, TOEFL, CAE and CPE modules | Everyone |
| `/faq` | Questions and answers, with `FAQPage` structured data | Everyone; eligible for rich results |
| `/robots.txt` | Crawler policy | Crawlers |
| `/sitemap.xml` | Every public URL | Search engines |
| `/llms.txt` | Markdown summary of the site with a link index | AI assistants and agents |
| `/llms-full.txt` | The complete text of every public page in one Markdown file | AI assistants and agents |
| `/opengraph-image` | 1200×630 preview card | Social networks, chat apps, AI answers that show sources |

All of these are rendered at build time from one registry, `src/lib/site.ts`
(`PUBLIC_PAGES`), and one content module, `src/lib/site-content.ts`. The middleware, the
sitemap, the header, the footer and both llms files are generated from the same data, so
a page cannot be listed for crawlers and then bounce them to the login screen, and the
text a model reads cannot drift from the text a visitor sees.

---

## Mechanisms, one by one

### robots.txt — `src/app/robots.ts`

Allows every crawler on the public site and disallows the application and the API.
The AI crawlers are named explicitly (`GPTBot`, `OAI-SearchBot`, `ChatGPT-User`,
`ClaudeBot`, `Claude-User`, `Claude-SearchBot`, `Google-Extended`, `Bingbot`,
`PerplexityBot`, `Perplexity-User`, `Applebot-Extended`, `meta-externalagent`,
`Amazonbot`, `DuckAssistBot`, `MistralAI-User`, `cohere-ai`, `YouBot`, `Bytespider`,
`CCBot`, …) rather than left to the wildcard, for two reasons: several of them read only
a rule addressed to them by name, and an operator opening the file should see that AI
indexing is a decision rather than an oversight.

To opt a crawler *out* — say, to allow AI search but refuse training corpora — remove it
from `AI_CRAWLERS` and add a `{ userAgent, disallow: "/" }` rule. `Google-Extended`,
`Applebot-Extended` and `CCBot` are the training-only agents; the search agents
(`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, `Googlebot`, `Bingbot`) are what
puts the site in AI answers.

### sitemap.xml — `src/app/sitemap.ts`

Every entry in `PUBLIC_PAGES`, with priority and change frequency. Submit it once to
Google Search Console and Bing Webmaster Tools (below); after that, the `Sitemap:` line
in robots.txt is enough for every other crawler to find it.

### llms.txt and llms-full.txt — `src/lib/llms.ts`

The [llms.txt](https://llmstxt.org) convention: a Markdown file at `/llms.txt` with an H1,
a blockquote summary, key facts and sections of annotated links; and `/llms-full.txt`
with the full content. AI agents and answer engines that support the convention read
these instead of scraping the HTML, which makes the description they give of the site far
more accurate. Both are served as `text/markdown` and cached for a day.

### Structured data (JSON-LD) — `src/lib/seo.ts`

| Type | Where | Purpose |
|---|---|---|
| `Organization` + `WebSite` | Every page (root layout) | Names the publisher, links the profiles in `NEXT_PUBLIC_SOCIAL_LINKS` via `sameAs`, declares the site's language |
| `SoftwareApplication` / `WebApplication` | `/`, `/features` | Category, feature list, levels taught, free-to-use offer |
| `WebPage` + `BreadcrumbList` | Every information page | Page identity and position in the site |
| `FAQPage` | `/faq` | Each question and answer, eligible for rich results and quoted verbatim by answer engines |
| `Person` | When `NEXT_PUBLIC_AUTHOR_NAME` is set | Attributes the site to its maker |

### HTML metadata — `src/app/layout.tsx`, `pageMetadata()` in `src/lib/seo.ts`

`metadataBase` is set from `NEXT_PUBLIC_APP_URL`, which makes every canonical, Open
Graph and Twitter URL absolute. Each public page declares its own title, description,
canonical URL and cards; the `robots` meta allows unlimited snippets and large image
previews so the product is not described from a truncated excerpt. Private pages inherit
the defaults and are never reached by a crawler.

### Open Graph image — `src/app/opengraph-image.tsx`

One card for the whole site, rendered at build time with `next/og`. Referenced explicitly
from every public page's metadata, because a page-level `openGraph` object replaces the
layout's — including the image the file convention would otherwise attach.

### Headers — `next.config.ts`

`X-Robots-Tag: noindex, nofollow` on `/api/*`. robots.txt already disallows the prefix;
the header additionally covers any API response a crawler reaches by following a link.

---

## After deploying: the checklist

The code does everything it can. Three things only the operator can do:

- [ ] **Set `NEXT_PUBLIC_APP_URL` to the real public origin** (`https://…`, no trailing
      slash) before the production build. It becomes the canonical URL on every page, the
      sitemap, the Open Graph URLs and the JSON-LD `@id`s. With the default of
      `http://localhost:3000`, every crawler is told the site lives on a laptop.
- [ ] **Fill in the identity variables** so the site is attributed to you:
      `NEXT_PUBLIC_AUTHOR_NAME`, `NEXT_PUBLIC_AUTHOR_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`,
      `NEXT_PUBLIC_SOCIAL_LINKS` (comma-separated profile URLs) and, if the code is
      public, `NEXT_PUBLIC_SOURCE_URL`. Every one is optional and omitted when blank. These
      are `NEXT_PUBLIC_*`: whatever you put here is published.
- [ ] **Submit the sitemap** to
      [Google Search Console](https://search.google.com/search-console) and
      [Bing Webmaster Tools](https://www.bing.com/webmasters). Bing's index is what
      ChatGPT search, Copilot and DuckDuckGo draw on, so the second one matters as much as
      the first.

Then verify:

```bash
BASE=https://your-domain.example
curl -s $BASE/robots.txt | head -3          # User-Agent: * / Allow: / / Disallow: /api/
curl -s $BASE/sitemap.xml | grep -c '<loc>'  # one per public page
curl -s $BASE/llms.txt | head -3             # "# Lexicon" then the summary
curl -s $BASE/about | grep -o '<link rel="canonical"[^>]*>'
```

Paste `$BASE/faq` into Google's [Rich Results Test](https://search.google.com/test/rich-results)
to confirm the `FAQPage` markup validates, and `$BASE/` into the
[Schema Markup Validator](https://validator.schema.org) for the rest.

---

## What to expect, and when

Search engines re-crawl a new small site within days of a sitemap submission. AI answer
engines that search live (ChatGPT search, Perplexity, Copilot, Gemini with grounding)
pick the site up as soon as the underlying index does. Assistants answering from
training data alone will not know about the site until their next training run,
whatever the site does; `llms.txt` and the structured data make sure that when a model
*does* look, it finds an accurate description rather than a guess.

Being *findable* is a precondition for being *cited*, not a guarantee of it. Answer
engines cite pages that answer a specific question plainly, which is why the public
pages are written as direct statements with the working shown rather than as slogans.

---

## Adding a public page

1. Add a row to `PUBLIC_PAGES` in `src/lib/site.ts`. This alone makes the route public in
   the middleware, adds it to the sitemap, the header (`nav: true`) and the footer, and
   links it from `llms.txt`.
2. If the page is prose, add its content to `src/lib/site-content.ts` and render it with
   `<InfoArticle>`; add it to `INFO_PAGES` so `llms-full.txt` carries it.
3. Create `src/app/(marketing)/<path>/page.tsx` with
   `export const metadata = pageMetadata("/<path>")` and the `WebPage` + `BreadcrumbList`
   JSON-LD, following any of the existing pages.
4. `npm test` — `src/lib/site.test.ts` checks that the registry, the sitemap, robots.txt
   and both llms files agree.
