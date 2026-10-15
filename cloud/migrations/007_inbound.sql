create table inbound_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  label text not null,
  source text not null check (source in ('pos', 'documents')),
  key_hash text not null unique,
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  disabled_at timestamptz
);
create index inbound_keys_business on inbound_keys (business_id);

create table inbound_sales (
  business_id uuid not null references businesses (id) on delete cascade,
  key_id uuid not null references inbound_keys (id) on delete cascade,
  sale_id text not null,
  invoice_id text not null,
  total numeric(14, 2) not null,
  received_at timestamptz not null default now(),
  primary key (business_id, sale_id)
);
create index inbound_sales_key_day on inbound_sales (key_id, received_at);
