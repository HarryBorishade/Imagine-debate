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
    <div className="min-h-screen bg-ink text-cream flex flex-col">

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-ink/95 backdrop-blur border-b border-line">
        <div className="max-w-md mx-auto px-6 h-16 flex items-center gap-3">
          <Link
            href="/"
            className="text-muted-2 hover:text-cream transition-colors text-sm"
          >
            ← Home
          </Link>
          <span className="text-muted-2/40">/</span>
          <span className="text-muted text-sm">Join debate</span>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">

          {/* Header */}
          <div className="mb-10 text-center">
            <p className="eyebrow mb-4 justify-center">Room code</p>
            <h1 className="font-serif text-3xl tracking-tight mb-2">
              Enter your code
            </h1>
            <p className="text-muted text-sm leading-relaxed">
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
                    className={`h-16 border flex items-center justify-center text-2xl font-semibold font-mono transition-colors ${
                      i === digits.length
                        ? "border-accent bg-accent/10 text-cream"
                        : digits[i]
                        ? "border-line-strong bg-surface-2 text-cream"
                        : "border-line bg-surface text-muted-2/50"
                    }`}
                  >
                    {digits[i] ?? (i === digits.length ? (
                      <span className="w-0.5 h-6 bg-accent animate-pulse" />
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
          <p className="text-center text-xs text-muted-2 mb-8">
            Tap the boxes and type your code
          </p>

          {/* Join button */}
          <button
            onClick={handleJoin}
            disabled={code.length !== 4 || loading}
            className="w-full px-5 py-3.5 bg-accent hover:bg-accent-strong disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-[#0d1117] text-sm font-semibold transition-colors mb-3"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border border-black/20 border-t-black/60 rounded-full animate-spin" />
                Checking…
              </span>
            ) : (
              "Join debate →"
            )}
          </button>

          <Link
            href="/dashboard"
            className="block w-full text-center px-5 py-3 bg-surface hover:bg-surface-2 border border-line text-muted hover:text-cream text-sm font-medium transition-colors"
          >
            Back to dashboard
          </Link>

          {/* Divider */}
          <div className="mt-10 pt-8 border-t border-line text-center">
            <p className="text-xs text-muted-2 mb-3">Don&apos;t have a code?</p>
            <Link
              href="/debate/create"
              className="text-sm text-accent hover:text-accent-strong transition-colors font-medium"
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
