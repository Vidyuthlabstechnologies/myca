# MyCA

**A headless tax and accounting assistant for Indian business owners. No accounting
software to learn — the owner simply talks to it. It does the books in the background
and files GST and TDS returns once the owner approves.**

MyCA is built for the owner of a retail, B2B, or service business who wants to spend as
little time on compliance as possible. Every number comes from a deterministic engine
reading dated statutory rules; the assistant may choose a tool but never invents a
figure. **The tax invoice is the source of truth** — the trial balance and GSTR-1/3B are
projections of posted invoices, not a second typing pass.

MyCA **automates, reconciles, flags, and files after approval**. Manual accounting entry
should be rare. Filing and sending reminders always need the owner's confirmation — the
owner stays in control of every action that leaves the product.

## Status at a glance

| | |
|---|---|
| Phase | **Phase 0, pilot readiness — 58% complete** ([tracker](docs/superpowers/PROGRESS.md)) |
| Tests | **695 passing** — platform 366; engines 11 / 11 / 49 / 51 / 68 / 2; statutory rules 137 |
| Tools | **71** named, schema-validated tools |
| Audit findings | Critical 4/4 closed · **High 18/18 closed** ([audit](docs/audit/2026-09-21-codebase-audit.md)) |
| Live portal calls | **Off by default** (`MYCA_ENABLE_LIVE_CALLS=0`) |
| Installer | Windows NSIS + portable `.exe`, built and verified in CI |

Runs today as a local-only Windows app. The cloud master copy and the mobile app are
Phases 1–3 below, deliberately after the pilot.

## Vision

| | |
|---|---|
| **Who it is for** | Business owners running retail, B2B, or service businesses. They are not accountants and want to spend as little time on compliance as possible. |
| **What it does** | Automatic accounting, GST and TDS returns, invoices, e-way bills, payroll, and GSTR-2B matching — all in one product. |
| **How an owner uses it** | One chat. Type a sale, forward a supplier bill, ask a question, approve a return. No accounting jargon. |
| **How a CA uses it** | CA collaboration via export or real-time sync. Exceptions only — clean returns go straight to owner approval; the CA sees flagged items and a batch sign-off. |
| **Where data lives** | Cloud master copy (India region, per-business isolation) with a local cache. Today: local-only Windows app during pilot. |
| **What stays human** | GST and TDS return filing, OTP/EVC/DSC, and sending supplier reminders — all need the owner's explicit approval before anything leaves the product. |

## Core features

| Feature | What it does |
|---|---|
| **Automatic accounting** | Creates double-entry accounting entries in the background; no manual entry needed. |
| **Smart tagging** | Every entry is placed under the correct account head automatically. |
| **Invoice and quote creation** | Create a tax invoice or quote by typing a message; it is sent by email or WhatsApp after the owner checks it. |
| **E-way bill** | Generated alongside the invoice when goods are dispatched. |
| **POS integration** | Every POS sale automatically creates an entry in the Sales Register. |
| **One-click GST filing** | Prepares GSTR-1 and GSTR-3B and files them through the API after the owner approves. |
| **TDS filing** | Files TDS returns using the same review-and-approve steps as GST. |
| **GSTR-2B matching** | Matches purchase entries with GSTR-2B; flags suppliers who filed late or have a mismatch; sends reminders only after the owner approves. |
| **Payroll** | Runs payroll, computes TDS 192 / PF / ESI, and pays salaries from the same platform. |
| **CA collaboration** | Owner exports entries or adds the CA directly; CA can sync in real time or at set intervals. |
| **Dashboard and chat** | Chat for daily work and questions; dashboard for the overall picture of sales, purchases, taxes, and payroll. |

## Key principles

| Principle | Meaning |
|---|---|
| **Automation first** | Manual entry should be rare. |
| **Simple language** | No accounting jargon. Owners can ask doubts in plain words. |
| **Owner stays in control** | Filing returns and sending reminders always need the owner's approval. |
| **One place for everything** | Accounting, tax, invoices, and payroll are all in one product. |
| **Deterministic engines** | The assistant may choose tools; it never invents a financial or statutory figure. |
| **Everything is traceable** | Every GST row traces to an invoice id; every flag carries a `why` and a `source`. |


## Requirements

**Statutory and legal**

- Every filing needs the taxpayer's OTP/EVC or DSC (companies and LLPs need a DSC).
- Filing for a client needs a GSP/ASP (GST) and ERI registration (income tax).
- A tax audit or statutory audit sign-off must come from a practising CA.
- Cloud-held financial data brings DPDP Act 2023 duties.
- Every rule carries its citation, its dates in force, and an advisor CA's sign-off.

**Product**

- One chat interface; any change to the books shows a preview card and posts only on
  one tap to confirm. Questions and negations post nothing.
- An owner signs in with a PIN; every action records who did it.
- Every GST table row traces to an invoice id; every flag carries a `why` and a `source`.
- Nothing reaches a government portal without the live switch **and** an owner approval
  bound to the exact payload.
- Supplier reminders are drafted but never sent without the owner's confirmation.

**Engineering** (enforced by tests, see [`AGENTS.md`](AGENTS.md))

- Deterministic engines own every number; money is integer paise; the ledger is
  append-only with a checksum chain.
- Each business's books are isolated; nothing is shared across accounts.
- Zero runtime dependencies. ESM only, Node 22.
- No plaintext secrets anywhere, including logs and state.


## Architecture

```
desktop/ (Electron) ── http://127.0.0.1:4780 ──► src/server.mjs
                                                   │  local-only, origin-checked
                                                   ▼
                                             src/session.mjs        (serialized state gate)
                                                   │
                                        src/router.mjs + assistant-contract.mjs
                                                   │  strict schemas, named tools only
                                                   ▼
                                             src/tools.mjs          (71 tools)
             ┌─────────────────────────────────────┼─────────────────────────────────────┐
             ▼                                     ▼                                     ▼
     src/ledger.mjs / invoice.mjs        sprints/ (engines + rules)        src/action-gate.mjs
     src/books.mjs / store.mjs           loaded via sprint-load.mjs        approvals · NIC · providers
             │                                     │                                     │
             └──────────────► append-only journal + audit events ◄─────────────────────────┘
```

- **Ledger** (`ledger.mjs`): integer paise, debit = credit, idempotent transfer ids,
  append-only, pending/post/void, CRC-32 checksum chain, linked (atomic) bundles.
  TigerBeetle *invariants*, not the TigerBeetle database.
- **Books** (`books.mjs`, `book-view.mjs`): the firm's own books are the root ledger;
  each client gets an isolated one. Tools run against a Proxy that routes book keys to
  the active client and firm keys to the root.
- **Statutory rules** (`sprints/statutory-rules`): every rate, threshold, due date and
  slab as a dated record with act, section, source and attestations. Asking for a rule on
  a date outside its window fails closed (`RULE_NOT_IN_FORCE`) instead of guessing, and
  golden case files pin the arithmetic.
- **Action gate** (`action-gate.mjs`): the only path to an external call. Unknown action,
  assistant-blocked write, non-JSON params, preflight, mock fixture, live switch,
  approval bound to operation + client + payload hash, maker ≠ checker, deadline, audit.
- **State** (`store.mjs`): JSON at `%APPDATA%\MyCA\state.json`; attachment bytes are
  content-addressed under `%APPDATA%\MyCA\documents\` and re-verified on every read.

## Quickstart

```bash
cd platform
npm test                 # 362 platform tests
npm run dev              # http://127.0.0.1:4780 (plain node)
npm start                # Electron window (after: npm i)
npm run pack             # NSIS + portable installer (after: npm i -D electron electron-builder)
```

Engines and rules:

```bash
cd sprints/sprint-3-gst-recon && npm test
```

Configuration is optional for local books. For provider/NIC integrations copy
`.env.example` to `.env` — see `platform/PRD.md`. **Outbound calls are opt-in**; set
`MYCA_ENABLE_LIVE_CALLS=1` only when you intend to reach a real portal.

### Try it in 60 seconds

1. `cd platform && npm run dev`
2. In the chat strip: `Invoice Retail Mart GSTIN 27AAACH7409R1Z1, 10 rolls at 50000, GST 5%`
3. `trial balance` — Dr must equal Cr
4. `prepare GSTR-1` — B2B, B2CL and B2CS split by GSTIN, place of supply and invoice value
5. `export gstr1 json` — GSTN offline-utility JSON for the chosen month (never uploaded)

## What is done so far

**Books and ledger**

- Append-only double-entry ledger in paise with a verified checksum chain; invoices,
  bills, receipts, expenses and a trial balance that ties.
- Per-client isolated books, canonical client ids, legacy-id migration, per-book
  attachments with content-addressed, hash-verified documents.
- Dates: one strict reader for every posting and lock, so `2026-6-1` or `2026/06/01`
  cannot slip past a period lock; a blank date is the local day, not UTC.
- Parties identified by GSTIN, place of supply decided per invoice, CGST always equal to
  SGST, blocked credit (s.17(5)) posted to cost, duplicate document ids refused.

**Statutory engines** (all driven by dated rules, all with golden cases)

- **GST**: official GSTIN mod-36 checksum with dated state codes; GSTR-1 tables and GSTN
  JSON with rates and the B2CL threshold read on the invoice date; GSTR-3B draft;
  GSTR-1 vs 3B match.
- **Input tax credit**: GSTR-2B matched on each tax head separately (a CGST+SGST vs IGST
  swap is flagged), credit notes reconciled both ways, s.16(2)(aa) availability, Rule 37
  (180-day non-payment) and Rule 37A (supplier's GSTR-3B not filed) as separate checks
  that say so when payment or filing data is missing.
- **Deadlines**: due dates resolved from the rules, including QRMP by state group,
  advance-tax instalments, TDS, PF and GSTR-9.
- **Income tax**: slabs, 87A rebate with marginal relief, surcharge with relief, cess and
  rounding — 65 golden cases to the paisa, old and new regimes.
- **TDS**: section-wise thresholds, bases and rates on the payment date, each flag naming
  the rules it used.
- **Ingestion**: Tally Day Book CSV and XML, bank statements (CSV, fixed-width, matrix)
  with running-balance tie-out, Zoho Books invoices, purchase register and GSTR-2B. A GST
  rate is never assumed: it comes from the row or its tax columns and must be in force,
  and re-importing a file posts nothing while a genuine repeat row still posts.

**Exception queue**

- Everything the engines flag — an invoice GSTR-1 cannot report, blocked or reversible input
  credit, a 2B mismatch, an overdue return, a row an import held back, books that do not
  tie — becomes one queued item with its severity, the money at risk, the rule that produced
  it and the evidence to open.
- A refresh raises what is new, keeps what is still true, and closes what is fixed. A CA can
  assign, resolve or waive with a reason; every decision is audited, and a waiver is not
  undone by the next refresh.
- Per client, or across the whole firm in one list.
**Safety**

- Chat never posts on its own: a message that would change the books or reach a
  portal is answered with a preview of the computed figures and the accounts that will
  move, and posts only on one tap. Questions and negations post nothing.
- Action gate with mock fixtures, dry runs, payload-bound maker-checker approvals and
  deadlines; an architecture test keeps every transport behind it.
- Credentials encrypted at rest; no secret value ever reaches a log, audit event or tool
  result.
- Audit events with before/after state hashes on every state-changing operation.

## What has to be done

**Phase 0 — pilot readiness (current, 58%)**

| Item | What it means |
|---|---|
| Remaining client hardening | Fetch timeouts and body caps on every outbound client; provider-doctor and notification honesty. |
| Owner PIN identity | Who did what, tracked before any cloud work. |
| Parsing and audit engine | Remaining medium findings in the parsers and the defensible-audit engine. |
| Shadow harness | Recompute the last three filed months per pilot client and diff against the filed return. |
| Docs and stress | Keep README/STATUS counts honest; make the stress campaign a permanent harness. |

Phase 0 ends when: every Critical and High finding has a regression test that fails on
the pre-fix commit; every rule is signed off by the advisor CA with all golden cases
passing for FY 2025-26 and FY 2026-27; each pilot client's last three filed months match
or every difference is explained; and CI is green.

**Phases after the pilot** (each needs its own spec before code)

1. **Cloud backend** — India-region server, per-business data isolation, device sync,
   DPDP Act duties, audit trail continuity.
2. **LLM chat agent** — natural-language understanding over the same 71 named tools.
   The owner types "sold 10 boxes to Rajesh at ₹500 each" and the engine books it.
   The assistant chooses tools; it never invents a figure.
3. **Mobile app** — React Native shell for the owner. Capture a supplier bill with the
   phone camera, ask a question, approve a return with one tap.
4. **POS integration** — webhook or SDK adapter for common Indian POS systems; every
   sale auto-creates an entry in the Sales Register.
5. **Payroll** — salary computation, PT / PF / ESI / TDS 192, payslips, salary payments.
6. **Supplier reminder flow** — GSTR-2B mismatch → draft WhatsApp / email to supplier
   → owner approves → send. Never sent autonomously.
7. **Filing connections** — GSP/ASP (GST), ERI (income tax), Account Aggregator (bank
   feed), NIC (e-invoice/e-way bill), each switched on as its onboarding completes.
8. **CA real-time sync** — owner invites CA; CA sees the books in real time or at set
   intervals without needing a separate export step.

**Owner actions** (not engineering; they gate the exit criteria)

- Name the advisor CA and agree the rule sign-off process.
- Recruit 2–3 pilot businesses and collect three months of filed GSTR-1/3B JSON.
- Start GSP/ASP, ERI, Account Aggregator (FIU) and NIC production onboarding.
- Commission the DPDP Act assessment before Phase 1.


## How it has to be done

1. **Law first, then tests, then code.** Read the Act, the rule and the notification.
   Add or correct the dated rule record with its citation and dates in force. Sprint
   specs and existing tests are not authority — several encoded the wrong law and were
   corrected against the Act.
2. **Rules are dated records, and they fail closed.** No rate, threshold or due date is
   ever hard-coded in an engine. Asking outside a rule's window is an error, never a
   silent fallback to last year's number.
3. **Every finding gets a regression test** that fails before the fix and passes after,
   named for the law it encodes rather than for the current output.
4. **Uncertainty is reported, not guessed.** When payment data, filing status or a GST
   rate is missing or out of force, the document is held back or reported as unknown for
   the CA to resolve.
5. **New external actions go through the gate.** Declare the action class, add the mock
   fixture and preflight, and let approvals bind to the payload hash.
6. **Ship in vertical slices.** One audit finding or one rule area per commit, with the
   platform suite, every touched sprint suite and the stress run green before committing.
7. **Keep the picture honest.** Update [`STATUS.md`](STATUS.md), this README and the
   [progress tracker](docs/superpowers/PROGRESS.md) whenever the built/not-built picture
   moves.

## Repository layout

| Path | Purpose |
|---|---|
| `platform/` | The product: local server, Electron shell, ledger, tools, contracts |
| `platform/src/` | All runtime modules (see the module map below) |
| `platform/desktop/` | Electron `main.cjs` + offline renderer (CSP-locked, no CDNs) |
| `platform/test/` | Platform test suite (node:test) |
| `sprints/statutory-rules/` | Dated rule records, golden cases and the rule API |
| `sprints/` | Engines: 1 Tally, 2 bank/OCR, 3 GST recon, 4 deadlines, 5 filing, 6 audit |
| `docs/audit/` | The codebase audit that drives Phase 0 (C1–C4, H1–H18) |
| `docs/superpowers/` | Phase 0 design spec, plans and the progress tracker |
| `deploy/` | Marketing/research static site (not the product) |
| `email-relay/` | Optional Cloudflare Worker for MyCA notification email |
| `infra/` | Terraform for the GCP site + release pipeline |
| `.github/workflows/` | CI, site deploy, Windows build, Terraform plan/apply |
| `vendor/` | Unused reference clones — never imported at runtime |

`platform/src` modules: `ledger` `chart` `invoice` `books` `book-view` `store` `session`
`dates` `period-lock` `tools` `router` `assistant-contract` `intent` `ca-api`
`action-gate` `approvals` `nic-actions` `nic-client` `nic-config` `govt` `reachability`
`integration-contract` `provider-catalog` `provider-doctor` `sandbox-client`
`sandbox-adapter` `sandbox-adapter-contract` `credential-vault` `secret-keys`
`document-store` `runtime-config` `notifications` `nim-client` `post-import`
`import-zoho` `tally-xml` `gstr1-json` `text-safe` `server` `sprint-load` `oss-catalog`.

## Design rules (non-negotiable)

1. **Deterministic engines own the numbers.** The assistant may choose tools; it never
   invents a financial or statutory figure.
2. **Everything is traceable.** Every GST table row traces to an invoice id; every flag
   carries a `why` + `source`; every tool run is audited with before/after state hashes.
3. **The owner approves before anything leaves.** Filing, OTP/EVC/DSC, supplier
   reminders, and every live portal action are behind the live switch and an approval
   bound to the exact payload. Autonomous action stops at the door.
4. **Automation first, jargon never.** Manual accounting entry should be rare. The
   product speaks plain language; the owner does not need to know what a debit is.
5. **No plaintext secrets.** Provider/NIC credentials are encrypted at rest
   (`credential-vault.mjs`: Electron `safeStorage`/DPAPI, AES-256-GCM fallback).
6. **Zero runtime dependencies.** ESM only, Node 22. `node:crypto` is fine.


## Documentation

| Doc | What it covers |
|---|---|
| [`STATUS.md`](STATUS.md) | Built & verified vs. to-be-built inventory |
| [`docs/audit/2026-09-21-codebase-audit.md`](docs/audit/2026-09-21-codebase-audit.md) | Findings C1–C4 and H1–H18 with reproductions |
| [`docs/superpowers/specs/2026-09-21-phase0-pilot-readiness-design.md`](docs/superpowers/specs/2026-09-21-phase0-pilot-readiness-design.md) | Phase 0 design: goal, non-goals, exit criteria, pilot mode |
| [`docs/superpowers/PROGRESS.md`](docs/superpowers/PROGRESS.md) | Live percentage, workstream weights and what is left |
| [`docs/research/`](docs/research/) | Competitor and market teardowns with integration plans |
| [`AGENTS.md`](AGENTS.md) | Conventions and workflow for AI coding agents |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | GCP deployment, releases, domain/TLS, signing, branch protection |
| `platform/PRD.md` | CA-firm API requirements (REQ-CA-001…015) and current status |
| `platform/CA-REVIEW.md` | Reviewer pack: what to click through, and the limits to state honestly |
| `platform/INTEGRATION-RECONCILIATION.md` | Provider-adapter policy and ownership |
| `platform/INTEGRATIONS-SETUP.md` | Step-by-step to go live with each integration |
| `sprints/*/BENCHMARK.md` | Per-engine fixtures and acceptance numbers |
