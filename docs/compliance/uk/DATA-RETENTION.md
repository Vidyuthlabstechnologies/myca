# MyCA UK: data retention and deletion

| | |
|---|---|
| Version | Draft 0.1, 14 November 2026 |
| Status | Proposal for the UK deployment; counsel confirms the periods before the privacy notice is published |
| Builds on | [`docs/operations/RETENTION.md`](../../operations/RETENTION.md) (the hosted service's policy as built). Where this file says nothing different, that policy applies to the UK stack too |
| Enforced by | `cloud/src/jobs.mjs` purge in the UK deployment; Terraform log and backup settings for `europe-west2` |

## The rule

The records belong to the user. HMRC places the duty to keep them on the **taxpayer**: business and
property records for Self Assessment must be kept for **at least 5 years after the 31 January
submission deadline** of the tax year (for example, records for 2026-27, whose final declaration is
due 31 January 2028, are kept until at least 31 January 2033). VAT records: **6 years (check before
publishing)**. Records may need to be kept longer if HMRC has opened an enquiry.

MyCA helps the user meet that duty in three ways:

1. Records are kept for as long as the account is open, however many years that is.
2. Export is complete and free at any time: every transaction, document, return, update,
   calculation and HMRC receipt, as CSV and JSON plus the original files. HMRC's older terms of
   collaboration expect users to be able to export all records (gb.md).
3. Before anything is erased, the app shows which tax years are still inside HMRC's keeping period
   and asks the user to export first.

MyCA does not keep a user's books against their wishes. If a user asks for erasure, it happens.

## Schedule

| Data | Kept while | Then | Basis for the period |
|---|---|---|---|
| Books, documents, digital records, VAT and MTD IT working data | The account is open | Erased 30 days after the user deletes the business or account | Contract; user's choice |
| After a subscription ends (no deletion asked) | Read-only access for export for **[owner to confirm; proposed 12 months]** | User is emailed 30 and 7 days before; then erased | Gives time to export; not indefinite |
| HMRC OAuth tokens | Until the user disconnects HMRC, or the account is deleted | Deleted at once on disconnect; with the account otherwise | Minimisation |
| Submission records: what was sent to HMRC, figures, period, HMRC receipt id and time, who approved, device, and the fraud prevention header values sent | 6 years after the submission (**check**) | Erased by the nightly purge; kept even after account deletion, sealed, as a minimal record | Legitimate interests and defence of legal claims (Limitation Act 1980 six-year period in England and Wales; **check** Scotland's five-year prescription). Lets us answer an HMRC query about a submission |
| Fraud prevention values on calls that are not submissions (reads of obligations, calculations) | 12 months | Erased | Minimisation; investigation of misuse |
| Account details (name, email, phone, Google id), devices, consents | The account exists | Erased 30 days after account deletion | Contract |
| Two-step keys and recovery codes | While two-step is on | Deleted on turn-off or account deletion | Security |
| Access log (who opened which books) | 365 days | Deleted nightly | Security; owner visibility |
| Database audit (pgaudit) | 180 days | Expires | Security |
| Request and job logs | 180 days | Expires | Security, debugging |
| Crash reports (no names, amounts or numbers) | 90 days from last occurrence | Deleted nightly | Debugging |
| AI assistant conversations | With the books | Erased with the books; user can clear a conversation | Contract |
| Model provider copies | [provider to confirm: zero or a short abuse window] | Provider deletes | Processor contract |
| Support tickets | 2 years after closing | Erased | Handling repeat issues and complaints |
| Payment records (plan, order id, amount, dates) | 6 years after the end of the financial year of the payment (**check**) | Erased | Our own accounting records (Companies Act 2006) |
| Marketing consent and suppression list | Consent: until withdrawn. Suppression: email hash only, indefinitely | — | PECR; so we never email someone who opted out |
| Cloud SQL backups | 14 daily backups, 7 days of logs | Expire | Recovery; deleted data leaves backups within 14 days |

## Erasure steps (UK)

1. The user deletes the business or account in the app. The app first lists the tax years still in
   HMRC's keeping period and offers the export.
2. The business disappears from every list and job at once. HMRC tokens are deleted at once.
3. Thirty days later the nightly purge erases the books, documents, audit trail, access log,
   connector secrets and memberships (as `docs/operations/RETENTION.md` describes).
4. The minimal submission records stay, sealed, until 6 years after each submission, then the purge
   removes them. They hold no documents and no transactions, only what was sent.
5. Backups age out within 14 days.

## Accountant firms

Where an accountant firm uses the Accountant firm plan for its clients, the firm is the controller
of its clients' records and sets its own retention. MyCA follows the firm's instructions and offers
the same export. A client who leaves a firm can take their records with them if the firm agrees.

## Open decisions

1. The read-only export window after a subscription ends (proposed 12 months).
2. Submission record period (proposed 6 years) and whether Scottish users need a different one.
3. VAT record period wording (proposed "6 years").
