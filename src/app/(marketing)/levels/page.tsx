import Link from "next/link";

import { StartCta } from "@/components/layout/cta";
import { JsonLd } from "@/components/layout/json-ld";
import { breadcrumbJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";
import { LEVELS } from "@/lib/site-content";

export const metadata = pageMetadata("/levels");

export default function LevelsPage() {
  return (
    <main id="main">
      <JsonLd data={webPageJsonLd("/levels")} />
      <JsonLd data={breadcrumbJsonLd("/levels")} />

      <article className="max-w-3xl mx-auto px-6 py-16 sm:py-20">
        <header className="mb-12">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-balance leading-[1.1]">
            B2, C1 and C2: where you are, and what comes next
          </h1>
          <p className="mt-5 text-lg muted text-pretty leading-relaxed">
            The Common European Framework of Reference (CEFR) describes six levels of language
            ability. {SITE_NAME} covers the top three — the levels at which most apps run out
            of things to teach. Here is what each one means in practice, where learners at that
            level tend to stall, and what we work on.
          </p>
        </header>

        {LEVELS.map((level) => (
          <section key={level.code} id={level.code.toLowerCase()} className="mb-12 scroll-mt-24">
            <div className="flex items-baseline gap-3 mb-3">
              <h2
                className="text-4xl font-semibold tabular-nums tracking-tight"
                style={{ color: `var(--color-${level.code.toLowerCase()})` }}
              >
                {level.code}
              </h2>
              <span className="text-lg font-medium">{level.name}</span>
            </div>
            <p className="text-sm muted mb-4">{level.cefr}</p>
            <h3 className="font-semibold mb-1.5">Where you are</h3>
            <p className="leading-relaxed text-pretty mb-4">{level.where}</p>
            <h3 className="font-semibold mb-1.5">Where you plateau</h3>
            <p className="leading-relaxed text-pretty mb-4">{level.plateau}</p>
            <h3 className="font-semibold mb-1.5">What we work on</h3>
            <ul className="space-y-1.5">
              {level.focus.map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed">
                  <span className="text-brand-500 shrink-0" aria-hidden>
                    ·
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section id="below-b2" className="mb-10 scroll-mt-24">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-3">Not yet at B2?</h2>
          <p className="leading-relaxed text-pretty">
            {SITE_NAME} is not designed for beginners or lower-intermediate learners. The placement
            test will tell you honestly if you are below B2, and the{" "}
            <Link href="/how-it-works" className="underline underline-offset-2">
              adaptive placement engine
            </Link>{" "}
            reaches that conclusion in as few questions as it can.
          </p>
        </section>

        <StartCta heading="Find out which level you are at" />
      </article>
    </main>
  );
}
