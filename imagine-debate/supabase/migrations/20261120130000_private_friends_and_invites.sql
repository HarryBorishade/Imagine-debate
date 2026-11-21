begin;

-- Existing profiles can contain private legacy fields. Remove permissive
-- legacy policies before enabling owner-only reads. Review deployed policies
-- and other clients before applying this migration.
alter table public.profiles enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='profiles' loop
    execute format('drop policy %I on public.profiles', p.policyname);
  end loop;
end $$;
create policy profiles_select_owner on public.profiles for select to authenticated using (id = auth.uid());
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

-- A separate opt-in handle avoids publishing legacy profile fields or assuming
-- old auth usernames are unique. All social writes go through audited RPCs.
create table public.social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null check (handle ~ '^[A-Za-z0-9_]{3,20}$'),
  discoverable boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index social_profiles_handle_ci on public.social_profiles (lower(handle));
create table public.social_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);
create unique index social_friendships_pair on public.social_friendships
  (least(requester_id,recipient_id), greatest(requester_id,recipient_id));
create index social_friendships_recipient on public.social_friendships(recipient_id);
create table public.social_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id), check(blocker_id <> blocked_id)
);
create table public.social_invites (
  id uuid primary key default gen_random_uuid(),
  debate_id text not null references public.debates(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(debate_id,recipient_id), check(sender_id <> recipient_id)
);
create index social_invites_recipient on public.social_invites(recipient_id);
create table public.social_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  uses integer not null default 0,
  primary key(user_id,action)
);

alter table public.social_profiles enable row level security;
alter table public.social_friendships enable row level security;
alter table public.social_blocks enable row level security;
alter table public.social_invites enable row level security;
alter table public.social_rate_limits enable row level security;
revoke all on public.social_profiles, public.social_friendships, public.social_blocks, public.social_invites, public.social_rate_limits from public, anon, authenticated;

-- Serialize changes involving the same pair so blocking, acceptance and
-- invitations cannot cross one another in concurrent transactions.
create function public.social_lock_pair(p_first uuid, p_second uuid) returns void
language sql security definer set search_path = pg_catalog as $$
  select pg_advisory_xact_lock(hashtextextended(least(p_first,p_second)::text || ':' || greatest(p_first,p_second)::text, 0));
$$;
create function public.social_limit(p_action text, p_limit integer) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  insert into public.social_rate_limits(user_id,action,window_start,uses)
  values (auth.uid(),p_action,now(),1)
  on conflict (user_id,action) do update set
    uses=case when social_rate_limits.window_start < now()-interval '1 hour' then 1 else social_rate_limits.uses+1 end,
    window_start=case when social_rate_limits.window_start < now()-interval '1 hour' then now() else social_rate_limits.window_start end
  returning uses into v_count;
  if v_count > p_limit then raise exception 'Too many attempts. Please try again later.'; end if;
end $$;
create function public.social_is_blocked(p_first uuid,p_second uuid) returns boolean
language sql stable security definer set search_path = pg_catalog, public as $$
  select exists(select 1 from public.social_blocks b where (b.blocker_id=p_first and b.blocked_id=p_second) or (b.blocker_id=p_second and b.blocked_id=p_first));
$$;

create function public.social_set_profile(p_handle text,p_discoverable boolean) returns text
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_handle text := btrim(p_handle);
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if v_handle is null or v_handle !~ '^[A-Za-z0-9_]{3,20}$' or p_discoverable is null then raise exception 'Use 3 to 20 letters, numbers or underscores'; end if;
  perform public.social_limit('profile',20);
  -- Return a status, rather than raising, so failed claims still consume the
  -- rate limit. Unique handle availability remains a potential side channel.
  begin
    insert into public.social_profiles(user_id,handle,discoverable) values(auth.uid(),v_handle,p_discoverable)
    on conflict(user_id) do update set handle=excluded.handle,discoverable=excluded.discoverable,updated_at=now();
  exception when unique_violation then return 'unavailable';
  end;
  return 'saved';
end $$;
create function public.social_get_profile() returns table(handle text,discoverable boolean)
language sql stable security definer set search_path = pg_catalog, public as $$
 select p.handle,p.discoverable from public.social_profiles p where p.user_id=auth.uid();
$$;
create function public.social_search(p_handle text) returns table(user_id uuid,handle text)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_handle is null or btrim(p_handle) !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'Enter an exact handle'; end if;
  perform public.social_limit('search',30);
  return query select p.user_id,p.handle from public.social_profiles p
    where lower(p.handle)=lower(btrim(p_handle)) and p.discoverable and p.user_id<>auth.uid()
      and not public.social_is_blocked(auth.uid(),p.user_id);
end $$;
create function public.social_request_friend(p_user_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or p_user_id is null or p_user_id=auth.uid() then raise exception 'Request unavailable'; end if;
  perform public.social_limit('request',20);
  perform public.social_lock_pair(auth.uid(),p_user_id);
  if public.social_is_blocked(auth.uid(),p_user_id) or not exists(select 1 from public.social_profiles where user_id=p_user_id and discoverable) or not exists(select 1 from public.social_profiles where user_id=auth.uid()) then raise exception 'Request unavailable'; end if;
  insert into public.social_friendships(requester_id,recipient_id) values(auth.uid(),p_user_id) on conflict do nothing;
end $$;
create function public.social_respond_friend(p_request_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_request public.social_friendships%rowtype;
begin
  if auth.uid() is null or p_accept is null then raise exception 'Request unavailable'; end if;
  select * into v_request from public.social_friendships where id=p_request_id and recipient_id=auth.uid() and status='pending';
  if not found then raise exception 'Request unavailable'; end if;
  perform public.social_lock_pair(v_request.requester_id,v_request.recipient_id);
  if public.social_is_blocked(v_request.requester_id,v_request.recipient_id) then raise exception 'Request unavailable'; end if;
  if p_accept then
    update public.social_friendships set status='accepted' where id=p_request_id and recipient_id=auth.uid() and status='pending';
  else
    delete from public.social_friendships where id=p_request_id and recipient_id=auth.uid() and status='pending';
  end if;
  if not found then raise exception 'Request unavailable'; end if;
end $$;
create function public.social_remove_friend(p_user_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or p_user_id is null then raise exception 'Sign in required'; end if;
  perform public.social_lock_pair(auth.uid(),p_user_id);
  delete from public.social_invites where (sender_id=auth.uid() and recipient_id=p_user_id) or (sender_id=p_user_id and recipient_id=auth.uid());
  delete from public.social_friendships where (requester_id=auth.uid() and recipient_id=p_user_id) or (requester_id=p_user_id and recipient_id=auth.uid());
end $$;
create function public.social_connections() returns table(user_id uuid,handle text,relationship text,request_id uuid)
language sql stable security definer set search_path = pg_catalog, public as $$
 select p.user_id,p.handle,case when f.status='accepted' then 'friend' when f.requester_id=auth.uid() then 'outgoing' else 'incoming' end,f.id
 from public.social_friendships f join public.social_profiles p on p.user_id=case when f.requester_id=auth.uid() then f.recipient_id else f.requester_id end
 where auth.uid() in (f.requester_id,f.recipient_id) and not public.social_is_blocked(f.requester_id,f.recipient_id)
 order by p.handle;
$$;
create function public.social_block(p_user_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.uid() is null or p_user_id is null or p_user_id=auth.uid() then raise exception 'Action unavailable'; end if;
  perform public.social_lock_pair(auth.uid(),p_user_id);
  insert into public.social_blocks(blocker_id,blocked_id) values(auth.uid(),p_user_id) on conflict do nothing;
  delete from public.social_invites where (sender_id=auth.uid() and recipient_id=p_user_id) or (sender_id=p_user_id and recipient_id=auth.uid());
  delete from public.social_friendships where (requester_id=auth.uid() and recipient_id=p_user_id) or (requester_id=p_user_id and recipient_id=auth.uid());
end $$;
create function public.social_unblock(p_user_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
 if auth.uid() is null or p_user_id is null then raise exception 'Action unavailable'; end if;
 perform public.social_lock_pair(auth.uid(),p_user_id);
 delete from public.social_blocks where blocker_id=auth.uid() and blocked_id=p_user_id;
end $$;
create function public.social_blocked_users() returns table(user_id uuid,handle text)
language sql stable security definer set search_path = pg_catalog, public as $$
 select b.blocked_id,coalesce(p.handle,'Former player') from public.social_blocks b left join public.social_profiles p on p.user_id=b.blocked_id where b.blocker_id=auth.uid();
$$;
create function public.social_send_invite(p_user_id uuid,p_debate_id text) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
 if auth.uid() is null or p_user_id is null or p_user_id=auth.uid() then raise exception 'Invitation unavailable'; end if;
 perform public.social_limit('invite',20);
 perform public.social_lock_pair(auth.uid(),p_user_id);
 if public.social_is_blocked(auth.uid(),p_user_id) or not exists(select 1 from public.social_friendships f where f.status='accepted' and ((f.requester_id=auth.uid() and f.recipient_id=p_user_id) or (f.recipient_id=auth.uid() and f.requester_id=p_user_id))) or not exists(select 1 from public.debates d where d.id=p_debate_id and d.created_by=auth.uid() and d.status='waiting') then raise exception 'Invitation unavailable'; end if;
 insert into public.social_invites(debate_id,sender_id,recipient_id) values(p_debate_id,auth.uid(),p_user_id) on conflict(debate_id,recipient_id) do nothing;
end $$;
create function public.social_incoming_invites() returns table(invite_id uuid,handle text,topic text,created_at timestamptz)
language sql stable security definer set search_path = pg_catalog, public as $$
 select i.id,p.handle,d.topic,i.created_at from public.social_invites i join public.social_profiles p on p.user_id=i.sender_id join public.debates d on d.id=i.debate_id
 where i.recipient_id=auth.uid() and d.status='waiting' and not public.social_is_blocked(i.sender_id,i.recipient_id)
 order by i.created_at desc;
$$;
create function public.social_open_invite(p_invite_id uuid) returns text
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_invite public.social_invites%rowtype;
begin
 if auth.uid() is null then raise exception 'Invitation unavailable'; end if;
 select * into v_invite from public.social_invites where id=p_invite_id and recipient_id=auth.uid();
 if not found then raise exception 'Invitation unavailable'; end if;
 perform public.social_lock_pair(v_invite.sender_id,v_invite.recipient_id);
 if public.social_is_blocked(v_invite.sender_id,v_invite.recipient_id) or not exists(select 1 from public.social_friendships f where f.status='accepted' and ((f.requester_id=v_invite.sender_id and f.recipient_id=v_invite.recipient_id) or (f.recipient_id=v_invite.sender_id and f.requester_id=v_invite.recipient_id))) or not exists(select 1 from public.debates d where d.id=v_invite.debate_id and d.status='waiting') then raise exception 'Invitation unavailable'; end if;
 if not exists(select 1 from public.social_invites where id=p_invite_id and recipient_id=auth.uid()) then raise exception 'Invitation unavailable'; end if;
 return v_invite.debate_id;
end $$;
create function public.social_dismiss_invite(p_invite_id uuid) returns void
language sql security definer set search_path = pg_catalog, public as $$
 delete from public.social_invites where id=p_invite_id and recipient_id=auth.uid();
$$;

-- A blocked pair cannot start a new debate even when they know a room code.
-- The existing UI must still let someone leave/report an already active room.
create function public.social_guard_debate_start() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.for_player_id is null or new.against_player_id is null then
      raise exception 'Both participants are required';
    end if;
    perform public.social_lock_pair(new.for_player_id,new.against_player_id);
    if public.social_is_blocked(new.for_player_id,new.against_player_id) then
      raise exception 'Debate cannot be started';
    end if;
  end if;
  return new;
end $$;
create trigger social_guard_debate_start before insert or update of status on public.debates
for each row execute function public.social_guard_debate_start();
revoke all on function public.social_guard_debate_start() from public, anon, authenticated;

revoke all on function public.social_lock_pair(uuid,uuid), public.social_limit(text,integer), public.social_is_blocked(uuid,uuid), public.social_set_profile(text,boolean), public.social_get_profile(), public.social_search(text), public.social_request_friend(uuid), public.social_respond_friend(uuid,boolean), public.social_remove_friend(uuid), public.social_connections(), public.social_block(uuid), public.social_unblock(uuid), public.social_blocked_users(), public.social_send_invite(uuid,text), public.social_incoming_invites(), public.social_open_invite(uuid), public.social_dismiss_invite(uuid) from public, anon, authenticated;
grant execute on function public.social_set_profile(text,boolean), public.social_get_profile(), public.social_search(text), public.social_request_friend(uuid), public.social_respond_friend(uuid,boolean), public.social_remove_friend(uuid), public.social_connections(), public.social_block(uuid), public.social_unblock(uuid), public.social_blocked_users(), public.social_send_invite(uuid,text), public.social_incoming_invites(), public.social_open_invite(uuid), public.social_dismiss_invite(uuid) to authenticated;
grant execute on function public.social_is_blocked(uuid,uuid) to service_role;
commit;
