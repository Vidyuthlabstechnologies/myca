# MyCA

**Product working title: Taxmeow.** A headless tax and accounting assistant for Indian
business owners. There is no accounting software to learn: the owner talks to it. It
keeps the books in the background and files GST and TDS returns once the owner
approves.

The repository, packages and app are named MyCA. The product is defined by the owner's
PRD ("Taxmeow (working title)", v0.1, 28 September 2026), restated as numbered
requirements in [`docs/product/PRD.md`](docs/product/PRD.md). Whether it launches as
Taxmeow or MyCA is an open decision.

## Status at a glance

| | |
|---|---|
| Against the product PRD | **About 52% built** ([requirement by requirement](docs/product/PRD.md), [how it is computed](docs/superpowers/PROGRESS.md)) |
| To a Play Store launch | About 44% (estimate) |
| Engine hardening (Phase 0) | 67%; every Critical and High audit finding closed ([audit](docs/audit/2026-09-21-codebase-audit.md)) |
| Tests | **1,044**: platform 550, engines and statutory rules 329, hosted API 60, Android app 105 |
| Tools | 105 named, schema-validated tools |
| Deployed | **Nothing.** The hosted API has run only against a local Postgres; the app has not run on a phone |
| Live portal calls | Off by default (`MYCA_ENABLE_LIVE_CALLS=0`); no return has been filed through the product |
| Automated checks | `node scripts/check-all.mjs`. CI is defined but GitHub Actions is not running on the account |

## The product in the owner's words

| | |
|---|---|
| **Who it is for** | Owners of retail, B2B and service businesses. They are not accountants and want to spend as little time on compliance as possible. |
| **How they use it** | One chat. Type a sale, forward a supplier bill, ask a doubt, approve a return. Chats are grouped by kind, one per customer or supplier, with a dashboard for the overall picture. |
| **How a CA fits in** | The owner exports the entries or invites the CA, and chooses whether the CA sees changes in real time or at intervals. |
| **What stays with the owner** | Filing a return and sending a reminder always need the owner's approval. |

### How it works

1. A sale arrives from the POS, a supplier invoice is forwarded, or the owner types a
   message.
2. The details are read automatically and the entry is tagged to the right head.
3. The owner sees what will be recorded and confirms.
4. The chats and the dashboard update.
5. Return drafts are prepared from the entries.
6. The owner reviews the draft step by step: "Is this information correct?"
7. The return is filed only after approval, and the acknowledgement is saved in chat.

### Core features and where each stands

| Feature | What the PRD asks for | Built | Specification |
|---|---|---|---|
| Automatic accounting | Double-entry books in the background, no manual entry | 95% | [01](docs/product/features/01-accounting-and-tagging.md) |
| Smart tagging | Every entry under the right head | 80% | [01](docs/product/features/01-accounting-and-tagging.md) |
| Invoices, quotes, e-way bills | Created by message, sent by email or WhatsApp | 75% | [02](docs/product/features/02-invoices-quotes-eway-bills.md) |
| GST returns | Prepared, reviewed in chat, filed after approval | 50% | [03](docs/product/features/03-gst-returns.md) |
| TDS | Same review and approval as GST | 15% | [04](docs/product/features/04-tds.md) |
| Payroll | Run payroll and pay salaries from the same product | 0% | [05](docs/product/features/05-payroll.md) |
| GSTR-2B matching | Flag late or mismatched suppliers; remind only with permission | 65% | [06](docs/product/features/06-gstr2b-matching-and-reminders.md) |
| CA collaboration | Export or invite, with a sync setting | 70% | [07](docs/product/features/07-ca-collaboration.md) |
| Chat and dashboard | Chat for daily work, dashboard for the picture | 80% | [08](docs/product/features/08-chat-and-dashboard.md) |
| Reading documents | POS sales and forwarded invoices read automatically | 5% | [09](docs/product/features/09-document-capture-and-pos.md) |

Percentages are engineering estimates. "Built" means implemented and covered by tests,
not deployed and not verified against a live portal.

### Principles

| Principle | Meaning |
|---|---|
| **Automation first** | Manual entry should be rare. |
| **Simple language** | No accounting jargon. Owners can ask doubts in plain words. |
| **Owner stays in control** | Filing returns and sending reminders always need the owner's approval. |
| **One place for everything** | Accounting, tax, invoices and payroll in one product. |
| **Numbers come from engines** | The assistant may choose a tool; it never invents a financial or statutory figure. |
| **Everything is traceable** | Every GST row traces to an invoice; every flag carries a `why` and a `source`. |

The first four are the owner's. The last two are how engineering makes the third one
safe.

## What is in this repository

| Product | Path | For | State |
|---|---|---|---|
| Engine | `platform/src/`, `sprints/` | Everything below | Built and hardened |
| Android app | `mobile/` | Owners, staff and invited CAs | Built against the hosted API; not released |
| Hosted API | `cloud/` | The Android app | Built on local Postgres; not deployed |
| Windows desktop app | `platform/desktop/` | CA firms who keep client data on their own machine | Built; local-only by design |

## Requirements

**Statutory and legal**

- Every filing needs the taxpayer's OTP/EVC or DSC (companies and LLPs need a DSC).
- Filing for a client needs a GSP/ASP (GST) and ERI registration (income tax).
- A tax audit or statutory audit sign-off must come from a practising CA.
- Cloud-held financial data brings DPDP Act 2023 duties.
- Every rule carries its citation, its dates in force, and an advisor CA's sign-off.

**Product**

- One chat interface; any change to the books shows a preview and posts only on one tap
  to confirm. Questions and negations post nothing.
- Every action records who did it.
- Nothing reaches a government portal without the live switch **and** an approval bound
  to the exact payload.
- Supplier reminders are drafted but never sent without the owner's confirmation.

**Engineering** (enforced by tests, see [`AGENTS.md`](AGENTS.md))

- Deterministic engines own every number; money is integer paise; the ledger is
  append-only with a checksum chain.
- Each business's books are isolated; nothing is shared across accounts.
- The engine has zero runtime dependencies; the hosted API has one (`pg`). ESM only,
  Node 22.
- No plaintext secrets anywhere, including logs and state.

## Architecture

```
 Android app (mobile/)                         Windows desktop app (platform/desktop/)
        │  HTTPS /v1, phone sign-in                    │  http://127.0.0.1:4780, PIN sign-in
        ▼                                              ▼
 Hosted API (cloud/)                            Local server (platform/src/server.mjs)
   one transaction per request,                   state.json + documents on disk
   one locked books row per business
        │                                              │
        └──────────────► the same engine ◄─────────────┘
                         platform/src/session.mjs      one serialized gate per books
                         router.mjs                    propose → confirm, query
                         assistant-contract.mjs        strict schemas, risk classes
                         tools.mjs                     105 named tools
             ┌───────────────────┼─────────────────────┐
             ▼                   ▼                     ▼
      ledger / invoice     sprints/ engines      action-gate.mjs
      integer paise        dated statutory       the only way out:
      append-only          rules, fail closed    live switch + approval
             └────────► append-only journal + audit events ◄────────┘
```

The full description, with request flow, data model, security and the decisions behind
it, is in [`docs/architecture/`](docs/architecture/ARCHITECTURE.md).

- **Ledger** (`ledger.mjs`): integer paise, debit = credit, idempotent transfer ids,
  append-only, pending/post/void, CRC-32 checksum chain, linked (atomic) bundles.
- **Statutory rules** (`sprints/statutory-rules`): every rate, threshold, due date and
  slab as a dated record with act, section, source and attestations. Asking for a rule
  on a date outside its window fails closed (`RULE_NOT_IN_FORCE`) instead of guessing.
- **Preview then confirm** (`router.mjs`): a message that would change the books is
  held as a proposal; only a separate confirm applies it.
- **Action gate** (`action-gate.mjs`): the only path to an external call. Known action,
  preflight, mock fixture, live switch, approval bound to operation, business and
  payload hash, maker ≠ checker, deadline, audit.
- **Hosted tenancy** (`cloud/src/books-runner.mjs`): the business comes from the URL,
  membership is checked on every request, and one request touches one business's row.
- **Desktop state** (`store.mjs`): JSON at `%APPDATA%\MyCA\state.json`; document bytes
  are content-addressed and re-verified on every read.

## Quickstart

Everything at once (the gate before any commit):

```bash
node scripts/check-all.mjs
```

The engine and the desktop server:

```bash
cd platform
npm test                 # 550 tests
npm run dev              # http://127.0.0.1:4780 (plain node)
npm start                # Electron window (after: npm i)
```

The hosted API, against a local Postgres (see [`cloud/README.md`](cloud/README.md)):

```bash
cd cloud
npm install
npm test                 # 60 tests; needs MYCA_TEST_DATABASE_URL
```

The Android app (see [`mobile/README.md`](mobile/README.md)):

```bash
cd mobile
flutter test             # 105 tests
flutter run --dart-define=MYCA_CLOUD_URL=http://127.0.0.1:8080
```

Configuration is optional for local books. **Outbound calls are opt-in**; set
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
  bills, receipts, expenses, credit notes and a trial balance that ties. A wrong
  invoice is cancelled or reduced by a credit note, never edited.
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
**Hosted API** (`cloud/`, local Postgres only)

- Phone sign-in with one-time codes, device sessions, refresh rotation with reuse
  detection, account deletion.
- Businesses with owner, staff and accountant roles; invitations by phone number.
- The engine run once per request inside a transaction that locks one business's books;
  an append-only audit table; file uploads by hash so imports work when hosted.

**Android app** (`mobile/`, not yet run on a phone)

- Onboarding that brings books from Tally, Zoho Books or a bank statement, then a books
  check of what needs the owner: sales the return cannot carry, credit at risk, due
  dates, money owed, missing details.
- Chats by kind and by customer or supplier, and one per expense head; every entry
  previewed and confirmed. Expenses are tagged to a head automatically, with the reason
  shown, and the owner can move one with a tap.
- An invoice opens from the chat, becomes a PDF, and is sent through the phone's share
  sheet from the owner's own WhatsApp or email. Customers have payment terms, so each
  invoice carries a due date and late ones say how late. Quotes are made the same way,
  sent as a PDF, and turned into an invoice with one tap.
- Home shows this month against last month for sales, purchases and expenses, what
  customers owe, and reminders due today ("remind me to call Rajesh tomorrow").
- A cash forecast for the next 30 days from the owner's real balance, and "can I
  afford it?" answered from that forecast, never by guesswork.
- GST for one month at a time, the GSTR-1 file saved for the portal, deadlines and
  what needs the owner.
- GSTR-2B added for a month, and input credit at risk shown by supplier with the
  reason for each bill.
- The month's return reviewed step by step ("Is this information correct?") and
  approved by the owner; nothing is filed from the review.
- Members and invitations, switching business, and a fingerprint or screen lock.
- "Ask my CA" on an invoice, a flagged item or a month's return, with the facts
  attached by the engine and the answer back in the app.

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

The order of work, and what each milestone waits on, is in the
[roadmap](docs/product/ROADMAP.md). In short:

| Milestone | Delivers | Waits on |
|---|---|---|
| M1 Daily use on a phone | Invoice view and sharing, expense tagging, credit notes, dashboard | Nothing; a phone for device testing |
| M2 The return, reviewed | Review in chat, amount to pay, GSTR-2B in the app, reminders, entries export | Advisor CA for set-off |
| M3 Hosted pilot | Deployment, real sign-in, privacy work, Play closed testing | Google Cloud project, SMS or Google Sign-In, DPDP assessment |
| M4 Reading documents | Supplier invoices by photo or forward; free-text chat | Choice of language model |
| M5 Filing for real | Live GST filing, e-way bill, TDS return, CA sync setting | GSP/ASP and NIC onboarding |
| M6 Payroll and POS | Payroll, POS sales, quotes | Advisor CA; payout and POS partners |

Engine hardening (Phase 0) continues alongside: timeouts and body caps on every
outbound client, the remaining parser findings, desktop hardening and the final reviews
([tracker](docs/superpowers/PROGRESS.md)).

**Owner actions** (not engineering; they gate the milestones)

- Decide the launch name: Taxmeow or MyCA.
- Create a Google Cloud project with billing; start SMS sender registration.
- Name the advisor CA and agree the rule sign-off process.
- Recruit 2-3 pilot businesses and collect three months of filed GSTR-1/3B JSON.
- Start GSP/ASP, ERI and NIC production onboarding.
- Commission the DPDP Act assessment.
- Decide who may approve a live filing, and which language model may read documents.


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
   `node scripts/check-all.mjs` and the stress run green before committing.
7. **Keep the picture honest.** Update [`STATUS.md`](STATUS.md), this README and the
   [progress tracker](docs/superpowers/PROGRESS.md) whenever the built/not-built picture
   moves.

## Repository layout

| Path | Purpose |
|---|---|
| `platform/` | The engine, the local server and the Windows desktop shell |
| `cloud/` | Hosted API: accounts, sign-in, tenancy, the engine per request on Postgres |
| `mobile/` | Android app (Flutter) |
| `scripts/check-all.mjs` | Runs every suite and prints one table |
| `platform/src/` | All runtime modules (see the module map below) |
| `platform/desktop/` | Electron `main.cjs` + offline renderer (CSP-locked, no CDNs) |
| `platform/test/` | Platform test suite (node:test) |
| `sprints/statutory-rules/` | Dated rule records, golden cases and the rule API |
| `sprints/` | Engines: 1 Tally, 2 bank/OCR, 3 GST recon, 4 deadlines, 5 filing, 6 audit |
| `docs/audit/` | The codebase audit that drives Phase 0 (C1–C4, H1–H18) |
| `docs/product/` | Product PRD, feature specifications and the roadmap |
| `docs/architecture/` | System architecture, data model, security, decision records |
| `docs/superpowers/` | Design specs, plans and the progress tracker |
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
6. **Zero runtime dependencies in the engine.** ESM only, Node 22. `node:crypto` is
   fine. The hosted API may use `pg` and nothing else.


## Documentation

The full index is [`docs/README.md`](docs/README.md).

| Doc | What it covers |
|---|---|
| [`docs/product/PRD.md`](docs/product/PRD.md) | The product as numbered requirements, with status, acceptance and open questions |
| [`docs/product/features/`](docs/product/features/) | One specification per feature area (nine) |
| [`docs/product/ROADMAP.md`](docs/product/ROADMAP.md) | Milestones and what each waits on |
| [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) | Components, request flow, the action gate, known limits |
| [`docs/architecture/DATA-MODEL.md`](docs/architecture/DATA-MODEL.md) | Database tables and the books state |
| [`docs/architecture/SECURITY-AND-PRIVACY.md`](docs/architecture/SECURITY-AND-PRIVACY.md) | Controls that exist and gaps that remain |
| [`docs/architecture/decisions/`](docs/architecture/decisions/) | Ten decision records |
| [`docs/superpowers/PROGRESS.md`](docs/superpowers/PROGRESS.md) | Live percentages and how they are computed |
| [`STATUS.md`](STATUS.md) | Built and verified vs. to-be-built inventory |
| [`AGENTS.md`](AGENTS.md) | Conventions and workflow for a change |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Site and Windows release pipeline |
| [`docs/audit/2026-09-21-codebase-audit.md`](docs/audit/2026-09-21-codebase-audit.md) | Findings C1-C4 and H1-H18 with reproductions |
| `platform/PRD.md` | Desktop product: CA-firm API requirements (REQ-CA-001...015) |
| `sprints/*/BENCHMARK.md` | Per-engine fixtures and acceptance numbers |
