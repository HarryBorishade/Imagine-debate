"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/supabaseClient";

const OUTCOME_STEPS = [
  "Collecting final arguments",
  "Preparing appraisal",
  "Waiting for AI review",
] as const;

type DebateSide = "for" | "against";
type Verdict = DebateSide | "draw";
type AppraisalStatus =
  | "not_ready"
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | null;

interface JudgeScore {
  logic: number;
  evidence: number;
  rebuttal: number;
  clarity: number;
  conduct: number;
  total: number;
}

interface DebateAppraisal {
  canary?: string;
  winner: Verdict;
  scores: {
    for: JudgeScore;
    against: JudgeScore;
  };
  summary: string;
  feedback: {
    for: string;
    against: string;
  };
  confidence: number;
  requires_stronger_review?: boolean;
  model?: string;
  attempts?: number;
  initially_escalated?: boolean;
  judged_at?: string;
  pipeline_version?: string;
}

interface DebateRow {
  topic: string | null;
  appraisal_status: AppraisalStatus;
  appraisal_error: string | null;
  appraisal_result: DebateAppraisal | null;
}

function isDebateSide(value: string | null): value is DebateSide {
  return value === "for" || value === "against";
}

async function readFunctionError(error: unknown): Promise<string> {
  const fallback = "Could not generate the judgement.";

  if (!error || typeof error !== "object") {
    return fallback;
  }

  const possibleError = error as {
    message?: string;
    context?: Response;
  };

  if (possibleError.context instanceof Response) {
    try {
      const responseBody = await possibleError.context.clone().json();

      if (typeof responseBody?.error === "string") {
        return responseBody.error;
      }

      if (typeof responseBody?.message === "string") {
        return responseBody.message;
      }

      return JSON.stringify(responseBody);
    } catch {
      try {
        const responseText = await possibleError.context.clone().text();

        if (responseText.trim()) {
          return responseText;
        }
      } catch {
        // Fall back to the standard error message below.
      }
    }
  }

  return possibleError.message || fallback;
}

export default function DebateOutcomeWaiting() {
  const params = useParams();
  const router = useRouter();

  const rawDebateId = params.debateId;
  const debateId =
    typeof rawDebateId === "string"
      ? rawDebateId
      : Array.isArray(rawDebateId)
        ? rawDebateId[0] ?? ""
        : "";

  const isValidDebateId = /^\d{4}$/.test(debateId);

  const [debateName, setDebateName] = useState("");
  const [mySide, setMySide] = useState<DebateSide | null>(null);
  const [secondsWaiting, setSecondsWaiting] = useState(0);
  const [appraisalStatus, setAppraisalStatus] =
    useState<AppraisalStatus>(null);
  const [judgement, setJudgement] =
    useState<DebateAppraisal | null>(null);
  const [judgeError, setJudgeError] = useState("");
  const [judging, setJudging] = useState(false);
  const initialJudgementStarted = useRef(false);

  useEffect(() => {
    if (!isValidDebateId) {
      router.replace("/debate/create");
    }
  }, [isValidDebateId, router]);

  useEffect(() => {
    if (!isValidDebateId) return;

    const storedTopic = sessionStorage.getItem(
      `debate_${debateId}_topic`
    );

    const storedSide = sessionStorage.getItem(
      `debate_${debateId}_side`
    );

    if (storedTopic) {
      setDebateName(storedTopic);
    }

    if (isDebateSide(storedSide)) {
      setMySide(storedSide);
    }
  }, [debateId, isValidDebateId]);

  const loadDebateState = useCallback(async (): Promise<DebateRow | null> => {
    if (!isValidDebateId) return null;

    const { data, error } = await supabase
      .from("debates")
      .select(
        "topic, appraisal_status, appraisal_error, appraisal_result"
      )
      .eq("id", debateId)
      .maybeSingle();

    if (error) {
      setJudgeError(
        `Could not load the debate outcome: ${error.message}`
      );
      return null;
    }

    if (!data) {
      setJudgeError("This debate could not be found.");
      return null;
    }

    const debate = data as DebateRow;

    if (debate.topic) {
      setDebateName(debate.topic);
    }

    setAppraisalStatus(debate.appraisal_status);

    if (
      debate.appraisal_status === "completed" &&
      debate.appraisal_result
    ) {
      setJudgement(debate.appraisal_result);
      setJudgeError("");
    } else if (
      debate.appraisal_status === "failed" &&
      debate.appraisal_error
    ) {
      setJudgeError(debate.appraisal_error);
    }

    return debate;
  }, [debateId, isValidDebateId]);

  const runJudgement = useCallback(async () => {
    if (!isValidDebateId || judging) return;

    setJudging(true);
    setJudgeError("");
    setAppraisalStatus("processing");

    try {
      const { data, error } = await supabase.functions.invoke(
        "judge-debate",
        {
          body: {
            debateId,
          },
        }
      );

      if (error) {
        const detailedError = await readFunctionError(error);
        setJudgeError(detailedError);
        await loadDebateState();
        return;
      }

      const appraisal = data?.appraisal as
        | DebateAppraisal
        | undefined;

      if (!appraisal) {
        setJudgeError(
          data?.error ||
            "The AI judge completed without returning an appraisal."
        );
        await loadDebateState();
        return;
      }

      setJudgement(appraisal);
      setAppraisalStatus("completed");
      setJudgeError("");
    } catch (error) {
      setJudgeError(
        error instanceof Error
          ? error.message
          : "An unexpected judgement error occurred."
      );

      await loadDebateState();
    } finally {
      setJudging(false);
    }
  }, [
    debateId,
    isValidDebateId,
    judging,
    loadDebateState,
  ]);

  useEffect(() => {
    if (!isValidDebateId) return;

    void loadDebateState().then((debate) => {
      if (
        !debate ||
        initialJudgementStarted.current ||
        debate.appraisal_status === "completed"
      ) {
        return;
      }

      initialJudgementStarted.current = true;
      void runJudgement();
    });
  }, [isValidDebateId, loadDebateState, runJudgement]);

  useEffect(() => {
    if (
      !isValidDebateId ||
      judgement ||
      appraisalStatus !== "processing"
    ) {
      return;
    }

    const poller = window.setInterval(() => {
      void loadDebateState();
    }, 3000);

    return () => window.clearInterval(poller);
  }, [
    appraisalStatus,
    isValidDebateId,
    judgement,
    loadDebateState,
  ]);

  useEffect(() => {
    if (!isValidDebateId || judgement) return;

    const timer = window.setInterval(() => {
      setSecondsWaiting((previous) => previous + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isValidDebateId, judgement]);

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
      ? "The debate is a draw"
      : judgement?.winner === "for"
        ? "FOR wins"
        : judgement?.winner === "against"
          ? "AGAINST wins"
          : "The debate is complete";

  const waitingMessage =
    appraisalStatus === "processing"
      ? "The AI judge is reviewing the saved arguments."
      : appraisalStatus === "pending"
        ? "The debate is queued and ready for AI review."
        : "The final arguments are in. Keep this page open while the AI judge appraises the debate.";

  if (!isValidDebateId) return null;

  return (
    <div className="min-h-screen bg-ink text-cream">
      <header className="border-b border-line bg-surface/90 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-xl tracking-tight text-[#fffaf0]">
              {debateName || `Debate #${debateId}`}
            </h1>

            <p className="mt-0.5 text-sm text-muted">
              {mySide ? (
                <>
                  You argued{" "}
                  <span
                    className={`font-semibold ${
                      mySide === "for"
                        ? "text-emerald-400"
                        : "text-rose-400"
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
            className="border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-white/8 hover:text-cream"
          >
            Dashboard
          </button>
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6 py-10">
        <div className="w-full max-w-2xl">
          <div className="border-t-2 border-accent bg-surface p-8 text-center shadow-2xl shadow-black/40 sm:p-12">
            <div className="mx-auto mb-8 flex h-16 w-16 items-center justify-center border border-line bg-black/20">
              <div className="relative h-10 w-10">
                {judgement ? (
                  <div className="flex h-10 w-10 items-center justify-center text-xs font-bold text-emerald-300">
                    OK
                  </div>
                ) : judgeError ? (
                  <div className="flex h-10 w-10 items-center justify-center text-sm font-bold text-rose-300">
                    !
                  </div>
                ) : (
                  <>
                    <div className="absolute inset-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                    <div
                      className="absolute inset-2 animate-spin rounded-full border-2 border-line-strong border-b-transparent"
                      style={{ animationDirection: "reverse" }}
                    />
                  </>
                )}
              </div>
            </div>

            <p className="eyebrow mb-4 justify-center">
              {judgement ? "Outcome ready" : "Waiting for outcome"}
            </p>

            <h2 className="mb-4 font-serif text-3xl tracking-tight text-[#fffaf0] sm:text-4xl">
              {judgement ? winnerLabel : "The debate is complete"}
            </h2>

            <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted">
              {judgement
                ? judgement.summary ||
                  "The AI judge has appraised the debate."
                : judgeError || waitingMessage}
            </p>

            {!judgement && (
              <div className="mb-8 border border-line bg-black/20 p-5">
                <div className="mb-4 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-[#c7c0b3]">
                    Outcome status
                  </span>

                  <span className="font-mono text-muted">
                    {waitingTime}
                  </span>
                </div>

                <div className="mb-5 h-1 overflow-hidden bg-black/30">
                  <div className="h-full w-2/3 bg-accent transition-all" />
                </div>

                <div className="grid gap-3 text-left sm:grid-cols-3">
                  {OUTCOME_STEPS.map((step, index) => (
                    <div
                      key={step}
                      className={`border-l-2 px-3 py-3 ${
                        index < 2
                          ? "border-emerald-400/50 bg-emerald-400/5 text-emerald-300"
                          : "border-accent bg-accent/5 text-accent"
                      }`}
                    >
                      <div className="dossier-index mb-2">
                        {index < 2 ? "Done" : "In progress"}
                      </div>

                      <p className="text-xs font-semibold leading-snug">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {judgement && (
              <div className="mb-8 grid gap-px border border-line bg-line text-left sm:grid-cols-2">
                <div className="bg-emerald-400/[0.06] p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
                    FOR
                  </p>

                  <p className="mt-2 font-serif text-2xl text-[#fffaf0]">
                    {judgement.scores?.for?.total ?? "-"} / 100
                  </p>

                  <p className="mt-3 text-sm leading-6 text-emerald-100/80">
                    {judgement.feedback?.for ||
                      "No feedback returned."}
                  </p>
                </div>

                <div className="bg-rose-400/[0.06] p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-rose-300">
                    AGAINST
                  </p>

                  <p className="mt-2 font-serif text-2xl text-[#fffaf0]">
                    {judgement.scores?.against?.total ?? "-"} / 100
                  </p>

                  <p className="mt-3 text-sm leading-6 text-rose-100/80">
                    {judgement.feedback?.against ||
                      "No feedback returned."}
                  </p>
                </div>
              </div>
            )}

            {judgeError && !judgement && (
              <button
                onClick={() => {
                  void runJudgement();
                }}
                disabled={judging}
                className="mr-3 bg-accent px-6 py-3 text-sm font-semibold text-[#0d1117] transition-colors hover:bg-accent-strong disabled:bg-white/10 disabled:text-white/30"
              >
                {judging ? "Retrying…" : "Retry judgement"}
              </button>
            )}

            <button
              onClick={returnToDashboard}
              className="border border-line px-6 py-3 text-sm font-semibold text-cream transition-colors hover:bg-white/8"
            >
              Return to Dashboard
            </button>

            {judgement?.model && (
              <p className="mt-5 text-xs text-muted-2">
                Judged with {judgement.model}
                {judgement.attempts
                  ? ` · ${judgement.attempts} appraisal ${
                      judgement.attempts === 1 ? "pass" : "passes"
                    }`
                  : ""}
                {judgement.pipeline_version
                  ? ` · Pipeline ${judgement.pipeline_version}`
                  : ""}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}