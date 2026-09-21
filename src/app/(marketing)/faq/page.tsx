import { StartCta } from "@/components/layout/cta";
import { JsonLd } from "@/components/layout/json-ld";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";
import { FAQ } from "@/lib/site-content";

export const metadata = pageMetadata("/faq");

export default function FaqPage() {
  return (
    <main id="main">
      <JsonLd data={webPageJsonLd("/faq")} />
      <JsonLd data={breadcrumbJsonLd("/faq")} />
      <JsonLd data={faqJsonLd(FAQ)} />

      <article className="max-w-3xl mx-auto px-6 py-16 sm:py-20">
        <header className="mb-12">
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-balance leading-[1.1]">
            Frequently asked questions
          </h1>
          <p className="mt-5 text-lg muted text-pretty leading-relaxed">
            Short, honest answers. If yours is not here, the About page has contact details.
          </p>
        </header>

        <dl className="space-y-8">
          {FAQ.map((item, index) => (
            <div key={item.question} id={`q${index + 1}`} className="scroll-mt-24">
              <dt className="text-lg font-semibold tracking-tight mb-2 text-balance">{item.question}</dt>
              <dd className="leading-relaxed text-pretty muted">{item.answer}</dd>
            </div>
          ))}
        </dl>

        <StartCta />
      </article>
    </main>
  );
}
