# Feature spec 04: TDS

| | |
|---|---|
| Requirements | FR-TDS-1 to 3 in the [product PRD](../PRD.md) |
| Status | Threshold monitor built; deduction on bills and expenses and deposits built (2026-10-08); payees without PAN at the higher rate, the quarterly statement draft and its review built (2026-10-12); the Form 26AS check and TDS withheld by customers built (2026-11); filing and certificates not built |
| Code | `sprints/statutory-rules/src/rules` (TDS rules, golden cases in `golden/tds.json`), `sprints/sprint-4-deadlines`, provider adapter for file generation; for the 26AS check `platform/src/tds-credits.mjs`, `platform/src/marketplace-credits.mjs` (the import) and `platform/src/tds-intent.mjs` (chat) |

## What the owner experiences

When the owner records a payment that needs tax deducted, the preview says so in plain
words: how much to hold back, how much to pay the supplier, and by when the held amount
goes to the government. Each quarter the TDS return is prepared and reviewed the same
way as a GST return.

## User stories

1. As an owner, I am told before I pay a supplier that I must deduct tax.
2. As an owner, I see what I owe the government in TDS this month and when it is due.
3. As an owner, I review and approve the quarterly return in chat.
4. As a supplier of the owner, I receive the certificate for what was deducted.

## Behaviour

### Monitor (built)

- Section-wise thresholds, bases and rates are dated rules. The monitor reads them on
  the payment date and each flag names the rules it used.
- Crossing an aggregate threshold during the year is flagged on the payment that
  crosses it.

### Deduct on the entry (built 2026-10-08)

- The business first says it deducts TDS, with its TAN (`set_tds_deductor`). Until
  then a bill or expense with a TDS section is refused, and no TDS deadline is shown.
- A bill or expense can carry a section: 194C (contractor), 194J (professional,
  technical or director), 194I (rent of building or of plant) or 194A (interest), with
  the payee's PAN. The 194J category and the 194I asset are asked for, never assumed.
- `tds-deduction.mjs` reuses the threshold monitor (`sprint-5/tdsmonitor.mjs`) on every
  payment to that PAN under that section (and category) in the financial year,
  including ones below the limit. When the yearly limit is crossed, the deduction
  includes TDS on the earlier payments, less what was already deducted; it is capped at
  what this payment leaves owing and any remainder is said to be due on the next one.
- The rate depends on the payee: the fourth character of the PAN marks an individual
  (P) or HUF (H), which 194C charges at the lower rate.
- TDS is worked out on the amount before GST when GST is shown separately (a bill, or an
  expense with the supplier's GSTIN), otherwise on the whole amount.
- No PAN: deducted at the higher rate from the dated rule `tds.no-pan.rate` (s.206AA(1)
  of the 1961 Act, s.397(2) of the 2025 Act: the highest of the rate specified, the rate
  in force and twenty per cent for the sections MyCA handles). Payments to such a payee
  aggregate by name within the section and year, the entry is marked `noPan`, and the
  preview says why the rate is higher. A payee with neither a name nor a PAN is refused.
- Posting: a bill credits the supplier for the net and TDS payable (2200) for the TDS;
  an expense pays the net from the bank or cash and credits TDS payable. The supplier's
  outstanding and the payment default are net of TDS.
- Every preview says the deduction, the rate, the base, the net, the deposit date from
  the deadlines engine, and that the rules have not been reviewed by the CA while any
  rule used carries no attestation.
- Deposits (`record_tds_deposit`) need the challan reference, default to everything due,
  cannot exceed it or reuse a challan, and post TDS payable against the bank or cash.
  A month's TDS deposit deadline is shown as nothing due when nothing was deducted, and
  as done (with the challan, and whether late) once deposits cover it.
- Chat: "we deduct TDS, TAN …", "bill from … tds 194J professional PAN …", "paid 60000
  office rent to … tds 194I PAN …", "my tds", "deposited TDS, challan …". App: TDS on
  the bill and expense forms for a deductor, and a TDS card on Taxes.

### Return (draft and review built 2026-10-12; filing to build)

- `tds-return.mjs` drafts the quarterly statement for payments other than salary
  (`tds_return`): quarters follow the financial year (Q2 2026-27 is July to September
  2026); the form number comes from the dated due-date rule (Form 140 under the 2025
  Act, 26Q before). Deductees are grouped by PAN and section (by name where there is no
  PAN), with the number of payments, the amount, the rate and the TDS; totals by
  section; and the challans that cover the quarter. Deposits are matched to deductions
  in date order, so a challan that also covers an earlier quarter shows only the part
  for this one. The draft carries what is still to deposit, the statement's due date
  from the deadlines engine, and any recorded filing.
- Review (`tds-review.mjs`, `tds_review`, `tds_review_answer`): deductees, challans,
  then approval, each asking "Is this information correct?", bound to a hash of the
  draft as in [spec 03](03-gst-returns.md). A new deduction or challan in the quarter
  voids earlier answers. Only the owner approves when the role is known. Approval
  records who checked which draft; it files nothing and moves no money. The statement
  cannot be filed before the TDS is deposited, and the review says so.
- Chat: "TDS return for Q2 2026-27", "review TDS", then "yes" step by step. App: the
  TDS section of Taxes lists the latest quarters with their state (to review, approved,
  filed) and opens the same review screen as GST.
- The salary statement (Form 138, earlier 24Q) is the same draft and review with
  `form: 'salary'`, fed by approved payroll months ([spec 05](05-payroll.md)); the two
  statements share the recorded challans in date order.
- Still to build: generating and validating the file through the provider behind the
  action gate, submission through the same gate, recording the token the portal
  returns, Annexure II of the salary statement, and certificates to suppliers shared
  the same way as invoices. Until then the owner files on the portal or through the CA
  and records the acknowledgement.

## Statutory care

The Income-tax Act, 2025 replaced the 1961 Act from 1 April 2026 and renumbered the TDS
provisions. Every section reference, rate, threshold, form number and due date used by
this feature must be a dated rule record carrying its citation under the Act in force
on the payment date, verified against the Act and signed off by the advisor CA. Nothing
in this document should be read as stating a rate or a threshold.

## Acceptance criteria

- For every golden case, the deduction equals the expected amount to the rupee as the
  law rounds it.
- A payment below every threshold produces no deduction and no flag.
- TDS payable in the ledger equals deductions less deposits at any date.
- The return draft's totals equal the ledger for the quarter.

## Out of scope

TCS, TDS on property and rent by individuals, lower-deduction certificates, corrections
to filed returns. TDS on salary is specified with [payroll](05-payroll.md).

## Open questions

- Which filing route: a provider API, or generate the file and let the owner or CA
  upload it? The second needs no onboarding and can ship first.

## Advance tax to set aside (built 2026-10-18)

"How much tax should I set aside?" (or "advance tax", "tax kitna bachana hai") answers for
an individual or a proprietor: the profit for the financial year to date (sales less credit
notes, purchases, expenses and approved payroll, before depreciation and the CA's
adjustments) scaled to twelve months, with both figures shown and the warning that a
seasonal business should say its expected year instead; the tax under the new regime (or
the old, when asked) from the dated slab, rebate, surcharge and cess rules; less the TDS
credit on record (Form 26AS as imported, else the TDS customers withheld on invoices and
the TDS 194-O seen in marketplace settlements);
split into the instalments the dated rule gives (15, 45, 75 and 100 percent by 15 June,
15 September, 15 December and 15 March, or the whole by 15 March under presumptive
income), each marked met, missed or next with the amount to pay. Interest under sections
234B and 234C is named when an instalment was missed and never computed. Under ₹10,000
net nothing is due and the answer says so. Every answer is headed "for your CA to
confirm" and ends with its assumptions. A company or a firm is told that it pays at a flat
rate and should ask its CA.

"Paid advance tax 48,000 challan 0510001234567" is previewed and, on yes, posts bank to
the advance tax paid asset and reduces what the next instalment asks for.

## Form 26AS check against the books (built 2026-11-06)

Form 26AS lists the tax that deductors reported against the business's PAN. The check puts
it beside what the books claim, so a customer who paid short by TDS and a shortfall nobody
recorded show up before the return is filed.

- `import_26as_credits` reads Form 26AS as a CSV or a text table whose header names the
  section, the TAN of the deductor, the tax deducted and the date; the deductor's name and
  the amount paid are optional. Every section is kept (194C, 194J, 194O, 192, 206CQ and so
  on) with the quarter of its date. Rows under 194-O are matched to the marketplace by
  TAN or name and remain the marketplace credits of `marketplace_credits`; other sections
  are customers. The import is previewed, then recorded after yes; it posts nothing to
  the ledger. Chat: attach the file and say "import 26AS"; without a file MyCA says what
  to attach.
- Rows already recorded are skipped by occurrence. A row is the same as one on file when its
  section, TAN, date, tax deducted and amount paid all agree, and a file that holds the same
  row twice is read as two rows until the books hold two. Importing a file again records
  nothing; importing an overlapping file records only the rows beyond what is on file.
  194-O rows imported before sections were kept count as section 194-O.
- Some rows are not imported. A row with no readable section is counted and left out, and
  the preview and the answer say how many. A row whose TAN is not in TAN form, whose date
  cannot be read or whose tax amount is not above zero is held back and listed with its row
  number and reason (`BAD_TAN`, `INVALID_DATE`, `BAD_AMOUNT`) in the import result; the
  preview and the chat answer do not mention held rows, so check the count of entries
  against the file.
- `record_tds_withheld` ("record tds withheld 2000 on INV-0001 under 194J") records TDS a
  customer deducted from a sales invoice. The invoice settles by that amount (paid when
  nothing else is owed, otherwise partly paid), and the credit is posted from the customer
  to TDS receivable (1160, created when first used). It needs the section; the deductor's
  TAN is optional and lets the check match exactly ("... TAN MUMA12345B"). It is
  previewed and posts after yes. The amount cannot be more than the invoice still owes,
  the date cannot be in a closed period, and a cancelled invoice cannot take it. The
  receipt is listed on the invoice as "TDS withheld ₹x (section)", exported to Tally as a
  Journal voucher (TDS Receivable to the customer, never a receipt into the bank), shown
  beside cash received in the Sales and Customer dues sheets, and counted as a credit in
  advance tax when no Form 26AS is imported.
- Its date, when none is given, is the date of the latest cash receipt on the invoice, or
  the invoice date when no cash has been received, so that the TDS lands in the quarter of
  the money. A date can be said as 2026-10-05, 05/10/2026, "5 October 2026" or "20
  October" (a day and month with no year is the latest such date that is not in the
  future), and "today" is read as today; a date it cannot read ("yesterday") or two dates
  are asked for with a worked example in the same form as the instruction ("Say the date,
  for example "record tds withheld 2000 on INV-0001 under 194J dated 15 October 2026""),
  and nothing is recorded.
- A sentence that carries a receipt and TDS together ("received 98000 against INV-0001,
  TDS 2000 under 194J") records nothing. MyCA answers with the two sentences to say, the
  receipt first and then "record tds withheld 2000 on INV-0001 under 194J", and the TDS
  then takes the date of the receipt. A TDS entry cannot be reversed from chat: a held
  preview can be discarded, and after yes the CA corrects the entry.
- `tds_credit_check` ("check 26AS against the books", "reconcile TDS against 26AS", also in
  Excel as the Form 26AS check) reads the financial year, defaulting to the current one,
  one row per deductor, section and quarter: what 26AS shows, what the books show, the gap
  (books less 26AS) and one of matched, not in books, not in 26AS, short in 26AS (the
  books show more than 26AS by over ₹1) or more in 26AS (26AS shows more by over ₹1). A
  year can be said as "FY 2025-26", "FY 25-26", "AY 2026-27" or "last year"; two years
  that are not in a row ("FY 2025-27") are asked for and nothing is checked. A year said
  any other way ("for 2025") is not read, and the check covers the current year; the
  answer names the year it used. Without a year, in chat, in the app and in the Excel
  file, the check covers the current year; the Excel file takes a year too ("excel of the
  26AS check for FY 2025-26").
- Books and 26AS are matched by TAN when the books row has one, else by the customer's name
  against the deductor's name (four characters or more, one name containing the other),
  looking in the same quarter first. A books row that finds nothing in its own quarter is
  paired with a 26AS row of the same section elsewhere in the year when the TAN or name
  matches and the two amounts agree within ₹1, because the quarter the books date a
  receipt in is often not the quarter 26AS does; the row then says when the books date it
  and when Form 26AS does. 194-O is read from marketplace settlements. Totals, a count by
  section and the source of the 26AS (when it was imported, or that none was) come with
  it. When a Form 26AS file is attached and not yet imported, the chat answer says the file
  is not in the comparison.
- Rows not in the books usually mean a customer paid short by TDS and the shortfall was never
  recorded: record it with "TDS withheld" on that invoice. The check never posts anything.
- The check works from Form 26AS as imported. It does not read AIS (the Annual
  Information Statement), and neither does `import_26as_credits`: the layout of the AIS
  export is not specified in this repository, so it stays out until a sample of the
  portal's file is available. Say so to anyone who asks whether MyCA compares AIS. The note
  in the tool's result ends "AIS is not read yet"; the app's check screen shows it and the
  chat answer does not. `prepare_itr` takes an AIS file as one input to the old-against-new
  regime comparison, which is separate from this check.
- App: Taxes has a "Form 26AS check" row under TDS that opens the totals (in 26AS, in your
  books, the gap) for the current year, the rows with their status, Import 26AS (pick a CSV
  or text file, then the preview and yes) and Save as Excel. The customer's thread offers
  "TDS withheld" while the customer has an unpaid invoice, in India books: choose the
  invoice, the amount (filled in at 2 per cent of the invoice, for you to change), the
  section (194C until you pick another), the date (today until you pick another) and the
  TAN if known, then the preview and yes. The invoice screen does not offer it.

Limits of what can be said and recorded from chat:

- A receipt or payment sentence is read for one amount. A date in words is read and is not
  an amount ("on 20 October", "20th October", "October 20, 2026"; a day and month with no
  year is the latest such date that is not in the future). Nor is a reference number said
  as "cheque no 123456", "ref 998877", "UTR 4567891234", "txn id 998877" or "#4521", a
  six-digit cheque number said after the amount ("received 5000 against INV-0001 cheque
  123456"), a term such as "30 days" or "net 30", or an instalment number ("instalment 2
  of 3"). A six-digit figure straight after the verb is the amount ("received cheque
  200000 against INV-0001"). When the sentence still holds two amounts ("received 98000
  and 2000 against INV-0001"), or a short bare number such as "cheque 123", MyCA says it
  read more than one amount, records nothing and asks for the one amount. An amount of
  zero or less ("received 0 against INV-0001", "paid Fabric Co -4000") is refused in words
  and nothing is recorded. "Yesterday" and "the day before yesterday" date the entry one or
  two days back; other relative words are not read, the entry is dated today and the
  preview shows the date before anything posts.
- TDS the business deducts from a supplier is taken when the bill or expense is posted
  ("bill from Fabric Co 10000 GST 5% with TDS 194C", after "we deduct TDS, TAN ..."), or
  added later to a posted bill that has none ("add TDS 194C to BILL-0001"): the TDS is worked
  out as of the bill date, the preview shows it, and a bill paid in full is refused. A
  payment said with "less TDS" asks for the bill TDS first. `record_tds_withheld` is for
  sales invoices (INV- numbers) only.
