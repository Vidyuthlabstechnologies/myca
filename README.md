# MyCA

**Replace the repetitive work of a chartered accountant for Indian small and mid-size
businesses — invoicing to accounting to tax filing — behind one chat interface.**

MyCA is built for CA firms first: a Windows app the firm runs, with a mobile companion
for its clients. Every number comes from a deterministic engine reading dated statutory
rules; the assistant may choose a tool but never invents a figure. **The tax invoice is
the source of truth** — the trial balance and GSTR-1/3B are projections of posted
invoices, not a second typing pass.

MyCA **prepares, reconciles, flags, and documents**. It does not auto-file, auto-sign, or
hold a DSC. A practising CA reviews, attests, and files where the law requires a
professional.

## Status at a glance

| | |
|---|---|
| Phase | **Phase 0, pilot readiness — 50% complete** ([tracker](docs/superpowers/PROGRESS.md)) |
| Tests | **665 passing** — platform 336; engines 11 / 11 / 49 / 51 / 68 / 2; statutory rules 137 |
| Tools | **69** named, schema-validated tools |
| Audit findings | Critical 4/4 closed · High 16/18 closed ([audit](docs/audit/2026-09-21-codebase-audit.md)) |
| Live portal calls | **Off by default** (`MYCA_ENABLE_LIVE_CALLS=0`) |
| Installer | Windows NSIS + portable `.exe`, built and verified in CI |

Runs today as a local-only Windows app. The cloud master copy and the mobile app are
Phases 1–3 below, deliberately after the pilot.

## Vision

| | |
|---|---|
| **Who it is for** | CA firms first; the mobile app launches as the firm's client companion. Direct-to-SMB for non-audit businesses comes later. |
| **What it does** | GST cycle, books, TDS and ITR as job types on one pipeline, built in filing-calendar order (GST → books → TDS → ITR). |
| **How a client uses it** | Chat and a phone camera. Send a bill, ask a question, approve with one tap. |
| **How a CA uses it** | Exceptions only. A clean return goes straight to client approval; the CA sees the exceptions and a batch sign-off. |
| **Where data lives** | Cloud master copy (India region, each firm isolated) with an offline desktop cache, after the pilot. Today: local only. |
| **What stays human** | Tax and statutory audit sign-off, DSC/EVC, and every live portal action. |

## Requirements

**Statutory and legal**

- A tax audit and a statutory audit must be signed by a practising CA.
- Every filing needs the taxpayer's OTP/EVC or DSC (companies and LLPs need a DSC).
- Filing for a client needs a GSP/ASP (GST) and ERI registration (income tax).
- Cloud-held client financial data brings DPDP Act 2023 duties.
- Every rule carries its citation, its dates in force, and an advisor CA's sign-off.

**Product**

- One chat interface; any change to the books shows a preview card and posts only on
  one tap to confirm.
- A firm user signs in with a PIN; every action records who did it.
- Every GST table row traces to an invoice id; every flag carries a `why` and a `source`.
- Nothing reaches a government portal without the live switch **and** a maker-checker
  approval bound to the exact payload.

**Engineering** (enforced by tests, see [`AGENTS.md`](AGENTS.md))

- Deterministic engines own every number; money is integer paise; the ledger is
  append-only with a checksum chain.
- Each client's books are isolated; nothing is shared across clients.
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
                                             src/tools.mjs          (69 tools)
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
npm test                 # 336 platform tests
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

**Safety**

- Action gate with mock fixtures, dry runs, payload-bound maker-checker approvals and
  deadlines; an architecture test keeps every transport behind it.
- Credentials encrypted at rest; no secret value ever reaches a log, audit event or tool
  result.
- Audit events with before/after state hashes on every state-changing operation.

## What has to be done

**Phase 0 — pilot readiness (current, 48%)**

| Item | Finding | What it means |
|---|---|---|
| Chat safety | H10 | An ordinary question can post entries; chat needs the preview-and-confirm card and a risk class per tool. |
| Desktop hardening | H16 | `Host` is not validated and the renderer token is a constant, so a website could read local data by DNS rebinding. |
| Remaining client hardening | — | Timeouts and body caps on every client, provider-doctor and notification honesty. |
| Firm-user PIN identity | — | Who did what, before any cloud work. |
| Parsing and audit engine | — | Remaining medium findings in the parsers and the defensible-audit engine. |
| Shadow harness | — | Recompute the last three filed months per pilot client and diff against the filed return. |
| Docs and stress | — | Keep README/STATUS counts honest; make the stress campaign a permanent harness. |

Phase 0 ends when: every Critical and High finding has a regression test that fails on
the pre-fix commit; every rule is signed off by the advisor CA with all golden cases
passing for FY 2025-26 and FY 2026-27; each pilot client's last three filed months match
or every difference is explained; and CI is green.

**Phases after the pilot** (each needs its own spec before code)

1. **Cloud compliance core** — India-region backend, per-firm isolation, device sync,
   DPDP duties, audit trail continuity.
2. **Pipeline and exception queue** — jobs run themselves; the CA sees only exceptions
   and a batch sign-off.
3. **Mobile client companion** — capture a bill, ask a question, one-tap approval.
4. **LLM chat agent** — natural language over the same named tools, never over the maths.
5. **Filing connections** — GSP/ASP, ERI, Account Aggregator and NIC, each switched on as
   its onboarding completes.

**Owner actions** (not engineering; they gate the exit criteria)

- Name the advisor CA and agree the rule sign-off process.
- Recruit 2–3 pilot firms and collect three months of filed GSTR-1/3B JSON.
- Start GSP/ASP, ERI, Account Aggregator (FIU) and NIC onboarding.
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
3. **Live portal actions are CA-controlled.** Filing, signing, OTP and DSC stay outside
   autonomous control, behind the live switch and the approval workflow.
4. **No plaintext secrets.** Provider/NIC credentials are encrypted at rest
   (`credential-vault.mjs`: Electron `safeStorage`/DPAPI, AES-256-GCM fallback).
5. **Zero runtime dependencies.** ESM only, Node 22. `node:crypto` is fine.

## Documentation

| Doc | What it covers |
|---|---|
| [`STATUS.md`](STATUS.md) | Built & verified vs. to-be-built inventory |
| [`docs/audit/2026-09-21-codebase-audit.md`](docs/audit/2026-09-21-codebase-audit.md) | Findings C1–C4 and H1–H18 with reproductions |
| [`docs/superpowers/specs/2026-09-21-phase0-pilot-readiness-design.md`](docs/superpowers/specs/2026-09-21-phase0-pilot-readiness-design.md) | Phase 0 design: goal, non-goals, exit criteria, pilot mode |
| [`docs/superpowers/PROGRESS.md`](docs/superpowers/PROGRESS.md) | Live percentage, workstream weights and what is left |
| [`AGENTS.md`](AGENTS.md) | Conventions and workflow for AI coding agents |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | GCP deployment, releases, domain/TLS, signing, branch protection |
| `platform/PRD.md` | CA-firm API requirements (REQ-CA-001…015) and current status |
| `platform/CA-REVIEW.md` | Reviewer pack: what to click through, and the limits to state honestly |
| `platform/INTEGRATION-RECONCILIATION.md` | Provider-adapter policy and ownership |
| `platform/INTEGRATIONS-SETUP.md` | Step-by-step to go live with each integration |
| `sprints/*/BENCHMARK.md` | Per-engine fixtures and acceptance numbers |
