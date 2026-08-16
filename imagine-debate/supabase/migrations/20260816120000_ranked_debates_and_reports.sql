-- Imagine Debate — ranked/unranked debates + report-a-debate
-- Generated 2026-08-16.
--
-- HOW TO APPLY:
--   Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--   (Or, if you use the Supabase CLI: `supabase db push` from the
--   `imagine-debate` folder, with this file left in place under
--   supabase/migrations/.)
--
-- This migration is additive and safe to run on the live project: it adds
-- one new column, rebuilds one function (see below for why), and creates
-- one new table. It does not drop or rewrite any existing table.
--
-- IMPORTANT — apply_debate_result() is being rebuilt with a new required
-- 6th parameter (p_ranked). Postgres identifies functions by name AND
-- parameter types, so adding a parameter creates a second overload rather
-- than replacing the old one — this migration explicitly DROPs the old
-- 5-arg signature first so nothing can accidentally keep calling it. Every
-- caller in the app (backend socketServer.ts, the judge-debate Edge
-- Function) is updated in the same change as this migration; do not apply
-- this migration without deploying that code at the same time, or debate
-- completion will start failing with "function does not exist".

begin;

-- =============================================================================
-- 1. DEBATES — add `ranked`. Replaces the old, functionally-dead
--    `debate_format` selector (text-only / with-evidence) that nothing
--    downstream ever read. `ranked` actually gates whether a debate's
--    result affects profiles.rating/wins/losses/draws.
-- =============================================================================

alter table public.debates
  add column if not exists ranked boolean not null default true;

comment on column public.debates.ranked is
  'Set once at debate creation (create page) and never mutated afterward. '
  'When true, apply_debate_result() updates profiles.rating/wins/losses/'
  'draws for both players; when false, the debate is still marked '
  'completed with a winning_side/ended_reason (still fully reviewable),'
  ' but the Elo/profile update is skipped entirely.';

-- Schema-drift safety: debate_format predates the one tracked migration in
-- this repo, so its exact constraints are unknown from here. The create
-- page stops writing it as of this change; if it happens to be NOT NULL
-- live, this keeps future inserts from failing. Idempotent — succeeds even
-- if the column is already nullable or doesn't exist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'debates' and column_name = 'debate_format'
  ) then
    alter table public.debates alter column debate_format drop not null;
  end if;
end $$;


-- =============================================================================
-- 2. RATING RPC — rebuilt to accept a required p_ranked boolean. See the
--    header note above on why the old 5-arg signature is dropped first.
--    Behavior is unchanged for ranked debates; for unranked debates, the
--    profiles rating/wins/losses/draws block is skipped, but the debates
--    row is still finalized (status/winning_side/ended_reason/
--    rating_applied) so the result is still recorded and reviewable.
--
--    Note on rating_applied: it's set to true unconditionally (ranked or
--    not). It's reused purely as the existing idempotency guard — "this
--    debate's result is finalized, never re-process it" — not literally
--    "a rating changed." There's no code path that changes a debate's
--    `ranked` value after creation, so this has no behavioral
--    consequence; it's a naming precision note only.
-- =============================================================================

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


-- =============================================================================
-- 3. REPORTS — backs the in-room "Report" action. Insert-only from the
--    client is not actually used (see below) — the only writer is the
--    submit-report Edge Function, which uses the service role after
--    verifying the caller is a participant of the referenced debate. The
--    INSERT policy below is kept as defense-in-depth / documented intent
--    in case a client-side insert path is ever added later, mirroring how
--    public.enquiries is modeled: insert-scoped, no SELECT policy for any
--    client role at all — staff read these via the Supabase dashboard /
--    service role.
-- =============================================================================

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  debate_id text references public.debates(id) on delete set null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(reason) between 10 and 2000),
  created_at timestamptz not null default now(),
  constraint reports_reported_user_not_self
    check (reported_user_id is null or reported_user_id <> reporter_id)
);

comment on table public.reports is
  'Free-text reports submitted by a debate participant, one row per '
  'report. Written only by the submit-report Edge Function (service '
  'role) after it verifies the caller took part in the referenced '
  'debate — never directly by clients today. No SELECT policy is '
  'granted, so staff read these via the Supabase dashboard / service '
  'role, mirroring public.enquiries.';

alter table public.reports enable row level security;

drop policy if exists "reports_insert_participant" on public.reports;
create policy "reports_insert_participant"
  on public.reports for insert
  to authenticated
  with check (
    reporter_id = auth.uid()
    and debate_id is not null
    and exists (
      select 1 from public.debates d
      where d.id = reports.debate_id
        and (
          auth.uid() = d.created_by
          or auth.uid() = d.for_player_id
          or auth.uid() = d.against_player_id
        )
        and (
          reported_user_id is null
          or reported_user_id = d.for_player_id
          or reported_user_id = d.against_player_id
        )
    )
  );

revoke update, delete on public.reports from authenticated, anon;

commit;

-- =============================================================================
-- MANUAL REVIEW CHECKLIST
-- =============================================================================
--  [ ] Deploy the updated backend (socketServer.ts) and the updated
--      judge-debate Edge Function in the same release as this migration —
--      both now pass a 6th p_ranked argument to apply_debate_result, and
--      the old 5-arg signature no longer exists after this runs.
--  [ ] Deploy the new submit-report Edge Function and set the
--      RESEND_API_KEY secret before the in-app "Report" button is enabled,
--      or reports will save but the email will fail to send (logged, not
--      fatal, but worth having ready).
