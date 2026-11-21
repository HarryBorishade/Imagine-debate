# Release reconciliation handover - 21 November 2026

The release handover PDF and supplied interrupted checkout have been reviewed against pushed source commit `af0cf77`. Implementation is on branch `codex/release-reconciliation-20261121` in:

`C:\Users\Harry\ImagineDebate-Backups\release-review-20261121-163540\source-restore-check`

The supplied export is unchanged. Production migration SQL, schema, scheduled jobs, Edge Functions and accounts were not changed by this work. A read-only remote metadata attempt was unavailable; the handover's reported production state is attributed rather than presented as independently verified. The owner confirmed there is no staging project and asked to finish local tests.

## Backup and recovery

- Full pre-edit checkout archive: `C:\Users\Harry\ImagineDebate-Backups\release-review-20261121-163540\checkout-exact.zip`. All 34,664 files and the Git branch, commit, index, staged/unstaged differences and untracked status were verified after extraction. `verification.json` beside it records the checksum and verification. It captures branch `codex/combined-local-work-20261121` at commit `af0cf7778b61fe4a6cf3f9b077bec5c88639b315`.
- An additional verified source-and-Git snapshot is `source-and-git-exact.zip` in the same folder. It excludes installed dependencies and generated builds, preserves local configuration and Git state, and has its own verification report.
- The supplied interrupted release export was separately archived as `supplied-release-exact.zip` and its 126 files were restored and compared byte for byte. `supplied-release-verification.json` records that check.
- These are source-checkout backups, not Supabase database backups. The parent folder has account-restricted ACLs. The archives are not encrypted and contain private local configuration; do not upload or commit them.

To recover, create a new empty private directory outside existing checkouts, then run locally:

```powershell
python -m zipfile -e 'C:\Users\Harry\ImagineDebate-Backups\release-review-20261121-163540\checkout-exact.zip' '<new-empty-private-directory>'
git -C '<new-empty-private-directory>' status --short
git -C '<new-empty-private-directory>' rev-parse HEAD
```

Do not overwrite an existing working checkout. The current development copy uses ignored dependency-directory junctions to the earlier installed checkout; reinstall dependencies if relocating it or removing the earlier checkout. The full archive includes the dependency files themselves.

## Implemented

1. Preserved the exact five SQL files supplied as reported production migration records, with normalized-line-ending hashes in `imagine-debate/supabase/release-migration-records.json`.
2. Removed the superseded mode, cleanup and room-insert drafts from the pending directory. Moved the pending social migration after the five reported applied records.
3. Filled `20261121151618_verify_cleanup_scheduler_access.sql`. It checks effective browser/owner execution and directly identifiable active pg_cron callers without changing grants or schedules; incomplete job visibility fails closed. Indirect/external jobs remain an operational check.
4. Preserved the hidden-handle change: a blocked account that opts out of discovery is listed as `Blocked player`, with the block still available for removal.
5. Fixed a reproduced result-recovery bug. Cached judging now retries failed result finalization through the existing idempotent RPC instead of returning a saved verdict without repairing the result. IDs and ranked status come from the recorded debate.
6. Added outcome-page feedback and a retry action for a saved verdict whose result is not finalized. Failure keeps the verdict and recovery action visible; success clears the pending state.
7. Made report-function JWT configuration explicit and added local tests of judge identity checks, report persistence without notification, and caller-only account deletion.
8. Updated the Markdown release guidance and marked earlier handoffs as historical so their superseded SQL is not accidentally replayed.

## Validation actually completed

- Frontend lint: passed with no lint warnings after the final harness cleanup.
- Frontend production build: passed. Existing Next.js multiple-lockfile workspace-root warning remains.
- Transcript merge tests: 2 passed.
- Backend build and unit/socket suite: 5 tests passed, including the actual backend with two synthetic clients, reconnects, stale actions, moderation and duplicate sends.
- Deno type checks: judge, report and deletion handlers passed.
- Edge handler plus migration-layout suite: 7 tests passed. It launches actual local Deno handlers with external network denied and mock Auth/database services; fresh paid AI judging is not exercised. The cached-result test reproduced the pre-fix failure and passes after the change.
- Reconciled PostgreSQL/pg_cron Docker suite: passed. It replays the exact supplied records on a synthetic baseline, checks browser creation/protected fields, participant and ranked validation, NULL inputs, ranked/unranked result idempotency, normal/legacy forfeits and owner-only profile reads; runs two accelerated jobs after hardening; rejects a scheduler role lacking EXECUTE; tests the read-only catalog SQL; and exercises friend requests, invitations, blocking, hidden handles and profile access.
- Actual outcome browser UI: passed in isolated headless Chrome against local mock services. Existing verdict displayed without automatic rejudging or repeated state reloads; failed save retry retained the verdict and showed an error; the next retry finalized it and removed the pending status.
- Disposable containers and local handler/browser test processes were stopped by their runners.

Commands, file mapping and remaining checks are centralized in `imagine-debate/docs/release-readiness.md`. The catalog-only audit is `imagine-debate/supabase/verification/release-security.sql`.

## Still required for release

No staging project was created and no paid service was enabled. The real remote migration list and target dry run remain unverified, including whether the August repository migrations have matching history records. Do not infer an actual target's pending set from the local manifest or repair history without comparing schema and recorded changes.

A staging baseline and synthetic accounts are needed to verify the real Auth gateway, new judged debates, two-browser create/join/completion/forfeit flows, friends/invites/blocks, real account erasure and the relevant deployed Edge Function versions. The PDF reports judge v5, report v1 and no deletion function in production; that is not a deployment performed or verified here.

The reported hourly stale cleanup and daily 03:15 UTC retention jobs still need actual staging/live run evidence, caller inventory and retention-behavior checks. The local jobs prove permission and invocation only; their bodies use synthetic fixtures rather than production cleanup code.

A real database restore rehearsal must verify effective function grants, including denying browser result RPC execution, as the PDF reports a mismatch in an earlier restore. Storage objects, scheduler definitions, Edge Function configuration and other external state require appropriate separate recovery. Existing operator-email, privacy and youth-safety release gaps remain documented; local tests do not establish readiness for a public or schools release.
