import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const metadata: Metadata = {
  title: "Cookies and browser storage",
  description:
    "What browser storage and cookies Imagine Debate uses, including optional analytics, and how to accept, reject, or change your choice.",
  alternates: { canonical: "/cookies" },
};

const STORAGE_ITEMS = [
  {
    name: "Supabase auth storage",
    purpose: "Keeps you signed in and refreshes your session securely.",
    type: "Strictly necessary",
    duration: "Until sign out, expiry, or browser data is cleared",
  },
  {
    name: "Debate room session storage",
    purpose:
      "Remembers your current debate topic, side, timer details, and outcome handoff while you move between debate pages.",
    type: "Strictly necessary",
    duration: "Current browser tab session, or until you leave the debate",
  },
  {
    name: "Cookie preference",
    purpose: "Remembers whether you accepted or rejected optional cookies.",
    type: "Strictly necessary",
    duration: "Until you change your choice or clear browser data",
  },
  {
    name: "Google Analytics",
    purpose:
      "Aggregate, anonymised usage statistics — which pages are visited and how the app is used. Only loaded after you accept.",
    type: "Optional — requires consent",
    duration: "Up to 2 years (set by Google)",
  },
];

export default function CookiesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink text-cream">
      <MarketingHeader />

      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-4xl px-5 py-12">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cookies" }]} />

          <p className="eyebrow mb-4">Privacy basics</p>

          <h1 className="font-serif text-4xl tracking-tight text-[#fffaf0]">
            Cookies and browser storage
          </h1>

          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted">
            Imagine Debate uses browser storage that&apos;s needed to provide
            core app features, such as keeping you signed in and carrying your
            debate state between pages. We also offer optional analytics
            cookies to help us understand how the app is used — these are only
            set if you accept them. See our{" "}
            <Link href="/privacy" className="text-accent underline-offset-4 hover:underline">
              privacy policy
            </Link>{" "}
            for how any resulting data is handled.
          </p>

          <div className="mt-10 overflow-x-auto border border-line bg-surface">
            <div className="grid min-w-[640px] grid-cols-4 border-b border-line bg-white/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-2">
              <span>Name</span>
              <span>Purpose</span>
              <span>Type</span>
              <span>Duration</span>
            </div>

            {STORAGE_ITEMS.map((item) => (
              <div
                key={item.name}
                className="grid min-w-[640px] grid-cols-4 gap-3 border-b border-line px-4 py-4 text-sm last:border-b-0"
              >
                <span className="font-medium text-[#fffaf0]">{item.name}</span>
                <span className="leading-6 text-muted">{item.purpose}</span>
                <span
                  className={
                    item.type.startsWith("Optional")
                      ? "text-amber-300"
                      : "text-accent"
                  }
                >
                  {item.type}
                </span>
                <span className="text-muted-2">{item.duration}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t-2 border-accent bg-[#141719] p-5">
            <h2 className="font-serif text-lg text-[#fffaf0]">
              Your choices
            </h2>

            <p className="mt-3 text-sm leading-7 text-muted">
              The first time you visit, a banner lets you accept or reject
              optional analytics cookies — nothing optional is set until you
              choose. You can change your mind at any time using the{" "}
              <span className="font-medium text-[#d7d0c2]">
                &ldquo;Cookie preferences&rdquo;
              </span>{" "}
              link in the footer of any page, which reopens the banner.
            </p>

            <p className="mt-3 text-sm leading-7 text-muted">
              Rejecting optional cookies never affects your ability to use
              Imagine Debate — sign-in, debate rooms, and results all work the
              same either way.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
