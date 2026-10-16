create table whatsapp_links (
  phone text primary key,
  business_id uuid not null references businesses (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table whatsapp_messages (
  id text primary key,
  received_at timestamptz not null default now()
);
create index whatsapp_messages_received on whatsapp_messages (received_at);
