alter table us_return_purchases drop constraint us_return_purchases_provider_check;
alter table us_return_purchases add constraint us_return_purchases_provider_check check (provider in ('play', 'stripe'));

create table us_plus_subscriptions (
  business_id uuid primary key references businesses (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'play')),
  subscription_id text not null unique,
  status text not null,
  current_end timestamptz,
  cancel_at_period_end boolean not null default false,
  price_usd integer not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table us_waitlist (
  business_id uuid not null references businesses (id) on delete cascade,
  product text not null check (product in ('done_for_you', 'international')),
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, product)
);
