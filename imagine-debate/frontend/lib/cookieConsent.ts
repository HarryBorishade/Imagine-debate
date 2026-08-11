// Small localStorage-backed consent store, read via useSyncExternalStore so
// the banner and the analytics loader both stay correctly in sync with
// external (browser-only) state without any SSR/hydration mismatch, and
// without a manual setState-in-effect pattern.

export type ConsentValue = "accepted" | "rejected";

const STORAGE_KEY = "imagine-debate-cookie-consent";
const CHANGE_EVENT = "cookie-consent-changed";

function readConsent(): ConsentValue | null {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "accepted" || value === "rejected" ? value : null;
}

export function setStoredConsent(value: ConsentValue | null): void {
  if (typeof window === "undefined") return;

  if (value === null) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, value);
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** useSyncExternalStore subscribe function. */
export function subscribeToConsent(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/** useSyncExternalStore client snapshot. */
export function getConsentSnapshot(): ConsentValue | null {
  return readConsent();
}

/** useSyncExternalStore server snapshot — no choice is known during SSR. */
export function getConsentServerSnapshot(): ConsentValue | null {
  return null;
}
