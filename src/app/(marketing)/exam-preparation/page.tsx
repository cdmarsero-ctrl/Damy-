import { StartCta } from "@/components/layout/cta";
import { InfoArticle } from "@/components/layout/info-article";
import { JsonLd } from "@/components/layout/json-ld";
import { breadcrumbJsonLd, pageMetadata, webPageJsonLd } from "@/lib/seo";
import { EXAM_PAGE } from "@/lib/site-content";

export const metadata = pageMetadata(EXAM_PAGE.path);

export default function ExamPreparationPage() {
  return (
    <main id="main">
      <JsonLd data={webPageJsonLd(EXAM_PAGE.path)} />
      <JsonLd data={breadcrumbJsonLd(EXAM_PAGE.path)} />
      <InfoArticle page={EXAM_PAGE}>
        <StartCta heading="See which exam module suits your level" />
      </InfoArticle>
    </main>
  );
}
