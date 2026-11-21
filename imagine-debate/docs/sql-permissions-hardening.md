# Cleanup and debate-creation permission hardening

These are local migration candidates. They have not been applied to production. They are based on the supplied `01_cleanup_permissions.sql` and `02_debate_creation_permissions.sql`, reviewed against the current checkout.

## Changes

- `20261121010000_cleanup_permissions.sql` removes EXECUTE on both named cleanup functions from PUBLIC, anon and authenticated, constrains the stale-cleanup function's search path, and checks effective browser and postgres privileges. The supplied patch is extended to inspect active, directly identifiable `pg_cron` jobs and abort transactionally if their role would lose EXECUTE. It does not grant new privileges or change schedules. If the migration role cannot see all cron rows because of RLS, the check fails closed. If `cron.job` does not exist, no cron check runs.
- `20261121010100_debate_creation_permissions.sql` replaces browser table-wide INSERT with the columns used by the create page. It grants `format_version` when that column already exists. It checks effective anonymous and protected-column privileges and leaves service-role INSERT unchanged. Existing column-level grants or inherited privileges that defeat the intended restriction cause the transaction to fail.

The create page at `frontend/app/debate/create/page.tsx` sends `id`, `topic`, `description`, `ranked`, `format_version`, `time_per_turn`, `created_by` and `status`. The current modes migration precedes these candidate migrations in version order. If a database receives the hardening migration before `format_version` is added, that later migration must explicitly grant INSERT on the new column to authenticated after review, or the current create page will fail. Do not assume migration history reflects manually applied changes.

## Production preflight and limitations

- The production scheduler role and current function definitions were **not verified** by this session. A read-only linked CLI attempt failed. Before applying anything, inventory active and disabled jobs, `pg_cron` job owners and effective grants, indirect wrappers, external schedulers, and all other callers. The new check detects active jobs only when their stored command directly contains either function name; it cannot prove anything about indirect, dynamic or external jobs. Manually verify those dependencies and their privileges.
- The two no-argument cleanup functions must already exist. Otherwise the migration intentionally fails rather than silently claiming cleanup is protected. Reconcile drift and migrations on staging first.
- Compare the live `cleanup_stale_debates` implementation and every unqualified object reference against `pg_catalog, public, pg_temp`. Verify untrusted roles cannot create objects in schemas trusted by security-definer routines. A changed search path can break dependencies or introduce name-resolution hazards; the synthetic fixture cannot establish live compatibility.
- Inspect the actual roles, role memberships, RLS policies, table and column grants, column defaults, triggers and the API's behavior. These candidates do not create or replace the application's ownership policy. Permissive policies combine, so verify all deployed policies together.
- The test database uses synthetic roles, users, tables, functions and policies. It does not establish live permissions, test the real gateway, or execute the Next.js interface. Use staging with the actual schema and roles, and verify both modes and actual cron execution before deciding on a production rollout.
- Deployment would be an explicit separate operation. Coordinate with active rooms, check backups and rollback plans, and do not run a blind replay of migrations against a drifting schema.

## Local test

With Docker running and the locally available `public.ecr.aws/supabase/postgres:17.6.1.121` image:

```powershell
.\imagine-debate\backend\tests\run-hardening-postgres.ps1
```

The script creates a uniquely named disposable container with `--network none`, synthetic data and a temporary local-only password; it removes the container on exit. It tests before the format column exists and in repository migration order with debate modes and the social migration installed. The tests exercise normal create payloads for classic and Open Exchange, unranked enforcement, owner RLS, anonymous/authenticated cleanup denial, protected-column INSERT denial, service-role access, two actual `pg_cron` jobs, and transactional failure if a scheduled role would lose its permission. The initial test harness expected an RLS error for `status='active'`; with the social trigger installed the trigger rejects it first, so the final RLS test uses `status='completed'` to isolate the policy.

The current app work and the migrations are uncommitted. The copied Git index also includes pre-existing Supabase CLI temporary metadata; inspect staged changes and do not indiscriminately stage or commit them.
