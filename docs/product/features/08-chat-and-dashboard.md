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

### Dashboard (to build)

- This month and last month for sales, purchases and expenses, each a figure from a
  named query tool.
- Money owed to the owner and by the owner.
- Taxes: as on the Taxes screen. No "amount to pay" until set-off exists
  ([spec 03](03-gst-returns.md)).
- Payroll: after [spec 05](05-payroll.md).
- On a phone the dashboard is the top of Home; on a wide screen it sits beside the
  chat, as the owner's PRD describes.

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
