# Feature spec 01: Automatic accounting and smart tagging

| | |
|---|---|
| Requirements | FR-ACC-1 to 5, FR-TAG-1 to 4 in the [product PRD](../PRD.md) |
| Status | Accounting, expense tagging and sales credit notes built (2026-10-06); sales debit notes and debit notes to suppliers built (2026-10-12) |
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

### Tagging (built)

- Fifteen expense heads in the chart of accounts (`expenses.mjs`): rent, salaries,
  electricity, telephone, travel, repairs, professional fees, bank charges, office and
  stationery, advertising, freight, insurance, software, packing, and Other expenses.
- A deterministic tagger chooses the head in this order: what the owner chose for this
  payee before, then for this wording, then keywords in the words, then Other expenses
  with a nudge to change it. Two heads matching equally also fall to Other expenses.
  Every tag carries its `source` and a plain `why`.
- The preview names the head ("Rent: Shop rent ₹11,800.00 paid from bank…") and the
  app offers "Under Rent · change" before posting. A posted expense can be moved from
  its head chat; the move is a new ledger entry, never an edit.
- A choice is remembered per payee and per wording in the business's books.
- Input credit on an expense is taken only when the supplier's GSTIN is given; without
  it the GST is part of the cost and the preview says so. A cash expense larger than
  cash in hand is refused with the balance shown.
- In chat: "paid 12000 rent", "spent 450 on petrol by cash", "paid 2000 to Mahesh
  Transport for freight". A sentence naming a customer, a question, a negation or more
  than one amount records nothing.
- Correcting a tag by typing (built 2026-10-12): "that was rent" or "no, it should be
  advertising" moves the expense just posted; "tag EXP-0003 as travel", "EXP-0003 is
  software" names one. The head is found from its name, part of its name or one of its
  keywords; an unknown word gets the list of heads and changes nothing. The move is
  previewed, posted as a new entry, and remembered for that payee and wording.
- Blocked-credit heads (built 2026-10-12): five heads carry a category of CGST Act
  s.17(5), read from the dated rule `gst.itc.blocked` on the expense date: Food and
  refreshments (clause (b)(i)), Staff welfare and gifts ((h)), Club and fitness
  memberships ((b)(ii)), Car running and insurance ((ab), from February 2019), Personal
  and household ((g)). An expense under one of them takes no input credit even when the
  supplier's GSTIN and the GST rate are given; the preview says which clause, the whole
  amount is cost, and the rule's attestation state is stated. Not covered: the
  exceptions in s.17(5) (the same outward supply, or a legal obligation on the
  employer); the owner can choose another head when one applies.
- Still to do: a language model proposing a head for unknown wording (as a proposal
  only, never posted without confirmation); GSTR-3B Table 4(D) reporting of blocked
  credit.

### Corrections (credit and debit notes built)

- A credit note (`credit-notes.mjs`) is a document linked to the invoice, for part of
  it or all of it, dated on or after the invoice and never in a locked month. It posts
  reversing entries (debit sales and the output tax heads, credit the customer) pro
  rata by the invoice's lines; the invoice is never edited. Notes against one invoice
  cannot exceed its value. If the customer has already paid, the preview says how much
  becomes due back to them.
- Cancelling an invoice is a credit note for its full value; the invoice is marked
  cancelled, takes no further receipts, and stays in the journal and in the return of
  its own month.
- GSTR-1 reports a note in the month of the note: CDNR for a registered buyer, CDNUR for
  a large inter-state unregistered sale, and netted into the B2CS row otherwise (a
  negative net row is warned about). GSTR-3B outward totals are shown gross, less the
  month's notes, and net.
- In chat: "cancel INV-0002", "credit note for INV-0001 2100 - goods returned". The
  app offers both from the invoice screen; the customer chat shows each note.
- A debit note on a sale (`debit-notes.mjs`, `create_debit_note`) adds to the invoice:
  price revised upward, an extra charge. It needs an amount and a reason, is dated on or
  after the invoice, scales the invoice's lines to the amount at the same GST rates, and
  posts debit customer, credit sales and the output tax heads. The customer owes that
  much more; a paid invoice with a debit note is open again for the difference. GSTR-1
  reports it in the month of the note as a D row in CDNR or CDNUR, or added to the B2CS
  row; GSTR-3B outward and the amount to pay include it.
- A debit note to a supplier (`create_purchase_note`) reduces a bill: goods returned,
  short supply, price reduced. It cannot exceed what is left of the bill, scales the
  bill's lines, and posts debit supplier, credit purchases and the input credit heads
  (or purchases alone where the credit was blocked). You owe the supplier that much
  less, or are owed it back if already paid; the month's input credit is reduced by the
  reversed tax and the review says so. TDS already deducted on the bill is not changed.
- In chat: "debit note for INV-0001 2000 - price revised", "debit note for BILL-0003
  1000 - goods returned". App: the invoice screen offers a debit note beside the credit
  note; debit notes to suppliers are made in chat for now.
- A supplier's own debit note that increases a bill was built 2026-10-13
  (`record_supplier_debit_note`).
- The e-invoice (IRN) for a credit or debit note goes through the same gate as an
  invoice (`govt_generate_irn CN-0001`), with the original invoice as the preceding
  document; debit notes to suppliers are made from the supplier's chat in the app
  (2026-10-15). Live generation still needs NIC credentials.

### Account Aggregator data (built 2026-10-16)

The owner's Account Aggregator app delivers the bank account's FI data as JSON once consent is given. Attached and sent with "import account aggregator data" (or any `.json` with "import bank"), every account's Transactions become statement rows: credits and debits on the value date with the narration, the running balance and the reference, and the preview shows the masked account number before anything posts. A transaction without a date or an amount is skipped and counted. The consent flow, the FIU registration and the decryption happen in the AA client, not here.

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

## Who to pay: the payment run (built 2026-10-17)

"Who do I need to pay?" (or "kis ko payment karna hai") ranks every unpaid supplier bill on
the clocks that matter in India: bills at or past their MSMED pay-by date first (the
disallowance under Section 43B(h) starts there), then bills within 180 days of their date
(after which the input credit is reversed under Rule 37), then bills due within the next
fourteen days on agreed terms. Bills older than 45 days with no agreed terms are listed to
consider; bills with an open exception are held back and named. The answer shows the bank
and cash balance from the owner's last reading, the balance after paying, and whether
payroll and GST still clear from the cash forecast.

"Pay the proposed bills" (optionally "except BILL-0003") previews the batch as one
proposal with the total and the balance after; a batch that would take the balance below
zero is blocked at the preview. On yes, MyCA posts one payment per bill from the bank;
the owner makes the transfers from their bank app. In the app, "Who to pay" on the Cash
screen shows the same list with a tick per bill (`payment_run` is a remote query,
`record_payment_run` is previewed and confirmed).

## Close the month (built 2026-10-18)

"Close the month" (or "close September", "mahina band karo") runs nine checks on a
finished month and answers each in words: entries posted; possible duplicates (same party,
amount within a rupee, dated within five days, across invoices, bills and expenses);
bills and expenses above ₹5,000 with no document (a bill read from a photo or an expense
posted with its document keeps the hash); marketplace settlements matched; GSTR-2B loaded;
payroll approved and paid; a bank balance given in the month; nothing high or critical
open; and any line that moved more than a tenth on the month before, with both figures.
A short narrative follows, built only from the figures.

"Approve the close" signs it off. The approval is bound to the draft, so a close drafted
before the books changed cannot be approved by mistake; when checks are open the owner has
to say why ("approve the close: the two Mehta bills are different consignments") and the
note and the open items are kept with the close. On yes the books lock through the last
day of the month, so nothing dated inside it can be posted or changed without unlocking.
Never a forecast before the close, never an automatic fix of a duplicate.

## Where a supplier is paid, and the payout file (built 2026-10-19)

"Ravi Packaging is paid to account 5010 0123 4567 89 IFSC HDFC0001234" (or "... to UPI
ravi@okaxis") records where a supplier is paid; only the owner can. A change is previewed
old against new with the one sentence that stops the commonest invoice fraud: confirm it by
calling the number you already have for them, not one on the bill or the email. The change
is kept with the record. "Payout file" builds a bulk NEFT or IMPS file for the bills the
payment run proposes, one row per supplier (beneficiary, account, IFSC, UPI, amount, a
narration with their bill numbers), names the suppliers with no details on record, and
warns when a supplier's details changed recently. MyCA moves no money: the file is uploaded
and approved in the bank, and the payments are recorded with "pay the proposed bills".

