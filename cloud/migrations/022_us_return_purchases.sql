alter table businesses add column kind text not null default 'business' check (kind in ('business', 'household'));

create table us_return_purchases (
  business_id uuid not null references businesses (id) on delete cascade,
  tax_year integer not null check (tax_year between 2020 and 2100),
  provider text not null check (provider in ('play')),
  purchase_token text not null,
  product_id text not null,
  price_usd integer not null,
  test_purchase boolean not null default false,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_id, tax_year)
);
create unique index us_return_purchases_token on us_return_purchases (provider, purchase_token);
