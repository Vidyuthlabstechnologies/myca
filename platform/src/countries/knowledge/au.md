---
country: AU
checked: 2026-11-11
recheck-by: 2027-03-31
attested: false
---

# Australia

## Summary

Individuals lodge either with the ATO's own free myTax or through a registered tax agent. Only
registered tax agents may charge a fee to prepare or lodge a return, and the ATO lists no
third-party consumer software route. So the Australian product is books, GST (BAS), payroll
reporting and a tool for tax agents, not a consumer filing app, unless MyCA registers as or
partners with a tax agent. Software connects to the ATO as a Digital Service Provider (DSP) and
must meet the DSP Operational Framework, which is strict on security and on onshore hosting.

## Tax year and calendar

- The income year runs 1 July to 30 June. The pack's year starts in month 7.
- Individuals who lodge themselves: 1 July to 31 October; a bill is generally due 21 November.
  Clients of a registered tax agent can lodge later under the agent's lodgment program if they
  joined it by 31 October.
- Quarterly BAS for 2025-26: 28 October 2025, 28 February 2026, 28 April 2026, 28 July 2026.
- Superannuation guarantee is 12% from 1 July 2025, due quarterly on 28 October, 28 January,
  28 April and 28 July. Payday Super starts 1 July 2026: contributions must reach the fund
  within seven business days of payday.
- Single Touch Payroll is finalised by 14 July.
- Many small companies lodge by 28 February after the income year.
  Source: https://lawpath.com.au/blog/key-tax-dates-australia (secondary; confirm with the ATO)
  and https://www.ato.gov.au/individuals-and-families/your-tax-return/how-to-lodge-your-tax-return

## GST

- Register when GST turnover (current month plus the previous 11, or the next 11) reaches
  $75,000, or $150,000 for non-profits, within 21 days. Taxi and ride-sourcing drivers register
  whatever their turnover. Once registered, stay registered for at least 12 months.
  Source: https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst
- The rate is 10% (not on the page read; confirm).

## Who may charge for tax work

- The Tax Agent Services Act 2009 requires registration with the Tax Practitioners Board (TPB)
  to provide a tax agent or BAS service for a fee. A fee bundled into a package still counts.
- Not a tax agent service: selling non-customised accounting software, even with tax
  calculators and lodgment features; general training; generic manuals; a help desk that does
  not advise on the client's own obligations; a messaging service that only transmits data.
- A tax agent service: preparing a client's payroll or accounts while interpreting tax law or
  dealing with the ATO for them; configuring software to reach a specific tax outcome for a
  client; help desk or written advice tailored to the client that they can rely on.
- Safeguards the TPB expects of unregistered providers: show the data to the client before
  transmission, give a way to review it, keep evidence that they did, and state that the
  provider is not a registered agent.
  Source: https://tpb.gov.au/sites/default/files/2022-10/i_09_2011_digital_service_providers_and_the_tasa.pdf
- What this means for MyCA's assistant: answering "what should I claim" for a specific person is
  tailored advice. In Australia the assistant must stay general, or a registered agent must
  stand behind it.

## What the ATO requires of software (DSP Operational Framework)

- Categories run A to E by who controls the product, API risk and volume. A hosted commercial
  service with more than 10,000 client records is category A. A hosted service with fewer than
  10,000 records is B or C by API risk.
- Certification: category A needs independent certification against ISO/IEC 27001 or IRAP.
  B and C may self-assess against ISO 27001, the ISM, NIST CSF (C may also use SOC 2 or OWASP
  ASVS). MyCA's ISO 27001 and SOC 2 already cover this, if their scope includes the product.
- Multi-factor sign-in is mandatory for staff and for end users who can reach tax, accounting,
  payroll or super data. No shared logins. "Remember me" under 24 hours. No social logins as a
  second factor.
- Data hosting: onshore by default. Offshore hosting, including backups and standby systems, is
  only by exception.
- Encryption in transit with TLS 1.3 as the minimum; encryption at rest; a key management
  policy.
- Audit logs that trace user access and actions, kept at least 12 months.
- Entity validation: confirm that users are real businesses with a real need for the APIs.
- Personnel security procedures, security monitoring at network, application and transaction
  level, a supply chain overview given to the ATO, and care over third-party add-ons.
  Source: https://softwaredevelopers.ato.gov.au/RequirementsforDSPs

## Data

- Host in Sydney (Google Cloud `australia-southeast1`) with backups in Melbourne
  (`australia-southeast2`). Nothing offshore, backups included.

## Payments

- Stripe serves Australian companies. Business software subscriptions sold inside the Android
  app must use Google Play billing.

## Open questions

- Whether individual returns can be lodged by software at all outside the agents' Practitioner
  Lodgment Service. The ATO page lists only myTax, agents and paper; treat consumer filing as
  closed until the ATO says otherwise.
- Which ATO APIs MyCA wants first (BAS lodgment, Single Touch Payroll) and their risk rating,
  which fixes the DSP category.
- Whether an Australian company or ABN is needed to register as a DSP.
- A registered tax agent partner, if any advice or lodgment for a fee is offered.
