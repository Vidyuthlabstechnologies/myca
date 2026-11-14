# MyCA competitive gap matrix (2026-11-14)

Owner: head of product, competitive excellence. Base: `develop` at 85cac29 plus the Malaysia launch branch.
Pricing stays premium (owner's choice), so MyCA has to win on depth, trust and doing the work for the user, not on price.

How to read the status column:

- **Ahead**: MyCA does it and the named rivals do not, or do it worse.
- **Parity**: MyCA matches the best rival.
- **Built now**: was a gap, closed in this change (PR "Competitive gaps: UAE payroll, UK allowances and CIS, US refund booster").
- **Gap**: still missing. The backlog at the end orders these by impact.

Sources are listed per country. Prices are list prices seen on 2026-11-14 in secondary summaries; confirm on the vendor's site before quoting them in marketing. No app-store ratings are quoted where they could not be checked.

## Where every rival is weak (MyCA's common edge)

1. **Rivals make the user do the tax work; MyCA prepares it from the books and explains it.** Every rival in all five markets is either a ledger (Zoho, Xero, QuickBooks, Vyapar, Bukku) or a filing form (TurboTax, GoSimpleTax). None has an assistant that only chooses tools while deterministic engines own every figure, with dated, sourced rules.
2. **Upselling is the most common complaint** (TurboTax, H&R Block, Zoho tiers, Xero invoice caps). MyCA's plans list every feature up front; keep it that way.
3. **Data-upload friction** (Clear GST: Tally/ERP data must match its template). MyCA imports Tally, Zoho, POS and marketplace files directly.
4. **Rules lag behind law changes.** MyCA's rule records carry effective dates and a watch list; `scripts/rules-watch.mjs` flags gaps.

## India (rivals: ClearTax/Clear GST, Vyapar, Zoho Books, myBillBook, TallyPrime)

| Rival | Price | Strongest at | Users complain about |
|---|---|---|---|
| Clear GST | Enterprise quotes | GSTR-1 and IRN uploads, 2B reconciliation, support (Capterra 4.5/5, 30 reviews) | template-bound uploads, GSTR-9/9C and 26AS gaps, PAN-level reports cost extra, no Excel GSTR-3B |
| Vyapar | from about ₹699/yr mobile | offline billing, huge user base | desktop/extra devices cost more, no browser app |
| myBillBook | ₹3,490 to ₹3,990/yr, Enterprise from about ₹6,840 | mobile-first billing | single user on entry plan; e-invoice, POS, multi-user only on Enterprise |
| Zoho Books | about ₹8,988/yr + GST | full accounting, GST returns | price, weak retail inventory |
| TallyPrime | ₹22,500+ once + about ₹4,500/yr | depth, CA familiarity | desktop-bound, steep for shop owners |

| Capability | MyCA | Status |
|---|---|---|
| GST invoices, e-invoice IRN, e-way bill (via Quicko) | yes | Parity |
| GSTR-1, GSTR-3B save/offset/file, GSTR-9 | yes | Ahead of Clear on 9 |
| GSTR-2B/IMS reconciliation, 26AS/TDS credits | yes | Ahead (Clear users report 26AS gaps) |
| Tally, Zoho, POS, marketplace imports | yes | Ahead |
| Assistant that files and explains (ask_tax, tax_plan, ITR knowledge) | yes | Ahead |
| UPI payment request on invoices, WhatsApp reminders | yes | Parity |
| Quotes, delivery challans, purchase orders, restock | yes | Parity |
| CA-firm multi-client books, CA review | yes | Ahead |
| Barcode scan item lookup and fast counter (POS) billing | no | Gap (Vyapar, myBillBook) |
| Thermal (58/80 mm) receipt printing | no | Gap (Vyapar, myBillBook) |
| Full offline billing on the phone | partial (desktop is local) | Gap on Android (Vyapar) |
| App in Hindi and regional languages | no | Gap (Vyapar, myBillBook) |
| Loyalty points, online catalogue/store link | no | Gap (myBillBook, Vyapar) |

## United States (rivals: TurboTax, H&R Block, FreeTaxUSA, Cash App Taxes)

| Rival | Price (federal / state) | Strongest at | Users complain about |
|---|---|---|---|
| TurboTax | $0 simple, Deluxe about $90, Self-Employed about $130 / about $65 per state | interview guidance, W-2 photo, brokerage import, max refund promise, Live CPA | aggressive upsells, highest price, narrow free tier |
| H&R Block | $0, Deluxe about $75, SE about $115 / about $45 | offices, W-2 photo, broader free tier | audit defense is paid extra |
| FreeTaxUSA | $0 federal / $14.99 state | everything federal free | no photo import, plain interface |
| Cash App Taxes | $0 / $0 | free audit defense, no upsells | no multi-state, some forms missing, needs Cash App |

| Capability | MyCA | Status |
|---|---|---|
| Form 1040 with Schedules 1, 1-A, 2, 3, A, B, C, D, SE, EIC, 8812, 8863, 8949, 8959, 8960, 8995 | yes | Parity for common returns |
| 2025 OBBBA deductions (tips, overtime, car loan interest, seniors) | yes | Parity |
| Read a tax document from a photo (`read_us_tax_document`) | yes | Parity |
| Business books feed Schedule C directly | yes | Ahead (rivals re-key it) |
| Withholding check and estimated payments planner | yes | Ahead of FreeTaxUSA/Cash App |
| **Refund booster: unused deductions and credits priced by re-running the return** | `us_refund_boost` | **Built now** (answers TurboTax's max-refund promise, with the dollar value shown) |
| E-file through embedded partner (Column Tax / April) | built, partner unsigned | Gap until signed |
| Brokerage / crypto CSV import (1099-B) | manual forms | Gap (TurboTax) |
| Prior-year return import (PDF) | no | Gap (TurboTax, H&R Block) |
| Amended return 1040-X | no | Gap |
| Form 2441 child care credit, 8962 premium tax credit, Schedule E rentals | coming | Gap |
| State returns | state sheet only | Gap |
| Audit defense / letter help | IRS letter reader in Plus | Partial |

## United Kingdom (rivals: FreeAgent, Xero, QuickBooks, GoSimpleTax, Sage)

| Rival | Price | Strongest at | Users complain about |
|---|---|---|---|
| FreeAgent | £19 sole trader (free with NatWest/RBS/Mettle) | tax timeline, SA estimate, CIS, mobile app | one user, fewer integrations |
| Xero | £15 / £28 / £38 | reporting, ecosystem, multi-business | 10 to 20 invoice cap on entry tier, no CIS, desktop-first, Hubdoc separate |
| QuickBooks | £15 / £26 / £30 | mobile receipts, swipe to categorise, GPS mileage | weaker reporting, category limits |
| Sage | free individual tier, £7 to £32 | free MTD IT, agent tools | dated, clunky mobile |
| GoSimpleTax | about £10 | SA forms for spreadsheet users | bridging only |

| Capability | MyCA | Status |
|---|---|---|
| HMRC MTD VAT and MTD Income Tax (quarterly updates, final declaration, fraud headers) | yes, sandbox | Parity; live waits for HMRC production credentials |
| SA estimate with Scottish rates, Class 4, student loan, HICBC, CGT, payments on account | yes | Ahead of most |
| Tax calendar, penalty points, late payment interest | yes | Parity with FreeAgent |
| VAT return from the books, credit notes | yes | Parity |
| **Simplified expenses (mileage, working from home, living at premises) and trading allowance check** | `gb_simplified_expenses` | **Built now** |
| **CIS deductions summary with wrong-rate check** | `gb_cis_deductions` | **Built now** (Xero has no CIS) |
| Open Banking bank feeds | no | Gap (all rivals) |
| Receipt photo OCR into expenses | India engine only | Gap for UK screens |
| GPS mileage tracking | no | Gap (QuickBooks) |
| UK property income (landlords) quarterly updates | engine accepts uk-property updates | Partial: no property ledger |
| Payroll / RTI | no | Gap (Sage, QuickBooks, FreeAgent) |

## United Arab Emirates (rivals: Zoho Books UAE, Wafeq, QuickBooks)

| Rival | Price | Strongest at | Users complain about |
|---|---|---|---|
| Wafeq | AED 57/mo Starter | Arabic-first, accredited ASP generating PINT AE, CT automation, unlimited users, payroll in Premium | smaller ecosystem |
| Zoho Books | AED 60/mo Standard | direct EmaraTax VAT filing, banks (Wio, Mashreq), ecosystem | invoice caps, per-user pricing, no cost centres, payroll separate per head (per Wafeq) |
| QuickBooks | varies | familiarity | not UAE-first |

| Capability | MyCA | Status |
|---|---|---|
| VAT 201 by emirate from the books, credit notes | yes | Parity |
| Corporate tax estimate with SBR, QFZP, losses | yes | Parity with Wafeq |
| PINT AE e-invoice build and check | yes (sandbox ASP) | Parity once an ASP is signed |
| Full Arabic answers (lang ar) | yes | Parity with Wafeq |
| Penalty estimator (2026 schedule), deadlines | yes | Ahead |
| **End-of-service gratuity (Art. 51) with books liability** | `ae_gratuity` | **Built now** |
| **WPS salary information file (SIF) with IBAN and total checks** | `ae_wps_file` | **Built now** (Zoho charges per employee for payroll) |
| Direct EmaraTax filing | no API exists | Not possible for anyone but Zoho's partnership; MyCA prepares |
| Bank feeds (Wio, Mashreq) | no | Gap |
| Full payroll run (leave, payslips) | no | Gap |
| Cost centres / project profitability | no | Gap (Wafeq) |

## Malaysia (rivals: Bukku, SQL Account, AutoCount, Xero)

| Rival | Price | Strongest at | Users complain about |
|---|---|---|---|
| Bukku | RM0 to RM135/mo (+SST), unlimited users | cloud, LHDN e-invoice on every plan, WhatsApp invoices, receipt extraction | lighter inventory, usage caps |
| SQL Account | RM1,500 to RM3,500+ once + RM250 to RM600/yr | MyInvois API, payroll add-on (PCB, EPF, SOCSO, EIS) | Windows-bound, premium price |
| AutoCount | RM1,200 to RM3,200+ once, cloud RM150 to RM280/mo | inventory, plugins, e-invoice | e-invoice stops when support lapses |
| Xero | about USD 20/mo | ecosystem | e-invoice not native, per-seat cost |

| Capability | MyCA | Status |
|---|---|---|
| MyInvois e-invoice issue, cancel, status, TIN check | yes | Parity |
| Consolidated and self-billed e-invoices, received e-invoices, reject | yes (Malaysia launch branch) | Parity |
| SST-02 return, SST registration test | yes | Ahead of Xero |
| Income tax estimate | yes | Ahead |
| Bilingual (English, Malay) | yes (launch branch) | Parity |
| Payroll statutory (EPF, SOCSO, EIS, PCB) | no | **Top gap**; needs the official SOCSO/EIS tables, which are stepped and not a formula |
| Bank feeds and receipt extraction | no | Gap (Bukku) |
| Inventory with batches/serials | basic | Gap (AutoCount) |

## Backlog ordered by impact

| # | Country | Gap | Why it matters | Suggested owner |
|---|---|---|---|---|
| 1 | US | Sign the e-file partner and add 1099-B/crypto CSV import | No filing, no revenue; investors are the users TurboTax upsells hardest | US launch thread + owner |
| 2 | Malaysia | Payroll statutory (EPF Third Schedule, SOCSO and EIS tables, PCB) | SQL Account's payroll add-on is the main reason SMEs stay on desktop | Malaysia thread, from the official KWSP/PERKESO/LHDN tables |
| 3 | India | Barcode counter billing and thermal printing on Android | Retail shops pick Vyapar/myBillBook for this alone | India mobile thread |
| 4 | UK | Open Banking bank feeds and receipt OCR on UK screens | Every rival has them; quarterly MTD updates need categorised bank lines | UK thread (TrueLayer or Yapily via a cloud port) |
| 5 | India | Hindi and regional-language app | Vyapar's growth came from it | Design system thread |
| 6 | US | Prior-year import, 2441, 8962, Schedule E, 1040-X, states | Common returns that now bounce to a rival | US engine thread |
| 7 | UAE | Bank feeds (Wio, Mashreq) and a full payroll run on top of WPS/gratuity | Zoho's bank links; Wafeq's payroll | UAE thread |
| 8 | UK | Payroll RTI, GPS mileage | QuickBooks and Sage keep sole traders who hire | UK thread |

## Sources

- India: [Capterra Clear GST reviews](https://www.capterra.com/p/265637/ClearTax-GST/reviews/), [Accountune myBillBook alternatives 2026](https://accountune.com/mybillbook-alternatives) (published by a competitor).
- US: [Wealthvieu best tax software 2026](https://wealthvieu.com/best-tax-software/) (prices marked illustrative by the page).
- UK: [IFA comparison of MTD sole-trader software](https://ifa.momentummedia.com.au/features/mtd-sole-trader-software-comparison), [Landolio MTD software comparison](https://landolio.pages.dev/mtd-software-comparison); simplified expenses and CIS rates from [GOV.UK simplified expenses](https://www.gov.uk/simpler-income-tax-simplified-expenses) and [GOV.UK CIS](https://www.gov.uk/what-is-the-construction-industry-scheme).
- UAE: [Wafeq vs Zoho Books](https://www.wafeq.com/en-ae/wafeq-vs-zoho-books) (Wafeq's own claims); gratuity per [Zoho Payroll Academy, Art. 51](https://www.zoho.com/en-ae/payroll/academy/compliance/uae-gratuity-by-tenure.html) and [Gulf News on unpaid leave](https://gulfnews.com/living-in-uae/ask-us/unpaid-leave-days-will-not-be-included-in-gratuity-calculation-mohre-1.1673617486269); SIF layout per [Mashreq WPS file format](https://netbanking.mashreqbank.com/B001/WPS_File_Format_eng.html).
- Malaysia: [MakerStack Bukku review](https://makerstack.co/reviews/bukku-review/) (affiliate-funded), [KC Group price guide 2026](https://kcgroup.biz/accounting-software-price-malaysia-2026/) (a reseller).
