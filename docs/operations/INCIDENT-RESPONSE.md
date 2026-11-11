# Incident response

What to do when a key leaks, an account is taken over, or personal data may have been
exposed. Keep a dated log of every step in a private issue or advisory as you go: the
DPDP report needs it.

## 1. Contain

| Situation | Step |
|---|---|
| Anything reaching a government portal or a provider looks wrong | Set `MYCA_PROVIDER_ENV=off` on the hosted API and redeploy. Filing, IRN, e-way bills, WhatsApp, SMS and email stop at once; the books keep working. |
| One person's account is taken over | Revoke all their devices: `update devices set revoked_at = now() where user_id = '<id>' and revoked_at is null;` then `delete from refresh_tokens where device_id in (select id from devices where user_id = '<id>');`. The API checks the device on every request, so this takes effect at once. |
| Everyone must sign in again | Run the same two statements for every user (drop the `user_id` filter), or rotate `MYCA_TOKEN_SECRET` (below). |
| A provider key leaks (model, SMS, WAHA, GSP, Play service account, email relay) | Revoke it at the provider first, then put the new value in the secret store and redeploy. |
| `MYCA_JOB_TOKEN`, `MYCA_INBOUND_RELAY_TOKEN` or the Play notify token leaks | Generate a new one, update the secret store and the caller (scheduler, relay, Pub/Sub push) together, redeploy. |
| `MYCA_TOKEN_SECRET` leaks | Rotate it. Every access token and refresh token stops working, so everyone signs in again. Keyed hashes made with it (pending invitations and sign-in codes by phone) stop matching: ask owners to resend open invitations. |
| `MYCA_BOOKS_KEY` leaks | Do not just replace it: the books are sealed with it. Take a database backup, re-seal every business with the new key in a maintenance window, then retire the old key. Treat the database itself as exposed until that is done. |
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
