# Offline billing on Android (India)

A shop owner can bill with no connection: counter bills, sales to a named customer (B2C or
B2B), item and party lookups, receipts and payments. Bills are saved on the phone first and
reach the books when the phone is back online. This page is the contract between the app
(`mobile/lib/offline/`) and the engine (`platform/src/offline-sales.mjs`).

## Rules that do not bend

1. **One number, one bill.** Each phone gets its own invoice series from the server
   (rule 46(b) of the CGST Rules allows more than one series). A phone never borrows from the
   main `INV-0001` series, so two phones and the server can never hand out the same number.
2. **Nothing is lost.** A bill is written to the phone's outbox, together with the series
   counter, in one atomic file write, before it is shown or printed. Sync is at least once;
   the server makes it exactly once (see idempotency).
3. **The engine is the authority.** The phone computes GST with `lib/offline/invoice_math.dart`,
   a line-for-line port of the engine's arithmetic (`gstSplit` and the line and total rounding in
   `createInvoice`). It is locked to the engine by shared vectors:
   `platform/test/fixtures/offline-invoice-vectors.json` is produced by running the real
   `createInvoice`, a `node --test` fails if the engine's figures move away from the file, and a
   `flutter test` fails if the Dart port moves away from it. On sync the server runs the real
   `createInvoice` again and compares every figure, to the paisa, with what the phone printed.
   A difference is never posted silently: it comes back as a conflict.
4. **Only what can be decided offline is allowed offline.** Exports, SEZ supplies,
   compensation cess and e-invoice-mandated B2B sales need the server and are refused offline
   with a plain reason. So is any date the kit says is locked.

## Invoice numbers

`INV-<series><fy>-<n>`: series is two capital letters (`MA`, `MB`, ...) assigned per device,
`fy` the financial-year code from `fyCodeOf` (`2627` for 2026-27), `n` at least four digits.
Example `INV-MA2627-0001` (15 characters; GST allows 16). The number restarts at 1 each
financial year. Table 13 of GSTR-1 already reports each prefix as its own series
(`documentsIssued` in `gstr1-tables.mjs`). Every tool argument that names an invoice accepts
this shape through `INVOICE_ID_PATTERN` in `tool-schema-parts.mjs`.

A voided offline bill still uses its number: it syncs as the invoice and then a cancellation
(`cancelInvoice`, a full credit note), so the series has no gap.

## Engine tools (India only, hidden from the assistant)

| Tool | Kind | Purpose |
|---|---|---|
| `offline_kit` | query | Everything the phone needs to bill offline for a `deviceId` |
| `register_offline_device` | propose and confirm | Give a device its series, idempotent per `deviceId` |
| `post_offline_sales` | propose and confirm | Post a batch of offline bills, receipts and new items |

How the app calls them (`cloud/src/api.mjs`): `offline_kit` through `/api/query`, whose answer is the
tool result itself (`{ ok: true, data: <kit> }`); the two writes through `/api/propose` then
`/api/confirm { token }`. The confirm answer is the router's
`{ reply, tools: [{ name, result }], posted, confirmed }`; the per-entry results are in
`tools[0].result`. A repeated confirm of the same token answers `{ reply, tools: [], posted, replayed: true }`
without the results, so after a lost confirm reply the phone proposes the same batch again and reads
`already`. The books hold one waiting preview at a time, shared by everyone on the business: a confirm
that answers `TOKEN_MISMATCH` or `NOTHING_PENDING` means someone else proposed in between; propose again.
Owner, accountant and staff (cashier) may all call the three tools; the hosted API has no role check on
propose, confirm or query, only the plan check and the accountant's shared view.

`deviceId` matches `^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$` (a UUID fits). `deviceName` is up to 60
characters (default `Phone`).

### `offline_kit { deviceId }`

```
{ ok: true, data: {
  version: 1, generatedAt, today,                 // ISO time; YYYY-MM-DD on the server
  company: { name, gstin, state, composition, address },
  lockThrough,                                    // '' when nothing is locked
  einvoiceB2b,                                    // true when B2B sales need an IRN at issue (below)
  buyerDetails: { taxablePaiseAtLeast, rule, applies } | null,   // rule 46(e) for today, rules engine
  items: [{ sku, name, barcode, hsn, gstRate, price, unit, onHand }],   // sorted by sku; gstRate, price may be null
  parties: [{ name, gstin, state, address }],
  openInvoices: [{ id, date, partyName, partyGstin, total, due }],   // newest 300 with money due, not cancelled
  series: { code, deviceId, deviceName, lastNumberByFy: { '2627': 12 } } | null } }
```

`buyerDetails.applies` is false when the business has no GSTIN or is a composition dealer (the engine
does not ask for the buyer's details then). `buyerDetails.rule` is the rule record id
(`gst.invoice.unregistered-buyer-details`). `einvoiceB2b` is true when the business is in India,
registered and not composition, and either `company.einvoice === true` or any sale to a registered
buyer already carries a live IRN (`invoice.irn`). The engine holds no turnover threshold for
e-invoicing, so a business that must e-invoice and has not yet issued an IRN through MyCA reads
`false` until it does. An unknown `deviceId` gets `series: null`. A malformed one gets
`{ ok: false, error: 'BAD_DEVICE_ID', hint }`.

### `register_offline_device { deviceId, deviceName }`

Returns `{ ok: true, series: { code, deviceId, deviceName, lastNumberByFy }, created }`. The same
`deviceId` always gets the same series back (`created: false`, the name it was first registered with
kept). A new install has a new `deviceId` and so a new series. Codes are given in order `MA, MB, ...
MZ, NA, ... ZZ` without `I` or `O` in either letter (312 codes; then `SERIES_EXHAUSTED`). The preview
summary is `Give <name> its own invoice series MA: bills made without a connection are numbered
INV-MA2627-0001 onwards.`

### `post_offline_sales { deviceId, sales?, receipts?, items? }`

At most 20 entries in all (`TOO_MANY_ENTRIES`; any one list over 20 fails the schema). Each entry
carries a `ref` of 8 to 64 characters (a UUID made on the phone).

```
sale    = { ref, id, date, createdAt?, partyName?, partyGstin?, partyState?, partyAddress?,
            lines: [{ description, sku?, hsn?, qty, unit?, rate, gstRate }],   // 1-100 lines, gstRate 0-40
            printed: { taxable, cgst, sgst, igst, total },
            payment?: { amount, mode },          // cash | upi | card | bank
            voided?: { reason?, at? },           // at: ISO time; its date is the credit note's date
            acceptEngineFigures?: true }         // owner chose MyCA's figures after a conflict
receipt = { ref, invoiceId, amount, date, mode } // invoiceId: any invoice, offline or not
item    = { ref, sku, name, price, gstRate, hsn?, barcode? }
```

`date` is `YYYY-MM-DD`. `partyName` may be left out (the engine uses `Walk-in`). A sale may also carry
`exportSale`, `supplyType` or a line `cessRate`/`cessPerUnit`; the schema lets them through only so the
engine can refuse that one bill as `NOT_OFFLINE` rather than fail the batch.

A batch with an unregistered `deviceId` is refused as a whole:
`{ ok: false, error: 'UNKNOWN_DEVICE', deviceId, hint }` (also `NOTHING_TO_SYNC`, `TOO_MANY_ENTRIES`).
Otherwise:

```
{ ok: true, series: { code, deviceId, deviceName, lastNumberByFy },
  counts: { posted, already, conflict, rejected },
  results: [ ...items, ...sales, ...receipts ] }   // that order: items first, then sales, then receipts
```

Each entry is applied on its own and gets one result:

```
{ ref, kind: 'sale' | 'receipt' | 'item', status, error?, hint?, id?, engine?, printed?, due?, part?, creditNoteId?, item? }
status = 'posted' | 'already' | 'conflict' | 'rejected'
```

- `id`: the invoice number for a sale and a receipt, the SKU (upper case) for an item.
- `engine` on a sale that posted or got `FIGURES_DIFFER`:
  `{ taxable, cgst, sgst, igst, total, lines: [{ taxable, cgst, sgst, igst, tax, amount }] }`.
  `printed` (the five figures as sent) comes back with `FIGURES_DIFFER` only.
- `due` on a receipt: what is still due on the invoice after it (and on `OVERPAYMENT`, what was due).
- `creditNoteId` on a voided sale once its cancellation is in the books.
- `part: 'payment' | 'void'` when the invoice is in the books but its payment or void could not be
  applied (the status and error are that part's; send the same sale again later and it comes back
  `already` with the part applied).
- `item` on `ITEM_CHANGED`: the server's item in the kit's item shape.

Statuses:

- `already`: the same `ref` was posted before (the reply to an earlier sync was lost). Payment
  and void parts that had not been applied yet are applied now. A voided sale's payment is not
  applied. An item is also `already` when the server has the same SKU with the same name, price, GST
  rate (and HSN and barcode when sent).
- `conflict` errors the owner resolves on the phone:
  `FIGURES_DIFFER` (any of taxable, cgst, sgst, igst, total differs by a paisa or more; nothing is
  written; resend with `acceptEngineFigures`),
  `NUMBER_TAKEN` (another bill already has this number),
  `OVERPAYMENT` (receipt more than `due`), `ITEM_CHANGED` (the server's item differs; the
  server's is kept and returned).
- `rejected`: the engine refused it, with a `hint`: `WRONG_SERIES` (the number is not
  `INV-<this phone's code><the FY of the bill's date>-<4+ digits>`, or is 0), `NOT_OFFLINE` (export, SEZ or
  deemed export, place of supply 96 (outside India), cess, or a B2B sale when `einvoiceB2b`), `PERIOD_LOCKED`,
  `INVALID_DATE`, and the engine's own codes such as `INVALID_GSTIN`, `BAD_LINE`, `COMPOSITION_NO_TAX`,
  `INVOICE_NOT_FOUND`, `INVOICE_CANCELLED`, `BEFORE_INVOICE`, `BAD_RATE` (an item's GST rate over 28,
  which `set_sku_cost` does not take), `BARCODE_IN_USE`, `CREDIT_NOTE_TIME_BARRED`. The phone keeps it
  and the owner can retry after fixing the cause on the server.

The checks on a new sale run in this order: `WRONG_SERIES`, `NOT_OFFLINE`, `PERIOD_LOCKED`,
`NUMBER_TAKEN`, the engine's own checks, then `FIGURES_DIFFER`. The figures come from
`planInvoice`, the same function `createInvoice` posts from, so a refused bill leaves nothing behind.

Every posted invoice carries `source: 'offline'` and
`offline: { ref, deviceId, createdAt, syncedAt }`, and each line keeps the `sku` it was sold as. A
payment or receipt from the phone is a receipt on the invoice with `offlineRef`, `source: 'offline'` and
`deviceId`; a new item keeps its `offlineRef`. The series' `lastNumberByFy` moves to the highest number
seen (posted, already or taken). Offline sales do not move stock, as `create_invoice` does not. Confirming
the batch records the usual `chat.confirm` audit event; its `details[0].entries` lists
`{ ref, kind, status, id?, error?, part? }` for each entry and `details[0].ids` the invoices and SKUs.

The preview summary is `Sync 3 offline bills from Shop counter totalling ₹1,234.00, and 1 receipt and
2 new items.` (the total is the sum of `printed.total`); an unregistered device is a blocker.

### Shared vectors

`platform/scripts/offline-invoice-vectors.mjs` writes the fixture (`node scripts/offline-invoice-vectors.mjs`
in `platform/`). Shape:

```
{ version: 1, seed, date, generator,
  vectors: [{ id, supplierState, partyState, partyGstin,     // partyState is the place of supply; partyGstin '' for B2C
              lines: [{ qty, rate, gstRate }],
              expected: { lines: [{ taxable, cgst, sgst, igst, tax, amount }], taxable, cgst, sgst, igst, total } }] }
```

300 cases from a seeded generator: intra and inter-state, B2C and B2B (valid GSTINs), GST rates 0, 0.1,
0.25, 1, 1.5, 3, 5, 6, 12, 18, 28 and 40, quantities to three decimals, rates such as 0.01, 10.005 and
99999.99, one to six lines. Intra-state when `partyState == supplierState`. `platform/test/offline-sales.test.mjs`
fails if the engine's figures move away from the file.

## On the phone

- `OfflineBilling` owns the device id (kept in secure storage), the kit, the outbox and the
  series counter, all in one JSON file under the app's private directory, written atomically
  (temporary file and rename).
- `OfflineFirstApi` wraps the real `MycaApi`. When a call fails because the server cannot be
  reached (`MycaApiException.code == 'UNREACHABLE'`):
  `propose('create_invoice')` and `propose('record_receipt')` return a local preview,
  `confirm` of that preview saves to the outbox, `query('find_item')` answers from the kit and
  `query('invoice_document')` builds the receipt from the outbox. Online, every call goes to
  the server unchanged.
- Sync runs when the app comes back to the foreground, when the connection returns and every
  few minutes while anything is waiting (backing off to 15 minutes), in batches, one at a time.
- The Offline bills screen lists what is waiting, what synced and what needs the owner, with
  the action for each conflict.
