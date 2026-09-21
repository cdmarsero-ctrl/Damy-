import Link from "next/link";

import { NAV_PAGES, SITE_AUTHOR, SITE_NAME, SITE_TAGLINE_LOWER, SOURCE_REPOSITORY } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--border)] py-10">
      <div className="max-w-6xl mx-auto px-6 grid gap-8 sm:grid-cols-[1fr_auto] text-sm muted">
        <div className="space-y-2 max-w-md">
          <p className="font-medium text-[var(--text)]">
            {SITE_NAME} — {SITE_TAGLINE_LOWER}.
          </p>
          <p className="text-pretty">
            Adaptive placement, spaced repetition, an AI conversation partner and exam preparation
            for advanced English learners.
          </p>
          {(SITE_AUTHOR.name || SITE_AUTHOR.email) && (
            <p>
              {SITE_AUTHOR.name && (
                <>
                  Made by{" "}
                  {SITE_AUTHOR.url ? (
                    <a href={SITE_AUTHOR.url} className="underline underline-offset-2" rel="me">
                      {SITE_AUTHOR.name}
                    </a>
                  ) : (
                    SITE_AUTHOR.name
                  )}
                  {SITE_AUTHOR.email && ". "}
                </>
              )}
              {SITE_AUTHOR.email && (
                <a href={`mailto:${SITE_AUTHOR.email}`} className="underline underline-offset-2">
                  {SITE_AUTHOR.email}
                </a>
              )}
            </p>
          )}
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2">
          {NAV_PAGES.map((page) => (
            <Link key={page.path} href={page.path} className="hover:text-[var(--text)] transition-colors">
              {page.title}
            </Link>
          ))}
          <Link href="/login" className="hover:text-[var(--text)] transition-colors">
            Sign in
          </Link>
          <Link href="/register" className="hover:text-[var(--text)] transition-colors">
            Create an account
          </Link>
          {SOURCE_REPOSITORY && (
            <a href={SOURCE_REPOSITORY} className="hover:text-[var(--text)] transition-colors">
              Source code
            </a>
          )}
          <a href="/llms.txt" className="hover:text-[var(--text)] transition-colors">
            llms.txt
          </a>
        </nav>
      </div>
    </footer>
  );
}
