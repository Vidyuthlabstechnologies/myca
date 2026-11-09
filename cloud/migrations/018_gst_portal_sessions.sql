create table gst_portal_sessions (
  business_id uuid not null references businesses (id) on delete cascade,
  gstin text not null,
  username text not null,
  token text not null default '',
  token_expires_at timestamptz,
  otp_sent_at timestamptz,
  connected_by uuid,
  connected_at timestamptz,
  refreshed_at timestamptz,
  last_error text not null default '',
  primary key (business_id, gstin)
);

create index gst_portal_sessions_expiry on gst_portal_sessions (token_expires_at) where token <> '';
