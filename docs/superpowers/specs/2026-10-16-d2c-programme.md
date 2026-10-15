# D2C and marketplace brands: decision memo and phased design

Date: 2026-10-16. Status: decided by the owner on 2026-10-16; D1 started the same day.

The owner's words: sell to whom Lighthaus sells, "but with full service, end to end
automation, better than them, 1000 times better than them, at an even lower cost and
proper use of AI and automation." This settles the open question from the
[6 October note](../../research/2026-10-06-lighthaus-revisited.md): marketplace sellers
are a target segment. This document says what that segment needs that the product does
not have, how it is built without weakening the owner-led product, in what order, and
what the owner must still decide.

## 1. In one paragraph

A D2C brand sells on its own site (Shopify, Razorpay), on Amazon, Flipkart, Myntra, Nykaa
and quick commerce, holds stock in marketplace warehouses in several states, and is paid
in settlements that net fees, returns, penalties, income-tax TDS under section 194-O and
GST TCS against gross sales. Its accounting problem is not the invoice; it is **whether
the money that arrived is the money that was owed**, in which state the sale was taxed,
and what each product actually earned. Lighthaus sells that as a service with human
accountants behind it. We build it as automation: every rupee of a settlement explained by
a deterministic engine, every mismatch a dated exception with a reason and a claim trail,
every state's return drafted from the same books, every SKU's margin from recorded costs,
closed every night by the daily job, and the owner's CA signing only where law needs a
signature. "Full service" here means the software does the accountant's work; it does not
mean we employ accountants. That is what lets the price sit well under a managed service.

## 2. What the segment needs that we do not have

| Need | Today | Gap |
|---|---|---|
| Marketplace orders as sales | One walk-in invoice a day from a POS file | Orders by channel with order id, SKU, state of delivery, gross, discounts, GST by rate; returns as credit notes |
| Settlement reconciliation | Nothing | Payout files from each channel parsed, every line typed (sale, refund, fee, penalty, reimbursement, TCS, TDS), expected payout computed, matched to the bank credit, shortfall surfaced the same day |
| 194-O TDS and GST TCS | TDS engine is for payments we make | Credits we are owed: 194-O per marketplace per quarter against Form 26AS, TCS per GSTIN against the portal's TCS credit, both claimed in the returns |
| Several GSTINs | One GSTIN per business; a branch is a separate business | One business, many registrations (principal, APOB in each warehouse state), state-wise books, inter-GSTIN stock transfers with their own invoices and e-way bills, ITC per state |
| Inventory and margins | No stock | SKU master with cost, stock by location, COGS on each sale, margin by SKU and by channel after fees and returns |
| Channel intake | CSV uploads, Tally, Zoho, bank | Shopify, Razorpay, Unicommerce and marketplace reports, first as files, then by API where one exists |
| Nightly close | Daily job: reminders, ledger chain, rules | A closure checklist a brand can read: revenue posted, expenses posted, bank matched, settlements matched, cash statement current |
| Channel | Android app, Windows | WhatsApp in and out, Hindi and Telugu |

## 3. Phases

Each phase is usable on its own and is built on the same engines, book view and action
gate as everything else. Code-only items go first; items that need a provider or a
credential are marked.

**D1. Settlement reconciliation (code only).** Parse Amazon, Flipkart and generic payout
reports by column aliases; type every line; compute the expected payout; hold the
settlement for preview; on confirm record it, match it to a bank credit already in the
ledger by amount and date window, raise an exception for every shortfall, penalty or
missing reimbursement with the order ids behind it; "did Amazon pay last week correctly?"
answered in chat and in the app. No posting of orders yet; the settlement is a record
with figures, not a ledger entry, until D2 gives it something to settle against.

**D2. Marketplace orders and returns (code only).** Order reports become B2C sales by
state of delivery and GST rate, one invoice per day per channel per state (GSTR-1 B2CS
needs no more), returns become credit notes, the settlement from D1 then posts as a receipt
against those sales with fees, penalties, TCS and TDS to their own accounts. Reimbursement
claims become reminders with a due date.

**D3. 194-O and TCS credits (code only, verification needs the portal).** TDS receivable
per marketplace per quarter from settlements; TCS credit per GSTIN; both carried into
GSTR-3B and the income-tax computation; a 26AS or TCS statement imported as a file and
matched line by line; shortfalls become supplier-style reminders to the marketplace.

**D4. Several GSTINs under one business (code only; the data-model change).** A business
carries registrations; every invoice, bill and stock move names its registration; returns
are drafted per registration from the same books; inter-GSTIN transfers raise the
transfer invoice and the e-way bill need; ITC is tracked per registration. This is the
largest change and touches the book view, so it is designed in its own spec before code.

**D5. SKU master, stock and margins (code only).** SKUs with HSN and cost; stock by
location including marketplace warehouses; COGS on each order line; margin by SKU and
channel after fees and returns; low-margin and negative-margin SKUs as exceptions.

**D6. Channel intake by API (needs seller credentials).** Shopify, Razorpay, Unicommerce,
Amazon SP-API and Flipkart seller APIs behind the action gate, read-only, scheduled by the
daily job; until then the file imports from D1, D2 and D5 do the same work.

**D7. Nightly close and the closure page (code only, after D2).** The daily job runs the
reconciliations and writes a closure record per day with the checklist; Home shows it.

**D8. WhatsApp and languages (needs Meta verification and the model decision).** WhatsApp
as an input channel through the hosted API; Hindi and Telugu through the model under
ADR-0004, with the engines unchanged.

## 4. What stays the same

- No invented figures. Every rupee in a settlement, margin or credit comes from a parsed
  file or the ledger, with the rows behind it. The model never produces a number.
- Nothing is filed, sent or claimed without the owner. The exception queue holds the
  mismatch; the owner or their CA decides.
- Dated rules. Section 194-O rates and thresholds, the TCS rate under section 52, and the
  e-way bill thresholds are rule records with act, section and source, attested before a
  figure leaves the product.
- The owner-led product for kirana stores, consultants and manufacturers is not touched by
  any of this: every D-phase is additive and off until a business has a channel.

## 5. What the owner must decide

1. Price. A managed service charges a monthly retainer; a product can charge per business
   per month. The memo argues for a flat monthly price well under a part-time accountant.
2. Whether we offer a human review tier at all (a CA on call through "Ask my CA") or stay
   pure software. The default here is pure software plus the owner's own CA.
3. Which channel comes first for D6 API work once credentials exist: Amazon, Flipkart or
   Shopify.
4. Whether the free books check (a settlement file reconciled before sign-up) is the
   entry offer, as their free audit is.

## 6. Sources

- [Lighthaus, third look](../../research/2026-10-16-lighthaus-third-look.md) and the two
  earlier notes for what they sell.
- Amazon Seller Central settlement report and Flipkart seller settlement report column
  names, from the public report formats, used only as column aliases in D1.
