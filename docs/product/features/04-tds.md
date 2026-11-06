# Feature spec 04: TDS

| | |
|---|---|
| Requirements | FR-TDS-1 to 3 in the [product PRD](../PRD.md) |
| Status | Threshold monitor built; deduction on bills and expenses and deposits built (2026-10-08); payees without PAN at the higher rate, the quarterly statement draft and its review built (2026-10-12); filing and certificates not built |
| Code | `sprints/statutory-rules/src/rules` (TDS rules, golden cases in `golden/tds.json`), `sprints/sprint-4-deadlines`, provider adapter for file generation |

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

- `import_26as_credits` reads every section of Form 26AS (CSV or text table: section, TAN of
  deductor, tax deducted, date; the amount paid is optional). Each row keeps its section
  (194C, 194J, 194O, 192, 206CQ and so on) and the quarter of its date. Rows under 194-O
  are matched to the marketplace by TAN or name and remain the marketplace credits of
  `marketplace_credits`; other sections are customers. A row with no readable section is
  the only kind left out, and the answer says how many. Rows already recorded (same section,
  TAN, date and amounts) are skipped, including 194-O rows imported before sections were kept.
- `record_tds_withheld` ("record tds withheld 2000 on INV-0001 under 194J") records TDS a
  customer deducted from a sales invoice. The invoice settles by that amount (paid when
  nothing else is owed, otherwise partly paid), and the credit is posted from the customer
  to TDS receivable (1160, created when first used). It needs the section; the deductor's
  TAN is optional and lets the check match exactly. It is previewed and posts after yes. The
  amount cannot be more than the invoice still owes, the date cannot be in a closed period,
  and a cancelled invoice cannot take it. The receipt is listed on the invoice as "TDS
  withheld ₹x (section)", exported to Tally as a Journal voucher (TDS Receivable to the
  customer, never a receipt into the bank), shown beside cash received in the Sales and
  Customer dues sheets, and counted as a credit in advance tax when no Form 26AS is imported.
- `tds_credit_check` ("check 26AS against the books", "reconcile TDS against 26AS", also in
  Excel as the Form 26AS check) reads the financial year, defaulting to the current one, one
  row per deductor, section and quarter: what 26AS shows, what the books show, the gap and
  one of matched, not in books, not in 26AS, short in 26AS or more in 26AS. Books and 26AS
  are matched by TAN when the books row has one, else by the customer's name against the
  deductor's name. 194-O is read from marketplace settlements. Totals, a count by section and
  the source of the 26AS (when it was imported, or that none was) come with it.
- Rows not in the books usually mean a customer paid short by TDS and the shortfall was never
  recorded: record it with "TDS withheld" on that invoice. The check never posts anything.
- The check works from Form 26AS as imported. AIS (the Annual Information Statement) is not
  read: its layout is not specified in this repository, so it is out of scope until a sample
  of the portal's export is available. Say so to anyone who asks whether MyCA compares AIS.
- App: Taxes has a "Form 26AS check" row under TDS that opens the totals, the rows, Import
  26AS and Save as Excel; a sales invoice or customer thread offers "TDS withheld".
