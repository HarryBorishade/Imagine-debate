import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Imagine Debate collects, uses, and protects your personal data, including account details, debate content, AI judging, and analytics.",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "20 November 2026";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-8 first:border-t-0 first:pt-0">
      <h2 className="font-serif text-xl tracking-tight text-[#fffaf0]">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink text-cream">
      <MarketingHeader />

      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Privacy policy" }]}
          />

          <p className="eyebrow">Your data</p>
          <h1 className="mt-4 font-serif text-4xl tracking-tight text-[#fffaf0] sm:text-5xl">
            Privacy policy
          </h1>
          <p className="mt-4 text-sm text-muted-2">Last updated: {LAST_UPDATED}</p>
          <p className="mt-5 text-base leading-7 text-muted">
            This policy explains what personal data {SITE.name} collects, why we
            collect it, and the choices you have. It applies to the {SITE.name}{" "}
            website and debate app.
          </p>

          <div className="mt-10 space-y-10">
            <Section id="what-we-collect" title="1. Information we collect">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <span className="text-cream">Account details</span> — the email
                  address and username you provide when you sign up. Authentication
                  is handled by Supabase Auth.
                </li>
                <li>
                  <span className="text-cream">Debate content</span> — the motions
                  you create and the arguments (messages) you submit during a
                  debate, along with your chosen side and timing metadata.
                </li>
                <li>
                  <span className="text-cream">Ratings and results</span> — your
                  win/loss/draw record and rating, derived from completed debates.
                </li>
                <li>
                  <span className="text-cream">Enquiries</span> — the name, email,
                  and message you send through the contact form.
                </li>
                <li>
                  <span className="text-cream">Friend connections</span> - your chosen handle and discovery setting, friend requests, friends, blocks and debate invitations.
                </li>
                <li>
                  <span className="text-cream">Reports</span> - the reason you submit, the debate and the accounts involved. Reports may be reviewed to investigate safety concerns.
                </li>
                <li>
                  <span className="text-cream">Technical &amp; usage data</span> —
                  standard server logs and, only if you consent, usage
                  analytics about how the app is used.
                </li>
              </ul>
            </Section>

            <Section id="how-we-use" title="2. How we use your data">
              <ul className="list-disc space-y-2 pl-5">
                <li>To create your account and keep you signed in.</li>
                <li>To run debate rooms, match turns, and store transcripts.</li>
                <li>
                  To generate an impartial outcome — completed debate transcripts
                  are sent to Google&apos;s Gemini models to score and summarise the
                  debate. Transcripts are processed to produce the appraisal and are
                  not used by us to train models.
                </li>
                <li>To calculate and display your rating and match history.</li>
                <li>To show opted-in handles in exact search, manage friend requests and blocks, and deliver debate invitations inside the app.</li>
                <li>To respond to enquiries and investigate reports of harmful behaviour.</li>
                <li>
                  To understand and improve the service through aggregated
                  analytics, where you have consented.
                </li>
              </ul>
            </Section>

            <Section id="legal-basis" title="3. Legal basis for processing">
              <p>
                Where the UK GDPR / EU GDPR applies, we rely on:{" "}
                <span className="text-cream">performance of a contract</span> (to
                provide the debate service you sign up for);{" "}
                <span className="text-cream">legitimate interests</span> (to keep
                the service secure and working); and{" "}
                <span className="text-cream">consent</span> (for optional analytics
                cookies, which you can withdraw at any time).
              </p>
            </Section>

            <Section id="processors" title="4. Service providers we share data with">
              <p>
                The service uses third-party providers to run {SITE.name}, including:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <span className="text-cream">Supabase</span> — database,
                  authentication, and realtime infrastructure (stores your account,
                  debates, and messages).
                </li>
                <li>
                  <span className="text-cream">Vercel</span> — hosting and delivery
                  of the website.
                </li>
                <li>
                  <span className="text-cream">Google (Gemini API)</span> — AI
                  appraisal of completed debate transcripts.
                </li>
                <li>
                  <span className="text-cream">Google Analytics</span> — usage
                  analytics, loaded only after you accept optional cookies.
                </li>
                <li>
                  <span className="text-cream">Resend</span> - report notification emails, when configured.
                </li>
                <li>
                  <span className="text-cream">Debate server hosting</span> - live debate rooms and activity.
                </li>
              </ul>
              <p>
                Some providers may process data outside your country. Contact us for information about the providers and safeguards used for your data.
              </p>
            </Section>

            <Section id="cookies" title="5. Cookies and browser storage">
              <p>
                We use strictly necessary browser storage to keep you signed in and
                carry your debate state between pages, plus optional analytics
                cookies you can accept or reject. Full details are on our{" "}
                <Link
                  href="/cookies"
                  className="text-accent underline-offset-4 hover:underline"
                >
                  cookies page
                </Link>
                .
              </p>
            </Section>

            <Section id="retention" title="6. Data retention">
              <p>
                We retain account data, debate content, reports and enquiries for the purposes described above. Retention can differ for support, safety, legal obligations and backups. Contact us for information about retention or to request deletion. The dashboard display period is not a promise that underlying records have been deleted.
              </p>
            </Section>

            <Section id="rights" title="7. Your rights">
              <p>
                Depending on where you live, you may have the right to access,
                correct, export, or delete your personal data, and to object to or
                restrict certain processing. You can:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Edit your username, email, and password from your{" "}
                  <Link
                    href="/settings"
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    account settings
                  </Link>
                  .
                </li>
                <li>Request account deletion from settings. Some records may need separate handling; contact us about associated data.</li>
                <li>
                  Withdraw analytics consent any time by clearing cookies or
                  updating your choice in the cookie banner.
                </li>
              </ul>
              <p>
                You may also complain to the UK Information Commissioner&apos;s Office or your relevant data protection authority. To exercise a right, use our{" "}
                <Link href="/contact" className="text-accent underline-offset-4 hover:underline">contact form</Link>
                {SITE.supportEmail && <> or email <a href={`mailto:${SITE.supportEmail}`} className="text-accent underline-offset-4 hover:underline">{SITE.supportEmail}</a></>}.
              </p>
            </Section>

            <Section id="security" title="8. How we protect your data">
              <p>
                We use access controls and other measures intended to protect personal data. No system can guarantee absolute security.
              </p>
            </Section>

            <Section id="children" title="9. Children">
              <p>
                If you believe a child has provided personal data through {SITE.name}, please contact us so we can investigate and take appropriate action.
              </p>
            </Section>

            <Section id="changes" title="10. Changes to this policy">
              <p>
                We may update this policy as the service evolves. Material changes
                will be reflected by the &ldquo;last updated&rdquo; date above, and
                where appropriate we will notify you in the app.
              </p>
            </Section>

            <Section id="contact" title="11. Contact us">
              <p>
                Questions about your privacy? Use our{" "}
                <Link href="/contact" className="text-accent underline-offset-4 hover:underline">contact form</Link>
                {SITE.supportEmail && <> or email <a href={`mailto:${SITE.supportEmail}`} className="text-accent underline-offset-4 hover:underline">{SITE.supportEmail}</a></>}.
                {" "}{SITE.responseTimePromise}
              </p>
            </Section>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
