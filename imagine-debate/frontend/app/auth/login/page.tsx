"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resetting, setResetting] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isFormValid = isValidEmail && password.length > 0;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      setSuccess("Signed in. Redirecting…");
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 800);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setSuccess("");

    if (!isValidEmail) {
      setError("Enter your email above first, then tap “Forgot password”.");
      return;
    }

    setResetting(true);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/settings`
        : undefined;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined
    );

    setResetting(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccess(
        "If that email has an account, we’ve sent a link to reset your password."
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink px-4 py-10 text-cream">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-block text-sm font-semibold tracking-tight text-cream"
        >
          ← Imagine Debate
        </Link>

        <div className="rounded-2xl border border-line bg-surface p-7 sm:p-9">
          <div className="mb-7">
            <h1 className="text-2xl font-semibold tracking-tight text-[#fffaf0]">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-muted-2">
              Sign in to pick up where you left off.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-against/30 bg-against/10 px-4 py-3 text-sm text-rose-200"
            >
              {error}
            </div>
          )}

          {success && (
            <div className="mb-5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-emerald-200">
              {success}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-cream">
                Email address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 text-sm text-cream placeholder:text-muted-2/60 focus:border-accent focus:outline-none"
              />
              {email && !isValidEmail && (
                <p className="mt-1.5 text-xs text-rose-300">Please enter a valid email.</p>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-cream">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetting}
                  className="text-xs font-medium text-muted-2 hover:text-accent disabled:opacity-60"
                >
                  {resetting ? "Sending…" : "Forgot password?"}
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 pr-16 text-sm text-cream placeholder:text-muted-2/60 focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-2 hover:text-cream"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="w-full rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-2">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="font-semibold text-accent hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
