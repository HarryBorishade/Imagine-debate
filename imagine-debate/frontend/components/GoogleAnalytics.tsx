"use client";

import { Suspense, useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import {
  subscribeToConsent,
  getConsentSnapshot,
  getConsentServerSnapshot,
} from "@/lib/cookieConsent";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

// Records a page_view on every client-side route change. gtag.js only fires
// its automatic page_view once, on script load — without this, an App
// Router SPA would only ever record a single pageview per visit.
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || typeof window.gtag !== "function") return;

    const query = searchParams.toString();

    window.gtag("event", "page_view", {
      page_path: query ? `${pathname}?${query}` : pathname,
      send_to: GA_MEASUREMENT_ID,
    });
  }, [pathname, searchParams]);

  return null;
}

// Loads Google Analytics only once the visitor has accepted optional
// cookies — never before, and never at all if no measurement ID is
// configured (NEXT_PUBLIC_GA_MEASUREMENT_ID). Rejecting, or simply not
// answering, means gtag.js is never injected and no request to Google is
// ever made.
export function GoogleAnalytics() {
  const consent = useSyncExternalStore(
    subscribeToConsent,
    getConsentSnapshot,
    getConsentServerSnapshot
  );

  // Google's own opt-out flag. This matters for the case where analytics
  // was already accepted (gtag.js loaded and running) and the visitor then
  // withdraws consent via "Cookie preferences" mid-session — simply no
  // longer rendering the <Script> tags stops new script injection, but
  // doesn't stop an already-loaded gtag instance from sending further hits.
  // Setting this flag does, and it's checked before any hit is sent.
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;

    window[`ga-disable-${GA_MEASUREMENT_ID}`] = consent !== "accepted";
  }, [consent]);

  if (!GA_MEASUREMENT_ID || consent !== "accepted") return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  );
}
