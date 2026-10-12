# United States edition: decision memo and phased design

Date: 2026-10-13. Status: U0 and the core of U1 built on 2026-10-13 under the assumptions in section 11; the owner's decisions (section 9) still stand for U2 onward.

Goal stated by the owner: make MyCA "totally compatible with the United States as well".
This document says what that means, what in the current product is India-specific, how a
US business would be served without weakening the Indian product, in what order, and
what the owner must decide before any of it is built.

## 1. In one paragraph

MyCA today is an Indian product from the ground up: GST on every invoice, the Income-tax
Act engine, TDS, provident fund and state insurance, an April–March year, rupees in
paise, Mumbai hosting under the DPDP Act, and a chat that understands Indian phrasing.
Nothing of that applies in the US. A US business keeps books under sales tax (state and
local, by destination), withholds federal and state income tax and FICA from wages,
files quarterly 941s and yearly W-2s and 1099s, and works to a January–December year in
dollars. The honest shape of "compatible with the US" is a **second country edition
on the same product**: one engine for books, review and chat, with the country chosen
per business selecting its rules, calendar, currency, forms and integrations. India stays
exactly as it is. The US edition is built in phases behind that country switch, each
phase a usable product for a US owner, and every statutory figure a dated rule with its
citation, signed off by a US CPA the way the advisor CA signs off Indian rules.

## 2. What is India-specific today (measured)

| Layer | Where | India assumption | What a US business needs |
|---|---|---|---|
| Money | `ledger.mjs` (`paise`, `rupees`), every `round2` | Integer paise; ₹ formatting in `en-IN` | Integer cents; `$` in `en-US`. The ledger is already integer minor units, so this is naming and formatting, not arithmetic |
| Calendar | `statutory-rules/src/dates.mjs` `fyOf`, `deadline-run.mjs`, period labels "Q2 2026-27" | Financial year April–March; quarters from April | Calendar year; quarters from January; IRS deposit schedules |
| Tax on sales | `chart.mjs` `gstSplit`, `invoice.mjs`, GSTR-1/3B, e-invoice, e-way bill, GSTR-2B, set-off | GST by rate and place of supply; GSTIN identity; returns to GSTN | Sales tax by delivery address at state plus local rates, exemption certificates, no input credit, returns per state; no equivalent of GSTR-2B or e-invoicing |
| Tax on purchases | input credit accounts 1200–1202, blocked credit | ITC | None; use tax on untaxed purchases in some states |
| Withholding | `tds-deduction.mjs`, `tds-return.mjs` | TDS by section on bills and expenses | Backup withholding is rare; the equivalent obligation is **1099-NEC reporting** of contractor payments (threshold $2,000 for payments after 2025) and W-9 collection |
| Payroll | `payroll.mjs`, `payroll.*` rules, `payroll-files.mjs` | PF, ESI, professional tax, section 192 | Federal income tax withholding (Publication 15-T percentage method with the 2020+ W-4), Social Security 6.2% to the wage base ($184,500 in 2026), Medicare 1.45% plus Additional Medicare 0.9% above $200,000, FUTA 6.0% on the first $7,000 less the state credit, state income tax and SUTA by state, 941 deposits, W-2/W-3, 1099-NEC/1096 |
| Income tax | `income-tax.mjs`, `itr.mjs` | Indian slabs, regimes, rebate, cess | Federal and state income tax for the owner; estimated taxes (1040-ES); Schedule C for a sole proprietor; pass-through for an LLC/S-corp |
| Identity | `company.gstin`, `pan`, `tan`, `state` codes 01–38 | GSTIN, PAN, TAN | EIN, state tax accounts, two-letter state codes, sales tax permits |
| Deadlines | `sprint-4-deadlines`, `due-date.*` rules | Indian returns | IRS and state calendars |
| Imports | `sprint-1-tally-ingestion`, `sprint-2-bank-ocr`, Zoho CSV | Tally, Indian bank statements | QuickBooks/Xero CSV, OFX/QFX bank exports, US bank formats |
| Chat | `intent.mjs` and the `*-intent.mjs` files, `words.mjs` | "paid 12000 rent", GST %, Indian months and numbering | "$1,200 rent", sales tax, US dates; lakh/crore never appear |
| App | `mobile/` strings, `rupees()`, Taxes screen, review screens | ₹, GST, TDS screens | $, sales tax, payroll taxes; the Taxes screen is a different set of cards |
| Hosting | `cloud/`, Mumbai region, DPDP | Data in India | Data in the US (no federal residency law, but state privacy acts apply); a US region of the same deployment |
| Rules | `sprints/statutory-rules` registry, one namespace | Indian Acts | A `us.*` namespace with federal and per-state records and their own attestation by a US CPA |

What is already country-neutral and stays shared: the double-entry ledger and its
checksummed journal, books per business and tenancy, the preview-then-confirm step, the
review pattern (steps bound to a draft hash), the action gate, the audit log, the
exception queue, reminders, the cash forecast, the document store, the outbox, the
hosted API, sign-in, and the app's shell and navigation.

## 3. Options considered

| Option | What it is | Verdict |
|---|---|---|
| A. Full US edition behind a country switch | One product; a business is Indian or American; shared core; country-specific engines, rules, forms and screens | **Recommended.** Keeps India untouched, reuses the core, and gives a US owner a real product in stages |
| B. A separate US product on a fork | Copy the repo and replace the Indian parts | Doubles maintenance of the shared core and the app; every fix lands twice |
| C. Multi-currency and US customers only | An Indian business invoicing US buyers in dollars (exports, LUT, FEMA receipts) | Useful and small, but it is not "compatible with the US"; it can be a later addition to the Indian edition |
| D. US payroll only | Run payroll for US employees inside the Indian product | Payroll without books, sales tax or year-end forms is not a product a US owner can use |

## 4. Design

### 4.1 Country as a first-class property of a business

- `company.country` is `IN` or `US`, set when the business is created and never
  changed afterwards (a different country is a different business). Every tool,
  contract entry, chat intent and screen is tagged with the countries it serves;
  `assistantTools()` and the app hide the others. An Indian business sees exactly what it
  sees today.
- Currency and minor unit come from the country: `INR`/paise or `USD`/cents. The ledger
  keeps integer minor units as now; `paise()`/`rupees()` become `minor()`/`major()` with
  the old names kept as aliases for the Indian code paths. Formatting (`en-IN` lakh
  grouping with ₹, `en-US` with $) is chosen by the business, in the engine's words and
  in the app.
- The year: the rules package gains `yearOf(country, date)` (April–March or
  January–December) and the deadline engine takes the calendar from the country.
- The rules registry gains a `us` module tree: `us.federal.*` and `us.<state>.*`
  records with the same shape (id, value, effectiveFrom/To, act, section, source,
  attestations). Attestation roles stay `advisor` and `firm`; the advisor for US rules
  is a CPA or enrolled agent named by the owner.
- Secrets, documents, audit and the gate are shared and unchanged.

### 4.2 Books and invoicing (US)

- A US chart of accounts: Sales, Sales tax payable (by jurisdiction), Receivables,
  Payables, Bank, Cash, expense heads mapped to Schedule C lines, Payroll liabilities
  (federal withholding, FICA, FUTA, state withholding, SUTA), Wages, Contractor payments.
- Invoices carry a ship-to/service address; sales tax is computed only when the owner has
  told MyCA the rate (or a rate provider has, through the gate) for that jurisdiction.
  MyCA never guesses a rate: a sale to a jurisdiction with no rate recorded is held, as a
  held GSTR-1 invoice is today. Exemption certificates are recorded on the customer.
- Bills and expenses have no input credit; a vendor flagged as a contractor accumulates
  towards the 1099-NEC threshold, and W-9 details (TIN, name, entity type) are stored
  under the credential vault rules for sensitive identifiers.
- Imports: QuickBooks and Xero CSV exports, and OFX/QFX/CSV bank statements, through the
  same held-by-hash import path.

### 4.3 Sales tax

- Nexus is declared by the owner per state (where they collect). Each state's filing
  frequency and due dates are dated rules; the return for a period is drafted from the
  invoices (taxable, exempt, tax by jurisdiction) and reviewed step by step like the GST
  return. Filing stays outside MyCA until a provider is connected; recording the
  confirmation number is the same `record_filing` flow.
- Rates: the owner enters them, or a rate service (Avalara, TaxJar, Stripe Tax) supplies
  them through a gated adapter. Decision for the owner (section 9).

### 4.4 Payroll

- Employees carry a W-4 (2020 form fields: filing status, multiple jobs, dependents,
  other income, deductions, extra withholding), work state and residence state, pay
  frequency, and exemptions. Federal withholding uses the Publication 15-T percentage
  method tables as dated rules per year. FICA, Additional Medicare and FUTA are dated
  federal rules with their wage bases. State income tax starts with the nine states that
  levy none and then adds states by their published withholding tables, each a dated
  rule; SUTA uses the employer's assigned rate and the state wage base. Every figure is
  shown with its rule and attestation state, as today.
- Postings, approval, payment and payslips reuse `payroll.mjs` with a US branch; year-end
  produces W-2/W-3 and 1099-NEC/1096 drafts; quarterly 941 and state returns are drafted
  and reviewed. Deposits follow the IRS schedule (monthly or semi-weekly by lookback) as
  deadline rules. E-filing goes through a provider behind the gate when one is chosen.

### 4.5 Owner's income tax

- For a sole proprietor or single-member LLC: Schedule C figures from the books and
  quarterly estimated tax reminders (1040-ES) from the federal brackets as dated rules.
  Full 1040 preparation is out of scope; the CPA export (a QuickBooks-compatible file,
  the US analogue of the Tally file) is in scope.

### 4.6 Chat and app

- Intent parsers get a country: amounts in `$`, "sales tax 8.25%", US date forms, no
  lakh/crore. The review, Taxes, Employees and payroll screens get US card sets; the
  rest of the app is unchanged. Locale `en-US` for formatting.

### 4.7 Hosting and data

- The same API deployed in a US region (Cloud Run + Cloud SQL in `us-central1` or
  `us-east1`); a business's data lives in its country's region. Privacy: state privacy
  acts (CCPA/CPRA and others) instead of the DPDP Act; a US privacy notice and data
  safety form for the Play listing in the US.

## 5. Phases

| Phase | Delivers to a US owner | Depends on |
|---|---|---|
| U0 Country-aware core | Country on the business, currency and calendar per country, `us` rules namespace, tools and screens gated by country, `$` formatting; India unchanged and its suites still green | Nothing; about a week |
| U1 Books, invoicing, imports, CPA export | Keep books, raise invoices with owner-entered sales tax, track contractors towards 1099s, import bank and QuickBooks/Xero files, hand the CPA an export | U0; two to three weeks |
| U2 Sales tax returns | Nexus per state, rates from the owner or a provider, state returns drafted and reviewed, confirmation recorded | U1; a rate/filing partner decision; two to three weeks |
| U3 Payroll | Federal withholding, FICA, FUTA, no-income-tax states first, postings, payslips, 941 and W-2/1099 drafts; more states added one by one | U1; a US CPA for attestation; four to six weeks for federal plus the first states |
| U4 Owner's taxes | Schedule C summary, estimated tax reminders | U1; one to two weeks |
| U5 Hosting in the US and the store listing | US region, privacy notice, listing | Cloud project and billing; one week plus review time |

The estimate is engineering effort with the rules verified as they are added; the
largest unknown is state-by-state payroll, which never ends and should be scoped to the
states the first US customers are in.

## 6. What stays out, deliberately

Full 1040/1120 preparation, state corporate income tax, inventory valuation methods,
multi-currency within one business (an Indian business invoicing in dollars is option C
above and can be added to the Indian edition separately), Canada or any third country,
and anything where MyCA would have to guess a rate or a threshold.

## 7. Statutory care

Every US figure is a dated rule with its citation (Internal Revenue Code section, IRS
publication and year, state statute or notice), golden cases, and no attestation until a
US CPA or enrolled agent signs it off; the "not reviewed" sentence appears exactly as it
does for Indian rules. Figures confirmed on 2026-10-13 from published 2026 guidance, to
be re-read from the IRS text before encoding: Social Security wage base $184,500; FICA
6.2% and 1.45%; FUTA 6.0% on $7,000 with the 5.4% credit; standard deduction $16,100
single and $32,200 married filing jointly; 1099-NEC threshold $2,000; Publication 15-T
2026 updated for the One Big Beautiful Bill Act.

## 8. Risks

- Scope: "all fifty states" for sales tax and payroll is a product line, not a phase.
  The first customers' states decide the order.
- Trust: a US owner relies on withholding being right; attestation by a CPA is not
  optional before a US payroll pilot.
- Dilution: the Indian product is at about 78% of its PRD with live filing still
  pending on outside parties; US work competes for the same engineering time. Phase U0
  is small and safe; U1 onward is a choice about focus.
- Data: W-9 TINs and SSNs on W-4s are sensitive identifiers; they go in the vault, never
  in `state.json`, logs or exports beyond the forms that need them.

## 9. Decisions the owner must make before U1

1. Who is the first US customer, in which state, and what do they sell (goods, services,
   both)? This fixes the sales tax and payroll order.
2. Is MyCA the seller of record for anything in the US, or only the owner's bookkeeper?
   (Bookkeeper is assumed; the other changes the liability model, as the TaxMeow memo
   said for India.)
3. Rates and filing partner for sales tax: owner-entered only, or a provider (Avalara,
   TaxJar, Stripe Tax)? Payroll e-filing: a provider or paper/portal with recorded
   confirmations?
4. The US CPA or enrolled agent who attests the rules.
5. The US legal entity and the GCP project/region for US data; who pays for it.
6. Whether the app ships as the same Play listing with a country choice, or a separate
   US listing.

## 11. U1 as built (2026-10-13)

Built without waiting for the six decisions, on these stated assumptions: MyCA is the owner's
bookkeeper, not a seller of record; sales tax rates are entered by the owner per jurisdiction
and never guessed; every federal figure is a dated rule marked as not reviewed until a US CPA
attests it; one Play listing with a country choice; hosting unchanged.

- `platform/src/us-sales.mjs`: jurisdiction rates (`set_sales_tax_rate`, dated, per code such
  as `TX` or `TX-AUSTIN`, `list_sales_tax_rates`); US invoices through the shared
  `create_invoice` (the rate in force on the invoice date, or exempt with a reason; lines may be
  non-taxable; sales tax posted to 2110 Sales tax payable); US bills through `create_purchase`
  with `salesTaxPaid` as part of the cost and no input credit; expenses ignore GST fields;
  contractors (`set_contractor`, W-9 details with only the last four digits of the TIN) and
  `contractor_payments` against the dated rule `us.federal.1099-nec.threshold` ($600 to 2025,
  $2,000 from 2026 under P.L. 119-21 §70433, unattested).
- Chat: "sales tax rate TX 6.25%", "invoice Cafe Luna 500 for wedding cake, tax TX-AUSTIN",
  "... tax exempt (resale certificate)", "bill from Flour Mill Co 300 for flour plus tax 24.75",
  "Joe Plumbing is a contractor, W-9 received", "who needs a 1099 for 2026?".
- Documents and exports: the invoice document and PDF carry subtotal, sales tax and jurisdiction
  with no GSTIN or HSN expectations; the entries CSV for a US business has
  `subtotal, sales_tax, total` columns instead of GST heads.
- App: the sale form asks for the jurisdiction (chips from the recorded rates) or an exemption
  with its reason, the bill form takes the sales tax paid; quotes stay Indian for now.
- Not built in U1: QuickBooks/Xero imports (bank CSV import is the shared one), a dedicated
  CPA pack beyond the entries CSV and Tally-free exports.

## 12. U2 as built (2026-10-13)

Owner-entered only; no rate or filing provider is connected (decision 3 in section 9 still
open). Filing stays outside MyCA.

- `platform/src/us-sales-tax.mjs`: the owner declares where they collect (`set_sales_tax_nexus`:
  state, monthly/quarterly/annual, from, permit number); `sales_tax_return` drafts a state's return
  for a period from the invoices whose jurisdiction is in that state (gross, exempt, non-taxable,
  taxable, tax by jurisdiction and rate, payments, to pay), with the due date from a dated rule
  where one exists (`us.salestax.due.TX` the 20th of the month after, `us.salestax.due.CA` the
  last day of the month after; both unattested) and no date at all for other states;
  `sales_tax_review` walks sales, tax and approval bound to a draft hash like the GST and TDS
  reviews; `record_sales_tax_payment` posts Dr 2110 / Cr bank or cash; `record_sales_tax_filing`
  stores the state's confirmation in the shared `filings` list as `SALES_TAX_<ST>`;
  `sales_tax_overview` feeds the app. Exempt invoices keep their jurisdiction so they count as
  exempt sales on the state's return.
- Chat: "I collect sales tax in TX, quarterly", "sales tax return TX", "review sales tax for TX",
  "paid sales tax to TX for Q3", "filed sales tax for TX for Q3, confirmation 778899",
  "what sales tax do I owe?".
- App: Home shows a Sales tax panel for a US business (replacing the Indian taxes panel) that
  opens the Sales tax screen: states with their latest period, review (the shared review screen),
  record a payment, record the filing, add a state.
- Not built: state-specific period calendars (New York's non-calendar quarters), prepayment and
  accelerated schedules, local return splits, a provider adapter, and a filing pack per state.

## 10. Recommendation

Approve option A and phase U0 now: it is a week, it does not change anything an Indian
owner sees, and it is the groundwork every later phase needs. Decide the six questions
above, then approve U1. Do not start U2 or U3 before a US CPA is named.
