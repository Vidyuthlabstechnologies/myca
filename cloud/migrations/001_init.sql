create table users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  label text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index devices_user on devices (user_id);

create table refresh_tokens (
  token_hash text primary key,
  device_id uuid not null references devices (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index refresh_tokens_device on refresh_tokens (device_id);

create table otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null,
  salt text not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz
);
create index otp_challenges_phone on otp_challenges (phone_hash, created_at desc);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gstin text not null default '',
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  deletion_requested_at timestamptz
);

create table memberships (
  user_id uuid not null references users (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  role text not null check (role in ('owner', 'staff', 'accountant')),
  invited_by uuid references users (id),
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);
create index memberships_business on memberships (business_id);

create table books (
  business_id uuid primary key references businesses (id) on delete restrict,
  version bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table documents (
  business_id uuid not null references businesses (id) on delete restrict,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  content text not null,
  bytes integer not null,
  created_at timestamptz not null default now(),
  primary key (business_id, sha256)
);

create table audit_log (
  id bigserial primary key,
  business_id uuid not null references businesses (id) on delete restrict,
  user_id uuid,
  device_id uuid,
  request_id text not null default '',
  action text not null,
  before_hash text not null default '',
  after_hash text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index audit_log_business on audit_log (business_id, id);

create function audit_log_is_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_is_append_only();
create trigger audit_log_no_truncate before truncate on audit_log
  for each statement execute function audit_log_is_append_only();
