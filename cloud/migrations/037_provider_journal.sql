create table if not exists provider_journal (
  business_id uuid not null,
  key text not null,
  seq integer not null,
  fingerprint text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (business_id, key, seq)
);

create index if not exists provider_journal_created on provider_journal (created_at);
