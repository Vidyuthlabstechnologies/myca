create table if not exists store_links (
  business_id uuid primary key references businesses (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' and length(slug) between 3 and 40),
  snapshot jsonb not null default '{}'::jsonb,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists store_orders (
  id uuid primary key,
  business_id uuid not null references businesses (id) on delete cascade,
  order_no text not null,
  created_at timestamptz not null default now(),
  buyer_name text not null,
  buyer_phone text not null,
  lines jsonb not null,
  note text not null default '',
  status text not null default 'new' check (status in ('new', 'accepted', 'declined', 'fulfilled'))
);

create index if not exists store_orders_business on store_orders (business_id, created_at desc);
