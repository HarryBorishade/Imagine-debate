"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { supabase } from "@/supabaseClient";
import { getSocketUrl } from "@/lib/socketUrl";

interface Message {
  id?: number;
  debateId?: number;
  userId?: string;
  username?: string;
  side?: "for" | "against" | null;
  argumentPart?: string;
  argumentPartLabel?: string;
  stageIndex?: number;
  turnIndex?: number;
  content: string;
  timestamp?: string;
  system?: boolean;
}

interface DebateStage {
  argumentPart: string;
  label: string;
}

interface TurnPayload {
  debateId: string;
  debateName: string;
  currentTurnUserId: string;
  currentTurnUsername: string;
  currentSide: "for" | "against" | null;
  argumentPart: string | null;
  argumentPartLabel: string | null;
  stageIndex: number;
  speakerIndex: number;
  turnIndex: number;
  totalStages: number;
  secondsLeft: number;
  timePerTurn: number;
  resumed?: boolean;
}

interface DebateResult {
  reason: "opponent_disconnected" | "opponent_left";
  winner: { id: string; username: string };
  loser: { id: string; username: string };
}

interface GracePeriod {
  username: string;
  secondsLeft: number;
}

interface DebateStartedPayload {
  debateId: string;
  debateName: string;
  timePerTurn: number;
  players: Array<{
    id: string;
    username: string;
    side: "for" | "against";
  }>;
  stages?: DebateStage[];
  startTime: string | null;
  reconnect: boolean;
  currentTurnUserId?: string;
  secondsLeft?: number;
  argumentPart?: string | null;
  argumentPartLabel?: string | null;
  stageIndex?: number;
  turnIndex?: number;
}

type PageState = "loading" | "error" | "debate" | "result";

const GRACE_PERIOD_MAX = 15;
const MAX_MESSAGE_WORDS = 300;
const DRAFT_SYNC_DEBOUNCE_MS = 500;

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

// Loads the full transcript so far. Used on reconnect (page refresh, tab
// resume on mobile, etc.) so a player never loses the debate history that
// scrolled past before their browser dropped the socket connection. RLS
// scopes this to debate participants only, so it's safe to call with the
// public client.
async function fetchMessageHistory(debateId: string): Promise<Message[]> {
  const numericDebateId = Number(debateId);
  if (!Number.isSafeInteger(numericDebateId)) return [];

  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, debate_id, sender_id, sender_username, side, argument_part, stage_index, turn_index, content, created_at"
    )
    .eq("debate_id", numericDebateId)
    .order("turn_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    debateId: row.debate_id,
    userId: row.sender_id,
    username: row.sender_username,
    side: row.side,
    argumentPart: row.argument_part,
    stageIndex: row.stage_index,
    turnIndex: row.turn_index,
    content: row.content,
    timestamp: row.created_at,
  }));
}

export default function DebateRoom() {
  const params = useParams();
  const router = useRouter();
  const debateId = params.debateId as string;

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const userIdRef = useRef<string | null>(null);
  const joinedRef = useRef(false);
  const draftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [debateName, setDebateName] = useState("");
  const [mySide, setMySide] = useState<"for" | "against" | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const [gracePeriod, setGracePeriod] = useState<GracePeriod | null>(null);
  const [result, setResult] = useState<DebateResult | null>(null);

  const [currentTurnUserId, setCurrentTurnUserId] = useState<string | null>(
    null
  );
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timePerTurn, setTimePerTurn] = useState<number | null>(null);
  const [turnError, setTurnError] = useState("");

  const [currentSide, setCurrentSide] = useState<"for" | "against" | null>(
    null
  );
  const [, setArgumentPart] = useState<string | null>(null);
  const [argumentPartLabel, setArgumentPartLabel] = useState<string | null>(
    null
  );
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [, setTurnIndex] = useState<number | null>(null);
  const [totalStages, setTotalStages] = useState<number | null>(null);
  const [debateCompleted, setDebateCompleted] = useState(false);

  const addSystemMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { system: true, content }]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!/^\d{4}$/.test(debateId)) {
      router.replace("/debate/create");
    }
  }, [debateId, router]);

  useEffect(() => {
    if (!/^\d{4}$/.test(debateId)) return;

    let cancelled = false;

    async function init() {
      setPageState("loading");
      setErrorMessage("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user || !session.access_token) {
        setErrorMessage("You must be logged in to join a debate.");
        setPageState("error");
        return;
      }

      if (cancelled) return;

      userIdRef.current = session.user.id;
      setMyUserId(session.user.id);

      const storedSide = sessionStorage.getItem(`debate_${debateId}_side`) as
        | "for"
        | "against"
        | null;

      const storedTopic = sessionStorage.getItem(`debate_${debateId}_topic`);
      const storedTimePerTurn = sessionStorage.getItem(
        `debate_${debateId}_timePerTurn`
      );

      if (storedSide) setMySide(storedSide);
      if (storedTopic) setDebateName(storedTopic);
      if (storedTimePerTurn) setTimePerTurn(Number(storedTimePerTurn));

      const socketUrl = getSocketUrl();

      const socket = io(socketUrl, {
        auth: { token: session.access_token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        joinedRef.current = true;
        socket.emit("join_debate", { debateId });
      });

      socket.on("connect_error", (err) => {
        setErrorMessage(err.message || "Could not connect to debate server.");
        setPageState("error");
      });

      socket.on("debate_started", (payload: DebateStartedPayload) => {
        const me = payload.players.find((p) => p.id === userIdRef.current);

        if (!me) {
          setErrorMessage("You are not a participant in this debate.");
          setPageState("error");
          return;
        }

        setMySide(me.side);
        setDebateName(payload.debateName);
        setTimePerTurn(payload.timePerTurn);

        sessionStorage.setItem(`debate_${debateId}_side`, me.side);
        sessionStorage.setItem(`debate_${debateId}_topic`, payload.debateName);
        sessionStorage.setItem(
          `debate_${debateId}_timePerTurn`,
          String(payload.timePerTurn)
        );

        if (payload.stages) {
          sessionStorage.setItem(
            `debate_${debateId}_stages`,
            JSON.stringify(payload.stages)
          );
          setTotalStages(payload.stages.length);
        }

        if (payload.currentTurnUserId) {
          setCurrentTurnUserId(payload.currentTurnUserId);
        }

        if (typeof payload.secondsLeft === "number") {
          setSecondsLeft(payload.secondsLeft);
        }

        if (payload.argumentPartLabel) {
          setArgumentPartLabel(payload.argumentPartLabel);
        }

        if (payload.argumentPart) {
          setArgumentPart(payload.argumentPart);
        }

        if (typeof payload.stageIndex === "number") {
          setStageIndex(payload.stageIndex);
        }

        if (typeof payload.turnIndex === "number") {
          setTurnIndex(payload.turnIndex);
        }

        setGracePeriod(null);
        setResult(null);
        setDebateCompleted(false);
        setPageState("debate");

        if (payload.reconnect) {
          // We rejoined a debate already in progress (page refresh, mobile
          // tab resume, brief network drop) — the in-memory message list is
          // empty at this point, so reload the transcript instead of
          // showing a half-empty room.
          void fetchMessageHistory(debateId).then((history) => {
            if (history.length > 0) {
              setMessages(history);
            }
            addSystemMessage("Reconnected to the debate.");
          });
        }
      });

      socket.on("turn_started", (data: TurnPayload) => {
        setCurrentTurnUserId(data.currentTurnUserId);
        setSecondsLeft(data.secondsLeft);
        setTimePerTurn(data.timePerTurn);
        setDebateName(data.debateName);

        setCurrentSide(data.currentSide);
        setArgumentPart(data.argumentPart);
        setArgumentPartLabel(data.argumentPartLabel);
        setStageIndex(data.stageIndex);
        setTurnIndex(data.turnIndex);
        setTotalStages(data.totalStages);

        setGracePeriod(null);
        setDebateCompleted(false);

        if (!data.resumed) {
          addSystemMessage(
            `${data.argumentPartLabel || "Turn"} — ${
              data.currentSide?.toUpperCase() || "PLAYER"
            }: ${data.currentTurnUsername}'s turn.`
          );
        }
      });

      socket.on(
        "turn_tick",
        (data: {
          debateId: string;
          currentTurnUserId: string;
          secondsLeft: number;
        }) => {
          setCurrentTurnUserId(data.currentTurnUserId);
          setSecondsLeft(data.secondsLeft);
        }
      );

      socket.on(
        "turn_timeout",
        (data: {
          debateId: string;
          userId: string;
          username?: string;
          argumentPart?: string | null;
          argumentPartLabel?: string | null;
          stageIndex?: number;
          turnIndex?: number;
        }) => {
          addSystemMessage(
            `${data.username || "A player"} ran out of time during ${
              data.argumentPartLabel || "their turn"
            }.`
          );
        }
      );

      socket.on(
        "turn_passed",
        (data: {
          debateId: string;
          userId: string;
          username?: string;
          argumentPart?: string | null;
          argumentPartLabel?: string | null;
          stageIndex?: number;
          turnIndex?: number;
        }) => {
          addSystemMessage(
            `${data.username || "A player"} passed during ${
              data.argumentPartLabel || "their turn"
            }.`
          );
        }
      );

      socket.on("turn_error", ({ message }: { message: string }) => {
        setTurnError(message || "It is not your turn yet.");
        setTimeout(() => setTurnError(""), 2500);
      });

      socket.on("message_error", ({ message }: { message: string }) => {
        setTurnError(message || "Your message could not be sent.");
        setTimeout(() => setTurnError(""), 2500);
      });

      socket.on("new_message", (msg: Message) => {
        setMessages((prev) => [...prev, msg]);
      });

      socket.on(
        "opponent_disconnected",
        (data: { username: string; secondsLeft: number }) => {
          setGracePeriod({
            username: data.username,
            secondsLeft: data.secondsLeft,
          });

          if (data.secondsLeft === GRACE_PERIOD_MAX) {
            addSystemMessage(
              `${data.username} lost connection. They have ${data.secondsLeft}s to reconnect.`
            );
          }
        }
      );

      socket.on("opponent_reconnected", () => {
        setGracePeriod(null);
        addSystemMessage("Opponent reconnected. Debate continues.");
      });

      socket.on("debate_ended", (data: DebateResult) => {
        setGracePeriod(null);
        setResult(data);
        setPageState("result");
      });

      socket.on(
        "debate_completed",
        (data: {
          debateId: string;
          debateName: string;
          message: string;
        }) => {
          setDebateCompleted(true);
          setCurrentTurnUserId(null);
          setSecondsLeft(null);
          setCurrentSide(null);
          setArgumentPartLabel(null);
          setArgumentPart(null);

          addSystemMessage(
            data.message || "Debate completed. Judging can now begin."
          );

          if (data.debateName) {
            sessionStorage.setItem(
              `debate_${debateId}_topic`,
              data.debateName
            );
          }

          sessionStorage.setItem(`debate_${debateId}_awaitingOutcome`, "true");
          router.push(`/debate/${debateId}/outcome`);
        }
      );

      socket.on("join_error", ({ message }: { message: string }) => {
        setErrorMessage(message || "Could not join debate.");
        setPageState("error");
      });

      socket.io.on("reconnect_failed", () => {
        setErrorMessage("Lost connection to the debate server. Please refresh.");
        setPageState("error");
      });
    }

    init();

    return () => {
      cancelled = true;
      joinedRef.current = false;

      if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);

      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [debateId, router, addSystemMessage]);

  const isMyTurn = currentTurnUserId === myUserId;

  // Debounced draft sync — lets the server auto-submit whatever is in the
  // box if the timer runs out, instead of discarding it.
  useEffect(() => {
    if (!isMyTurn || debateCompleted) return;

    if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);

    draftTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("draft_update", { debateId, content: input });
    }, DRAFT_SYNC_DEBOUNCE_MS);

    return () => {
      if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
    };
  }, [input, isMyTurn, debateCompleted, debateId]);

  const sendMessage = useCallback(() => {
    const trimmed = input.trim();

    if (!socketRef.current || !trimmed || debateCompleted) return;

    if (countWords(trimmed) > MAX_MESSAGE_WORDS) {
      setTurnError(`Keep your message to ${MAX_MESSAGE_WORDS} words or fewer.`);
      setTimeout(() => setTurnError(""), 2500);
      return;
    }

    socketRef.current.emit("send_message", {
      debateId,
      content: trimmed,
    });

    setInput("");
  }, [debateId, input, debateCompleted]);

  const passTurn = useCallback(() => {
    if (
      !socketRef.current ||
      currentTurnUserId !== userIdRef.current ||
      debateCompleted
    ) {
      return;
    }

    socketRef.current.emit("pass_turn", { debateId });
  }, [currentTurnUserId, debateId, debateCompleted]);

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends (desktop convention); Shift+Enter inserts a newline. Touch
    // devices rely on the visible Send button, so this only ever helps.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearSession = () => {
    sessionStorage.removeItem(`debate_${debateId}_side`);
    sessionStorage.removeItem(`debate_${debateId}_startTime`);
    sessionStorage.removeItem(`debate_${debateId}_topic`);
    sessionStorage.removeItem(`debate_${debateId}_timePerTurn`);
    sessionStorage.removeItem(`debate_${debateId}_stages`);
  };

  const handleLeave = () => {
    socketRef.current?.emit("leave_debate", { debateId });
    socketRef.current?.disconnect();
    clearSession();
    router.push("/dashboard");
  };

  const returnToDashboard = () => {
    clearSession();
    router.push("/dashboard");
  };

  if (!/^\d{4}$/.test(debateId)) return null;

  if (pageState === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-ink">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-2 text-sm">Joining debate room…</p>
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="flex h-dvh items-center justify-center bg-ink p-6">
        <div className="text-center max-w-sm">
          <p className="text-rose-400 text-lg mb-6">{errorMessage}</p>

          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 bg-accent hover:bg-accent-strong text-[#0d1117] font-semibold transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (pageState === "result" && result !== null) {
    const iWon = result.winner.id === myUserId;

    return (
      <div className="flex h-dvh items-center justify-center bg-ink p-6">
        <div className="max-w-md w-full border-t-2 border-accent bg-surface p-8 sm:p-12 text-center shadow-2xl shadow-black/40">
          {iWon ? (
            <>
              <p className="eyebrow mb-5 justify-center">Debate decided</p>
              <h1 className="font-serif text-4xl text-[#fffaf0] mb-3">
                You won
              </h1>

              <p className="text-[#c7c0b3] mb-2">
                {result.reason === "opponent_disconnected"
                  ? `${result.loser.username} did not reconnect in time.`
                  : `${result.loser.username} left the debate.`}
              </p>

              <p className="text-muted-2 text-sm mb-10">
                Congratulations on your victory.
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow mb-5 justify-center">Debate decided</p>
              <h1 className="font-serif text-4xl text-[#fffaf0] mb-3">
                You lost
              </h1>

              <p className="text-[#c7c0b3] mb-2">
                {result.reason === "opponent_disconnected"
                  ? `${result.winner.username} wins because you failed to reconnect in time.`
                  : `${result.winner.username} wins because you left the debate.`}
              </p>

              <p className="text-muted-2 text-sm mb-10">
                Better luck next time.
              </p>
            </>
          )}

          <button
            onClick={returnToDashboard}
            className="w-full px-6 py-3 bg-accent hover:bg-accent-strong text-[#0d1117] font-semibold transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const turnProgress =
    secondsLeft !== null && timePerTurn
      ? Math.max(0, Math.min(100, (secondsLeft / timePerTurn) * 100))
      : 0;
  const wordCount = countWords(input);
  const isOverWordLimit = wordCount > MAX_MESSAGE_WORDS;
  const isUrgent = secondsLeft !== null && secondsLeft <= 10 && !debateCompleted;

  return (
    <div className="flex h-dvh flex-col bg-ink">
      <header className="flex-none bg-surface border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="dossier-index uppercase">Room {debateId}</p>
            <h1 className="mt-0.5 font-serif text-lg leading-snug text-[#fffaf0] tracking-tight sm:text-xl">
              {debateName || "Loading topic…"}
            </h1>

            <p className="mt-1 text-xs text-muted sm:text-sm">
              {mySide ? (
                <>
                  You are arguing{" "}
                  <span
                    className={`font-semibold ${
                      mySide === "for" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {mySide === "for" ? "FOR" : "AGAINST"}
                  </span>
                </>
              ) : (
                "Waiting for debate to start…"
              )}
            </p>
          </div>

          <button
            onClick={handleLeave}
            className="flex-none px-3 py-2 text-xs font-medium text-muted hover:text-cream bg-black/20 hover:bg-white/8 border border-line transition-colors sm:text-sm"
          >
            Leave
          </button>
        </div>
      </header>

      <div className="flex-none bg-surface/80 border-b border-line px-4 py-2.5 sm:px-6 sm:py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <p
                className={`text-sm font-semibold ${
                  debateCompleted
                    ? "text-accent"
                    : isMyTurn
                    ? "text-emerald-400"
                    : "text-muted"
                }`}
              >
                {debateCompleted
                  ? "Debate completed"
                  : isMyTurn
                  ? "Your turn"
                  : "Opponent's turn"}
              </p>

              {argumentPartLabel && !debateCompleted && (
                <p className="text-xs text-muted-2 mt-1">
                  Stage{" "}
                  {stageIndex !== null && totalStages !== null
                    ? `${stageIndex + 1} of ${totalStages}`
                    : ""}
                  {" · "}
                  <span className="font-semibold text-[#c7c0b3]">
                    {argumentPartLabel}
                  </span>
                  {currentSide && (
                    <>
                      {" · "}
                      <span
                        className={
                          currentSide === "for"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }
                      >
                        {currentSide.toUpperCase()}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            <p
              className={`text-sm tabular-nums font-mono ${
                isUrgent ? "font-bold text-rose-400" : "text-muted"
              }`}
            >
              {secondsLeft !== null && !debateCompleted ? `${secondsLeft}s` : "--"}
            </p>
          </div>

          <div className="w-full h-1 bg-black/30 overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ease-linear ${
                isUrgent ? "bg-rose-400" : "bg-accent"
              }`}
              style={{ width: `${debateCompleted ? 0 : turnProgress}%` }}
            />
          </div>
        </div>
      </div>

      {gracePeriod && (
        <div className="flex-none bg-amber-400/10 border-b border-amber-400/25 px-4 py-3 sm:px-6 sm:py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-amber-300 font-semibold text-sm sm:text-base">
                {gracePeriod.username} disconnected
              </p>

              <span
                className={`text-xl sm:text-2xl font-mono font-bold tabular-nums ${
                  gracePeriod.secondsLeft <= 5
                    ? "text-rose-400"
                    : "text-amber-300"
                }`}
              >
                {gracePeriod.secondsLeft}s
              </span>
            </div>

            <div className="w-full h-1 bg-black/30 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-1000 ease-linear"
                style={{
                  width: `${(gracePeriod.secondsLeft / GRACE_PERIOD_MAX) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3 sm:px-6 sm:py-6 overscroll-contain">
        {messages.length === 0 && (
          <p className="text-muted-2 text-center text-sm py-12">
            No messages yet. The player arguing FOR makes the opening argument.
          </p>
        )}

        {messages.map((msg, index) =>
          msg.system ? (
            <div
              key={`system-${index}`}
              className="text-center text-xs text-muted-2 italic py-1"
            >
              {msg.content}
            </div>
          ) : (
            <div
              key={msg.id ?? `message-${index}`}
              className={`flex ${
                msg.userId === myUserId
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] sm:max-w-xl border px-4 py-2.5 sm:px-5 sm:py-3 ${
                  msg.userId === myUserId
                    ? "bg-accent/10 border-accent/30 text-cream"
                    : "bg-surface border-line text-[#e8e1d2]"
                }`}
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-semibold opacity-70">
                    {msg.username}
                  </span>

                  {msg.timestamp && (
                    <span className="text-xs opacity-40">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>

                {msg.argumentPartLabel && (
                  <div className="mb-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide ${
                        msg.side === "for"
                          ? "text-emerald-300"
                          : msg.side === "against"
                          ? "text-rose-300"
                          : "text-muted-2"
                      }`}
                    >
                      {msg.side ? `${msg.side.toUpperCase()} — ` : ""}
                      {msg.argumentPartLabel}
                    </span>
                  </div>
                )}

                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {msg.content}
                </p>
              </div>
            </div>
          )
        )}

        <div ref={messagesEndRef} />
      </main>

      <footer
        className="flex-none bg-surface border-t border-line px-4 py-3 sm:px-6 sm:py-4"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-3xl mx-auto">
          {turnError && (
            <p className="text-rose-400 text-sm mb-2 text-center">{turnError}</p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <textarea
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={
                debateCompleted
                  ? "Debate completed."
                  : isMyTurn
                  ? `Write your ${argumentPartLabel || "argument"}… (Enter to send, Shift+Enter for a new line)`
                  : "Wait for your turn…"
              }
              disabled={!isMyTurn || debateCompleted}
              rows={3}
              className={`flex-1 resize-none border bg-black/20 text-cream px-4 py-3 text-sm leading-relaxed placeholder:text-muted-2/60 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed sm:rows-2 ${
                isOverWordLimit ? "border-rose-400/60" : "border-line focus:border-accent"
              }`}
            />

            <div className="flex gap-2 sm:flex-col">
              <button
                onClick={sendMessage}
                disabled={
                  !input.trim() || !isMyTurn || debateCompleted || isOverWordLimit
                }
                className="flex-1 bg-accent hover:bg-accent-strong disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed text-[#0d1117] px-6 py-3 text-sm font-semibold transition-colors sm:flex-none"
              >
                Send
              </button>

              <button
                onClick={passTurn}
                disabled={!isMyTurn || debateCompleted}
                className="flex-1 bg-black/20 hover:bg-white/8 disabled:bg-white/5 disabled:text-white/20 disabled:cursor-not-allowed text-cream border border-line px-5 py-3 text-sm font-semibold transition-colors sm:flex-none"
              >
                Pass
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <span
              className={isOverWordLimit ? "text-rose-400" : "text-muted-2"}
            >
              {isOverWordLimit
                ? `Too long by ${wordCount - MAX_MESSAGE_WORDS} words.`
                : `${MAX_MESSAGE_WORDS} words max per message.`}
            </span>

            <span
              className={`tabular-nums font-mono ${
                isOverWordLimit ? "text-rose-400" : "text-muted-2"
              }`}
            >
              {wordCount}/{MAX_MESSAGE_WORDS}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
