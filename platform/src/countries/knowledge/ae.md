---
country: AE
checked: 2026-11-14
recheck-by: 2027-02-28
attested: false
---

# United Arab Emirates

## Summary

There is no personal income tax, so the UAE is a business product only: VAT returns, corporate
tax returns and, from 2027, compulsory e-invoicing. E-invoicing is the opening. Every business
must appoint an Accredited Service Provider (ASP) and exchange invoices over Peppol. MyCA already
does this kind of work for India (e-invoice through NIC), so the path is to connect to an ASP
first and decide later whether to become one.

## Tax year and calendar

- A business's tax period is its financial year, commonly the calendar year.
- Corporate tax returns are due nine months after the period ends (a 31 December 2025 year end
  files by 30 September 2026).
- VAT returns and payment are due 28 days after the period. Periods are quarterly below
  AED 150 million of turnover and monthly above it.

## Corporate tax

- 0% on taxable income up to AED 375,000 and 9% above it.
- Qualifying Free Zone Persons pay 0% on qualifying income and still register and file.
- Small Business Relief is open to residents with revenue of AED 3 million or less in the period
  and every earlier one, for tax periods ending on or before 31 December 2029 (Ministerial
  Decision 131 extended Decision 73 of 2023 from 2026). Not for Qualifying Free Zone Persons or
  members of an MNE group of AED 3.15 billion. Losses of a relief period are not carried forward.
  A return is still filed.
  Source: https://osome.com/ae/blog/small-business-relief-extended-2029.amp/ (secondary)
- Brought-forward tax losses offset at most 75% of a later period's taxable income.
- A Qualifying Free Zone Person stays qualifying while non-qualifying revenue is no more than 5%
  of revenue or AED 5 million, whichever is lower; it then pays 9% on non-qualifying income with
  no AED 375,000 nil band.
- Companies set up on or after 1 March 2024 generally register within three months. Missing
  registration costs AED 10,000.
- An individual running a business registers once turnover passes AED 1 million a year; salary
  and personal investment income do not count.
- Keep records for at least seven years.
  Source: https://gulfnews.com/business/uae-corporate-tax-key-deadlines-thresholds-and-filing-rules-businesses-need-to-know-1.500668857
  (secondary; confirm against the Federal Tax Authority)

## VAT

- 5%. Compulsory registration above AED 375,000 of taxable supplies and imports in a year,
  within 30 days; voluntary from AED 187,500.
- A full tax invoice is needed for business customers or above AED 10,000; a simplified one is
  allowed otherwise. Issue within 14 days of supply.
- Late registration AED 10,000. Late return AED 1,000, then AED 2,000 for a repeat within
  24 months.
- From 14 April 2026 (Cabinet Decision 129 of 2025) late payment of VAT or Corporate Tax is a
  flat 14% a year, charged monthly and not compounded; an incorrect return is AED 500, then
  AED 2,000; a late tax invoice AED 2,500 a violation. A late Corporate Tax return is AED 500 a
  month for twelve months, then AED 1,000 a month.
  Source: https://www.businessdubai.ae/blogs/uae-vat-return-filing, https://bestaxca.com/uae-tax-penalties-2026-changes/ (secondary)
- The VAT 201 return: box 1a to 1g standard-rated supplies by emirate (Abu Dhabi, Dubai,
  Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah, Fujairah) with an adjustment column, 2 tourist
  refunds, 3 reverse charge, 4 zero-rated, 5 exempt, 6 imports (filled from customs), 7 import
  adjustments, 8 totals, 9 standard-rated expenses with an adjustment column, 10 reverse-charge
  recovery, 11 totals, 12 due, 13 recoverable, 14 payable, 15 refund request.
- Zero-rated: exports, international transport, some education and healthcare, first sale of
  new homes. Exempt: some financial services, residential lets and sales, bare land, local
  passenger transport.
  Source: https://www.cleartax.com/ae/vat-in-uae (secondary; confirm against the FTA)

## E-invoicing (the mandate)

- Legal basis: Ministerial Decisions 243 and 244 of 2025.
- Model: five-corner Peppol with the PINT data format, through Accredited Service Providers.
- Scope: business-to-business and business-to-government. Consumer sales are excluded for now.
- Pilot from 1 July 2026 with selected taxpayers.
- Revenue of AED 50 million or more: appoint an ASP by 30 October 2026 (moved from 31 July by a
  May 2026 amendment to Ministerial Decision 244), live by 1 January 2027.
  Source: https://gulfnews.com/business/uae-announces-extension-of-einvoicing-provider-deadline-to-october-2026-1.500535895
- Revenue below AED 50 million: appoint an ASP by 31 March 2027, live by 1 July 2027.
- Voluntary adoption is allowed earlier.
  Source: https://sovos.com/regulatory-updates/vat/uae-mandatory-e-invoicing-deadlines-announced/
- Ministry of Finance guidelines (v1.1): government entities appoint an ASP by 31 March 2027
  and go live 1 October 2027. Specification identifier urn:peppol:pint:billing-1@ae-1, process
  urn:peppol:bis:billing. The TIN is the first 10 digits of the TRN and the Peppol endpoint is
  0235 and the TIN. Buyers not on the network use 0235:9900000098, deemed supplies
  0235:9900000097, exports to a buyer with no Peppol ID 0235:9900000099. Each person appoints
  one ASP for sending and receiving. Out of scope: B2C, exempt financial services, airline
  tickets, sovereign government activity. Rounding at invoice total, AED totals required on a
  foreign-currency invoice. Penalties under Cabinet Decision 106 of 2025 apply only from each
  person's mandatory date.
  Source: https://mof.gov.ae/wp-content/uploads/2026/02/UAE-Electronic-Invoicing-Guidelines_V-1.0-23Feb2026.pdf
- MyCA's small-business customers fall in the second wave: they must have chosen a provider by
  31 March 2027. A UAE product should be selling before that date.

## Licences and registrations

- To issue e-invoices MyCA either partners with an ASP or becomes one. Becoming one needs
  Ministry of Finance accreditation and Peppol membership; the requirements are not yet
  researched from the primary source.
- Filing VAT and corporate tax returns is done by the taxpayer or a registered tax agent on
  EmaraTax. Whether EmaraTax offers a filing API to software is not yet established.

## Data

- The federal data law (Decree-Law 45 of 2021, in force 2 January 2022) reaches UAE residents'
  data wherever the processor is. It does not demand storage in the UAE in general; transfers
  abroad need an adequate destination or a contract or consent. It does not cover government,
  health or personal financial data, which have their own rules. The executive regulations had
  not been confirmed as published in the source read.
  Source: https://www.trade.gov/market-intelligence/united-arab-emirates-allows-cross-border-data-flows-personal-data
  (January 2024; recheck)
- MyCA's own rule is that each country's data stays in that country. Google Cloud has regions
  in Doha and Dammam but none in the UAE. AWS (`me-central-1`) and Azure (UAE North) do. A UAE
  deployment therefore needs a second cloud, or the rule needs an owner decision for the UAE.

## Payments

- Stripe serves UAE companies. Business software subscriptions sold inside the Android app must
  use Google Play billing.

## Open questions

- The ASP accreditation requirements and which ASPs offer a partner API.
- Whether EmaraTax has an API for returns.
- Hosting: add AWS or Azure for the UAE, or relax the in-country rule there. Thread decision
  2026-11-14: beta and sandbox in Google Cloud Doha (me-central1); an in-UAE host before general
  launch.
- Arabic language support in invoices and in the app.
- A UAE entity or free-zone licence for contracting and Stripe.
