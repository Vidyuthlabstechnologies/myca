---
country: MY
checked: 2026-11-11
recheck-by: 2027-02-28
attested: false
---

# Malaysia

## Summary

Malaysia is the easiest of the planned countries to build. The opening is e-invoicing: every
business with revenue above RM1 million must issue e-invoices through LHDN's MyInvois, the API
is open to any software without a licence, and the newest wave (RM1 million to RM5 million)
only started on 1 January 2026. MyCA already does this kind of work in India through NIC.
Income tax and SST have no filing API for third parties, so MyCA prepares the figures and the
taxpayer files in MyTax or MySST. Data is hosted in Google Cloud Singapore until Google opens a
Malaysia region (owner decision, 11 November 2026).

## Tax year and calendar

- The year of assessment for an individual is the calendar year.
- Individual return deadlines on LHDN's page: Form BE (employment income) by 30 April on paper
  and 15 May by e-Filing; Form B (business income) by 30 June on paper and 15 July by e-Filing.
  LHDN says the online dates can change each year and publishes them in the Return Form Filing
  Programme, so the dated rule must be written from that year's programme.
  Source: https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/itrf-deadlines/
- SST returns (form SST-02) follow a two-month taxable period, due with payment by the last day
  of the month after the period ends; Customs may vary the period. Late payment adds 10% of the
  unpaid tax for the first 30 days, then 15% for each of the next two 30-day periods (checked
  2026-11-11, secondary). Source: https://www.pwc.com/my/en/publications/mtb/service-tax.html
- Form BE e-Filing for YA 2025 closes 15 May 2026 (secondary, checked 2026-11-11).
  Source: https://ringgitplus.com/en/blog/tax/malaysia-personal-income-tax-guide-2026-ya-2025.html

## E-invoicing (MyInvois)

- Phases by annual revenue: above RM100 million from 1 August 2024; RM25 million to
  RM100 million from 1 January 2025; RM5 million to RM25 million from 1 July 2025; RM1 million to
  RM5 million from 1 January 2026.
- Businesses with revenue up to RM1 million are exempt. The earlier fifth phase (1 July 2026)
  was cancelled when the exemption threshold rose from RM500,000 to RM1 million in the updated
  e-Invoice Guideline.
- Each phase has a six-month interim relaxation period in which LHDN does not prosecute as long
  as consolidated e-invoices are issued.
  Source: https://sovos.com/regulatory-updates/vat/malaysia-mandatory-e-invoicing-exemption-threshold-increased/
  (8 December 2025, secondary; confirm against LHDN's e-Invoice Guideline)
- From 1 January 2026 a sale above RM10,000 cannot go into a consolidated e-invoice.
  Source: reported by the Malaysia build thread from info-tech.com.my on 2026-11-11 (secondary;
  confirm against the e-Invoice Specific Guideline)
- Sign-in as the taxpayer's own system: `POST /connect/token` with the OAuth client credentials
  grant.
  Source: https://sdk.myinvois.hasil.gov.my/api/07-login-as-taxpayer-system
- Sign-in as an intermediary acting for a taxpayer: the same call on the identity service with a
  compulsory `onbehalfof` header holding the taxpayer's TIN, or TIN and business registration
  number joined by a colon. The token in LHDN's example lasts 3,600 seconds. The taxpayer grants
  the intermediary its permissions in the MyInvois portal, and LHDN recommends separate
  credentials for intermediary systems.
  Source: https://sdk.myinvois.hasil.gov.my/api/08-login-as-intermediary-system
- Document version 1.1 must be digitally signed with a certificate from a Malaysian
  certification authority.
  Source: reported by the Malaysia build thread from the MyInvois SDK on 2026-11-11; link the
  exact SDK page when the signer is built

## SST (sales tax and service tax)

- Sales tax is charged at 5% or 10% depending on the goods. Service tax is 8% in general, with
  6% kept for some services.
- From 1 July 2025 service tax was widened: 8% on rental or leasing and on fee-based financial
  services; 6% on construction works, private healthcare and education. Small enterprises with
  turnover under RM500,000 are outside the rental and leasing charge.
  Source: https://www.grantthornton.com.my/insights/Tax/revision-of-sales-tax-rates-and-expansion-of-scope-for-service-tax/
  (12 June 2025, secondary; confirm against the Royal Malaysian Customs Department orders)
- These figures are pointers. The rates, the goods and services schedules and the registration
  thresholds must be written as dated rules from the gazetted orders before any calculation.

## Licences and registrations

- The MyInvois API needs no software licence. MyCA needs production credentials for its system,
  and each client adds MyCA as its intermediary.
- Income tax: MyTax e-Filing has no API for third parties, so the route is "prepare in MyCA, the
  taxpayer files in MyTax". A tax agent licence under section 153 of the Income Tax Act 1967 is
  needed only if MyCA charges to act as the taxpayer's agent.
- SST: no software licence. The business files in MySST.
  Source: reported by the Malaysia build thread on 2026-11-11; the primary pages are still to be
  linked

## Data

- The Personal Data Protection (Amendment) Act 2024 replaced the whitelist for transfers abroad
  from 1 April 2025: personal data may go to a place whose law is substantially similar or gives
  equivalent protection. A data protection officer and breach notification are compulsory from
  1 June 2025.
  Source: https://www.dataprotectionreport.com/2025/01/new-horizons-in-data-protection-malaysias-personal-data-protection-amendment-act-2024/
  (secondary; confirm against the Act and the Commissioner's guidelines)
- Google Cloud has no Malaysia region. Cloud Run's nearest locations are Singapore
  (`asia-southeast1`), Jakarta and Bangkok. AWS opened a Malaysia region in August 2024.
  Source: https://docs.cloud.google.com/run/docs/locations
- MyCA's own rule is that each country's data stays in that country. For Malaysia the owner chose
  Google Cloud Singapore (`asia-southeast1`) under the transfer rule above on 11 November 2026,
  to move to a Google Malaysia region once one opens. The privacy notice must say so.

## Payments

- Software subscriptions sold inside the Android app must use Google Play billing; a tax filing
  service may take cards. See "Payments: what Google Play allows" in `us.md`.
- Whether Stripe or a local processor suits a Malaysian entity has not been researched.

## Individual income tax (research for the dated rules)

Checked 2026-11-11 from secondary sources; written as dated rules `my.income-tax.*` in
`sprints/statutory-rules/src/rules/malaysia.mjs`, unattested.

- Resident bands: 0% to RM5,000, 1% to RM20,000, 3% to RM35,000, 6% to RM50,000, 11% to RM70,000,
  19% to RM100,000, 25% to RM400,000, 26% to RM600,000, 28% to RM2,000,000, 30% above.
  Non-residents pay a flat 30%. PwC labels these "prevailing" rates, not by year of assessment.
  Source: https://taxsummaries.pwc.com/malaysia/individual/taxes-on-personal-income
- YA 2025 relief caps, among them: individual RM9,000, spouse RM4,000, life insurance and EPF
  RM7,000, lifestyle RM2,500, sports RM1,000, medical RM10,000, parents RM8,000, education and
  medical insurance RM4,000, SOCSO RM350, SSPN RM8,000, child under 18 RM2,000 each. RM400 rebate
  at or below RM35,000 chargeable income, another RM400 for a spouse with no income.
  Source: https://ringgitplus.com/en/blog/tax/everything-you-can-claim-as-income-tax-relief-in-malaysia-2026-filing-for-ya-2025.html

## SST rates and thresholds (research for the dated rules)

- From 1 January 2026 rental or leasing is 6% (8% from 1 July to 31 December 2025). 6% also for
  food and beverage, telecommunication, parking, logistics, construction, education and
  healthcare for non-citizens; healthcare and education for citizens are exempt; 8% otherwise;
  RM25 flat per credit or charge card. Source: https://www.pwc.com/my/en/publications/mtb/service-tax.html
- Service tax registration: RM500,000 for most services, RM1,000,000 for rental or leasing and
  insurance, RM1,500,000 for food and beverage, construction and private healthcare, over twelve
  months. Same source; some rows of PwC's table were ambiguous (financial services, wellness).
- Sales tax registration for manufacturers: RM500,000 of taxable goods in twelve months.
  Source: https://www.grantthornton.com.my/insights/Tax/revision-of-sales-tax-rates-and-expansion-of-scope-for-service-tax/

## MyInvois technical facts (checked 2026-11-11 against the SDK)

- Hosts: `preprod-api.myinvois.hasil.gov.my` (sandbox, lower rate limits) and
  `api.myinvois.hasil.gov.my`. Token lifetime 60 minutes; reuse it; login limit about 12 a minute.
  Source: https://sdk.myinvois.hasil.gov.my/integration-practices/
- Submit: `POST /api/v1.0/documentsubmissions/`, JSON `{documents:[{format, document (base64),
  documentHash (SHA-256), codeNumber}]}`; at most 100 documents, 5 MB a submission, 300 KB a
  document; 202 with submissionUid, accepted and rejected documents; 422 DuplicateSubmission
  within 10 minutes. Source: https://sdk.myinvois.hasil.gov.my/einvoicingapi/02-submit-documents
- v1.1 JSON signature: drop UBLExtensions and Signature, minify, SHA-256 (DocDigest), RSA-SHA256
  signature, SHA-256 of the certificate (CertDigest), SignedProperties digest (PropsDigest),
  then add UBLExtensions and Signature. Source: https://sdk.myinvois.hasil.gov.my/signature-creation-json/
- Code tables (states 01 to 17, tax types 01 to 06 and E, document types 01 to 04 and 11 to 14,
  45 classification codes, payment methods, MSIC, units, countries, currencies) are vendored in
  `platform/src/countries/malaysia/codes/` from https://sdk.myinvois.hasil.gov.my/files/.

## Ready-made pieces

- LHDN publishes the MyInvois SDK (API reference, document types, UBL 2.1 samples in JSON and
  XML, code tables) at https://sdk.myinvois.hasil.gov.my/start/
- `platform/src/countries/ready-made.mjs` lists the packages and providers already weighed for
  e-invoice building and signing.

## Open questions

- The sales tax goods schedules (which goods are 5% and which 10%), from the Customs orders.
- YA 2026 relief caps from Budget 2026; the gazetted text behind every rule, for attestation.
- Employer side: EPF, SOCSO, EIS and the monthly tax deduction (PCB) tables.
- Whether MyCA needs a Malaysian entity (Sdn. Bhd.) to hold MyInvois intermediary credentials
  and the signing certificate.
- Which payment processor for a Malaysian entity.
