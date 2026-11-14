# HMRC Developer Hub: production application answers pack

Draft 2026-11-14, for the responsible individual to copy from when completing the production
application for MyCA UK on the HMRC Developer Hub. Every answer must be true on the day it is
submitted: where a line says **[to confirm]** or **Owner**, it is not true yet and must be done or
changed first. The requirements come from gb.md ("What HMRC requires of software"), which read
HMRC's terms of use and fraud prevention guidance on 2026-11-11.

The form's exact questions change from time to time. Match each answer below to the question
HMRC asks; do not paste an answer to a question it does not ask.

## 0. Before starting

- [ ] Sandbox application passes every MTD VAT and MTD Income Tax journey MyCA offers (engine test
      suite against the sandbox, recorded in the engine's test results).
- [ ] Test Fraud Prevention Headers API returns no errors and no warnings for a real phone build
      (FRAUD-PREVENTION-HEADERS.md).
- [ ] Privacy notice and terms published at stable URLs.
- [ ] Pen test done, highs fixed (or booked, if HMRC accepts a date).
- [ ] The UK entity decision made (README.md section 1).
- [ ] HMRC may also send a separate MTD Income Tax and MTD VAT production checklist or ask for a
      demonstration of the end-to-end journey in sandbox. **Check before applying** what the current
      process asks for, and keep evidence (screen recordings, sandbox receipt ids) ready.

## 1. Organisation

| Question | Answer |
|---|---|
| Organisation name | [UK entity to confirm] (or ML Dynamic Solutions Private Limited if the Indian company applies) |
| Organisation type and registration | [UK: Companies House number]. If the Indian company applies: Corporate Identification Number from the Ministry of Corporate Affairs, with the certificate of incorporation as equivalent evidence (gb.md: an organisation outside the UK gives equivalent evidence) |
| Registered address | [UK entity to confirm] |
| Website | [MyCA UK site URL] |
| Responsible individual | [Name, role, email]. Must be someone who can answer for the software and its security |
| Product name shown to users | MyCA UK |
| Who builds the software | In-house, by the MyCA engineering team |

## 2. The software

| Question | Answer |
|---|---|
| What does it do | Mobile bookkeeping and Making Tax Digital software. Keeps digital records; prepares and submits VAT returns (9 boxes) under MTD for VAT; prepares and submits MTD Income Tax quarterly cumulative updates for self-employment and UK property, requests in-year and final calculations, and submits the final declaration |
| Who uses it | Sole traders, landlords, small VAT-registered businesses, and accountant firms acting for clients |
| Platform | Android app (`com.mldynamic.myca.uk`) talking to MyCA's server, which calls HMRC. Connection method `MOBILE_APP_VIA_SERVER` |
| APIs requested | [List the exact APIs and versions the engine calls: VAT (MTD); Business Details; Obligations; Self Employment Business; Property Business; Individual Calculations; Business Source Adjustable Summary or its successor if used; Individual Losses if used; Test Fraud Prevention Headers (sandbox). Engine to confirm] |
| Is it free | No. Paid plans with a 14-day trial. (HMRC's older terms say a free product must cover records, updates and year end for cash-basis sole traders; this does not apply to a paid product, **check before applying**) |
| Agent use | Accountant firm users act for clients after the client authorises the firm through HMRC's agent services. [Engine to confirm agent flows are built] |

## 3. Security and data questionnaire

| Requirement | MyCA's answer | Evidence | State |
|---|---|---|---|
| Use OAuth 2.0; never store HMRC credentials | Users sign in on HMRC's own page through OAuth 2.0 (authorisation code grant). MyCA never asks for, sees, stores or logs a Government Gateway user id or password | Engine OAuth module; screenshot of the connect flow | Done in sandbox [engine to confirm] |
| Encrypt access tokens at rest | Access and refresh tokens are stored as connector secrets sealed with AES-256-GCM, keyed per business from a key held in Google Secret Manager (`cloud/src/connectors.mjs`). Never written to logs, never returned to the app | Code reference, key management note | [Engine to confirm HMRC tokens use the connector store] |
| Encrypt personal data at rest | Each business's books are sealed with AES-256-GCM (`cloud/src/books-seal.mjs`); Cloud SQL and Cloud Storage also encrypt at rest by default | Code reference; Google Cloud documentation | Done |
| Encrypt in transit | TLS 1.2 or above between app and server and between server and HMRC | Cloud Run and load balancer TLS policy | Done |
| Where are the servers | Google Cloud, London region `europe-west2`, United Kingdom. All UK customer data is stored there | `infra/cloud` UK settings; `cloud/src/residency.mjs` | Owner: apply the UK stack |
| Is data accessed from outside the UK | [Owner to confirm. If engineers or support in India can reach production: named people only, through Google Cloud IAM with two-step sign-in and audit, under an IDTA] | Access list, IDTA | Owner |
| Role-based access | Each business has owner, accountant and staff roles (`cloud/src/members.mjs`); only the owner, or an accountant the owner authorises, can approve a submission. Production access for MyCA staff is by named IAM role, least privilege | Code reference; IAM policy | Done for the app; Owner for IAM review |
| Customers can change, export and delete their data | Edit any record before submission; full export (CSV, JSON and original files) from the app at any time; delete the business or account from the app, erased 30 days later; disconnect HMRC deletes tokens at once | DATA-RETENTION.md; app screens | [Export of HMRC submission history: engine to confirm] |
| Penetration testing | Independent test of the UK API, the Android app and the HMRC integration by a CREST or CHECK accredited tester, using the NCSC guidance on penetration testing; retest after fixes; yearly and after major change | Report summary, retest letter | Owner: book |
| Cyber Essentials or equivalent | [Cyber Essentials certificate number] and the group's ISO 27001 certificate and SOC 2 report | Certificates | Owner: Cyber Essentials; extend ISO scope to UK stack |
| ICO security checklist | Self-audit completed against the ICO checklist | Completed checklist | Owner |
| UK GDPR | Controller registered with the ICO; privacy notice published; DPIA done; ROPA kept | ICO registration; this folder | Owner: ICO fee |
| Privacy policy URL | [URL] | PRIVACY-NOTICE.md | Owner: publish |
| Terms and conditions URL | [URL] | TERMS.md | Owner: publish |
| Breach reporting | Breaches of customer data reported to HMRC within 72 hours and to the ICO within 72 hours | BREACH-RESPONSE.md | Done (procedure) |
| Fraud prevention headers | All headers for `MOBILE_APP_VIA_SERVER` sent with every MTD call; validated with the Test Fraud Prevention Headers API; no placeholder values | FRAUD-PREVENTION-HEADERS.md; test API output | [Engine to confirm] |
| Accessibility | HMRC asks web software to meet WCAG AA. MyCA UK is a mobile app; it targets WCAG 2.2 AA throughout, and any web pages that handle customer data do too | ACCESSIBILITY.md | Audit to do |
| Logging and monitoring | Request logs with request id, access log per business, database audit (pgaudit), alerting on errors and unusual HMRC failure rates | `docs/operations/RUNBOOK.md` | Done; UK alerting [to confirm] |
| Change control | Every change goes through a pull request with CI; production deploys from `main` only | GitHub | Done |
| Vulnerability management | Dependency alerts, monthly patching of images, yearly pen test | CI settings | Done; Owner for policy sign-off |
| Staff vetting and training | Everyone with production access signs a confidentiality agreement and does yearly security training | HR records | Owner |
| Backups | Cloud SQL automated encrypted backups, 14 days, in the UK region | Terraform | Done once UK stack is applied |
| User authentication to MyCA | Google sign-in, with two-step sign-in (TOTP, `cloud/src/second-factor.mjs`) required before any HMRC submission | Code reference | Owner decision: require it (recommended) |

## 4. Marketing and wording promise

MyCA will describe itself as "built for Making Tax Digital, HMRC recognition in progress" until HMRC
grants production access and lists the product, and as "HMRC recognised" after that. It will never
use "accredited", "approved" or "certified", and will not use HMRC's logo or crown.

## 5. After approval

- [ ] Store production client id and secret in Secret Manager in the UK project.
- [ ] Watch the monthly fraud prevention header status emails; fix any finding within the time HMRC
      sets.
- [ ] Tell HMRC about material changes (new APIs, a new connection method, a change of hosting
      location, a change of responsible individual).
- [ ] Read each MTD IT software developer newsletter.
- [ ] Change the public wording to "HMRC recognised" once MyCA appears in HMRC's software list.
