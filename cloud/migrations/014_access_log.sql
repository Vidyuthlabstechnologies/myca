create table access_log (
  id bigserial primary key,
  business_id uuid not null,
  user_id uuid,
  device_id uuid,
  request_id text not null default '',
  method text not null,
  action text not null,
  role text not null default '',
  at timestamptz not null default now()
);
create index access_log_business_at on access_log (business_id, at desc);
create index access_log_at on access_log (at);
