# MyCA Written Information Security Plan (United States returns)

Status: draft for the owner and counsel, 2026-11-11. Applies to every US individual return (Form 1040)
prepared, stored or e-filed with MyCA, and to the people, systems and vendors that touch it.

This plan is what IRS Publication 4557 (*Safeguarding Taxpayer Data*), Publication 5708 (*Creating a
Written Information Security Plan for your Tax & Accounting Practice*), the FTC Safeguards Rule
(16 CFR Part 314, which covers paid tax preparers under the Gramm-Leach-Bliley Act) and IRS
Publication 1345 (*Handbook for Authorized IRS e-file Providers*) ask a tax software provider to have
in writing. The IRS checks for it in the EFIN application (Form 8633 asks whether a WISP exists).

Each requirement below says where it is met today, and what is still owed. "Done" means it is in the
code on `main` and covered by a test; "Owner" means someone at ML Dynamic Solutions has to do it.

## 1. Who is responsible

| Role | Person | Duty |
|---|---|---|
| Qualified Individual (FTC 314.4(a)) | [Owner to name] | Runs this plan, reports to the board yearly in writing |
| Responsible Official on the EFIN (Pub 3112) | [Owner to name] | IRS contact for e-file; must be a US citizen or lawful permanent resident |
| Security contact for incidents | [Owner to name, email, phone] | Reports to the IRS Stakeholder Liaison within one business day |

The plan is reviewed every year before filing season opens (by January 1) and after any incident.

## 2. What we protect

Taxpayer information: names, Social Security numbers and ITINs of the filer, spouse and dependents,
dates of birth, addresses, the forms uploaded (W-2, 1099, 1098), interview answers, bank routing and
account numbers, prior-year AGI and PINs, Identity Protection PINs, signature PINs, device identifiers
and IP addresses captured at signing, and the return itself.

Where it lives: the hosted API's Postgres database (books state per household, sealed), the document
vault (uploaded files), and in transit between the phone, the API, the IRS and the AI model vendor.

## 3. Safeguards in place

| Safeguard | How | Where | State |
|---|---|---|---|
| Encryption at rest | Each household's books are sealed with AES-256-GCM under a key derived per household from `MYCA_BOOKS_KEY` | `cloud/src/books-seal.mjs` | Done |
| SSN and ITIN field encryption | Each SSN/ITIN is sealed again with AES-256-GCM under `MYCA_PII_KEY` (HKDF per household and person, the scope bound as authenticated data); only `{sealed, last4, kind}` is stored | `platform/src/us-identity.mjs` | Done (module); engine stores through it (tax engine thread) |
| SSN never shown in full | Every tool result and the app show `***-**-1234`; the app's SSN field is obscured by default, has no autocorrect or keyboard learning, and is cleared after saving; a saved SSN is never sent back | `mobile/lib/us/tin.dart`, `mobile/lib/screens/us/us_fields.dart` | Done |
| SSN kept out of the AI model | Every model request is redacted (SSN/ITIN patterns masked in text and tool blocks) before it leaves the server | `platform/src/model-adapter.mjs` via `redactModelRequest` | Done |
| SSN kept out of logs and audit | Chat messages are redacted on entry; audit metadata is redacted in the books and in `audit_log` | `platform/src/router.mjs`, `platform/src/ca-api.mjs`, `cloud/src/books-runner.mjs` | Done |
| Encryption in transit | TLS 1.2+ to Cloud Run; the IRS MeF A2A channel uses its own TLS and signed SOAP | Cloud Run; e-file thread | Done for the API |
| Least privilege | Owner, accountant and staff roles; only the owner signs and files; invited tax pros see last-four only | `cloud/src/members.mjs` | Done; signing restricted to owner in e-file PR |
| Multi-factor authentication | Two-step sign-in (TOTP and recovery codes) exists; Pub 1345 expects online providers to offer MFA | `cloud/src/second-factor.mjs` | Owner decision: require it before a US return can be signed |
| Bot protection at account creation | Pub 1345 asks for a challenge-response at sign-up | Google sign-in covers it; phone sign-in is India-only | Owner: confirm with counsel |
| Device and IP capture at signing | Device id (random per install), device type and time from the app; IP from the request on the server | `us_sign_screen.dart`, e-file PR #222 | Done |
| Signature records | Form 8879 data and consent kept with the return for 3 years | e-file thread | In progress |
| Retention | Returns and 8879 kept at least 3 years (IRC 6107, Pub 1345), then deleted | `docs/operations/RETENTION.md` | Owner: add US schedule |
| Secure deletion | Account erasure removes books and documents after the retention period | `cloud/migrations/019_account_erasure.sql` | Done for India; US retention to add |
| Backups | Cloud SQL automated backups, encrypted by Google | `infra/cloud` | Done |
| Vendor oversight | Google Cloud (hosting), Anthropic (model, no training on API data), IRS | Section 6 | Owner: file vendor agreements |
| Change control | Every change goes through a pull request with CI | GitHub | Done |
| Monitoring | Health checks, access log, rate limits | `cloud/src/rate-limits.mjs`, `014_access_log.sql` | Done |

## 4. IRS Publication 1345 items for an Online Provider

These were raised by the e-file thread and are tracked here.

| Requirement | State |
|---|---|
| Extended Validation (EV) TLS certificate on the website that takes returns | Owner: Cloud Run's managed certificate is DV, not EV. Buy an EV certificate for the filing domain and put the API behind it |
| Weekly external vulnerability scan of the website, by an approved scanning vendor | Owner: pick a vendor (PCI ASV list); record each scan |
| Written privacy and safeguards policy published on the website | US privacy notice drafted (`cloud/src/consent.mjs`, `PRIVACY_NOTICE_US`); this WISP; publish both on the site |
| Challenge-response on account creation to stop bots | Owner: Google sign-in; add a check if phone or email sign-up is offered in the US |
| Domain name registered with a US-based registrar | Owner: check the registrar of the filing domain |
| Multi-factor authentication for taxpayer accounts | Owner decision above |
| Report any security incident to the IRS by the next business day | Section 7 |

## 5. People

- Everyone with production access signs a confidentiality agreement and does security training before
  access, and again every year.
- Access to production (Google Cloud project, database, Secret Manager) is limited to named people and
  removed the day they leave.
- No taxpayer data on personal laptops, email or chat. Support uses the last four digits only.

## 6. Vendors

| Vendor | What they get | Safeguard |
|---|---|---|
| Google Cloud | Everything, encrypted | Google Cloud terms, SOC 2/ISO 27001; region choice (see section 8) |
| Anthropic | Text of forms and questions, SSNs removed | Commercial terms: no training on API data; redaction in `model-adapter.mjs` |
| IRS MeF | The return | Federal system |
| Google Play, Apple | Purchase records only | No tax data |

IRC section 7216 lets a preparer give return information to an auxiliary service provider for preparing
the return (Treas. Reg. 301.7216-2(d)); any other use needs the taxpayer's separate signed consent.

## 7. Incidents

Follow `docs/operations/INCIDENT-RESPONSE.md`, plus for US returns:

1. Contain: revoke sessions and keys, stop e-file submission.
2. Within one business day: tell the IRS Stakeholder Liaison for the state, and the e-file help desk if
   e-file systems are involved.
3. Tell state tax agencies (Federation of Tax Administrators list) and affected taxpayers as each state's
   breach law requires.
4. FTC Safeguards Rule: notify the FTC within 30 days of discovering an event that affects 500 or more
   people.
5. Record what happened and change this plan.

## 8. Open decisions for the owner

1. **Where US data is stored.** Production is in Mumbai (`asia-south1`). `platform/src/country.mjs` already
   names `us-central1` for the US. Storing US returns in a US region is the simpler position under
   section 7216 (disclosure of SSNs to a preparer outside the US needs specific consent and safeguards,
   Rev. Proc. 2013-14) and with state laws. Recommended: a second Cloud Run service and Cloud SQL
   instance in `us-central1` for US households before launch.
2. **The US entity.** The EFIN's Responsible Official and Principals must be US citizens or lawful
   permanent residents with fingerprints taken (Pub 3112). A US subsidiary or a US-resident principal is
   needed before the EFIN application.
3. **Require two-step sign-in before signing a US return.**
4. **EV certificate and weekly scans** (section 4).
