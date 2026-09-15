# Sprint 6 — Defensible Audit: Full-Population Ledger Scrutiny, SA 230 Working Papers, Schedule III / CARO / 3CD Checks, Engagement Risk Scoring

Build a **zero-dependency, pure ESM** audit engine in `sprints/sprint-6-defensible-audit`.
Node v22. Run tests with `npm test` (`node --test "test/*.test.mjs"` — quoted glob, Windows).
Never add code comments. Never add dependencies. Use `import { test } from 'node:test'` and
`assert` from `node:assert/strict`. Numbers stay JS numbers; round outputs with r2/r4 from core.
Every flag must be **explainable** (a reconstructable why) and every output **deterministic**
(re-running produces byte-identical results). No randomness. No per-token inference.

## Directory layout (FIXED — write ONLY files in your ownership list)
```
src/core.mjs               (ALREADY WRITTEN — shared core, READ-ONLY for everyone)
src/parseledger.mjs        (AGENT A — ledger CSV parser)
src/auditrules.mjs         (AGENT A — full-population rule engine, explainable flags)
src/workingpapers.mjs      (AGENT B — SA 230 working papers + systematic sampling)
src/clausechecks.mjs       (AGENT B — Schedule III / CARO / 3CD checks)
src/risk.mjs               (AGENT C — engagement risk scoring + rollups + exceptions queue)
test/auditrules.test.mjs   (AGENT A — one test file)
test/workingpapers.test.mjs(AGENT B — one test file)
test/risk.test.mjs         (AGENT C — one test file)
src/index.mjs, src/cli.mjs, test/integration.test.mjs  (integration — DO NOT TOUCH)
test/fixtures/ledger.csv   (ALREADY WRITTEN — read only; do not modify)
```
Read fixtures with `readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ledger.csv'), 'utf8')`.

## Shared core (src/core.mjs) — import from it, do not modify
```js
export const SEVERITY_ORDER = ['critical','high','medium','low']
export const RULESET_VERSION = '2026.1'
export function r2(n)          // round to 2 decimals
export function r4(n)
export function parseAmount(v) // '400,000' | 400000 | '(1000)' | '' -> number (NaN if blank junk; '' blank -> NaN)
export function csvCells(line) // CSV line -> array, handles quotes + embedded commas + doubled quotes
export function pad2(n)
export function fmtINR(n)      // en-IN grouped string, 2dp max
```

## Shared fixture (ledger.csv) — single source of truth
Columns: `clientId,date,narration,debit,credit,party,category,tdsSection`. debit/credit are the
two ledger sides — each row carries a positive number in AT MOST ONE column (blank = NaN). Amount
used by all rules = numeric(debit) + numeric(credit), always >= 0. The parser adds
`dataRowNumber` (1-based position in the file, excluding header). Rules reference rows as
`ledger.csv row <N>`.

**As-of date = 2026-09-15** in all fixtures.

| # | clientId | date       | narration                   | DR      | CR      | party         | category   | tdsSection |
|---|----------|------------|-----------------------------|---------|---------|---------------|------------|------------|
|1 | CL-001   | 2026-07-03 | Rent paid - May             | 400000  |         | Shelter RE    | rent       | 194I       |
|2 | CL-001   | 2026-07-03 | Rent paid - May             | 400000  |         | Shelter RE    | rent       | 194I       |
|3 | CL-001   | 2026-07-10 | Contract labour - streetwork| 60000   |         | Raj Contractors| contract  | 194C       |
|4 | CL-001   | 2026-08-05 | Contract labour - sitework  | 60000   |         | Raj Contractors| contract  |            |
|5 | CL-001   | 2026-08-20 | Sales to Retail Mart        |         | 500000  | Retail Mart   | sales      |            |
|6 | CL-001   | 2026-08-25 | Purchase of fabric          | 80000   |         | Fabric Co     | purchase   |            |
|7 | CL-001   | 2026-09-01 | Repairs - machinery         | 120000  |         | MechWorks     | repairs    |            |
|8 | CL-001   | 2026-09-05 | Travel - vendor meet        | 45000   |         |               | travel     |            |
|9 | CL-001   | 2026-09-15 | Salary - July               | 300000  |         | Staff         | salary     | 192        |
|10| CL-001   | 2026-08-08 | Bank charges                | 1500    |         |               | bank_charges|           |
|11| CL-001   | 2026-09-30 | Professional fees - audit   | 35000   |         | Tech Pro      | fees       | 194J       |
|12| CL-001   | 2026-07-15 | UPI transfer out            | 25000   |         |               | transfer   |            |
|13| CL-001   | 2026-07-18 | UPI transfer in             |         | 25000   |               | transfer   |            |
|14| CL-001   | 2026-08-30 | Unidentified vendor expense | 90000   |         | Unknown Vendor| unclassified|          |
|15| CL-003   | 2026-07-12 | Purchase of raw material    | 2000000 |         | Steel Co      | purchase   |            |
|16| CL-003   | 2026-08-14 | Salary and wages            | 900000  |         | Staff         | salary     | 192        |
|17| CL-003   | 2026-09-05 | Loan received from bank     |         | 5000000 | Punjab Bank   | loan       |            |
|18| CL-003   | 2026-09-06 | Interest on term loan       | 60000   |         | Punjab Bank   | interest   | 194A       |
|19| CL-003   | 2026-08-20 | Legal and professional fees | 450000  |         | Law Firm LLP  | fees       | 194J       |
|20| CL-003   | 2026-08-20 | Legal and professional fees | 450000  |         | Law Firm LLP  | fees       | 194J       |
|21| CL-003   | 2026-09-10 | Fixed asset - machinery     | 1500000 |         | MechWorks     | capex      |            |
|22| CL-003   | 2026-07-05 | Computer software           | 250000  |         | SoftCo        | capex      |            |
|23| CL-003   | 2026-08-27 | Misc expenses               | 7000    |         |               | misc       |            |
|24| CL-003   | 2026-08-12 | Zero value entry            | 0       |         |               | misc       |            |

Derived aggregates (used by clause checks):
- contractTotal (CL-001) = 120000; uncoveredContractRows (blank tdsSection) = row 4 → 1.
- rentTotal (CL-001) = 800000, rent 194I rows = 2 (covered).
- capexTotal (CL-003) = 1750000, capex rows 2.
- loanCreditTotal (CL-003) = 5000000 (row 17); interestPaid = 60000 (row 18).
- creditRows with credit > 0 = rows 5, 13, 17 → 3 (all categorized).
- population = 24 rows.

## Rule catalog (auditrules.mjs) — every row inspected, full population
Category→section map for TDS relevance: contract→194C, fees→194J, interest→194A, rent→194I,
repairs→194C. TDS config: 194C { single:30000, annual:100000 }, 194J { single:30000 },
194I { annual:240000 }, 194A { single:40000 }. Accumulation counts UNCOVERED payments only.

Flag shape (each emitted flag carries ALL fields):
```
{ flagId: 'FLG-<NNN>', clientId, ruleId, rule, severity, date, narration, amount, party,
  why, source }   // source = `ledger.csv row <N>`, why explains the exact breach
```
- `AUD-001` DUPLICATE_TRANSACTION (high): group rows by (clientId,date,party,category,amount);
  every occurrence after the first, in file order → flag the LATER row; amount = group amount;
  why cites the earlier row. Fixture: row 2 (dupe of 1), row 20 (dupe of 19).
- `AUD-002` ROUND_TRIP_TRANSFER (medium): within a client, each pair of `transfer` rows — one
  debit, one credit, equal amount, dates <= 14 days apart — ONE flag on the earlier row; amount =
  the shared amount; why names both rows. Fixture: rows 12/13 (25000; 2026-07-15 → 2026-07-18).
- `AUD-003` TDS_NOT_DEDUCTED (medium): for TDS-relevant payment rows with blank tdsSection, per
  (clientId, party, section): a row is flagged when its single amount > singleLimit (for sections
  with singleLimit) OR the party-level cumulative of UNCOVERED payments > annualLimit (sections
  with annualLimit). One flag per flagged row; basis = the crossing amount; why states the section
  and both the single/cumulative figures. Fixture: row 4 (contract 60000 >= 30000 and uncovered
  cumulative 120000 > 100000), row 7 (repairs 120000 >= 30000).
- `AUD-004` UNCLASSIFIED_EXPENSE (medium): category `unclassified`. Fixture: row 14.
- `AUD-005` FUTURE_DATED_ENTRY (high): transaction date > asOf (strictly). Fixture: row 11
  (2026-09-30 > 2026-09-15).
- `AUD-006` MISSING_PARTY (low): debit>0 rows with blank party, EXCEPT exempt categories
  {salary, bank_charges}. Fixture: rows 8 (travel), 12 (transfer), 23 (misc). Row 10 exempt.
- `AUD-007` CAPEX_CLASSIFICATION (medium): category `repairs` with amount > 100000. Fixture: row 7.
- `AUD-008` ZERO_AMOUNT_ENTRY (low): amount === 0. Fixture: row 24.

`runRules` returns flags SORTED: severity desc per SEVERITY_ORDER, then clientId asc, then ruleId
asc, then source dataRowNumber asc.

### FIXTURE-EXACT FLAGS (asOf 2026-09-15) — assert exactly these 12
1. FLG-001 | CL-001 | AUD-001 | high  | row 2  rent 400000 (dupe of row 1)
2. FLG-002 | CL-001 | AUD-005 | high  | row 11 fees 35000 (2026-09-30 > asOf)
3. FLG-003 | CL-003 | AUD-001 | high  | row 20 legal 450000 (dupe of row 19)
4. FLG-004 | CL-001 | AUD-002 | medium| row 12 transfer 25000 (pair 12↔13)
5. FLG-005 | CL-001 | AUD-003 | medium| row 4  contract 60000 (194C single 30000, uncovered cum 120000>100000)
6. FLG-006 | CL-001 | AUD-003 | medium| row 7  repairs 120000 (194C single 30000)
7. FLG-007 | CL-001 | AUD-004 | medium| row 14 unclassified 90000
8. FLG-008 | CL-001 | AUD-007 | medium| row 7  repairs 120000 (repairs >100000)
9. FLG-009 | CL-001 | AUD-006 | low   | row 8  travel 45000
10. FLG-010 | CL-001 | AUD-006 | low  | row 12 transfer 25000
11. FLG-011 | CL-003 | AUD-006 | low  | row 23 misc 7000
12. FLG-012 | CL-003 | AUD-008 | low  | row 24 zero 0
Totals: 12 flags — high 3, medium 5, low 4. CL-001 = 9 flags (high 2, medium 5, low 2),
flaggedAmount = 400000+35000+25000+60000+120000+90000+120000+45000+25000 = 940000.
CL-003 = 3 flags (high 1, medium 0, low 2), flaggedAmount = 7000+0 = 7000.

## Working papers (workingpapers.mjs) — SA 230 audit documentation
- One working paper per flag:
  `{ wpId: 'WP-<NNN>', clientId, ruleId, procedure, evidence, finding, conclusion,
     preparer: 'audit-engine', date: asOfISO }`
  - procedure = `Run ${ruleId} (${rule}) over full population`
  - evidence = `ledger.csv row <N> — ${narration} (₹${amount})`
  - finding = the flag's `why`
  - conclusion = 'Exception - follow up'
- One summary paper `WP-SMP` for the sample: procedure `Systematic audit sample, interval 3,
  population 24`, conclusion 'Nothing noted'.
- `buildWorkingPapers` → `{ workingPapers, sampling }` with workingPapers ordered: WP-001.. per
  flag (same order as runRules), then WP-SMP last.

## Sampling (workingpapers.mjs) — deterministic, no RNG
- sampled rows = parsed rows in FILE ORDER where `dataRowNumber % 3 === 1` → rows
  1, 4, 7, 10, 13, 16, 19, 22 (8 rows: Rent paid, Contract labour #2, Repairs, Bank charges,
  UPI transfer in, Salary and wages, Legal fees #1, Computer software).
- `sampling = { method: 'systematic-interval-3', population: 24, sampleSize: 8,
  rows: ['ledger.csv row 1', ..., 'ledger.csv row 22'] }` in file order.

## Clause checks (clausechecks.mjs) — Schedule III / CARO / 3CD
`runClauseChecks({ rows, flags=[], asOfDate='2026-09-15' })` → checks[] in THIS order; each
`{ clauseId, clause, title, pass, detail, severity }` with severity = pass ? 'info' : 'error':
- `3CD-1` | `3CD 21(b)` | 'Contract payments > ₹1L; each payment covered by TDS 194C'
  detail cites FLG-005 | pass **FALSE**
- `3CD-2` | `3CD 26` | 'Rent > ₹2.4L deducted under 194I' | pass **TRUE**
- `CARO-1` | `CARO 3(i)(a)` | 'Fixed-asset additions disclosed' | pass **TRUE** (₹17,50,000)
- `CARO-2` | `CARO 3(iii)(a)` | 'Borrowings with interest movement disclosed' | pass **TRUE** (₹50L loan, ₹60,000 interest)
- `SCHEDULEIII-1` | `Schedule III` | 'P&L by nature complete — no unclassified expense' | pass **FALSE** (FLG-007)
- `SCHEDULEIII-2` | `Schedule III` | 'Income by nature disclosed for all credit entries' | pass **TRUE**
2 fails, 4 passes.

## Engagement risk (risk.mjs)
- `riskOf({ flags })` → perClient[] (sorted clientId asc):
  `{ clientId, high, medium, low, flaggedAmount, score, level }`
  - score = min(100, high*20 + medium*10 + low*5 + min(15, floor(flaggedAmount / 100000)))
  - level: >= 80 'critical', >= 50 'high', >= 25 'medium', else 'low'
  - CL-001: 2*20 + 5*10 + 2*5 = 110; + min(15, 9) = 9 → 119 → **score 100, 'critical'**
  - CL-003: 1*20 + 0 + 2*5 = 30; + min(15, 0) = 0 → **score 30, 'medium'**
- `buildEngagement({ flags, clauseChecks=[], clientIds=[] })` →
  `{ perClient, queue, totals:{ clients, rows, flags, high, medium, low }, ok }`
  - queue rows `{ clientId, flagId, ruleId, severity, amount, message }` sorted severity desc,
    then level desc (critical>high>medium>low), then amount desc:
    message = `<SEVERITY> — {clientId}: {rule} on {narration} (₹{amount}), {source}. {why}`
    severity spelled CRITICAL/HIGH/MEDIUM/LOW.
  - queue[0] = CL-001 AUD-001 (duplicate rent, HIGH). totals: clients 2 (clientIds),
    rows 24, flags 12, high 3, medium 5, low 4.
  - ok = flags.length === 0.

## Error contract
`parseLedger(text)` → `{ rows, errors }`, never throws. Error `{ code, row, field, message }`
(row = 1-based data row). Blank/no-header → `NO_HEADER_ROW`. Missing column → `MISSING_HEADER`.
Both sides populated → `BOTH_SIDES`. Non-blank non-numeric side → `BAD_AMOUNT`. Blank columns =
NaN; the parser KEEPS every data row (semantic issues are the rule engine's job, never dropped).

## Module interfaces (EXACT — integration depends on these shapes)
```js
// src/parseledger.mjs (AGENT A)
export function parseLedger(text)     // -> { rows, errors }
// row keys: clientId,date,narration,debit,credit,party,category,tdsSection,amount,dataRowNumber

// src/auditrules.mjs (AGENT A)
export const RULES                     // [{ id, label, severity }] — the 8-rule catalog
export function runRules({ rows, asOfDate = '2026-09-15' })   // -> flags[]
export function flaggedAmountByClient(flags)                   // -> { clientId: number }
export function countsBySeverity(flags)                        // -> { high, medium, low }

// src/workingpapers.mjs (AGENT B)
export function systematicSample(rows)                         // -> { method, population, sampleSize, rows }
export function buildWorkingPapers({ flags, asOfDate = '2026-09-15', rows = [] })
//  -> { workingPapers, sampling }

// src/clausechecks.mjs (AGENT B)
export function runClauseChecks({ rows, flags = [], asOfDate = '2026-09-15' })  // -> checks[]

// src/risk.mjs (AGENT C)
export function riskOf({ flags })                              // -> perClient[]
export function buildEngagement({ flags, clauseChecks = [], clientIds = [] })
//  -> { perClient, queue, totals, ok }

// src/index.mjs (integration — not you)
export function auditRun({ ledgerText, asOfDate = '2026-09-15' })
//  -> { ledger, flags, workingPapers, sampling, clauseChecks, engagement, summary,
//       rulesetVersion: RULESET_VERSION, ok }
// summary = { population: 24, flags: 12, high: 3, medium: 5, low: 4,
//             riskyClients: ['CL-001'], sampleSize: 8 }   // risky = level >= 'high'
```
ok = flags.length === 0.

## Style & determinism
- Pure functions, no side effects, no console output in src modules (CLI is separate).
- Uppercase acronyms exported. Output NEVER depends on object key order or Math.random.
- Tests: named `GATE N: ...`; one test file per agent; assert the exact fixture numbers above.
  Add 2-3 boundary gates per agent with inline CSVs (do NOT modify the shared fixture): e.g.
  AUD-002 pair at exactly 14 vs 15 days; AUD-003 covered row not flagged but subsequent uncovered
  row is, with cumulative basis; AUD-001 triple-duplicate produces 2 flags; risk score cap at 100;
  MISSING_PARTY exemptions (salary/bank_charges).

## Verification
1. Write your module(s) + your single test file (import `core.mjs` where needed).
2. Run `npm test` and confirm YOUR gates pass (other agents' files may exist).
3. Report back: files written, gate names, your file's pass/fail summary, assumptions made.
   Do not modify fixtures, src/core.mjs, or integration-owned files.