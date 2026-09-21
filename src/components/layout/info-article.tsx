import type { ContentBlock, InfoPage } from "@/lib/site-content";

/** Renders an information page from its structured content. Headings carry
 *  ids so sections are linkable and so the outline is visible to crawlers. */
export function InfoArticle({ page, children }: { page: InfoPage; children?: React.ReactNode }) {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16 sm:py-20">
      <header className="mb-12">
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-balance leading-[1.1]">
          {page.title}
        </h1>
        <p className="mt-5 text-lg muted text-pretty leading-relaxed">{page.lead}</p>
      </header>

      {page.sections.map((section) => (
        <section key={section.id} id={section.id} className="mb-10 scroll-mt-24">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-4">{section.heading}</h2>
          <div className="space-y-4">
            {section.blocks.map((block, index) => (
              <Block key={index} block={block} />
            ))}
          </div>
        </section>
      ))}

      {children}
    </article>
  );
}

function Block({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "paragraph":
      return <p className="leading-relaxed text-pretty">{block.text}</p>;
    case "list":
      return (
        <ul className="space-y-2">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3 leading-relaxed text-pretty">
              <span className="text-brand-500 shrink-0" aria-hidden>
                ·
              </span>
              {item}
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left">
              <tr>
                {block.headers.map((header) => (
                  <th key={header} className="px-4 py-3 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index} className="border-t border-[var(--border)] align-top">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-3 leading-relaxed">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
