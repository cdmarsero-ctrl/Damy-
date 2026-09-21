import { StartCta } from "@/components/layout/cta";
import { InfoArticle } from "@/components/layout/info-article";
import { JsonLd } from "@/components/layout/json-ld";
import { breadcrumbJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";
import { SITE_AUTHOR, SOURCE_REPOSITORY } from "@/lib/site";
import { ABOUT_PAGE } from "@/lib/site-content";

export const metadata = pageMetadata(ABOUT_PAGE.path);

export default function AboutPage() {
  const hasContact = Boolean(SITE_AUTHOR.name || SITE_AUTHOR.email || SITE_AUTHOR.sameAs.length);

  return (
    <main id="main">
      <JsonLd data={webPageJsonLd(ABOUT_PAGE.path)} />
      <JsonLd data={breadcrumbJsonLd(ABOUT_PAGE.path)} />
      <InfoArticle page={ABOUT_PAGE}>
        {(hasContact || SOURCE_REPOSITORY) && (
          <section id="contact" className="mb-10 scroll-mt-24">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-4">Who is behind it</h2>
            <div className="space-y-3 leading-relaxed">
              {SITE_AUTHOR.name && (
                <p>
                  {ABOUT_PAGE.title.replace(/^About /, "")} is made by{" "}
                  {SITE_AUTHOR.url ? (
                    <a href={SITE_AUTHOR.url} rel="me" className="underline underline-offset-2">
                      {SITE_AUTHOR.name}
                    </a>
                  ) : (
                    <span>{SITE_AUTHOR.name}</span>
                  )}
                  .
                </p>
              )}
              {SITE_AUTHOR.email && (
                <p>
                  Questions, partnerships and press:{" "}
                  <a href={`mailto:${SITE_AUTHOR.email}`} className="underline underline-offset-2">
                    {SITE_AUTHOR.email}
                  </a>
                  .
                </p>
              )}
              {SITE_AUTHOR.sameAs.length > 0 && (
                <ul className="flex flex-wrap gap-x-5 gap-y-1">
                  {SITE_AUTHOR.sameAs.map((link) => (
                    <li key={link}>
                      <a href={link} rel="me" className="underline underline-offset-2 break-all">
                        {link.replace(/^https?:\/\//, "")}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {SOURCE_REPOSITORY && (
                <p>
                  The source code is public:{" "}
                  <a href={SOURCE_REPOSITORY} className="underline underline-offset-2 break-all">
                    {SOURCE_REPOSITORY.replace(/^https?:\/\//, "")}
                  </a>
                  .
                </p>
              )}
            </div>
          </section>
        )}
        <StartCta />
      </InfoArticle>
    </main>
  );
}
