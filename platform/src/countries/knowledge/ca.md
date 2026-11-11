---
country: CA
checked: 2026-11-11
recheck-by: 2027-01-31
attested: false
---

# Canada

## Summary

Individuals file a T1 return with the CRA through certified software (NETFILE). Certification is
yearly and runs on the CRA's calendar: test returns go out in mid-November, forms are final in
December, the service opens in late February. Quebec is a second return (TP-1) with its own
authority and its own certification. The US Form 1040 engine's shape (taxpayer, slips, interview,
review, sign, file) carries over; the figures and forms do not.

## Tax year and calendar

- The tax year is the calendar year.
- Most individuals file and pay by 30 April. Self-employed people and their partners file by
  15 June, but any balance is still due 30 April. Instalments fall on 15 March, 15 June,
  15 September and 15 December.
  Source: https://www.canada.ca/en/services/taxes/resources-for-small-and-medium-businesses/2026-tax-deadlines-canadian-businesses-self-employed-individuals.html
- Corporations (T2) file within six months of year end; the balance is generally due two months
  after year end, three for some small Canadian-controlled private corporations.
- T4 and related slips are due the last day of February.

## Filing route: NETFILE and ReFILE

- NETFILE for the 2025 year opened Monday 23 February 2026 at 6:00 a.m. Eastern and closes
  Friday 29 January 2027. Maintenance runs 3 a.m. to 6 a.m. Eastern daily. It accepts first
  returns for 2018 to 2025; ReFILE takes amended returns for 2022 to 2025.
- The filer needs a SIN (or a temporary tax number starting 01 or 03).
- NETFILE refuses: returns for the deceased, bankruptcy returns, deemed residents, foreign tax
  credits for more than 3 countries, more than 12 sets of financial statements, SR&ED claims,
  and other listed cases. The app must detect these and say so before the user spends time.
- Up to 20 returns per computer or CRA account each tax year. An app that files for many people
  from one server must confirm with the CRA how this limit applies to an online product.
  Source: https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/send-return/netfile.html
- The federal return carries the provincial return for every province and territory except
  Quebec.

## What the CRA requires of software

- Apply with the "Software Developer's Application for Electronic Filing" to the NETFILE
  certification team; that releases the specifications.
  Source: https://lists.gnu.org/archive/html/libreplanet-ca-on/2016-10/msg00001.html (a
  developer's correspondence; confirm the current form with the CRA)
- In mid-November each year the CRA gives test returns to developers who asked for
  certification. Developers sign a confidentiality agreement to see draft forms, which are
  usually released in December. The software must format records to the CRA's specification,
  compute tax fields correctly, pass the built-in error checks and process every field code.
  A confirmation letter follows; only then may the product be called certified. Certification
  is repeated every year.
  Source: https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/efile-electronic-filers/efile-certified-software-efile-program.html
- 17 products were certified for the 2025 year. The CRA does not review developers' privacy
  policies and is not responsible for calculation errors.
  Source: https://www.canada.ca/en/revenue-agency/services/e-services/e-services-individuals/netfile-overview/certified-software-netfile-program.html
- EFILE is the separate route for people who prepare returns for a fee; it needs an EFILE
  number per preparer.

## Quebec

- Revenu Québec authorises software in two steps. Authorisation: register as a partner, register
  the product in My Account for partners, build to "Requirements for Computer-Generated Forms:
  Individuals" (IN-413-V), submit test cases, fix and resubmit. Certification (needed to
  transmit online): further test cases on top of an authorisation number.
  Source: https://www.revenuquebec.ca/en/partners/product-developers/fields-of-activity/income-tax-product-developers/personal-income-tax/authorization-and-certification-personal-income-tax/
- Quebec could wait for a second season: launch in the other provinces first and refuse Quebec
  residents clearly.

## GST/HST

- A business stops being a small supplier when taxable revenue passes $30,000 in one calendar
  quarter or over four consecutive quarters. In the single-quarter case registration is
  effective from the supply that crossed the line. Register within 29 days.
- Taxi and ride-sharing drivers register from their first fare whatever their revenue.
- Monthly and quarterly filers file and pay one month after the period; annual filers three
  months after year end.
  Source: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html
- Rates differ by province (GST, HST, and separate provincial sales taxes in some provinces).
  Not yet researched from a primary source.

## Data

- PIPEDA does not require storing data in Canada; it requires a comparable level of protection
  when a third party processes it and telling people their data may leave Canada.
- Quebec's Law 25 requires an assessment before personal information leaves Quebec, a written
  contract with the recipient and notice to the individual (in force since 22 September 2023).
  Source: https://www.blg.com/insights/2022/12/cross-border-transfers-of-personal-information-outside-quebec
- Hosting in Montréal (Google Cloud `northamerica-northeast1`) keeps data in Canada and in
  Quebec, which removes the Law 25 transfer assessment for hosting.

## Payments

- Stripe serves Canadian companies. Filing fees are exempt from Google Play billing (see `us.md`).

## Open questions

- The current NETFILE developer application, its deadline for the 2026 tax year and whether a
  Canadian company or address is required.
- How the 20-return limit applies to a hosted app.
- Provincial sales tax rates and the provincial credits each T1 needs.
- Whether a Canadian entity is needed for Stripe and for the CRA.
