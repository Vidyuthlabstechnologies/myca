# MyCA — pack for five reviewing CAs

Product: **MyCA**, a Windows books-and-compliance workbench for small and mid-size Indian businesses. The firm talks to **one chat**. The chat only runs **named tools**. The tools write an **append-only double-entry ledger** (TigerBeetle invariants, not TigerBeetle the database). **The tax invoice is the source of truth** — GSTR-1/3B and the trial balance are projections of posted invoices, not a second typing pass.

This is not a GSTN live-filing bot and not a substitute for a practising CA’s signature. It prepares, reconciles, flags, and documents. A CA still reviews, attests, and files where the law requires a professional.

## What was verified before this build

| Engine | Tests | Status |
|---|---|---|
| Sprint 1 Tally Day Book ingest | 11/11 | Real, passing 2026-09-07 |
| Sprint 2 Bank CSV/TXT/PDF + OCR contract | 11/11 | Real, passing |
| Sprint 3 GSTIN / 2B / 1-vs-3B / 37A / IMS | 33/33 | Real, passing |
| Sprint 4 Deadlines + chase + dashboard | 44/44 | Real, passing |
| Sprint 5 GSTR-1/3B prep, ITR regime, TDS monitor | 58/58 | Real, passing |
| Sprint 6 Defensible audit | fixture gates added | Parser, 8 rules, SA 230 papers, clause checks, risk — complete enough to review |
| Market site `deploy/` | static | Research + status page only; **not** the product |

Honest gap vs the status HTML: sprints 1–6 are **libraries + CLIs**. They were not a
product until `platform/` wrapped them. As of the current build, `platform/` **does**
provide the Windows shell, the chat, the ledger of record, invoice origin, and Zoho/Tally
imports — but it remains a **local single-user workbench**, not a hosted service: no
multi-tenant auth, no live GSTN filing, no write-back to Tally/Zoho.

## TigerBeetle — what we copied, what we did not

Copied (the interface that makes money safe):

- Two entities: **accounts** and **transfers**
- **Debit = credit** on every transfer
- **Integer paise**, never float for posting
- **Idempotent** create-by-id
- **Append-only** journal; no UPDATE/DELETE of posted transfers
- **Pending / post / void** flags (two-phase, for later e-invoice / payment gateway)
- **Checksum chain** over the journal
- Account flags: credits must not exceed debits (cash) and the reverse (some liabilities)
- Linked transfers abort the rest of the bundle if one leg fails

Not copied (and must not be claimed in a review meeting):

- Viewstamped Replication, 6-node cluster, io_uring, 100k TPS
- Jepsen / helical disk faults
- 128-bit amounts, HLC timestamps as a consensus clock
- TigerBeetle Cloud

The production ledger of record for a later scale-out **should** be TigerBeetle itself. Today the Windows app uses an embedded journal so a CA can audit the invariant without installing a cluster.

## Tool catalogue the chat is allowed to call

44 named tools. The assistant may pick any of them; it may not compute a number itself.
Tools that write books, save credentials, seed data, or decide an approval are blocked
from the assistant (`seed_demo`, `govt_save_credentials`, `approval_decide`).

| Group | Tools | CA question it answers |
|---|---|---|
| Books | `trial_balance`, `chart_of_accounts`, `journal`, `list_invoices`, `company_profile` | Do the books tie, and can I reconstruct every posting? |
| Vouchers | `create_invoice`, `create_purchase`, `record_receipt`, `print_invoice`, `post_expense` | Supplier bill → AP + ITC? Receipt clears AR? Print INV-0001? |
| GST prep | `prepare_gstr1`, `export_gstr1_json`, `prepare_gstr3b`, `filing_pack`, `gst_payable` | Do return tables match the invoice register? GST payable from the same ledger? |
| GST recon | `gst_reconcile`, `validate_gstin` | 2B vs books, 1 vs 3B, Rule 37A, IMS; check digit and state |
| Imports | `import_tally`, `import_tally_xml`, `import_zoho`, `import_bank` | Land Tally/Zoho/bank data without silent column mapping |
| Deadlines | `deadlines` | Next working-day dues, holiday-aware |
| Income tax / TDS | `prepare_itr`, `monitor_tds` | Regime compare (AIS/26AS); 194A/C/I/J thresholds |
| Audit | `audit_books` | Full-population flags + SA 230 papers + Schedule III/CARO/3CD |
| Government | `govt_probe`, `govt_nic_auth`, `govt_nic_mock`, `govt_generate_irn`, `govt_save_credentials`* | Can this PC reach/authenticate to NIC, and build an IRN? |
| Integrations | `integration_readiness`, `integration_connect`, `integration_disconnect`, `provider_catalog`, `sandbox_adapter_plan`, `sandbox_status`, `sandbox_connect`, `sandbox_operation` | Which firm APIs are needed/connected, and what does the provider cover? |
| Approvals | `approval_request`, `approval_decide`*, `approval_list` | Who authorised a live operation, and is it still valid? |
| AI | `nim_status`, `nim_ask` | Ask a model for drafting/analysis (never for a figure) |
| Demo | `seed_demo`* | Load sample books |

\* blocked from the assistant (operator-only).

## What the architecture guarantees

- **Live provider calls are off** unless `MYCA_ENABLE_LIVE_CALLS=1`, and gated
  operations additionally require a CA-approved, unexpired, single-use approval.
- **Secrets are encrypted at rest** (Electron `safeStorage`/DPAPI, AES-256-GCM fallback).
- **Each client's books are isolated**; the firm's own books are the root ledger.
- **Attachments are content-addressed on disk**; `state.json` holds metadata only.


## Review script (60 minutes)

1. Open MyCA. Confirm demo invoices for **Nalanda Textiles LLP** (GSTIN `27AABCU9603R1ZP`).
2. Chat: `trial balance` — Dr must equal Cr.
3. Chat: `Invoice Walk-in, 1 unit at 10000, GST 18%` — unregistered intra-state; CGST+SGST; invoice appears in the folio.
4. Chat: `prepare GSTR-1` — B2B vs B2CS split must match GSTIN presence.
5. Attach a Tally Day Book CSV, chat `import tally` — dirty rows isolated, good rows kept.
6. Attach Zoho invoice CSV, chat `import zoho` — new invoices post into the same ledger and still tie.
7. Chat: `deadlines` — GSTR-1/3B dates skip weekends/Gandhi Jayanti.
8. Drop sprint-6 `ledger.csv` as Audit ledger, chat `audit` — 12 flags, WP-SMP sample of 8, CL-001 critical.
9. Ask: **what can this still not do?** Expected answer from the room: live GSTN upload, DSC, MCA21, payroll statutory, Tally/Zoho *write-back*, WhatsApp collection, Taxmann-grade research.

## Legal / professional posture for reviewers

- We automate **preparation and control**. We do not auto-file without an explicit, logged CA action (not built yet).
- Explainability is mandatory: every GST table row traces to an invoice id; every audit flag has `why` + `source`.
- Determinism: same books + same as-of date → byte-stable flags (sprint engines). The chat router is keyword-matched today; an LLM may be plugged in later **only** as a tool chooser, never as a number source.

## Build / run

```
cd platform
npm test
npm run dev          # http://127.0.0.1:4780
npm start            # Windows window (after npm i electron)
npm run pack         # NSIS installer + portable exe (after npm i -D electron electron-builder)
```

Data file: `%APPDATA%\MyCA\state.json` (migrates from `%APPDATA%\Bahikhata\state.json` if present)
