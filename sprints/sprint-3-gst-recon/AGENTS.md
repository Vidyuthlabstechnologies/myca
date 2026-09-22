# Sprint 3 — GST Reconciliation: Shared Contracts

Build a **zero-dependency, pure ESM** GST reconciliation toolkit in `sprints/sprint-3-gst-recon`.
Node v22. Run tests with `npm test` (`node --test "test/*.test.mjs"` — quoted glob, Windows).
Never add code comments. Never add dependencies. Use `import { test } from 'node:test'` and `assert` from `node:assert/strict`.

## Directory layout (FIXED — do not create files outside your ownership list)
```
src/gstin.mjs            (AGENT A)
src/gstr2b.mjs           (AGENT A)
src/purchaseregister.mjs (AGENT B)
src/match2b.mjs          (AGENT B)
src/gstr1.mjs            (AGENT C)
src/gstr3b.mjs           (AGENT C)
src/matchgstr13.mjs      (AGENT C)
src/rule37a.mjs          (AGENT C)
src/ims.mjs              (AGENT C)
test/<your>-test.mjs     (each agent owns exactly one test file)
test/fixtures/*.csv      (ALREADY WRITTEN — read, do not modify)
src/index.mjs, src/cli.mjs, test/integration.test.mjs (agent integration — do NOT touch)
```
Shared fixtures in `test/fixtures/` are the single source of truth. Read them with
`readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', f), 'utf8')`.

## Money + date parsing rules (implement locally in your module, no shared file)
- Amounts may contain `₹`, thousand commas, parentheses for negatives, trailing minus.
  Parse negative sign: parentheses `(5000)` and leading `-` are negative.
- Dates appear as `DD-MM-YYYY`. Normalize to ISO `YYYY-MM-DD`. Invalid dates → row error.
- CSV headers are case-insensitive; trim cells and strip a UTF-8 BOM; tolerate CRLF.

## Error contract
Every parser returns `{ rows, errors }` where each parser error is
`{ code, row, field, message }`. Errors must never throw. Unknown/missing money
values become `0` unless every money column is empty → then row is dropped with an
error `MISSING_AMOUNT` (row number = 1-based data row).

## Module interfaces (EXACT — integration depends on these shapes)

### src/gstin.mjs — AGENT A
```js
export function validateGstin(gstin) // -> { ok, gstin, stateCode, stateName, pan, panOk, checkDigitOk, errors }
// rules: 15 chars, positions 1-2 state code (valid GST state codes, see STATE_CODES),
//        3-12 PAN (/^[A-Z]{5}[0-9]{4}[A-Z]$/), 13 entity [0-9A-Z], 14 = 'Z',
//        15 = check digit computed by the standard GSTIN mod-36 algorithm
//        (alphabet '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; factor 1,2,1,2... over first 14;
//         check = (36 - (sum % 36)) % 36 -> alphabet[check]).
// ok = all checks passed. checkDigitOk false (not ok) when the checksum mismatches.
export const STATE_CODES = { '01': 'Jammu And Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra And Nagar Haveli And Daman And Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman And Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh' }
```

### src/gstr2b.mjs — AGENT A
```js
export function parseGstr2B(text) // -> { rows, errors }
// GSTR2B row: { section, supplierGstin, supplierName, invoiceNo, invoiceDate, taxableValue, cgst, sgst, igst, cess, totalValue, itcAvailability, sourceRow }
// section from first column (SECTION). itcAvailability normalized to 'Y' | 'N' | 'A'.
// Canonical fixture expectations: first fixture row ->
//   { section:'B2B', supplierGstin:'27AABCU9603R1ZN', supplierName:'ABC TEXTILES PVT LTD',
//     invoiceNo:'INV-1001', invoiceDate:'2025-04-03', taxableValue:100000, cgst:6000, sgst:6000,
//     igst:0, cess:0, totalValue:112000, itcAvailability:'Y' }
```

### src/purchaseregister.mjs — AGENT B
```js
export function parsePurchaseRegister(text) // -> { rows, errors }
// PR row: { gstin, supplierName, invoiceNo, invoiceDate, taxableValue, cgst, sgst, igst, totalValue, sourceRow, isCreditNote }
// isCreditNote: true when invoiceNo starts with 'CN' (case-insensitive) or taxableValue < 0.
```

### src/match2b.mjs — AGENT B
```js
export function match2B({ purchaseRegister, gstr2b, tolerance = 1 })
// purchaseRegister: PRRow[], gstr2b: GSTR2BRow[]
// -> {
//     ok,                                   // true when no unmatched positive invoices in books
//     matched: [{ purchase, invoice, exact, score, amountMismatch }],  // positive invoice + positive 2B row
//     creditNotes: [{ purchase, invoice }],                            // CN matched against CDNR rows
//     unmatched: { inBooksNotIn2B: [PRRow], in2BNotInBooks: [GSTR2BRow] },
//     stats: { purchaseInvoices, b2bInvoices, matchedCount, amountMismatchCount, cnCount }
//   }
// Matching: same supplierGstin (normalized: uppercase, no spaces) AND same invoiceNo
// (normalized: uppercase, strip non-alphanumerics) AND same invoiceDate (ISO). CVs of
// taxableValue within `tolerance` (default 1) -> exact. Outside tolerance but same key ->
// amountMismatch:true, score lower.
// CN rows (isCreditNote / credit-note purchase) match against 2B rows with section 'CDNR';
// positive invoices never match section 'CDNR'. CDNR rows with no book match stay in
// unmatched.in2BNotInBooks only if they carry a positive totalValue; negative CDNR rows with
// no match are still reported under creditNotes as unmatched:{purchase:null,invoice}.
```

### src/gstr1.mjs — AGENT C
```js
export function parseGSTR1(text) // -> { rows, errors }
// GSTR1 row: { buyerGstin, invoiceNo, invoiceDate, taxableValue, cgst, sgst, igst, totalValue, sourceRow, interState, rate }
// interState = igst > 0. rate = computed from tax: round((cgst+sgst+igst)/taxableValue*100), 0 if taxable 0.
// Fixture: S-501 rate 18 interState true; S-503 cgst 1350 sgst 1350 totalValue 17700 rate 18 interState false.
```

### src/gstr3b.mjs — AGENT C
```js
export function parseGSTR3B(text) // -> { rows, errors }
// GSTR3B row: { supplyType, rate, taxableValue, cgst, sgst, igst, totalValue, sourceRow, interState }
// interState = igst > 0.
// Fixture: 'OUTWARD INTER-STATE SUPPLIES' rate 18 taxable 70000 igst 12600; 'OUTWARD INTRA-STATE SUPPLIES' taxable 20000 cgst 1800 sgst 1800.
```

### src/matchgstr13.mjs — AGENT C
```js
export function matchGSTR13({ gstr1, gstr3b })
// -> {
//     ok,                                        // true when every bucket diff within 1
//     buckets: [{ key, rate, interState, gstr1Taxable, gstr3bTaxable, diff, ok }],
//     mismatches: [bucket where !ok],
//     stats: { bucketCount, mismatchCount }
//   }
// Bucket key = `${rate}% ${interState ? 'inter' : 'intra'}`. Sum taxableValue per bucket.
// FIXTURE EXPECTATION: buckets are '18% inter' (70000 vs 70000, ok) and '18% intra'
// (15000 vs 20000, diff -5000, NOT ok). mismatchCount 1, ok false. GSTR-1 intra total = 15000
// (only S-503), GSTR-1 inter total = 70000 (S-501 + S-502).
```

### src/rule37a.mjs — AGENT C
```js
export function flagRule37A({ purchaseRegister, gstr2b })
// -> {
//     blocked:   [{ purchase, invoice, reason, blockedCredit }],   // claim denied by law
//     unclaimed: [GSTR2BRow],                                     // vendor reported, firm never booked
//     summary:   { blockedCount, totalBlockedCredit, unclaimedCount, totalUnclaimedCredit }
//   }
// blocked: (a) book invoice matched to a 2B row whose itcAvailability !== 'Y' ->
//   reason "ITC marked unavailable (supplier default) — credit blocked"; blockedCredit = purchase.totalValue.
//   (b) book invoice that appears in NO 2B row but IS positive (not a CN) ->
//   reason "Invoice absent from GSTR-2B — input credit not available"; blockedCredit = purchase.totalValue.
// Ignore CN purchase rows entirely. FIXTURE EXPECTATION: blocked has 2 entries —
//   INV-1002 (blockedCredit 56000) and INV-1003 (blockedCredit 22400); unclaimed = [FR-201];
//   summary.totalBlockedCredit = 78400, totalUnclaimedCredit = 14160.
```

### src/ims.mjs — AGENT C
```js
export function imsSnapshot(gstr2bRows)
// -> { sections: { [section]: { count, taxable, inputCredit } }, total: { count, taxable, inputCredit } }
// inputCredit per row = cgst + sgst + igst. Keep sections in first-seen order.
// FIXTURE EXPECTATION: B2B count 5, taxable 217000, inputCredit 28560; CDNR count 1, taxable 5000,
// inputCredit 600. total.count 6, total.taxable 222000, total.inputCredit 29160.
export function sectionLabel(section)
// -> human string. Map: B2B 'Business-to-business (table 4A)', B2B-URD 'B2B supplies by unregistered suppliers',
//  CDNR 'Credit and debit notes', B2BA 'Amended B2B documents', ISD 'Input service distributor',
//  IMPS 'Import of services', REV 'Reverse charge', HSN 'HSN summary'. Default: raw section.
```

## Style
- Pure functions, no side effects, no console output in src modules (CLI is separate, not yours).
- Uppercase acronyms exported. Round money to 2 decimals on output. Keep numbers as JS numbers.
- Tests: named `GATE N: ...` with `test('...')`; one test file per agent; assert exact fixture numbers above.

## Verification
1. Write your module(s) + your single test file.
2. Run `npm test` and confirm YOUR gates pass. Do not add a writable fixture; read the shared ones.
3. Report back: which files you wrote, gate names, `npm test` pass/fail summary for your file, and any assumption you had to make.