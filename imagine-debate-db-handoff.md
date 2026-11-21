# Imagine Debate - Supabase handoff

**Friend-system update:** A later working-tree migration `imagine-debate/supabase/migrations/20261120130000_private_friends_and_invites.sql` adds private social tables, security-definer RPCs, a debate-start block guard and owner-only profile reads; it deliberately removes legacy `profiles` policies and browser writes. Review the exact migration and all deployed profile consumers, policies, grants and schema drift with a verified backup and staging tests before applying. It has not been applied to production. See `imagine-debate/docs/friends-and-profiles.md` and synthetic SQL tests in `imagine-debate/backend/tests/social-*.sql`.

**Subsequent working-tree update (20 November 2026):** A read-only check of the named production project found no `debates.format_version` column or validated `debates_open_exchange_unranked_check` constraint, and the deployed function list did not include `delete-account`. No changes were made to production. The Socket.IO server also gained room-membership checks and in-process turn-save serialization; consult current files rather than old line references.

**Earlier working-tree update:** Privacy and safety changes also modify `backend/src/socketServer.ts` and `supabase/functions/submit-report/index.ts`; earlier server line numbers below may have shifted. The report function saves a report even when email is missing or fails; it requires `REPORT_RECIPIENT`, `REPORT_FROM_EMAIL` and the email provider credential for notifications. Configure and verify these separately; monitoring the reports table remains essential. Compare the current files before deployment. No additional database migration for these safety changes has been created.

Checkout inspection only; no database, migrations, Edge Functions, or deployments were changed or inspected live. Paths and line numbers below refer to the working tree at inspection, not necessarily the committed source. No credentials or environment-file contents are included.

## Checkout and project identification

- Branch: `master`; HEAD: `326bf82cbc7c32a6090c32aa3553205167412c81`. New debate-mode work described here is **not committed** at that HEAD.
- Unstaged tracked changes relevant to this handoff: `imagine-debate/backend/src/socketServer.ts`, `imagine-debate/frontend/app/debate/create/page.tsx`, `imagine-debate/frontend/app/debate/[debateId]/lobby/page.tsx`, `room/page.tsx`, `outcome/page.tsx`, `imagine-debate/supabase/functions/judge-debate/index.ts`, and `imagine-debate/frontend/README.md`.
- Untracked relevant files: `imagine-debate/backend/src/debateFormat.ts`, `debateFormat.test.ts`, `imagine-debate/supabase/migrations/20261120120000_debate_modes.sql`, `imagine-debate/README.md`, and `imagine-debate/docs/debate-format-proposal.md`.
- Other pre-existing staged changes: `.gitignore`, `To add list.txt`, and Supabase CLI temporary metadata under `imagine-debate/supabase/supabase/.temp/`. An image at the checkout root is untracked. Temporary metadata is not deployment evidence; avoid committing operational metadata without review.
- Two local CLI metadata files (`supabase/.temp/linked-project.json` and `imagine-debate/supabase/supabase/.temp/linked-project.json`) identify the same linked project: `nxieymemspsauodknwld`, named `HarryBorishade's Project`. This verifies only the recorded local CLI link, not that it is the app's production or staging environment, its current accessibility, or the state of its migrations/functions. The production and staging identities and any other project references are **unknown**. Confirm explicitly with the owner before any write. No environment files were inspected.

## What is implemented in this checkout

- `classic_v1` consists of seven stages, each with FOR then AGAINST: opening statement, primary claim, evidence, explanation, rebuttal, counter-rebuttal, and closing statement. That is at most 14 turns. It supports ranked and unranked debates. See `imagine-debate/backend/src/socketServer.ts:92`, `:700` and `imagine-debate/frontend/app/debate/create/page.tsx:232`.
- `classic_v1` is the existing Structured mode. `open_exchange_v1` is an unranked mode with four turns per participant. Speaker sequence is FOR, AGAINST (opening), AGAINST, FOR (exchange 1), AGAINST, FOR (exchange 2), AGAINST, FOR (closing). It uses the existing message `argument_part` values `opening_statement`, `rebuttal`, `counter_rebuttal`, `closing_statement`, with the middle two presented to the player and judge as "Open exchange". See `imagine-debate/backend/src/socketServer.ts:92`, `:125`, `:293`, `:700`, `:1235`; `imagine-debate/backend/src/debateFormat.ts:1`; `imagine-debate/supabase/functions/judge-debate/index.ts:158`.
- The creator can choose 30, 60, 120, 180 or 300 seconds per turn; default is 120, and each message is capped at 100 words. Users can ask questions as ordinary message text; no reply-link/message-type columns or stored pass events are introduced. Disconnect grace is 15 seconds. See `imagine-debate/frontend/app/debate/create/page.tsx:31`, `:94`, `:232`; `imagine-debate/backend/src/socketServer.ts:33`, `:613`, `:1265`.
- Browser sets `ranked=false` for Open Exchange; the proposed database check also rejects `open_exchange_v1` with `ranked=true`. Existing classic debates default to `classic_v1`; verify actual data, RLS and live schema before applying. The database column comment calls the format immutable, but this migration does **not** add an immutability trigger: actual protection depends on the deployed grants/policies and trusted callers.
- Room/turn/draft/timer state is process-local, not restored after a backend restart. The Socket.IO Redis adapter, if configured, is not durable state. This is a current limitation, not something the migration fixes. References: `imagine-debate/backend/src/socketServer.ts:133`, `:156`, `:1420`.

## Exact proposed debate-mode migration

Source: `imagine-debate/supabase/migrations/20261120120000_debate_modes.sql:1`. This file is untracked; live application is unknown. The column uses `IF NOT EXISTS` but the named constraints do not, so do not blindly rerun it against a partially changed database. `ranked` must exist first. Verify actual schema and migration history, including manually applied SQL, before deciding what to do.

```sql
begin;

-- Existing debates keep their original rules. The pilot cannot affect ratings,
-- including when a client bypasses the create screen.
alter table public.debates
  add column if not exists format_version text not null default 'classic_v1';

alter table public.debates
  add constraint debates_format_version_check
    check (format_version in ('classic_v1', 'open_exchange_v1')),
  add constraint debates_open_exchange_unranked_check
    check (format_version <> 'open_exchange_v1' or ranked = false);

comment on column public.debates.format_version is
  'Immutable debate rules: classic_v1 or unranked open_exchange_v1.';
commit;
```

## Latest checked-in function definitions

These are the latest definitions in the checkout's ordered migration files, **not a claim about the live database**. The initial August 11 migration creates a five-argument result RPC; the later August 16 migration drops it and creates the six-argument version. Check the deployed `pg_proc`, grants and any other overloads. The SQL below is copied directly from the files, including grants and the old-signature drop.

### `public.check_debate_code(p_code text)`

Source `imagine-debate/supabase/migrations/20260811215436_ratings_security_and_enquiries.sql:186`:

```sql
create or replace function public.check_debate_code(p_code text)
returns table (id text, status text)
language sql
security definer
set search_path = public
stable
as $$
  select d.id, d.status
  from public.debates d
  where d.id = p_code;
$$;

grant execute on function public.check_debate_code(text) to authenticated, anon;
```

This returns the ID and status only and is intended for `anon` and `authenticated` callers. `SECURITY DEFINER` executes with the function owner's privileges; inspect the actual owner, default PUBLIC privileges, grants and policies in the database rather than assuming the source grant is the whole access picture.

### `public.apply_debate_result(...)`

Source `imagine-debate/supabase/migrations/20260816120000_ranked_debates_and_reports.sql:75`:

```sql
drop function if exists public.apply_debate_result(text, uuid, uuid, text, text);

create or replace function public.apply_debate_result(
  p_debate_id text,
  p_for_player_id uuid,
  p_against_player_id uuid,
  p_winning_side text, -- 'for' | 'against' | 'draw'
  p_ended_reason text,
  p_ranked boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already_applied boolean;
  v_for_rating integer;
  v_against_rating integer;
  v_expected_for numeric;
  v_expected_against numeric;
  v_score_for numeric;
  v_score_against numeric;
  v_k constant integer := 32;
  v_for_delta integer;
  v_against_delta integer;
begin
  if p_for_player_id is null or p_against_player_id is null then
    raise exception 'apply_debate_result requires both participant ids';
  end if;

  if p_for_player_id = p_against_player_id then
    raise exception 'apply_debate_result requires two distinct participants';
  end if;

  if p_winning_side not in ('for', 'against', 'draw') then
    raise exception 'invalid winning_side: %', p_winning_side;
  end if;

  select rating_applied into v_already_applied
    from public.debates where id = p_debate_id for update;

  if not found then
    raise exception 'Debate % not found', p_debate_id;
  end if;

  if v_already_applied then
    return; -- already finalized (ranked or unranked) — no-op so retries/duplicate calls are safe
  end if;

  if p_ranked then
    insert into public.profiles (id) values (p_for_player_id) on conflict (id) do nothing;
    insert into public.profiles (id) values (p_against_player_id) on conflict (id) do nothing;

    select rating into v_for_rating from public.profiles where id = p_for_player_id for update;
    select rating into v_against_rating from public.profiles where id = p_against_player_id for update;

    v_expected_for := 1.0 / (1.0 + power(10, (v_against_rating - v_for_rating) / 400.0));
    v_expected_against := 1.0 - v_expected_for;

    v_score_for := case p_winning_side
      when 'for' then 1.0
      when 'against' then 0.0
      else 0.5
    end;
    v_score_against := 1.0 - v_score_for;

    v_for_delta := round(v_k * (v_score_for - v_expected_for));
    v_against_delta := round(v_k * (v_score_against - v_expected_against));

    update public.profiles set
        rating = rating + v_for_delta,
        wins = wins + case when p_winning_side = 'for' then 1 else 0 end,
        losses = losses + case when p_winning_side = 'against' then 1 else 0 end,
        draws = draws + case when p_winning_side = 'draw' then 1 else 0 end,
        updated_at = now()
      where id = p_for_player_id;

    update public.profiles set
        rating = rating + v_against_delta,
        wins = wins + case when p_winning_side = 'against' then 1 else 0 end,
        losses = losses + case when p_winning_side = 'for' then 1 else 0 end,
        draws = draws + case when p_winning_side = 'draw' then 1 else 0 end,
        updated_at = now()
      where id = p_against_player_id;
  end if;

  update public.debates set
      status = 'completed',
      winning_side = p_winning_side,
      ended_reason = p_ended_reason,
      rating_applied = true
    where id = p_debate_id;
end;
$$;

revoke all on function public.apply_debate_result(text, uuid, uuid, text, text, boolean) from public, authenticated, anon;
grant execute on function public.apply_debate_result(text, uuid, uuid, text, text, boolean) to service_role;
```

The row lock and `rating_applied` provide per-debate idempotence. In the repository definition `rating_applied` becomes true for unranked debates as well; only ranked debates change profiles. The function accepts `p_ranked` and participant IDs from its trusted caller rather than deriving or checking them against the debate row; assess that trust boundary before changing it. SQL `NOT IN` also does not reject a NULL verdict by itself. Live function owner, grants, overloads and implementation are unknown.

## Callers and role boundaries

| Target / caller | Path and line | Effective caller and use |
| --- | --- | --- |
| `check_debate_code` - creation | `imagine-debate/frontend/app/debate/create/page.tsx:73` | Browser Supabase client, authenticated session required by the create flow. Tries up to ten random codes and checks availability. |
| `check_debate_code` - join | `imagine-debate/frontend/app/debate/join/page.tsx:22` | Browser public client; can call as `anon` before login or as `authenticated`. Four-digit validation, then redirect to lobby. |
| `check_debate_code` - home page | `imagine-debate/frontend/app/page.tsx:151` | Browser client, signed-in user required in this flow. Check code and status before navigating. |
| `apply_debate_result` - forfeit | `imagine-debate/backend/src/socketServer.ts:271`, `:812`, `:826`, `:916` | Socket.IO backend uses its server-side Supabase `service_role` client (`imagine-debate/backend/src/supabase/supabaseClient.ts:17`). Calls on disconnect grace expiry: winner's side, or a draw if both gone; on explicit leave, calls if an opponent remains. Sends room-cached ranked flag; call is asynchronous and errors are logged. Explicit leave with no remaining opponent has no result RPC call in this branch. |
| `apply_debate_result` - normal judged result | `imagine-debate/supabase/functions/judge-debate/index.ts:483`, `:705` | Edge Function uses a `service_role` database client. It passes recorded FOR/AGAINST IDs, AI verdict, `ai_judged` and the ranked flag read from the debate row. The RPC runs after appraisal storage as a best-effort side effect; missing participant IDs skip it, and failure is logged. |
| Judge invocation, indirect result caller | `imagine-debate/backend/src/socketServer.ts:398`, `:462` | Backend invokes judge after normal completion using its server-side client. |
| Judge invocation, indirect result caller | `imagine-debate/frontend/app/debate/[debateId]/outcome/page.tsx:284` | Browser invokes judge for an eligible outcome/retry. Function authenticates a participant or recognizes a trusted system caller before using its service-role client (`judge-debate/index.ts:443`, `:540`). `supabase/config.toml:1` specifies `verify_jwt=false`; actual deployed setting is unknown. |
| Abandoned waiting-room cleanup | `imagine-debate/backend/src/socketServer.ts:870`, `:938` | Not a named database cleanup RPC: backend `service_role` directly deletes the `debates` row by ID **and** `status='waiting'` when its waiting room becomes empty. Completion/forfeit also clear process-local timers/rooms. Database FK cascades/side effects must be inspected live. |
| Account deletion, possible indirect database effects | `imagine-debate/frontend/app/settings/page.tsx:226`; `imagine-debate/supabase/functions/delete-account/index.ts:58`, `:75`, `:80` | Authenticated browser invokes an Edge Function; the function verifies the user and uses an admin/service-role client to delete that auth user. Whether live FK cascades, triggers or database cleanup functions also run is unknown; inspect them. Local `supabase/config.toml:15` sets `verify_jwt=true`. |

Search of the current checkout's source, migrations, configs and documentation found **no definition or direct caller of a named debate cleanup database function and no checked-in scheduled cleanup job**. The dashboard says debates older than 30 days are expected to be deleted (`imagine-debate/frontend/app/dashboard/page.tsx:363`), but this is UI text, not evidence that a job exists. Judge source mentions a possible future cron/automation (`imagine-debate/supabase/functions/judge-debate/index.ts:443`) but no caller was found. The live database may contain functions, triggers, `pg_cron`/other schedules, webhooks, external jobs or earlier manually applied migrations absent from the checkout. Inventory them and their callers, roles, schedules and dependencies before changing or dropping anything. Historical `.claude` worktrees and generated backend `dist` are not independent sources of active checkout behaviour.

## Exact result-call argument mapping

Both callers invoke the six-argument RPC. The mappings below are the actual values supplied by this checkout:

| RPC argument | Normal AI-judged completion | Forfeit through Socket.IO backend |
| --- | --- | --- |
| `p_debate_id` | `debateId` | `debateId` |
| `p_for_player_id` | `debate.for_player_id` | `room.turnOrder[0]` (FOR) |
| `p_against_player_id` | `debate.against_player_id` | `room.turnOrder[1]` (AGAINST) |
| `p_winning_side` | `finalResult.winner` | `winnerSide`, or `draw` when both disconnected |
| `p_ended_reason` | `ai_judged` | `forfeit_disconnect` or `forfeit_left` |
| `p_ranked` | `debate.ranked !== false` | `room.ranked` (loaded from debate metadata) |

See `imagine-debate/supabase/functions/judge-debate/index.ts:705`, `imagine-debate/backend/src/socketServer.ts:271`, `:500`, `:812`, `:826`, `:916`, `:1198`.

## Creation, participants, result lifecycle and IDs

1. **Create:** `imagine-debate/frontend/app/debate/create/page.tsx:73`, `:105`, `:128` requires a logged-in user; the browser generates a random four-digit code in 1000-9999, checks availability via the RPC, and inserts `id`, topic, optional description, `ranked`, `format_version`, `time_per_turn`, `created_by` and `status='waiting'` as the authenticated user. A unique-conflict error is handled; the preliminary lookup is not an atomic reservation. Existing intended insert RLS is in `imagine-debate/supabase/migrations/20260811215436_ratings_security_and_enquiries.sql:212`, `:227`. Confirm all deployed policies and column privileges.
2. **Participants/start:** socket user authentication uses Supabase auth (`imagine-debate/backend/src/socketServer.ts:170`). Once two connected users choose opposite sides and ready up, the working-tree server waits for a service-role write of `debates.status='active'`, `for_player_id`, `against_player_id` and `started_at` before starting the room (`imagine-debate/backend/src/socketServer.ts:1201`). If the write fails, players remain in the lobby; if a player leaves during the write, the server attempts to reopen the row. A failed rollback can still require investigation. The creator is not necessarily FOR.
3. **Messages:** the server converts the debate string ID to a safe positive integer (`imagine-debate/backend/src/socketServer.ts:230`) and inserts messages with service role, including `debate_id`, sender, side, `argument_part`, `stage_index`, `turn_index`, content (`:314`). Message history reads with the browser client (`imagine-debate/frontend/lib/messageHistory.ts:24`). Intended RLS is participant scoped and browser writes are revoked (`imagine-debate/supabase/migrations/20260811215436_ratings_security_and_enquiries.sql:241`).
4. **Normal finish:** backend marks the row completed and appraisal pending, then invokes `judge-debate` (`imagine-debate/backend/src/socketServer.ts:412`). The judge reads the ordered transcript, requires at least one message from each side, stores the appraisal, and calls the result RPC (`imagine-debate/supabase/functions/judge-debate/index.ts:608`, `:634`, `:680`, `:705`). A judge or rating failure can leave completion and ratings inconsistent; inspect status and logs, do not assume retries are automatic.
5. **Forfeits:** server calls the same result RPC with `forfeit_disconnect` or `forfeit_left` and the cached ranked flag as shown above; these paths do not run normal AI judging. Timed-out turns can auto-submit the last draft or advance if empty (`imagine-debate/backend/src/socketServer.ts:613`); they are not automatically forfeits. The working-tree server now extends the turn when a timed-out draft cannot be saved; a mock-backed test covers this path. Verify deployed behaviour independently.
6. **Types:** checkout expects `public.debates.id` and the RPC debate ID to be `text`; application IDs are four-digit numeric strings. `public.messages.debate_id` is expected as `bigint`, so server, judge and browser history convert to JavaScript numbers (`imagine-debate/backend/src/socketServer.ts:230`, `:327`; `imagine-debate/supabase/functions/judge-debate/index.ts:505`; `imagine-debate/frontend/lib/messageHistory.ts:24`). `reports.debate_id` is defined as text (`imagine-debate/supabase/migrations/20260816120000_ranked_debates_and_reports.sql:187`). Actual live types, constraints and any other references are unknown; do not normalize IDs or change column types without dependency analysis.

## Checks for the Supabase assistant

- Identify the confirmed target project/environment, schema drift, migration history versus manual changes, policies including permissive combinations, privileges and actual function definitions. Inspect database cleanup routines, triggers, scheduled jobs, extensions and any external job evidence. Do not infer that a missing local definition is missing remotely.
- Compare deployed `judge-debate`, `delete-account`, `submit-report` code and per-function JWT configuration to the checkout. `submit-report` has no explicit function stanza in this checkout's `imagine-debate/supabase/config.toml`; live configuration is unknown. Do not expose secret values.
- The mode migration is intended to precede server and judge code that selects `format_version`, then frontend deployment; it should not be treated as sufficient on its own. Reconcile code versions and migration history in staging, preserve old debates, test two clients and both modes/forfeits/rating outcomes, and agree production rollout with the owner. Existing active rooms may not survive a backend restart.
- No live tests, Supabase permissions, server deployment, frontend deployment, job schedules, backups or secret configuration have been verified from this checkout.
