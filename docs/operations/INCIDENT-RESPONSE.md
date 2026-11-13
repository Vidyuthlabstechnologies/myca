# Incident response

What to do when a key leaks, an account is taken over, or personal data may have been
exposed. Keep a dated log of every step in a private issue or advisory as you go: the
DPDP report needs it.

## 1. Contain

| Situation | Step |
|---|---|
| Anything reaching a government portal or a provider looks wrong | Set `MYCA_PROVIDER_ENV=off` on the hosted API and redeploy. Filing, IRN, e-way bills, WhatsApp, SMS and email stop at once; the books keep working. |
| One person's account is taken over | Revoke all their devices: `update devices set revoked_at = now() where user_id = '<id>' and revoked_at is null;` then `delete from refresh_tokens where device_id in (select id from devices where user_id = '<id>');`. The API checks the device on every request, so this takes effect at once. |
| Everyone must sign in again | Run the same two statements for every user (drop the `user_id` filter). Rotating `MYCA_TOKEN_SECRET` is not enough on its own: it ends every access token within the request, but a refresh token is stored as a plain hash and still gets a new session. |
| A provider key leaks (model, SMS, WAHA, GSP, Play service account, email relay) | Revoke it at the provider first, then put the new value in the secret store and redeploy. |
| `MYCA_JOB_TOKEN`, `MYCA_INBOUND_RELAY_TOKEN` or the Play notify token leaks | Generate a new one, update the secret store and the caller (scheduler, relay, Pub/Sub push) together, redeploy. |
| `MYCA_TOKEN_SECRET` leaks | Rotate it (`DEPLOYMENT.md`, "Rotate a secret") and revoke every device with the two statements above, so that everyone signs in again. Whoever held the secret could mint an access token for any signed-in device until then. Keyed hashes made with it stop matching, so after the rotation: sign-in codes already sent stop working (people ask for a new one), pending invitations must be resent by the owner, every inbound connection key (`/v1/inbound`) must be created again and given to its sender, and unused two-step recovery codes no longer work (the person signs in with the authenticator app and makes new codes). |
| `MYCA_BOOKS_KEY` leaks | Do not just replace it: the books, each shared copy for an accountant and every authenticator key are sealed with it. Follow "Change the books key" in `DEPLOYMENT.md`, which moves every row to a new key with `npm run reseal` in one transaction. Treat the database itself as exposed until that is done and the old key version is destroyed. |
| The database or a backup is exposed | Rotate the database password, `MYCA_TOKEN_SECRET` and `MYCA_BOOKS_KEY` (as above), and go to section 3. |

## 2. Find out what happened

- The audit trail per business (`audit_log`) records every change with who, device and request id.
- `access_log` records who read which business, by role, for a year.
- Hosting logs carry the request id on every line; crash reports are in `crash_reports` and `GET /v1/admin/crashes`.
- Note the first and last time of the incident, the businesses and people affected, and which data types (see `docs/release/DATA-SAFETY.md`).

## 3. Tell the people who must know

Under the Digital Personal Data Protection Act, 2023 and its Rules, a personal data
breach is reported to the Data Protection Board of India and to each affected person
without delay, with a fuller report to the Board within 72 hours of becoming aware of
it. Check the current Rules before sending; this page is not legal advice.

- **Affected people:** what happened, when, what data, what they should do (sign in again, watch for phishing, check their filings), and who to contact. Send it from inside the app and by email where known.
- **Affected businesses:** the owner of each business whose books were involved, with the same details.
- **Partners:** the GSP, Google Play (if the app or billing was involved) and any provider whose key leaked.

## 4. Recover and learn

- Turn providers back on (`MYCA_PROVIDER_ENV`) only after the cause is fixed and deployed.
- Add a regression test for the cause.
- Write a short summary in `docs/audit/` (dates, cause, data types, counts, fix), with no exploit detail.
