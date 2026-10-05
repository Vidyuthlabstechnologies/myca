# ADR-0010: The product does not become the seller of record or hold money

| | |
|---|---|
| Status | Accepted |
| Date | 2026-10-05 ([decision memo](../../research/2026-10-05-taxmeow-decision-memo.md)) |

## Context

One way to take tax work off a business is to become its merchant of record: sell in
your own name, issue the invoices under your own GSTIN, collect the money and settle.
The memo examined this. It was written about a different company of the same name by
mistake, but the question it answers stands on its own.

## Decision

- The product records, computes, prepares and, with approval, files in the taxpayer's
  own name. It is never a party to the owner's sales.
- The product does not hold, move or settle customer money.
- Payroll payouts, if built, go through a regulated partner; the product instructs,
  the partner moves the money (PRD Q5).

## Consequences

- The company carries no GST liability for its customers' sales and needs no payment
  licence.
- Collections, payment links and settlement are out of scope.
- "Pay salaries from the same platform" in the owner's PRD needs a partner and cannot
  be met by engineering alone.

## Alternatives rejected

- Merchant of record: liability for every customer's tax, working capital, and a
  different company from the one the PRD describes.
