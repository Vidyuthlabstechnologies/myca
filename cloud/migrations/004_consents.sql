create table consents (
  user_id uuid not null references users (id) on delete cascade,
  document text not null,
  version text not null,
  device_id uuid,
  accepted_at timestamptz not null,
  primary key (user_id, document, version)
);
