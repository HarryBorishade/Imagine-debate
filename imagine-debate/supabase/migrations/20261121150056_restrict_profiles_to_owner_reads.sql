begin;
set local lock_timeout = '5s';

drop policy "Enable insert for authenticated users only" on public.profiles;
drop policy profiles_select_authenticated on public.profiles;
create policy profiles_select_owner on public.profiles
  for select to authenticated using (id = auth.uid());

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

do $$
begin
  if has_any_column_privilege('anon', 'public.profiles', 'SELECT, INSERT, UPDATE')
     or has_any_column_privilege('authenticated', 'public.profiles', 'INSERT, UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'DELETE, TRUNCATE, TRIGGER')
     or not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'INSERT')
     or not has_table_privilege('service_role', 'public.profiles', 'UPDATE') then
    raise exception 'Unexpected effective profile permissions';
  end if;
end;
$$;

commit;
