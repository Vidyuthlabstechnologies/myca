# D4: several GSTINs under one business

Date: 2026-10-16. Status: built 2026-10-16 (steps 1 to 5 in the platform; the owner decided transfers at cost by default and no retiring with open documents); step 6, the app, follows. Part of the
[D2C programme](2026-10-16-d2c-programme.md).

## 1. The problem

A brand that keeps stock in Amazon or Flipkart fulfilment centres is registered in each
of those states as an additional place of business (APOB) under its own GSTIN. Today the
product models one GSTIN per business and treats a branch as a separate business
(cloud backend design, 2026-10-06). That works for a shop with two branches whose owner is
happy to switch books; it fails for a marketplace brand because the same order stream,
the same settlements and the same SKU costs belong to one business whose GST filings
split by the state the goods shipped from. Five registrations as five businesses means
five imports of every report and no combined view of cash, margins or receivables.

## 2. The rule

One business, many registrations. A registration is `{ gstin, state, kind, label,
effectiveFrom, effectiveTo }` with `kind` one of `principal`, `apob`, `warehouse`,
`branch`. The principal registration is the one `company.gstin` names today, so a business
with no registrations recorded behaves exactly as now. Every GST document names the
registration it was issued under; every GST return is drafted per registration; the
ledger, the bank, the SKU costs, the cash forecast and the daily close stay one set.

## 3. Data model

| Where | Change |
|---|---|
| `company.registrations` | New array; the principal is implied by `company.gstin` and `company.state` and is listed first with `kind: 'principal'`. |
| `invoice.registrationGstin`, `purchase.registrationGstin`, credit and debit notes | New field, defaulted to the principal GSTIN on creation and on load of older books. The supplier state used for CGST/SGST against IGST becomes the registration's state, not `company.state`. |
| `invoice.orders[].shipFromState` | From the order report ("Fulfillment Center", "Seller warehouse state") when the channel gives it; the registration is chosen by that state, else the principal. |
| Settlements | Unchanged (a payout covers every registration). Fees, TCS and TDS post to the one ledger. TCS from the portal statement is per operator and per *our* GSTIN, so `tcsStatements` gain `ourGstin` and the GST payment uses TCS per registration. |
| Stock transfers | `record_stock_transfer` moves stock from one registration's location to another's: raises a transfer invoice (taxable supply between distinct persons at cost or the open-market value the owner states), posts IGST output on the sending registration and input credit on the receiving one, and raises the e-way bill need from the dated threshold rule. |
| Returns | Drafted per registration: `gstr1_draft`, `export_gstr1_json`, `gstr3b`, the review and the payment take `gstin`; "all" gives the combined view with a line per registration. `documentsForPeriod` filters by registration. |
| Input credit | Per registration: `1200`–`1202` stay one set in the ledger (the books are one), but the GST set-off runs per registration from documents, and credit is never set off across registrations. |
| Filings | `record_filing` takes `gstin`; the deadline run lists every registration's returns. |
| E-invoice and e-way bill | The NIC session key already binds credentials to a taxpayer; each registration carries its own NIC credentials in the vault. |

## 4. What stays the same

- One ledger, one bank, one cash forecast, one SKU master, one settlement stream, one
  daily close.
- A business with a single GSTIN sees no change anywhere: no new field is required, no
  screen changes, every tool defaults to the principal.
- The book view: `company` is already a book key; `registrations` lives inside it, so no
  new top-level key.

## 5. Order of work

1. `registrations` on the company with validation (GSTIN checksum, state matches the
   GSTIN's first two digits, no two active registrations in one state), `set_registration`
   and `registrations` tools, the principal implied.
2. `registrationGstin` on every GST document, defaulted; the supplier state for the GST
   split taken from the registration; the migration on load.
3. Returns and the review per registration, with "all" as the combined view; filings per
   registration; the deadline run per registration.
4. Marketplace orders choose the registration from the ship-from state; TCS statements by
   our GSTIN; the GST payment per registration.
5. Stock transfers between registrations with the transfer invoice and the e-way bill
   need.
6. The app: a registration picker on Taxes, a line per registration on the returns, the
   transfer flow on Stock.

Each step is a pull request with its own tests; step 2 is the one that touches the most
files (22 files read `company.gstin` or `company.state` today) and is done in one pass
behind a helper `registrationOf(state, doc)` so no call site reads the company directly.

## 6. Decisions for the owner

- Whether the transfer invoice between registrations is at cost or at a stated value by
  default (the law requires open-market value or a declared value; cost is the common
  practice for stock transfers with full credit on the other side).
- Whether a registration can be retired with open documents (the design says no: close
  the period first).
