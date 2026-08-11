import type { Metadata } from "next";
import { MarketingHeader } from "@/components/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { EnquiryForm } from "@/components/EnquiryForm";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact us",
  description: `Get in touch with the ${SITE.name} team. ${SITE.responseTimePromise}`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink text-cream">
      <MarketingHeader />

      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Contact" }]}
          />

          <div className="grid gap-10 lg:grid-cols-[1fr_460px] lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent/80">
                Talk to us
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#fffaf0] sm:text-5xl">
                Get in touch
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
                Found a bug, have a question about how judging works, or want to
                suggest a feature? Send us a message and we&apos;ll get back to you.
              </p>

              <div className="mt-8 space-y-4">
                <div className="rounded-xl border border-accent/20 bg-accent/[0.06] p-5">
                  <h2 className="text-sm font-semibold text-[#fffaf0]">
                    Our response-time promise
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-muted">
                    {SITE.responseTimePromise} You&apos;ll always hear back from a
                    real person.
                  </p>
                </div>

                <div className="rounded-xl border border-line bg-surface p-5">
                  <h2 className="text-sm font-semibold text-[#fffaf0]">
                    Prefer email?
                  </h2>
                  <p className="mt-1.5 text-sm leading-6 text-muted">
                    Write to us directly at{" "}
                    <a
                      href={`mailto:${SITE.supportEmail}`}
                      className="text-accent underline-offset-4 hover:underline"
                    >
                      {SITE.supportEmail}
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-[#fffaf0]">
                Send an enquiry
              </h2>
              <p className="mt-1 text-sm text-muted-2">
                We only use these details to reply to you.
              </p>
              <div className="mt-6">
                <EnquiryForm />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
