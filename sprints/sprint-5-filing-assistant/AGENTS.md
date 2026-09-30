# Sprint 5 — Filing Assistant: GSTR-1/3B Prep, E-Invoice Validation, ITR Prep (AIS/26AS + Regime Compare), TDS Threshold Monitor

Build a **zero-dependency, pure ESM** filing-prep toolkit in `sprints/sprint-5-filing-assistant`.
Node v22. Run tests with `npm test` (`node --test "test/*.test.mjs"` — quoted glob, Windows).
Never add code comments. Never add dependencies. Use `import { test } from 'node:test'` and
`assert` from `node:assert/strict`. Numbers stay JS numbers; round on OUTPUT only (r2/r4 from core).

## Directory layout (FIXED — write ONLY files in your ownership list)
```
src/core.mjs             (ALREADY WRITTEN — shared core, READ-ONLY for everyone)
src/gstr1.mjs            (AGENT A — GSTR-1 prep + e-invoice validation)
src/gstr3b.mjs           (AGENT B — GSTR-3B prep + ITC)
src/itr.mjs              (AGENT C — AIS/26AS parse, regime compare, ITR computation)
src/tdsmonitor.mjs       (AGENT C — TDS threshold monitor)
test/gstr1.test.mjs      (AGENT A — one test file)
test/gstr3b.test.mjs     (AGENT B — one test file)
test/itr-tds.test.mjs    (AGENT C — one test file)
src/index.mjs, src/cli.mjs, test/integration.test.mjs  (integration — DO NOT TOUCH)
test/fixtures/sales.csv, inward.csv, ais.csv, 26as.csv, income.csv, payments.csv (ALREADY
WRITTEN — read only; do not modify)
```
Read fixtures with `readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', f), 'utf8')`.

## Shared core (src/core.mjs) — import from it, do not modify
```js
export const NEW_REGIME_2026_27 = { slabs:[{upto:4,rate:0},{upto:8,rate:.05},{upto:12,rate:.15},
  {upto:16,rate:.18},{upto:20,rate:.22},{upto:24,rate:.25},{upto:Infinity,rate:.3}],
  rebate:{upto:12,amount:60000}, standardDeduction:75000, cessRate:0.04 }
export const OLD_REGIME_2026_27 = { slabs:[{upto:2.5,rate:0},{upto:5,rate:.05},{upto:10,rate:.2},
  {upto:Infinity,rate:.3}], rebate:{upto:5,amount:12500}, standardDeduction:50000, cessRate:0.04 }
export function r2(n)      // round to 2 decimals
export function r4(n)      // round to 4 decimals
export function parseAmount(v) // number | '₹1,20,000' | '(80,000)' | '5000-' -> number (NaN when not numeric)
export function prevMonth(ym)  // '2026-08' -> '2026-07'; '2026-01' -> '2025-12'
export function taxOn(taxableInRupees, cfg)
  // -> { base, rebateApplied, cess, total }  (all r2)
  // Slab bands in lakhs (slab 'upto' x 1e5). Rebate (87A) applies when taxable <= rebate.upto*1e5,
  // capped at the rebate amount, never negative. cess = base * cessRate.
```

## Shared fixture semantics (single source of truth)
Supplier state code (the firm) = **27 (Maharashtra)** everywhere. Return period = **2026-08**
(the month the invoices belong to). FY = **2026-27**, assessment year = **2027-28**. All amounts
in INR.

### sales.csv — outward invoices `invoiceNo,date,partyGstin,partyName,partyState,hsn,rate,taxableValue,cgst,sgst,igst,cess,isEcommerce`
- INV-101 | 27AABCT1332L1ZE | state 27 | hsn 6204 | 18% | 100000 | cgst 9000 sgst 9000   (intra B2B)
- INV-102 | 29AABCT1332L1ZA | state 29 | hsn 7204 | 18% | 250000 | igst 45000            (inter B2B)
- INV-103 | (blank)         | state 29 | hsn 6204 | 12% | 300000 | igst 36000            (B2CL — unregistered, >250000)
- INV-104 | (blank)         | state 27 | hsn 6204 | 12% | 80000  | cgst 4800 sgst 4800  (B2CS intra)
- INV-105 | 07AAPCR2333B1ZM | state 07 | hsn 8415 | 0%  | 40000  | tax 0                (nil rated, 6A)
- INV-106 | 29AAACA1888E1ZO | state 29 | hsn 6204 | 18% | 50000  | igst 9000            (inter B2B)
- INV-107 | 12ABCPM1634M1ZV | state 12 | hsn 2710 | 28% | 120000 | igst 33600           (inter B2B)
- INV-108 | 27AABCT1332L1ZE | state 27 | hsn `ABC`| 18% | 8000   | cgst 1000 sgst 1000  (E-INVOICE VIOLATIONS — see below)
- INV-109 | (blank)         | state 33 | hsn 6204 | 5%  | 40000  | igst 2000            (B2CS inter)
- INV-110 | (blank)         | state 27 | hsn 6204 | 12% | 50000  | cgst 3000 sgst 3000  (B2CS intra)
B2C split rule: partyGstin blank → B2C. Value > 250000 → B2CL (invoice-wise, state×rate rows);
≤ 250000 → B2CS (state×rate consolidated rows within the period). Blank gstin + rate 0 → nil (6A).

### inward.csv — purchase register `invoiceNo,date,supplierGstin,supplierName,hsn,rate,taxableValue,cgst,sgst,igst,isInputService,itcEligible,itcAvailability`
- INV-201 | 27AABCT1332L1ZE | 18% | 200000 | cgst 18000 sgst 18000 | input svc N | eligible Y | avail Y
- INV-202 | 29AABCT1332L1ZA | 18% | 150000 | igst 27000 | N | Y | Y
- INV-203 | 12ABCPM1634M1ZV | 28% | 80000  | igst 22400 | input svc Y | Y | Y
- INV-204 | 33AAACA1888E1ZZ | 12% | 60000  | cgst 3600 sgst 3600 | N | Y | **avail N** (blocked — ITC ineligible)
- INV-205 | (blank — import of services) | 18% | 250000 | igst 45000 | input svc Y | Y | Y
- INV-206 | 19AAACS3559D1ZD | 18% | 30000  | cgst 2700 sgst 2700 | N | **eligible N** (personal use) | Y
ITC eligibility: row lands in "ITC available" ONLY when itcEligible Y AND itcAvailability Y AND
taxable > 0. Otherwise it goes to 4(D) ineligible. Import of services (blank gstin) is tracked
separately in `importServicesIgst` but still counts in the IGST available total.

### ais.csv — AIS `assessmentYear,informationType,sectionDescription,incomeType,transactingEntity,amount,tds,periodStart,periodEnd`
2027-28: interest 120000 (TDS 0) · dividend 50000 (TDS 12500) · rent 240000 (TDS 0) ·
capital (STCG) 30000 (TDS 0). AIS total income 440000, AIS total TDS 12500.

### 26as.csv — `fy,deductor,tan,section,period,amount,tds`
2026-27: section 192 salary 3000000 / TDS 45000 · section 194 dividend 50000 / TDS 12500.
26AS total TDS 57500.

### income.csv — ITR inputs `nature,value,note`
salary 3000000 · business_profit 1500000 · other_interest 50000 · deduction_80c 150000 ·
deduction_80d 50000. Deductions (80C/80D) apply to the OLD regime only.

### payments.csv — vendor payment ledger for TDS monitoring `fy,payee,section,date,amount`
2026-27: Raj Contractors 194C 50000 (Jul) + 60000 (Aug) · Tech Pro 194J 35000 ·
Shelter RE 194I 400000 · Finance Bank 194A 45000.

## Rules
### GSTR-1 (from sales.csv) — period = month of the invoice date ('2026-08')
- inter/intra: partyState code != supplierState (27) → inter (igst; cgst=sgst=0). Same → intra.
- E-invoice checks, ONLY for rows with non-blank partyGstin (skip blank-gstin B2C rows):
  `{ invoiceNo, code, message }` codes (one entry per violation):
  - `INVALID_GSTIN` — partyGstin fails /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z$/
  - `STATE_MISMATCH` — partyGstin.slice(0,2) !== partyState (after STATE_MISMATCH skip tax checks)
  - `INVALID_HSN` — hsn not /^[0-9]{4,8}$/
  - `TAX_MISMATCH` — |(cgst+sgst+igst) − round(taxable×rate/100)| > 1
  - `RATE_UNKNOWN` — rate not in {0,5,12,18,28}
  - `NEGATIVE_VALUE` — any of taxable/cgst/sgst/igst < 0
  Violating rows are EXCLUDED from every GSTR-1 table.
- `buildGstr1({ sales rows, supplierState=27 })` → `{ period, tables, totalTaxable, errors }`
  with tables:
  - `b2b`: [{ invoiceNo, gstin, partyName, state, hsn, rate, taxable, cgst, sgst, igst }] — invoice-wise, sorted by invoiceNo
  - `b2cl`: [{ state, rate, taxable, cgst, sgst, igst }] — state×rate aggregate, sorted state then rate
  - `b2cs`: [{ state, rate, taxable, cgst, sgst, igst }] — state×rate aggregate, sorted state then rate
  - `nilExempt`: [{ rate, taxable }] — rate 0 rows summed (6A nil rated); sorted by taxable desc then rate
  - `hsn`:   [{ hsn, uqc:'NOS', qty, taxable, igst, cgst, sgst }] — HSN 4/6/8-digit summary over ALL
    non-violating rows incl. nil; qty = invoice count; sorted by hsn asc
  - `totalTaxable` = b2b+b2cl+b2cs+nilExempt taxable sums.

### GSTR-3B (from sales.csv + inward.csv) — period '2026-08'
- Outward from sales (reuse same inter/intra + rate logic; excluding 4(D)-style errors — nil excluded):
  - `3.1a`: [{ rate, interState (bool), taxable, cgst, sgst, igst }] — aggregated, sorted rate asc
    (inter before intra on equal rate? NO — intra first, then inter, then next rate). Int: intra row
    first. Present rate-rows only when taxable > 0.
  - `3.1e` (nil rated & exempt): taxable 40000.
  - `outwardTotals`: { interTaxable, interIgst, intraTaxable, intraCgst, intraSgst }.
- ITC from inward:
  - `itc.available`: { igst, cgst, sgst } — eligible rows only.
  - `itc.importServicesIgst` — IGST on blank-gstin import rows (already inside available.igst).
  - `itc.ineligible` (4(D)): { igst, cgst, sgst } — rows where eligibility or availability fails.
  - `itc.netItc` = available.igst + available.cgst + available.sgst.
- `buildGstr3b({ sales rows, inward rows, supplierState=27 })` → `{ period, outward, itc }`.

### ITR (AIS/26AS + regime compare) — FY 2026-27
- Income aggregation from income.csv: gti = salary + business_profit + other_interest.
  `deduction_80c`/`deduction_80d` reduce income under OLD regime only.
- Standard deduction (salary only) applies in `taxOn` derivation: under new regime taxable =
  gti − 75000 (unless gti ≤ salary component → cap at salary); old regime taxable =
  gti − 50000 + (80C + 80D). Use the configs' standardDeduction values; the engine computes
  both regime taxables from the same gti (flat gti − deduction; deductions always available).
- `buildItr({ ais, tds26, income, fy })` →:
  ```
  { gti, deduction80c, deduction80d,
    taxable: { newRegime, oldRegime },
    tax: { newTotal, oldTotal },              // taxOn totals
    recommended: 'new' | 'old',               // lower total; tie -> 'old'
    savings,                                  // |newTotal - oldTotal| (r2)
    tdsCredit: { salary, other, total },      // salary = 192 rows sum; other = all others
    advanceTax: 0,
    payable,                                  // r2(recommended total - tdsCredit.total)
    reconciliations: {
      aisVsReturn: [{ incomeType, ais, declared, diff }],   // interests only when diff != 0
      unexplainedAis,                                      // sum of diffs
      tds26Total,                                          // sum of 26AS tds
    },
    ok }                                       // ok = unexplainedAis === 0
  ```
  aisVsReturn: declared income mapped by incomeType: salary→salary, dividend→0,
  rent→0, capital→0, interest→other_interest. diff = ais − declared.
- TDS: `tdsCredit.total` = 57500; `payable` = recommended total − 57500 (never negative).

### TDS threshold monitor (payments.csv) — FY 2026-27
- Threshold config (agent C owns this map):
  194A → { single: 40000 }, 194C → { single: 30000, annual: 100000, rate: 0.01 },
  194I → { annual: 240000, rate: 0.10 }, 194J → { single: 30000, rate: 0.10 },
  plus default assumed rates: { 194A: 0.10, 194I: 0.10, 194J: 0.10 }.
- Group payments by (payee, section). For each group compute cumulative FY amount.
  - annual rule (when cfg.annual): if cumulative > annual → one flag { kind:'annual', basis:cumulative }.
  - single rule (when cfg.single): else if ANY payment > single → one flag { kind:'single', basis:max payment }.
  - else no flag.
  - assumedTds = r2(basis × rate). rate = cfg.rate ?? default.
- `monitorTds({ payments, fy })` → [{ payee, section, kind, basis, rate, assumedTds }], sorted payee then section.

## Error contract
Every parser `parseX(text)` returns `{ rows, errors }`; never throw. Missing/invalid value →
`{ code, row, field, message }` (e.g. `BAD_AMOUNT`, `BAD_DATE`, `MISSING_HEADER`). Blank file /
no header → `NO_HEADER_ROW`. Row numbers = 1-based data rows. parseX must not reject rows for
semantic/VAT reasons (those are e-invoice/build-time concerns).

## Module interfaces (EXACT — integration depends on these shapes)

### src/gstr1.mjs — AGENT A (imports core.mjs parseAmount, r2)
```js
export function parseSales(text)            // -> { rows, errors }
// row keys: invoiceNo,date(ISO),partyGstin,partyName,partyState,hsn,rate:(number),
//           taxableValue,cgst,sgst,igst,cess,isEcommerce (booleans stay as strings unless parseable)
export function eInvoiceErrors(rows, supplierState = '27')   // -> [error objects] (rules above)
export function buildGstr1({ sales, supplierState = '27' })  // -> false | { period, tables, totalTaxable, errors }
// where 'sales' are parsed rows. period = prevMonth of the first row date. Returns null-result
// shape `false` when sales is empty (integration uses guard).
```

### src/gstr3b.mjs — AGENT B
```js
export function parseInward(text)           // -> { rows, errors }
// row keys: invoiceNo,date,supplierGstin,supplierName,hsn,rate,taxableValue,cgst,sgst,igst,
//           isInputService,itcEligible,itcAvailability ('Y'/'N' strings)
export function buildGstr3b({ sales, inward, supplierState = '27' })
// -> { period, outward: { rows3a, nilExemptTaxable, totals: { interTaxable, interIgst, intraTaxable, intraCgst, intraSgst } }, itc: { available:{igst,cgst,sgst}, importServicesIgst, ineligible:{igst,cgst,sgst}, netItc } }
// sales: parsed rows from gstr1.parseSales.
```

### src/itr.mjs — AGENT C
```js
export function parseAis(text)              // -> { rows, errors }
export function parseForm26as(text)         // -> { rows, errors }
export function parseIncome(text)           // -> { rows, errors }  (nature,value,note)
export function buildItr({ ais = [], tds26 = [], income = [], fy = '2026-27' })  // -> shape above
```

### src/tdsmonitor.mjs — AGENT C
```js
export function parsePayments(text)         // -> { rows, errors }
export function monitorTds({ payments = [], fy })  // -> [flag rows] (rules above, sorted)
```

## FIXTURE-EXACT EXPECTATIONS (assert these numbers)
GSTR-1 (period 2026-08):
- b2b count 4 (INV-101,102,106,107); totals: taxable 520000, cgst 9000, sgst 9000, igst 87600.
- b2cl: [{state:29,rate:12,taxable:300000,igst:36000}].
- b2cs: [{state:27,rate:12,taxable:130000,cgst:7800,sgst:7800},{state:33,rate:5,taxable:40000,igst:2000}].
- nilExempt: [{rate:0,taxable:40000}].
- hsn rows sorted: 2710|120000|igst33600|qty1; 6204|620000|igst47600? — NO: 6204 igst = INV-103 36000 + INV-106 9000 + INV-109 2000 = 47000, cgst 9000+4800+3000=16800, sgst 16800, qty 6 (101,103,104,106,109,110); 7204|250000|igst45000|qty1; 8415|40000|tax0|qty1.
- eInvoice errors: exactly INV-108 with TAX_MISMATCH and INVALID_HSN (2 entries).
- totalTaxable (b2b+b2cl+b2cs+nil) = 1030000.
GSTR-3B:
- 3.1a rows (rate asc; intra before inter at same rate):
  [{5,inter,40000,igst2000},{12,intra,130000,cgst7800,sgst7800},{12,inter,300000,igst36000},
   {18,intra,100000,cgst9000,sgst9000},{18,inter,300000,igst54000},{28,inter,120000,igst33600}]
  (igst = 45000+9000 for 18 inter).
- outward.totals: { interTaxable:760000, interIgst:125600, intraTaxable:230000, intraCgst:16800, intraSgst:16800 }.
- nilExemptTaxable 40000.
- itc.available { igst:94400 (=27000+22400+45000), cgst:18000, sgst:18000 };
- itc.importServicesIgst 45000;
- itc.ineligible { igst:0, cgst:6300, sgst:6300 };
- itc.netItc = 130400.
ITR (FY 2026-27):
- gti = 4550000; taxable new 4475000 / old 4300000; newTotal 1001000; oldTotal 1146600;
  recommended 'new'; savings 145600; tdsCredit { salary:45000, other:12500, total:57500 };
  advanceTax 0; payable 943500.
- aisVsReturn length 4; unexplainedAis 390000; tds26Total 57500; ok false.
- aisVsReturn rows (incomeType asc): capital ais 30000 declared 0; dividend 50000/0; interest 120000/50000; rent 240000/0.
TDS monitor (FY 2026-27):
- 4 flags: Raj Contractors|194C|annual|basis 110000|rate 0.01|1100;
  Tech Pro|194J|single|basis 35000|0.10|3500; Shelter RE|194I|annual|basis 400000|0.10|40000;
  Finance Bank|194A|single|basis 45000|0.10|4500. Sorted payee then section.

## Style
- Pure functions, no side effects, no console output in src modules (CLI is separate).
- Uppercase acronyms exported. Tests named `GATE N: ...`; one test file per agent; assert the
  exact fixture values above; add a couple of boundary/regression extras (e.g. B2CL 250001 vs
  250000, rate rounding, slab edge with rebate).
- Every number compared with assert.equal (aggregations are exact integers) or assert within a
  0.005 tolerance when derived (percent parsing): prefer exact.

## Verification
1. Write your module(s) + your single test file (import `core.mjs` where needed).
2. Run `npm test` and confirm YOUR gates pass (other agents' files may exist).
3. Report back: files written, gate names, your file's pass/fail summary, assumptions made.
   Do not modify fixtures, src/core.mjs, or integration-owned files.