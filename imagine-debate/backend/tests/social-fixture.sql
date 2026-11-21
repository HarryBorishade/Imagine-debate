-- Run only against a fresh disposable local Supabase database.
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, username text, private_note text);
alter table public.profiles enable row level security;
create policy old_broad_read on public.profiles for select to authenticated using (true);
create policy old_broad_update on public.profiles for update to authenticated using (true) with check (true);
grant select,insert,update,delete on public.profiles to authenticated;
grant update(private_note) on public.profiles to authenticated;
create table public.debates(id text primary key, topic text, status text, created_by uuid references auth.users(id), for_player_id uuid, against_player_id uuid);
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000001','one@example.invalid'),
 ('00000000-0000-0000-0000-000000000002','two@example.invalid'),
 ('00000000-0000-0000-0000-000000000003','three@example.invalid');
insert into public.profiles(id,username,private_note) values
 ('00000000-0000-0000-0000-000000000001','Alpha','private-one'),
 ('00000000-0000-0000-0000-000000000002','Beta','private-two'),
 ('00000000-0000-0000-0000-000000000003','Gamma','private-three');
insert into public.debates(id,topic,status,created_by) values ('1234','Synthetic debate','waiting','00000000-0000-0000-0000-000000000001');
