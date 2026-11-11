---
country: AE
checked: 2026-11-11
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
- Small Business Relief is open to residents with revenue of AED 3 million or less, for tax
  periods ending on or before 31 December 2029. A return is still filed.
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
- Zero-rated: exports, international transport, some education and healthcare, first sale of
  new homes. Exempt: some financial services, residential lets and sales, bare land, local
  passenger transport.
  Source: https://www.cleartax.com/ae/vat-in-uae (secondary; confirm against the FTA)

## E-invoicing (the mandate)

- Legal basis: Ministerial Decisions 243 and 244 of 2025.
- Model: five-corner Peppol with the PINT data format, through Accredited Service Providers.
- Scope: business-to-business and business-to-government. Consumer sales are excluded for now.
- Pilot from 1 July 2026 with selected taxpayers.
- Revenue of AED 50 million or more: appoint an ASP by 31 July 2026, live by 1 January 2027.
- Revenue below AED 50 million: appoint an ASP by 31 March 2027, live by 1 July 2027.
- Voluntary adoption is allowed earlier.
  Source: https://sovos.com/regulatory-updates/vat/uae-mandatory-e-invoicing-deadlines-announced/
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
- Hosting: add AWS or Azure for the UAE, or relax the in-country rule there.
- Arabic language support in invoices and in the app.
- A UAE entity or free-zone licence for contracting and Stripe.
