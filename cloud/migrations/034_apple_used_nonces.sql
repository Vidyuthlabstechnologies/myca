create table if not exists apple_used_nonces (
  nonce_hash text primary key,
  expires_at timestamptz not null
);

create index if not exists apple_used_nonces_expires_at on apple_used_nonces (expires_at);
