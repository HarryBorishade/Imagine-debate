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
      className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-line bg-surface/98 px-5 py-4 shadow-[var(--shadow-card-lg)] backdrop-blur sm:inset-x-6 sm:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-muted">
          We use strictly necessary storage to run the app, plus optional
          analytics cookies to understand usage, only if you agree. See our{" "}
          <Link href="/cookies" className="text-accent underline-offset-4 hover:underline">
            cookies page
          </Link>
          .
        </p>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setStoredConsent("rejected")}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-white/5"
          >
            Reject
          </button>
          <button
            onClick={() => setStoredConsent("accepted")}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
