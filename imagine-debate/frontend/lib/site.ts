// Central place for site-wide identity, links, and public copy.
// Values that differ per environment come from NEXT_PUBLIC_* vars so the same
// build works locally and in production. Safe to import from server or client.

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const RAW_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://imagine-debate.vercel.app";

export const SITE = {
  name: "Imagine Debate",
  tagline: "Debate without the noise.",
  description:
    "Structured, timed 1-v-1 debate rooms. Create a motion, invite an opponent, and make your case in clean rounds judged for clarity, logic, and rebuttal.",
  url: stripTrailingSlash(RAW_URL),
  // Where debate enquiries and support requests are answered.
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  // Avoid a fixed response-time promise until support coverage is established.
  responseTimePromise: "We aim to respond as soon as we can.",
  locale: "en_GB",
} as const;

export function absoluteUrl(path = "/"): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${SITE.url}${suffix}`;
}

// Primary navigation shown in marketing headers/footers. Keeping it here means
// every page links to the same set of routes (good for internal linking + SEO).
export const PRIMARY_NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/debate/create", label: "Start a debate" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export const FOOTER_NAV: ReadonlyArray<{
  heading: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}> = [
  {
    heading: "Debate",
    links: [
      { href: "/debate/create", label: "Start a debate" },
      { href: "/debate/join", label: "Join a debate" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact us" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/community", label: "Community rules" },
      { href: "/cookies", label: "Cookies" },
    ],
  },
];
