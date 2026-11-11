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

## Not covered yet by the engine

- Alternative minimum tax, Schedule E and K-1, Form 4797, 2441, 8962, 5329, 8995-A, 2210, state
  returns and non-resident returns (1040-NR). The app refuses to file when a return needs one
  of these.

## Open questions

- Who the US-resident Responsible Official is.
- Stripe approval for the US company.
- A CPA or enrolled agent partner, who also attests the rule records.
- Whether Plus goes through Play billing.
