# Sprint 3 Benchmark Record — GST Reconciliation (GSTR-2B, GSTR-1/3B, Rule 37A, IMS)
# Date: 2026-09-07
# Gate status: ✅ ALL 33 TESTS PASS (13 agent-A + 6 agent-B + 9 agent-C + 5 integration)

## What was built
- GSTIN validation engine — full 15-char structure check plus the standard mod-36 check
  digit; pan structure, entity code, 'Z' position, and all 37 GST state codes validated.
  `STATE_CODES` ships the official state names (01–37).
- GSTR-2B parser (CSV): B2B / B2B-URD / CDNR / B2BA / ISD / IMPS / REV / HSN sections,
  ITC availability normalized to Y/N/A, BOM + CRLF + rupee-thousand amounts tolerated.
- Purchase Register parser: auto-detects credit notes (CN-prefixed invoice or negative
  taxable value), full amount + date normalization.
- 2B vs Purchase Register matcher: supplier GSTIN + invoice-no normalization (case,
  spaces, punctuation) + ISO date key with CV tolerance; amount mismatches flagged with
  a bounded 0–1 score instead of silently "matching".
- GSTR-1 vs GSTR-3B matcher: buckets by rate × inter/intra; per-bucket taxable compare
  with a deterministic diff and `ok` flag (fixture proves the 18% intra −5000 catch).
- Rule 37A flagger: blocked credit when the supplier defaulted (ITC ≠ 'Y') or the
  invoice never landed in GSTR-2B; unclaimed credit when a vendor filed but the firm
  never booked it. Credit notes excluded by law. Summary totals tie out exactly.
- IMS snapshot: section-wise count / taxable / input credit rollups in first-seen order
  plus a human-readable `sectionLabel`.
- Integration orchestrator `reconcile({...}, {clientGstin, asOfDate})`: runs the full
  pipeline, validates the client GSTIN, builds a severity-sorted action queue, and
  derives summary arithmetic (available − blocked = eligible). Plain-language CLI report
  exits 2 when a fixture has known gaps (no silent pass).
- Zero dependencies, pure ESM, Node v22. Same rule-first approach as Sprints 1–2: every
  outcome is reconstructable, nothing is charged per run.

## Benchmark vs GSTAgent / FireAI / CORAA (reconciliation stage)

| Metric                              | Us             | GSTAgent   | FireAI     | CORAA      | Δ |
|-------------------------------------|----------------|------------|------------|------------|---|
| GSTR-2B parse + match vs books      | ✅ full        | ✅         | ✅         | ✅         | = |
| GSTIN validation (mod-36 check digit) | ✅ built-in  | per-API    | partial    | partial    | + |
| GSTR-1 vs GSTR-3B rate×inter buckets| ✅             | partial    | –          | ✅         | + |
| Rule 37A reversal tracking          | ✅ blocked+unclaimed split | ✅ | – | –          | = |
| IMS reconciliation (section-wise)   | ✅ incl. sectionLabel | – | – | ✅ | + |
| Credit-note handling (CDNR/CN)      | ✅ never matches B2B | partial | partial | partial | + |
| Amount-mismatch score (0–1 CV)      | ✅ bounded score | binary match | binary match | binary match | + |
| Exceptions queue, severity-sorted   | ✅ error/warning, plain language | report | report | report | + |
| Traceable / reconstructable output  | ✅ rule-cited, deterministic | partial | partial | ✅ | + |
| Cost per run                        | ₹0 (rule engine) | token fees | token fees | token fees | + |
| Zero-dependency runtime             | ✅ Node stdlib | app stack | app stack | app stack | + |
| Full fixture reconcile              | 2–6ms         | N/A       | N/A       | N/A       | — |

Note: competitor figures are directional estimates from public material. Point of attack —
same as Sprints 1–2: competitors either match binary or hide "AI" reasoning. We emit
matched/exact/score, a cited 37A reason, and per-bucket diffs the firm can attach to
working papers.

## Acceptance criteria
- [x] GATE 1–13 (agent A): GSTIN validation incl. mod-36 check digit + GSTR-2B parser exact on fixtures (13/13)
- [x] GATE 1–6 (agent B): Purchase Register parse + 2B match, CN/CDNR never crosses into B2B (6/6)
- [x] GATE 1–9 (agent C): GSTR-1/3B parse, bucket match (−5000 catch), Rule 37A (blocked 78400 / unclaimed 14160), IMS snapshot exact (9/9)
- [x] GATE 1–5 (integration): end-to-end reconcile surfaces every exception, summary ties, plain-language report (5/5)

## Files
sprints/sprint-3-gst-recon/
  src/index.mjs               (integration orchestrator, toHumanText)
  src/cli.mjs                 (single-command reconcile report)
  src/gstin.mjs, gstr2b.mjs, purchaseregister.mjs, match2b.mjs,
       gstr1.mjs, gstr3b.mjs, matchgstr13.mjs, rule37a.mjs, ims.mjs
  test/gstin-gstr2b.test.mjs, test/match2b.test.mjs, test/outward.test.mjs,
       test/integration.test.mjs
  test/fixtures/gstr2b-b2b.csv, purchaseregister.csv, gstr1.csv, gstr3b.csv

## What this does NOT cover (Sprint 4)
- Deadline engine + automated doc collection
- Live GSTR-2B portal download / e-invoice validation
- Multi-ERP write-back (Tally / Zoho)