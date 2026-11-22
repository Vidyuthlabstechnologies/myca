create table referral_credits (
  referred_user_id uuid primary key references users (id) on delete cascade,
  referrer_user_id uuid not null references users (id) on delete cascade,
  firm_business_id uuid references businesses (id) on delete set null,
  client_plan text not null default '',
  months integer not null default 1 check (months > 0),
  status text not null default 'earned' check (status in ('earned', 'applied', 'void')),
  earned_at timestamptz not null,
  applied_at timestamptz
);

create index referral_credits_referrer on referral_credits (referrer_user_id);
