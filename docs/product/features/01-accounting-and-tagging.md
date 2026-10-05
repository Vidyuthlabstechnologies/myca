# Feature spec 01: Automatic accounting and smart tagging

| | |
|---|---|
| Requirements | FR-ACC-1 to 5, FR-TAG-1 to 4 in the [product PRD](../PRD.md) |
| Status | Accounting built; tagging of expenses not built |
| Code | `platform/src/ledger.mjs`, `invoice.mjs`, `chart.mjs`, `tools.mjs`, `intent.mjs` |

## What the owner experiences

The owner says what happened: "Sold 10 boxes to Rajesh at 500 each", "Paid 12,000 rent",
"Rajesh paid 5,000". The product shows what it understood, the owner taps to confirm,
and the entry appears in the right chat. The owner never sees an account head, a debit
or a credit unless they ask.

## User stories

1. As an owner, I record a sale in one message and see the invoice before it is posted.
2. As an owner, I record an expense in one message and it lands under the right head
   without my choosing one.
3. As an owner, when the product tags something wrongly I say so once and it does not
   repeat the mistake for that supplier.
4. As an owner, I fix a wrong invoice by cancelling it or raising a credit note, not by
   editing history.
5. As a CA, I can open any figure and see the entries behind it.

## Behaviour

### Posting (built)

- Each business event maps to one tool: `create_invoice`, `create_purchase`,
  `record_receipt`, `post_expense`, and the importers. Each tool posts a balanced set
  of transfers in integer paise.
- The ledger is append-only with a checksum chain. A duplicate document id is refused.
- GST is split by place of supply decided per invoice: CGST and SGST within the state,
  IGST across states. CGST always equals SGST to the paisa.
- Input credit that the law blocks is posted to cost, not to the credit account.
- A GST rate is never assumed. If the message or the imported row does not give one
  that is in force on the document date, the entry is held and the owner is asked.

### Tagging (to build)

- Add expense heads to the chart of accounts: rent, salaries, electricity, travel,
  repairs, professional fees, bank charges, and a general head.
- A deterministic tagger chooses the head in this order: what the owner said for this
  supplier before, then keywords in the description, then the general head with a
  question to the owner.
- The tag is shown on the preview in plain words ("Rent") and can be changed there.
- A correction is stored per supplier and per keyword in the business's books and is
  audited like any other change.
- A language model may propose a head for an unknown description. It is a proposal on
  the preview; it is never posted without the owner's confirmation.

### Corrections (to build)

- Credit note and debit note as documents linked to the original invoice, reported in
  the correct GSTR-1 table for the period of the note.
- Cancelling a posted invoice posts a reversing entry; the original stays in the journal.

## Acceptance criteria

- The trial balance ties after every operation, including a failed or refused one.
- Posting the same message or the same file twice does not create a second entry.
- An expense from a supplier tagged once before is tagged the same way with no question.
- A credit note reduces the customer's balance and the period's output tax, and the
  original invoice is unchanged.
- Every posted entry has an audit event naming the member who confirmed it.

## Out of scope

Inventory and stock valuation, cost centres, multi-currency, depreciation schedules.

## Open questions

- Which expense heads does the first version ship with? The list above is a proposal.
- Does TDS get worked out at the time an expense is posted? See [spec 04](04-tds.md).
