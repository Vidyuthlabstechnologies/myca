# MyCA Malaysia: retention and deletion

Status: draft for counsel, 14 November 2026. Extends `docs/operations/RETENTION.md` (the platform
policy, enforced by `cloud/src/jobs.mjs`) with the Malaysian periods. Where they differ, the
Malaysian row here applies to businesses and users in region `MY`.

## The rule

Malaysian law puts the duty to keep records on the **taxpayer**, for **7 years**. MyCA helps the
taxpayer meet it by keeping the books safely while the account is open and by giving a complete,
free export at any time. PDPA s10 (Retention Principle) says personal data must not be kept longer
than the purpose needs, so when the owner asks MyCA to delete, MyCA erases after a 30-day grace
period, having warned the owner about the 7-year rule and offered the export first.

## Statutory periods the taxpayer must meet

| Record | Period | Law |
|---|---|---|
| Income and business records for income tax (including e-invoices issued and received) | 7 years from the end of the year in which the income was received | Income Tax Act 1967 s82; Public Ruling No. 4/2000 (Revised) and No. 5/2000 (individuals) on keeping sufficient records |
| Company accounting records | 7 years | Companies Act 2016 s245 |
| Sales tax records (registered manufacturers) | 7 years | Sales Tax Act 2018, record-keeping provision (counsel to cite the section) |
| Service tax records (registered persons) | 7 years | Service Tax Act 2018, record-keeping provision (counsel to cite the section) |
| E-invoices | Kept by LHDN in MyInvois once validated; the taxpayer still keeps its own records for 7 years | IRBM e-Invoice Guideline |

Sources (accessed 2026-11-14):
- LHDN Public Ruling No. 4/2000 (Revised), Keeping Sufficient Records (Companies & Co-operatives): https://www.hasil.gov.my/wp-content/uploads/PR4_2000_Rev.pdf
- Companies Act 2016 s245 (annotated copy): https://foundingbird.gitbook.io/companies-act-2016/part-3-management-of-company/division-3-accounts-and-audit/subdivision-1-financial-statements-and-reports/section-245.-accounts-to-be-kept
- IRBM e-Invoice Guideline (version 4.8, 30 August 2026): https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Guideline.pdf

## What MyCA keeps, for how long

| Data | Kept while | Then |
|---|---|---|
| Books, documents, e-invoices as submitted (signed JSON/XML), LHDN UUIDs and validation results, SST working papers, income tax estimates | The business or user account is open | Erased 30 days after the owner deletes the business or account; export offered before and during the 30 days |
| A business on a lapsed subscription | Read-only, exportable, for as long as the account is open (no automatic deletion for non-payment) | Owner decides; recommend a reminder each year and an email before any policy change |
| Account data (name, email or phone, devices, consents) | The account is open | Erased 30 days after account deletion |
| Access log | 365 days | Deleted nightly after a year |
| Database audit (pgaudit), request logs | 180 days | Expire |
| Crash reports (opt-in) | 90 days | Deleted |
| Backups (Cloud SQL) | 14 days | Expire, so an erased business disappears from backups within 14 days of erasure |
| Breach register | At least 2 years per entry | PDPA breach Guideline |
| Consent records (which notice version and language was accepted) | Life of the account plus 7 years, as evidence | Counsel to confirm; minimal data only (user id, version, time) |
| MyInvois intermediary authorisation evidence (who granted it, dates) | While the authorisation is active, plus 7 years | Same |

## Delete flow wording (Build item for the app)

Before the confirm button on "Delete this business" for an `MY` business:

> **Keep a copy first.** Malaysian tax law asks you to keep your records for 7 years. Download
> everything now; MyCA will erase this business 30 days after you confirm.
> [Download everything] [Delete in 30 days]

> **Simpan salinan dahulu.** Undang-undang cukai Malaysia menghendaki anda menyimpan rekod selama
> 7 tahun. Muat turun semuanya sekarang; MyCA akan memadam perniagaan ini 30 hari selepas anda
> mengesahkan.
> [Muat turun semua] [Padam dalam 30 hari]

The export for an `MY` business includes: all ledgers (CSV and JSON), e-invoices as submitted
plus LHDN validation results and the QR link, SST-02 working papers, income tax estimates as PDF,
and uploaded documents.

## Erasure and the MyInvois intermediary role

On erasure, MyCA also: deletes its stored record of the taxpayer's intermediary authorisation;
stops using the `onbehalfof` login for that TIN; and reminds the owner to remove MyCA as
intermediary in the MyInvois portal (MyCA cannot remove itself). Documents already validated by
LHDN stay in MyInvois; that is LHDN's record, not MyCA's.

## Open points for counsel

1. Whether MyCA, as a processor of the business's books, may erase on the owner's request inside
   7 years (recommended: yes, the duty is the taxpayer's; the warning and export cover it).
2. Exact section numbers for the Sales Tax Act 2018 and Service Tax Act 2018 record-keeping duty.
3. Whether to keep minimal consent and intermediary-authorisation evidence for 7 years after
   erasure, and how to say so in the notice.
