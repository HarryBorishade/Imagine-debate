import Link from "next/link";
import { SITE } from "@/lib/site";

// Lightweight static header for marketing/legal pages (FAQ, privacy, contact,
// cookies). The landing page keeps its own auth-aware nav; these pages don't
// need session state, so a simple, fast header keeps them server-rendered.
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="text-base font-semibold tracking-tight text-cream">
          {SITE.name}
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/faq"
            className="hidden rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-cream sm:block"
          >
            FAQ
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-cream"
          >
            Dashboard
          </Link>
          <Link
            href="/debate/create"
            className="rounded-md bg-cream px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white"
          >
            Start a debate
          </Link>
        </nav>
      </div>
    </header>
  );
}
