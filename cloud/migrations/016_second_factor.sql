create table user_totp (
  user_id uuid primary key references users(id) on delete cascade,
  secret_sealed text not null,
  attempts integer not null default 0,
  enabled_at timestamptz,
  last_step bigint not null default 0,
  created_at timestamptz not null default now()
);
create table recovery_codes (
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  primary key (user_id, code_hash)
);
create table second_step_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  device_label text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz
);
create index second_step_challenges_user on second_step_challenges(user_id);
