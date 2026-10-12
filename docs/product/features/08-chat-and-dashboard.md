# Feature spec 08: Chat and dashboard

| | |
|---|---|
| Requirements | FR-UI-1 to 5 in the [product PRD](../PRD.md) |
| Status | Chats by type and party, one entry sheet and a taxes summary built; free-text understanding and the full dashboard not built |
| Code | `mobile/lib/` (screens, `registers.dart`, `proposal_flow.dart`), `platform/src/intent.mjs`, `receipt-intent.mjs`, `router.mjs`, `assistant-contract.mjs` |

## What the owner experiences

The app opens on chats, grouped by kind: Sales, Purchases, Expenses, Taxes. Under Sales
there is one chat per customer (Rajesh, Suresh); under Purchases one per supplier.
Opening a chat shows that party's history as a conversation. A single "one-chat" entry
takes any message and puts the result in the right place. A dashboard shows sales,
purchases, taxes and payroll at a glance.

## Screens (as built)

| Screen | Purpose |
|---|---|
| Welcome, phone sign-in, name, business setup | Onboarding, including bringing books from Tally, Zoho or a bank statement |
| Home | Greeting, what needs the owner, registers |
| Register | The chats of one kind, one per party |
| Party chat | One customer's or supplier's history; new entry with preview and confirm |
| New entry sheet | One place to start a sale, purchase, receipt or expense |
| Ask | The one-chat entry point |
| Taxes | What needs the owner, GST for one month, the GSTR-1 file, coming deadlines |
| People, Businesses | Members and invitations; switching business |
| Lock | Fingerprint or screen lock |

## Design language

Restrained and typographic. Inter throughout; a warm paper canvas, near-black ink,
hairline dividers, one deep green accent; flat lists with dividers; custom line icons;
no gradients, no pastel tiles, no stock icon set. Money uses tabular figures. The
tokens live in `mobile/lib/theme.dart`.

## Behaviour

### Preview and confirm (built)

Any message that would change the books is answered with a preview of the computed
figures. One tap posts it; anything else discards it. Questions and negations ("did I
invoice Rajesh?", "don't record this") post nothing. This holds in every chat and in
the hosted API (`propose`, `confirm`, `discard`).

### Understanding messages (partly built)

- Today a rule-based parser handles invoices, bills, receipts and expenses in common
  phrasings, and names its doubt when a message is ambiguous.
- To build: a language model that turns free text into a tool call from the fixed
  catalogue with a strict schema. It chooses the tool and fills the arguments; the
  engine computes; the owner confirms. It never produces a figure that is not in the
  message or computed by a tool (principle P5).
- The model sees only what the task needs. Which model, and where it runs, is PRD
  question Q3.

### Home layout (revised 2026-10-07)

- Chat comes first: a "Tell or ask MyCA anything" bar under the business name opens
  Ask with the message already sent. Ask's starting suggestions are owner questions
  (who owes me, who do I owe, cash forecast, reminders, deadlines). "How much GST do I
  pay" answers with the cash to pay after head-by-head set-off ([spec 03](03-gst-returns.md)).
- Below the taxes card and the month's figures, two groups: Your books (sales,
  purchases, expenses, employees) and Money and follow-up (cash, your CA, reminders,
  books check). Employees has its own mark.
- Dates the app writes itself read as words ("20 October 2026", "August 2026"), not
  ISO dates.
- Everything on Home, Taxes, the registers, a customer chat, an invoice and the entry
  sheets fits at 1.5x and 2x text size on a phone-width screen; `test/large_text_test.dart`
  fails on any overflow.

### How the server words things (2026-10-07)

- Every reply, preview and blocker leaving the router, every "needs you" item and every
  books-check finding passes through `words.mjs`: dates read "7 October 2026" and
  months "October 2026". Data fields keep ISO dates for the app.
- Previews say what changes for the owner ("Kiran Stores owes you ₹59,000.00 more",
  "₹20,000.00 goes into your bank"), not debits and credits. Failures say what went
  wrong and that nothing was changed, not "Tool … failed: CODE".
- `test/words.test.mjs` runs everyday messages and fails on ISO dates, debit/credit
  wording, "folio", "ITC" or a raw tool failure in any reply.

### Dashboard (built 2026-10-06, except payroll)

- Home shows this month against last month for sales (net of credit notes), purchases
  and expenses, from the read-only tool `business_summary`; each figure opens its
  register. Below it, what customers owe in total and the largest five by name.
- Amounts read the Indian way: ₹42,000, ₹3.78 L, ₹1.23 cr.
- What the owner owes suppliers, in total and the largest five, net of payments recorded
  against bills. A bill paid outside MyCA shows as owed until its payment is recorded.
- Taxes: as on the Taxes screen, with the cash to pay after set-off
  ([spec 03](03-gst-returns.md)).
- Paid staff: this month's approved payroll against last month's, shown to the owner
  only once a month has been approved; it opens Employees ([spec 05](05-payroll.md)).
- Payroll: after [spec 05](05-payroll.md).
- On a phone the dashboard is the top of Home; on a wide screen it sits beside the
  chat, as the owner's PRD describes.

### Books check (built 2026-10-06)

- `books_check` gives one look at the books, worked out from the engines and changing
  nothing: what came across, whether the books tie, sales the GST return cannot carry,
  input credit against GSTR-2B (or how much credit to check), return due dates that
  passed, money customers owe, missing details (GSTIN, address, HSN codes, supplier
  bill numbers) and other open items. Each finding is "needs you", "check" or "fine",
  with a plain reason and the screen where it is fixed.
- A passed due date is reported as passed, not as late: MyCA cannot see whether a
  return was filed.
- It opens by itself after books are brought across (only when something came across),
  and stays on Home as "Books check". In chat: "check my books".
- This is the self-serve answer to a competitor's free books audit (see
  `docs/research/2026-10-06-lighthaus-revisited.md`).

### Reminders (built 2026-10-06)

- "Remind me" reminders are kept in the books (`reminders.mjs`): what to do, the day,
  and optionally the invoice, bill or party it is about. Adding one and marking it done
  go through preview and confirm, so both are audited with who did it.
- Chat reads "remind me to call Rajesh tomorrow", "remind me about INV-0002 in 3 days",
  "remind me on 15 Oct to pay Mahesh", "remind me next Friday …", and a Hinglish
  "yaad dilana kal …". Days are worked out from today by plain date arithmetic; a
  sentence with no day gets a question, never a guessed day. "my reminders" lists them.
- Home shows a "Due today" panel (today and overdue); tapping one marks it done. The
  Reminders screen adds with quick days (today, tomorrow, in a week, or a picked day).
  An unpaid invoice offers "Remind me", pre-filled to follow up the payment.
- Not yet: phone notifications. They need a push service in the hosted deployment;
  until then reminders appear in the app on the day.

### Cash forecast and "can I afford it" (built 2026-10-06)

- `cash-forecast.mjs` starts from the bank and cash balance the owner states (a dated
  reading that posts nothing to the ledger) plus what MyCA recorded since. Without a
  reading it uses only what was recorded and says plainly that this is not the bank
  statement.
- The next days (30 by default): open invoices expected on each customer's usual
  paying time (the median of their paid invoices), else assumed 30 days; recent bills
  assumed paid 30 days after the bill date; GST on the GSTR-3B due date the deadline
  engine gives, as the cash to pay after head-by-head set-off (not checked against
  GSTR-2B); usual expenses averaged over the last three months and spread
  over the days. Every row carries its basis. Overdue invoices are listed but not
  counted.
- "Can I afford it" takes an amount and a day and answers yes, tight or no from the
  lowest balance in the month after that day, the months of usual outgoings left, and
  what can be spent while keeping a month in hand. The answer is the engine's; the chat
  only picks the question (ADR-0004).
- Chat: "can I afford 40 lakh of stock in September", "cash forecast", "my bank balance
  is 3 lakh". App: a Cash screen from Home.
- Bills count only what is still owed on them. Bills unpaid for more than 30 days are
  listed but not counted: MyCA cannot tell when, or whether outside MyCA, they will be
  paid.
- Not yet: a balance taken from a bank statement automatically.

### Paying suppliers (built 2026-10-06)

- `record_payment` (`invoice.mjs`) pays a bill in part or in full, from the bank or from
  cash: debit the supplier, credit bank or cash. With no amount it pays what is owed.
  Refused: more than is owed, a fully paid bill, a date before the bill, a locked
  period, and more cash than is in hand.
- Chat: "paid BILL-0001", "paid Fabric Co 4200 in cash" (the bill is chosen only when
  one unpaid bill fits; otherwise the bills are listed), "how much do I owe Fabric Co?".
  "Fabric Co paid 500" is money in, and "bought ... GST 5% paid cash" is a new bill;
  neither is read as a payment.
- App: a Paid chip in the supplier's chat, with what is owed filled in; bills show Paid,
  Part paid or Unpaid and each payment.
- Not yet: Rule 37 (credit reversed when a bill is unpaid 180 days after its date) still
  reads payment status from an uploaded purchase register, not from these payments.

### Expense chats (to build)

One chat per expense head or recurring payee, once tagging exists
([spec 01](01-accounting-and-tagging.md)), for example "Stationery purchase".

## Acceptance criteria

- Every figure on the dashboard is returned by a query tool and equals a recomputation
  from the ledger.
- No message posts without a confirm, under any phrasing.
- A message the product does not understand gets a plain reply saying what it can do,
  and records nothing.
- Every screen is usable at the smallest supported phone width and with the system font
  size at its largest.

## Out of scope

Voice input, regional languages, notifications (needs a push service and the
deployment), a tablet or web layout.

## Open questions

- Q3 in the PRD.
- Which three figures matter most to an owner on opening the app? To be tested with
  pilot businesses.
