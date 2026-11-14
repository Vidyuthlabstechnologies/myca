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

## Rates and HMRC API facts checked on 2026-11-14

Read from GOV.UK, gov.scot and the HMRC Developer Hub API specifications on 2026-11-14 for the
UK engine (`platform/src/countries/united-kingdom/`, rules `gb.*` in `sprints/statutory-rules`).

- Personal allowance £12,570, frozen to April 2031; basic band £37,700; additional rate from
  £125,140. Class 4 6% between £12,570 and £50,270, 2% above. Class 2 is voluntary: £3.50 a week
  and small profits threshold £6,845 in 2025-26; £3.65 and £7,105 in 2026-27. Blind person's
  allowance £3,130 then £3,250.
  Source: https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past
  and https://www.gov.uk/self-employed-national-insurance-rates
- Scottish bands 2026-27 (gross income): starter 19% to £16,537, basic 20% to £29,526,
  intermediate 21% to £43,662, higher 42% to £75,000, advanced 45% to £125,140, top 48%.
  Source: https://www.gov.scot/publications/scottish-income-tax-2026-2027/
- Dividend allowance £500; dividend rates 10.75%, 35.75% and 39.35% from 6 April 2026. From
  6 April 2027 savings rates become 22%, 42% and 47%, a separate property income rate of 22%,
  42% and 47% starts in England, Wales and Northern Ireland, and allowances are set against
  other income before property, savings and dividends. The engine has no 2027-28 rules yet.
  Source: https://www.gov.uk/government/publications/budget-2025-overview-of-tax-legislation-and-rates-ootlar
- CGT 18% and 24%, annual exempt amount £3,000; Business Asset Disposal Relief 14% in 2025-26
  and 18% from 6 April 2026. Source: https://www.gov.uk/capital-gains-tax/rates
- Student loans 2025-26: Plan 1 £26,065, Plan 2 £28,470, Plan 4 £32,745, Postgraduate £21,000;
  Plan 5 repayments start April 2026. 2026-27: Plan 1 £26,900, Plan 2 £29,385, Plan 4 £33,795,
  Plan 5 £25,000, Postgraduate £21,000. 2027-28: Plan 5 £26,025 (SLC, 12 November 2026), Plan 2
  and Postgraduate frozen. Source: https://www.gov.uk/repaying-your-student-loan/what-you-pay
- High Income Child Benefit Charge from £60,000, full at £80,000. VAT registration £90,000,
  deregistration £88,000.
- Penalties: no penalty points for late MTD Income Tax quarterly updates in 2026-27. Late
  payment penalties for MTD Income Tax are 3% at day 15, 3% at day 30 and 10% a year from day
  31 in 2026-27, rising to 4% and 4% in 2027-28; VAT late payment penalties also rise from
  1 April 2027 (rates not yet found). Late payment interest is base rate plus 4%: 7.75%, then
  8.00% from 24 November 2026.
  Source: https://www.gov.uk/government/publications/rates-and-allowances-hmrc-interest-rates-for-late-and-early-payments
- ICO data protection fee since 17 February 2025: £52, £78 and £3,763 by tier, £5 less by
  Direct Debit. Source: https://ico.org.uk/for-organisations/data-protection-fee/
- HMRC API versions: VAT (MTD) 1.0, Business Details 2.0, Obligations 3.0, Self-Employment
  Business 5.0, Property Business 6.0, Individual Calculations 8.0 (9.0 is sandbox only), Test
  Fraud Prevention Headers 1.0; Accept `application/vnd.hmrc.X.Y+json`. Access tokens last 4
  hours; refresh tokens are single-use and expire after 18 months. Rate limit 3 requests a
  second per application. The mobile connection method needs 18 fraud prevention headers, and
  Gov-Vendor-Version needs an entry for the app and one for the server.
  Source: https://developer.service.hmrc.gov.uk/api-documentation/docs/api and
  https://developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/mobile-app-via-server/
- Launch timing: every MTD Income Tax API page says HMRC is no longer accepting production
  credential requests for new 2026-27 quarterly update products because the market window has
  closed. A new product can go live for quarterly updates from the 2027-28 window. MTD VAT has no
  such window. Source: https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-employment-business-api/5.0
- Not published by HMRC: the UTR and VAT number check-digit algorithms. The engine uses the
  widely used public versions (UTR weights 6,7,8,9,10,5,4,3,2 with the table 21987654321; VAT
  modulus 97 and the 9755 variant).
