import http from "http";
import express from "express";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { supabase } from "@supabase";  // ⚠️ adjust this import if your client lives elsewhere / has a different export name

dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = Number(process.env.PORT || 4000);
const REDIS_URL = process.env.REDIS_URL || "";
const MAX_PLAYERS = 2;
const GRACE_PERIOD_SECONDS = 15;
const DEFAULT_TURN_SECONDS = 120; // fallback if a debate row has no time_per_turn

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// ─── Types ─────────────────────────────────────────────────────────────────────

interface JwtPayload {
  sub: string;
  email?: string;
}

interface AuthUser {
  id: string;
  username: string;
}

interface PlayerInfo {
  id: string;
  username: string;
  side?: "for" | "against";
}

type DebateStatus = "waiting" | "active";
type Side = "for" | "against";

interface DebateRoom {
  status: DebateStatus;
  // userId -> ready (only meaningful during "waiting")
  readyState: Record<string, boolean>;
  // userId -> chosen side, set during "waiting" via choose_side
  sideChoice: Record<string, Side>;
  // userId -> username (persisted so we can reference disconnected players)
  playerNames: Record<string, string>;
  // userId -> locked-in side assignment (set when debate goes active)
  sides: Record<string, Side>;
  // Debate metadata pulled from Supabase
  debateName: string;
  timePerTurn: number; // seconds
  // Turn state (only meaningful during "active")
  turnOrder?: [string, string]; // [forUserId, againstUserId]
  currentTurn?: string; // userId whose turn it currently is
  turnSecondsLeft?: number;
}

// ─── In-memory state ───────────────────────────────────────────────────────────

const rooms: Record<string, DebateRoom> = {};

// userId -> set of socket IDs (multi-tab / multi-device)
const userSockets: Record<string, Set<string>> = {};

// debateId -> grace period interval
const gracePeriodTimers: Record<string, NodeJS.Timeout> = {};

// debateId -> turn countdown interval
const turnTimers: Record<string, NodeJS.Timeout> = {};

// Cache of debate metadata so we don't hit Supabase on every join
const debateMetaCache: Record<string, { name: string; timePerTurn: number }> = {};

// ─── Auth middleware ───────────────────────────────────────────────────────────

io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization as string | undefined)?.replace("Bearer ", "");

    if (!token) return next(new Error("Authentication error: no token"));

    const decoded = jwt.decode(token) as JwtPayload | null;
    if (!decoded?.sub) return next(new Error("Authentication error: invalid token"));

    (socket as any).user = {
      id: decoded.sub,
      username: decoded.email?.split("@")[0] || "User",
    } satisfies AuthUser;

    next();
  } catch {
    next(new Error("Authentication error"));
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function roomKey(debateId: string) {
  return `debate_${debateId}`;
}

function getRoom(debateId: string): DebateRoom {
  rooms[debateId] ??= {
    status: "waiting",
    readyState: {},
    sideChoice: {},
    playerNames: {},
    sides: {},
    debateName: debateId,
    timePerTurn: DEFAULT_TURN_SECONDS,
  };
  return rooms[debateId];
}

/**
 * Fetches the debate's topic + time_per_turn from Supabase, caching the
 * result so repeat joins/reconnects don't re-query.
 */
async function fetchDebateMeta(
  debateId: string
): Promise<{ name: string; timePerTurn: number }> {
  if (debateMetaCache[debateId]) return debateMetaCache[debateId];

  const { data, error } = await supabase
    .from("debates")
    .select("topic, time_per_turn")
    .eq("id", debateId)
    .single();

  if (error || !data) {
    console.warn(`⚠️ Could not load debate meta for ${debateId}:`, error?.message);
    const fallback = { name: debateId, timePerTurn: DEFAULT_TURN_SECONDS };
    return fallback; // don't cache failures — worth retrying next time
  }

  const meta = {
    name: data.topic as string,
    timePerTurn: (data.time_per_turn as number) ?? DEFAULT_TURN_SECONDS,
  };
  debateMetaCache[debateId] = meta;
  return meta;
}

/**
 * Returns the deduplicated list of players currently connected to a room.
 * Pass `excludeSocketId` to omit a socket that is mid-disconnect but may
 * still appear in adapter.rooms for a brief moment.
 */
function getConnectedPlayers(debateId: string, excludeSocketId?: string): PlayerInfo[] {
  const sockets = io.sockets.adapter.rooms.get(roomKey(debateId));
  if (!sockets) return [];

  const seen = new Set<string>();
  const players: PlayerInfo[] = [];

  for (const sid of sockets) {
    if (sid === excludeSocketId) continue;
    const s = io.sockets.sockets.get(sid) as any;
    if (!s?.user || seen.has(s.user.id)) continue;
    seen.add(s.user.id);
    players.push({ id: s.user.id, username: s.user.username });
  }

  return players;
}

function emitLobbyState(debateId: string, excludeSocketId?: string) {
  const room = rooms[debateId];
  const players = getConnectedPlayers(debateId, excludeSocketId).map((p) => ({
    ...p,
    ready: room?.readyState[p.id] ?? false,
    side: room?.sideChoice[p.id] ?? null,
  }));

  io.to(roomKey(debateId)).emit("lobby_state", {
    players,
    status: room?.status ?? "waiting",
    debateName: room?.debateName ?? debateId,
    timePerTurn: room?.timePerTurn ?? DEFAULT_TURN_SECONDS,
  });
}

function clearGracePeriod(debateId: string) {
  if (gracePeriodTimers[debateId]) {
    clearInterval(gracePeriodTimers[debateId]);
    delete gracePeriodTimers[debateId];
  }
}

// ─── Turn timer ────────────────────────────────────────────────────────────────

function clearTurnTimer(debateId: string) {
  if (turnTimers[debateId]) {
    clearInterval(turnTimers[debateId]);
    delete turnTimers[debateId];
  }
}

/**
 * Begins (or restarts) the per-second countdown for whoever the room's
 * `currentTurn` is currently set to, using whatever `turnSecondsLeft` is
 * already on the room. Does NOT reset secondsLeft — callers that want a
 * fresh full turn should set turnSecondsLeft themselves first (see startTurn).
 */
function tickTurnTimer(debateId: string) {
  clearTurnTimer(debateId);

  turnTimers[debateId] = setInterval(() => {
    const room = rooms[debateId];
    if (!room || room.turnSecondsLeft === undefined) {
      clearTurnTimer(debateId);
      return;
    }

    room.turnSecondsLeft -= 1;

    if (room.turnSecondsLeft <= 0) {
      clearTurnTimer(debateId);
      io.to(roomKey(debateId)).emit("turn_timeout", {
        debateId,
        userId: room.currentTurn,
        username: room.currentTurn ? room.playerNames[room.currentTurn] : undefined,
      });
      advanceTurn(debateId);
      return;
    }

    io.to(roomKey(debateId)).emit("turn_tick", {
      debateId,
      currentTurnUserId: room.currentTurn,
      secondsLeft: room.turnSecondsLeft,
    });
  }, 1000);
}

/** Starts a brand new full-length turn for `userId`. */
function startTurn(debateId: string, userId: string) {
  const room = rooms[debateId];
  if (!room) return;

  room.currentTurn = userId;
  room.turnSecondsLeft = room.timePerTurn;

  io.to(roomKey(debateId)).emit("turn_started", {
    debateId,
    debateName: room.debateName,
    currentTurnUserId: userId,
    currentTurnUsername: room.playerNames[userId] ?? "Player",
    secondsLeft: room.turnSecondsLeft,
    timePerTurn: room.timePerTurn,
  });

  tickTurnTimer(debateId);
}

/** Switches the turn to whichever player in turnOrder is NOT currently up. */
function advanceTurn(debateId: string) {
  const room = rooms[debateId];
  if (!room || !room.turnOrder) return;

  const next = room.turnOrder.find((id) => id !== room.currentTurn) ?? room.turnOrder[0];
  startTurn(debateId, next);
}

/** Pauses the countdown without losing the remaining time (used during grace periods). */
function pauseTurnTimer(debateId: string) {
  clearTurnTimer(debateId);
}

/** Resumes the countdown from wherever turnSecondsLeft was left off. */
function resumeTurnTimer(debateId: string) {
  const room = rooms[debateId];
  if (!room || room.currentTurn === undefined || room.turnSecondsLeft === undefined) return;

  io.to(roomKey(debateId)).emit("turn_started", {
    debateId,
    debateName: room.debateName,
    currentTurnUserId: room.currentTurn,
    currentTurnUsername: room.playerNames[room.currentTurn] ?? "Player",
    secondsLeft: room.turnSecondsLeft,
    timePerTurn: room.timePerTurn,
    resumed: true,
  });

  tickTurnTimer(debateId);
}

// ─── Disconnect / grace period handling ────────────────────────────────────────

/**
 * Starts a grace period for `disconnectedUserId`. If they reconnect in time,
 * the interval is cleared. If not, `debate_ended` is emitted and room cleaned up.
 */
function startGracePeriod(debateId: string, disconnectedUserId: string) {
  const room = rooms[debateId];
  if (!room) return;

  const disconnectedUsername = room.playerNames[disconnectedUserId] ?? "Opponent";
  let secondsLeft = GRACE_PERIOD_SECONDS;

  // The clock pauses while we wait — don't burn turn time during a dropped connection
  pauseTurnTimer(debateId);

  // Immediately notify remaining players
  io.to(roomKey(debateId)).emit("opponent_disconnected", {
    username: disconnectedUsername,
    secondsLeft,
  });

  gracePeriodTimers[debateId] = setInterval(() => {
    // Check if the player reconnected
    const connected = getConnectedPlayers(debateId);
    if (connected.some((p) => p.id === disconnectedUserId)) {
      clearGracePeriod(debateId);
      io.to(roomKey(debateId)).emit("opponent_reconnected");
      resumeTurnTimer(debateId);
      return;
    }

    secondsLeft--;

    if (secondsLeft <= 0) {
      clearGracePeriod(debateId);
      clearTurnTimer(debateId);

      const remainingPlayers = getConnectedPlayers(debateId).filter(
        (p) => p.id !== disconnectedUserId
      );

      if (remainingPlayers.length > 0) {
        const winner = remainingPlayers[0];
        io.to(roomKey(debateId)).emit("debate_ended", {
          reason: "opponent_disconnected",
          winner: { id: winner.id, username: winner.username },
          loser: { id: disconnectedUserId, username: disconnectedUsername },
        });
      }

      delete rooms[debateId];
      return;
    }

    io.to(roomKey(debateId)).emit("opponent_disconnected", {
      username: disconnectedUsername,
      secondsLeft,
    });
  }, 1000);
}

/**
 * Called when a user leaves or disconnects from a debate.
 * `reason` differentiates an intentional leave from a connection drop.
 */
function handleUserLeft(
  userId: string,
  debateId: string,
  reason: "left" | "disconnected",
  excludeSocketId?: string
) {
  const room = rooms[debateId];
  if (!room) return;

  // Record the username before we potentially lose track of it
  const username = room.playerNames[userId] ?? "Unknown";

  if (room.status === "active") {
    if (reason === "disconnected") {
      // Give them a chance to come back
      startGracePeriod(debateId, userId);
      return;
    }

    // Intentional leave — end debate immediately
    clearGracePeriod(debateId);
    clearTurnTimer(debateId);

    const remainingPlayers = getConnectedPlayers(debateId, excludeSocketId).filter(
      (p) => p.id !== userId
    );

    if (remainingPlayers.length > 0) {
      const winner = remainingPlayers[0];
      io.to(roomKey(debateId)).emit("debate_ended", {
        reason: "opponent_left",
        winner: { id: winner.id, username: winner.username },
        loser: { id: userId, username },
      });
    }

    delete rooms[debateId];
    return;
  }

  // Debate was in "waiting" — just update the lobby
  delete room.readyState[userId];
  delete room.sideChoice[userId];

  const remaining = getConnectedPlayers(debateId, excludeSocketId);

  if (remaining.length === 0) {
    clearGracePeriod(debateId);
    clearTurnTimer(debateId);
    delete rooms[debateId];
    console.log(`🗑  Room ${debateId} cleaned up (empty)`);
    return;
  }

  emitLobbyState(debateId, excludeSocketId);
}

// ─── Connection handler ────────────────────────────────────────────────────────

io.on("connection", (socket: Socket) => {
  const user = (socket as any).user as AuthUser;
  console.log(`🔌 Connected: ${user.username} (${user.id})`);

  userSockets[user.id] ??= new Set();
  userSockets[user.id].add(socket.id);

  // ── join_debate ────────────────────────────────────────────────────────────
  socket.on("join_debate", async ({ debateId }: { debateId: string }) => {
    if (!debateId) return;

    const room = getRoom(debateId);

    // Load debate name + turn length once per room
    if (!debateMetaCache[debateId]) {
      const meta = await fetchDebateMeta(debateId);
      room.debateName = meta.name;
      room.timePerTurn = meta.timePerTurn;
    }

    // Always record the username in case this player disconnects later
    room.playerNames[user.id] = user.username;

    const connectedPlayers = getConnectedPlayers(debateId);
    const isRejoin = connectedPlayers.some((p) => p.id === user.id);

    if (room.status === "active") {
      const wasParticipant = room.sides[user.id] !== undefined;

      if (!wasParticipant) {
        // Genuinely new user trying to join a live debate — reject
        socket.emit("join_error", { message: "Debate is already in progress." });
        return;
      }

      // Returning participant — let them back in
      socket.join(roomKey(debateId));
      console.log(`🔄 ${user.username} reconnected to active debate ${debateId}`);

      // Cancel any grace period timer started for this user, resume the clock
      clearGracePeriod(debateId);
      io.to(roomKey(debateId)).emit("opponent_reconnected");
      resumeTurnTimer(debateId);

      // Re-send debate_started so the reconnecting client restores its state
      const players = Object.entries(room.sides).map(([id, side]) => ({
        id,
        username: room.playerNames[id] ?? id,
        side,
      }));

      socket.emit("debate_started", {
        debateId,
        debateName: room.debateName,
        timePerTurn: room.timePerTurn,
        players,
        startTime: null,
        reconnect: true,
        currentTurnUserId: room.currentTurn,
        secondsLeft: room.turnSecondsLeft,
      });

      return;
    }

    // Room is in "waiting" state
    if (!isRejoin && connectedPlayers.length >= MAX_PLAYERS) {
      socket.emit("join_error", { message: "Room is full." });
      return;
    }

    socket.join(roomKey(debateId));
    room.readyState[user.id] ??= false;

    console.log(`👥 ${user.username} joined lobby ${debateId}`);
    emitLobbyState(debateId);
  });

  // ── choose_side ────────────────────────────────────────────────────────────
  socket.on("choose_side", ({ debateId, side }: { debateId: string; side: Side }) => {
    if (!debateId || (side !== "for" && side !== "against")) return;

    const room = rooms[debateId];
    if (!room || room.status !== "waiting") return;

    room.sideChoice[user.id] = side;
    // Changing sides invalidates any previous readiness — make them re-confirm
    room.readyState[user.id] = false;

    console.log(`🎭 ${user.username} chose "${side}" in debate ${debateId}`);
    emitLobbyState(debateId);
  });

  // ── player_ready ───────────────────────────────────────────────────────────
  socket.on("player_ready", ({ debateId }: { debateId: string }) => {
    if (!debateId) return;

    const room = rooms[debateId];
    if (!room || room.status !== "waiting") return;

    if (!room.sideChoice[user.id]) {
      socket.emit("side_conflict", { message: "Choose a side before readying up." });
      return;
    }

    room.readyState[user.id] = true;
    console.log(`✋ ${user.username} ready in debate ${debateId}`);

    const players = getConnectedPlayers(debateId);
    const readyCount = players.filter((p) => room.readyState[p.id]).length;

    if (players.length >= MAX_PLAYERS && readyCount >= MAX_PLAYERS) {
      const sideEntries = players.map((p) => room.sideChoice[p.id]);
      const sidesDiffer =
        sideEntries[0] && sideEntries[1] && sideEntries[0] !== sideEntries[1];

      if (!sidesDiffer) {
        // Both picked the same side (or somehow one is missing) — can't start
        io.to(roomKey(debateId)).emit("side_conflict", {
          message: "Both players picked the same side. One of you needs to switch.",
        });
        // Force everyone to re-ready after sorting it out
        for (const p of players) room.readyState[p.id] = false;
        emitLobbyState(debateId);
        return;
      }

      console.log(`🔥 Starting debate ${debateId}`);

      const forPlayer = players.find((p) => room.sideChoice[p.id] === "for")!;
      const againstPlayer = players.find((p) => room.sideChoice[p.id] === "against")!;

      room.sides = {
        [forPlayer.id]: "for",
        [againstPlayer.id]: "against",
      };
      room.turnOrder = [forPlayer.id, againstPlayer.id];

      room.status = "active";
      room.readyState = {};

      const payload = players.map((p) => ({
        ...p,
        side: room.sides[p.id],
      }));

      io.to(roomKey(debateId)).emit("debate_started", {
        debateId,
        debateName: room.debateName,
        timePerTurn: room.timePerTurn,
        players: payload,
        startTime: new Date().toISOString(),
        reconnect: false,
      });

      // "For" opens the debate
      startTurn(debateId, forPlayer.id);

      return;
    }

    emitLobbyState(debateId);
  });

  // ── player_unready ─────────────────────────────────────────────────────────
  socket.on("player_unready", ({ debateId }: { debateId: string }) => {
    if (!debateId) return;

    const room = rooms[debateId];
    if (!room || room.status !== "waiting") return;

    room.readyState[user.id] = false;
    console.log(`🔄 ${user.username} unreadied in debate ${debateId}`);

    emitLobbyState(debateId);
  });

  // ── send_message ───────────────────────────────────────────────────────────
  socket.on("send_message", ({ debateId, content }: { debateId: string; content: string }) => {
    if (!debateId || !content?.trim()) return;

    const room = rooms[debateId];
    if (!room || room.status !== "active") return;

    if (room.currentTurn !== user.id) {
      socket.emit("turn_error", { message: "It's not your turn yet." });
      return;
    }

    io.to(roomKey(debateId)).emit("new_message", {
      userId: user.id,
      username: user.username,
      content: content.trim(),
      timestamp: new Date().toISOString(),
    });

    // Sending your argument uses up your turn
    advanceTurn(debateId);
  });

  // ── leave_debate ───────────────────────────────────────────────────────────
  socket.on("leave_debate", ({ debateId }: { debateId: string }) => {
    if (!debateId) return;

    socket.leave(roomKey(debateId));
    console.log(`🚪 ${user.username} left ${debateId}`);

    handleUserLeft(user.id, debateId, "left");
  });

  // ── disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`❌ Disconnected: ${user.username} (${user.id})`);

    const sockets = userSockets[user.id];
    if (sockets) {
      sockets.delete(socket.id);

      // Only act when all tabs/connections for this user are gone
      if (sockets.size === 0) {
        delete userSockets[user.id];

        for (const debateId of Object.keys(rooms)) {
          const room = rooms[debateId];
          // Was this user part of this room?
          if (room && (room.readyState[user.id] !== undefined || room.sides[user.id])) {
            handleUserLeft(user.id, debateId, "disconnected", socket.id);
          }
        }
      }
    }
  });
});

// ─── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    activeRooms: Object.keys(rooms).length,
    connectedUsers: Object.keys(userSockets).length,
  });
});

// ─── Redis + startup ───────────────────────────────────────────────────────────

let redisDisconnect: (() => Promise<void>) | null = null;

async function start() {
  try {
    // ─── Redis Setup ────────────────────────────────────────────────
    if (REDIS_URL) {
      console.log("🔁 Connecting to Redis at", REDIS_URL);

      const pubClient = createClient({ url: REDIS_URL });
      const subClient = pubClient.duplicate();

      await pubClient.connect();
      await subClient.connect();

      io.adapter(createAdapter(pubClient, subClient));
      console.log("✅ Redis adapter attached");

      redisDisconnect = async () => {
        await subClient.disconnect().catch(console.warn);
        await pubClient.disconnect().catch(console.warn);
      };
    } else {
      console.warn("⚠️ No REDIS_URL — running in single-instance mode.");
    }

    // ─── Start Server ───────────────────────────────────────────────
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT} (frontend: ${FRONTEND_URL})`);
      console.log(`🌐 LAN access: http://192.168.0.234:${PORT}`);
    });

  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}

start();

// ─── Graceful Shutdown ──────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`\n${signal} — shutting down…`);

  if (redisDisconnect) await redisDisconnect();

  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));