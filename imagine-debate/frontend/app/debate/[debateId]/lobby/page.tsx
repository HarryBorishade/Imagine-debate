"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { supabase } from "@/supabaseClient";

interface Player {
  id: string;
  username: string;
  ready: boolean;
}

interface DebateStartedPayload {
  debateId: string;
  players: Array<Player & { side: "for" | "against" }>;
  startTime: string;
  reconnect: boolean;
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

  // FIX: Guard against invalid debateId values (e.g. "new" from /debate/new/lobby).
  // If the URL segment isn't exactly 4 digits, redirect back to the create page
  // immediately — this is what caused the "0NEW" display bug.
  useEffect(() => {
    if (!/^\d{4}$/.test(debateId)) {
      router.replace("/debate/new");
    }
  }, [debateId, router]);

  // debateCode is now safe to derive since we've guarded above
  const debateCode = debateId.padStart(4, "0");

  // ── 1. Load session + connect socket ─────────────────────────────────────
  useEffect(() => {
    // Don't attempt socket connection if debateId is invalid
    if (!/^\d{4}$/.test(debateId)) return;

    let cancelled = false;

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user || !session.access_token) {
        setError("You must be logged in");
        setLoading(false);
        return;
      }

      if (cancelled) return;

      setMyUserId(session.user.id);

      const socketUrl =
        process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

      const s = io(socketUrl, {
        auth: { token: session.access_token },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketRef.current = s;

      s.on("connect", () => {
        console.log("✅ Connected to socket server");
        s.emit("join_debate", { debateId });
      });

      s.on("lobby_state", (data: { players: Player[]; status: string }) => {
        console.log("📋 Lobby state:", data);
        setPlayers(data.players);

        const me = data.players.find((p) => p.id === session.user.id);
        if (me) setIAmReady(me.ready);

        if (data.players.length >= 2) {
          setStage("opponent-joined");
        } else {
          setStage("waiting");
          setIAmReady(false);
        }
      });

      s.on("debate_started", (payload: DebateStartedPayload) => {
        console.log("🔥 Debate started — navigating to room", payload);
        const myEntry = payload.players.find((p) => p.id === session.user.id);
        if (myEntry) {
          sessionStorage.setItem(`debate_${debateId}_side`, myEntry.side);
          sessionStorage.setItem(`debate_${debateId}_startTime`, payload.startTime);
        }
        setStage("countdown");
      });

      s.on("join_error", (data: { message: string }) => {
        console.warn("Join error:", data.message);
        setError(data.message);
        setLoading(false);
      });

      s.on("debate_abandoned", (data: { message: string }) => {
        console.log("⚠️ Debate abandoned:", data.message);
        setStage("waiting");
        setIAmReady(false);
        setCountdown(3);
      });

      s.on("connect_error", (err: Error) => {
        console.warn("⚠️ Connection attempt failed:", err.message);
      });

      s.io.on("reconnect_failed", () => {
        setError(
          "Failed to connect to debate server. Make sure the backend is running on port 4000."
        );
      });

      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [debateId]);

  // ── 2. Countdown → navigate ───────────────────────────────────────────────
  useEffect(() => {
    if (stage !== "countdown") return;
    if (countdown === 0) {
      router.push(`/debate/${debateId}/room`);
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [stage, countdown, debateId, router]);

  // ── 3. Waiting-room elapsed timer ─────────────────────────────────────────
  useEffect(() => {
    if (stage !== "waiting") return;
    const interval = setInterval(() => setTimeElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, [stage]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleReady = () => {
    if (!socketRef.current || iAmReady) return;
    socketRef.current.emit("player_ready", { debateId });
  };

  const handleUnready = () => {
    if (!socketRef.current || !iAmReady) return;
    socketRef.current.emit("player_unready", { debateId });
  };

  const handleCancel = () => {
    socketRef.current?.emit("leave_debate", { debateId });
    router.push("/");
  };

  // ── Render guards ─────────────────────────────────────────────────────────

  // Show nothing while redirect is happening for invalid debateId
  if (!/^\d{4}$/.test(debateId)) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0d1117]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0d1117]">
        <div className="text-center">
          <div className="text-rose-400 text-lg mb-4">{error}</div>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const minutes = Math.floor(timeElapsed / 60);
  const seconds = timeElapsed % 60;

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">

        {/* ── STAGE 1: Waiting for opponent ── */}
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
                onClick={() => {
                  navigator.clipboard.writeText(debateCode);
                }}
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

        {/* ── STAGE 2: Opponent joined — ready check ── */}
        {stage === "opponent-joined" && (
          <div className="bg-white/[0.03] backdrop-blur border border-white/[0.07] rounded-2xl p-12 text-center">
            <div className="mb-8">
              <div className="inline-block p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-6">
                <svg className="w-12 h-12 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-4">
              Opponent joined!
            </h2>
            <p className="text-white/40 mb-8 text-sm leading-relaxed">
              Click Ready when you're prepared to begin.
            </p>

            <div className="bg-white/[0.03] rounded-xl p-6 mb-8 text-left border border-white/[0.06]">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">Players</h3>
              <div className="space-y-3">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm text-white/70">{p.username}</span>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${
                      p.ready
                        ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                        : "bg-white/[0.05] text-white/30"
                    }`}>
                      {p.ready ? "Ready" : "Not ready"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {!iAmReady ? (
              <button
                onClick={handleReady}
                className="w-full px-8 py-4 rounded-xl text-white font-bold text-base transition-all mb-3 bg-emerald-600 hover:bg-emerald-500"
              >
                I'm Ready
              </button>
            ) : (
              <button
                onClick={handleUnready}
                className="w-full px-8 py-4 rounded-xl text-white font-bold text-base transition-all mb-3 bg-amber-600 hover:bg-amber-500"
              >
                Waiting for opponent… (tap to unready)
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

        {/* ── STAGE 3: Countdown ── */}
        {stage === "countdown" && (
          <div className="bg-white/[0.03] backdrop-blur border border-white/[0.07] rounded-2xl p-12 text-center">
            <h2 className="text-xl font-semibold text-white/60 mb-8 tracking-widest uppercase text-sm">
              Debate starting in
            </h2>
            <div className="text-9xl font-bold text-indigo-400 mb-12 tabular-nums">
              {countdown}
            </div>
            <p className="text-white/30 text-sm">
              Get ready — the timer starts when the debate begins.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}