"use client";

import { setStoredConsent } from "@/lib/cookieConsent";

// Clears the stored choice, which makes the consent banner reappear
// immediately (it listens for this same change event) — this is how a
// visitor changes their mind after already accepting or rejecting.
export function CookiePreferencesButton() {
  return (
    <button
      onClick={() => setStoredConsent(null)}
      className="text-sm text-muted transition-colors hover:text-cream"
    >
      Cookie preferences
    </button>
  );
}
