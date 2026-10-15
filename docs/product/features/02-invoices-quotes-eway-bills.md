# Feature spec 02: Invoices, quotes and e-way bills

| | |
|---|---|
| Requirements | FR-INV-1 to 6 in the [product PRD](../PRD.md) |
| Status | Invoices, the invoice screen, PDF, sharing, payment terms and quotes built; buyer address, share audit, transport details and the e-way bill need check built (2026-10-12); generation waits on the IRN and NIC credentials |
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
- Invoice numbers are one sequence per business (INV-0001 onwards), or one series per
  financial year when the owner asks ("number invoices per financial year":
  `invoiceNumbering: yearly` on the profile; INV-26270001 is the first of 2026-27).
  A series per branch is not built: a branch with its own GSTIN is its own business.

### View and send (built 2026-10-06, except the audit event)

- Tapping an invoice in a customer's chat opens it. The screen and the PDF are laid out
  from the read-only tool `invoice_document`, which returns the posted figures, both
  parties, the place of supply by name, receipts and the balance. The app computes
  nothing.
- The tool also reports what the invoice lacks (the seller's GSTIN or address, an HSN
  or SAC code on a line) and the screen says so before the owner sends it. The engine
  used to fill in a textile HSN code when none was given; it now leaves it blank.
- The buyer's address (built 2026-10-12) is kept on the customer (`set_party_address`,
  "address of Gujarat Mills is 7 Ring Road, Surat", or `partyAddress` on a new
  invoice) and prints under the buyer's name. The document reports `BUYER_ADDRESS` as
  missing for a registered buyer and for a sale of fifty thousand rupees or more to an
  unregistered one (Rule 46(c) and (e)); smaller cash sales need none.
- Still missing from the invoice itself: a unit of measure and a reverse-charge
  statement. What a tax invoice must carry is set by the CGST Rules (Rule 46) and needs
  the advisor CA's check before owners rely on this PDF.
- Save as PDF and Share use the phone's share sheet, so the message goes from the
  owner's own WhatsApp or email. Nothing is sent by the product on its own.
- Sharing is audited (built 2026-10-12): after the share sheet or print dialog closes,
  the app calls `record_share`, which keeps who, when and how on the invoice and in the
  audit log; a cancelled share records nothing. The screen shows how many times and when
  it was last shared, and says MyCA cannot see whether it was delivered.
- A sender in the product's own name (WhatsApp Business API, transactional email) is a
  later option and needs open question Q6 answered.

### Payment terms and due dates (built 2026-10-06)

- Each customer can have terms (`set_payment_terms`, 0 to 365 days; 0 is due on
  receipt), kept by GSTIN, or by name when there is none, and settable before the first
  invoice. A new invoice takes the customer's terms, or its own (`paymentTermsDays`,
  as in "net 45 per their PO"), and gets a `dueDate`. Invoices already raised keep
  theirs; an invoice with no terms has no due date.
- The invoice preview, screen and PDF show the due date and the terms. The customer chat
  shows "Due 20 October" or "Overdue by 24 days" on each open invoice, and a Terms chip.
- Overdue now means past the agreed terms: the dashboard summary and the books check
  report it. The cash forecast uses a customer's actual paying habit when there is one
  and their terms otherwise, and shows both.
- Chat: "Retail Mart pays in 45 days", "set Retail Mart's terms to net 30", "terms for
  Kiran Stores: on receipt", and "… net 45" at the end of an invoice message.
- Supplier terms (built 2026-10-15): `set_supplier_terms` records a supplier's agreed
  days and whether they are a micro or small enterprise (Udyam number optional). A new
  bill carries its pay-by date; for an MSME it comes from the dated MSMED rule (the
  agreed days, at most 45, or 15 with no agreement). `supplier_dues` lists unpaid bills
  by pay-by date and the MSME position under s.43B(h); the week ahead and the app's
  supplier chat show them. Chat: "Fabric Co is MSME, UDYAM-MH-12-1234567, net 30",
  "msme dues".

### Quotes (built 2026-10-06)

- A quote (`quotes.mjs`, QT-0001 onwards) is priced exactly like an invoice: GST split by
  place of supply from the buyer's GSTIN. A GST rate is required and must be one in force
  on the quote date; nothing is assumed. It is valid for 30 days unless another period
  is given. It posts nothing to the books and is in no return.
- States: open, accepted, declined, invoiced, and expired once open past its validity.
- "Make invoice" raises the invoice with the same lines through the usual invoice
  preview, with the customer's payment terms; the invoice carries `quoteId` and the
  quote `invoiceId`. A declined or already-invoiced quote is refused; an expired one is
  allowed, and the preview says it expired.
- The app makes quotes from the customer's chat, shows them there by date with their
  state, and opens them in the invoice screen in quote mode: QUOTATION on screen and on
  the PDF, valid-until, Make invoice, Accepted, Declined.
- Chat: "quote ABC Ltd 50000 for consulting GST 18% valid for 15 days", "QT-0001
  accepted", "make QT-0001 an invoice".

### E-way bill and e-invoice (need, transport and the gated request built 2026-10-12)

- Whether an invoice needs an e-way bill comes from the dated rule
  `gst.ewaybill.threshold` (Rule 138: consignment value above fifty thousand rupees,
  from April 2018) applied to the invoice's goods lines: lines with a SAC starting 99 are
  services and never count; lines without an HSN are counted as goods and the owner is
  told so. For movement within the state the product says some states set a higher
  limit and that it applies the central one. The rule's attestation state is stated.
- Transport details (`set_transport`, "transport for INV-0001: vehicle MH12AB1234, 120
  km, transporter ABC Logistics", or the sheet on the invoice screen): mode, vehicle
  number (needed by road), distance in whole kilometres, transporter name and id, and
  the transport document for rail, air or ship. Previewed, kept on the invoice, no
  figure changes.
- The invoice screen shows the e-way bill card only when one is needed: why, the
  transport, what is still missing, and the number once generated. The PDF prints the
  number.
- `govt_generate_ewb` builds the NIC request from the IRN and the transport details and
  sends it through the action gate (live switch, approval bound to the payload). It is
  refused without transport details or an IRN, and a dry run or a simulated reply never
  stores a number. MyCA generates e-way bills from the e-invoice; the separate e-way
  bill system for businesses outside e-invoicing is not wired.
- Still to build: per-business NIC credentials in the hosted service, generating the
  IRN from the invoice screen, and the e-way bill system route for businesses outside
  the e-invoicing bracket.

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
