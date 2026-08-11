import Link from "next/link";
import { SITE, FOOTER_NAV } from "@/lib/site";
import { CookiePreferencesButton } from "./CookiePreferencesButton";

// Shared footer for marketing, legal, and app-adjacent pages. Cross-links every
// key route so users (and crawlers) always have a path deeper into the site.
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-line bg-ink">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="text-base font-semibold tracking-tight text-cream">
              {SITE.name}
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-6 text-muted-2">
              {SITE.tagline} Structured rooms for sharper arguments.
            </p>
          </div>

          {FOOTER_NAV.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-2">
                {group.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-cream"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-sm text-muted-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} {SITE.name}. All rights reserved.
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>{SITE.responseTimePromise}</span>
            <CookiePreferencesButton />
          </div>
        </div>
      </div>
    </footer>
  );
}
