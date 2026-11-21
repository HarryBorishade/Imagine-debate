begin;
set local lock_timeout = '5s';

revoke insert, update, delete, truncate, trigger, references on public.debates
  from public, anon, authenticated;

-- Keep the existing owner-and-waiting RLS check and the create-page payload.
grant insert (id, topic, description, time_per_turn, created_by, status, ranked, format_version)
  on public.debates to authenticated;

do $$
declare
  allowed_columns constant text[] := array[
    'id', 'topic', 'description', 'time_per_turn',
    'created_by', 'status', 'ranked', 'format_version'
  ];
begin
  if has_any_column_privilege('anon', 'public.debates', 'INSERT')
     or has_any_column_privilege('anon', 'public.debates', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.debates', 'UPDATE')
     or has_table_privilege('anon', 'public.debates', 'DELETE, TRUNCATE, TRIGGER')
     or has_table_privilege('authenticated', 'public.debates', 'DELETE, TRUNCATE, TRIGGER')
     or not has_table_privilege('service_role', 'public.debates', 'UPDATE')
     or not has_table_privilege('service_role', 'public.debates', 'DELETE')
     or exists (
       select 1
       from pg_attribute
       where attrelid = 'public.debates'::regclass
         and attnum > 0 and not attisdropped
         and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')
             is distinct from (attname::text = any(allowed_columns))
     ) then
    raise exception 'Unexpected effective debate write permissions';
  end if;
end;
$$;

commit;
