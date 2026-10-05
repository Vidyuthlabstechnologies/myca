# ADR-0001: The invoice is the source of truth

| | |
|---|---|
| Status | Accepted |
| Date | Recorded 2026-10-06; in force since the first ledger commit |

## Context

Accounting packages let a user type a voucher and separately prepare a return. The two
drift apart, and reconciling them is much of what a CA is paid for. The product's
promise is that the owner never does a second typing pass.

## Decision

- Posted documents (invoices, purchase bills, receipts, expenses) are the only stored
  truth. The trial balance, GSTR-1, GSTR-3B and every summary are computed from them
  on demand and are never stored as truth.
- Money in the ledger is an integer number of paise. Rupees and rounding appear only
  on output.
- The journal is append-only with a checksum chain. A correction is a new entry that
  refers to the old one. Transfer ids are idempotent.

## Consequences

- Any figure can be traced to the documents behind it, and recomputed.
- A return cannot disagree with the books, because it has no separate existence.
- Credit notes and cancellations must be modelled as documents; "edit invoice" cannot
  exist.
- Projections are recomputed per request. This is cheap for a small business and needs
  indexing or caching by period for a large one.

## Alternatives rejected

- Voucher-first books with returns keyed in or imported: the drift the product exists
  to remove.
- Floating-point rupees: rounding errors accumulate and CGST stops equalling SGST.
- A general-purpose ledger database such as TigerBeetle: its invariants were adopted,
  but the database would add an operational dependency the desktop app cannot carry.
