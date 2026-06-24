"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { supabase } from "@/supabaseClient";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  userId?: string;
  username?: string;
  content: string;
  timestamp?: string;
  system?: boolean;
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

type PageState = "loading" | "error" | "debate" | "result";

// ─── Constants ─────────────────────────────────────────────────────────────────

const GRACE_PERIOD_MAX = 15;

// ─── Component ─────────────────────────────────────────────────────────────────

export default function DebateRoom() {
  const params = useParams();
  const router = useRouter();
  const debateId = params.debateId as string;

  // Refs — don't trigger re-renders
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const userIdRef = useRef<string | null>(null);

  // UI state
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [mySide, setMySide] = useState<"for" | "against" | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [gracePeriod, setGracePeriod] = useState<GracePeriod | null>(null);
  const [result, setResult] = useState<DebateResult | null>(null);

  // ── Scroll to bottom on new messages ────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Socket setup ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
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
      if (storedSide) setMySide(storedSide);

      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

      const socket = io(socketUrl, {
        auth: { token: session.access_token },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socketRef.current = socket;

      // ── Connect / join ───────────────────────────────────────────────────────

      socket.on("connect", () => {
        console.log("✅ Socket connected");
        socket.emit("join_debate", { debateId });
      });

      // ── Debate started / reconnected ─────────────────────────────────────────

      socket.on(
        "debate_started",
        (payload: {
          players: Array<{ id: string; side: "for" | "against" }>;
          reconnect: boolean;
        }) => {
          const me = payload.players.find((p) => p.id === userIdRef.current);
          if (me) {
            setMySide(me.side);
            sessionStorage.setItem(`debate_${debateId}_side`, me.side);
          }

          if (payload.reconnect) {
            // Clear any stale grace/result UI on reconnect
            setGracePeriod(null);
            setResult(null);
          }

          setPageState("debate");
        }
      );

      // ── Messages ──────────────────────────────────────────────────────────────

      socket.on("new_message", (msg: Message) => {
        setMessages((prev) => [...prev, msg]);
      });

      // ── Grace period: opponent dropped ────────────────────────────────────────

      socket.on(
        "opponent_disconnected",
        (data: { username: string; secondsLeft: number }) => {
          setGracePeriod({ username: data.username, secondsLeft: data.secondsLeft });

          // Inject a system message only on the first tick
          if (data.secondsLeft === GRACE_PERIOD_MAX) {
            addSystemMessage(
              `⚠️ ${data.username} lost connection — ${data.secondsLeft}s to reconnect.`
            );
          }
        }
      );

      // ── Opponent came back ────────────────────────────────────────────────────

      socket.on("opponent_reconnected", () => {
        setGracePeriod(null);
        addSystemMessage("✅ Opponent reconnected — debate continues!");
      });

      // ── Debate over ───────────────────────────────────────────────────────────

      socket.on("debate_ended", (data: DebateResult) => {
        setGracePeriod(null);
        setResult(data);
        setPageState("result");
      });

      // ── Join rejected ─────────────────────────────────────────────────────────

      socket.on("join_error", (data: { message: string }) => {
        setErrorMessage(data.message);
        setPageState("error");
      });

      // ── Connection events ─────────────────────────────────────────────────────

      socket.on("disconnect", (reason: string) => {
        console.warn("⚠️ Disconnected:", reason);
        addSystemMessage("⚠️ Connection lost — reconnecting…");
      });

      socket.on("reconnect", () => {
        console.log("🔄 Reconnected — rejoining debate");
        socket.emit("join_debate", { debateId });
        addSystemMessage("✅ Reconnected.");
      });

      socket.on("connect_error", (err: Error) => {
        console.warn("Connection attempt failed:", err.message);
      });

      socket.io.on("reconnect_failed", () => {
        setErrorMessage("Lost connection to the debate server. Please refresh.");
        setPageState("error");
      });

      setPageState("debate");
    }

    init();

    return () => {
      cancelled = true;
      socketRef.current?.emit("leave_debate", { debateId });
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [debateId]);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const addSystemMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { system: true, content }]);
  }, []);

  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (!socketRef.current || !trimmed) return;
    socketRef.current.emit("send_message", { debateId, content: trimmed });
    setInput("");
  }, [debateId, input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleLeave = () => {
    socketRef.current?.emit("leave_debate", { debateId });
    clearSession();
    router.push("/dashboard");
  };

  const clearSession = () => {
    sessionStorage.removeItem(`debate_${debateId}_side`);
    sessionStorage.removeItem(`debate_${debateId}_startTime`);
  };

  const returnToDashboard = () => {
    clearSession();
    router.push("/dashboard");
  };

  // ─── Render: loading ──────────────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Joining debate room…</p>
        </div>
      </div>
    );
  }

  // ─── Render: error ────────────────────────────────────────────────────────────

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

  // ─── Render: result ───────────────────────────────────────────────────────────

  if (pageState === "result" && result !== null) {
    const iWon = result.winner.id === userIdRef.current;

    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-12 text-center shadow-2xl">
          {iWon ? (
            <>
              <div className="text-8xl mb-6">🏆</div>
              <h1 className="text-4xl font-bold text-yellow-400 mb-3">You Won!</h1>
              <p className="text-slate-300 mb-2">
                {result.reason === "opponent_disconnected"
                  ? `${result.loser.username} didn't reconnect in time.`
                  : `${result.loser.username} left the debate.`}
              </p>
              <p className="text-slate-500 text-sm mb-10">Congratulations on your victory.</p>
            </>
          ) : (
            <>
              <div className="text-8xl mb-6">😔</div>
              <h1 className="text-4xl font-bold text-slate-300 mb-3">You Lost</h1>
              <p className="text-slate-300 mb-2">
                {result.reason === "opponent_disconnected"
                  ? `${result.winner.username} wins — you failed to reconnect in time.`
                  : `${result.winner.username} wins — you left the debate.`}
              </p>
              <p className="text-slate-500 text-sm mb-10">Better luck next time.</p>
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

  // ─── Render: debate room ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 to-slate-800">

      {/* Header */}
      <header className="flex-none bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Debate #{debateId}
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
                </span>{" "}
                the motion
              </>
            ) : (
              "Waiting for debate to start…"
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

      {/* Grace period banner */}
      {gracePeriod && (
        <div className="flex-none bg-orange-950/60 border-b border-orange-700/50 px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-orange-300 font-semibold">
                ⚠️ {gracePeriod.username} disconnected
              </p>
              <span
                className={`text-2xl font-bold tabular-nums ${
                  gracePeriod.secondsLeft <= 5 ? "text-red-400" : "text-orange-300"
                }`}
              >
                {gracePeriod.secondsLeft}s
              </span>
            </div>
            <div className="w-full h-1.5 bg-orange-950 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${(gracePeriod.secondsLeft / GRACE_PERIOD_MAX) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
        {messages.length === 0 && (
          <p className="text-slate-500 text-center text-sm py-12">
            No messages yet. Make your opening argument.
          </p>
        )}

        {messages.map((msg, i) =>
          msg.system ? (
            <div
              key={i}
              className="text-center text-xs text-slate-500 italic py-1"
            >
              {msg.content}
            </div>
          ) : (
            <div
              key={i}
              className={`flex ${
                msg.userId === userIdRef.current ? "justify-end" : "justify-start"
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
                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>
            </div>
          )
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="flex-none bg-slate-800 border-t border-slate-700 px-6 py-4">
        <div className="flex gap-3 max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your argument…"
            className="flex-1 rounded-xl bg-slate-700 text-white px-4 py-3 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}