---
country: US
checked: 2026-11-11
recheck-by: 2027-01-15
attested: false
---

# United States

## Summary

MyCA US is its own store app (`com.mldynamic.myca.us`) for the general US market: Form 1040
prepared in the app and e-filed with the IRS, plus books, sales tax and payroll files for small
businesses. The engine, the e-file path and the app screens were built in three parallel pull
requests; this file records what they established and what still blocks a real filing.

## Tax year and calendar

- The tax year is the calendar year. The 2026 filing season is expected to open in late
  January 2027; the launch target is about 25 January 2027.
- The engine's 2026 rule records end on 31 December 2026, so 2027 figures are needed before the
  year turns.
  Source: `sprints/statutory-rules/src/rules/us-individual.mjs` (US engine pull request)

## Filing route: IRS Modernized e-File (MeF)

- Chosen route: MyCA becomes an IRS e-file provider itself (software developer, transmitter
  and online provider). A filing partner is the fallback for the first season.
- IRS Publication 3112: the firm's principals and its Responsible Official must be US citizens
  or lawful permanent residents and pass a suitability check. The application goes in under the
  US company. Apply for the EFIN by about 20 November 2026 to be ready for the season.
- IRS Publication 1345: return data is hosted in the United States; two-step sign-in before
  signing; an extended-validation certificate and weekly external vulnerability scans.
- Software must pass the Assurance Testing System (ATS) each year before it may transmit.
- Live filing needs `MYCA_PROVIDER_ENV=live` and all six of `MYCA_IRS_ETIN`, `MYCA_IRS_EFIN`,
  `MYCA_IRS_SOFTWARE_ID` (from ATS), `MYCA_IRS_APP_SYS_ID`, `MYCA_IRS_CERT_PATH` and
  `MYCA_IRS_KEY_PATH`. Without them the local simulator answers.
  Source: `docs/integrations/IRS-EFILE.md` (e-file pull request) and IRS Publications 3112 and
  1345; verify each point with counsel before the application.

## Data and privacy

- Internal Revenue Code section 7216 forbids using or disclosing return information without
  consent. No one in India may reach real US return data.
- A Written Information Security Plan is required of return preparers (FTC Safeguards Rule).
  Source: `docs/compliance/us/WISP.md` and `docs/compliance/us/US-LAUNCH.md` (US app pull request)
- Host in a US region (Google Cloud `us-central1` by default).
- Social Security numbers are sealed under their own key (`MYCA_PII_KEY`) and masked everywhere
  else.

## Payments: what Google Play allows

- Google's payments policy says tax preparation and filing should not use Google Play's billing
  system, so the $39 return fee is taken by card through Stripe.
- The same policy puts cloud software and services among the things that must use Google Play
  billing. A yearly software subscription sold inside the Android app (MyCA Plus at $79 a year)
  is at risk of being treated as cloud software, not tax filing. Either sell Plus through Play
  billing, or make sure what Plus sells is tax preparation and get that confirmed.
  Source: https://support.google.com/googleplay/android-developer/answer/10281818?hl=en
- The India app's monthly plans are cloud software and stay on Play billing.

## Prices (settled 2026-11-11)

- Return: $39 per federal return, once per tax year. Preparing and reviewing are free; filing
  is what is paid for.
- Plus: $79 a year, software only.
- Expert Review: $129, from February 2027, needs a CPA or enrolled agent partner.
- Done For You, International and state returns: 2028, waitlist until then.

## Federal individual figures the engine uses (2025 and 2026)

- 2025 follows P.L. 119-21 (One Big Beautiful Bill Act): standard deduction $15,750 single,
  $31,500 joint, $23,625 head of household; child tax credit $2,200 a child with $1,700
  refundable; SALT cap $40,000 ($20,000 separate), phased down above $500,000 of MAGI to a
  $10,000 floor; Schedule 1-A deductions for tips, overtime, car loan interest and the $6,000
  senior deduction, for 2025 to 2028.
- 2026 (Rev. Proc. 2025-32): standard deduction $16,100 / $32,200 / $24,150; SALT cap $40,400
  above $505,000; non-itemizers deduct up to $1,000 ($2,000 joint) of cash gifts, and
  itemized charity has a 0.5% of AGI floor.
- Tax under $100,000 of taxable income uses the Tax Table: the middle of each $50 band ($25
  below $3,000). The EIC uses the same $50 bands.
- No estimated tax penalty when the balance after withholding is under $1,000, or when
  payments reach the lesser of 90% of this year's tax and 100% of last year's (110% above
  $150,000 AGI, $75,000 separate); IRC 6654.
- Every figure is a dated record with no CPA attestation yet; returns say so until one attests.
  Source: `sprints/statutory-rules/src/rules/us-individual.mjs`, IRS Rev. Proc. 2024-40 and
  2025-32, P.L. 119-21, IRC 6654 (US engine pull request #223)

## Not covered yet by the engine

- Alternative minimum tax, Schedule E and K-1, Form 4797, 2441, 8962, 5329, 8995-A, 2210, state
  returns and non-resident returns (1040-NR). The app refuses to file when a return needs one
  of these.
- The engine reports each needed form it cannot prepare under `unsupported` on the review
  (Schedule E, 2441, 8962, 8995-A, and 2210 with `required: false` because the IRS can bill the
  penalty). 1040-NR is not detected: the return has no residency input yet.
  Source: `platform/src/us-1040.mjs` (US engine pull request #223)

## Open questions

- Who the US-resident Responsible Official is.
- Stripe approval for the US company.
- A CPA or enrolled agent partner, who also attests the rule records.
- Whether Plus goes through Play billing.
