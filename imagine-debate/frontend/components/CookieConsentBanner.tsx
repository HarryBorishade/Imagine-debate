"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  subscribeToConsent,
  getConsentSnapshot,
  getConsentServerSnapshot,
  setStoredConsent,
} from "@/lib/cookieConsent";

export function CookieConsentBanner() {
  const consent = useSyncExternalStore(
    subscribeToConsent,
    getConsentSnapshot,
    getConsentServerSnapshot
  );

  if (consent !== null) return null;

  return (
    <div
      role="region"
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-accent bg-surface/98 px-5 py-4 shadow-2xl shadow-black/40 backdrop-blur sm:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-muted">
          We use strictly necessary storage to run the app, plus optional
          analytics cookies to understand usage — only if you agree. See our{" "}
          <Link href="/cookies" className="text-accent underline-offset-4 hover:underline">
            cookies page
          </Link>
          .
        </p>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setStoredConsent("rejected")}
            className="border border-line-strong px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-white/5"
          >
            Reject
          </button>
          <button
            onClick={() => setStoredConsent("accepted")}
            className="bg-accent px-4 py-2 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
