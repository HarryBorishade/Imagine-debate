// Shared helper for firing custom GA4 events from anywhere in the app.
// Safe to call unconditionally — it's a no-op whenever analytics hasn't
// loaded (no measurement ID configured, or the visitor hasn't accepted
// cookies yet), matching the same gating GoogleAnalytics.tsx already
// applies to pageviews.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  if (!GA_MEASUREMENT_ID) return;

  window.gtag("event", name, {
    ...params,
    send_to: GA_MEASUREMENT_ID,
  });
}
