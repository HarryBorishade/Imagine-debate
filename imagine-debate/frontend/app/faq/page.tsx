import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ — how Imagine Debate works",
  description:
    "Answers to common questions about debate rooms, timed rounds, AI judging, ratings, and support response times on Imagine Debate.",
  alternates: { canonical: "/faq" },
};

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "What is Imagine Debate?",
    a: "Imagine Debate is a structured, real-time platform for one-versus-one debates. You create a motion, share a four-digit room code with an opponent, and argue for or against it across timed rounds. Every debate is appraised so you get clear, structured feedback instead of an endless comment thread.",
  },
  {
    q: "How does a debate room work?",
    a: "One player argues FOR the motion and the other argues AGAINST. Play moves through fixed stages — opening statement, primary claim, evidence, explanation, rebuttal, counter-rebuttal, and closing — taking turns. Each turn has a countdown timer set by the room creator (from 30 seconds up to 5 minutes). You can submit early or pass, and whatever you have written when the timer ends is submitted for you.",
  },
  {
    q: "How is the winner decided?",
    a: "When both sides have finished, an impartial AI judge reviews the full transcript and scores each side on logic, evidence, rebuttal, clarity, and conduct out of 100. Close or uncertain debates are escalated to a stronger review model for a second opinion. If an opponent leaves or disconnects and does not return in time, the remaining player wins by default.",
  },
  {
    q: "How do ratings work?",
    a: "Every player has a rating that starts at 400 and moves after each completed debate using an Elo-style calculation — beat a higher-rated opponent and you gain more points; lose to a lower-rated one and you lose more. Wins, losses, and draws are tracked on your dashboard. Forfeits (leaving mid-debate) count as a loss.",
  },
  {
    q: "What happens if my opponent leaves or disconnects?",
    a: "If a player drops mid-debate they get a short grace period to reconnect and the timer pauses. If they don't come back in time, the debate ends and the remaining player is awarded the win. If someone leaves a waiting room before an opponent ever joins, that room is discarded automatically so it doesn't clutter your dashboard.",
  },
  {
    q: "Is Imagine Debate free to use?",
    a: "Yes. Creating an account, hosting debate rooms, taking part in timed debates, and receiving an AI outcome are all free. Just sign up, create or join a room, and start debating.",
  },
  {
    q: "How do I get help or send an enquiry?",
    a: `Use the contact page to send us a message. ${SITE.responseTimePromise} You can also review your account and past debates any time from your dashboard.`,
  },
];

export default function FaqPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <div className="flex min-h-screen flex-col bg-ink text-cream">
      <MarketingHeader />

      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "FAQ" }]}
          />

          <p className="eyebrow">Questions & answers</p>
          <h1 className="mt-4 font-serif text-4xl tracking-tight text-[#fffaf0] sm:text-5xl">
            How Imagine Debate works
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
            Everything you need to know about rooms, rounds, timers, judging, and
            ratings. Still stuck?{" "}
            <Link href="/contact" className="text-accent underline-offset-4 hover:underline">
              Get in touch
            </Link>
            .
          </p>

          <div className="card-panel mt-10 divide-y divide-line">
            {FAQ_ITEMS.map((item, index) => (
              <details key={item.q} className="group px-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left [&::-webkit-details-marker]:hidden">
                  <span className="flex items-baseline gap-3">
                    <span className="dossier-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-serif text-lg text-[#fffaf0]">
                      {item.q}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-muted-2 transition-transform duration-200 group-open:rotate-45"
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M10 4v12M4 10h12"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </summary>
                <p className="pb-5 pl-8 text-sm leading-7 text-muted">{item.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-8 rounded-[var(--radius-lg)] border-t-2 border-accent bg-accent/[0.06] p-6 shadow-[var(--shadow-card)]">
            <h2 className="font-serif text-lg text-[#fffaf0]">
              Need a hand?
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted">
              {SITE.responseTimePromise} Send us the details and we&apos;ll come
              back to you.
            </p>
            <Link
              href="/contact"
              className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong"
            >
              Contact us
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
      <JsonLd data={faqJsonLd} />
    </div>
  );
}
