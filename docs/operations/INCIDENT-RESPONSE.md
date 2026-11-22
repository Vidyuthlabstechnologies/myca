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

Two clocks start when someone at MyCA first becomes aware of the incident. Write the time down.

| Who | When | Law | How |
|---|---|---|---|
| CERT-In | Within **6 hours** of noticing a reportable incident (data breach, data leak, unauthorised access to systems or data, compromise of the cloud account, ransomware and the other types in Annex I of the directions) | CERT-In directions of 28 April 2022 under s.70B(6) IT Act | Email incident@cert-in.org.in with the form from cert-in.org.in; name the point of contact registered with CERT-In |
| Data Protection Board of India | **Without delay** a first intimation; a full report within **72 hours** of becoming aware | DPDP Act 2023 s.8(6); DPDP Rules 2025 r.7 | Through the Board's online portal once it is open |
| Each affected person | **Without delay** | DPDP Rules 2025 r.7(1) | In the app (a banner on sign-in) and by email where known |

The Board's 72-hour report covers: the facts, circumstances and reasons of the breach; what
was done to reduce the risk; the findings about the person who caused it, if known; what was
done to stop it happening again; and a report of the notices sent to the people affected.
Check the current Rules before sending; this page is not legal advice.

### Notice to each affected person (r.7(1) asks for all five points)

> **What happened:** On [date] at [time IST] we found that [plain description]. **What it
> means for you:** [which of your data: name, phone, email, GSTIN, invoices…] may have been
> seen by [someone outside MyCA]. [Likely consequences.] **What we have done:** [contained,
> keys changed, signed everyone out…]. **What you can do:** sign in again, watch for messages
> asking for OTPs or payments, check your recent filings in the app. **Who to contact:** our
> Grievance Officer, [name], [email], [phone], reference [incident id].

- **Affected businesses:** the owner of each business whose books were involved, with the same details.
- **Partners:** the GSP (Quicko), Google Play (if the app or billing was involved) and any provider whose key leaked.

Keep a copy of every notice, its send time and the list of recipients for the Board's report,
and keep the incident log for at least one year (DPDP Rules 2025 r.8(3)).

## 4. Recover and learn

- Turn providers back on (`MYCA_PROVIDER_ENV`) only after the cause is fixed and deployed.
- Add a regression test for the cause.
- Write a short summary in `docs/audit/` (dates, cause, data types, counts, fix), with no exploit detail.
