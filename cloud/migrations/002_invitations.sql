create table invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  phone_hash text not null,
  phone_hint text not null,
  role text not null check (role in ('staff', 'accountant')),
  invited_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz
);
create index invitations_phone on invitations (phone_hash);
create unique index invitations_one_open on invitations (business_id, phone_hash)
  where accepted_at is null and declined_at is null and revoked_at is null;
