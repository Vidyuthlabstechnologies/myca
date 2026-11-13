# Retention and deletion

| | |
|---|---|
| Version | 1.0, 18 October 2026 |
| Status | Engineering's policy as built; counsel confirms the periods before the privacy notice is published |
| Enforced by | `cloud/src/jobs.mjs` (`purge`, run inside the daily job), Terraform (`log_retention_days`, Cloud SQL backups), the desktop's own backup rotation |

## The rule

The owner's books belong to the owner. MyCA keeps them for as long as the business exists
on the service, gives the owner a complete export at any time, and erases them a fixed
time after the owner asks, keeping nothing readable afterwards. Tax law asks the
**taxpayer** to keep records for six years (GST s.35) or eight (income-tax); MyCA meets
that by making the export complete and free, not by keeping data the owner asked to erase.

## What is kept, for how long, and who can see it

| Data | Kept while | Then | Who can see it |
|---|---|---|---|
| The books (one sealed row per business), documents, members, connectors, audit trail, access log | The business exists | Erased thirty days after the owner deletes the business; the owner can export in the meantime | Members of the business, by role; the operator cannot read the books column without the service key |
| Shared view for the accountant | The business exists | Erased with the business | The accountant member |
| Access log (who asked for what, when) | 365 days | Rows older than a year are deleted nightly | The owner, from "who looked at my books" |
| Database audit (pgaudit: every read and write of the database by any role, including the operator) | 180 days in Cloud Logging | Expires | The operator, for incident work; never the content, only who touched what |
| Request and job logs (Cloud Logging) | 180 days | Expires | The operator |
| Sign-in codes | 1 day | Deleted nightly (they expire in five minutes anyway) | Nobody; only a salted hash is stored |
| Second-step challenges (the pending sign-in between the phone code and the authenticator code) | 1 day | Deleted nightly (they expire in five minutes anyway) | Nobody; a challenge holds no code |
| Authenticator key and recovery codes (two-step sign-in) | While the user keeps two-step on | Deleted when the user turns it off or deletes the account | Nobody; the key is sealed per user and the codes are stored as hashes |
| WhatsApp message ids (kept so a message delivered twice is handled once; no text is stored) | 30 days | Deleted nightly | Nobody |
| Crash reports | 90 days from the last occurrence | Deleted nightly | The operator; they carry no names, amounts or numbers |
| Cloud SQL backups | 14 daily backups, 7 days of transaction logs | Expire | The operator, for recovery only |
| Account (phone, email, Google or OIDC id, name), devices, sign-in tokens, consents, memberships, invitations to their number, sign-in codes for their number, WhatsApp links, their rows in the access log | The account exists | Erased thirty days after the user deletes the account in the app; signing in again within the thirty days cancels the deletion. A business the user alone owns is deleted with it | The user and the members of their businesses |
| Desktop edition | On the owner's PC only; 14 daily backups beside the books | The owner's own choice | The owner |

## What deletion does

1. The owner deletes the business in the app (or their account). The business is marked and
   disappears from every list and job at once; nobody can open it.
2. For thirty days the row stays, so a deletion by mistake can be reversed by support and
   the owner can still ask for the export.
3. On the first nightly run after thirty days, the purge erases the documents (database rows
   and bucket objects), the audit trail, the access log, the shared view, inbound keys and
   sales, connector secrets, invitations, memberships and the books, then the business row.
   The audit log's append-only guard is lifted only inside that transaction and only for
   that business.
4. On the same nightly run, every account deleted more than thirty days ago is erased: the
   user row (phone, email, Google or OIDC id, name) and everything keyed to it, which the
   database removes with it (devices and refresh tokens, consents, memberships, two-step keys
   and recovery codes), plus invitations sent to their number, sign-in codes for their
   number, WhatsApp links and their access-log rows. Businesses another owner keeps stay,
   with "created by" and "invited by" cleared. The audit trail of a business that stays
   keeps the person's random user id on past entries, as a tombstone: once the user row is
   gone that id no longer leads to a name, number or email, and the audit trail cannot be
   rewritten. The request is itself audited (`member.account_deletion_requested`, no
   personal data) in each business the person belonged to; `cloud/test/account-erasure.test.mjs`
   checks that no table holds the phone, email or Google id afterwards.
5. Backups age out by themselves within fourteen days, so an erased business or account is
   gone from every copy within six weeks of the request.

## Open points for counsel

- Whether thirty days is the right grace period under the Digital Personal Data Protection
  Act 2023 rules once notified.
- The grievance officer's name and the retention lines on the privacy notice.
- Whether an export must be offered automatically on deletion rather than on request.
