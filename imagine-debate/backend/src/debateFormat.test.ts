import assert from "node:assert/strict";
import test from "node:test";
import { speakerIndex } from "./debateFormat.js";

test("structured keeps FOR then AGAINST in all seven stages", () => {
  assert.deepEqual(Array.from({ length: 14 }, (_, i) => speakerIndex("classic_v1", Math.floor(i / 2), i % 2)),
    [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1]);
});

test("open exchange gives each side four turns and alternates through exchanges", () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => speakerIndex("open_exchange_v1", Math.floor(i / 2), i % 2)),
    [0, 1, 1, 0, 1, 0, 1, 0]);
});
