create table business_connectors (
  business_id uuid not null references businesses (id) on delete cascade,
  channel text not null,
  fields jsonb not null default '{}'::jsonb,
  secrets text not null default '',
  enabled boolean not null default true,
  last_fetched_to text not null default '',
  updated_at timestamptz not null default now(),
  primary key (business_id, channel)
);
