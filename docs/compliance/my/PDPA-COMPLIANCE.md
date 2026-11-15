# MyCA Malaysia: Personal Data Protection Act 2010 compliance

Status: draft for the owner and Malaysian counsel, 14 November 2026. Applies to the Android app
MyCA Malaysia (`com.mldynamic.myca.my`), the hosted API that serves it, and the people and vendors
that touch Malaysian personal data. Mirrors the structure of `docs/compliance/us/WISP.md`.

"Done" means the behaviour exists in the code on `develop` today. "Build" means engineering still
has to do it. "Owner" means someone at ML Dynamic Solutions Private Limited has to do it. Nothing in
this file is legal advice; every "Owner" row ends with counsel's sign-off.

## 1. Does the PDPA apply to MyCA?

| Question | Answer | Why |
|---|---|---|
| Is MyCA processing personal data "in respect of commercial transactions"? | Yes | Account data, the books of Malaysian businesses (names of customers, suppliers, employees, TINs, NRIC numbers on e-invoices) and individual income tax figures |
| Is ML Dynamic Solutions "established in Malaysia"? | Not yet: an Indian private limited company with no Malaysian entity | PDPA s2(1)(a) |
| Does it "use equipment in Malaysia" for processing? | Arguably not: hosting is Google Cloud Singapore (`asia-southeast1`), but the app runs on phones in Malaysia | PDPA s2(1)(b). Counsel to advise. **Working assumption: treat the Act as applying in full.** A Malaysian entity, if formed, makes it certain |
| Is MyCA a data controller or a data processor? | Both, by data set | See the table below |
| Must MyCA register as a data user? | Counsel to confirm | The Personal Data Protection (Class of Data Users) Order 2013 lists classes including "services" (accountancy among them). A software provider is not obviously in a class; a Malaysian entity offering bookkeeping could be |

### Controller or processor

| Data | Role of ML Dynamic Solutions | Role of the customer |
|---|---|---|
| Account: name, phone or Google email, device id, sign-in records, subscription | Data controller | Data subject |
| Individual income tax figures the user enters for themselves (Form BE / B estimates, reliefs, dependants) | Data controller | Data subject |
| A business's books: its customers', suppliers' and employees' names, TINs, NRIC or passport numbers, addresses, amounts | Data processor acting for the business | The business is the data controller of its counterparties' data |
| E-invoices sent to LHDN MyInvois as the business's intermediary | Data processor (and LHDN intermediary) | Data controller; LHDN receives as a public authority |

Since 1 April 2025 a data processor is directly bound by the Security Principle (amendment to s9),
so MyCA must meet the security duty even for data it only processes.

Sources (accessed 2026-11-14):
- Skrine, "Amendments to the Personal Data Protection Act 2010: Dates of Coming into Force" (December 2024): https://www.skrine.com/insights/alerts/december-2024/amendments-to-the-personal-data-protection-act-201
- Personal Data Protection (Amendment) Act 2024 (Act A1727), copy hosted by Christopher & Lee Ong: https://christopherleeong.com/wp-content/uploads/2024/12/PDPA-Amendment-Act-A1727.pdf
- Official portal of the Personal Data Protection Department (JPDP): https://www.pdp.gov.my/ (guidelines, DPO and breach notification forms)

## 2. The 2024 amendments and their dates

| Change | Section of the PDPA | In force | What MyCA does |
|---|---|---|---|
| "Data user" renamed "data controller" | s4 | 1 April 2025 | Documents and notices use "data controller" |
| Biometric data is sensitive personal data | s4 | 1 April 2025 | MyCA collects no biometrics. Phone fingerprint unlock is handled by Android; MyCA receives only "unlocked: yes" |
| Penalty for breaching a principle raised to up to RM1,000,000 and/or 3 years' jail | s5(2) | 1 April 2025 | Risk noted in the launch checklist |
| Security Principle extended to data processors | s9 | 1 April 2025 | Section 4 below; vendor contracts in section 7 |
| Transfers abroad: whitelist removed; allowed to a place with substantially similar law or equivalent protection, or under the s129(3) exceptions | s129 | 1 April 2025 | Section 6 below |
| Data protection officer (DPO) appointment | s12A | 1 June 2025 | Section 5 below |
| Mandatory personal data breach notification | s12B | 1 June 2025 | `BREACH-RESPONSE.md` |
| Right to data portability | s43A | 1 June 2025 | Section 3, Access row |

## 3. The seven principles mapped to the app

| Principle (PDPA section) | What the law asks | Where MyCA meets it | State |
|---|---|---|---|
| **General** (s6) | Process personal data only with consent (sensitive data: explicit consent), for a lawful purpose tied to the business, and only what is needed | First-run privacy notice that the user must accept before an account is made (`cloud/src/consent.mjs`, the consent record keeps the version accepted). Only the fields the feature needs: a TIN and BRN or NRIC only on e-invoice parties, as LHDN's schema requires | Build: `consent.mjs` has India and US notices only; add `PRIVACY_NOTICE_MY` in English and Malay (text in `PRIVACY-NOTICE.md`) and select it for region `MY` |
| **Notice and Choice** (s7) | Written notice, as soon as practicable, in the national language and in English, of: the purpose, the data, the source, the right to access and correct, how to contact the controller, the classes of third parties, whether supplying data is obligatory and what happens if not, and the choices to limit processing | `PRIVACY-NOTICE.md` covers every s7(1) item, in English and Bahasa Melayu. The app shows it before sign-up with a language switch; the published web copy sits at the privacy-policy URL given to Play | Build (notice text ready here; app and website wiring); Owner: Malay legal review |
| **Disclosure** (s8) | No disclosure for another purpose or to a party not named in the notice without consent | Third parties are listed by name in the notice: Google Cloud (hosting), Google Play (billing), LHDN MyInvois (only when the user submits an e-invoice), the AI model provider (only text that needs it), the SMS or email provider. Nothing is sent to LHDN, Customs or anyone else without an explicit approve tap | Done in the product rule "nothing files without approve"; list in notice |
| **Security** (s9, and the Personal Data Protection Standard 2015) | Practical steps to protect data from loss, misuse, unauthorised access, change or disclosure; processors bound too | Books sealed per business with AES-256-GCM (`cloud/src/books-seal.mjs`); TLS 1.2+ only; role-based access (owner, accountant, staff, `cloud/src/members.mjs`); two-step sign-in available (`cloud/src/second-factor.mjs`); access log the owner can read (`014_access_log.sql`); pgaudit on the database; MyInvois client secrets and the signing certificate in Secret Manager, never on the phone; least-privilege service accounts | Done for India and shared; Build: secrets for MY intermediary credentials; Owner: annual security review |
| **Retention** (s10, and the Standard) | Keep no longer than needed for the purpose; then destroy or anonymise | `RETENTION.md`: records kept while the account is active and the 7-year tax period is running, erasure 30 days after a deletion request, with an export offered first | Done (erasure job `cloud/src/jobs.mjs`); Build: MY retention notice wording in the delete flow |
| **Data Integrity** (s11) | Keep data accurate, complete, not misleading and up to date | TIN and BRN validated against LHDN's TIN validation API before an e-invoice is sent; LHDN validation result stored with each e-invoice; the user can edit any party, and every change is in the audit trail | Build: TIN validation call in the MyInvois client (owned by the Malaysia build thread) |
| **Access** (s12, s30 to s34, and s43A portability) | The data subject may see and correct their data; a request is answered within 21 days; since 1 June 2025, may ask for it to be sent to another controller where technically feasible | In-app: profile edit, "Download everything" export (CSV and JSON of all books, plus e-invoice XML/JSON as submitted). By email to the DPO for anything else. Portability: the same export, in a machine-readable format, can be emailed to the user or to a named recipient | Done (export exists); Owner: name the DPO mailbox and a 21-day response SOP |

Sources (accessed 2026-11-14):
- Captain Compliance summary of the seven principles: https://captaincompliance.com/education/7-principles-of-pdpa-malaysia/
- Lex Mundi Global Data Privacy Guide, Malaysia: https://www.lexmundi.com/guides/global-data-privacy-guide/jurisdictions/asia-pacific/malaysia
- Rajah & Tann, "Latest Guidelines on Personal Data Protection Notices" (two-language notice): https://www.rajahtannasia.com/?p=34598

## 4. Security duty for processors (s9 as amended)

MyCA's processors (Google Cloud, the AI model provider, the SMS and email providers) are bound by
s9 themselves since 1 April 2025, but the controller must still choose processors that give
sufficient guarantees and must take reasonable steps to make sure they comply. For each vendor:

| Vendor | Role | Location | Contract basis | Owner action |
|---|---|---|---|---|
| Google Cloud (Cloud Run, Cloud SQL, Cloud Storage, Secret Manager) | Hosting processor | Singapore, `asia-southeast1` | Google Cloud Data Processing Addendum | Accept the CDPA in the Cloud console for the Malaysia project; record it |
| Google Play | Billing, and processor for purchase records | Global | Google Play Developer Distribution Agreement | None beyond Play Console setup |
| AI model provider (Anthropic) | Processor for chat and document reading | United States | Commercial terms (no training on API data) | Record the DPA; decide whether NRIC numbers are masked before model calls as SSNs are for the US (recommended: yes) |
| SMS provider (if phone sign-in is offered in Malaysia) | Processor | Varies | Provider DPA | Pick a provider with a Malaysian sender route |
| Email relay | Processor | Varies | Provider DPA | Record |
| LHDN MyInvois | Public authority, not a processor | Malaysia | ITA 1967 and the e-Invoice Guideline | None |

Build item: extend the model-request redaction (`redactModelRequest` in
`platform/src/model-adapter.mjs`) to mask Malaysian NRIC numbers (12 digits, `YYMMDD-PB-###G`) and
passport numbers in text and tool blocks, mirroring the SSN rule.

## 5. Data protection officer (s12A, from 1 June 2025)

The Commissioner's Guideline on the Appointment of a Data Protection Officer (February 2025) makes
appointment compulsory where a controller or processor:

- processes personal data of more than **20,000** data subjects, or
- processes **sensitive** personal data (financial information is included) of more than
  **10,000** data subjects, or
- carries out regular and systematic monitoring.

MyCA holds financial information of the businesses' customers and suppliers. Once Malaysian
customers' books hold more than 10,000 people in total, a DPO is mandatory; **recommendation:
appoint before launch**, because the count is reached quickly and the processor duty applies too.

Requirements for the person: the skills the Guideline sets out, proficiency in **Bahasa Melayu and
English**, and either resident in Malaysia or easily contactable. May be an employee or an
outsourced service. The Commissioner must be **notified within 21 days** of the appointment, the
DPO's business contact details must be **published** (the privacy notice and the website), and a
record of the appointment kept.

Sources (accessed 2026-11-14):
- DLA Piper, "Malaysia: Guidelines issued on data breach notification and data protection officer appointment" (March 2025): https://privacymatters.dlapiper.com/2025/03/malaysia-guidelines-issued-on-data-breach-notification-and-data-protection-officer-appointment/
- CMS, "Guidelines on Appointment of Data Protection Officers in Malaysia": https://cms.law/en/int/legal-updates/guidelines-on-appointment-of-data-protection-officers-in-malaysia
- Baker McKenzie, "Malaysia: Q&A on Appointment of Data Protection Officer and Data Breach Notification": https://connectontech.bakermckenzie.com/malaysia-qa-on-appointment-of-data-protection-officer-and-data-breach-notification/

## 6. Cross-border transfer basis (s129, from 1 April 2025)

MyCA Malaysia's data is stored and processed in **Google Cloud Singapore (`asia-southeast1`)**
(owner decision, 11 November 2026), because Google Cloud has no Malaysia region. Model calls go
to the United States. Support staff in India may read account data (never the sealed books without
the owner's grant).

| Transfer | Basis under s129 as amended | Evidence MyCA keeps |
|---|---|---|
| Malaysia to Singapore (all data at rest) | s129(2): Singapore's Personal Data Protection Act 2012 is a law "substantially similar" to the PDPA, or ensures an equivalent level of protection. Back-up basis: s129(3) reasonable precautions and due diligence (the Google Cloud DPA) | A **Transfer Impact Assessment** (TIA) per the Commissioner's Cross Border Personal Data Transfer Guideline (April 2025), comparing the Singapore PDPA with the PDPA; reviewed every three years or when the law changes |
| Malaysia to the United States (model calls, only the text needed) | s129(3): reasonable precautions and due diligence through contractual clauses with the provider; plus consent in the notice | Signed DPA, the redaction rule in section 4, the notice wording |
| Malaysia to India (support access) | s129(3): contractual clauses between the processor role and the company; consent in the notice. India's DPDP Act 2023 is not yet fully in force; do not rely on "substantially similar" | Intra-company data transfer agreement (owner to sign), access log |

When Google opens a Malaysia region, move the Malaysia project there and update the notice.

Sources (accessed 2026-11-14):
- Skrine, "Cross Border Personal Data Transfer Guidelines Launched" (April 2025): https://www.skrine.com/insights/alerts/april-2025/cross-border-personal-data-transfer-guidelines-lau
- CMS, "Malaysian Guidelines on Cross-Border Data Transfers": https://cms.law/en/int/legal-updates/malaysian-guidelines-on-cross-border-data-transfers
- Hogan Lovells, "Malaysia's groundbreaking cross-border data transfer guidelines explained": https://www.hlc.com/en/publications/malaysias-groundbreaking-cross-border-data-transfer-guidelines-explained
- Google Cloud Run locations (no Malaysia region): https://docs.cloud.google.com/run/docs/locations

## 7. Breach notification (s12B, from 1 June 2025)

Summary; the runbook is `BREACH-RESPONSE.md`.

- Notify the **Commissioner as soon as practicable and within 72 hours** of becoming aware of a
  breach; if late, give the reasons and evidence in writing.
- Notify **affected data subjects without unnecessary delay and within 7 days** of notifying the
  Commissioner, where the breach causes or is likely to cause **significant harm**: physical harm,
  financial loss, harm to credit records, damage to or loss of property; misuse for illegal
  purposes; compromise of sensitive personal data (financial data counts); a combination of data
  that enables identity fraud. For the Commissioner, also a breach of **significant scale**
  (more than 1,000 data subjects).
- Keep a **breach register** for at least **two years**.
- Where MyCA is the processor (a business's books), tell the business (the controller) without
  delay so it can notify; contracts with customers say MyCA will help.

## 8. Data subject rights and timelines

| Right | How the user exercises it | Deadline |
|---|---|---|
| Access (s30) | In-app export, or email the DPO | 21 days from receipt (s31) |
| Correction (s34) | Edit in the app; or email the DPO | 21 days |
| Withdraw consent (s38) | Delete the account in the app or on the website | Erased after 30 days (`RETENTION.md`) |
| Prevent processing likely to cause damage or distress (s42) | Email the DPO | 21 days |
| Prevent direct marketing (s43) | Marketing opt-in is off by default; unsubscribe link in every email | Immediately |
| Data portability (s43A) | "Download everything" export in CSV and JSON; on request, sent to another controller | Counsel to confirm the period once the Commissioner's portability guideline is final |

## 9. What still needs doing before launch

| # | Item | Who |
|---|---|---|
| 1 | Appoint the DPO (Malay and English, Malaysia-reachable) and notify the Commissioner within 21 days | Owner |
| 2 | Counsel opinion on PDPA applicability without a Malaysian entity, and on data user registration | Owner |
| 3 | Transfer Impact Assessment for Singapore; DPAs with Google Cloud and the model provider; intra-group transfer agreement with India | Owner |
| 4 | `PRIVACY_NOTICE_MY` in `cloud/src/consent.mjs` (English and Malay) and region selection for `MY` | Build |
| 5 | NRIC and passport masking in model requests | Build |
| 6 | Malay native-speaker and legal review of the notice | Owner |
| 7 | Breach register (a sheet or a table), tested once with a tabletop exercise | Owner |
| 8 | Publish the notice on the website at the URL given to Play | Owner |
