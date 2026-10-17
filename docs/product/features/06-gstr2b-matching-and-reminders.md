# Feature spec 06: GSTR-2B matching and supplier reminders

| | |
|---|---|
| Requirements | FR-2B-1 to 4 in the [product PRD](../PRD.md) |
| Status | Matching, adding 2B and credit at risk in the app built (2026-10-06); reminders built (2026-10-07); credit-at-risk marks in the supplier chat and Rule 37 from recorded payments (2026-10-15); fetching 2B needs the GSP |
| Code | `sprints/sprint-3-gst-recon`, exception queue in `platform/src`, `notifications.mjs` |

## What the owner experiences

Each month the product compares the owner's purchase entries with what suppliers have
reported to the government. If a supplier has not filed, or reported a different
amount, the owner sees it with the credit at risk in rupees and a drafted reminder. The
reminder goes only when the owner says so.

## User stories

1. As an owner, I see which suppliers are costing me credit this month and how much.
2. As an owner, I send a polite reminder to a supplier in two taps.
3. As an owner, I am never embarrassed by a message I did not approve.
4. As an owner, I see the credit become available once the supplier files.

## Behaviour

### Match (built)

- Purchases are matched to GSTR-2B on each tax head separately, so a CGST and SGST
  entry reported as IGST is flagged, not netted off.
- Credit notes are reconciled in both directions.
- Three conditions are checked separately and each says so when it lacks data: whether
  the credit appears in 2B (s.16(2)(aa)), whether the supplier has been paid within 180
  days (Rule 37), and whether the supplier has filed GSTR-3B (Rule 37A).
- Every mismatch becomes an item in the exception queue with severity, money at risk,
  the rule that raised it and the evidence.

### Get the 2B (upload built; fetching to build)

- Built: "Add GSTR-2B" on Taxes takes the CSV downloaded from the portal for that month.
  It goes through upload, preview and confirm like any import (`import_gstr2b`), posts
  nothing to the ledger, and a second file for the same month replaces the first.
- Built: purchase bills keep the supplier's bill number (`supplierInvoiceNo`, at most 16
  characters, one per supplier). Without it a bill cannot be found in 2B, and the app
  says so rather than blaming the supplier.
- To build: fetch through the GSP once onboarding is complete, behind the action gate.

### Show (built on Taxes; marks in supplier chats to build)

- `credit_at_risk` checks the month's bills against every 2B added so far, so a bill a
  supplier reports late is matched once that later 2B is added. Each bill at risk has a
  reason: not reported, credit not available in 2B, amounts or tax type differ, the
  date differs from the supplier's, or no supplier bill number.
- Taxes shows matched credit, credit at risk, the suppliers behind it with a sheet per
  supplier, and how many 2B entries are not in the books.
- Each bill in the supplier's chat shows "Credit at risk" with the reason when the
  month's check flags it (2026-10-15).

### Remind (built 2026-10-07)

- `supplier_reminder_draft` (read-only, `supplier-reminders.mjs`) drafts the message
  for one supplier and month: their bill numbers, dates and amounts, and what is wrong
  with each in plain words (not in 2B yet, credit marked not available, different
  amount, tax type or date). It contains nothing else the supplier would not already
  know: no MyCA bill ids, no other suppliers, no credit figures.
- No draft when no 2B has been added for the month (MyCA cannot tell what was reported),
  when nothing from that supplier is at risk, or when the only gap is the owner's own
  missing supplier bill number (the owner is told to add it instead).
- `record_supplier_reminder` is previewed, then records the message as sent, who sent
  it and the day, in `supplierReminders`. Only after that does the app hand the message
  to the phone's share sheet, so it goes from the owner's own WhatsApp, email or other
  app (PRD Q6, first version). MyCA sends nothing itself and nothing is scheduled.
- A later draft for the same supplier and month says when they were last reminded and
  how many times; it is offered, never sent.
- App: "Remind supplier" on the supplier's sheet in Taxes, an editable message, "Send
  from my phone", the preview, "Yes, send it", then the share sheet and a "Copy
  message" fallback.

## Acceptance criteria

- For the engine's fixtures, each mismatch class is raised once with the right reason.
- An item closes by itself when a later 2B shows the bill.
- No code path sends a reminder without a confirmation event from a member.
- The money at risk shown equals the tax on the unmatched bills.

## Out of scope

The Invoice Management System accept and reject actions on the portal, vendor scoring,
holding back supplier payments.

## Open questions

- Does the owner want a monthly summary of supplier behaviour, or only the exceptions?

## Customer payment reminders (built 2026-10-17)

The mirror of the supplier reminder, for money owed to the owner. "Who should I chase?"
(or "kis se paisa lena hai") lists every customer with an overdue invoice, largest first,
with a paying score from their last twelve months: usually on time (three or more paid
invoices, at least three quarters on time), sometimes late, late more often than not, or
too new to judge. One consolidated draft per customer, in a tone that matches the score
(gentle, neutral or firm), lists their own invoice numbers, dates, amounts and days late,
asks for one sum, and ends with the bank details from the invoice design. A customer who
paid anything in the last fourteen days is left out and named, so nobody is chased for
money already on its way.

"Send reminder to Retail Mart" (or "Retail Mart ko reminder bhejo") shows the draft as a
preview; on yes the message and the day are kept with the books (`collectionReminders`),
a reminder to check for the payment is set for seven days later, and the phone hands the
text to WhatsApp or any other app. MyCA sends nothing itself. In the app the bell on a
customer's thread opens the same screen (`collection_drafts` is a remote query,
`record_collection_reminder` is previewed and confirmed).

