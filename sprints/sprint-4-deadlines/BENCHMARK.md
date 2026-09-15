# Sprint 4 Benchmark Record — Deadline Engine, Automated Doc Collection, Compliance Dashboard
# Date: 2026-09-07
# Gate status: ✅ ALL 44 TESTS PASS (9 agent-A + 21 agent-B + 8 agent-C + 6 integration)

## What was built
- Shared calendar core (`calendar.mjs`): weekend/holiday-aware `nextWorkingDay`, calendar-day
  `daysUntil`, escalation levels (overdue / urgent / due_soon / on_track at ≤0 / ≤2 / ≤7 / >7
  days), FY labelling (Apr-start, `2026-02` → `2025-26`), month bounds.
- Per-client deadline engine (`deadlines.mjs`): `profileOf` derives statutory booleans —
  GST monthly vs quarterly (QRMP), Sec 44AB audit (company always; individual > ₹50L;
  proprietor/partnership/LLP/firm > ₹1Cr), transfer-pricing flag. `listDeadlines` schedules 8
  return types (GSTR-1, GSTR-3B, GSTR-7, TDS_QUARTERLY, PF, ADVANCE_TAX, ITR, GSTR-9) with
  correct period labels (QRMP/TDS use the covered quarter: Oct dues are Q2 2026-27), every due
  date pushed to the next working day, and GSTR-9 correctly skipped for QRMP filers.
  `deadlineStatus` enriches with daysUntil + escalation level at an as-of date.
- Client + docs ingestion (`clients.mjs`, `docs.mjs`): CSV parsers that never throw; per-return
  required-doc maps; `collectionStatus` completeness (received/required, 0..1); `chasePlan`
  emits one chase message per missing required doc with level-aware templates
  (ACTION REQUIRED / URGENT / Reminder / On track) keyed to each deadline's due date.
- Compliance dashboard (`dashboard.mjs`): per-client status rollup, nextDeadline, completeness,
  chaseCount, totals, alerts, and a single `ok` boolean (overdue===0 && urgent===0).
- Integration orchestrator `complianceRun(...)` + single-command CLI (`--clients`, `--docs`,
  `--holidays`, `--months`, `--as-of`): full pipeline → per-client table → chase messages →
  alerts, with CI exit codes (0 all clear / 1 input error / 2 action required).
- Zero dependencies, pure ESM, Node v22. Rule-first like Sprints 1–3: every due date, level,
  completeness figure, and chase message is derived — nothing charged per run.
- Fixtures: 4 client profiles across entity types + tiers, a 9-row received-doc ledger, and a
  2026 holiday file. As-of date 2026-09-07 (Monday). Full Jul–Dec window = 58 deadlines; the
  engine reproduces every fixture-exact due date (e.g. GSTR-1 Sep due 12 Oct, QRMP Q2 GSTR-1
  due 13 Oct, ITR audit due 2026-11-02, TP ITR due 2026-11-30).

## Benchmark vs Finexo / Aalekh / MNB (practice-management stage)

| Metric                                          | Us              | Finexo    | Aalekh    | MNB        | Δ |
|-------------------------------------------------|-----------------|-----------|-----------|------------|---|
| Per-client deadline engine, all return types    | ✅ 8 types      | ✅        | ✅        | partial    | + |
| Sec 44AB audit + TP due-date logic              | ✅ statutory    | manual    | manual    | –          | + |
| Weekend + holiday working-day adjustment        | ✅ built-in     | partial   | partial   | partial    | + |
| QRMP / monthly / quarterly schedule mix         | ✅ per client   | partial   | partial   | –          | + |
| Escalation (overdue / urgent / due_soon / on_track) | ✅ as-of driven | reminders | reminders | reminders  | + |
| Automated doc chase plan (per required doc)     | ✅ 155 msgs     | –         | –         | –          | + |
| Per-client completeness + chase count           | ✅ 0..1         | –         | –         | –          | + |
| Compliance dashboard + alert queue              | ✅ severity     | partial   | partial   | partial    | + |
| CI-ready exit codes (0/1/2)                     | ✅              | –         | –         | –          | + |
| Cost per run                                    | ₹0 (rule engine)| token fees| token fees| token fees | + |
| Zero-dependency runtime                         | ✅ Node stdlib  | app stack | app stack | app stack  | + |
| Full-window compliance run (58 deadlines) | ~1ms            | N/A       | N/A       | N/A        | — |

Note: competitor figures are directional estimates from public material (matrix rows "Deadline
calendar" and "Client & task tracking" are their shipping surface). Point of attack — competitors
send calendar reminders; we derive the deadline itself, chase every missing document, roll it up
into a per-client dashboard, and gate CI on the result.

## Acceptance criteria
- [x] GATE 1–9 (agent A): statutory profiles, schedule, QRMP, escalation levels, fixture dates exact (9/9)
- [x] GATE 1–21 (agent B): clients/docs parse, completeness, chase templates contain client+dock+return (21/21)
- [x] GATE 1–8 (agent C): dashboard per-client + totals fixture-exact at asOf 2026-09-07 (8/8)
- [x] GATE 1–6 (integration): complianceRun end-to-end, holiday shifts, exit-code CLI, validation (6/6)

## Files
sprints/sprint-4-deadlines/
  src/calendar.mjs              (shared core — weekend/holiday/FY/level)
  src/deadlines.mjs             (profileOf, returnsFor, listDeadlines, deadlineStatus)
  src/clients.mjs               (parseClients, validateClients)
  src/docs.mjs                  (parseDocs, requiredDocs, collectionStatus, chasePlan)
  src/dashboard.mjs             (escalate, dashboard)
  src/index.mjs                 (complianceRun orchestrator)
  src/cli.mjs                   (single-command compliance report, exit 0/1/2)
  test/deadlines.test.mjs, test/clients-docs.test.mjs, test/dashboard.test.mjs,
       test/integration.test.mjs
  test/fixtures/clients.csv, docs.csv, holidays.csv

## What this does NOT cover (Sprint 5)
- Filing assistant — GSTR-1/3B auto-population, ITR prep (AIS/26AS pre-fill, regime compare)
- Live portal downloads (TDS/ITR due-date sync) and WhatsApp/email sending integration
- Multi-ERP write-back (Tally / Zoho)