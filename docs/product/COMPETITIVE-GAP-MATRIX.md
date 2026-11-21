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
| Barcode scan item lookup and fast counter (POS) billing | yes (camera scan, `find_item`, Counter sale screen) | Built |
| Thermal (58/80 mm) receipt printing | yes (Bluetooth ESC/POS, engine figures only) | Built |
| Full offline billing on the phone | partial (desktop is local) | Gap on Android (Vyapar) |
| **App in Hindi and regional languages** | Hindi on a Hindi phone for home, new entry, counter sale and the fixed wording of the shared screens: cash, bank, reports, statements, repeating entries, reminders, expenses, parties and entry forms (`mobile/lib/india/india_strings.dart`) | **Partly built**: lines with a name or amount inside them, the taxes and payroll screens, server replies, a language switch in the app and other languages are still open; the Hindi needs a native review |
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
| Brokerage / crypto CSV import (1099-B) | `us_brokerage_csv` (broker 1099-B/8949 exports, exchange trades matched first in, first out) | **Built now** |
| Prior-year return import | `import_us_prior_year`: from last year's MyCA return, or typed figures from a return filed elsewhere | **Built now**; reading a rival's PDF is still open |
| Amended return 1040-X | `start_us_amended_return`, `set_us_amended_return`, `us_amended_return`: columns A/B/C, lines 1-23, deadlines and e-file eligibility | **Computed now**; transmitting it (MeF amended return) and an app screen are still open |
| Form 2441 child care credit, 8962 premium tax credit, Schedule E rentals | coming | Gap |
| State returns | `us_state_tax`: no return in the eight states with no income tax; a 2025 or 2026 estimate for Colorado, Georgia, Illinois, Kentucky, Louisiana, Michigan and North Carolina and a 2025 estimate for Arizona and Iowa from the federal return (Colorado and Iowa from federal taxable income, the rest from federal AGI), set against W-2 state withholding | **Started**: an estimate only, nine flat-rate states (Arizona and Iowa for 2025 only), no state subtractions or credits, no state form or e-file; the 2026 figures are the ones each state announced before its 2026 return and are marked provisional; the other states are open |
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
| Open Banking bank feeds | Built to the credential boundary: a UK business can link a bank through Plaid (country GB, read-only), and the transactions land as a bank statement to match against the books | **Built now**, off until the owner has Plaid UK access and saves the keys; receipt OCR on UK screens is still open |
| Receipt photo OCR into expenses | India engine only | Gap for UK screens |
| GPS mileage tracking | no | Gap (QuickBooks) |
| UK property income (landlords) quarterly updates | engine accepts uk-property updates | Partial: no property ledger |
| **Payroll calculation (PAYE by the HMRC computerised method, Class 1 NI by category letter, student loans, pensions, weekly or monthly)** | `gb_payroll_run` | **Built now** for 2026-27; RTI submission (FPS/EPS), payslip PDFs, directors' annual NI and statutory pay still open |

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
| Full payroll run (overtime, unpaid leave, GPSSA pension, gratuity accrual, WPS lines) | `ae_payroll_run` | **Built now**; payslip PDFs and annual leave balances still open |
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
| Payroll statutory (EPF, SOCSO, EIS, PCB) | `my_payroll` from the Third Schedule, the PERKESO RM100-band tables and LHDN's computerised PCB method (categories, children, bonus, year to date, zakat); `my_cp39_file` writes the CP39 text file for e-PCB Plus in LHDN's 2026 layout; PCB now checked against LHDN's 2026 specification and its worked example | **Built now**; wages of RM300 or less, SOCSO second category and the LINDUNG 24 Jam amount (from June 2026 the run only says it is due and at what rate) still open; the Malaysia app now has a payroll screen (employees, net pay, the month's totals) that saves the CP39 file; employees and the employer number come back next month from the phone's secure storage; the file has not been uploaded to e-PCB Plus, employees do not follow the user to another phone and the sandbox does not run payroll |
| Bank feeds and receipt extraction | no | Gap (Bukku) |
| Inventory with batches/serials | basic | Gap (AutoCount) |

## Backlog ordered by impact

| # | Country | Gap | Why it matters | Suggested owner |
|---|---|---|---|---|
| 1 | US | Sign the e-file partner (1099-B/crypto CSV import is built) | No filing, no revenue; investors are the users TurboTax upsells hardest | US launch thread + owner |
| 2 | Malaysia | PCB (monthly tax deduction) on top of the EPF/SOCSO/EIS payroll (BUILT, with the CP39 file for e-PCB Plus; and a payroll screen in the app that saves it; next: a real upload test and keeping employees on the server so they follow the user) | SQL Account's payroll add-on is the main reason SMEs stay on desktop | Malaysia thread, from the official KWSP/PERKESO/LHDN tables |
| 3 | India | Barcode counter billing and thermal printing on Android (BUILT) | Retail shops pick Vyapar/myBillBook for this alone | India mobile thread |
| 4 | UK | Receipt OCR on UK screens (Open Banking bank feeds are BUILT through Plaid, waiting on the owner's Plaid UK access) | Every rival has them; quarterly MTD updates need categorised bank lines | UK thread (TrueLayer or Yapily via a cloud port) |
| 5 | India | Hindi on every India screen and in MyCA's replies, then regional languages (home, new entry, counter sale and the fixed wording of the shared screens are BUILT) | Vyapar's growth came from it | Design system thread |
| 6 | US | 2441, 8962, Schedule E, 1040-X, states (prior-year import is BUILT) | Common returns that now bounce to a rival | US engine thread |
| 7 | UAE | Bank feeds (Wio, Mashreq); the full payroll run on top of WPS/gratuity is BUILT | Zoho's bank links; Wafeq's payroll | UAE thread |
| 8 | UK | RTI submission to HMRC on top of the payroll calculation (BUILT), GPS mileage | QuickBooks and Sage keep sole traders who hire | UK thread |

## Sources

- India: [Capterra Clear GST reviews](https://www.capterra.com/p/265637/ClearTax-GST/reviews/), [Accountune myBillBook alternatives 2026](https://accountune.com/mybillbook-alternatives) (published by a competitor).
- US: [Wealthvieu best tax software 2026](https://wealthvieu.com/best-tax-software/) (prices marked illustrative by the page).
- UK: [IFA comparison of MTD sole-trader software](https://ifa.momentummedia.com.au/features/mtd-sole-trader-software-comparison), [Landolio MTD software comparison](https://landolio.pages.dev/mtd-software-comparison); simplified expenses and CIS rates from [GOV.UK simplified expenses](https://www.gov.uk/simpler-income-tax-simplified-expenses) and [GOV.UK CIS](https://www.gov.uk/what-is-the-construction-industry-scheme).
- UAE: [Wafeq vs Zoho Books](https://www.wafeq.com/en-ae/wafeq-vs-zoho-books) (Wafeq's own claims); gratuity per [Zoho Payroll Academy, Art. 51](https://www.zoho.com/en-ae/payroll/academy/compliance/uae-gratuity-by-tenure.html) and [Gulf News on unpaid leave](https://gulfnews.com/living-in-uae/ask-us/unpaid-leave-days-will-not-be-included-in-gratuity-calculation-mohre-1.1673617486269); SIF layout per [Mashreq WPS file format](https://netbanking.mashreqbank.com/B001/WPS_File_Format_eng.html).
- Malaysia: [MakerStack Bukku review](https://makerstack.co/reviews/bukku-review/) (affiliate-funded), [KC Group price guide 2026](https://kcgroup.biz/accounting-software-price-malaysia-2026/) (a reseller).
