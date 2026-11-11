---
country: GB
checked: 2026-11-11
recheck-by: 2027-03-31
attested: false
---

# United Kingdom

## Summary

The opening is Making Tax Digital for Income Tax (MTD IT): sole traders and landlords must keep
digital records and send HMRC quarterly updates through recognised software. The mandate widens
every April until 2028, which gives MyCA three yearly waves of people who must pick software.
HMRC's APIs are open to any registered developer, there is no fee, and no professional licence is
needed to offer software. Books plus quarterly updates fit what MyCA already does for India.

## Tax year and calendar

- The tax year runs 6 April to 5 April. The pack needs a year start day of 6, not only month 4.
- MTD IT is compulsory from 6 April 2026 for qualifying income over £50,000, from 6 April 2027
  over £30,000 and from 6 April 2028 over £20,000. Qualifying income is self-employment plus
  property income before expenses, read from the return of the earlier year.
  Source: https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/get-started and
  https://www.taxassist.co.uk/resources/articles/making-tax-digital-for-income-tax-key-dates-deadlines-and-how-to-stay-compliant/amp
- Quarterly updates for 2026-27: 6 April to 5 July due 7 August 2026; 6 July to 5 October due
  7 November 2026. The remaining two are due 7 February and 7 May 2027 (not in the fetched
  source; confirm on GOV.UK). A calendar-quarter election exists; confirm its dates.
- The final declaration (the tax return) for 2026-27 is due 31 January 2028.
- From September 2026 HMRC signs up people who should have joined and have not.

## Penalties (for reminders in the app)

- One point for each late quarterly update or late final declaration; four points bring a £200
  penalty. People who start in April 2026 get no points for late quarterly updates in their
  first four quarters. That easement does not cover the 2027 and 2028 starters.
- Failing to keep adequate records can cost up to £3,000.
  Source: the TaxAssist article above.

## What HMRC requires of software

- Register on the HMRC Developer Hub, build against the sandbox, then apply for production
  credentials. HMRC reviews: a responsible individual, proof the organisation is registered
  (an organisation outside the UK gives equivalent evidence, so the Indian or US company can
  apply), a privacy policy URL, a terms URL, and answers to a security questionnaire. The
  application lapses after 6 months if unfinished.
- Fraud prevention headers are required by law on MTD VAT and MTD Income Tax calls. Test them
  with the Test Fraud Prevention Headers API. HMRC checks them monthly, by machine and by hand,
  and emails a status. Never send placeholders such as `null`.
- Encrypt access tokens and personal data at rest and in transit. Pass a penetration test
  (NCSC guide). Audit controls against the ICO security checklist.
- Say where the servers are. Use role-based access. Let customers change, export and delete
  their data. Never store HMRC sign-in details: use OAuth 2.0.
- Report a breach of customer data to HMRC within 72 hours and to the ICO within 72 hours.
- Web software must meet WCAG AA.
- Say "HMRC recognised". Never say "accredited" or "approved".
  Source: https://developer.service.hmrc.gov.uk/api-documentation/docs/terms-of-use (archived
  copy read 2026-11-11) and
  https://developer.service.hmrc.gov.uk/guides/fraud-prevention/getting-it-right/
- The older terms of collaboration add: Cyber Essentials or equivalent is recommended; free
  products must cover digital records, quarterly updates and the year end for cash-basis sole
  traders; users must be able to export all records.
  Source: https://www.gov.uk/government/publications/making-tax-digital-software-suppliers-terms-of-collaboration/terms-of-collaboration-between-hm-revenue-and-customs-and-software-developers
- HMRC publishes a developer newsletter for MTD IT. Read each edition.
  Source: https://www.gov.uk/government/collections/making-tax-digital-for-income-tax-software-developer-newsletter

## Licences and registrations

- Software needs no professional licence. Recognition comes from passing HMRC's production
  checks.
- From May 2026 tax advisers who deal with HMRC for clients must register with HMRC and meet
  minimum standards, with at least three months of transition. The policy paper does not say
  whether software firms count. MyCA acting as an agent, or offering a human review, would fall
  inside it; software the taxpayer uses themself should not. Confirm with a UK adviser.
  Source: https://www.gov.uk/government/publications/mandatory-tax-adviser-registration-with-hmrc/tax-advisers-to-register-with-hmrc-and-meet-minimum-standards
- Pay the ICO data protection fee as a controller. The ICO page read on 2026-11-11 shows three
  tiers (micro, small and medium, large). The amounts on that page (£40, £60, £2,900) disagree
  with news of a rise on 17 February 2025; check the current amount before paying.
  Source: https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/data-protection-fee/

## VAT

- Standard 20%, reduced 5%, zero 0%. Register when taxable turnover passes £90,000 on a rolling
  12 months, or is expected to in the next 30 days alone. Deregistration threshold £88,000.
  Notify within 30 days of the end of the month the threshold was passed.
- VAT-registered businesses keep records and file through MTD-compatible software.
  Source: https://tinytax.co.uk/guides/vat-threshold-explained (secondary; confirm on GOV.UK)

## Data

- UK GDPR applies. Host in the UK (Google Cloud `europe-west2`, London) to keep the promise that
  each country's data stays in that country. HMRC asks where servers are; it does not forbid
  other locations.

## Payments

- Stripe serves UK companies. The UK app's subscription for books is "cloud software" and must
  use Google Play billing inside the Android app; a fee for filing a tax return is exempt. See
  the payments note in `us.md`.

## Open questions

- Which company applies to HMRC: the Indian company, the US company or a UK company.
- The calendar-quarter election dates and the 7 February and 7 May deadlines.
- Whether a UK-qualified reviewer is wanted, which brings adviser registration.
- The National Insurance and income tax computation is not needed for quarterly updates but is
  needed for the final declaration; HMRC's API returns its own calculation, which MyCA can show.
