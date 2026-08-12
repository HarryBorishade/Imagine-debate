"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { supabase } from "@/supabaseClient";
import { getSocketUrl } from "@/lib/socketUrl";

interface Player {
  id: string;
  username: string;
  ready: boolean;
  side: "for" | "against" | null;
}

interface LobbyStatePayload {
  players: Player[];
  status: "waiting" | "active" | "completed";
  debateName: string;
  timePerTurn: number;
}

interface DebateStage {
  argumentPart: string;
  label: string;
}

interface DebateStartedPayload {
  debateId: string;
  debateName: string;
  players: Array<Player & { side: "for" | "against" }>;
  stages?: DebateStage[];
  startTime: string | null;
  reconnect: boolean;
  timePerTurn: number;
  currentTurnUserId?: string;
  secondsLeft?: number;
  argumentPart?: string | null;
  argumentPartLabel?: string | null;
  stageIndex?: number;
  turnIndex?: number;
}

type LobbyStage = "waiting" | "opponent-joined" | "countdown";

export default function DebateLobby() {
  const params = useParams();
  const router = useRouter();
  const debateId = params.debateId as string;

  const socketRef = useRef<Socket | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [stage, setStage] = useState<LobbyStage>("waiting");
  const [countdown, setCountdown] = useState(3);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [timeElapsed, setTimeElapsed] = useState(0);
  const [iAmReady, setIAmReady] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [mySide, setMySide] = useState<"for" | "against" | null>(null);
  const [readyError, setReadyError] = useState("");

  const isValidDebateId = /^\d{4}$/.test(debateId);
  const debateCode = debateId.padStart(4, "0");

  useEffect(() => {
    if (!isValidDebateId) {
      router.replace("/debate/create");
    }
  }, [isValidDebateId, router]);

  useEffect(() => {
    if (!isValidDebateId) return;

    let cancelled = false;

    async function init() {
      setLoading(true);
      setError("");
      setReadyError("");

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

        if (data.debateName) {
          sessionStorage.setItem(`debate_${debateId}_topic`, data.debateName);
        }

        sessionStorage.setItem(
          `debate_${debateId}_timePerTurn`,
          String(data.timePerTurn)
        );

        if (data.status === "active") {
          setStage("countdown");
          setCountdown(3);
          setLoading(false);
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

        if (!myEntry) {
          setError("You are not a participant in this debate.");
          setLoading(false);
          return;
        }

        sessionStorage.setItem(`debate_${debateId}_side`, myEntry.side);

        if (payload.debateName) {
          sessionStorage.setItem(
            `debate_${debateId}_topic`,
            payload.debateName
          );
        }

        if (payload.startTime) {
          sessionStorage.setItem(
            `debate_${debateId}_startTime`,
            payload.startTime
          );
        }

        sessionStorage.setItem(
          `debate_${debateId}_timePerTurn`,
          String(payload.timePerTurn)
        );

        if (payload.stages) {
          sessionStorage.setItem(
            `debate_${debateId}_stages`,
            JSON.stringify(payload.stages)
          );
        }

        if (payload.currentTurnUserId) {
          sessionStorage.setItem(
            `debate_${debateId}_currentTurnUserId`,
            payload.currentTurnUserId
          );
        }

        if (typeof payload.secondsLeft === "number") {
          sessionStorage.setItem(
            `debate_${debateId}_secondsLeft`,
            String(payload.secondsLeft)
          );
        }

        if (payload.argumentPart) {
          sessionStorage.setItem(
            `debate_${debateId}_argumentPart`,
            payload.argumentPart
          );
        }

        if (payload.argumentPartLabel) {
          sessionStorage.setItem(
            `debate_${debateId}_argumentPartLabel`,
            payload.argumentPartLabel
          );
        }

        if (typeof payload.stageIndex === "number") {
          sessionStorage.setItem(
            `debate_${debateId}_stageIndex`,
            String(payload.stageIndex)
          );
        }

        if (typeof payload.turnIndex === "number") {
          sessionStorage.setItem(
            `debate_${debateId}_turnIndex`,
            String(payload.turnIndex)
          );
        }

        setStage("countdown");
        setCountdown(3);
        setLoading(false);
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

      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [debateId, isValidDebateId]);

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

  const clearSession = () => {
    sessionStorage.removeItem(`debate_${debateId}_side`);
    sessionStorage.removeItem(`debate_${debateId}_startTime`);
    sessionStorage.removeItem(`debate_${debateId}_topic`);
    sessionStorage.removeItem(`debate_${debateId}_timePerTurn`);
    sessionStorage.removeItem(`debate_${debateId}_stages`);
    sessionStorage.removeItem(`debate_${debateId}_currentTurnUserId`);
    sessionStorage.removeItem(`debate_${debateId}_secondsLeft`);
    sessionStorage.removeItem(`debate_${debateId}_argumentPart`);
    sessionStorage.removeItem(`debate_${debateId}_argumentPartLabel`);
    sessionStorage.removeItem(`debate_${debateId}_stageIndex`);
    sessionStorage.removeItem(`debate_${debateId}_turnIndex`);
  };

  const handleCancel = () => {
    socketRef.current?.emit("leave_debate", { debateId });
    socketRef.current?.disconnect();
    clearSession();
    router.push("/dashboard");
  };

  if (!isValidDebateId) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ink">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ink p-6">
        <div className="text-center max-w-sm">
          <div className="text-rose-400 text-lg mb-4">{error}</div>

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

  const minutes = Math.floor(timeElapsed / 60);
  const seconds = timeElapsed % 60;
  const opponentSide = players.find((p) => p.id !== myUserId)?.side ?? null;

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {stage === "waiting" && (
          <div className="border-t-2 border-accent bg-surface p-8 text-center sm:p-12">
            <div className="mb-8">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-transparent border-t-accent border-r-accent rounded-full animate-spin" />
                <div
                  className="absolute inset-2 border-4 border-transparent border-b-line-strong border-l-line-strong rounded-full animate-spin"
                  style={{ animationDirection: "reverse" }}
                />
              </div>
            </div>

            <p className="eyebrow mb-3 justify-center">Room ready</p>
            <h2 className="font-serif text-3xl text-[#fffaf0] mb-2">
              Waiting for opponent
            </h2>

            <p className="text-muted mb-8 text-sm leading-relaxed">
              Your debate room is ready. Share the code below with your
              opponent.
            </p>

            <div className="border border-line bg-black/20 p-8 mb-8">
              <p className="dossier-index uppercase mb-3">Room code</p>

              <div className="text-6xl font-semibold text-cream font-mono tracking-[0.25em] mb-5">
                {debateCode}
              </div>

              <button
                onClick={() => navigator.clipboard.writeText(debateCode)}
                className="px-5 py-2 bg-accent hover:bg-accent-strong text-[#0d1117] text-sm font-semibold transition-colors"
              >
                Copy code
              </button>
            </div>

            <div className="text-muted-2 text-sm mb-8 font-mono tabular-nums">
              Waiting {minutes}m {seconds.toString().padStart(2, "0")}s
            </div>

            <button
              onClick={handleCancel}
              className="px-6 py-3 bg-black/10 hover:bg-white/8 border border-line text-muted hover:text-cream text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {stage === "opponent-joined" && (
          <div className="border-t-2 border-accent bg-surface p-8 text-center sm:p-10">
            <p className="eyebrow mb-4 justify-center">Opponent joined</p>

            <h2 className="font-serif text-2xl text-[#fffaf0] mb-1">
              Choose your side
            </h2>

            <p className="text-muted mb-8 text-sm">
              Pick FOR or AGAINST, then mark yourself ready.
            </p>

            <div className="mb-6">
              <p className="dossier-index uppercase mb-3">Your position</p>

              <div className="grid grid-cols-2 gap-3">
                {(["for", "against"] as const).map((side) => {
                  const isOpponentSide = opponentSide === side;
                  const isSelected = mySide === side;

                  return (
                    <button
                      key={side}
                      onClick={() => !isOpponentSide && handleChooseSide(side)}
                      disabled={isOpponentSide}
                      className={`relative py-5 px-4 border text-sm font-semibold transition-colors ${
                        isOpponentSide
                          ? "border-line bg-black/10 text-muted-2/40 cursor-not-allowed"
                          : isSelected
                          ? side === "for"
                            ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                            : "border-rose-400/50 bg-rose-400/10 text-rose-300"
                          : "border-line bg-black/10 text-muted hover:border-line-strong hover:text-cream"
                      }`}
                    >
                      <span className="uppercase tracking-wide">{side}</span>

                      {isOpponentSide && (
                        <span className="absolute top-2 right-2 text-[10px] text-muted-2/60 font-normal">
                          taken
                        </span>
                      )}

                      {isSelected && (
                        <span className="absolute top-2 right-2 text-[10px] font-normal">
                          you
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-black/10 p-4 mb-6 text-left border border-line">
              <h3 className="dossier-index uppercase mb-3">Players</h3>

              <div className="space-y-2.5">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[#c7c0b3]">
                        {p.username}
                      </span>

                      {p.side && (
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 ${
                            p.side === "for"
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {p.side}
                        </span>
                      )}
                    </div>

                    <span
                      className={`text-xs font-medium px-2 py-1 border ${
                        p.ready
                          ? "border-emerald-400/30 text-emerald-300"
                          : "border-line text-muted-2"
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
                className="w-full px-8 py-4 text-[#0d1117] font-bold text-base transition-colors mb-3 bg-accent hover:bg-accent-strong disabled:bg-white/10 disabled:text-white/30 disabled:cursor-not-allowed"
              >
                {mySide ? "I'm ready" : "Choose a side first"}
              </button>
            ) : (
              <button
                onClick={handleUnready}
                className="w-full px-8 py-4 text-[#0d1117] font-bold text-base transition-colors mb-3 bg-amber-400 hover:bg-amber-300"
              >
                Waiting for opponent… tap to unready
              </button>
            )}

            <button
              onClick={handleCancel}
              className="w-full px-6 py-3 bg-black/10 hover:bg-white/8 border border-line text-muted hover:text-cream text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {stage === "countdown" && (
          <div className="border-t-2 border-accent bg-surface p-12 text-center">
            <p className="eyebrow mb-8 justify-center">Debate starting in</p>

            <div className="font-serif text-9xl text-cream mb-12 tabular-nums">
              {countdown}
            </div>

            <p className="text-muted-2 text-sm">
              &ldquo;For&rdquo; begins with the Opening Statement. The debate
              will then move through each stage in order.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}