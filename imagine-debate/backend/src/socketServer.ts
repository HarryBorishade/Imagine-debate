import http from "http";
import express from "express";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { supabase } from "@supabase";

dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const PORT = Number(process.env.PORT || 4000);
const REDIS_URL = process.env.REDIS_URL || "";

const MAX_PLAYERS = 2;
const GRACE_PERIOD_SECONDS = 15;
const DISCONNECT_NAVIGATION_DELAY_MS = 2500;
const DEFAULT_TURN_SECONDS = 120;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

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
  readyState: Record<string, boolean>;
  sideChoice: Record<string, Side>;
  playerNames: Record<string, string>;
  sides: Record<string, Side>;
  debateName: string;
  timePerTurn: number;
  turnOrder?: [string, string];
  currentTurn?: string;
  turnSecondsLeft?: number;
}

const rooms: Record<string, DebateRoom> = {};
const userSockets: Record<string, Set<string>> = {};
const gracePeriodTimers: Record<string, NodeJS.Timeout> = {};
const turnTimers: Record<string, NodeJS.Timeout> = {};
const debateMetaCache: Record<string, { name: string; timePerTurn: number }> = {};

// Key format: `${debateId}:${userId}`
const pendingDisconnectTimers: Record<string, NodeJS.Timeout> = {};

io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization as string | undefined)?.replace(
        "Bearer ",
        ""
      );

    if (!token) {
      return next(new Error("Authentication error: no token"));
    }

    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET!) as JwtPayload | null;

    if (!decoded?.sub) {
      return next(new Error("Authentication error: invalid token"));
    }

    (socket as any).user = {
      id: decoded.sub,
      username: decoded.email?.split("@")[0] || "User",
    } satisfies AuthUser;

    next();
  } catch {
    next(new Error("Authentication error"));
  }
});

function roomKey(debateId: string) {
  return `debate_${debateId}`;
}

function pendingDisconnectKey(debateId: string, userId: string) {
  return `${debateId}:${userId}`;
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

async function fetchDebateMeta(
  debateId: string
): Promise<{ name: string; timePerTurn: number }> {
  if (debateMetaCache[debateId]) {
    return debateMetaCache[debateId];
  }

  const { data, error } = await supabase
    .from("debates")
    .select("topic, time_per_turn")
    .eq("id", debateId)
    .single();

  if (error || !data) {
    console.warn(
      `⚠️ Could not load debate meta for ${debateId}:`,
      error?.message
    );

    return {
      name: debateId,
      timePerTurn: DEFAULT_TURN_SECONDS,
    };
  }

  const meta = {
    name: data.topic as string,
    timePerTurn: (data.time_per_turn as number) ?? DEFAULT_TURN_SECONDS,
  };

  debateMetaCache[debateId] = meta;
  return meta;
}

function getConnectedPlayers(
  debateId: string,
  excludeSocketId?: string
): PlayerInfo[] {
  const sockets = io.sockets.adapter.rooms.get(roomKey(debateId));

  if (!sockets) return [];

  const seen = new Set<string>();
  const players: PlayerInfo[] = [];

  for (const socketId of sockets) {
    if (socketId === excludeSocketId) continue;

    const socket = io.sockets.sockets.get(socketId) as any;

    if (!socket?.user || seen.has(socket.user.id)) continue;

    seen.add(socket.user.id);

    players.push({
      id: socket.user.id,
      username: socket.user.username,
    });
  }

  return players;
}

function emitLobbyState(debateId: string, excludeSocketId?: string) {
  const room = rooms[debateId];

  const players = getConnectedPlayers(debateId, excludeSocketId).map((player) => ({
    ...player,
    ready: room?.readyState[player.id] ?? false,
    side: room?.sideChoice[player.id] ?? null,
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

function clearPendingDisconnect(debateId: string, userId: string) {
  const key = pendingDisconnectKey(debateId, userId);

  if (pendingDisconnectTimers[key]) {
    clearTimeout(pendingDisconnectTimers[key]);
    delete pendingDisconnectTimers[key];
  }
}

function clearAllPendingDisconnectsForDebate(debateId: string) {
  for (const key of Object.keys(pendingDisconnectTimers)) {
    if (key.startsWith(`${debateId}:`)) {
      clearTimeout(pendingDisconnectTimers[key]);
      delete pendingDisconnectTimers[key];
    }
  }
}

function clearTurnTimer(debateId: string) {
  if (turnTimers[debateId]) {
    clearInterval(turnTimers[debateId]);
    delete turnTimers[debateId];
  }
}

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
        username: room.currentTurn
          ? room.playerNames[room.currentTurn]
          : undefined,
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

function advanceTurn(debateId: string) {
  const room = rooms[debateId];

  if (!room || !room.turnOrder) return;

  const next =
    room.turnOrder.find((id) => id !== room.currentTurn) ?? room.turnOrder[0];

  startTurn(debateId, next);
}

function pauseTurnTimer(debateId: string) {
  clearTurnTimer(debateId);
}

function resumeTurnTimer(debateId: string) {
  const room = rooms[debateId];

  if (
    !room ||
    room.currentTurn === undefined ||
    room.turnSecondsLeft === undefined
  ) {
    return;
  }

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

function startGracePeriod(debateId: string, disconnectedUserId: string) {
  const room = rooms[debateId];

  if (!room) return;

  if (gracePeriodTimers[debateId]) {
    return;
  }

  const disconnectedUsername =
    room.playerNames[disconnectedUserId] ?? "Opponent";

  let secondsLeft = GRACE_PERIOD_SECONDS;

  pauseTurnTimer(debateId);

  io.to(roomKey(debateId)).emit("opponent_disconnected", {
    username: disconnectedUsername,
    secondsLeft,
  });

  gracePeriodTimers[debateId] = setInterval(() => {
    const connected = getConnectedPlayers(debateId);
    const userCameBack = connected.some(
      (player) => player.id === disconnectedUserId
    );

    if (userCameBack) {
      clearGracePeriod(debateId);

      io.to(roomKey(debateId)).emit("opponent_reconnected");
      resumeTurnTimer(debateId);
      return;
    }

    secondsLeft -= 1;

    if (secondsLeft <= 0) {
      clearGracePeriod(debateId);
      clearTurnTimer(debateId);
      clearAllPendingDisconnectsForDebate(debateId);

      const remainingPlayers = getConnectedPlayers(debateId).filter(
        (player) => player.id !== disconnectedUserId
      );

      if (remainingPlayers.length > 0) {
        const winner = remainingPlayers[0];

        io.to(roomKey(debateId)).emit("debate_ended", {
          reason: "opponent_disconnected",
          winner: {
            id: winner.id,
            username: winner.username,
          },
          loser: {
            id: disconnectedUserId,
            username: disconnectedUsername,
          },
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

function scheduleDisconnectCheck(
  userId: string,
  debateId: string,
  excludeSocketId?: string
) {
  clearPendingDisconnect(debateId, userId);

  const key = pendingDisconnectKey(debateId, userId);

  pendingDisconnectTimers[key] = setTimeout(() => {
    delete pendingDisconnectTimers[key];

    const connectedPlayers = getConnectedPlayers(debateId, excludeSocketId);
    const userStillConnected = connectedPlayers.some(
      (player) => player.id === userId
    );

    if (userStillConnected) {
      return;
    }

    startGracePeriod(debateId, userId);
  }, DISCONNECT_NAVIGATION_DELAY_MS);
}

function handleUserLeft(
  userId: string,
  debateId: string,
  reason: "left" | "disconnected",
  excludeSocketId?: string
) {
  const room = rooms[debateId];

  if (!room) return;

  const username = room.playerNames[userId] ?? "Unknown";

  if (room.status === "active") {
    if (reason === "disconnected") {
      scheduleDisconnectCheck(userId, debateId, excludeSocketId);
      return;
    }

    clearPendingDisconnect(debateId, userId);
    clearGracePeriod(debateId);
    clearTurnTimer(debateId);

    const remainingPlayers = getConnectedPlayers(debateId, excludeSocketId).filter(
      (player) => player.id !== userId
    );

    if (remainingPlayers.length > 0) {
      const winner = remainingPlayers[0];

      io.to(roomKey(debateId)).emit("debate_ended", {
        reason: "opponent_left",
        winner: {
          id: winner.id,
          username: winner.username,
        },
        loser: {
          id: userId,
          username,
        },
      });
    }

    clearAllPendingDisconnectsForDebate(debateId);
    delete rooms[debateId];
    return;
  }

  delete room.readyState[userId];
  delete room.sideChoice[userId];

  const remainingPlayers = getConnectedPlayers(debateId, excludeSocketId);

  if (remainingPlayers.length === 0) {
    clearGracePeriod(debateId);
    clearTurnTimer(debateId);
    clearAllPendingDisconnectsForDebate(debateId);

    delete rooms[debateId];

    console.log(`🗑 Room ${debateId} cleaned up because it is empty`);
    return;
  }

  emitLobbyState(debateId, excludeSocketId);
}

io.on("connection", (socket: Socket) => {
  const user = (socket as any).user as AuthUser;

  console.log(`🔌 Connected: ${user.username} (${user.id})`);

  userSockets[user.id] ??= new Set();
  userSockets[user.id].add(socket.id);

  socket.on("join_debate", async ({ debateId }: { debateId: string }) => {
    if (!debateId) return;

    const room = getRoom(debateId);

    if (!debateMetaCache[debateId]) {
      const meta = await fetchDebateMeta(debateId);

      room.debateName = meta.name;
      room.timePerTurn = meta.timePerTurn;
    }

    room.playerNames[user.id] = user.username;

    const connectedPlayersBeforeJoin = getConnectedPlayers(debateId);
    const isRejoin = connectedPlayersBeforeJoin.some(
      (player) => player.id === user.id
    );

    if (room.status === "active") {
      const wasParticipant = room.sides[user.id] !== undefined;

      if (!wasParticipant) {
        socket.emit("join_error", {
          message: "Debate is already in progress.",
        });
        return;
      }

      socket.join(roomKey(debateId));

      const hadPendingDisconnect =
        !!pendingDisconnectTimers[pendingDisconnectKey(debateId, user.id)];

      const hadGracePeriod = !!gracePeriodTimers[debateId];

      clearPendingDisconnect(debateId, user.id);

      console.log(`🔄 ${user.username} joined active debate ${debateId}`);

      if (hadGracePeriod) {
        clearGracePeriod(debateId);
        io.to(roomKey(debateId)).emit("opponent_reconnected");
        resumeTurnTimer(debateId);
      } else if (hadPendingDisconnect) {
        console.log(
          `✅ ${user.username} moved from lobby to room before grace period started`
        );
      }

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

    if (!isRejoin && connectedPlayersBeforeJoin.length >= MAX_PLAYERS) {
      socket.emit("join_error", {
        message: "Room is full.",
      });
      return;
    }

    socket.join(roomKey(debateId));

    room.readyState[user.id] ??= false;

    console.log(`👥 ${user.username} joined lobby ${debateId}`);

    emitLobbyState(debateId);
  });

  socket.on(
    "choose_side",
      ({ debateId, side }: { debateId: string; side: Side }) => {
      if (!debateId || (side !== "for" && side !== "against")) return;

      const room = rooms[debateId];

      if (!room || room.status !== "waiting") return;

      const players = getConnectedPlayers(debateId);
      const opponent = players.find((player) => player.id !== user.id);

      if (opponent && room.sideChoice[opponent.id] === side) {
        socket.emit("side_conflict", {
          message: `Your opponent has already chosen ${side}. Pick the other side.`,
        });
      return;
      }

    room.sideChoice[user.id] = side;

    // If they change side after pressing ready, make them confirm again.
    room.readyState[user.id] = false;

    console.log(`🎭 ${user.username} chose "${side}" in debate ${debateId}`);

    emitLobbyState(debateId);
  }
);

  socket.on("player_ready", ({ debateId }: { debateId: string }) => {
    if (!debateId) return;

    const room = rooms[debateId];

    if (!room || room.status !== "waiting") return;

    if (!room.sideChoice[user.id]) {
      socket.emit("side_conflict", {
        message: "Choose a side before readying up.",
      });
      return;
    }

    room.readyState[user.id] = true;

    console.log(`✋ ${user.username} ready in debate ${debateId}`);

    const players = getConnectedPlayers(debateId);
    const readyCount = players.filter((player) => room.readyState[player.id])
      .length;

    if (players.length >= MAX_PLAYERS && readyCount >= MAX_PLAYERS) {
      const sideEntries = players.map((player) => room.sideChoice[player.id]);

      const sidesDiffer =
        sideEntries[0] &&
        sideEntries[1] &&
        sideEntries[0] !== sideEntries[1];

      if (!sidesDiffer) {
        io.to(roomKey(debateId)).emit("side_conflict", {
          message: "Both players picked the same side. One of you needs to switch.",
        });

        for (const player of players) {
          room.readyState[player.id] = false;
        }

        emitLobbyState(debateId);
        return;
      }

      console.log(`🔥 Starting debate ${debateId}`);

      const forPlayer = players.find(
        (player) => room.sideChoice[player.id] === "for"
      );

      const againstPlayer = players.find(
        (player) => room.sideChoice[player.id] === "against"
      );

      if (!forPlayer || !againstPlayer) {
        io.to(roomKey(debateId)).emit("side_conflict", {
          message: "Both players need to choose opposite sides.",
        });
        return;
      }

      room.sides = {
        [forPlayer.id]: "for",
        [againstPlayer.id]: "against",
      };

      room.turnOrder = [forPlayer.id, againstPlayer.id];
      room.status = "active";
      room.readyState = {};

      const payload = players.map((player) => ({
        ...player,
        side: room.sides[player.id],
      }));

      io.to(roomKey(debateId)).emit("debate_started", {
        debateId,
        debateName: room.debateName,
        timePerTurn: room.timePerTurn,
        players: payload,
        startTime: new Date().toISOString(),
        reconnect: false,
      });

      startTurn(debateId, forPlayer.id);
      return;
    }

    emitLobbyState(debateId);
  });

  socket.on("player_unready", ({ debateId }: { debateId: string }) => {
    if (!debateId) return;

    const room = rooms[debateId];

    if (!room || room.status !== "waiting") return;

    room.readyState[user.id] = false;

    console.log(`🔄 ${user.username} unreadied in debate ${debateId}`);

    emitLobbyState(debateId);
  });

  socket.on(
    "send_message",
      ({ debateId, content }: { debateId: string; content: string }) => {
        if (!debateId || !content?.trim()) return;

        const room = rooms[debateId];

        if (!room || room.status !== "active") return;

    if (room.currentTurn !== user.id) {
      socket.emit("turn_error", {
        message: "It's not your turn yet.",
      });
      return;
    }

    io.to(roomKey(debateId)).emit("new_message", {
      userId: user.id,
      username: user.username,
      content: content.trim(),
      timestamp: new Date().toISOString(),
    });

    // Do NOT call advanceTurn here.
    // The turn only changes when the timer reaches 0.
  }
);

  socket.on("leave_debate", ({ debateId }: { debateId: string }) => {
    if (!debateId) return;

    socket.leave(roomKey(debateId));

    console.log(`🚪 ${user.username} left ${debateId}`);

    handleUserLeft(user.id, debateId, "left", socket.id);
  });

  socket.on("disconnect", () => {
    console.log(`❌ Disconnected: ${user.username} (${user.id})`);

    const sockets = userSockets[user.id];

    if (!sockets) return;

    sockets.delete(socket.id);

    if (sockets.size > 0) {
      return;
    }

    delete userSockets[user.id];

    for (const debateId of Object.keys(rooms)) {
      const room = rooms[debateId];

      if (!room) continue;

      const userWasInWaitingRoom = room.readyState[user.id] !== undefined;
      const userWasInActiveRoom = room.sides[user.id] !== undefined;

      if (userWasInWaitingRoom || userWasInActiveRoom) {
        handleUserLeft(user.id, debateId, "disconnected", socket.id);
      }
    }
  });
});

app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({
    status: "ok",
    activeRooms: Object.keys(rooms).length,
    connectedUsers: Object.keys(userSockets).length,
  });
});

let redisDisconnect: (() => Promise<void>) | null = null;

async function start() {
  try {
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

async function shutdown(signal: string) {
  console.log(`\n${signal} — shutting down...`);

  if (redisDisconnect) {
    await redisDisconnect();
  }

  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));