# Release readiness after the 21 November handover

This checkout starts from pushed commit `af0cf77` and incorporates the interrupted release export supplied by the owner. The five migration records below are reported applied by the supplied handover and release checks. Their SQL is copied exactly from that export and recorded in `supabase/release-migration-records.json`; this session has not independently read production history. No database migrations or Edge Functions were deployed by this session.

## Migration reconciliation

| Version | Meaning | Local treatment |
| --- | --- | --- |
| 20261121145724 | Cleanup EXECUTE permissions | Preserve supplied SQL |
| 20261121145818 | Debate mode default and constraints | Preserve supplied SQL |
| 20261121145848 | Browser room-creation columns and write restrictions | Preserve supplied SQL |
| 20261121145956 | Result validation, stable profile locks and legacy forfeits | Preserve supplied SQL |
| 20261121150056 | Owner-only profile reads | Preserve supplied SQL |
| 20261121151618 | Check cleanup scheduler execution roles | Pending; verification only, no schedule/grant changes |
| 20261121152000 | Private friends, blocks and invitations | Pending; includes hidden-handle block-list behavior |

The three superseded mode, cleanup and room-insert drafts were removed from the migration directory. The earlier social draft was moved after the reported applied versions. Preserve the reported applied files: make subsequent changes in new migrations. The layout test checks their hashes after normalizing line endings and detects duplicate versions and superseded drafts.

The August migrations (`20260811215436`, `20260816120000`) remain historical repository files. Their remote migration-record status is **unknown**. A schema can contain their effects without recording those versions. Do not infer that there are only two pending migrations on a real target until actual migration history and schema have been reconciled. Do not use `migration repair` or `--include-all` to suppress a mismatch without establishing what actually ran.

Use the installed CLI's help and the [official migration deployment guide](https://supabase.com/docs/guides/deployment/database-migrations) to inspect `migration list` and `db push --dry-run` against the explicitly identified staging target. Do not run a normal push during an audit. The repository is not a complete initial database schema; isolated testing below uses a synthetic baseline rather than claiming a fresh project can be built from these migrations alone.

## Implemented application fixes

The judge now attempts the result RPC for a cached appraisal as well as a fresh appraisal. A saved verdict whose result update failed can therefore recover without another AI call. The RPC uses participant IDs and ranked status from the recorded debate, and the recorded database function owns idempotency. The outcome page retains the saved verdict, explains when result saving is unfinished, and provides a retry action with visible failure feedback. The `rating_applied` flag means result finalization even for an unranked debate; the UI does not promise a rating change for Open Exchange.

The pending friends migration keeps a blocked user in the block list but shows `Blocked player` when that account has opted out of discovery. The test verifies the hidden handle is not exposed. `submit-report` now has explicit JWT configuration in `supabase/config.toml`; this records the existing default, while the handler also verifies the caller. `delete-account` retains its user-JWT setting and derives the deleted ID from the verified caller.

## Repeatable local checks

From `imagine-debate/`:

```powershell
powershell -ExecutionPolicy Bypass -File backend/tests/run-hardening-postgres.ps1
node --test backend/tests/release-migration-layout.test.mjs
npm run build --prefix backend
node --test backend/dist/debateFormat.test.js backend/dist/moderation.test.js backend/tests/socket.integration.test.mjs
```

Cache and type-check the Edge Function imports, then run their handlers with external network access denied:

```powershell
deno check --no-lock supabase/functions/judge-debate/index.ts supabase/functions/submit-report/index.ts supabase/functions/delete-account/index.ts
node --test backend/tests/edge-functions.integration.test.mjs
```

The Edge tests need Deno and free local port 8000. They use synthetic local Auth/database responses, verify invalid and unrelated callers, repair a failed cached result, retain reports without notification, and verify deletion uses the caller's UUID. The database suite separately tests the actual supplied result SQL under PostgreSQL roles. It does not use production data or live AI/email services.

Frontend checks:

```powershell
npm run lint --prefix frontend
npm run build --prefix frontend
node --test frontend/lib/mergeMessageHistory.test.mjs
node frontend/tests/outcome-recovery.browser.mjs
```

The optional browser runner requires Node 24+, locally installed frontend dependencies and Chrome (or `CHROME_PATH`). It starts an isolated headless profile and local mock Supabase service, displays an existing verdict, exercises a failed retry, then verifies a successful retry clears the pending status. It does not exercise the deployed gateway or live Auth. Full two-browser create/join/fresh judging remains a staging check.

## What remains outside local verification

The owner has no staging project yet. No paid branch or project was created. The handover reports `judge-debate` v5 and `submit-report` v1 in production and no deployed `delete-account`; deployed versions/settings still need inspection and staging tests before rollout.

Obtain an isolated schema baseline and synthetic accounts, then verify all application flows, real handler/gateway authentication, fresh judging, immediate and expired-disconnection forfeits, invitations, blocks and erasure. Rehearse a database restore with jobs and external integrations disabled and audit effective grants using `supabase/verification/release-security.sql`. The prior handover reports a restored result-RPC privilege mismatch: do not treat archive existence or successful table restore as proof that browser execution permissions are safe. Back up Storage objects, scheduler definitions, Edge Function source/settings and other service configuration separately as appropriate; source-code backups are not database recovery points.

The reported production cleanup schedules are hourly at minute 0 and daily at 03:15 UTC, both as postgres. The Docker tests use accelerated synthetic jobs to prove permissions and invocation, not live retention semantics or production execution. Inspect actual job history without exposing stored commands, and verify direct, indirect and external callers. The pending verification detects active commands containing the two function names; missing cron metadata, indirect calls and external schedulers need their own checks.

After staging evidence is reviewed, reconcile history, inspect the target's dry-run plan, apply only the approved pending SQL, deploy Edge Functions, then backend and frontend, and run smoke checks. Record commit/function versions and account for active in-memory rooms before restarting the backend. Existing privacy, support-mailbox and child-safety release gaps remain in `docs/release-privacy-safety.md` and `docs/friends-and-profiles.md`.


Password recovery follow-up: see [password recovery](password-recovery.md). The new reset route is verified with the real local inbox and must be added to hosted Auth redirect configuration and checked with hosted email delivery before rollout.
