import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MarketingHeader } from "@/components/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Community rules",
  description: "How to debate respectfully and report a concern on Imagine Debate.",
  alternates: { canonical: "/community" },
};

export default function CommunityPage() {
  return (
    <div className="flex min-h-screen flex-col bg-ink text-cream">
      <MarketingHeader />
      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:py-16">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Community rules" }]} />
        <p className="eyebrow">Debate with respect</p>
        <h1 className="mt-4 font-serif text-4xl text-[#fffaf0] sm:text-5xl">Community rules</h1>
        <p className="mt-4 text-sm text-muted-2">Last updated: 20 November 2026</p>
        <div className="mt-8 space-y-6 text-sm leading-7 text-muted">
          <p>Challenge ideas, not people. These rules apply to your username, topics, messages and other content you submit.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Do not threaten, harass, bully or repeatedly target another person.</li>
            <li>Do not attack people because of protected characteristics or encourage violence or hatred.</li>
            <li>Do not share private information about someone without permission, impersonate others, or use the service to spam or scam.</li>
            <li>Do not post illegal content or attempt to bypass safety measures.</li>
          </ul>
          <p>We use an automated language filter on debate messages. It can make mistakes and does not catch every form of abuse. Please do not rely on it as the only safeguard.</p>
          <h2 className="font-serif text-xl text-cream">Report a concern</h2>
          <p>Use the report option in a debate room to describe what happened, or <Link href="/contact" className="text-accent hover:underline">contact us</Link>{SITE.supportEmail && <> at <a href={`mailto:${SITE.supportEmail}`} className="text-accent hover:underline">{SITE.supportEmail}</a></>}. Include the room code and relevant details, but avoid sharing unnecessary personal information.</p>
          <p>We may review reports and take action, including restricting access, where appropriate. Reports and account details are handled as explained in our <Link href="/privacy" className="text-accent hover:underline">privacy policy</Link>.</p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
