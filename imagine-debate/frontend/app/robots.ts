import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authenticated app areas hold no public content and can't be crawled
        // meaningfully — keep crawl budget on the public marketing pages.
        disallow: ["/dashboard", "/debate/", "/auth/"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
