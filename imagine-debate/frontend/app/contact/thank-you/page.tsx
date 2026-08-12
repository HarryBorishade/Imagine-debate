import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Thank you",
  description: "Your enquiry has been received.",
  // Confirmation pages shouldn't be indexed.
  robots: { index: false, follow: true },
};

export default function ThankYouPage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink text-cream">
      <MarketingHeader />

      <main id="main-content" className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center border border-accent/30 bg-accent/10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12.5l4.5 4.5L19 7"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <p className="eyebrow justify-center">Enquiry received</p>
          <h1 className="mt-4 font-serif text-4xl tracking-tight text-[#fffaf0] sm:text-5xl">
            Thanks — we&apos;re on it.
          </h1>
          <p className="mx-auto mt-5 max-w-md text-lg leading-8 text-muted">
            Your message reached us safely. {SITE.responseTimePromise} Keep an eye
            on the inbox for the email address you gave us.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="bg-cream px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-white"
            >
              Go to dashboard
            </Link>
            <Link
              href="/"
              className="border border-line-strong px-5 py-3 text-sm font-semibold text-cream transition-colors hover:bg-white/5"
            >
              Back to home
            </Link>
          </div>

          <p className="mt-8 text-sm text-muted-2">
            In the meantime,{" "}
            <Link href="/faq" className="text-accent underline-offset-4 hover:underline">
              browse the FAQ
            </Link>{" "}
            — your answer might already be there.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
