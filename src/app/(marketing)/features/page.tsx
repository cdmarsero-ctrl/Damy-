import { StartCta } from "@/components/layout/cta";
import { JsonLd } from "@/components/layout/json-ld";
import { breadcrumbJsonLd, pageMetadata, softwareApplicationJsonLd, webPageJsonLd } from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";
import { FEATURES } from "@/lib/site-content";

export const metadata = pageMetadata("/features");

export default function FeaturesPage() {
  return (
    <main id="main">
      <JsonLd data={webPageJsonLd("/features")} />
      <JsonLd data={breadcrumbJsonLd("/features")} />
      <JsonLd data={softwareApplicationJsonLd()} />

      <article className="max-w-3xl mx-auto px-6 py-16 sm:py-20">
        <header className="mb-12">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-balance leading-[1.1]">
            Everything {SITE_NAME} does
          </h1>
          <p className="mt-5 text-lg muted text-pretty leading-relaxed">
            Thirteen things, each one there because it addresses a specific reason advanced
            learners plateau. What each does, and what it deliberately does not claim.
          </p>
        </header>

        <nav aria-label="Features on this page" className="mb-12 surface p-5">
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {FEATURES.map((feature, index) => (
              <li key={feature.id}>
                <a href={`#${feature.id}`} className="muted hover:text-[var(--text)] transition-colors">
                  <span className="tabular-nums mr-2">{index + 1}.</span>
                  {feature.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {FEATURES.map((feature) => (
          <section key={feature.id} id={feature.id} className="mb-10 scroll-mt-24">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-1">{feature.title}</h2>
            <p className="text-brand-600 dark:text-brand-400 font-medium mb-3 text-pretty">
              {feature.summary}
            </p>
            <p className="leading-relaxed text-pretty">{feature.detail}</p>
          </section>
        ))}

        <StartCta />
      </article>
    </main>
  );
}
