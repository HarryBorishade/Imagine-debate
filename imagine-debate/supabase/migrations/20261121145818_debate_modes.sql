begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
