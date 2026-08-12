import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Page not found",
  description: "The page you were looking for doesn't exist or has moved.",
  robots: { index: false, follow: true },
};

const SUGGESTIONS = [
  {
    href: "/debate/create",
    title: "Start a debate",
    body: "Create a motion and get a room code to share.",
  },
  {
    href: "/debate/join",
    title: "Join a debate",
    body: "Have a 4-digit code? Jump straight into a room.",
  },
  {
    href: "/dashboard",
    title: "Your dashboard",
    body: "Pick up an open room or review past debates.",
  },
  {
    href: "/faq",
    title: "Read the FAQ",
    body: "How rounds, timers, and judging work.",
  },
];

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-ink text-cream">
      <MarketingHeader />

      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-3xl px-5 py-20 text-center sm:py-28">
          <p className="eyebrow justify-center">Error 404</p>
          <h1 className="mt-5 font-serif text-5xl tracking-tight text-[#fffaf0] sm:text-6xl">
            This page lost the debate.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-muted">
            The page you were looking for doesn&apos;t exist, moved, or the link
            was mistyped. Here&apos;s where debaters usually head next.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="bg-cream px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-white"
            >
              Back to home
            </Link>
            <Link
              href="/dashboard"
              className="border border-line-strong px-5 py-3 text-sm font-semibold text-cream transition-colors hover:bg-white/5"
            >
              Go to dashboard
            </Link>
          </div>

          <div className="mt-14 grid gap-px border border-line bg-line text-left sm:grid-cols-2">
            {SUGGESTIONS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group bg-surface p-5 transition hover:bg-surface-2"
              >
                <p className="font-serif text-lg text-[#fffaf0] group-hover:text-accent">
                  {item.title}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-muted-2">
                  {item.body}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
