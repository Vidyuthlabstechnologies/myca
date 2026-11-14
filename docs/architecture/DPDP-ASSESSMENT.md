# Data protection assessment (Digital Personal Data Protection Act, 2023)

A working assessment of the hosted service for the Android app, written 2026-10-14
from the code as it stands. It is the engineering input to the owner's legal review,
not legal advice.

## 1. Roles

| Party | Role under the Act | Basis |
|---|---|---|
| The company publishing MyCA | Data fiduciary for account data (phone number, Google identity, name) and crash reports | Decides the purpose and means |
| The business owner | Data fiduciary for the people in their books (customers, suppliers, employees); MyCA processes on their behalf | Section 2(i), 2(k) |
| Google Cloud (Mumbai) | Processor | Hosting under its own terms |
| The model provider, once chosen | Processor for chat text and uploaded documents sent to it | ADR-0004; terms to be signed |
| The SMS provider, once chosen | Processor for phone numbers used to deliver sign-in codes | |

## 2. Personal data processed

| Data | Principal | Purpose | Lawful basis | Retention |
|---|---|---|---|---|
| Phone number, Google subject id, email, name | Owner, staff, accountant | Sign-in, membership | Consent at sign-in (the privacy notice, versioned, accepted in the app) | Account lifetime |
| Customer and supplier names, GSTINs, addresses | Third parties in the books | The owner's bookkeeping | The owner's own legitimate purpose; MyCA processes for them | Business lifetime |
| Employee names, salary structures, PF/ESI numbers, last four of PAN | Employees | Payroll | The owner's statutory duty as employer | Business lifetime; salaries can be marked private |
| Uploaded documents | Whoever is on the document | Import, bill reading | The owner's purpose | Until the business is deleted |
| Crash reports | Device | Stability | Consent (off by default) | 90 days (to be enforced by the daily job before launch) |

No sensitive categories are sought. No children's data: the app is for business owners.

## 3. Obligations and how they are met

| Obligation | Status |
|---|---|
| Notice before consent (s.5) | Done: `PRIVACY_NOTICE` in `cloud/src/consent.mjs`, versioned, enforced on every request until accepted |
| Withdrawal of consent, deletion (s.6, s.8(7)) | Partly: a business can be deleted from the app; account deletion is by request. A self-service endpoint is needed before launch |
| Accuracy and completeness (s.8(3)) | The owner edits their own data; every change is previewed and audited |
| Security safeguards (s.8(5)) | HTTPS, encryption at rest by the cloud provider, loopback-only desktop, secrets in Secret Manager, no plaintext credentials, audit log per request, daily chain verification, fourteen-day backups |
| Breach notification (s.8(6)) | Procedure to be written in the runbook; crash reports and alerts give the detection path |
| Data retention limits (s.8(7)) | Business data kept while the business exists; crash reports need the 90-day purge |
| Grievance officer (s.8(10)) | To be named in the privacy policy |
| Cross-border transfer (s.16) | Hosting is in India (Mumbai). A model provider outside India would be a transfer: the owner's decision in ADR-0004, to be stated in the notice |

## 4. Risks and the decisions they need

1. **Model provider location.** Chat text and bill images leave India if the provider
   is abroad. Options: an Indian region of the provider, or no model (the rule-based
   parser stays). Owner decision.
2. **Employee data in payroll.** Salaries are the most sensitive thing in the books.
   They can already be marked private so only the owner sees them; staff and the
   accountant see totals.
3. **Accountant access.** An invited CA sees the whole business. The invitation is by
   phone number and is only visible after that person signs in with it.
4. **Backups after deletion.** A deleted business lingers in database backups for up to
   fourteen days. State this in the notice.

## 5. Before launch

Updated 2026-11-14: self-service account deletion, the 90-day crash purge, the breach
procedure, the processors in the notice, a rights and grievance request screen with a 30-day
answer, an 18-or-over declaration and one-year logs in India are all built. What is left, and
the full list by law, is in `docs/compliance/india/COMPLIANCE-CHECKLIST.md`.
