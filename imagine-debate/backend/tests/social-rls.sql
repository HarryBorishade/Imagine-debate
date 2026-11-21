-- Synthetic security tests: run only in a disposable local database after fixture and migration.
create function pg_temp.expect_failure(statement text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then return; end;
  raise exception 'Expected statement to be rejected';
end $$;

do $$ begin
  if has_table_privilege('authenticated','public.social_profiles','select') then raise exception 'Direct social profile read allowed'; end if;
  if has_function_privilege('anon','public.social_search(text)','execute') then raise exception 'Anonymous search allowed'; end if;
  if has_function_privilege('authenticated','public.social_is_blocked(uuid,uuid)','execute') then raise exception 'Arbitrary block lookups allowed'; end if;
  if not has_function_privilege('service_role','public.social_is_blocked(uuid,uuid)','execute') then raise exception 'Service block lookup missing'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin if (select count(*) from public.profiles) <> 1 then raise exception 'Private profile policy failed'; end if; end $$;
select pg_temp.expect_failure($sql$update public.profiles set private_note='tampered' where id='00000000-0000-0000-0000-000000000002'$sql$);
select public.social_set_profile('Alpha',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.social_set_profile('Beta',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin if exists(select 1 from public.social_search('Beta')) then raise exception 'Private handle was discoverable'; end if; end $$;
select pg_temp.expect_failure($sql$select public.social_request_friend('00000000-0000-0000-0000-000000000002')$sql$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.social_set_profile('Beta',true);
do $$ begin
  if public.social_set_profile('alpha',true) <> 'unavailable' then raise exception 'Case-insensitive uniqueness failed'; end if;
  for i in 1..17 loop
    if public.social_set_profile('alpha',true) <> 'unavailable' then raise exception 'Duplicate handle accepted'; end if;
  end loop;
end $$;
select pg_temp.expect_failure($sql$select public.social_set_profile('alpha',true)$sql$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin if (select count(*) from public.social_search('beta')) <> 1 then raise exception 'Exact opt-in search failed'; end if; end $$;
select public.social_request_friend('00000000-0000-0000-0000-000000000002');
select pg_temp.expect_failure($sql$select public.social_send_invite('00000000-0000-0000-0000-000000000002','1234')$sql$);
select request_id as request_id from public.social_connections() where relationship='outgoing' \gset
select pg_temp.expect_failure(format('select public.social_respond_friend(%L::uuid,true)', :'request_id'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.expect_failure(format('select public.social_respond_friend(%L::uuid,true)', :'request_id'));
select pg_temp.expect_failure($sql$select public.social_send_invite('00000000-0000-0000-0000-000000000002','1234')$sql$);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.social_respond_friend(:'request_id',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.social_send_invite('00000000-0000-0000-0000-000000000002','1234');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select invite_id as invite_id from public.social_incoming_invites() \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.expect_failure(format('select public.social_open_invite(%L::uuid)', :'invite_id'));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin if (select count(*) from public.social_incoming_invites()) <> 1 then raise exception 'Invitation missing'; end if; end $$;
select public.social_open_invite(:'invite_id');
select public.social_open_invite(:'invite_id'); -- opening remains retryable while waiting
select public.social_block('00000000-0000-0000-0000-000000000001');
select pg_temp.expect_failure(format('select public.social_open_invite(%L::uuid)', :'invite_id'));
do $$ begin
  if exists(select 1 from public.social_connections()) then raise exception 'Block left a friendship'; end if;
  if (select count(*) from public.social_blocked_users()) <> 1 then raise exception 'Block list unavailable'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin if exists(select 1 from public.social_search('Beta')) then raise exception 'Blocked profile visible'; end if; end $$;
select pg_temp.expect_failure($sql$select public.social_request_friend('00000000-0000-0000-0000-000000000002')$sql$);
do $$ begin for i in 1..27 loop perform public.social_search('Nobody'); end loop; end $$;
select pg_temp.expect_failure($sql$select * from public.social_search('Nobody')$sql$);
reset role;
select pg_temp.expect_failure($sql$update public.debates set status='active',for_player_id='00000000-0000-0000-0000-000000000001',against_player_id='00000000-0000-0000-0000-000000000002' where id='1234'$sql$);
select pg_temp.expect_failure($sql$insert into public.debates(id,topic,status,created_by,for_player_id,against_player_id) values('4321','Blocked','active','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002')$sql$);
insert into public.debates(id,topic,status,created_by,for_player_id,against_player_id) values('4444','Allowed','active','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003');
update public.debates set status='active',for_player_id='00000000-0000-0000-0000-000000000001',against_player_id='00000000-0000-0000-0000-000000000003' where id='1234';
