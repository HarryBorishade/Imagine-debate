import Link from "next/link";
import { absoluteUrl } from "@/lib/site";
import { JsonLd } from "./JsonLd";

export interface Crumb {
  label: string;
  href?: string;
}

// Accessible breadcrumb trail + BreadcrumbList structured data for search
// engines. Pass the full trail including the "Home" root, most-specific last.
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-cream"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? "text-cream" : undefined}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}

              {!isLast && (
                <span aria-hidden="true" className="text-muted-2/50">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <JsonLd data={jsonLd} />
    </nav>
  );
}
