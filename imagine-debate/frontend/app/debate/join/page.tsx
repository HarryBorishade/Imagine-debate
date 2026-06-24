"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";

export default function JoinDebate() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    const trimmed = code.trim();

    if (!trimmed) {
      setError("Please enter a debate code");
      return;
    }

    if (!/^\d{4}$/.test(trimmed)) {
      setError("Debate code must be exactly 4 digits");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const { data, error: fetchError } = await supabase
        .from("debates")
        .select("id, status")
        .eq("id", trimmed)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!data) {
        setError("Debate not found. Check the code and try again.");
        setLoading(false);
        return;
      }

      if (data.status === "finished") {
        setError("This debate has already finished.");
        setLoading(false);
        return;
      }

      // NOTE: We intentionally do NOT block on status === "active" here.
      // The socket server is the source of truth for room capacity and active state.
      // Blocking here based on DB status causes false positives because the DB
      // status field may not be kept in sync with in-memory socket state.
      // The socket server will emit a join_error if the room is truly full or active.

      router.push(`/debate/${trimmed}/lobby`);
    } catch (err: any) {
      setError(err.message || "Failed to look up debate");
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleJoin();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-8">
          <h1 className="text-3xl font-bold text-white mb-2">Join a Debate</h1>
          <p className="text-slate-300 mb-8">
            Enter the 4-digit code shared by your opponent.
          </p>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Debate Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                setCode(val);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="e.g. 2045"
              maxLength={4}
              inputMode="numeric"
              className="w-full rounded-lg bg-slate-600 text-white text-center text-2xl font-bold px-4 py-4 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest"
            />
            <p className="text-slate-400 text-xs mt-2">
              Ask your opponent for their 4-digit debate code
            </p>
          </div>

          {error && (
            <div className="mb-6 bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-300 text-sm">
              ⚠️ {error}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleJoin}
              disabled={code.length !== 4 || loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-semibold transition-all"
            >
              {loading ? "Checking code..." : "Join Debate"}
            </button>

            <button
              onClick={() => router.push("/dashboard")}
              className="w-full bg-slate-600 hover:bg-slate-500 text-white px-6 py-3 rounded-lg font-semibold transition-all"
            >
              Back to Dashboard
            </button>
          </div>

          <div className="mt-8 bg-blue-500/20 border border-blue-500 rounded-lg p-4">
            <p className="text-blue-300 text-sm">
              <strong>💡 How it works:</strong> When someone creates a debate,
              they'll see a 4-digit code in the lobby. Enter that code here to
              join them.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}