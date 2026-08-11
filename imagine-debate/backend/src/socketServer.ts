import http from "http";
import express from "express";
import cors from "cors";
import { Server, Socket } from "socket.io";
import dotenv from "dotenv";
import { supabase } from "./supabase/supabaseClient.js";

dotenv.config();

const FRONTEND_ORIGINS = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
const LAN_HOST = process.env.LAN_HOST || "";
const REDIS_URL = process.env.REDIS_URL || "";

const MAX_PLAYERS = 2;
const GRACE_PERIOD_SECONDS = 15;
const DISCONNECT_NAVIGATION_DELAY_MS = 2500;
const DEFAULT_TURN_SECONDS = 120;
const MAX_MESSAGE_WORDS = 300;

const app = express();

app.use(
  cors({
    origin: FRONTEND_ORIGINS,
    credentials: true,
  })
);

app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGINS,
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

type DebateStatus = "waiting" | "active" | "completed";
type Side = "for" | "against";

type ArgumentPart =
  | "opening_statement"
  | "primary_claim"
  | "evidence"
  | "explanation"
  | "rebuttal"
  | "counter_rebuttal"
  | "closing_statement";

interface DebateStage {
  argumentPart: ArgumentPart;
  label: string;
}

const DEBATE_STAGES: DebateStage[] = [
  {
    argumentPart: "opening_statement",
    label: "Opening Statement",
  },
  {
    argumentPart: "primary_claim",
    label: "Primary Claim",
  },
  {
    argumentPart: "evidence",
    label: "Evidence",
  },
  {
    argumentPart: "explanation",
    label: "Explanation",
  },
  {
    argumentPart: "rebuttal",
    label: "Rebuttal",
  },
  {
    argumentPart: "counter_rebuttal",
    label: "Counter-Rebuttal",
  },
  {
    argumentPart: "closing_statement",
    label: "Closing Statement",
  },
];

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

  currentStageIndex: number;
  currentSpeakerIndex: number;
  turnIndex: number;

  /** Latest unsent draft per user, so a turn that times out can submit
   *  whatever the player had typed instead of discarding it. */
  drafts: Record<string, string>;
}

const rooms: Record<string, DebateRoom> = {};
const userSockets: Record<string, Set<string>> = {};
const gracePeriodTimers: Record<string, NodeJS.Timeout> = {};
const turnTimers: Record<string, NodeJS.Timeout> = {};
interface DebateMeta {
  name: string;
  timePerTurn: number;
  status: string;
  appraisalStatus: string | null;
}

const debateMetaCache: Record<string, DebateMeta> = {};
const pendingDisconnectTimers: Record<string, NodeJS.Timeout> = {};

io.use(async (socket, next) => {
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

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      console.error("❌ Supabase auth error:", error?.message);
      return next(new Error("Authentication error: invalid token"));
    }

    const metadata = data.user.user_metadata as
      | {
          username?: string;
          name?: string;
          full_name?: string;
        }
      | undefined;

    (socket as any).user = {
      id: data.user.id,
      username:
        metadata?.username?.trim() ||
        metadata?.name?.trim() ||
        metadata?.full_name?.trim() ||
        "User",
    } satisfies AuthUser;

    next();
  } catch (err) {
    console.error("❌ Socket auth middleware error:", err);
    next(new Error("Authentication error"));
  }
});

function roomKey(debateId: string) {
  return `debate_${debateId}`;
}

function pendingDisconnectKey(debateId: string, userId: string) {
  return `${debateId}:${userId}`;
}

// SECTION: Normalise Text Debate IDs
function normaliseDebateId(value: unknown): string | null {
  const debateId =
    typeof value === "string" || typeof value === "number"
      ? String(value).trim()
      : "";

  return debateId.length > 0 ? debateId : null;
}

function getMessageDebateId(debateId: string): number | null {
  const numericDebateId = Number(debateId);

  if (
    !Number.isSafeInteger(numericDebateId) ||
    numericDebateId <= 0
  ) {
    return null;
  }

  return numericDebateId;
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
    currentStageIndex: 0,
    currentSpeakerIndex: 0,
    turnIndex: 0,
    drafts: {},
  };

  return rooms[debateId];
}

/** Applies an Elo-style rating update via the database RPC. The RPC is the
 *  only writer of profiles.rating/wins/losses/draws and is idempotent per
 *  debate, so it's safe to call from every code path that can end a debate
 *  (forfeit-disconnect, forfeit-leave) without risking a double-count. */
async function applyDebateResult(
  debateId: string,
  forPlayerId: string,
  againstPlayerId: string,
  winningSide: Side | "draw",
  endedReason: "ai_judged" | "forfeit_disconnect" | "forfeit_left"
): Promise<void> {
  const { error } = await supabase.rpc("apply_debate_result", {
    p_debate_id: debateId,
    p_for_player_id: forPlayerId,
    p_against_player_id: againstPlayerId,
    p_winning_side: winningSide,
    p_ended_reason: endedReason,
  });

  if (error) {
    console.error(
      `❌ Failed to apply rating update for debate ${debateId}:`,
      error.message
    );
  }
}

function getCurrentStage(room: DebateRoom): DebateStage | null {
  return DEBATE_STAGES[room.currentStageIndex] ?? null;
}

function getCurrentSide(room: DebateRoom): Side | null {
  if (!room.turnOrder || !room.currentTurn) return null;

  return room.sides[room.currentTurn] ?? null;
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/** Persists one debate message and broadcasts it to the room. Shared by the
 *  explicit "send_message" handler and the turn-timeout auto-submit path, so
 *  a message sent because time ran out looks identical to one sent by hand.
 *  Returns whether the save succeeded. */
async function persistAndBroadcastMessage(
  debateId: string,
  room: DebateRoom,
  userId: string,
  content: string
): Promise<boolean> {
  const currentStage = getCurrentStage(room);

  if (!currentStage) return false;

  const side = room.sides[userId] ?? null;
  const messageDebateId = getMessageDebateId(debateId);

  if (messageDebateId === null) return false;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      debate_id: messageDebateId,
      sender_id: userId,
      sender_username: room.playerNames[userId] ?? "Player",
      side,
      argument_part: currentStage.argumentPart,
      stage_index: room.currentStageIndex,
      turn_index: room.turnIndex,
      content,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("❌ Failed to save message:", error?.message);
    return false;
  }

  io.to(roomKey(debateId)).emit("new_message", {
    id: data.id,
    debateId: data.debate_id,
    userId: data.sender_id,
    username: data.sender_username,
    side: data.side,
    argumentPart: data.argument_part,
    argumentPartLabel: currentStage.label,
    stageIndex: data.stage_index,
    turnIndex: data.turn_index,
    content: data.content,
    timestamp: data.created_at,
  });

  return true;
}

function buildTurnPayload(debateId: string, room: DebateRoom) {
  const currentStage = getCurrentStage(room);
  const currentSide = getCurrentSide(room);

  return {
    debateId,
    debateName: room.debateName,
    currentTurnUserId: room.currentTurn,
    currentTurnUsername: room.currentTurn
      ? room.playerNames[room.currentTurn] ?? "Player"
      : "Player",
    currentSide,
    argumentPart: currentStage?.argumentPart ?? null,
    argumentPartLabel: currentStage?.label ?? null,
    stageIndex: room.currentStageIndex,
    speakerIndex: room.currentSpeakerIndex,
    turnIndex: room.turnIndex,
    totalStages: DEBATE_STAGES.length,
    secondsLeft: room.turnSecondsLeft,
    timePerTurn: room.timePerTurn,
  };
}

// SECTION: Queue Completed Debate for AI Appraisal
async function emitDebateCompleted(debateId: string): Promise<void> {
  const room = rooms[debateId];

  if (!room || room.status === "completed") return;

  room.status = "completed";

  clearTurnTimer(debateId);
  clearGracePeriod(debateId);
  clearAllPendingDisconnectsForDebate(debateId);

  try {
    const { data: updatedDebate, error: completionError } = await supabase
      .from("debates")
      .update({
        status: "completed",
        appraisal_status: "pending",
        appraisal_model: null,
        appraisal_attempts: 0,
        appraisal_error: null,
        appraisal_started_at: null,
        appraisal_completed_at: null,
        appraisal_result: null,
      })
      .eq("id", debateId)
      .select("id")
      .maybeSingle();

    if (completionError) {
      throw new Error(completionError.message);
    }

    if (!updatedDebate) {
      throw new Error(
        `Debate ${debateId} was not found in Supabase and could not be queued.`
      );
    }

    console.log(
      `✅ Debate ${debateId} completed and queued for AI appraisal`
    );

    io.to(roomKey(debateId)).emit("debate_completed", {
      debateId,
      debateName: room.debateName,
      appraisalStatus: "pending",
      message: "Debate completed. AI appraisal is now pending.",
      pipelineVersion: "010707",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while queueing the debate.";

    console.error(
      `❌ Failed to queue debate ${debateId} for AI appraisal:`,
      message
    );

    io.to(roomKey(debateId)).emit("appraisal_queue_error", {
      debateId,
      message:
        "The debate finished, but it could not be queued for appraisal.",
      details: message,
    });
  } finally {
    delete debateMetaCache[debateId];
    delete rooms[debateId];
  }
}

async function fetchDebateMeta(
  debateId: string
): Promise<DebateMeta | null> {
  if (debateMetaCache[debateId]) {
    return debateMetaCache[debateId];
  }

  const { data, error } = await supabase
    .from("debates")
    .select("topic, time_per_turn, status, appraisal_status")
    .eq("id", debateId)
    .maybeSingle();

  if (error || !data) {
    console.warn(
      `⚠️ Could not load debate meta for ${debateId}:`,
      error?.message ?? "Debate not found."
    );

    return null;
  }

  const meta: DebateMeta = {
    name: data.topic as string,
    timePerTurn: (data.time_per_turn as number) ?? DEFAULT_TURN_SECONDS,
    status: String(data.status ?? "waiting"),
    appraisalStatus:
      typeof data.appraisal_status === "string"
        ? data.appraisal_status
        : null,
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

  const players = getConnectedPlayers(debateId, excludeSocketId).map(
    (player) => ({
      ...player,
      ready: room?.readyState[player.id] ?? false,
      side: room?.sideChoice[player.id] ?? null,
    })
  );

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

      const currentStage = getCurrentStage(room);
      const timedOutUserId = room.currentTurn;

      io.to(roomKey(debateId)).emit("turn_timeout", {
        debateId,
        userId: timedOutUserId,
        username: timedOutUserId
          ? room.playerNames[timedOutUserId]
          : undefined,
        argumentPart: currentStage?.argumentPart ?? null,
        argumentPartLabel: currentStage?.label ?? null,
        stageIndex: room.currentStageIndex,
        turnIndex: room.turnIndex,
      });

      // If the player had typed something, send it for them instead of
      // discarding it — only a truly empty box costs them the turn outright.
      const draft = timedOutUserId ? room.drafts[timedOutUserId]?.trim() : "";

      if (timedOutUserId && draft) {
        const words = draft.split(/\s+/).filter(Boolean);
        const clamped =
          words.length > MAX_MESSAGE_WORDS
            ? words.slice(0, MAX_MESSAGE_WORDS).join(" ")
            : draft;

        void persistAndBroadcastMessage(
          debateId,
          room,
          timedOutUserId,
          clamped
        ).then(() => {
          // advanceTurn clears the draft either way, so a failed save never
          // leaves the player stuck mid-turn.
          advanceTurn(debateId);
        });
        return;
      }

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

  const currentStage = getCurrentStage(room);

  if (!currentStage) {
    void emitDebateCompleted(debateId);
    return;
  }

  room.currentTurn = userId;
  room.turnSecondsLeft = room.timePerTurn;

  io.to(roomKey(debateId)).emit("turn_started", buildTurnPayload(debateId, room));

  tickTurnTimer(debateId);
}

function advanceTurn(debateId: string) {
  const room = rooms[debateId];

  if (!room || !room.turnOrder) return;

  clearTurnTimer(debateId);

  // Whatever the outgoing speaker had typed is now resolved (sent, timed out
  // and auto-submitted, or passed) — don't let a stale draft leak into their
  // next turn.
  if (room.currentTurn) {
    delete room.drafts[room.currentTurn];
  }

  room.turnIndex += 1;

  if (room.currentSpeakerIndex === 0) {
    room.currentSpeakerIndex = 1;
  } else {
    room.currentSpeakerIndex = 0;
    room.currentStageIndex += 1;
  }

  const nextStage = getCurrentStage(room);

  if (!nextStage) {
    void emitDebateCompleted(debateId);
    return;
  }

  const nextUserId = room.turnOrder[room.currentSpeakerIndex];

  startTurn(debateId, nextUserId);
}

function pauseTurnTimer(debateId: string) {
  clearTurnTimer(debateId);
}

function resumeTurnTimer(debateId: string) {
  const room = rooms[debateId];

  if (!room || !room.currentTurn || room.turnSecondsLeft === undefined) {
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

  if (!room || gracePeriodTimers[debateId]) return;

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

        if (room.turnOrder) {
          const winnerSide = room.sides[winner.id];

          if (winnerSide) {
            void applyDebateResult(
              debateId,
              room.turnOrder[0],
              room.turnOrder[1],
              winnerSide,
              "forfeit_disconnect"
            );
          }
        }
      } else if (room.turnOrder) {
        // Both players are gone — there's no one left to declare a winner
        // over. Close the debate out as a draw so it doesn't linger on both
        // dashboards as "active" forever with no resolution.
        void applyDebateResult(
          debateId,
          room.turnOrder[0],
          room.turnOrder[1],
          "draw",
          "forfeit_disconnect"
        );
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

    if (userStillConnected) return;

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

    const remainingPlayers = getConnectedPlayers(
      debateId,
      excludeSocketId
    ).filter((player) => player.id !== userId);

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

      if (room.turnOrder) {
        const winnerSide = room.sides[winner.id];

        if (winnerSide) {
          void applyDebateResult(
            debateId,
            room.turnOrder[0],
            room.turnOrder[1],
            winnerSide,
            "forfeit_left"
          );
        }
      }
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

    // The debate never went active, so there's nothing worth keeping —
    // delete it instead of leaving an orphaned "waiting" row on the
    // dashboard forever. Scoped to status='waiting' so this can never touch
    // a debate that started or finished, even under a race.
    void supabase
      .from("debates")
      .delete()
      .eq("id", debateId)
      .eq("status", "waiting")
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          console.error(
            `❌ Failed to delete abandoned debate ${debateId}:`,
            error.message
          );
        }
      });

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

  socket.on(
    "join_debate",
    async ({ debateId: rawDebateId }: { debateId: string }) => {
      const debateId = normaliseDebateId(rawDebateId);

      if (!debateId) {
        socket.emit("join_error", {
          message: "A valid debate ID is required.",
        });
        return;
      }

      const meta = await fetchDebateMeta(debateId);

      if (!meta) {
        socket.emit("join_error", {
          message: "This debate could not be found.",
        });
        return;
      }

      if (meta.status === "completed") {
        const completedPayload = {
          debateId,
          appraisalStatus: meta.appraisalStatus,
          redirectTo: `/debate/${debateId}/outcome`,
          message: "This debate has already finished.",
        };

        socket.emit("debate_already_completed", completedPayload);
        socket.emit("join_error", completedPayload);
        return;
      }

      const room = getRoom(debateId);
      room.debateName = meta.name;
      room.timePerTurn = meta.timePerTurn;
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
    }
  );

  socket.on("choose_side", ({ debateId, side }: { debateId: string; side: Side }) => {
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
    room.readyState[user.id] = false;

    console.log(`🎭 ${user.username} chose "${side}" in debate ${debateId}`);

    emitLobbyState(debateId);
  });

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

    const readyCount = players.filter(
      (player) => room.readyState[player.id]
    ).length;

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
      room.currentStageIndex = 0;
      room.currentSpeakerIndex = 0;
      room.turnIndex = 0;
      room.drafts = {};

      const startTimeIso = new Date().toISOString();

      // Persist in parallel — the in-memory state above is authoritative for
      // the running debate, so don't add a database round-trip to the
      // player-facing start latency. A missed write here only affects
      // dashboard/RLS visibility, never gameplay, so it's logged, not fatal.
      void supabase
        .from("debates")
        .update({
          status: "active",
          for_player_id: forPlayer.id,
          against_player_id: againstPlayer.id,
          started_at: startTimeIso,
        })
        .eq("id", debateId)
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) {
            console.error(
              `❌ Failed to mark debate ${debateId} active in Supabase:`,
              error.message
            );
          }
        });

      const payload = players.map((player) => ({
        ...player,
        side: room.sides[player.id],
      }));

      io.to(roomKey(debateId)).emit("debate_started", {
        debateId,
        debateName: room.debateName,
        timePerTurn: room.timePerTurn,
        players: payload,
        stages: DEBATE_STAGES,
        startTime: startTimeIso,
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
    async ({ debateId, content }: { debateId: string; content: string }) => {
      try {
        if (!debateId || !content?.trim()) return;

        const room = rooms[debateId];

        if (!room || room.status !== "active") return;

        if (room.currentTurn !== user.id) {
          socket.emit("turn_error", {
            message: "It's not your turn yet.",
          });
          return;
        }

        const cleanContent = content.trim();

        if (countWords(cleanContent) > MAX_MESSAGE_WORDS) {
          socket.emit("message_error", {
            message: `Messages must be ${MAX_MESSAGE_WORDS} words or fewer.`,
          });
          return;
        }

        const saved = await persistAndBroadcastMessage(
          debateId,
          room,
          user.id,
          cleanContent
        );

        if (!saved) {
          socket.emit("message_error", {
            message: "Your message could not be saved. Please try again.",
          });
          return;
        }

        advanceTurn(debateId);
      } catch (err) {
        console.error("❌ send_message error:", err);

        socket.emit("message_error", {
          message: "Something went wrong while sending your message.",
        });
      }
    }
  );

  // Lightweight, debounced-on-the-client draft sync — lets the timeout path
  // submit whatever the current speaker had typed instead of discarding it.
  // Silently ignored outside that player's own active turn.
  socket.on(
    "draft_update",
    ({ debateId, content }: { debateId: string; content: string }) => {
      if (!debateId || typeof content !== "string") return;

      const room = rooms[debateId];

      if (!room || room.status !== "active" || room.currentTurn !== user.id) {
        return;
      }

      // Defensive cap — the client already limits by word count, but never
      // trust that without a server-side backstop.
      room.drafts[user.id] = content.slice(0, 4000);
    }
  );


  socket.on("pass_turn", async ({ debateId }: { debateId: string }) => {
    if (!debateId) return;

    const room = rooms[debateId];

    if (!room || room.status !== "active") return;

    if (room.currentTurn !== user.id) {
      socket.emit("turn_error", {
        message: "You can only pass during your turn.",
      });
      return;
    }

    const currentStage = getCurrentStage(room);

    io.to(roomKey(debateId)).emit("turn_passed", {
      debateId,
      userId: user.id,
      username: room.playerNames[user.id] ?? user.username,
      argumentPart: currentStage?.argumentPart ?? null,
      argumentPartLabel: currentStage?.label ?? null,
      stageIndex: room.currentStageIndex,
      turnIndex: room.turnIndex,
    });

    clearTurnTimer(debateId);
    advanceTurn(debateId);
  });


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

      const dynamicImport = new Function(
        "specifier",
        "return import(specifier)"
      ) as <T = any>(specifier: string) => Promise<T>;
      const [{ createAdapter }, { createClient }] = await Promise.all([
        dynamicImport("@socket.io/redis-adapter"),
        dynamicImport("redis"),
      ]);
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

    server.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Allowed frontend: ${FRONTEND_ORIGINS.join(", ")}`);
      console.log(`✅ Health check: http://localhost:${PORT}/health`);
      if (LAN_HOST) {
        console.log(`✅ Network health check: http://${LAN_HOST}:${PORT}/health`);
      }
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