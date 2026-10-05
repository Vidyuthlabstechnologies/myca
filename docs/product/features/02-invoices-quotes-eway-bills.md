# Feature spec 02: Invoices, quotes and e-way bills

| | |
|---|---|
| Requirements | FR-INV-1 to 6 in the [product PRD](../PRD.md) |
| Status | Invoice creation, the invoice screen, PDF and sharing built; quotes and e-way bill in the flow not built |
| Code | `platform/src/invoice.mjs`, `intent.mjs`, `nic-client.mjs`, `nic-actions.mjs`; app: `mobile/lib/screens/party_screen.dart` |

## What the owner experiences

"Create an invoice for ABC Ltd for Rs. 50,000 for consulting services." The product
shows the invoice with tax worked out. The owner confirms, then taps Send and picks
WhatsApp or email. For goods on the move, the e-way bill is offered on the same screen.

## User stories

1. As an owner, I raise an invoice in one message.
2. As an owner, I open any invoice and see it as my customer will.
3. As an owner, I send the invoice to my customer in two taps.
4. As an owner, I send a quote first and turn it into an invoice when it is accepted.
5. As an owner selling goods, I get the e-way bill without retyping the invoice.

## Behaviour

### Create (built)

- The chat parser reads customer, amount, quantity and rate, GST rate and GSTIN from a
  message. An ambiguous message produces a question, not an entry.
- The preview shows taxable value, each tax head and the total. Nothing is posted until
  the owner confirms.
- Invoice numbers are one sequence per business (INV-0001 onwards). A series per
  financial year or per branch is not built.

### View and send (built 2026-10-06, except the audit event)

- Tapping an invoice in a customer's chat opens it. The screen and the PDF are laid out
  from the read-only tool `invoice_document`, which returns the posted figures, both
  parties, the place of supply by name, receipts and the balance. The app computes
  nothing.
- The tool also reports what the invoice lacks (the seller's GSTIN or address, an HSN
  or SAC code on a line) and the screen says so before the owner sends it. The engine
  used to fill in a textile HSN code when none was given; it now leaves it blank.
- Still missing from the invoice itself: the buyer's address, a unit of measure, and a
  reverse-charge statement. What a tax invoice must carry is set by the CGST Rules
  (Rule 46) and needs the advisor CA's check before owners rely on this PDF.
- Save as PDF and Share use the phone's share sheet, so the message goes from the
  owner's own WhatsApp or email. Nothing is sent by the product on its own.
- To build: sending records an audit event, who shared which invoice and when. The product cannot
  know whether the customer received it and must not claim so.
- A sender in the product's own name (WhatsApp Business API, transactional email) is a
  later option and needs open question Q6 answered.

### Quotes (to build)

- A quote is a document with no ledger effect and no GST liability.
- Accepting a quote creates an invoice preview with the same lines; the owner confirms
  as usual. The invoice refers to the quote.
- Quotes have their own number series and an expiry date.

### E-way bill and e-invoice (partly built)

- The NIC client and the action gate already exist: an e-way bill or IRN request needs
  the live switch and an approval bound to the exact payload.
- To build: transport details on the invoice (vehicle, distance, transporter), the
  offer in the app, and per-business NIC credentials in the hosted service.
- Whether a given invoice needs an e-way bill or an e-invoice is decided by dated rules
  in `sprints/statutory-rules`, never by a constant in the app. Thresholds must be
  verified against the current notifications before this ships.

## Acceptance criteria

- The invoice the customer receives shows the same figures as the posted entry.
- A shared invoice leaves an audit event; a cancelled share leaves none.
- A quote changes neither the trial balance nor any GST draft.
- With the live switch off, no request leaves the product for NIC under any input.
- An e-way bill request cannot be approved by the same person who prepared it where the
  business has more than one member with that right.

## Out of scope

Payment links and collections, recurring invoices, invoice templates and branding
beyond the business name, address and GSTIN.

## Open questions

- Q6 in the PRD: share sheet only, or a business sender?
- Does a single-owner business need a second approver for an e-way bill? Today the gate
  enforces maker and checker; a one-person business cannot satisfy it.
