# MyCA: progress tracker

**Phase 0 (pilot readiness) engineering: 67% complete**

**Whole product to a Play Store launch: about 44% complete** (estimate, see the last section)

Last updated 2026-09-27 (after H10 — every Critical and High finding closed). Work now happens directly on the main branch (`claude/codebase-audit-review-9cf396`) with no background workflows. The release, statutory-rules, gate and ledger-integrity lanes are merged in. Suite: platform 362/362, every sprint and rules suite green, `npm run stress` passing.

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
| 2b | Firm-user PIN identity | 4 | 4 / 4 | 4.0 | ✅ Done: scrypt hashing, 5-strike lockout, session auth, audit attribution |
| 3a | Statutory rules package and GST engines (C1, H4–H6) | 12 | 4.5 / 5 | 10.8 | 🔨 Rules API and GST rules merged; C1 GSTIN checksum; H6 GSTR-1 dated rates, B2CL, period filter; H4/H5 per-head 2B matching, s.16(2)(aa), Rule 37, Rule 37A, IMS credit-note sign; left: final review |
| 3b | Income tax, TDS, deadlines (H1–H3, H18) | 12 | 5 / 6 | 10.0 | 🔨 Deadlines (H2, H18), income tax on 65 golden cases (H1) and TDS monitor (H3) rebuilt on the rules; left: final review |
| 3c | Parsing and audit engine (mediums) | 7 | 0 / 3 | 0 | ⏳ Starts after the rule areas |
| 4a | Ledger chain, invoice/tax correctness, dates, idempotent imports (H11–H13, H15) | 9 | 3 / 4 | 6.75 | 🔨 Ledger slice merged; invoice/tax slice done (H13 strict dates and lock, H15 GSTIN parties and per-invoice place of supply, CGST=SGST in paise, blocked ITC to cost, DUPLICATE_ID); import slice done (H11 rate never assumed, H12 dedup across Tally, bank and Zoho, Tally XML entities); left: final review |
| 4b | Chat preview/confirm, atomic saves, audit hygiene, TOOL_RISK classes (H10) | 5 | 4 / 4 | 5.0 | ✅ Done: H10 preview/confirm, atomic renameSync saves, input capped |
| 5 | Desktop hardening and shadow harness (H16) | 10 | 2 / 4 | 5.0 | 🔨 H16 closed; shadow harness implemented (`scripts/shadow.mjs`); left: remaining desktop hardening |
| 6 | Release pipeline (H17, CI) | 5 | 1 / 2 | 2.5 | 🔨 12 commits; build slice approved; final review in flight |
| 7 | Docs sync | 3 | 0 / – | 0 | ⏳ Last |
| S | Stress testing: recon, then permanent harness and fixes (Plan 8) | 8 | 2 / 2 | 8.0 | ✅ Done: permanent stress harness passing in npm run stress |
| | **Total** | **100** | | **67.05** | |

## Audit findings closed

| Severity | Total | Closed | Open |
|---|---|---|---|
| Critical | 4 | 4 (C1, C2, C3, C4) | 0 |
| High | 18 | **18 of 18** (H1–H18) + chat IRN routing | 0 |

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

## Whole product to a Play Store launch (estimate, added 2026-10-05)

The goal is now an owner-first Android app on the Play Store. The weights below are an engineering estimate, not an approved plan; each phase still needs its own spec.

| Area | Weight | Done | Contribution | Basis |
|---|---|---|---|---|
| Hardened core: ledger, engines, gate (Phase 0) | 25 | 67% | 16.8 | Table above |
| Cloud core: accounts, sync, hosted API, DPDP | 20 | 55% | 11.0 | C0 done. C1 built and tested on local Postgres: phone sign-in, sessions, businesses and roles, the `/v1` API, the engine running per request (37 tests), and the app's hosted mode. File uploads work, so Tally, Zoho and bank imports run when hosted. Owners can invite staff and accountants (53 tests). Not deployed; no SMS sender; privacy assessment not started |
| Pipeline and exception queue | 10 | 30% | 3.0 | Exception queue built; no job pipeline |
| Android app | 25 | 30% | 7.5 | `mobile/` (Flutter): welcome, brand, sign-in, migration onboarding and later re-import (Tally, Zoho, bank statement), home summary, customer picker, threads with preview and confirm, expenses, taxes, Ask; 18 tests, debug APK builds, checked against the live server. Not yet run on a device; no bill capture, filing pack, notifications or release build |
| LLM chat agent | 8 | 35% | 2.8 | Tool contracts, keyword router, preview/confirm; no model in the loop |
| Live filing connections | 7 | 40% | 2.8 | Adapters wired against sandbox; onboarding not started |
| Play release work: listing, declarations, policy, testing | 5 | 0% | 0 | Not started |
| **Total** | **100** | | **43.9** | |

## Measured against the product PRD (added 2026-10-06)

The owner's PRD is "Taxmeow (working title), Product Requirements Document, v0.1, 28 September 2026". This is the yardstick for the product; the launch table above measures plumbing the PRD does not mention. Weights are an engineering estimate. Nothing below is deployed, and "files through the API" also depends on provider onboarding.

**About 78% of the PRD is built.**

| PRD item | Weight | Done | Points | What exists | What is missing |
|---|---|---|---|---|---|
| Automatic accounting | 12 | 100% | 12.0 | Double-entry postings for sales, bills, receipts, expenses and imports, with a checksummed journal; credit notes, debit notes and cancellation for sales; debit notes to suppliers with input credit reversed | A supplier's own debit note that increases a bill |
| Smart tagging | 6 | 100% | 6.0 | Sales, purchases and GST heads automatic; expenses tagged to twenty heads with memory per payee and wording, changeable before or after posting by tapping or by typing; five heads block input credit under s.17(5) from a dated rule | A model proposing a head for unknown wording (ADR-0004) |
| GST returns: prepare, review, file | 14 | 80% | 11.2 | GSTR-1 and GSTR-3B drafts per period with credit notes, GSTR-1 JSON, the review step by step in the app and in chat including the amount to pay, set-off head by head from dated rules with credit brought forward, interest and late fee, recording a filing and its ARN, provider adapters behind the action gate | Live filing; attestation of the set-off rules |
| TDS filing | 8 | 80% | 6.4 | Threshold monitor; TDS on bills and expenses for 194A/C/I/J with deposits and challans; payees without PAN at the higher rate; the quarterly statement draft by deductee, section and challan, reviewed and approved in the app and in chat; FVU generation wired to the provider | File generation and submission inside the flow; certificates |
| Invoices, quotes, e-way bills, sending | 10 | 90% | 9.0 | Invoices and quotes by form or message; invoice and quote screens, PDF and share sheet with each share audited; buyer address; payment terms and due dates; e-way bill need from the dated rule, transport details, and the gated request from the IRN | Live e-way bill generation (NIC credentials, IRN from the screen) |
| Payroll | 12 | 75% | 9.0 | Employees with dated salary structures; the monthly run with PF, ESI, professional tax (Maharashtra) and salary TDS from dated rules, prorated; approval posts to the books; salary payment; payslips; the PF ECR and ESI files; the salary TDS statement reviewed like the other; on the dashboard; in the app and in chat | Attestation of the rules; other states' professional tax; Annexure II; payouts |
| GSTR-2B matching and supplier reminders | 8 | 85% | 6.8 | Matching engine; 2B added in the app; credit at risk by supplier with reasons; supplier bill numbers on purchases; reminders drafted, previewed, recorded and sent from the owner's phone | Fetching 2B from the portal |
| CA access | 6 | 100% | 6.0 | Invite a CA as a member; GSTR-1 file export; monthly entries CSV and a Tally import file; the sync setting | Trial balance in the export |
| Chat and dashboard | 12 | 90% | 10.8 | Chats by type and by party, expense chats by head, one entry sheet; Home shows taxes, this month against last including approved payroll, who owes you, what you owe suppliers, and a books check of what needs you | Rule-based chat only (ADR-0004) |
| Reading documents automatically | 12 | 5% | 0.6 | Bank statement, Tally and Zoho file imports | POS sales, and reading a forwarded supplier invoice |
| **Total** | **100** | | **77.8** | | |
