/**
 * Emits a JSON-LD block. Structured data is how search engines and AI
 * assistants learn what a page *is* (an organisation, a FAQ, a software
 * application) rather than guessing from the prose.
 *
 * `<` is escaped so that user-influenced strings can never close the script
 * element; this is the same precaution Next.js recommends for inline JSON.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
