create table us_7216_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  document text not null,
  version text not null,
  kind text not null check (kind in ('disclose', 'use')),
  signed_name text not null check (length(signed_name) between 2 and 120),
  text_sha256 text not null check (text_sha256 ~ '^[0-9a-f]{64}$'),
  consent_text text not null,
  device_id uuid,
  signed_at timestamptz not null,
  valid_until timestamptz not null,
  revoked_at timestamptz,
  check (valid_until > signed_at)
);
create index us_7216_consents_current on us_7216_consents (user_id, document) where revoked_at is null;
