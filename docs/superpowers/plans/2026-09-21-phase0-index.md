# Phase 0: Pilot readiness — plan index

- **Spec:** `docs/superpowers/specs/2026-09-21-phase0-pilot-readiness-design.md`
- **Audit:** `docs/audit/2026-09-21-codebase-audit.md`

The spec covers six independent subsystems, so it becomes seven plans, and each one ships working, tested software on its own. Each plan is written in full immediately before it is executed, so its code steps match the code as it stands at that point. Plan 1 is written now because every other plan builds on it.

| # | Plan | Spec § | Findings closed | Depends on | User-authored piece | Status |
|---|---|---|---|---|---|---|
| 1 | [State isolation](2026-09-21-phase0-plan1-state-isolation.md): routing book view, per-client attachments, client-id rules, verified documents | 6.1–6.4 | C4, H7, H14, M (document swap, backup path traversal on read, half-written documents) | — | — | **Ready** |
| 2 | Action gate: one gate for every external action, firm-user PIN identity, NIC protocol fixes, fetch timeouts | 5 | C2, C3, H8, H9, M (mock persisted as real, Sek, decrypt-ok, secrets in results, timeouts), L (secret-key list) | 1 | — | To write |
| 3a | Statutory rules package: `sprints/statutory-rules`, dated and attested records, `rule(id, onDate)`, golden-case runner, plus the GST engines on top of it | 4.1–4.5, 4.6 (GST rows) | C1, H4, H5, H6 | — (can run in parallel with 1 and 2) | **First golden cases with the advisor CA:** each is an `{input, expected, citation}` the user drafts and the advisor signs off | To write |
| 3b | Income tax, TDS and deadline engines on top of the rules | 4.6 | H1, H2, H3, H18, M (deadline and ITR items) | 3a | Golden cases for the slab, rebate and surcharge boundaries | To write |
| 3c | Parsing and audit-engine fixes | 4.6 | M (Dr/Cr, signed amounts, `Rs.`, IMS, sprint-6 clauses and sampling) | 3a | — | To write |
| 4 | Data integrity and chat preview/confirm: idempotent imports, clearing a book's attachment after a successful import (§6.4), one date parser, GSTIN-first parties, ledger chain, atomic saves, audit hygiene, `TOOL_RISK` classes, proposals | 6.5–6.10 | H10, H11, H12, H13, H15, M (ledger chain, idempotency, Zoho, ReDoS, digest, forged audit events, ok-on-failure), L (validator) | 1, 2 | **Question-versus-command rules** for chat routing | To write |
| 5 | Desktop hardening and shadow harness | 7, 8.4 | H16, M (port squat, print window, backup restore), L (framing, vault, CSV) | 2, 4 | — | To write |
| 6 | Release pipeline | 8.1 | H17, M (tag injection, release-job scope, signing, uptime, CI vars), L (infra) | — (before any public download) | — | To write |
| 7 | Docs sync: README/STATUS counts, AGENTS.md invariants, superseded sprint specs | 9 step 5 | Docs drift | all | — | To write |

**Order.** Run Plan 1 first. Plans 2 and 3a–3c can then run in parallel, followed by 4 and then 5. Plan 6 is independent of all the others and is only needed before the first public download. Plan 7 comes last.
