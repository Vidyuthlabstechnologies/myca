alter table otp_challenges add column requester text;
create index otp_challenges_requester on otp_challenges (requester, created_at desc);
