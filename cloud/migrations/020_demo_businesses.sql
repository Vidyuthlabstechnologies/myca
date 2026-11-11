alter table businesses add column demo boolean not null default false;
create index businesses_demo on businesses (created_at) where demo;
