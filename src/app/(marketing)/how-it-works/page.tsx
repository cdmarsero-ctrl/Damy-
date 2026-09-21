import { StartCta } from "@/components/layout/cta";
import { InfoArticle } from "@/components/layout/info-article";
import { JsonLd } from "@/components/layout/json-ld";
import { breadcrumbJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";
import { HOW_IT_WORKS_PAGE } from "@/lib/site-content";

export const metadata = pageMetadata(HOW_IT_WORKS_PAGE.path);

export default function HowItWorksPage() {
  return (
    <main id="main">
      <JsonLd data={webPageJsonLd(HOW_IT_WORKS_PAGE.path)} />
      <JsonLd data={breadcrumbJsonLd(HOW_IT_WORKS_PAGE.path)} />
      <InfoArticle page={HOW_IT_WORKS_PAGE}>
        <StartCta />
      </InfoArticle>
    </main>
  );
}
