import Link from "next/link";

import { NAV_PAGES, SITE_NAME } from "@/lib/site";

/** Header for every public page: brand, the information pages, and the two
 *  calls to action. The nav collapses below `md`; the footer repeats every
 *  link so nothing is unreachable on a phone. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 h-16 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur">
      <div className="max-w-6xl mx-auto h-full px-6 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold shrink-0">
          <span className="size-8 rounded-lg bg-brand-600 text-white grid place-items-center text-sm font-bold">
            Lx
          </span>
          {SITE_NAME}
        </Link>

        <nav aria-label="Site" className="hidden md:flex items-center gap-1 text-sm">
          {NAV_PAGES.map((page) => (
            <Link
              key={page.path}
              href={page.path}
              className="px-3 py-2 rounded-lg muted hover:text-[var(--text)] transition-colors"
            >
              {page.title}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 text-sm shrink-0">
          <Link
            href="/login"
            className="px-4 py-2 rounded-lg font-medium muted hover:text-[var(--text)] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 rounded-lg font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
