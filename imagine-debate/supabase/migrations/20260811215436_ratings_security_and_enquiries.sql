-- Imagine Debate — ratings, RLS hardening, and enquiries
-- Generated 2026-08-11.
--
-- HOW TO APPLY:
--   Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
--   (Or, if you use the Supabase CLI: `supabase db push` from the
--   `imagine-debate` folder, with this file left in place under
--   supabase/migrations/.)
--
-- This migration is additive and safe to run on the live project: it does
-- not drop or rewrite any existing table, and every new RLS policy /
-- column is created fresh. It also REVOKES a small number of write
-- privileges from the `authenticated`/`anon` roles on `debates` and
-- `messages` — see the "HARDEN debates" and "HARDEN messages" sections
-- below for exactly what changes and why. Nothing revoked here is used by
-- the current frontend (verified against the app source before writing
-- this), so this should not break any existing feature.
--
-- IMPORTANT — please read before running:
--   This project's `debates.id` is a 4-digit code (0000-9999, only 10,000
--   possible values). The app currently reads full debate rows (topic, AI
--   judge scores/feedback) directly from the browser using nothing but
--   that code. Because the code space is so small, anyone with an account
--   could brute-force every possible code and read every debate ever
--   created. This migration closes that hole by restricting full-row
--   reads to the two participants (see debates RLS below) while keeping a
--   safe, narrow lookup function for the "does this code exist?" checks
--   the join/home/create pages need.
--
--   I cannot see your project's CURRENT row-level security policies from
--   here (they live only in your live database, not in this repo), so I
--   cannot safely rewrite policies I haven't seen. If policy names below
--   collide with something you already created manually, this migration
--   will fail loudly (not silently) — re-run section by section and adjust
--   names if that happens.

begin;

-- =============================================================================
-- 1. PROFILES — one row per user. Holds rating + win/loss/draw record.
--    Username is a read-only mirror of auth.users' metadata (kept in sync by
--    a trigger below), never independently editable, so a rename can never
--    be used to smuggle a rating/stat change through the same write.
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  rating integer not null default 400,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If public.profiles already existed before this migration (it did in
-- production — an earlier, undocumented version with id/username/role/bio/
-- country/created_at only), `create table if not exists` above is a no-op
-- and none of the rating/wins/losses/draws/updated_at columns get added.
-- These statements backfill them onto whatever profiles table is already
-- there, existing rows included, so this migration is safe to re-run
-- against a project with either a fresh or a pre-existing profiles table.
alter table public.profiles
  add column if not exists rating integer not null default 400,
  add column if not exists wins integer not null default 0,
  add column if not exists losses integer not null default 0,
  add column if not exists draws integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

comment on table public.profiles is
  'Public-ish player record: rating + win/loss/draw record. Written only by '
  'the handle_new_user/sync_profile_username triggers and the '
  'apply_debate_result() function — never directly by clients.';

alter table public.profiles enable row level security;

-- Any signed-in user can view any profile (needed to show an opponent's
-- name/rating in the lobby and room). No INSERT/UPDATE/DELETE policy is
-- granted to authenticated/anon at all, so profiles are effectively
-- read-only from the client — the only writers are SECURITY DEFINER
-- functions below, which run with elevated privileges regardless of RLS.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Creates a profile row automatically for every new signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeps profiles.username mirrored whenever a user updates their username
-- via supabase.auth.updateUser({ data: { username } }) (the settings page
-- uses this path — see app/settings/page.tsx).
create or replace function public.sync_profile_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data ->> 'username' is distinct from old.raw_user_meta_data ->> 'username' then
    update public.profiles
      set username = new.raw_user_meta_data ->> 'username',
          updated_at = now()
      where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_username_updated on auth.users;
create trigger on_auth_user_username_updated
  after update on auth.users
  for each row execute function public.sync_profile_username();

-- Backfill: create profiles for anyone who signed up before this migration.
insert into public.profiles (id, username)
select u.id, u.raw_user_meta_data ->> 'username'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;


-- =============================================================================
-- 2. DEBATES — add columns needed for ratings + participant-scoped security.
-- =============================================================================

alter table public.debates
  add column if not exists for_player_id uuid references auth.users(id) on delete set null,
  add column if not exists against_player_id uuid references auth.users(id) on delete set null,
  add column if not exists winning_side text,
  add column if not exists ended_reason text,
  add column if not exists rating_applied boolean not null default false,
  add column if not exists started_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'debates_winning_side_check'
  ) then
    alter table public.debates
      add constraint debates_winning_side_check
      check (winning_side is null or winning_side in ('for', 'against', 'draw'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'debates_ended_reason_check'
  ) then
    alter table public.debates
      add constraint debates_ended_reason_check
      check (ended_reason is null or ended_reason in ('ai_judged', 'forfeit_disconnect', 'forfeit_left'));
  end if;
end $$;

comment on column public.debates.for_player_id is
  'Set by the backend (service role) once both players ready up. Drives '
  'rating updates and participant-scoped RLS — never set by the client.';
comment on column public.debates.against_player_id is
  'See for_player_id.';

-- Safe, narrow lookup for the "does this 4-digit code exist, and is it still
-- joinable?" checks on the home/join/create pages. SECURITY DEFINER so it
-- can read across all debates without needing a broad SELECT policy, but it
-- only ever returns id + status — never the topic, transcript, or AI
-- judgement of a debate the caller isn't part of. Granted to anon as well as
-- authenticated: /debate/join doesn't gate on being signed in before
-- checking a code, and this function is safe to expose broadly by design.
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

-- HARDEN debates: replace broad/unknown existing access with least-privilege
-- grants matching exactly what the verified frontend code paths use:
--   - INSERT: the "create a debate" page inserts a fresh row directly.
--   - SELECT: the outcome page reads topic/appraisal fields directly, but
--     only for debates the caller took part in (this is the actual security
--     fix for the brute-forceable-code issue described above).
--   - UPDATE / DELETE: nothing in the frontend updates or deletes a debates
--     row directly — every status/result change happens through the backend
--     (service role, bypasses RLS entirely) or the RPC below. Revoking these
--     from authenticated/anon closes off direct tampering (e.g. a client
--     flipping their own debate to "completed" with a fabricated
--     winning_side, or editing someone else's in-progress debate).
revoke update, delete on public.debates from authenticated, anon;

alter table public.debates enable row level security;

drop policy if exists "debates_select_participant" on public.debates;
create policy "debates_select_participant"
  on public.debates for select
  to authenticated
  using (
    auth.uid() = created_by
    or auth.uid() = for_player_id
    or auth.uid() = against_player_id
  );

drop policy if exists "debates_insert_own" on public.debates;
create policy "debates_insert_own"
  on public.debates for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and status = 'waiting'
    and winning_side is null
    and rating_applied = false
    and for_player_id is null
    and against_player_id is null
  );


-- =============================================================================
-- 3. MESSAGES — harden against direct client writes.
--    Every message in the app is sent through the Socket.IO backend (which
--    validates turn order, word limits, and debate stage before writing
--    with the service-role key). No frontend page calls
--    supabase.from("messages") directly. Revoking client write access closes
--    a path for a malicious user to forge messages, skip their turn, or
--    inject unlimited-length content by calling the Supabase API directly
--    instead of going through the app.
-- =============================================================================

revoke insert, update, delete on public.messages from authenticated, anon;

alter table public.messages enable row level security;

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.debates d
      where d.id = messages.debate_id::text
        and (
          auth.uid() = d.created_by
          or auth.uid() = d.for_player_id
          or auth.uid() = d.against_player_id
        )
    )
  );


-- =============================================================================
-- 4. RATING RPC — the only path that may ever change profiles.rating /
--    wins / losses / draws. SECURITY DEFINER, and EXECUTE is granted only
--    to service_role (the backend and Edge Functions), never to
--    authenticated/anon — a client calling this directly could otherwise
--    hand themselves free wins. Idempotent: safe to call twice for the same
--    debate (e.g. a retry), the second call is a no-op.
-- =============================================================================

create or replace function public.apply_debate_result(
  p_debate_id text,
  p_for_player_id uuid,
  p_against_player_id uuid,
  p_winning_side text, -- 'for' | 'against' | 'draw'
  p_ended_reason text
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
    return; -- already scored — no-op so retries/duplicate calls are safe
  end if;

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

  update public.debates set
      status = 'completed',
      winning_side = p_winning_side,
      ended_reason = p_ended_reason,
      rating_applied = true
    where id = p_debate_id;
end;
$$;

revoke all on function public.apply_debate_result(text, uuid, uuid, text, text) from public, authenticated, anon;
grant execute on function public.apply_debate_result(text, uuid, uuid, text, text) to service_role;


-- =============================================================================
-- 5. ENQUIRIES — backs the /contact form. Insert-only from the client (no
--    SELECT policy for authenticated/anon at all) so submitted enquiries —
--    which include a name + email — can never be read back, listed, or
--    enumerated by any user through the API, including the person who sent
--    one. Staff read these via the Supabase dashboard / service role.
-- =============================================================================

create table if not exists public.enquiries (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 150),
  message text not null check (char_length(message) between 10 and 4000),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.enquiries enable row level security;

drop policy if exists "enquiries_insert_anyone" on public.enquiries;
create policy "enquiries_insert_anyone"
  on public.enquiries for insert
  to authenticated, anon
  with check (
    -- If the sender is signed in, user_id must be their own id (or left
    -- null) — never someone else's, so a submitted enquiry can't be used to
    -- impersonate another user in support records.
    user_id is null or user_id = auth.uid()
  );

commit;

-- =============================================================================
-- MANUAL REVIEW CHECKLIST — please check these in the Supabase dashboard
-- (Authentication -> Policies) since I cannot see your live policies from
-- here. None of this SQL changes them; it's a checklist, not a migration.
-- =============================================================================
--  [ ] Confirm no other policy still grants authenticated/anon UPDATE or
--      DELETE on public.debates or public.messages (this migration revokes
--      the privilege grant itself, which should take precedence, but a
--      stray permissive policy combined with a separate grant elsewhere is
--      worth a quick look).
--  [ ] Confirm the storage bucket (if any) used for avatars, if you add one
--      later, defaults to authenticated-only upload with per-user folder
--      scoping — not covered by this migration since no storage bucket is
--      referenced in the current app.
--  [ ] If you use the Supabase CLI locally, run `supabase db pull` after
--      applying this via the dashboard so your local migrations folder
--      stays in sync with the live schema.
