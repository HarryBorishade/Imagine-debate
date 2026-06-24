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
  // iAmReady is derived from the server's lobby_state, not local-only state,
  // so it survives reconnects correctly
  const [iAmReady, setIAmReady] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const debateCode = debateId.slice(-4).toUpperCase().padStart(4, "0");

  // ── 1. Load session + connect socket ─────────────────────────────────────
  useEffect(() => {
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

      // Server sends this after every join or ready-state change
      s.on("lobby_state", (data: { players: Player[]; status: string }) => {
        console.log("📋 Lobby state:", data);
        setPlayers(data.players);

        // Sync iAmReady from server truth — survives reconnects
        const me = data.players.find((p) => p.id === session.user.id);
        if (me) setIAmReady(me.ready);

        if (data.players.length >= 2) {
          setStage("opponent-joined");
        } else {
          setStage("waiting");
          setIAmReady(false); // reset if opponent left
        }
      });

      // FIX: was listening for "both_ready" — server now emits "debate_started"
      s.on("debate_started", (payload: DebateStartedPayload) => {
        console.log("🔥 Debate started — navigating to room", payload);
        // Pass side assignment via sessionStorage so the room page can pick it up
        const myEntry = payload.players.find((p) => p.id === session.user.id);
        if (myEntry) {
          sessionStorage.setItem(`debate_${debateId}_side`, myEntry.side);
          sessionStorage.setItem(`debate_${debateId}_startTime`, payload.startTime);
        }
        setStage("countdown");
      });

      // Room was full or debate already in progress
      s.on("join_error", (data: { message: string }) => {
        console.warn("Join error:", data.message);
        setError(data.message);
        setLoading(false);
      });

      // Opponent left — reset lobby UI
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
    // Don't set iAmReady locally — wait for server to echo it back in lobby_state
    // so it's always in sync with server truth
  };

  const handleUnready = () => {
    if (!socketRef.current || !iAmReady) return;
    socketRef.current.emit("player_unready", { debateId });
  };

  const handleCancel = () => {
    socketRef.current?.emit("leave_debate", { debateId });
    router.push("/dashboard");
  };

  // ── Render guards ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-white text-lg">Loading debate...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-4">{error}</div>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all"
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">

        {/* ── STAGE 1: Waiting for opponent ── */}
        {stage === "waiting" && (
          <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-12 text-center">
            <div className="mb-8">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 border-r-blue-500 rounded-full animate-spin" />
                <div
                  className="absolute inset-2 border-4 border-transparent border-b-blue-400 border-l-blue-400 rounded-full animate-spin"
                  style={{ animationDirection: "reverse" }}
                />
              </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-2">
              Waiting for Opponent
            </h2>
            <p className="text-slate-300 mb-8">
              Your debate room is ready. Share the code below or wait for someone to join.
            </p>

            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-2 border-blue-500 rounded-lg p-8 mb-8">
              <p className="text-slate-400 text-sm uppercase tracking-wider mb-2">
                Debate Code
              </p>
              <div className="text-5xl font-bold text-blue-400 font-mono tracking-widest mb-4">
                {debateCode}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(debateCode);
                  alert("Code copied!");
                }}
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-all"
              >
                Copy Code
              </button>
            </div>

            <div className="text-slate-400 text-sm mb-8">
              Waiting for {minutes}m {seconds.toString().padStart(2, "0")}s
            </div>

            <button
              onClick={handleCancel}
              className="px-6 py-3 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-all"
            >
              Cancel Debate
            </button>
          </div>
        )}

        {/* ── STAGE 2: Opponent joined — ready check ── */}
        {stage === "opponent-joined" && (
          <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-12 text-center">
            <div className="mb-8">
              <div className="inline-block p-4 bg-green-500/20 border border-green-500 rounded-full mb-6">
                <svg className="w-12 h-12 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-4">
              Opponent Found! 🎉
            </h2>
            <p className="text-slate-300 mb-8">
              Your opponent has joined. Click "Ready" when you're prepared to begin the debate.
            </p>

            <div className="bg-slate-600/50 rounded-lg p-6 mb-8 text-left border border-slate-600">
              <h3 className="font-semibold text-white mb-4">📋 Players</h3>
              <div className="space-y-2 text-slate-300">
                {players.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span>{p.username}</span>
                    <span>{p.ready ? "✅ Ready" : "⏳ Not Ready"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ready / Unready toggle */}
            {!iAmReady ? (
              <button
                onClick={handleReady}
                className="px-8 py-4 rounded-lg text-white font-bold text-lg transition-all mb-3 bg-green-600 hover:bg-green-700"
              >
                I'm Ready!
              </button>
            ) : (
              <button
                onClick={handleUnready}
                className="px-8 py-4 rounded-lg text-white font-bold text-lg transition-all mb-3 bg-yellow-600 hover:bg-yellow-700"
              >
                Waiting for opponent... (click to unready)
              </button>
            )}

            <br />

            <button
              onClick={handleCancel}
              className="px-8 py-4 rounded-lg bg-slate-600 hover:bg-slate-500 text-white font-semibold transition-all"
            >
              Cancel Debate
            </button>
          </div>
        )}

        {/* ── STAGE 3: Countdown ── */}
        {stage === "countdown" && (
          <div className="bg-slate-700/50 backdrop-blur border border-slate-600 rounded-lg p-12 text-center">
            <h2 className="text-2xl font-bold text-white mb-8">
              Debate Starting In...
            </h2>
            <div className="text-9xl font-bold text-blue-400 mb-12 animate-pulse">
              {countdown}
            </div>
            <p className="text-slate-300">
              Get ready! The timer will start once the debate begins.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}