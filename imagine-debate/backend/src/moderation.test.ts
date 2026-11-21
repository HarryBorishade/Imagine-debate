import assert from "node:assert/strict";
import test from "node:test";
import { containsBlockedLanguage, prepareTimeoutDraft } from "./moderation.js";

test("manual messages and timeout drafts use the same blocked-language filter", () => {
  const content = "fuck";
  assert.equal(containsBlockedLanguage(content), true);
  assert.deepEqual(prepareTimeoutDraft(content, 100), { kind: "blocked" });
});

test("timeout drafts submit clean text with the word cap or pass when empty", () => {
  assert.deepEqual(prepareTimeoutDraft("  a thoughtful point  ", 2), {
    kind: "ready", content: "a thoughtful",
  });
  assert.deepEqual(prepareTimeoutDraft("  ", 100), { kind: "empty" });
  assert.deepEqual(prepareTimeoutDraft("hello fuck", 1), { kind: "blocked" });
});
