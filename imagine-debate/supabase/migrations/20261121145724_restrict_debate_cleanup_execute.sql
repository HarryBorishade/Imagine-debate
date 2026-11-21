begin;
set local lock_timeout = '5s';

revoke execute on function public.cleanup_stale_debates()
  from public, anon, authenticated;
revoke execute on function public.delete_debates_older_than_30_days()
  from public, anon, authenticated;

alter function public.cleanup_stale_debates()
  set search_path = pg_catalog, public, pg_temp;

-- Both existing pg_cron jobs run as the function owner, postgres.
do $$
declare
  routine regprocedure;
begin
  foreach routine in array array[
    'public.cleanup_stale_debates()'::regprocedure,
    'public.delete_debates_older_than_30_days()'::regprocedure
  ] loop
    if has_function_privilege('anon', routine, 'EXECUTE')
       or has_function_privilege('authenticated', routine, 'EXECUTE')
       or not has_function_privilege('postgres', routine, 'EXECUTE') then
      raise exception 'Unexpected effective cleanup permissions for %', routine;
    end if;
  end loop;
end;
$$;

commit;
