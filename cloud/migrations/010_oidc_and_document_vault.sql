alter table users add column oidc_issuer text;
alter table users add column oidc_sub text;
create unique index users_oidc_identity on users (oidc_issuer, oidc_sub);
alter table users drop constraint users_identity;
alter table users add constraint users_identity check (phone is not null or google_sub is not null or oidc_sub is not null);
alter table users add constraint users_oidc_pair check ((oidc_issuer is null) = (oidc_sub is null));

alter table documents add column location text not null default 'db' check (location in ('db', 'gcs'));
