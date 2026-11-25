# India tax software: MyCA against Winman and ClearTax (2026-11-25)

Owner: product and tax-engineering lead, India. Base: `develop`.

## What was read, and how far to trust it

- **Winman** (winmansoftware.com): the home page only. It lists three products, Winman CA-ERP (income tax and financial statements), Winman GST and Winman TDS. The page does not name ITR forms, show prices or say whether the software is desktop or cloud. Claims on the page: 300+ built-in warnings and data checks, 1-click Tally import, auto flow from the income-tax computation to Form 3CD and from the trial balance to the ITR and balance sheet, 77 lakh ITRs filed last year, used by all Big 4 audit firms, 98% renewal. Product sub-pages were not readable, so anything beyond this is unconfirmed.
- **ClearTax** (cleartax.in): the home page, partly summarised. Self-filing and "Hire an Expert" filing (average 12 hours), filing by income type (salary, capital gains from 80+ brokers, F&O, business, freelance, ESOP/RSU, foreign income), Form 16, AIS and 26AS pre-fill, auto regime selection, Notice Protect, GST, TDS compliance, Vendor Management. Assisted plans: Basic ₹2,499, Premium ₹3,799, Elite ₹5,999, Luxe ₹14,999 (struck-through list prices roughly double). Self-filing prices were not shown.

Confirm both on the vendors' own pages before quoting anything in marketing.

## The audience is different

Winman sells to CA and audit firms who file for many clients. ClearTax sells to individuals and small businesses who file for themselves or pay for assisted filing. MyCA starts from the books of a small business, so the one it should out-do first is Winman's "trial balance to ITR and balance sheet" flow, and then ClearTax's price and speed for business owners.

## Does the India app support ITR-3 and ITR-4?

Before this change: **no**. The app compared the old and new regime (`prepare_itr`), answered ITR questions from a 37-source knowledge base (`itr_knowledge`) and checked any ITR-1 to ITR-6 JSON against the CBDT schema (`check_itr_json`). It did not build an ITR-3 or ITR-4 return.

After this change (tool `build_itr_json`, `platform/src/itr-return-builder.mjs`):

| | ITR-4 (Sugam) | ITR-3 |
|---|---|---|
| Who | Resident individual or HUF, income up to ₹50 lakh, presumptive 44AD or 44ADA | Individual or HUF with books of account (proprietor) |
| Income | 44AD at 6% digital and 8% other receipts, 44ADA at 50%, salary, interest and dividend, house property (not a loss) | Books profit to business income through disallowances and income-tax depreciation, salary, other sources, brought-forward business loss |
| Tax | Old or new regime (or the cheaper), rebate, cess, 234A, 234B, 234C, 234F, taxes paid, refund or balance | Same, plus surcharge |
| Form | Schedule BP, taxes paid, TDS lines, challans | Balance sheet, profit and loss, Schedule BP, Part B-TI and TTI, challans |
| Checks | Refuses turnover over the 44AD limit (₹2 crore, ₹3 crore when cash is within 5%), profit below the presumptive minimum, capital gains, foreign assets, directors, a house property loss, income over ₹50 lakh | Refuses a balance sheet that does not balance |
| Output | JSON checked against the CBDT schema for AY 2025-26 | Same |

Limits that remain, said plainly:

- The schema held is **AY 2025-26** only. For other years the JSON is built but marked unchecked; the official AY 2026-27 utility or schema must be loaded (owner or CA: download from the e-filing portal into `platform/src/itr-knowledge/forms`).
- The portal also runs its Category A and B validation rules. ITR-4 has six of them encoded here; the other rules, and every ITR-3 rule, are not run.
- ITR-3 does not build capital gains, house property loss, loss set-off schedules, Schedule 112A, Schedule FA, Schedule AL, 80G donations, manufacturing or trading accounts, partner-firm schedules, or the tax audit report data. Those go through the portal utility.
- Inputs are typed or supplied by the caller. Reading the trial balance and balance sheet straight from MyCA's books into this tool is the next step (see the backlog).
- 234C ignores capital gains and lottery income exceptions in ITR-3 inputs, and 234B/234A treat tax paid at filing as paid on the filing date.
- Not CA-reviewed. A CA must check the figures before upload.

## Gap matrix

Status: **Ahead** = MyCA does it and the rival does not or does it worse. **Parity**. **Built now** = closed in this change. **Gap**.

| Capability | Winman | ClearTax | MyCA | Status |
|---|---|---|---|---|
| ITR-4 (presumptive) JSON | Yes (assumed) | Not on home page | `build_itr_json` | Built now |
| ITR-3 (books) JSON | Yes (assumed) | ITR-3 page linked | `build_itr_json`, basic | Built now, narrower than rivals |
| ITR-1, ITR-2 build | Assumed | Yes (ITR-2 page) | Knowledge and JSON check only | Gap |
| ITR-5, ITR-6, ITR-7 build | Assumed | Not stated | Knowledge and JSON check only | Gap |
| Schema check of the upload JSON | Not stated | Not stated | Yes (`check_itr_json`, ITR-1 to 6) | Ahead |
| Plain-language ITR rules (A/B/D defects) | "300+ warnings" | "100% accuracy" claim | 363 ITR-4 rules readable, 6 run | Parity at best |
| Regime comparison | Not stated | Auto regime | `prepare_itr` and `build_itr_json` regime "auto" | Parity |
| Form 16, AIS, 26AS import | Customer quote: AIS to Excel and compare | Pulled and pre-filled | 26AS credits, AIS text, TDS credit check | Parity |
| Capital gains import from brokers | Not stated | 80+ brokers | Quicko APIs wired; no broker file import | Gap |
| Trial balance to ITR and balance sheet | Headline feature | Not stated | Books exist; not yet wired into the builder | Gap (next) |
| Income-tax computation to Form 3CD / tax audit | Headline feature | Not stated | Not built | Gap |
| Tally import | 1-click | Not stated | `import_tally`, `import_tally_xml` | Parity |
| Delegate to juniors / many clients | Yes | n/a | Client list, CA requests and approvals | Parity |
| GST returns (GSTR-1, 3B, 9, 2B reconciliation) | Yes | Yes | GSTR-1, 3B, 9 draft, 2B import, reconciliation, portal filing via Quicko | Parity |
| GST from Excel | Yes | Not stated | Excel imports | Parity |
| E-invoice and e-way bill | Not stated | Not on home page | IRN and e-way bill (NIC, Quicko) | Ahead |
| TDS returns, FVU, challan and short-deduction reports | Yes | "TDS Compliance" | `tds_return`, `generate_tds_fvu`, `tds_review`, TDS interest | Parity |
| Mass PAN status or challan verification | Yes | Not stated | Not built | Gap |
| Notice help | Not stated | Notice Protect | `ask_tax` and `itr_knowledge`; no notice workflow | Gap |
| Filing by income type walkthrough (ESOP, foreign, F&O) | Not stated | Yes | Not built | Gap |
| Books, invoicing, inventory, payroll, bank reconciliation | Not stated (ERP) | Not on home page | Full | Ahead |
| WhatsApp, offline billing, Hindi | No | Not stated | Yes | Ahead |
| Price | Not shown | ₹2,499 to ₹14,999 assisted | ₹999 to ₹5,999 a month | Different model |

## Backlog, by impact

1. **Wire the books into `build_itr_json`** (profit and loss, balance sheet, depreciation register, 40A/43B items) so a MyCA user gets the ITR-3 with one command. This is Winman's headline flow.
2. **Load the AY 2026-27 schema and rules** so returns for the current year are checked.
3. **Form 3CD / 44AB audit data** from the books and the income-tax computation, for CA firms.
4. **ITR-1 and ITR-2 builders** for salaried clients of CA firms and for ClearTax's individual customers, including capital gains from broker statements (Quicko).
5. **Run all ITR-4 and ITR-3 Category A rules** in the checker instead of six.
6. **Notice workflow** (read the notice, find the section, draft the reply, deadline).
7. **PAN status and challan verification in bulk** for TDS.

## Needs the owner or a CA

- Official AY 2026-27 JSON schema and Excel utility files.
- A CA to review the ITR-3 and ITR-4 outputs on real returns, in particular the 234B/234C working and the ITR-3 depreciation and disallowance fields.
- Competitor pages beyond the home pages (Winman product pages, ClearTax plan details) before any public comparison.
