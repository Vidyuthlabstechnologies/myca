# Play Data safety: answer sheet

Answers for the Play Console Data safety form, in the form's own order, each traced to
the code that makes it true. Written 2026-11-10 from `main` plus the fixes for issues
#146 (account erasure) and #147 (crash reports off by default). Re-check this sheet
whenever a feature starts sending data somewhere new.

## Overview questions

| Question | Answer | Evidence |
|---|---|---|
| Does the app collect or share any of the required user data types? | Yes | Below |
| Is all user data collected by the app encrypted in transit? | Yes | The app talks to the hosted API over HTTPS only; operator URLs outside local must be https (`cloud/src/environment.mjs`, `plainHttpUrls`) |
| Do you provide a way for users to request that their data be deleted? | Yes | In the app: Businesses, Delete my account (`DELETE /v1/me`, `cloud/src/auth.mjs` `deleteAccount`); on the web: `deploy/public/delete-account.html`. Erased 30 days after the request (`cloud/src/jobs.mjs`, `ACCOUNT_DELETION_GRACE_DAYS`) |
| Has the app been independently security reviewed (MASA)? | No | |
| Is the app designed for children? | No | Business owners, 18 and over |

## Data types

"Collected" means it leaves the phone for MyCA's servers. "Shared" means MyCA passes it
to another company, which Play counts only when that company is not acting as MyCA's
processor or when the user did not ask for it. Every transfer below happens because the
user used a feature, so Play's "user-initiated action" exemption applies to most of
them; they are still listed so the answers can be checked.

| Play data type | Collected | Shared | Required or optional | Purpose | Ephemeral | Evidence |
|---|---|---|---|---|---|---|
| Personal info: Name | Yes | No | Required | Account management, App functionality (shows who did what) | No | `users.name`, `cloud/migrations/001_init.sql` |
| Personal info: Email address | Yes, with Google sign-in | No | Optional (phone sign-in has no email) | Account management | No | `cloud/src/google.mjs`, `users.email` |
| Personal info: User IDs | Yes: server-made user id, Google subject id | No | Required | Account management | No | `users.id`, `users.google_sub` |
| Personal info: Phone number | Yes, with phone sign-in | Sent to the SMS provider to deliver the code | Optional | Account management | No | `cloud/src/auth.mjs`, `cloud/src/sms-sender.mjs` |
| Personal info: Address | Only the business address the owner types for invoices | No | Optional | App functionality | No | `businesses` company profile |
| Personal info: Other info (GSTIN, PAN of the business) | Yes | With the GSP when filing, with NIC for e-invoices and e-way bills | Optional | App functionality | No | `platform/src/portal-filing.mjs`, `platform/src/nic-actions.mjs` |
| Financial info: Purchase history (subscriptions) | Yes: the Play purchase token and plan | No | Optional | App functionality (entitlement) | No | `cloud/src/billing.mjs` |
| Financial info: Other financial info (the books: invoices, bills, payroll, bank lines, tax figures) | Yes | With the GSP for filings, NIC for IRN, Plaid for US bank linking, and the connectors the owner switches on | Required (it is the product) | App functionality | No | `cloud/src/books-runner.mjs`; connectors in `cloud/src/govt-connectors.mjs`, `platform/src/channel-connectors.mjs` |
| Photos and videos: Photos | Only a bill photo the owner picks or shares into the app | With the model provider, if the hosted service has a model switched on, to read the bill | Optional | App functionality | No (kept as the uploaded document) | `mobile/lib/screens/bill_capture_screen.dart`, `platform/src/document-reader.mjs` |
| Files and docs | Bills, bank statements and backups the owner chooses | Bill text with the model provider, as above | Optional | App functionality | No | `platform/src/document-store.mjs` |
| Messages: Other in-app messages (chat with the assistant) | Yes | Text that matches no built-in action goes to the model provider | Optional | App functionality | Partly: a chat that matches no tool is not stored as books; recent turns are kept for context (`platform/src/chat-memory.mjs`) | `cloud/src/api.mjs` ask route |
| App info and performance: Crash logs | Only if the person ticks the box on the privacy notice or turns it on later | No | Optional, off by default | Analytics (stability) | No, kept 90 days (`cloud/src/crash-reports.mjs`, `KEEP_DAYS`) | `mobile/lib/crash_reports.dart`: email, tokens, GSTIN, PAN, phone numbers, amounts and quoted text are scrubbed on the phone and again on the server |
| App info and performance: Diagnostics | No | | | | | |
| Device or other IDs | Yes: a random device id the server makes at sign-in, plus a label | No | Required | Account management, Security (sign out a device) | No | `devices` table, `cloud/migrations/001_init.sql`; no hardware or advertising id is read |
| Location, Contacts, Calendar, Health and fitness, Audio, Web browsing, App activity, Installed apps | No | | | | | Nothing in `mobile/android/app/src/main/AndroidManifest.xml` asks for them |

## Where data goes, by recipient

Every recipient is reached only when the feature is used and configured on the server.

| Recipient | What | When |
|---|---|---|
| Cloud hosting provider (MyCA's processor) | Everything above | Always |
| Google | Sign-in token check; Play purchase checks | Google sign-in; subscriptions |
| SMS provider (Twilio or MSG91) | Phone number, sign-in code | Phone sign-in |
| GST Suvidha Provider (Quicko / Sandbox) | Return data, GSTIN, the EVC OTP step | Filing on the GST portal |
| NIC IRP and e-way bill system | Invoice data | Generating an IRN or e-way bill |
| Model provider | Unmatched chat text; bill text or image | Only when the hosted service has a model key |
| WhatsApp gateway (WAHA) | Message text and the recipient's number | Only when the owner sends a reminder or links WhatsApp |
| Email relay (Cloudflare) | Message text and addresses | Sending an email from the app |
| Plaid | Bank link | US edition, bank linking |
| Marketplace and payroll connectors (Amazon, Shopify, Razorpay, Zoho, Gusto) | What the connector syncs | Only after the owner connects one |

## Cross-check, 2026-11-10

- Crash reports: the app now defaults to off and the notice has an unticked box, which matches "optional" above (#147).
- Deletion: the app, the web page, `docs/operations/RETENTION.md` and the policy now all say "erased 30 days after the request".
- 2026-11-14: the privacy policy (`docs/release/PRIVACY-POLICY.md` and `deploy/public/privacy.html`) now lists every recipient in the table above and no longer says MyCA does not file returns. Issue #148 still needs the registered address, support email and Grievance Officer from the owner.
- The policy says the hosted service runs in Google Cloud, Mumbai. Keep that line in step with where the API is actually deployed.

## Still to do by a person

- Paste these answers into the Play Console and screenshot the summary.
- Fill the bracketed fields in the privacy policy (#148): registered address, support email, Grievance Officer.
