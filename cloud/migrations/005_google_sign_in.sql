alter table users alter column phone drop not null;
alter table users add column google_sub text unique;
alter table users add column email text;
alter table users add constraint users_identity check (phone is not null or google_sub is not null);
