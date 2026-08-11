"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/supabaseClient";
import {
  evaluatePassword,
  PasswordStrengthMeter,
} from "@/components/PasswordStrength";

export default function SignupPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidUsername = username.length >= 3 && username.length <= 20;
  const passwordStrength = evaluatePassword(password);
  const passwordsMatch = password === confirmPassword && password !== "";
  const isFormValid =
    isValidUsername &&
    isValidEmail &&
    passwordStrength.isAcceptable &&
    passwordsMatch;

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isValidUsername) {
      setError("Username must be 3–20 characters.");
      return;
    }
    if (!isValidEmail) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!passwordStrength.isAcceptable) {
      setError("Please choose a stronger password.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
    } else {
      setSuccess(
        "Account created. Check your email to verify your address, then sign in and start debating."
      );
      setTimeout(() => {
        setUsername("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      }, 1500);
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
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-muted-2">
              Free to join. Start debating in under a minute.
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

          <form onSubmit={handleSignup} className="space-y-5" noValidate>
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-cream">
                Username
              </label>
              <input
                id="username"
                type="text"
                placeholder="debater_pro"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoComplete="username"
                className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 text-sm text-cream placeholder:text-muted-2/60 focus:border-accent focus:outline-none disabled:opacity-60"
              />
              {username && !isValidUsername && (
                <p className="mt-1.5 text-xs text-rose-300">3–20 characters required.</p>
              )}
            </div>

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
                disabled={loading}
                autoComplete="email"
                className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 text-sm text-cream placeholder:text-muted-2/60 focus:border-accent focus:outline-none disabled:opacity-60"
              />
              {email && !isValidEmail && (
                <p className="mt-1.5 text-xs text-rose-300">Please enter a valid email.</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-cream">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 pr-16 text-sm text-cream placeholder:text-muted-2/60 focus:border-accent focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-2 hover:text-cream"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <PasswordStrengthMeter password={password} />
            </div>

            <div>
              <label htmlFor="confirm" className="mb-2 block text-sm font-medium text-cream">
                Confirm password
              </label>
              <input
                id="confirm"
                type={showPassword ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                autoComplete="new-password"
                className="w-full rounded-lg border border-line bg-black/20 px-4 py-3 text-sm text-cream placeholder:text-muted-2/60 focus:border-accent focus:outline-none disabled:opacity-60"
              />
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1.5 text-xs text-rose-300">Passwords do not match.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="w-full rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-2">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-semibold text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-muted-2">
          By creating an account you agree to our{" "}
          <Link href="/privacy" className="underline-offset-4 hover:text-cream hover:underline">
            privacy policy
          </Link>{" "}
          and{" "}
          <Link href="/cookies" className="underline-offset-4 hover:text-cream hover:underline">
            cookie use
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
