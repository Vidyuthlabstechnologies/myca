create table quicko_portal_sessions (
  business_id uuid not null references businesses (id) on delete cascade,
  kind text not null check (kind in ('itd_taxpayer', 'traces_deductor')),
  subject text not null default '',
  token text not null default '',
  token_expires_at timestamptz,
  connected_by uuid,
  connected_at timestamptz not null default now(),
  refreshed_at timestamptz,
  primary key (business_id, kind)
);
