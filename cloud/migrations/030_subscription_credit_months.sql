alter table subscriptions add column credit_months integer not null default 0 check (credit_months >= 0);
