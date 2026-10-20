# Feature spec 07: CA collaboration

| | |
|---|---|
| Requirements | FR-CA-1 to 4 in the [product PRD](../PRD.md) |
| Status | Invite, remove and the monthly entries export built; the sync setting built (2026-10-07); Tally import file built (2026-10-12) |
| Code | `cloud/src/members.mjs`, `cloud/src/businesses.mjs`; app: `mobile/lib/screens/people_screen.dart`, `invitation_cards.dart` |

## What the owner experiences

The owner gives their CA access in one of two ways: export the entries and send the
file, or add the CA to the business. With the second, the owner chooses whether the CA
sees changes as they happen or at set intervals.

## User stories

1. As an owner, I invite my CA by phone number and can remove them at any time.
2. As an owner, I choose how current the CA's view is.
3. As an owner without a CA on the product, I export my entries in a format their
   software reads.
4. As a CA, I open a client's business and see what needs my attention first.
5. As a CA with several clients on the product, I switch between them.

## Behaviour

### Invite (built)

- The owner invites by phone number with a role: staff or accountant. The invitation is
  stored against a hash of the number; the invited person sees it after signing in with
  that number and accepts or declines.
- Roles map to engine roles: owner to admin, staff to staff, accountant to partner.
- A business always has at least one owner. Removing a member takes effect on their
  next request.
- A person who belongs to several businesses switches between them in the app.

### Export (spreadsheet and Tally file built)

- Built: `export_entries` gives one CSV for a month with every sale, receipt, credit
  note, purchase and expense in date order: number, party and GSTIN, head, taxable value,
  each tax head, total, how it was paid, and the invoice a receipt or note refers to.
  Taxes has "Save entries for your CA".
- Built (2026-10-12): `export_tally` gives one Tally import file (XML) for a month:
  an "All Masters" envelope with every ledger used (customers under Sundry Debtors with
  their GSTIN, suppliers under Sundry Creditors, Sales, Purchases, the six GST ledgers
  and TDS Payable under Duties & Taxes, expense heads under Indirect Expenses, Bank and
  Cash), then a "Vouchers" envelope with each sale, receipt, credit note, debit note,
  purchase, payment, debit note to a supplier, expense and TDS deposit as a voucher in
  Tally's sign convention (debits negative, `ISDEEMEDPOSITIVE` Yes). Blocked credit
  goes into Purchases; TDS splits the supplier credit from TDS Payable. Taxes has "Save a
  Tally file"; chat answers "export for Tally". Ledger names are MyCA's, so the CA maps
  them if their Tally uses others; the trial balance is not in the file.
- All CSV output goes through `text-safe.mjs`.
- An export is audited: who exported what period and when.

### Tally write-back (built 2026-10-20)

"Push September to Tally" sends the month's ledger masters and vouchers, the same file the
export makes, to TallyPrime's HTTP server on this machine after a preview. The reply's
created, altered and rejected counts are kept per month; a rejected line is shown and
nothing is recorded as sent. A second send of a month is refused until the owner says
"again", because Tally would duplicate the vouchers. Desktop only; the phone has no Tally.

### Zoho Books write-back (built 2026-10-16)

A firm that keeps its clients in Zoho Books connects it once ("set_channel_connector zoho": organisation id, data centre, client id and secret, refresh token; the secrets sit in the local vault). "Push invoices to Zoho for 2026-09" then sends the month's invoices that Zoho does not have yet: the customer is looked up by name and created with its GSTIN when missing, each line carries its HSN and the Zoho tax that matches the rate and the direction of supply, and the invoice number is kept. The push is a write through the action gate, so it needs live calls on and a CA approval naming the exact invoices; in mock mode it is simulated and marks nothing. Each sent invoice remembers its Zoho id and is never sent twice. The books themselves do not change.

### Ask my CA (built 2026-10-06)

- A question thread kept in the books (`ca-requests.mjs`). The owner, or any member,
  asks about an invoice, a bill, an expense, a flagged item or a month's GST; the engine
  attaches the facts (figures, dates, GSTINs, lines, why an item was flagged), so the CA
  sees what the owner saw rather than a retelling.
- The invited accountant sees it under "Your CA" and replies; a reply from anyone other
  than the asker marks it answered, a reply from the asker puts it back with the CA.
  Only the asker or the owner closes it. Asking, replying and closing go through preview
  and confirm and are audited with who did it. Nothing leaves MyCA.
- "Ask my CA" sits on the invoice screen, on a flagged item in Taxes, and on the month's
  review. When the CA is not on MyCA yet, "Copy to send" puts the question and its facts
  on the clipboard for WhatsApp or email.
- Up to five uploaded files can be attached to a question (`documents` on `ask_ca`,
  "Attach a file" on the sheet); the CA sees them named on the request (2026-10-15).
- Not yet: a notification to the CA (needs push in the deployment).

### Sync setting (built 2026-10-07)

- The owner chooses on People: as things happen (live, the default), once a day, once
  a week, at month end, or only when they share. "Share now" pushes a sync point at
  any time. Owners and staff always see the live books.
- A sync point is a stored copy of the books (`shared_books`), not a journal position
  as first planned: the books hold invoices, bills, reminders and filings as well as
  the journal, so a copy is the simple way to show all of them as they stood.
- Boundaries are midnight in India: each day, each Monday, the first of the month. A
  sync point is taken from the books just before the first request after a boundary,
  so it is exactly the books as they stood at that midnight, even if the owner posts
  before the accountant looks.
- An accountant on a shared view reads and asks against the sync point; every read is
  still in the audit log. They cannot post: proposals answer
  `403 SHARED_VIEW_READ_ONLY`, and a chat that would post says to ask the owner. Home
  tells them the date the books are shared as of.
- API: `GET/POST businesses/:id/ca-sync` (owner sets), `POST businesses/:id/ca-share`.

### Answers from the firm's notes (built 2026-10-16)

"What do our notes say about the audit fee for Kiran?" finds the questions to the CA, reminders, document requests, supplier reminders, document names and reviewer corrections that mention the question's words, and asks the model to answer from those notes only, quoting the note it relied on. The prompt forbids any amount, date, rate or deadline that is not in the notes, and forbids calculation. The model call goes through the action gate: in mock mode the answer is simulated and marked so; with live calls off the owner still sees the notes that were found. With no matching note nothing is sent to the model. Salary matters stay out of the notes that are searched when the books mark them private.

### What an accountant may do (to decide)

- Today an accountant can record entries and decide exceptions, the same as staff.
- Whether an accountant may approve a filing is PRD question Q2.

## Acceptance criteria

- A non-member asking for a business gets the same answer as for a business that does
  not exist.
- A removed accountant's next request fails.
- With interval sync, an entry posted after the sync point is not visible to the
  accountant until the next one.
- An exported file re-imported into a fresh business reproduces the same trial balance.

## Out of scope

Billing between CA and client, a CA-firm console for hundreds of clients (the desktop
app covers that case today), messaging between owner and CA inside the product.

## Open questions

- Q2 in the PRD.
- Can an accountant invite their own article staff to a client's business?
