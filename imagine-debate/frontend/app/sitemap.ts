import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Public, indexable routes only. App/auth routes are intentionally excluded
// (they require a session and are disallowed in robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const entries: Array<{
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }> = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.7 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.6 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
    { path: "/cookies", changeFrequency: "yearly", priority: 0.4 },
  ];

  return entries.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE.url}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
