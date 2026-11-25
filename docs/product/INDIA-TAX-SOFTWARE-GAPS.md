# India tax software: MyCA against Winman and ClearTax (2026-11-25)

Owner: product and tax-engineering lead, India. Base: `develop`.

## What was read, and how far to trust it

- **Winman** (winmansoftware.com): the home page only. It lists three products, Winman CA-ERP (income tax and financial statements), Winman GST and Winman TDS. The page does not name ITR forms, show prices or say whether the software is desktop or cloud. Claims on the page: 300+ built-in warnings and data checks, 1-click Tally import, auto flow from the income-tax computation to Form 3CD and from the trial balance to the ITR and balance sheet, 77 lakh ITRs filed last year, used by all Big 4 audit firms, 98% renewal. Product sub-pages were not readable, so anything beyond this is unconfirmed.
- **ClearTax** (cleartax.in): the home page, partly summarised. Self-filing and "Hire an Expert" filing (average 12 hours), filing by income type (salary, capital gains from 80+ brokers, F&O, business, freelance, ESOP/RSU, foreign income), Form 16, AIS and 26AS pre-fill, auto regime selection, Notice Protect, GST, TDS compliance, Vendor Management. Assisted plans: Basic ₹2,499, Premium ₹3,799, Elite ₹5,999, Luxe ₹14,999 (struck-through list prices roughly double). Self-filing prices were not shown.

Confirm both on the vendors' own pages before quoting anything in marketing.

## The audience is different

Winman sells to CA and audit firms who file for many clients. ClearTax sells to individuals and small businesses who file for themselves or pay for assisted filing. MyCA starts from the books of a small business, so the one it should out-do first is Winman's "trial balance to ITR and balance sheet" flow, and then ClearTax's price and speed for business owners.

## Does the India app support ITR-3 and ITR-4?

Before 2026-11-25: **no**. The app compared the old and new regime (`prepare_itr`), answered ITR questions from a 37-source knowledge base (`itr_knowledge`) and checked any ITR-1 to ITR-6 JSON against the CBDT schema (`check_itr_json`). It did not build a return.

Now: **yes for ITR-1, ITR-2, ITR-3 and ITR-4** (tool `build_itr_json`). The full description of what each form covers, the inputs, the rules used and every open point is in `docs/product/INDIA-ITR-BUILDER.md`. In short:

| | ITR-1 | ITR-2 | ITR-3 | ITR-4 |
|---|---|---|---|---|
| Income | Salary, one house property, other sources, 112A up to ₹1.25 lakh | Salary (several employers, HRA), any number of house properties, capital gains of every kind, other sources | Books profit to business income, depreciation by block, salary, other sources, brought-forward business loss | 44AD and 44ADA, salary, interest, dividend |
| Books feed | n/a | n/a | Yes (`fromBooks`) | Yes (`fromBooks`) |
| Capital gains | 112A only | Full: holding periods, grandfathering, 23 July 2024 rates, section 50AA, indexation choice, losses | Same engine as ITR-2 | Refused |
| Loss set-off | Refused | Year and brought-forward, house property loss, carry-forward | Brought-forward business loss | Refused |
| Tax | Regime choice, rebate, cess, 234A/B/C/F | Plus special-rate tax and surcharge | Same | Same |
| Checked against the CBDT schema | AY 2025-26 | AY 2025-26 | AY 2025-26 | AY 2025-26 |

Limits that remain, said plainly:

- The schema held is **AY 2025-26** only. For other years the JSON is built but marked unchecked; the official AY 2026-27 utility or schema must be loaded (owner or CA: download from the e-filing portal into `platform/src/itr-knowledge/forms`).
- The portal also runs its Category A and B validation rules. ITR-4 has six of them encoded here; the other rules are not run.
- Not built: Schedule FA and FSI (foreign assets), Schedule AL (income above ₹50 lakh), Schedule 54 and 54F claims, ESOP schedule, partner-firm and tax-audit data, a business loss of the year set off against other heads, and the carry-forward loss schedule.
- Surcharge marginal relief is not computed when special-rate income is present.
- Not CA-reviewed. A CA must check the figures before upload.

## Gap matrix

Status: **Ahead** = MyCA does it and the rival does not or does it worse. **Parity**. **Built now** = closed in this change. **Gap**.

| Capability | Winman | ClearTax | MyCA | Status |
|---|---|---|---|---|
| ITR-4 (presumptive) JSON | Yes (assumed) | Not on home page | `build_itr_json` | Built now |
| ITR-3 (books) JSON | Yes (assumed) | ITR-3 page linked | `build_itr_json`, books feed, depreciation, capital gains, house property | Built now |
| ITR-1, ITR-2 build | Assumed | Yes (ITR-2 page) | `build_itr_json`, ITR-2 with capital gains and loss set-off | Built now |
| ITR-5, ITR-6, ITR-7 build | Assumed | Not stated | Knowledge and JSON check only | Gap |
| Schema check of the upload JSON | Not stated | Not stated | Yes (`check_itr_json`, ITR-1 to 6) | Ahead |
| Plain-language ITR rules (A/B/D defects) | "300+ warnings" | "100% accuracy" claim | 363 ITR-4 rules readable, 6 run | Parity at best |
| Regime comparison | Not stated | Auto regime | `prepare_itr` and `build_itr_json` regime "auto" | Parity |
| Form 16, AIS, 26AS import | Customer quote: AIS to Excel and compare | Pulled and pre-filled | 26AS credits, AIS text, TDS credit check | Parity |
| Capital gains import from brokers | Not stated | 80+ brokers | Quicko APIs wired; no broker file import | Gap |
| Trial balance to ITR and balance sheet | Headline feature | Not stated | `fromBooks` reads the P&L, balance sheet, advance tax and TDS | Built now |
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

Done: books into the builder, ITR-1, ITR-2, capital gains and house property in ITR-3, income-tax depreciation, capital gains engine.

1. **Load the AY 2026-27 schema and rules** so returns for the current year are checked.
2. **Run the portal's Category A rules** for every form, not six for ITR-4.
3. **Form 3CD / 44AB audit data** from the books, for CA firms.
4. **Broker capital gains import** (contract notes and statements) into `capitalGains.transactions`.
5. **Notice workflow** (read the notice, find the section, draft the reply, deadline).
6. **PAN status and challan verification in bulk** for TDS.
7. **Schedule FA, AL, 54/54F, ESOP, carry-forward loss schedule.**

## Needs the owner or a CA

- Official AY 2026-27 JSON schema and Excel utility files.
- A CA to review the outputs on real returns, in particular 234B/234C, depreciation, the capital gains rules and the order in which the ₹1.25 lakh 112A exemption is applied.
- Competitor pages beyond the home pages (Winman product pages, ClearTax plan details) before any public comparison.
