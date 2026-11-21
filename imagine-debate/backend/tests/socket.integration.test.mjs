import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { io } = require("socket.io-client");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function event(socket, name, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, handler); reject(new Error(`Timed out waiting for ${name}`)); }, timeout);
    const handler = (value) => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(name, handler);
      resolve(value);
    };
    socket.on(name, handler);
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  return server.address().port;
}

test("room membership and concurrent submissions are enforced by the socket server", async () => {
  const messages = [];
  let simulateSaveFailure = false;
  let simulateStartFailure = true;
  const fake = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/auth/v1/user") {
      const token = (req.headers.authorization || "").replace(/^Bearer /, "");
      res.end(JSON.stringify({ id: token, user_metadata: { username: token } }));
      return;
    }
    if (url.pathname === "/rest/v1/debates" && req.method === "GET") {
      const status = url.searchParams.get("id") === "eq.9876" ? "active" : "waiting";
      const timePerTurn = url.searchParams.get("id") === "eq.1111" ? 1 : 120;
      res.end(JSON.stringify([{ topic: "Test motion", time_per_turn: timePerTurn, status, appraisal_status: null, ranked: false, format_version: "open_exchange_v1" }]));
      return;
    }
    if (url.pathname === "/rest/v1/debates" && req.method === "PATCH") {
      if (simulateStartFailure) {
        simulateStartFailure = false;
        res.statusCode = 503; res.end(JSON.stringify({ message: "Simulated startup failure" })); return;
      }
      if (req.headers.prefer?.includes("return=representation")) res.end(JSON.stringify({ id: "1234" }));
      else { res.statusCode = 204; res.end(); }
      return;
    }
    if (url.pathname === "/functions/v1/judge-debate") { res.end(JSON.stringify({ success: true })); return; }
    if (url.pathname === "/rest/v1/messages" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const row = JSON.parse(body);
      if (simulateSaveFailure) {
        simulateSaveFailure = false;
        res.statusCode = 503;
        res.end(JSON.stringify({ message: "Simulated storage failure" }));
        return;
      }
      messages.push(row);
      await sleep(250);
      res.end(JSON.stringify({ ...row, id: messages.length, created_at: new Date().toISOString() }));
      return;
    }
    res.statusCode = 404; res.end(JSON.stringify({ error: "Not found" }));
  });
  const fakePort = await listen(fake);
  const reservation = http.createServer();
  const backendPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ["dist/socketServer.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${fakePort}`, SUPABASE_SERVICE_ROLE_KEY: "local-test-only", PORT: String(backendPort), HOST: "127.0.0.1", REDIS_URL: "" },
    stdio: "ignore",
  });
  const clients = [];
  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { if ((await fetch(`http://127.0.0.1:${backendPort}/health`)).ok) { ready = true; break; } } catch { /* server starting */ }
      await sleep(100);
    }
    assert.equal(ready, true, "test backend did not start");
    for (const token of ["player-a", "player-b", "outsider"]) {
      const socket = io(`http://127.0.0.1:${backendPort}`, { auth: { token }, transports: ["websocket"], reconnection: false });
      clients.push(socket);
      await event(socket, "connect");
    }
    const [a, initialB, outsider] = clients;
    let b = initialB;
    const rejected = event(outsider, "join_error");
    outsider.emit("join_debate", { debateId: "9876" });
    assert.match((await rejected).message, /cannot be resumed/);
    let state = event(a, "lobby_state", (x) => x.players.length === 1);
    a.emit("join_debate", { debateId: "1234" }); await state;
    state = event(a, "lobby_state", (x) => x.players.length === 2);
    b.emit("join_debate", { debateId: "1234" }); await state;
    state = event(a, "lobby_state", (x) => x.players.some((p) => p.id === "player-a" && p.side === "for"));
    a.emit("choose_side", { debateId: "1234", side: "for" }); await state;
    state = event(a, "lobby_state", (x) => x.players.some((p) => p.id === "player-b" && p.side === "against"));
    b.emit("choose_side", { debateId: "1234", side: "against" }); await state;
    a.emit("player_ready", { debateId: "1234" });
    let incorrectlyStarted = false;
    const markStarted = () => { incorrectlyStarted = true; };
    a.on("debate_started", markStarted);
    const startError = event(a, "side_conflict");
    const unready = event(a, "lobby_state", (x) => x.players.length === 2 && x.players.every((p) => !p.ready));
    b.emit("player_ready", { debateId: "1234" });
    assert.match((await startError).message, /could not start/);
    await unready;
    assert.equal(incorrectlyStarted, false, "room started without saved participant IDs");
    a.off("debate_started", markStarted);
    a.emit("player_ready", { debateId: "1234" });
    const started = event(a, "debate_started");
    b.emit("player_ready", { debateId: "1234" }); await started;
    let ended = false;
    a.on("debate_ended", () => { ended = true; });
    outsider.emit("leave_debate", { debateId: "1234" });
    await sleep(150);
    assert.equal(ended, false, "an unrelated socket ended the debate");
    // The remaining player cannot submit or pass while the opponent is reconnecting.
    const disconnected = event(a, "opponent_disconnected", () => true, 7000);
    b.disconnect();
    await disconnected;
    let pausedError = event(a, "message_error");
    a.emit("send_message", { debateId: "1234", content: "Must wait for reconnect.", expectedTurnIndex: 0 });
    assert.match((await pausedError).message, /paused/);
    pausedError = event(a, "turn_error");
    a.emit("pass_turn", { debateId: "1234", expectedTurnIndex: 0 });
    assert.match((await pausedError).message, /paused/);
    assert.equal(messages.length, 0);
    b = io(`http://127.0.0.1:${backendPort}`, { auth: { token: "player-b" }, transports: ["websocket"], reconnection: false });
    clients.push(b);
    await event(b, "connect");
    const rejoined = event(b, "debate_started", (x) => x.reconnect);
    const resumed = event(a, "opponent_reconnected");
    b.emit("join_debate", { debateId: "1234" });
    await Promise.all([rejoined, resumed]);
    const blocked = event(a, "message_error");
    a.emit("send_message", { debateId: "1234", content: "fuck" });
    assert.match((await blocked).message, /isn't allowed/);
    assert.equal(messages.length, 0, "blocked language reached message storage");
    const nextTurn = event(a, "turn_started", (x) => x.currentTurnUserId === "player-b");
    a.emit("send_message", { debateId: "1234", content: "A clear and respectful argument." });
    a.emit("send_message", { debateId: "1234", content: "A duplicate submission." });
    a.emit("pass_turn", { debateId: "1234" });
    await nextTurn;
    await sleep(400);
    assert.equal(messages.length, 1, "multiple messages were saved for one turn");
    assert.equal(messages[0].sender_id, "player-a");
    assert.equal(ended, false);
    // A buffered action from an earlier turn cannot be applied on this turn.
    let stale = event(b, "message_error");
    b.emit("send_message", { debateId: "1234", content: "Stale argument.", expectedTurnIndex: 0 });
    assert.match((await stale).message, /turn changed/);
    stale = event(b, "turn_error");
    b.emit("pass_turn", { debateId: "1234", expectedTurnIndex: 0 });
    assert.match((await stale).message, /turn changed/);
    assert.equal(messages.length, 1);
    const sequence = [b, b, a, b, a, b, a];
    for (let index = 0; index < sequence.length; index++) {
      const received = event(a, "new_message");
      const next = index < sequence.length - 1
        ? event(a, "turn_started", (x) => x.turnIndex === index + 2)
        : event(a, "debate_completed");
      sequence[index].emit("send_message", { debateId: "1234", content: `Respectful argument ${index + 2}.` });
      await received;
      await next;
    }
    assert.deepEqual(messages.map((message) => message.sender_id), ["player-a", "player-b", "player-b", "player-a", "player-b", "player-a", "player-b", "player-a"]);
    assert.deepEqual(messages.map((message) => message.stage_index), [0, 0, 1, 1, 2, 2, 3, 3]);

    // A timed-out draft must not disappear or advance when persistence fails.
    state = event(a, "lobby_state", (x) => x.players.length === 1);
    a.emit("join_debate", { debateId: "1111" }); await state;
    state = event(a, "lobby_state", (x) => x.players.length === 2);
    b.emit("join_debate", { debateId: "1111" }); await state;
    state = event(a, "lobby_state", (x) => x.players.some((p) => p.id === "player-a" && p.side === "for"));
    a.emit("choose_side", { debateId: "1111", side: "for" }); await state;
    state = event(a, "lobby_state", (x) => x.players.some((p) => p.id === "player-b" && p.side === "against"));
    b.emit("choose_side", { debateId: "1111", side: "against" }); await state;
    a.emit("player_ready", { debateId: "1111" });
    const secondStarted = event(a, "debate_started", (x) => x.debateId === "1111");
    b.emit("player_ready", { debateId: "1111" }); await secondStarted;
    simulateSaveFailure = true;
    const saveError = event(a, "turn_save_error");
    a.emit("draft_update", { debateId: "1111", content: "A draft that needs saving." });
    assert.equal((await saveError).userId, "player-a");
    assert.equal(messages.length, 8, "failed save unexpectedly wrote a message");
    const retryTurn = event(a, "turn_started", (x) => x.debateId === "1111" && x.currentTurnUserId === "player-b");
    a.emit("send_message", { debateId: "1111", content: "A draft that needs saving." });
    await retryTurn;
    assert.equal(messages.length, 9, "retry did not save the preserved turn");
  } finally {
    for (const client of clients) client.disconnect();
    child.kill();
    await new Promise((resolve) => fake.close(resolve));
  }
});
