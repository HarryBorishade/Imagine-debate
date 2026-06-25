"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { supabase } from "@/supabaseClient";

interface Player {
  id: string;
  username: string;
  ready: boolean;
  side: "for" | "against" | null;
}

interface LobbyStatePayload {
  players: Player[];
  status: "waiting" | "active";
  debateName: string;
  timePerTurn: number;
}

interface DebateStartedPayload {
  debateId: string;
  debateName: string;
  players: Array<Player & { side: "for" | "against" }>;
  startTime: string | null;
  reconnect: boolean;
  timePerTurn: number;
  currentTurnUserId?: string;
  secondsLeft?: number;
}

export default function DebateLobby() {
  const params = useParams();
  const router = useRouter();
  const debateId = params.debateId as string;

  const socketRef = useRef<Socket | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [stage, setStage] = useState<"waiting" | "opponent-joined" | "countdown">("waiting");
  const [countdown, setCountdown] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [timeElapsed, setTimeElapsed] = useState(0);
  const [iAmReady, setIAmReady] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [mySide, setMySide] = useState<"for" | "against" | null>(null);
  const [readyError, setReadyError] = useState("");

  useEffect(() => {
    if (!/^\d{4}$/.test(debateId)) {
      router.replace("/debate/create");
    }
  }, [debateId, router]);

  const debateCode = debateId.padStart(4, "0");

  useEffect(() => {
    if (!/^\d{4}$/.test(debateId)) return;

    let cancelled = false;

    async function init() {
      setLoading(true);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user || !session.access_token) {
        setError("You must be logged in.");
        setLoading(false);
        return;
      }

      if (cancelled) return;

      setMyUserId(session.user.id);

      const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

      const socket = io(socketUrl, {
        auth: { token: session.access_token },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("✅ Lobby socket connected:", socket.id);
        socket.emit("join_debate", { debateId });
      });

      socket.on("connect_error", (err) => {
        console.warn("❌ Lobby socket connection error:", err.message);
        setError(err.message || "Could not connect to debate server.");
        setLoading(false);
      });

      socket.on("lobby_state", (data: LobbyStatePayload) => {
        setPlayers(data.players);

        const me = data.players.find((p) => p.id === session.user.id);

        if (me) {
          setIAmReady(me.ready);
          setMySide(me.side);
        } else {
          setIAmReady(false);
          setMySide(null);
        }

        if (data.status === "active") {
          return;
        }

        if (data.players.length >= 2) {
          setStage("opponent-joined");
        } else {
          setStage("waiting");
        }

        setLoading(false);
      });

      socket.on("debate_started", (payload: DebateStartedPayload) => {
        const myEntry = payload.players.find((p) => p.id === session.user.id);

        if (myEntry) {
          sessionStorage.setItem(`debate_${debateId}_side`, myEntry.side);
        }

        if (payload.debateName) {
          sessionStorage.setItem(`debate_${debateId}_topic`, payload.debateName);
        }

        if (payload.startTime) {
          sessionStorage.setItem(`debate_${debateId}_startTime`, payload.startTime);
        }

        sessionStorage.setItem(
          `debate_${debateId}_timePerTurn`,
          String(payload.timePerTurn)
        );

        setStage("countdown");
      });

      socket.on("side_conflict", ({ message }: { message: string }) => {
        setReadyError(message || "There was a side selection problem.");
        setIAmReady(false);
        setTimeout(() => setReadyError(""), 3000);
      });

      socket.on("join_error", ({ message }: { message: string }) => {
        setError(message || "Could not join debate.");
        setLoading(false);
      });

      socket.io.on("reconnect_failed", () => {
        setError("Failed to reconnect to debate server.");
        setLoading(false);
      });
    }

    init();

    return () => {
      cancelled = true;

      // Important:
      // Do not emit leave_debate here.
      // This cleanup also runs when moving from lobby to room.
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [debateId]);

  useEffect(() => {
    if (stage !== "countdown") return;

    if (countdown === 0) {
      router.push(`/debate/${debateId}/room`);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [stage, countdown, debateId, router]);

  useEffect(() => {
    if (stage !== "waiting") return;

    const interval = setInterval(() => {
      setTimeElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [stage]);

  const handleChooseSide = (side: "for" | "against") => {
  if (!socketRef.current) return;

  setReadyError("");
  setMySide(side);
  setIAmReady(false);

  socketRef.current.emit("choose_side", {
    debateId,
    side,
  });
};

  const handleReady = () => {
    if (!socketRef.current || iAmReady) return;

    if (!mySide) {
      setReadyError("Choose a side before readying up.");
      return;
    }

    socketRef.current.emit("player_ready", { debateId });
  };

  const handleUnready = () => {
    if (!socketRef.current || !iAmReady) return;

    socketRef.current.emit("player_unready", { debateId });
    setIAmReady(false);
  };

  const handleCancel = () => {
    socketRef.current?.emit("leave_debate", { debateId });
    socketRef.current?.disconnect();
    router.push("/dashboard");
  };

  if (!/^\d{4}$/.test(debateId)) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0d1117]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0d1117] p-6">
        <div className="text-center max-w-sm">
          <div className="text-rose-400 text-lg mb-4">{error}</div>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const minutes = Math.floor(timeElapsed / 60);
  const seconds = timeElapsed % 60;

  const opponentSide = players.find((p) => p.id !== myUserId)?.side ?? null;

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {stage === "waiting" && (
          <div className="bg-white/[0.03] backdrop-blur border border-white/[0.07] rounded-2xl p-12 text-center">
            <div className="mb-8">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-transparent border-t-indigo-500 border-r-indigo-500 rounded-full animate-spin" />
                <div
                  className="absolute inset-2 border-4 border-transparent border-b-indigo-400 border-l-indigo-400 rounded-full animate-spin"
                  style={{ animationDirection: "reverse" }}
                />
              </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-2">
              Waiting for Opponent
            </h2>

            <p className="text-white/40 mb-8 text-sm leading-relaxed">
              Your debate room is ready. Share the code below with your opponent.
            </p>

            <div className="bg-indigo-600/[0.07] border border-indigo-500/20 rounded-2xl p-8 mb-8">
              <p className="text-white/30 text-xs uppercase tracking-widest mb-3">
                Room Code
              </p>

              <div className="text-6xl font-bold text-indigo-400 font-mono tracking-[0.25em] mb-5">
                {debateCode}
              </div>

              <button
                onClick={() => navigator.clipboard.writeText(debateCode)}
                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all"
              >
                Copy code
              </button>
            </div>

            <div className="text-white/25 text-sm mb-8">
              Waiting {minutes}m {seconds.toString().padStart(2, "0")}s
            </div>

            <button
              onClick={handleCancel}
              className="px-6 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-white/60 hover:text-white text-sm font-medium transition-all"
            >
              Cancel
            </button>
          </div>
        )}

        {stage === "opponent-joined" && (
          <div className="bg-white/[0.03] backdrop-blur border border-white/[0.07] rounded-2xl p-10 text-center">
            <div className="inline-block p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-6">
              <svg
                className="w-8 h-8 text-emerald-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">
              Opponent joined!
            </h2>

            <p className="text-white/40 mb-8 text-sm">
              Choose your side, then click Ready when set.
            </p>

            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-3">
                Your position
              </p>

              <div className="grid grid-cols-2 gap-3">
                {(["for", "against"] as const).map((side) => {
                  const isOpponentSide = opponentSide === side;
                  const isSelected = mySide === side;

                  return (
                    <button
                      key={side}
                      onClick={() => !isOpponentSide && handleChooseSide(side)}
                      disabled={isOpponentSide}
                      className={`relative py-5 px-4 rounded-xl border text-sm font-semibold transition-all ${
                        isOpponentSide
                          ? "border-white/[0.05] bg-white/[0.02] text-white/20 cursor-not-allowed"
                          : isSelected
                          ? side === "for"
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                            : "border-rose-500/50 bg-rose-500/10 text-rose-300"
                          : "border-white/[0.08] bg-white/[0.03] text-white/50 hover:border-white/20 hover:text-white/80"
                      }`}
                    >
                      <span className="block text-lg mb-1">
                        {side === "for" ? "👍" : "👎"}
                      </span>

                      <span className="capitalize">{side}</span>

                      {isOpponentSide && (
                        <span className="absolute top-2 right-2 text-[10px] text-white/25 font-normal">
                          taken
                        </span>
                      )}

                      {isSelected && (
                        <span className="absolute top-2 right-2 text-[10px] font-normal">
                          ✓ you
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white/[0.03] rounded-xl p-4 mb-6 text-left border border-white/[0.06]">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-3">
                Players
              </h3>

              <div className="space-y-2.5">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white/70">
                        {p.username}
                      </span>

                      {p.side && (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${
                            p.side === "for"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-rose-500/15 text-rose-400"
                          }`}
                        >
                          {p.side}
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
                        p.ready
                          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                          : "bg-white/[0.05] text-white/30"
                      }`}
                    >
                      {p.ready ? "Ready" : "Not ready"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {readyError && (
              <p className="text-rose-400 text-sm mb-4">{readyError}</p>
            )}

            {!iAmReady ? (
              <button
                onClick={handleReady}
                disabled={!mySide}
                className="w-full px-8 py-4 rounded-xl text-white font-bold text-base transition-all mb-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/[0.06] disabled:text-white/20 disabled:cursor-not-allowed"
              >
                {mySide ? "I'm Ready" : "Choose a side first"}
              </button>
            ) : (
              <button
                onClick={handleUnready}
                className="w-full px-8 py-4 rounded-xl text-white font-bold text-base transition-all mb-3 bg-amber-600 hover:bg-amber-500"
              >
                Waiting for opponent… tap to unready
              </button>
            )}

            <button
              onClick={handleCancel}
              className="w-full px-6 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-white/50 hover:text-white text-sm font-medium transition-all"
            >
              Cancel
            </button>
          </div>
        )}

        {stage === "countdown" && (
          <div className="bg-white/[0.03] backdrop-blur border border-white/[0.07] rounded-2xl p-12 text-center">
            <h2 className="text-sm font-semibold text-white/60 mb-8 tracking-widest uppercase">
              Debate starting in
            </h2>

            <div className="text-9xl font-bold text-indigo-400 mb-12 tabular-nums">
              {countdown}
            </div>

            <p className="text-white/30 text-sm">
              "For" argues first. The timer starts when you enter the room.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}