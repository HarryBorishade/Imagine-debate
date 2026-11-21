# Debate reliability: research and handover

Historical work report. Current release migration reconciliation, result-retry recovery and checks are recorded in [release readiness](imagine-debate/docs/release-readiness.md).

Prepared locally on 20 November 2026. No changes were deployed, pushed, or applied to Supabase. The backup is of the project checkout, not a Supabase database backup.

## Recovery and workspace

- Original checkout: `C:\Users\Harry\OneDrive\HarryBorishade\Professional Life\Imagine-debate`; branch `master`, commit `326bf82cbc7c32a6090c32aa3553205167412c81` at snapshot time.
- Private archive: `C:\Users\Harry\ImagineDebate-Backups\checkout-snapshot-20261120-233001\checkout-exact.zip`. Its parent directory has inheritance disabled and access restricted to the current Windows account. The ZIP is **not encrypted** and includes ignored files and potentially credentials; keep the entire folder private and do not upload or commit it.
- The archive was extracted to an independent recovery directory and checked against the archive using SHA-256 for every file; directory inventories and Git branch, commit, staged entries, staged and unstaged diffs, and untracked status also matched. Source files matched the archive except `.git/index`, whose stat-cache bytes were refreshed while checking; its logical staged state matched. Subsequent Git checks used disposable copies of the index. `verification.json` in the backup directory records the verification and archive checksum. The original recovery directory is now the development checkout and is no longer a pristine copy; the archive remains unchanged.
- To restore without overwriting work, create an empty **private** directory outside either checkout and run in PowerShell:

  ```powershell
  Expand-Archive -LiteralPath 'C:\Users\Harry\ImagineDebate-Backups\checkout-snapshot-20261120-233001\checkout-exact.zip' -DestinationPath '<new-empty-private-directory>'
  git -C '<new-empty-private-directory>' status --short
  git -C '<new-empty-private-directory>' rev-parse HEAD
  ```

  Check the restored changes before taking any further action. The snapshot contains `.git` and may contain references to other Git worktrees; inspect them before using worktree cleanup commands.
- Work is in the **independent cloned Git metadata in the extracted checkout**, not in the original repository's branch list: `C:\Users\Harry\ImagineDebate-Backups\checkout-snapshot-20261120-233001\recovery-check`, branch `codex/debate-reliability-20261120`. It contains the original staged, unstaged and untracked work plus the changes below. No commit was created. In particular, the copied original index already includes Supabase CLI temporary metadata; inspect the index carefully and do not use indiscriminate `git add -A` or commit credentials.

## Journey inspected and changes

Creation chooses a format and inserts the debate; joining resolves its code and moves players into a lobby to select sides and mark ready. The server records the participants, then controls alternating turns. The room reconnects through Socket.IO and reloads stored messages; after completion the outcome page presents judging. Active room state and synced drafts are held in server memory, so a server restart is not a durable recovery mechanism. A client-side draft still does not survive a page refresh. A previously submitted message may have an uncertain outcome when connectivity drops; the interface tells the user to check the transcript before retrying.

- **Retain and confirm arguments:** `imagine-debate/frontend/app/debate/[debateId]/room/page.tsx` keeps text until the server broadcasts the matching stored message. Rejections and interrupted connections keep the text; repeated clicks while waiting are blocked. A confirmation timeout warns the user to check the transcript before retrying. This does not implement durable drafts or exactly-once delivery.
- **Make interruptions safer:** the same room page shows a connection interruption and disables send/pass until rejoined. The server in `imagine-debate/backend/src/socketServer.ts` rejects send/pass while its opponent-disconnect grace timer is active and pauses a newly advanced timer if a save completed during that pause. New clients send a turn index; the server rejects an action for a different turn. For compatibility the server still accepts older clients that omit the index, so the stale-action guard is not universal until legacy clients are retired.
- **Preserve the transcript:** `imagine-debate/frontend/lib/mergeMessageHistory.ts` merges a reconnect history response with live events that arrived while it was loading, avoiding duplicate message IDs. History fetch errors are still returned as empty history by existing code, and are not distinguished from a genuinely empty transcript.

No schema changes or paid services are required. The original 15-second grace policy and debate formats are unchanged.

## Research and decisions

- [Slack: Send and read messages](https://slack.com/help/articles/201457107-Send-and-read-messages-in-Slack) says unsent text is saved as a draft. That establishes a product feature, not evidence of its causal effect. For this app, preserving text on failed submission addresses a directly observed loss; durable cross-refresh drafts were deferred because of privacy and turn-association requirements.
- [Google Research: Simple is better](https://research.google/blog/simple-is-better-making-your-web-forms-easy-to-use-pays-off/) summarizes a controlled study of a bundle of form-design guidelines and describes preserving fields after errors. The study supports clearer, less disruptive forms as a group; it does not prove this individual change improves debate outcomes.
- [Chess.com: What is lag in live chess?](https://support.chess.com/en/articles/8652311-what-is-lag-in-live-chess) documents connection indicators in a timed multiplayer setting. This is feature evidence, not an evaluation of its impact. A visible interruption and paused actions fit our timed room; we did not copy its timing or fairness rules.
- [Socket.IO: Handling disconnections](https://socket.io/docs/v4/tutorial/handling-disconnections) and [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/) document missed events and delivery limits. Those technical constraints support reloading and merging transcript data, disabling sends while reconnecting, and validating the intended turn; they are not a user study.
- [Kialo Edu: Creating a Claim](https://support.kialo-edu.com/en/hc/creating-a-claim/) documents linked claims in structured discussions; [Discord: Replies FAQ](https://support.discord.com/hc/en-us/articles/360057382374-Replies-FAQ) documents contextual replies. These are examples of product features, not proof of improved outcomes. Claim trees or reply links could help people follow arguments, but were deferred: they would require debate, storage and judging design changes and are less urgent than preventing lost arguments.

## Checks actually run

- Backend: `npm run build`; `node --test dist/debateFormat.test.js dist/moderation.test.js` (4 passed); `node --test tests/socket.integration.test.mjs` (1 integration test passed). The latter starts the actual backend with fake local Supabase and multiple Socket.IO clients; it covers lobby/start, failed participant save, moderation, duplicate concurrent sends, both clients through all eight Open Exchange turns, disconnect/grace/rejoin, paused send/pass, stale-turn send/pass, and failed timed-draft save and retry.
- Frontend: `npm run lint` and `npm run build` passed. The build warned that Next.js inferred the workspace root from multiple lockfiles. `node --test lib/mergeMessageHistory.test.mjs` passed 2 tests under Node 24.
- An isolated headless Chrome ran the actual room page against local fake Auth/history and a local fake Socket.IO server: simulated rejection retained the text, a confirmed message cleared it, and disconnect/reconnect messaging appeared. The private disposable harness is `C:\Users\Harry\ImagineDebate-Backups\checkout-snapshot-20261120-233001\room-browser-test.cjs`. This was not an end-to-end test of the real Auth, database, judging or deployment, and it did not exercise the create, join and outcome pages in the browser. The two-client backend test uses a simulated database; it does not prove production RLS, deployed Edge Functions, or real network behavior.

## Remaining decisions and limits

Before release, review the full pre-existing work and staged index separately, verify the production database/schema and integration with a safe staging environment, and perform real-device two-user create/join/debate/outcome testing. No claim is made that the whole app is production-ready. Consider whether drafts should survive refresh and how long they should be retained, with an appropriate privacy design; whether to identify transcript load failures explicitly; and whether to remove old-client compatibility for turn indexes when all clients have updated. The room server remains single-process in-memory state; reliable recovery from server restarts would require a separate persistence design and database review.
