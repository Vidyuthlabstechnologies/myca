# MyCA India: compliance checklist

Written 2026-11-14 from `develop` by the compliance pass (thread "Make India app fully
compliant"); rechecked against the law as at 2026-11-23 (see "What changed since 2026-11-14"). Engineering's reading of the rules, for the owner's counsel to confirm; not
legal advice. Status: **Done** (in the code now), **Owner** (only the owner can do it),
**Counsel** (needs a lawyer's view), **Next** (engineering work still to do).

## 1. Digital Personal Data Protection Act 2023 and DPDP Rules 2025

Rules notified 14 Nov 2025. Most duties (r.3, r.5 to r.16) apply from about **13 May 2027**;
building them now avoids a second release.

| # | Requirement | Where in law | Status | Evidence |
|---|---|---|---|---|
| 1.1 | Stand-alone notice in plain words: itemised data, the purpose of each, how to withdraw, exercise rights and complain to the Board | s.5; r.3 | Done | `cloud/src/consent.mjs` `PRIVACY_NOTICE` (version `india-2026-11-23`: owner's date of birth, the model provider named, Eighth Schedule language option, consent managers, guardian of a person with a disability), shown before any books open |
| 1.2 | Notice names who data is shared with, and transfers outside India | s.5, s.16 | Done | "Who we share it with", "Where it is kept" sections |
| 1.3 | Consent is free, specific, unambiguous, with a clear affirmative act; recorded with time and device | s.6 | Done | `consents` table; "I agree" button; versioned, re-asked when the notice changes |
| 1.4 | No processing of children's data without verifiable parental consent | s.9; r.10 | Done (18+ only) | Required "I am 18 or over" box; `consents.adult_declared`; terms say 18+ |
| 1.5 | Withdrawal as easy as giving consent | s.6(4) | Done | Delete my account (Settings) or "Withdraw my consent" request in Your privacy rights |
| 1.6 | Rights: access/summary, correction, completion, erasure | s.11, s.12 | Done | Export (owner), Your privacy rights requests (`POST /v1/me/privacy-requests`), account and business deletion |
| 1.7 | Right to nominate | s.14 | Done | "Nominate someone to act for me" request with nominee name and contact |
| 1.8 | Grievance redressal, answered within the period set (r.14: at most 90 days) | s.13; r.14 | Done (30 days, stricter) | Reference `DPR-…`, due date 30 days, daily job alert `PRIVACY_REQUESTS_OVERDUE`, admin queue `GET /v1/admin/privacy-requests` |
| 1.9 | Publish contact of the person who answers questions about processing | s.8(9); r.9 | Owner | Fill `LEGAL_INDIA` in `cloud/src/consent.mjs` and `/grievance`, `/privacy` pages |
| 1.10 | Reasonable security safeguards: encryption, access control, logs, backups | s.8(5); r.6 | Done (earlier) | `docs/architecture/SECURITY-AND-PRIVACY.md`, security audit #199 to #205 |
| 1.11 | Keep processing logs for one year | r.8(3) | Done | `infra/cloud` `log_retention_days` = 365; `access_log` 365 days |
| 1.12 | Breach: tell each person without delay; Board without delay and full report in 72 hours | s.8(6); r.7 | Done (procedure) | `docs/operations/INCIDENT-RESPONSE.md` section 3 with the notice template |
| 1.13 | Erase when the purpose ends or consent is withdrawn; processors erase too | s.8(7) | Done | 30-day erasure job, `docs/operations/RETENTION.md`; backups age out in 14 days |
| 1.14 | Processor contracts (Google Cloud, Quicko, SMS, model, WhatsApp, email relay) | s.8(2) | Owner | Sign each provider's DPA; keep copies |
| 1.15 | Grace period length, legal-hold records, audit-trail names after erasure | s.8(7) | Counsel | Open points at the end of `RETENTION.md` |
| 1.16 | Significant Data Fiduciary duties (DPO, DPIA, audit) | s.10 | Not applicable now | Only if notified as one |
| 1.17 | Notice available in English or any Eighth Schedule language | s.5(3) | Done (on request) | Notice says so; Hindi in-app notice still needs a reviewed translation (Counsel) |
| 1.18 | Consent through a registered consent manager | s.6(7) to (9); r.4, in force 13 Nov 2026 | Done (notice) / Next | No consent manager is registered yet (the Board has no members); integrate when one is |
| 1.19 | Parent or guardian consent for a person with a disability who has a lawful guardian | s.9; r.11 | Done (declaration) | Age section: guardian opens the account in their own name |
| 1.20 | Aadhaar numbers not passed on (Aadhaar Act 2016 s.29) | Aadhaar Act | Done | `platform/src/india-identity.mjs`: Verhoeff-valid Aadhaar numbers become placeholders before any India model call and are restored in the tool input |

## 2. IT Act 2000, SPDI Rules 2011, CERT-In directions 2022

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 2.1 | Privacy policy published on the website | Done (draft text) | `/privacy` |
| 2.2 | Grievance Officer name and contact published; resolve within one month (SPDI r.5(9)) | Done in code, Owner to fill | `/grievance`, in-app Your privacy rights; 30-day due date |
| 2.3 | Report cyber incidents to CERT-In within 6 hours | Done (procedure) | `INCIDENT-RESPONSE.md` |
| 2.4 | Keep ICT logs for 180 days within India | Done | Log bucket moved to the service region (`asia-south1`), 365 days |
| 2.5 | Sync clocks to NTP | Done | Cloud Run and Cloud SQL use Google's NTP |
| 2.6 | Register a point of contact with CERT-In | Owner | cert-in.org.in |

## 3. Consumer Protection Act 2019, E-Commerce Rules 2020, CCPA guidelines

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 3.1 | Seller details on the site: legal name, address, contact, grievance officer | Done in pages, Owner to fill CIN, address, email | Footer, `/terms`, `/grievance` |
| 3.2 | Terms, refund and cancellation policy | Done (drafts for counsel) | `/terms`, `/refunds` |
| 3.3 | Grievance: acknowledge in 48 hours, resolve in one month | Done | `LEGAL_INDIA.acknowledgeWithinHours`, `/grievance` |
| 3.4 | No misleading claims (CCPA 2022) | Done | Removed "Most picked", "careful accountant", "partner CA firm", "under three minutes"; research and status pages taken off the footer and set to noindex |
| 3.5 | Price shown with its tax basis (no drip pricing, Dark Patterns 2023) | Done | Site prices say "+ GST"; in-app Play price says "GST included". Counsel: confirm whether the Play price is set tax-inclusive |
| 3.6 | Subscription terms shown before buying (no subscription trap) | Done | Renewal and cancel text above every Subscribe button; `/refunds` |
| 3.7 | Warranty wording with clear limits | Done | "Correction promise" with what is not covered; terms s.6 |

## 4. Chartered Accountants Act 1949, ICAI

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 4.1 | Not hold out as a chartered accountant (s.24, s.24A) | Done (disclaimer) / Counsel (name) | Footer, `/disclaimer`, plan and Ask screens: "not a firm of chartered accountants". The wordmark styles "CA" apart; counsel to advise whether to keep the name and the styling |
| 4.2 | MyCA Assured: a CA cannot share fees with a company or be solicited through it | Done (gate) / Owner | Plan cannot be bought until `MYCA_ASSURED_PROFESSIONAL` names the professional; text says the professional is engaged by the client and responsible for their work |
| 4.3 | No unnamed "partner CA firm" | Done | Site wording changed |

## 5. GST law and the e-invoice system

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 5.1 | ASP through a licensed GSP; no "approved by GSTN" claims | Done | Footer and disclaimer name Quicko as the GSP |
| 5.2 | Filing only with the taxpayer's OTP/EVC and approval | Done (earlier) | Approval workflow, `MYCA_ENABLE_LIVE_CALLS` |
| 5.3 | Tax invoice fields (CGST r.46) | Mostly done | Rows 5.4 to 5.8 |
| 5.4 | IRN, ack and signed QR on the e-invoice PDF (r.48(4)) | Done | `mobile/lib/invoice_pdf.dart` E-INVOICE block; test IRNs marked not valid; HTML print carries the IRN line |
| 5.5 | Bill of supply for exempt or composition sellers (r.46A) | Done | `platform/src/invoice-compliance.mjs` `documentTitleOf`; composition declaration when `company.composition` |
| 5.6 | HSN printed on B2B tax invoices even if the design hides it (Notification 78/2020 lets AATO ≤ ₹5 cr leave it off B2C) | Done | `hsnShownOn` |
| 5.7 | Reverse charge line, export endorsement (with LUT) on the invoice | Done | `reverseChargeLineOf`, `exportEndorsementOf`, `exportSale.lutNumber` |
| 5.8 | AATO stored per FY (`set_company` `aato`/`aatoFy`), estimated from the books when not entered | Done | `platform/src/aato.mjs`; estimate is this book's sales only, flagged as an estimate |
| 5.9 | HSN digits by AATO (Notification 78/2020: 4 up to ₹5 cr, 6 above; B2C may omit up to ₹5 cr) on invoices, the IRN payload and GSTR-1 table 12 | Done (warning on the invoice, refusal on the IRN) | rule `gst.hsn.digits`; `hsnDigitIssues`, `irnTurnoverProblems`, `HSN_AATO_ESTIMATED` |
| 5.10 | 30-day IRP reporting window, AATO ≥ ₹100 cr from 1 Nov 2023 and ≥ ₹10 cr from 1 Apr 2025 (NIC/GSTN advisories) | Done (refusal when AATO known or books reach it, warning when unknown) | rule `gst.einvoice.reporting-window`; `IRN_REPORTING_WINDOW_PASSED` on the IRN preflight and confirm card |
| 5.11 | Credit note s.34(2) and GSTR-1 amendment s.37(3): 30 November after the year or the GSTR-9 date, whichever is earlier | Done | rules `gst.credit-note.declaration-deadline`, `gst.gstr1.amendment-deadline`; debit notes have no s.34 time limit |
| 5.12 | Cess, UQC, CN/DN document layout | Done (cess #299, UQC #362) / Next (CN/DN layout) | |
| 5.13 | E-way bill numbers move from 12 to 14 digits, consolidated from 10 to 11, from 1 Jan 2027 (GSTN advisory 4 Nov 2026) | Done | `platform/src/ewb-adapter.mjs` `EWB_NO` takes 12 or 14 digits; numbers are kept as text, so nothing truncates; consolidated numbers are not checked for length |
| 5.14 | Metro Rail transport mode (Notification 05/2026-CT, from 1 Nov 2026; transport document number mandatory) | Next | Live on the portal and in the NIC API sandbox only; add when NIC publishes the API mode code for production |
| 5.15 | E-invoice for RCM supplies (RCMDOM, RCMIMP) from 1 Jan 2027 | Done (#276) | Confirm against GSTN advisory 688 when final |
| 5.16 | Ship-to GSTIN capture and e-way bill closure | On hold by GSTN (advisory 668) | Do not make Ship-to GSTIN mandatory until GSTN gives a date |

## 5A. Income-tax Act 2025 and Income-tax Rules 2026

The 2025 Act (30 of 2025) and the Rules 2026 (CBDT Notification 22/2026) apply from 1 April 2026,
for the tax year 2026-27 onward. FY 2025-26 (AY 2026-27) returns stay under the 1961 Act.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 5A.1 | Rules and figures dated per year under the right Act | Done (earlier) | `sprints/statutory-rules/src/rules/income-tax.mjs`, tax module notes |
| 5A.2 | New form numbers from 2026-27: Form 130 (was 16), 131 (was 16A), 138 (was 24Q), 140 (was 26Q), 144 (was 27Q), 168 (was 26AS) | Done | `platform/src/it-act-forms.mjs`; certificates, Annexure II, FVU and record-a-filing accept and show both names; filing screen labels |
| 5A.3 | Section codes on 2026-27 TDS entries and certificates (s.393 table rows instead of 194C, 194J and so on) | CA / Next | The books still tag entries with the 1961 section; TRACES and the providers' FVU decide which codes the 2026-27 statements take |
| 5A.4 | Interest under the 2025 Act (old 234A/B/C) | Done (note) | `platform/src/it-interest.mjs` says the method follows the 1961 Act; CA to confirm |

## 6. Google Play

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 6.1 | Data safety form matches the code | Done (earlier) | `docs/release/DATA-SAFETY.md` |
| 6.2 | In-app and web account deletion | Done (earlier) | Businesses, Delete my account; `/delete-account` |
| 6.3 | Digital subscriptions through Play Billing only | Done | Stripe is US-only |
| 6.4 | Privacy policy link in the listing and in the app | Done | Sign-in screen link, Your privacy rights |
| 6.5 | Subscription disclosures before purchase | Done | Plan screen |
| 6.6 | Financial features declaration (no loans, no money held) | Owner | Play Console: declare "none of these"; MyCA holds no funds |
| 6.7 | Organisation developer account, D-U-N-S | Owner | `docs/release/PLAY-CONSOLE-STEPS.md` |

## 7. RBI and payments

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 7.1 | No pooling or routing of customer money (Payment Aggregator directions) | Done | MyCA never collects money; invoice UPI QR pays the seller's own VPA directly |
| 7.2 | No card storage | Done | No card data anywhere |
| 7.3 | E-mandate rules | Not applicable | Renewals are Google Play's |

## 8. Accessibility (RPwD Act 2016, WCAG 2.1 AA as the target)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 8.1 | Tap targets 48dp, labels, contrast | Done | `mobile/test/accessibility_test.dart`; the new privacy screens are checked in `privacy_test.dart` |
| 8.2 | Text scales without clamping | Done | No textScaler clamp in the app |
| 8.3 | Status not by colour alone in review steps and count badges | Next | `review_screen.dart`, `CountBadge` |

## What changed since 2026-11-14

Checked on 2026-11-23 against GSTN advisories, incometaxindia.gov.in form pages and secondary
summaries of the Gazette (law-firm pages; the Gazette PDFs themselves were not read).

- DPDP: the main date stays **13 May 2027**. MeitY's January 2026 proposal to cut the window to
  12 months has not been notified. Rule 4 (consent managers) and s.6(9) came into force on
  13 Nov 2026, but the Board has no chair or members yet, so no consent manager is registered.
  A "Removal of Difficulties" order (S.O. 5458(E), 5 Oct 2026) is reported to clarify s.9 for
  persons with a disability who have a lawful guardian; not checked against the Gazette.
- Income tax: the 2025 Act and the Rules 2026 are in force from 1 April 2026 (rows 5A).
- GST: e-way bill numbering to 14 digits from 1 Jan 2027 (5.13); Metro Rail mode (5.14); RCM
  e-invoicing from 1 Jan 2027 (5.15); Ship-to GSTIN on hold (5.16). Budget 2026 aligned s.34
  credit notes with s.15 for post-sale discounts; CA to confirm the app's credit-note wording.

## What only the owner can do

1. Fill `LEGAL_INDIA` (CIN, confirm the registered office, support email, Grievance Officer
   name, email, phone) and the same brackets on `/privacy`, `/terms`, `/refunds`, `/grievance`.
2. Get counsel to review the notice, terms, refunds and the MyCA name (s.24A), then remove the
   "Draft" lines and bump `PRIVACY_NOTICE.version`.
3. Sign DPAs with each processor; register a CERT-In point of contact.
4. Name the MyCA Assured professional (`MYCA_ASSURED_PROFESSIONAL`) only after a signed
   engagement that keeps their fee and work with the client.
5. Apply `infra/cloud` Terraform to move logs into `asia-south1`; delete the old global bucket
   after its last logs pass 180 days.
6. Play Console: financial features declaration, data safety, privacy and deletion URLs.
