alter table user_totp add column sign_in_attempts integer not null default 0;
alter table user_totp add column sign_in_failed_at timestamptz;
