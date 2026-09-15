# Sprint 4 — Deadline Engine, Automated Doc Collection, Compliance Dashboard

Build a **zero-dependency, pure ESM** compliance tool in `sprints/sprint-4-deadlines`.
Node v22. Run tests with `npm test` (`node --test "test/*.test.mjs"` — quoted glob, Windows).
Never add code comments. Never add dependencies. Use `import { test } from 'node:test'` and
`assert` from `node:assert/strict`.

## Calendar core (ALREADY WRITTEN — read-only, import from it, do not modify)
`src/calendar.mjs` exports:
```js
export const URGENT_DAYS = 2;            // <= 2 calendar days -> 'urgent'
export const DUE_SOON_DAYS = 7;          // <= 7 calendar days -> 'due_soon'
export function addDays(iso, n)          // 'YYYY-MM-DD', n can be negative -> ISO
export function isWeekend(iso)           // Sat/Sun
export function nextWorkingDay(iso, holidays = []) // skip Sat/Sun + ISO strings in holidays
export function daysUntil(due, asOf)     // integer calendar days
export function escalationLevel(daysUntilValue)  // 'overdue' | 'urgent' | 'due_soon' | 'on_track'
                                                    // <0 overdue; 0..2 urgent; 3..7 due_soon; >7 on_track
export function fyOf(ym)                 // 'YYYY-MM' -> FY label '2026-27' (Apr start; '2026-02' -> '2025-26')
export function monthBounds(ym)          // -> { start:'2026-09-01', end:'2026-09-30' }
```

## Directory layout (FIXED — write ONLY files in your ownership list)
```
src/calendar.mjs          (ALREADY WRITTEN — shared core, READ-ONLY for everyone)
src/deadlines.mjs         (AGENT A)
src/clients.mjs           (AGENT B)
src/docs.mjs              (AGENT B)
src/dashboard.mjs         (AGENT C)
test/deadlines.test.mjs   (AGENT A — one test file)
test/clients-docs.test.mjs (AGENT B — one test file)
test/dashboard.test.mjs   (AGENT C — one test file)
test/fixtures/clients.csv, docs.csv, holidays.csv (ALREADY WRITTEN — read only)
src/index.mjs, src/cli.mjs, test/integration.test.mjs  (integration — DO NOT TOUCH)
```
Shared fixtures live in `test/fixtures/`. Read them with
`readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', f), 'utf8')`.

## Shared fixture semantics

### clients.csv — 4 clients
`clientId,name,tier,entity,turnover,gst,qrmp,tdsDeductor,pf,advanceTax,tp`
- CL-001 Sunrise Industries | PREMIUM | proprietor | 9500000 | gst TRUE | qrmp FALSE (monthly) | tds TRUE | pf FALSE | adv FALSE
- CL-002 Dr. Sharma Clinic | STANDARD | individual | 4000000 | gst FALSE | tds FALSE | pf FALSE | adv FALSE
- CL-003 Greenfields Pvt Ltd | BUSINESS | company | 280000000 | gst gTTRUE monthly | tds TRUE | pf TRUE | adv TRUE | tp TRUE
- CL-004 Quick Mart Traders | STANDARD | proprietor | 40000000 | gst TRUE | qrmp TRUE (quarterly) | tds FALSE | pf FALSE | adv FALSE
Booleans appear as TRUE/FALSE (case-insensitive parse; accept 'true'/'yes'/'1' too). turnover is an integer >= 0.

### docs.csv — received-documents ledger (client filings, prior years' ITR etc.)
`clientId,period,returnType,docType,status,receivedDate,source`
status ∈ received | pending. receivedDate ISO or empty for pending. source ∈ portal|whatsapp|email.
Row set:
- CL-003 | 2026-08 | GSTR-3B | gstr2b | received | 2026-09-03 | portal
- CL-003 | 2026-08 | GSTR-3B | purchase_register | received | 2026-09-05 | whatsapp
- CL-003 | 2026-08 | GSTR-3B | sales_register | pending
- CL-001 | 2026-08 | GSTR-3B | gstr2b | received | 2026-09-04 | email
- CL-001 | 2026-08 | GSTR-3B | purchase_register | pending
- CL-001 | 2026-08 | GSTR-3B | sales_register | pending
- CL-004 | Q2 2026-27 | GSTR-3B | gstr2b | received | 2026-09-05 | portal
- CL-004 | Q2 2026-27 | GSTR-3B | purchase_register | received | 2026-09-02 | email
- CL-004 | Q2 2026-27 | GSTR-3B | sales_register | received | 2026-09-06 | whatsapp

### holidays.csv — `date` column, ISO. Real 2026 holidays: 2026-08-15, 2026-10-02, 2027-01-26.

## Statutory rules (single source of truth — same math in every module that needs it)

Derived profile from a raw client row (`profileOf`):
- `gstMonthly` = hasGst && !gstQuarterly
- `gstQuarterly` = hasGst && qrmpTruthy
- `audit` (Sec 44AB): entity 'company' → true; 'individual' → turnover > 500000;
  proprietor/partnership/llp/firm → turnover > 1000000; other entities → turnover > 1000000.
  (CL-001 95L → false; CL-002 40L → false; CL-003 company → true; CL-004 4Cr → true)
- `tp` (transfer-pricing report) → ITR due shifts to 30 Nov.

Return schedule — day-of-month BEFORE weekend/holiday adjustment; dueDate ALWAYS via
`nextWorkingDay(day, holidays)`:
- GSTR-1 monthly (gstMonthly): 11th; period = previous month `YYYY-MM` (Sep dues are for '2026-08').
- GSTR-3B monthly (gstMonthly): 20th; period = previous month.
- GSTR-1 QRMP (gstQuarterly): 13th, only in months 01/04/07/10; period = `Q{n} {fy}` of that
  quarter of the FY started Apr (Jul → Q1, Oct → Q2, Jan → Q3, Apr → Q4).
- GSTR-3B QRMP (gstQuarterly): 22nd, only in months 01/04/07/10; period = `Q{n} {fy}`.
- GSTR-7 monthly (tdsDeductor): 10th; period = previous month.
- TDS_QUARTERLY (tdsDeductor): 31 Jul (Q1) / 31 Oct (Q2) / 31 Jan (Q3) / 31 May (Q4) —
  add only in the due month (07/10/01/05). period = `Q{n} {fy}`.
- PF monthly (pf): 15th; period = previous month.
- ADVANCE_TAX (advanceTax): 15 Jun / 15 Sep / 15 Dec / 15 Mar, added only in those months.
  period = `FY {fyOf(month)}` — for Sep 2026 → 'FY 2026-27'.
- ITR annual: due **31 Jul** (no audit), **31 Oct** (audit or company), **30 Nov** (tp).
  Added only in the due month (07/10/11). period = `FY {fy of the FY BEFORE the due year}`
  e.g. due Nov 2026 → 'FY 2025-26'. (assessment year 2026-27)
- GSTR-9 annual (gstMonthly ONLY — QRMP filers exempt): 31 Dec, month 12. period = `FY {fy-1}`
  e.g. Dec 2026 → 'FY 2025-26'.
Every deadline entry: `{ clientId, returnType, returnLabel, period, dueDate }` where returnLabel
is a human string like 'GSTR-3B (monthly)' / 'ITR (audit)'.

### FIXTURE-EXACT due dates (assert THESE; engine must reproduce them via calendar core)
As-of date used everywhere in fixtures: **2026-09-07** (a Monday).
| client | return | due month | period | dueDate |
|--------|--------|-----------|--------|---------|
| CL-001 | GSTR-1 | 2026-09 | 2026-08 | 2026-09-11 |
| CL-001 | GSTR-3B | 2026-09 | 2026-08 | 2026-09-21 |
| CL-001 | GSTR-7 | 2026-09 | 2026-08 | 2026-09-10 |
| CL-001 | GSTR-1 | 2026-10 | 2026-09 | 2026-10-12 |
| CL-001 | GSTR-7 | 2026-10 | 2026-09 | 2026-10-12 |
| CL-001 | GSTR-3B | 2026-10 | 2026-09 | 2026-10-20 |
| CL-001 | TDS_QUARTERLY | 2026-07 | Q1 2026-27 | 2026-07-31 |
| CL-001 | TDS_QUARTERLY | 2026-11 | Q2 2026-27 | 2026-11-02 |
| CL-001 | ITR | 2026-07 | FY 2025-26 | 2026-07-31 |
| CL-001 | GSTR-9 | 2026-12 | FY 2025-26 | 2026-12-31 |
| CL-002 | ITR | 2026-07 | FY 2025-26 | 2026-07-31 |
| CL-003 | GSTR-1 | 2026-09 | 2026-08 | 2026-09-11 |
| CL-003 | GSTR-3B | 2026-09 | 2026-08 | 2026-09-21 |
| CL-003 | GSTR-7 | 2026-09 | 2026-08 | 2026-09-10 |
| CL-003 | PF | 2026-09 | 2026-08 | 2026-09-15 |
| CL-003 | ADVANCE_TAX | 2026-09 | FY 2026-27 | 2026-09-15 |
| CL-003 | PF | 2026-11 | 2026-10 | 2026-11-16 |
| CL-003 | ITR | 2026-11 | FY 2025-26 | 2026-11-30 |
| CL-004 | GSTR-1 QR | 2026-07 | Q1 2026-27 | 2026-07-13 |
| CL-004 | GSTR-3B QR | 2026-07 | Q1 2026-27 | 2026-07-22 |
| CL-004 | GSTR-1 QR | 2026-10 | Q2 2026-27 | 2026-10-13 |
| CL-004 | GSTR-3B QR | 2026-10 | Q2 2026-27 | 2026-10-22 |
| CL-004 | ITR | 2026-11 | FY 2025-26 | 2026-11-02 |
| CL-004 | (NO GSTR-9 — QRMP) | — | — | — |
Sep window (2026-09): CL-002 → NO deadlines. CL-004 → NO deadlines (quarterly filer quiet month).
Escalation at asOf 2026-09-07 (assert these levels for the Sep-window deadlines):
- CL-001 GSTR-7 → daysUntil 3 → due_soon; GSTR-1 → 4 → due_soon; GSTR-3B → 14 → on_track
- CL-003 GSTR-7 → 3 → due_soon; GSTR-1 → 4 → due_soon; GSTR-3B → 14 → on_track; PF → 8 → on_track; ADVANCE_TAX → 8 → on_track
- CL-001 & CL-002 ITR (due 2026-07-31) → overdue; CL-001 & CL-003 TDS_QUARTERLY Q1 → overdue.
Counts at asOf 2026-09-07 across Sep window: overdue 4 (CL-001 ITR, CL-001 TDQ1, CL-002 ITR, CL-003 TDQ1),
urgent 0, due_soon 4, on_track 5 (GSTR-3B x2, PF, ADV, + CL-001? no — CL-001 GSTR-3B counts; so 5).

## Error contract
CSV parsers return `{ rows, errors }`, each error `{ code, row, field, message }`.
Never throw on bad input. Missing required column → `MISSING_COLUMN`. Garbage/missing file
content → `NO_HEADER_ROW`. Row numbers = 1-based data rows.

## Module interfaces (EXACT — integration depends on these shapes)

### src/deadlines.mjs — AGENT A (imports calendar.mjs)
```js
export function profileOf(rawClientRow)
// -> { clientId, name, tier, entity, turnover, hasGst, gstMonthly, gstQuarterly,
//      tdsDeductor, pf, advanceTax, audit, tp }
// Booleans derived per the statutory rules above (hasGst = gst col truthy).

export function returnsFor(profile)
// -> [{ code, label }] — the return types this client files (no dates yet).
// label like 'GSTR-3B (monthly)', 'ITR (audit)', 'GSTR-1 QRMP'.

export function listDeadlines({ clients, months, holidays = [] })
// clients: raw client rows []; months: ['YYYY-MM', ...] window.
// -> deadlines[] sorted by (dueDate asc, clientId asc, returnType asc), each
//    { clientId, returnType, returnLabel, period, dueDate }
// Applies the schedule table above; dueDate = nextWorkingDay(rawDay, holidays).

export function deadlineStatus({ deadlines, asOfDate })
// -> [{ ...deadline, daysUntil, level }] — level = escalationLevel(daysUntil).
```

### src/clients.mjs — AGENT B
```js
export function parseClients(text)
// -> { rows: [rawClientRow], errors }  — rows carry original columns (values trimmed;
//    booleans as strings 'TRUE'/'FALSE'; turnover as number). Never throw.
export function validateClients(rows)
// -> { ok, errors } — duplicate clientId, turnover < 0, missing clientId -> errors.
```

### src/docs.mjs — AGENT B
```js
export function parseDocs(text)
// -> { rows: [{ clientId, period, returnType, docType, status, receivedDate, source }], errors }
export function requiredDocs(returnType)
// -> [docType...]. STATIC map:
//   GSTR-1:        ['sales_register','credit_notes','debit_notes','e_invoice_json']
//   GSTR-3B:       ['gstr2b','purchase_register','sales_register']
//   GSTR-7:        ['tds_challans','deductor_ledger']
//   TDS_QUARTERLY: ['24q_working','challan_register','deductor_ledger']
//   ITR:           ['bank_statements','26as','ais','tally_export']
//   GSTR-9:        ['gstr9_working','reconciliation']
//   PF:            ['pf_challan']
//   ADVANCE_TAX:   ['advance_tax_challan']
export function collectionStatus({ docs })
// -> Map key `${clientId}|${returnType}|${period}` -> { clientId, returnType, period,
//    required: [docType], received: [docType], missing: [docType],
//    completeness /* received/total as 0..1 float */ }
// Required comes from requiredDocs(returnType); a doc row with status 'received'
// satisfies exactly one required docType. Status not 'received' (incl. pending/absent) -> missing.
export function chasePlan({ clients, scope, docs, dueInfo = {} })
// scope: [{ clientId, returnType, period }, ...] (dedupe it internally). For every
// scope item, for EVERY required docType not covered by a received row -> a chase entry.
// dueInfo key `${clientId}|${returnType}|${period}` -> { dueDate, daysUntil } (optional).
// -> [{ clientId, clientName, returnType, period, docType, dueDate|null, daysUntil|null,
//      level, message }]
// level = escalationLevel(daysUntil) when daysUntil present, else 'due_soon'.
// message templates (fill name, docType, returnType, period, dueDate):
//   overdue:  'ACTION REQUIRED — {name}: provide {docType} for {returnType} {period}; due {dueDate}'
//   urgent:   'URGENT — {name}: provide {docType} for {returnType} {period} by {dueDate}'
//   due_soon: 'Reminder — {name}: {docType} for {returnType} {period} needed ahead of {dueDate}'
//   on_track: 'On track — {name}: send {docType} for {returnType} {period} in time for {dueDate}'
// dueDate in message = dueDate (or today + '2026-09-07' implicit if absent).
```

### src/dashboard.mjs — AGENT C (imports calendar.mjs for escalationLevel)
```js
export function escalate(deadlines, asOfDate)
// deadlines sorted as from listDeadlines; -> [{ ...d, daysUntil, level }]

export function dashboard({ clients, deadlines /* enriched with daysUntil+level */,
                            collection /* Map from collectionStatus */, docs })
// -> {
//     perClient: [{ clientId, name, tier, status,           // worst level across client's deadlines
//                   nextDeadline /* {returnType, period, dueDate, daysUntil} | null — earliest
//                                   deadline with daysUntil >= 0; null if none */,
//                   overdue:[...], urgent:[...], dueSoon:[...], onTrack:[...],
//                   completeness /* 0..1 over this client's collection rows; null if none */,
//                   chaseCount /* number of chase entries for this client from docs */ }],
//     totals: { clients, deadlines, overdue, urgent, dueSoon, onTrack,
//               completenessAvg /* mean over clients with non-null completeness, 0..1 */,
//               chaseMessages },
//     alerts: [{ severity /* 'error'|'warning'|'info' */, message }]
//   }
// status: 'overdue' if any overdue deadline, else 'urgent', else 'due_soon', else 'on_track'.
// alerts: one per overdue deadline (severity 'error'), one per urgent deadline ('warning'),
//   one per due_soon ('warning'), one per chase message (severity by level: overdue->'error',
//   urgent->'warning', else 'info').
// FIXTURE-EXACT at asOf 2026-09-07, Sep window:
//   CL-001 status 'overdue', nextDeadline GSTR-7 2026-09-10, completeness 1/3 = 0.3333, chaseCount > 0
//   CL-002 status 'overdue', nextDeadline null, completeness null
//   CL-003 status 'overdue', nextDeadline GSTR-7 2026-09-10, completeness 2/3 = 0.6667
//   CL-004 status 'due_soon' (QR dues in Oct -> after Sep asOf, on_track? CL-004 has NO Sep deadline
//          so status 'on_track'), completeness 1.0000, chaseCount 0
//   totals: clients 4, overdue 4, urgent 0, dueSoon 4, onTrack 5, completenessAvg 0.6667,
//           chaseMessages > 0, ok=false (dashboard.ok = overdue===0 && urgent===0)
//   dashboard() ALSO returns ok boolean.
```

## Style
- Pure functions, no side effects, no console output in src modules (CLI is separate, not yours).
- Uppercase acronyms exported. Keep numbers as JS numbers; round to 2 decimals on output only.
- Tests: named `GATE N: ...`; exactly one test file per agent; assert exact fixture values above.
- Agent A may assert Q1/Q2/QRMP/TP/GSTR-9 row-level extras; Agent B asserts the chase templates
  contain clientName + docType + returnType; Agent C asserts the per-client table above.

## Verification
1. Write your module(s) + your single test file (import `calendar.mjs` where needed).
2. Run `npm test` and confirm YOUR gates pass (other agents' files may exist).
3. Report back: files written, gate names, your file's pass/fail summary, assumptions made.
   Do not modify fixtures, src/calendar.mjs, or integration-owned files.