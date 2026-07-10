"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";

const OUTCOME_STEPS = [
  "Collecting final arguments",
  "Preparing appraisal",
  "Waiting for AI review",
] as const;

interface DebateJudgement {
  winner: "for" | "against" | "draw";
  confidence: number | null;
  scores?: {
    for?: { total?: number };
    against?: { total?: number };
  };
  summary: string | null;
  feedback_for: string | null;
  feedback_against: string | null;
}

export default function DebateOutcomeWaiting() {
  const params = useParams();
  const router = useRouter();
  const debateId = params.debateId as string;
  const isValidDebateId = /^\d{4}$/.test(debateId);

  const [debateName] = useState(() => {
    if (typeof window === "undefined" || !isValidDebateId) return "";

    return sessionStorage.getItem(`debate_${debateId}_topic`) || "";
  });
  const [mySide] = useState<"for" | "against" | null>(() => {
    if (typeof window === "undefined" || !isValidDebateId) return null;

    return sessionStorage.getItem(`debate_${debateId}_side`) as
      | "for"
      | "against"
      | null;
  });
  const [secondsWaiting, setSecondsWaiting] = useState(0);
  const [judgement, setJudgement] = useState<DebateJudgement | null>(null);
  const [judgeError, setJudgeError] = useState("");
  const [judging, setJudging] = useState(false);

  useEffect(() => {
    if (!isValidDebateId) {
      router.replace("/debate/create");
    }
  }, [isValidDebateId, router]);

  useEffect(() => {
    if (!isValidDebateId) return;

    const timer = window.setInterval(() => {
      setSecondsWaiting((prev) => prev + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [debateId, isValidDebateId]);

  const runJudgement = useCallback(async () => {
    setJudging(true);
    setJudgeError("");

    const { data, error } = await supabase.functions.invoke("judge-debate", {
      body: { debate_id: debateId },
    });

    if (error) {
      setJudgeError(error.message || "Could not generate the judgement.");
      setJudging(false);
      return;
    }

    if (!data?.judgement) {
      setJudgeError("The judge did not return a result.");
      setJudging(false);
      return;
    }

    setJudgement(data.judgement as DebateJudgement);
    setJudging(false);
  }, [debateId]);

  useEffect(() => {
    if (!isValidDebateId) return;

    const timer = window.setTimeout(() => {
      runJudgement();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isValidDebateId, runJudgement]);

  const waitingTime = useMemo(() => {
    const minutes = Math.floor(secondsWaiting / 60);
    const seconds = secondsWaiting % 60;

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, [secondsWaiting]);

  const returnToDashboard = () => {
    router.push("/dashboard");
  };

  const winnerLabel =
    judgement?.winner === "draw"
      ? "Draw"
      : judgement?.winner === "for"
      ? "FOR wins"
      : "AGAINST wins";

  if (!isValidDebateId) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <header className="border-b border-slate-700 bg-slate-800/90 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {debateName || `Debate #${debateId}`}
            </h1>

            <p className="mt-0.5 text-sm text-slate-400">
              {mySide ? (
                <>
                  You argued{" "}
                  <span
                    className={`font-semibold ${
                      mySide === "for" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {mySide === "for" ? "FOR" : "AGAINST"}
                  </span>
                </>
              ) : (
                "Debate completed"
              )}
            </p>
          </div>

          <button
            onClick={returnToDashboard}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-600 hover:text-white"
          >
            Dashboard
          </button>
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6 py-10">
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl border border-slate-700 bg-slate-800/80 p-8 text-center shadow-2xl sm:p-12">
            <div
              className={`mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border ${
                judgement
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : judgeError
                  ? "border-red-500/30 bg-red-500/10"
                  : "border-blue-500/30 bg-blue-500/10"
              }`}
            >
              <div className="relative h-12 w-12">
                {judgement ? (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-bold text-emerald-300">
                    OK
                  </div>
                ) : judgeError ? (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-sm font-bold text-red-300">
                    !
                  </div>
                ) : (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                    <div
                      className="absolute inset-2 rounded-full border-2 border-emerald-400 border-b-transparent animate-spin"
                      style={{ animationDirection: "reverse" }}
                    />
                  </>
                )}
              </div>
            </div>

            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-300">
              {judgement ? "Outcome ready" : "Waiting for outcome"}
            </p>

            <h2 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {judgement ? winnerLabel : "The debate is complete"}
            </h2>

            <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-slate-400">
              {judgement
                ? judgement.summary || "The AI judge has appraised the debate."
                : judgeError
                ? judgeError
                : "The final arguments are in. Keep this page open while the AI judge appraises the debate."}
            </p>

            {!judgement && (
              <div className="mb-8 rounded-xl border border-slate-700 bg-slate-900/60 p-5">
              <div className="mb-4 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-300">
                  Outcome status
                </span>

                <span className="font-mono text-slate-400">{waitingTime}</span>
              </div>

              <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-700">
                <div className="h-full w-2/3 rounded-full bg-blue-500 transition-all" />
              </div>

              <div className="grid gap-3 text-left sm:grid-cols-3">
                {OUTCOME_STEPS.map((step, index) => (
                  <div
                    key={step}
                    className={`rounded-lg border px-3 py-3 ${
                      index < 2
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : "border-blue-500/25 bg-blue-500/10 text-blue-300"
                    }`}
                  >
                    <div className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                      {index < 2 ? "OK" : "..."}
                    </div>

                    <p className="text-xs font-semibold leading-snug">{step}</p>
                  </div>
                ))}
              </div>
            </div>
            )}

            {judgement && (
              <div className="mb-8 grid gap-3 text-left sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
                    FOR
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {judgement.scores?.for?.total ?? "-"} / 50
                  </p>
                  <p className="mt-3 text-sm leading-6 text-emerald-100/80">
                    {judgement.feedback_for || "No feedback returned."}
                  </p>
                </div>

                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-red-300">
                    AGAINST
                  </p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {judgement.scores?.against?.total ?? "-"} / 50
                  </p>
                  <p className="mt-3 text-sm leading-6 text-red-100/80">
                    {judgement.feedback_against || "No feedback returned."}
                  </p>
                </div>
              </div>
            )}

            {judgeError && !judgement && (
              <button
                onClick={runJudgement}
                disabled={judging}
                className="mr-3 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500"
              >
                {judging ? "Retrying..." : "Retry judgement"}
              </button>
            )}

            <button
              onClick={returnToDashboard}
              className="rounded-xl bg-slate-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-600"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
