import test from "node:test";
import assert from "node:assert/strict";
import { mergeMessageHistory } from "./mergeMessageHistory.ts";

test("a late transcript fetch preserves live messages and avoids duplicates", () => {
  const history = [{ id: 1, content: "earlier" }, { id: 2, content: "overlap" }];
  const live = [{ id: 2, content: "overlap" }, { id: 3, content: "arrived during fetch" }];
  assert.deepEqual(mergeMessageHistory(history, live).map((message) => message.id), [1, 2, 3]);
});

test("an empty history response does not erase live or system messages", () => {
  const current = [{ content: "reconnected" }, { id: 4, content: "live" }];
  assert.deepEqual(mergeMessageHistory([], current), current);
});
