import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Public, crawlable pages: the landing page and the information pages.
 *
 * Nothing here reads cookies or the database, so every page in this group is
 * rendered statically at build time and served from the CDN — which is also
 * what makes it cheap to let every crawler in.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
