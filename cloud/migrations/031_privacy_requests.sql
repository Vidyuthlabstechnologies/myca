create table privacy_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid references users (id) on delete set null,
  kind text not null check (kind in ('access', 'correction', 'erasure', 'withdraw', 'nominate', 'grievance')),
  message text not null default '' check (length(message) <= 2000),
  nominee_name text not null default '' check (length(nominee_name) <= 120),
  nominee_contact text not null default '' check (length(nominee_contact) <= 120),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reply text not null default '' check (length(reply) <= 4000),
  created_at timestamptz not null,
  due_at timestamptz not null,
  answered_at timestamptz
);

create index privacy_requests_user on privacy_requests (user_id, created_at desc);
create index privacy_requests_open on privacy_requests (due_at) where status = 'open';

alter table consents add column adult_declared boolean not null default false;
