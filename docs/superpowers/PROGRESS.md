# MyCA: progress tracker

**Phase 0 (pilot readiness) engineering: 50% complete**

Last updated 2026-09-27 (after H11, H12). Work now happens directly on the main branch (`claude/codebase-audit-review-9cf396`) with no background workflows. The release, statutory-rules, gate and ledger-integrity lanes are merged in. Suite: platform 336/336, every sprint and rules suite green, `npm run stress` passing.

## How the percentage is computed

- Each workstream has a weight for its estimated effort, and the weights add up to 100.
- A task counts toward a plan's share only after **both** its spec review and its code-quality review approve it.
- A plan's final multi-lens review counts as one extra task.
- Formula: `Σ weight × (approved tasks ÷ total tasks)`.
- Owner actions and the phases after Phase 0 are listed but **not** counted.

Weights were rebalanced when you asked for stress testing, to fit the stress campaign (S) inside the same 100 points.

## Phase 0 engineering (counted)

| # | Workstream | Weight | Approved | Contribution | Status |
|---|---|---|---|---|---|
| 0 | Audit, design spec, plan index | 5 | 3 / 3 | 5.0 | ✅ Done |
| 1 | State isolation (C4, H7, H14, documents) | 10 | 8 / 8 | 10.0 | ✅ Done. All tasks reviewed; I did the final integration review myself, not the three-angle panel |
| 2a | Action gate core, NIC fixes, payload-bound approvals, timeouts (C2, C3, H8, H9) | 10 | 2 / 4 | 5.0 | 🔨 Gate core and NIC-through-gate done; left: timeouts and body caps on every client, secret blocklist, provider_doctor, notification mock marking |
| 2b | Firm-user PIN identity | 4 | 0 / – | 0 | ⏳ After Plan 1 (same files) |
| 3a | Statutory rules package and GST engines (C1, H4–H6) | 12 | 4.5 / 5 | 10.8 | 🔨 Rules API and GST rules merged; C1 GSTIN checksum; H6 GSTR-1 dated rates, B2CL, period filter; H4/H5 per-head 2B matching, s.16(2)(aa), Rule 37, Rule 37A, IMS credit-note sign; left: final review |
| 3b | Income tax, TDS, deadlines (H1–H3, H18) | 12 | 5 / 6 | 10.0 | 🔨 Deadlines (H2, H18), income tax on 65 golden cases (H1) and TDS monitor (H3) rebuilt on the rules; left: final review |
| 3c | Parsing and audit engine (mediums) | 7 | 0 / 3 | 0 | ⏳ Starts after the rule areas |
| 4a | Ledger chain, invoice/tax correctness, dates, idempotent imports (H11–H13, H15) | 9 | 3 / 4 | 6.75 | 🔨 Ledger slice merged; invoice/tax slice done (H13 strict dates and lock, H15 GSTIN parties and per-invoice place of supply, CGST=SGST in paise, blocked ITC to cost, DUPLICATE_ID); import slice done (H11 rate never assumed, H12 dedup across Tally, bank and Zoho, Tally XML entities); left: final review |
| 4b | Chat preview/confirm, atomic saves, audit hygiene, TOOL_RISK classes (H10) | 5 | 0 / – | 0 | ⏳ After Plans 1, 2a and 4a merge |
| 5 | Desktop hardening and shadow harness (H16) | 10 | 0 / – | 0 | ⏳ After Plans 2 and 4 |
| 6 | Release pipeline (H17, CI) | 5 | 1 / 2 | 2.5 | 🔨 12 commits; build slice approved; final review in flight |
| 7 | Docs sync | 3 | 0 / – | 0 | ⏳ Last |
| S | Stress testing: recon, then permanent harness and fixes (Plan 8) | 8 | 0 / 2 | 0 | 🔄 Recon: scale, engines-at-scale, HTTP-concurrency and ledger-property findings skeptic-confirmed; crash-consistency and fuzz verification in flight |
| | **Total** | **100** | | **50.05** | |

## Audit findings closed

| Severity | Total | Closed | Open |
|---|---|---|---|
| Critical | 4 | 4 (C1, C2, C3, C4) | 0 |
| High | 18 | 16 (H1–H9, H11–H15, H17, H18) + chat IRN routing | 2 (H10 chat posting, H16 desktop hardening) |

## Owner actions (not counted: need you)

| Item | Needed for | Status |
|---|---|---|
| Name the advisor CA and agree sign-off | Rule attestations (exit criterion 2) | Open |
| Recruit 2–3 pilot CA firms and collect 3 months of filed GSTR-1/3B JSON | Shadow harness (exit criterion 3) | Open |
| Start GSP/ASP, ERI, Account Aggregator (FIU) and NIC production onboarding | Going live; Phases 1+ | Open |
| DPDP Act assessment | Phase 1 | Open |

## After Phase 0 (not counted: each needs its own spec)

Phase 1 cloud compliance core → Phase 2 pipeline and exception queue → Phase 3 mobile client companion → Phase 4 LLM chat agent → filing connections as each onboarding completes.

## Resume table (for interruptions)

If the session restarts, resume each lane with
`Workflow({ scriptPath, resumeFromRunId })`.
Finished agents return cached results, and the lane prompts pick up any commits already on each branch.

- The lanes share one script: `…\workflows\scripts\phase0-lane-wf_bd8193ad-b60.js` (under the session's `projects\…-9cf396\eb7b2413-…` folder).
- "Pass args" means the lane's args must be supplied again when resuming.

| Lane | Branch / worktree | Run ID | Script |
|---|---|---|---|
| Plan 1 finish | `claude/codebase-audit-review-9cf396` (main) | `wf_2570d86b-d55` | `plan1-finish-wf_2570d86b-d55.js` (in the `…-9cf396-platform` projects folder) |
| Stress recon | snapshot copies | `wf_a0a82df9-59d` | `myca-stress-recon-wf_a0a82df9-59d.js` (in the `…-9cf396-platform` projects folder) |
| Engines 3a/3b/3c | `claude/phase0-engines` / `phase0-engines` | `wf_bd8193ad-b60` | lane script (pass args) |
| Gate 2a | `claude/phase0-gate` / `phase0-gate` | `wf_10329df7-c75` | lane script (pass args) |
| Release 6 | `claude/phase0-release` / `phase0-release` | `wf_905e8fff-1ca` | lane script (pass args) |
| Integrity 4a | `claude/phase0-integrity` / `phase0-integrity` | `wf_bf61cd90-538` | lane script (pass args) |
