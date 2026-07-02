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

export default function DebateRoom() {
  const params = useParams();
  const router = useRouter();
  const debateId = params.debateId as string;

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const userIdRef = useRef<string | null>(null);
  const joinedRef = useRef(false);

  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

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
  const [argumentPart, setArgumentPart] = useState<string | null>(null);
  const [argumentPartLabel, setArgumentPartLabel] = useState<string | null>(
    null
  );
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [turnIndex, setTurnIndex] = useState<number | null>(null);
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
        console.log("✅ Room socket connected:", socket.id);
        joinedRef.current = true;
        socket.emit("join_debate", { debateId });
      });

      socket.on("connect_error", (err) => {
        console.warn("❌ Room socket connection error:", err.message);
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
          addSystemMessage("✅ Reconnected to the debate.");
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
            `🎤 ${data.argumentPartLabel || "Turn"} — ${
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
            `⏰ ${data.username || "A player"} ran out of time during ${
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
              `⚠️ ${data.username} lost connection. They have ${data.secondsLeft}s to reconnect.`
            );
          }
        }
      );

      socket.on("opponent_reconnected", () => {
        setGracePeriod(null);
        addSystemMessage("✅ Opponent reconnected. Debate continues.");
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
        }
      );

      socket.on("join_error", ({ message }: { message: string }) => {
        setErrorMessage(message || "Could not join debate.");
        setPageState("error");
      });

      socket.on("disconnect", (reason: string) => {
        console.warn("⚠️ Room socket disconnected:", reason);
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

      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [debateId, router, addSystemMessage]);

  const sendMessage = useCallback(() => {
    const trimmed = input.trim();

    if (!socketRef.current || !trimmed || debateCompleted) return;

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Joining debate room...</p>
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 p-6">
        <div className="text-center max-w-sm">
          <p className="text-red-400 text-lg mb-6">{errorMessage}</p>

          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (pageState === "result" && result !== null) {
    const iWon = result.winner.id === userIdRef.current;

    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-12 text-center shadow-2xl">
          {iWon ? (
            <>
              <div className="text-8xl mb-6">🏆</div>
              <h1 className="text-4xl font-bold text-yellow-400 mb-3">
                You Won!
              </h1>

              <p className="text-slate-300 mb-2">
                {result.reason === "opponent_disconnected"
                  ? `${result.loser.username} did not reconnect in time.`
                  : `${result.loser.username} left the debate.`}
              </p>

              <p className="text-slate-500 text-sm mb-10">
                Congratulations on your victory.
              </p>
            </>
          ) : (
            <>
              <div className="text-8xl mb-6">😔</div>
              <h1 className="text-4xl font-bold text-slate-300 mb-3">
                You Lost
              </h1>

              <p className="text-slate-300 mb-2">
                {result.reason === "opponent_disconnected"
                  ? `${result.winner.username} wins because you failed to reconnect in time.`
                  : `${result.winner.username} wins because you left the debate.`}
              </p>

              <p className="text-slate-500 text-sm mb-10">
                Better luck next time.
              </p>
            </>
          )}

          <button
            onClick={returnToDashboard}
            className="w-full px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isMyTurn = currentTurnUserId === userIdRef.current;

  const turnProgress =
    secondsLeft !== null && timePerTurn
      ? Math.max(0, Math.min(100, (secondsLeft / timePerTurn) * 100))
      : 0;

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <header className="flex-none bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {debateName || `Debate #${debateId}`}
          </h1>

          <p className="text-sm text-slate-400 mt-0.5">
            {mySide ? (
              <>
                You are arguing{" "}
                <span
                  className={`font-semibold ${
                    mySide === "for" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {mySide === "for" ? "FOR" : "AGAINST"}
                </span>
              </>
            ) : (
              "Waiting for debate to start..."
            )}
          </p>
        </div>

        <button
          onClick={handleLeave}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 transition-colors"
        >
          Leave
        </button>
      </header>

      <div className="flex-none bg-slate-800/80 border-b border-slate-700 px-6 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <p
                className={`text-sm font-semibold ${
                  debateCompleted
                    ? "text-blue-400"
                    : isMyTurn
                    ? "text-emerald-400"
                    : "text-slate-400"
                }`}
              >
                {debateCompleted
                  ? "Debate completed"
                  : isMyTurn
                  ? "Your turn"
                  : "Opponent's turn"}
              </p>

              {argumentPartLabel && !debateCompleted && (
                <p className="text-xs text-slate-500 mt-1">
                  Stage{" "}
                  {stageIndex !== null && totalStages !== null
                    ? `${stageIndex + 1} of ${totalStages}`
                    : ""}
                  {" · "}
                  <span className="font-semibold text-slate-300">
                    {argumentPartLabel}
                  </span>
                  {currentSide && (
                    <>
                      {" · "}
                      <span
                        className={
                          currentSide === "for"
                            ? "text-emerald-400"
                            : "text-red-400"
                        }
                      >
                        {currentSide.toUpperCase()}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            <p className="text-sm text-slate-400 tabular-nums">
              {secondsLeft !== null && !debateCompleted ? `${secondsLeft}s` : "--"}
            </p>
          </div>

          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${debateCompleted ? 0 : turnProgress}%` }}
            />
          </div>
        </div>
      </div>

      {gracePeriod && (
        <div className="flex-none bg-orange-950/60 border-b border-orange-700/50 px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-orange-300 font-semibold">
                ⚠️ {gracePeriod.username} disconnected
              </p>

              <span
                className={`text-2xl font-bold tabular-nums ${
                  gracePeriod.secondsLeft <= 5
                    ? "text-red-400"
                    : "text-orange-300"
                }`}
              >
                {gracePeriod.secondsLeft}s
              </span>
            </div>

            <div className="w-full h-1.5 bg-orange-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full transition-all duration-1000 ease-linear"
                style={{
                  width: `${(gracePeriod.secondsLeft / GRACE_PERIOD_MAX) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
        {messages.length === 0 && (
          <p className="text-slate-500 text-center text-sm py-12">
            No messages yet. The player arguing FOR makes the opening argument.
          </p>
        )}

        {messages.map((msg, index) =>
          msg.system ? (
            <div
              key={`system-${index}`}
              className="text-center text-xs text-slate-500 italic py-1"
            >
              {msg.content}
            </div>
          ) : (
            <div
              key={msg.id ?? `message-${index}`}
              className={`flex ${
                msg.userId === userIdRef.current
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`max-w-xl rounded-2xl px-5 py-3 ${
                  msg.userId === userIdRef.current
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-slate-700 text-slate-100 rounded-bl-sm"
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
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        msg.side === "for"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : msg.side === "against"
                          ? "bg-red-500/15 text-red-300"
                          : "bg-slate-500/15 text-slate-300"
                      }`}
                    >
                      {msg.side ? `${msg.side.toUpperCase()} — ` : ""}
                      {msg.argumentPartLabel}
                    </span>
                  </div>
                )}

                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>
            </div>
          )
        )}

        <div ref={messagesEndRef} />
      </main>

      <footer className="flex-none bg-slate-800 border-t border-slate-700 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {turnError && (
            <p className="text-red-400 text-sm mb-2 text-center">{turnError}</p>
          )}

          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                debateCompleted
                  ? "Debate completed."
                  : isMyTurn
                  ? `Write your ${argumentPartLabel || "argument"}...`
                  : "Wait for your turn..."
              }
              disabled={!isMyTurn || debateCompleted}
              className="flex-1 rounded-xl bg-slate-700 text-white px-4 py-3 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
            />

            <button
              onClick={sendMessage}
              disabled={!input.trim() || !isMyTurn || debateCompleted}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              Send
            </button>

            <button
              onClick={passTurn}
              disabled={!isMyTurn || debateCompleted}
              className="bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/60 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors"
            >
              Pass
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}