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

### Dashboard (built 2026-10-06, except payroll and money owed to suppliers)

- Home shows this month against last month for sales (net of credit notes), purchases
  and expenses, from the read-only tool `business_summary`; each figure opens its
  register. Below it, what customers owe in total and the largest five by name.
- Amounts read the Indian way: ₹42,000, ₹3.78 L, ₹1.23 cr.
- Not yet: what the owner owes suppliers, because payments to suppliers are not
  recorded against bills.
- Taxes: as on the Taxes screen. No "amount to pay" until set-off exists
  ([spec 03](03-gst-returns.md)).
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
