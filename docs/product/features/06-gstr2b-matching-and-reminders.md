# Feature spec 06: GSTR-2B matching and supplier reminders

| | |
|---|---|
| Requirements | FR-2B-1 to 4 in the [product PRD](../PRD.md) |
| Status | Matching, adding 2B and credit at risk in the app built (2026-10-06); fetching 2B and reminders not built |
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
- To build: marking the bills inside each supplier's chat.

### Remind (to build)

- The product drafts the message: which bills, which month, what is needed. The owner
  can edit it.
- Sending uses the share sheet from the owner's own WhatsApp or email in the first
  version (PRD Q6). Each send is audited.
- No reminder is ever scheduled or sent automatically. A repeat reminder is offered,
  not sent.
- Reminders contain only what the supplier already knows: their own bill numbers,
  dates and amounts.

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
