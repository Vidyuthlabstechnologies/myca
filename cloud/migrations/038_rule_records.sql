create table rule_records (
  id bigserial primary key,
  record jsonb not null,
  rule_id text not null,
  added_by uuid not null,
  reason text not null,
  added_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text
);
create index rule_records_active on rule_records (rule_id) where revoked_at is null;
create table rule_records_stamp (
  only_row boolean primary key default true check (only_row),
  changed_at timestamptz not null default now()
);
insert into rule_records_stamp (only_row) values (true) on conflict do nothing;
