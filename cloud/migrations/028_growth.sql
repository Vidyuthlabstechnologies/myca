create table funnel_steps (
  user_id uuid not null references users (id) on delete cascade,
  step text not null,
  edition text not null check (edition in ('india', 'us')),
  source text not null default '',
  first_at timestamptz not null,
  last_at timestamptz not null,
  hits integer not null default 1,
  primary key (user_id, step)
);

create index funnel_steps_edition_first_at on funnel_steps (edition, first_at);

create table referral_codes (
  user_id uuid primary key references users (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null
);

create table referrals (
  referred_user_id uuid primary key references users (id) on delete cascade,
  referrer_user_id uuid not null references users (id) on delete cascade,
  claimed_at timestamptz not null,
  converted_at timestamptz,
  check (referred_user_id <> referrer_user_id)
);

create index referrals_referrer on referrals (referrer_user_id);
