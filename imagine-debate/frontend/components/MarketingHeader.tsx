import Link from "next/link";
import { SITE } from "@/lib/site";

// Lightweight static header for marketing/legal pages (FAQ, privacy, contact,
// cookies). The landing page keeps its own auth-aware nav; these pages don't
// need session state, so a simple, fast header keeps them server-rendered.
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link
          href="/"
          className="font-serif text-lg tracking-tight text-cream"
        >
          {SITE.name}
        </Link>

        <nav
          aria-label="Primary"
          className="flex items-center gap-4 text-sm sm:gap-5"
        >
          <Link
            href="/faq"
            className="hidden text-muted transition-colors hover:text-cream sm:block"
          >
            FAQ
          </Link>
          <Link
            href="/dashboard"
            className="text-muted transition-colors hover:text-cream"
          >
            Dashboard
          </Link>
          <Link
            href="/debate/create"
            className="rounded-lg border border-cream/80 px-4 py-2 font-semibold text-cream transition-colors hover:bg-cream hover:text-ink"
          >
            Start a debate
          </Link>
        </nav>
      </div>
    </header>
  );
}
