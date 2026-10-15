# Feature spec 09: Reading documents and POS sales

| | |
|---|---|
| Requirements | FR-CAP-1 to 3 in the [product PRD](../PRD.md) |
| Status | File imports built; reading a supplier invoice (model, off until a key is set), POS sales, forwarding and the per-business address built (2026-10-14 and 15) |
| Code | Importers in `platform/src` (`import-zoho.mjs`, `tally-xml.mjs`, `post-import.mjs`, `import-documents.mjs`), `sprints/sprint-1-tally-ingestion`, `sprints/sprint-2-bank-ocr`; uploads in `cloud/src/api.mjs` |

## What the owner experiences

The owner forwards a supplier's invoice or photographs it. The product reads the
supplier, GSTIN, bill number, date, amounts and tax, and shows a purchase entry to
confirm. In a shop, each sale at the counter appears in the sales register on its own.

## User stories

1. As an owner, I photograph a bill and confirm what the product read.
2. As an owner, I forward a PDF invoice from WhatsApp or email into the app.
3. As a shop owner, my counter sales are in my books without my doing anything.
4. As an owner, I can always open the original document behind an entry.

## Behaviour

### Uploads and imports (built)

- A file is uploaded first and stored by its sha256; an import refers to it by hash.
  Every read re-verifies the hash.
- Tally day book, Zoho Books invoices, bank statements and purchase registers import
  into previews. Importing the same file twice posts nothing.
- A row that cannot be read with certainty is held back and shown with its reason.

### Reading a supplier invoice (built 2026-10-14; off until a model key is set)

```mermaid
flowchart LR
  A[Photo or PDF] --> B[Stored by hash]
  B --> C[Extraction: fields with confidence]
  C --> D[Deterministic checks]
  D --> E[Purchase preview]
  E --> F[Owner confirms]
  F --> G[Posted, linked to the document]
```

- Extraction returns fields, not entries: supplier name, GSTIN, bill number, date,
  line amounts, each tax head, total.
- Deterministic checks run on the fields before any preview: the GSTIN checksum, the
  tax heads against the place of supply, the rate in force on the bill date, the
  arithmetic (lines plus tax equals total), and a duplicate bill number for that
  supplier.
- A field that fails a check or has low confidence is shown as a question on the
  preview. The engine recomputes every total; an extracted total is only compared.
- The entry keeps a link to the document hash so the original is one tap away.
- The extraction service is behind an interface so the model can change. What may be
  sent to it, and where it runs, is PRD question Q3.

### Forwarding into the app (built)

A documents key (Connections in the app) lets a mail relay or scanner post a file to
`POST /v1/inbound/documents`; the file is stored and the owner gets a reminder to read
it (2026-10-15). The app is an Android share target for images, PDFs and text: a bill
shared from the camera, gallery, a mail app or WhatsApp opens Read a bill and is read at
once (2026-10-15, unverified on a device). Every documents key has a forwarding address
(`<token>@<inbound domain>`) once the owner points Email Routing at the relay Worker;
attachments land as documents with a reminder (2026-10-15, needs the domain set up).

### POS sales (built 2026-10-15, except the daily file)

- An inbound API per business with a signed secret: a POS posts a sale, the product
  creates the sales entry. Idempotent on the POS's own sale id. (`POST /v1/inbound/sales`
  with a key made under Connections; the owner sees today's count and total per key and
  turns a key off there.)
- Counter sales to unregistered buyers are recorded individually and reported in the
  return's summary table by the existing GSTR-1 logic.
- A daily summary import (file) for POS systems with no API.
- This is the one flow where entries post without a per-entry confirmation. The owner
  turns it on per POS, sees a daily total to confirm, and can turn it off.

## Acceptance criteria

- For a test set of real invoices, no entry posts with a wrong GSTIN, tax head or total
  without the owner having been shown the doubt.
- The same bill photographed twice produces one entry.
- A POS sale delivered twice produces one entry.
- Every purchase entry created from a document opens that document.

## Out of scope

Reading handwritten bills, bank statement PDFs by image, e-commerce marketplace
settlement reports.

## Open questions

- Q3 and Q7 in the PRD.
- How long are document images kept, and may the owner delete one that backs a posted
  entry? This belongs in the retention policy.

## Documents that arrive on their own (2026-10-16)

A file that reaches the business through an inbound documents key or the forwarding
email address is stored, and then, when the model is switched on, read at once with
`read_document`. The reminder that is created names the supplier, bill number and date
the model saw and carries the file (`documentSha256`, `documentName`); it never carries
an amount, because the engine prices the bill only when the owner opens it. On the phone
the reminder offers "Open the bill", which lands in the bill preview with the file already
read; the owner checks the lines and posts, or corrects. With the model off the reminder
still carries the file, so the same tap opens it for reading by hand.

## Marketplace settlements (D1, 2026-10-16)

`import_settlement` reads a payout report from Amazon, Flipkart, another marketplace or a
gateway: either one amount per row with a description (Amazon's settlement report) or one
row per order with sale, fees, TCS, TDS and settlement value columns (Flipkart's sheet).
Every line is typed as sale, tax, refund, fee, penalty, reimbursement, TCS or TDS 194-O;
the expected payout is the sum of the rows, never a figure the file asserts. The payout is
matched to a bank credit already in the ledger within twelve days, or to the amount the
owner states ("import amazon settlement, bank received 1,23,456"). A shortfall, a payout
not yet in the bank and each penalty become exceptions with the order ids behind them.
`settlement_status` ("did Amazon pay correctly?") shows expected against paid by channel
and the TCS and TDS credits to claim. Nothing posts to the ledger until D2 gives the
settlement orders to settle against.

## Marketplace orders and returns (D2, 2026-10-16)

`import_marketplace_orders` reads an Amazon MTR, a Flipkart GST report or any sheet with
order id, date, delivery state, GST rate and taxable value, and posts the orders as sales
to "<Channel> customers", one invoice per day and delivery state with a line per GST rate,
so GSTR-1 carries them under B2CS by state (never B2CL, whatever the day's total). Each
invoice keeps its order ids and SKUs. Return and refund rows become credit notes against
the order they reverse; a return for an order not in the books is held back by name. When
a settlement from the same channel is then imported, it settles those invoices: the payout
to the bank, fees and penalties to Marketplace fees (5210), TDS 194-O to a receivable
(1150) and GST TCS to a receivable (1210) to be claimed in D3; a shortfall stays
outstanding on the channel. Table 14 of GSTR-1 (supplies through an e-commerce operator)
is not generated yet.
