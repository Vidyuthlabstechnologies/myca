create table subscriptions (
  business_id uuid primary key references businesses (id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'play', 'appstore', 'manual')),
  provider_subscription_id text not null,
  plan text not null,
  status text not null,
  current_end timestamptz,
  checkout_url text not null default '',
  created_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index subscriptions_provider_id on subscriptions (provider, provider_subscription_id);

create table billing_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);
