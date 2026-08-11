"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/supabaseClient";

function JoinDebateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // FIX: Only pre-fill from ?code= param, and only if it's exactly 4 digits.
  // Previously this also checked ?topic= which could receive slugs like "ai-finance".
  useEffect(() => {
    const codeParam = searchParams.get("code");
    if (codeParam && /^\d{4}$/.test(codeParam)) {
      setCode(codeParam);
    }
  }, [searchParams]);

  const handleJoin = async () => {
    const trimmed = code.trim();

    if (!trimmed) {
      setError("Please enter a debate code.");
      return;
    }

    if (!/^\d{4}$/.test(trimmed)) {
      setError("Code must be exactly 4 digits.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const { data, error: fetchError } = await supabase.rpc(
        "check_debate_code",
        { p_code: trimmed }
      );

      if (fetchError) throw fetchError;

      const match = data?.[0];

      if (!match) {
        setError("No debate found with that code. Double-check and try again.");
        setLoading(false);
        return;
      }

      if (match.status === "completed") {
        setError("This debate has already finished.");
        setLoading(false);
        return;
      }

      router.push(`/debate/${trimmed}/lobby`);
    } catch (err: any) {
      setError(err.message || "Failed to look up debate.");
      setLoading(false);
    }
  };

  const digits = code.split("");

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col">

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-[#0d1117]/80 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-md mx-auto px-6 h-16 flex items-center gap-3">
          <Link
            href="/"
            className="text-white/40 hover:text-white/70 transition-colors text-sm"
          >
            ← Home
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-white/60 text-sm">Join debate</span>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Enter your code
            </h1>
            <p className="text-white/40 text-sm leading-relaxed">
              Ask your opponent for their 4-digit room code.
            </p>
          </div>

          {/* Code input — large digit display */}
          <div className="mb-3">
            <div className="relative">
              {/* Visual digit boxes */}
              <div className="grid grid-cols-4 gap-3 mb-3" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`h-16 rounded-xl border flex items-center justify-center text-2xl font-bold font-mono transition-all ${
                      i === digits.length
                        ? "border-indigo-500 bg-indigo-600/10"
                        : digits[i]
                        ? "border-white/[0.15] bg-white/[0.06] text-white"
                        : "border-white/[0.07] bg-white/[0.02] text-white/20"
                    }`}
                  >
                    {digits[i] ?? (i === digits.length ? (
                      <span className="w-0.5 h-6 bg-indigo-400 animate-pulse rounded-full" />
                    ) : "·")}
                  </div>
                ))}
              </div>

              {/* Hidden real input overlaid on top */}
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => {
                  // FIX: strip non-digits explicitly — previously used toUpperCase()
                  // which allowed letters through and caused bad codes
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setCode(val);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && code.length === 4) handleJoin();
                }}
                autoFocus
                maxLength={4}
                aria-label="4-digit debate code"
                className="absolute inset-0 w-full h-full opacity-0 cursor-text"
              />
            </div>

            {error && (
              <p className="text-sm text-rose-400 text-center mt-2">{error}</p>
            )}
          </div>

          {/* Tap to focus hint */}
          <p className="text-center text-xs text-white/20 mb-8">
            Tap the boxes and type your code
          </p>

          {/* Join button */}
          <button
            onClick={handleJoin}
            disabled={code.length !== 4 || loading}
            className="w-full px-5 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/[0.06] disabled:text-white/20 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all mb-3"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border border-white/30 border-t-white/80 rounded-full animate-spin" />
                Checking…
              </span>
            ) : (
              "Join debate →"
            )}
          </button>

          <Link
            href="/dashboard"
            className="block w-full text-center px-5 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.07] text-white/50 hover:text-white text-sm font-medium transition-all"
          >
            Back to dashboard
          </Link>

          {/* Divider */}
          <div className="mt-10 pt-8 border-t border-white/[0.06] text-center">
            <p className="text-xs text-white/30 mb-3">Don't have a code?</p>
            <Link
              href="/debate/create"
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
            >
              Start your own debate →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JoinDebate() {
  return (
    <Suspense fallback={null}>
      <JoinDebateContent />
    </Suspense>
  );
}
