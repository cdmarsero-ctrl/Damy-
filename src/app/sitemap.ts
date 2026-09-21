import type { MetadataRoute } from "next";

import { absoluteUrl, PUBLIC_PAGES } from "@/lib/site";

/** Every public page, from the same registry the middleware and llms.txt use.
 *  `lastModified` is the build time: these pages are static and change only
 *  when the site is redeployed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
