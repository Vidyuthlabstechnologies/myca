alter table businesses add column ca_sync text not null default 'live'
  check (ca_sync in ('live', 'daily', 'weekly', 'month_close', 'manual'));

create table shared_books (
  business_id uuid primary key references businesses (id) on delete cascade,
  version bigint not null,
  state jsonb not null,
  as_of timestamptz not null,
  shared_at timestamptz not null,
  shared_by uuid references users (id) on delete set null,
  reason text not null check (reason in ('interval', 'manual'))
);
