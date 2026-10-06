create table crash_reports (
  fingerprint text not null,
  app_version text not null,
  kind text not null check (kind in ('flutter', 'async', 'server')),
  error_type text not null,
  message text not null,
  stack text not null,
  occurrences integer not null check (occurrences > 0),
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  primary key (fingerprint, app_version)
);
create index crash_reports_last_seen on crash_reports (last_seen);
