begin;
set local lock_timeout = '5s';

-- Keep the existing RPC signature for the judge and the Socket.IO server.
create or replace function public.apply_debate_result(
  p_debate_id text,
  p_for_player_id uuid,
  p_against_player_id uuid,
  p_winning_side text,
  p_ended_reason text,
  p_ranked boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_debate public.debates%rowtype;
  v_for_player_id uuid;
  v_against_player_id uuid;
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
  select * into v_debate
    from public.debates where id = p_debate_id for update;

  if not found then
    raise exception 'Debate % not found', p_debate_id;
  end if;

  if v_debate.rating_applied then
    return;
  end if;

  v_for_player_id := v_debate.for_player_id;
  v_against_player_id := v_debate.against_player_id;
  -- Legacy Socket.IO starts the room before its participant write finishes.
  -- Only trusted forfeits for a waiting room can use this compatibility path.
  if v_debate.status = 'waiting'
     and v_for_player_id is null and v_against_player_id is null
     and p_ended_reason in ('forfeit_disconnect', 'forfeit_left') then
    v_for_player_id := p_for_player_id;
    v_against_player_id := p_against_player_id;
  end if;

  if v_for_player_id is null or v_against_player_id is null
     or v_for_player_id = v_against_player_id then
    raise exception 'Debate result requires two distinct participants';
  end if;

  if p_for_player_id is distinct from v_for_player_id
     or p_against_player_id is distinct from v_against_player_id
     or p_ranked is distinct from v_debate.ranked then
    raise exception 'Debate result does not match the recorded participants and ranked setting';
  end if;

  if p_winning_side is null or p_winning_side not in ('for', 'against', 'draw') then
    raise exception 'Invalid debate winning side';
  end if;

  if p_ended_reason is null
     or p_ended_reason not in ('ai_judged', 'forfeit_disconnect', 'forfeit_left') then
    raise exception 'Invalid debate ended reason';
  end if;

  if v_debate.ranked then
    -- Both insert and lock order are stable when players meet again with reversed sides.
    insert into public.profiles (id)
      select player_id
      from (values (v_for_player_id), (v_against_player_id)) as players(player_id)
      order by player_id
      on conflict (id) do nothing;

    perform id from public.profiles
      where id in (v_for_player_id, v_against_player_id)
      order by id for update;

    select rating into v_for_rating from public.profiles where id = v_for_player_id;
    select rating into v_against_rating from public.profiles where id = v_against_player_id;

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
      where id = v_for_player_id;

    update public.profiles set
        rating = rating + v_against_delta,
        wins = wins + case when p_winning_side = 'against' then 1 else 0 end,
        losses = losses + case when p_winning_side = 'for' then 1 else 0 end,
        draws = draws + case when p_winning_side = 'draw' then 1 else 0 end,
        updated_at = now()
      where id = v_against_player_id;
  end if;

  update public.debates set
      status = 'completed',
      winning_side = p_winning_side,
      ended_reason = p_ended_reason,
      rating_applied = true
    where id = v_debate.id;
end;
$$;

revoke all on function public.apply_debate_result(text, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_debate_result(text, uuid, uuid, text, text, boolean)
  to service_role;

do $$
declare
  routine constant regprocedure := 'public.apply_debate_result(text,uuid,uuid,text,text,boolean)';
begin
  if has_function_privilege('anon', routine, 'EXECUTE')
     or has_function_privilege('authenticated', routine, 'EXECUTE')
     or not has_function_privilege('service_role', routine, 'EXECUTE') then
    raise exception 'Unexpected effective result execution permissions';
  end if;
end;
$$;

commit;
