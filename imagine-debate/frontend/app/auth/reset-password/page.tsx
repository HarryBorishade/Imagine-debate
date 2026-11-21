"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { evaluatePassword, PasswordStrengthMeter } from "@/components/PasswordStrength";
import { LocalAuthNotice } from "@/components/LocalAuthNotice";

type Status = "checking" | "ready" | "invalid" | "success";
const RECOVERY_MARKER = "imagine-debate-password-recovery";
const RECOVERY_WINDOW_MS = 15 * 60 * 1000;

function forgetRecovery() {
  try { sessionStorage.removeItem(RECOVERY_MARKER); } catch { /* Storage may be unavailable. */ }
}

function rememberRecovery(session: Session) {
  // A short-lived, tab-scoped UX marker; no password, email or token is copied here.
  try {
    sessionStorage.setItem(RECOVERY_MARKER, JSON.stringify({ userId: session.user.id, expires: Date.now() + RECOVERY_WINDOW_MS }));
  } catch { /* A valid link still works without storage; reload needs another link. */ }
}

function hasRecovery(session: Session) {
  try {
    const marker = JSON.parse(sessionStorage.getItem(RECOVERY_MARKER) || "null");
    return marker?.userId === session.user.id && typeof marker.expires === "number" && marker.expires > Date.now();
  } catch { return false; }
}

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const clientRef = useRef<SupabaseClient | null>(null);
  const completedRef = useRef(false);
  const strength = evaluatePassword(password);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const incomingToken = hash.get("type") === "recovery" && hash.get("refresh_token") ? hash.get("access_token") : null;

    // Load the shared client here so the recovery listener is attached while the
    // SDK validates the incoming link, rather than after a page-level import.
    void import("@/supabaseClient").then(({ supabase }) => {
      if (cancelled) return;
      clientRef.current = supabase;
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled || completedRef.current) return;
        if (session && (event === "PASSWORD_RECOVERY" ||
            (event === "INITIAL_SESSION" && (hasRecovery(session) || session.access_token === incomingToken)))) {
          if (event === "PASSWORD_RECOVERY" || session.access_token === incomingToken) rememberRecovery(session);
          window.history.replaceState(null, "", window.location.pathname);
          setStatus("ready");
        } else if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
          forgetRecovery();
          setStatus("invalid");
        }
        // Do not call Auth methods inside this callback: the SDK holds its lock.
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => { if (!cancelled) setStatus("invalid"); });

    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== "ready" || saving || !clientRef.current) return;
    setError("");
    if (!strength.isAcceptable) { setError("Please choose a stronger password."); return; }
    if (password !== confirm) { setError("The new passwords do not match."); return; }
    setSaving(true);
    try {
      const { error: updateError } = await clientRef.current.auth.updateUser({ password });
      if (updateError) { setError(updateError.message); return; }
      completedRef.current = true;
      forgetRecovery();
      setPassword(""); setConfirm("");
      await clientRef.current.auth.signOut({ scope: "local" });
      setStatus("success");
    } catch {
      setError("The password could not be updated. Try again, or request a fresh reset link.");
    } finally { setSaving(false); }
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink px-4 py-10 text-cream">
      <main className="mx-auto w-full max-w-md">
        <Link href="/" className="eyebrow mb-10 inline-flex">Imagine Debate</Link>
        <div className="card-panel p-7 sm:p-9">
          <h1 className="mb-3 font-serif text-3xl text-[#fffaf0]">Choose a new password</h1>
          <LocalAuthNotice />
          {status === "checking" && <p role="status" className="text-muted">Checking your reset link…</p>}
          {status === "invalid" && (
            <div role="alert" className="text-sm leading-6 text-muted">
              <p>This reset link is missing, expired or already used. Request a fresh link from the sign-in page.</p>
              <Link href="/auth/login" className="mt-4 inline-block font-semibold text-accent">Back to sign in</Link>
            </div>
          )}
          {status === "success" && (
            <div role="status" className="text-sm leading-6 text-emerald-200">
              <p>Password updated. You can now sign in with your new password.</p>
              <Link href="/auth/login" className="mt-4 inline-block font-semibold text-accent">Sign in</Link>
            </div>
          )}
          {status === "ready" && (
            <form onSubmit={submit} className="space-y-5">
              <p className="text-sm text-muted">Your reset link verified your account. You do not need your old password.</p>
              {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
              <div>
                <label htmlFor="new-password" className="mb-2 block text-sm font-medium">New password</label>
                <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={saving} className="w-full rounded-lg border border-line bg-black/20 px-4 py-3" />
                <PasswordStrengthMeter password={password} />
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-2 block text-sm font-medium">Confirm new password</label>
                <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={saving} className="w-full rounded-lg border border-line bg-black/20 px-4 py-3" />
              </div>
              <button type="submit" disabled={saving || !strength.isAcceptable || password !== confirm} className="w-full rounded-lg bg-accent px-5 py-3 font-semibold text-[#0d1117] disabled:opacity-50">{saving ? "Updating…" : "Update password"}</button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
