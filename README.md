# MyCA

A Windows-first books-and-compliance workbench for small and mid-size Indian
businesses. One chat, a fixed set of named tools, and an append-only double-entry
ledger. **The tax invoice is the source of truth** — the trial balance and
GSTR-1/3B are projections of posted invoices, not a second typing pass.

MyCA **prepares, reconciles, flags, and documents**. It does not auto-file,
auto-sign, or hold a DSC. A practising CA still reviews, attests, and files where
the law requires a professional.

## Status at a glance

| | |
|---|---|
| Tests | **268 passing** — platform 109, sprint engines 11/11/33/44/58/2 |
| Tools | **60** named, schema-validated tools |
| CI | Green on `main` (GitHub Actions) |
| Installer | Windows NSIS + portable `.exe` built and verified in CI |
| Live calls | **Off by default** (`MYCA_ENABLE_LIVE_CALLS=0`) |

See [`STATUS.md`](STATUS.md) for the full built/verified vs. to-be-built inventory
and [`DEPLOYMENT.md`](DEPLOYMENT.md) for the GCP release pipeline.

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
                                             src/tools.mjs          (60 tools)
             ┌─────────────────────────────────────┼─────────────────────────────────────┐
             ▼                                     ▼                                     ▼
     src/ledger.mjs / invoice.mjs        sprints/ (frozen engines)        sandbox-adapter.mjs
     src/books.mjs / store.mjs           sprint-1..6 via sprint-load.mjs  approvals.mjs / govt.mjs
             │                                     │                                     │
             └──────────────► append-only journal + audit events ◄──────────────────────────┘
```

- **Ledger** (`ledger.mjs`): integer paise, debit = credit, idempotent transfer ids,
  append-only, pending/post/void, CRC-32 checksum chain, account limit flags,
  linked (atomic) transfer bundles. TigerBeetle *invariants*, not the TigerBeetle database.
- **Books** (`books.mjs`): the firm's own books are the root ledger; every registered
  client gets an isolated ledger. Nothing is shared across clients.
- **State** (`store.mjs`): JSON at `%APPDATA%\MyCA\state.json`. Attachment bytes live
  content-addressed under `%APPDATA%\MyCA\documents\`, never inside the state file.
- **Sprints** (`sprints/sprint-1..6`): deterministic engines for Tally/bank ingest,
  GST reconciliation, deadlines, filing prep, and defensible audit. Loaded at runtime
  by `sprint-load.mjs`.

## Quickstart

```bash
cd platform
npm test                 # 109 platform tests
npm run dev              # http://127.0.0.1:4780 (plain node)
npm start                # Electron window (after: npm i)
npm run pack             # NSIS + portable installer (after: npm i -D electron electron-builder)
```

Sprint engines:

```bash
cd sprints/sprint-3-gst-recon
npm test                 # node --test on that module
```

Configuration is optional for local books. For provider/NIC integrations copy
`.env.example` to `.env` — see `platform/PRD.md`. **Outbound provider calls are
opt-in**; set `MYCA_ENABLE_LIVE_CALLS=1` only when you intend to reach a real
portal.

### Try it in 60 seconds

1. `cd platform && npm run dev`
2. In the chat strip: `Invoice Retail Mart GSTIN 27AAACH7409R1Z3, 10 rolls at 50000, GST 5%`
3. `trial balance` — Dr must equal Cr
4. `prepare GSTR-1` — B2B vs B2CS split follows GSTIN presence
5. `export gstr1 json` — downloads GSTN offline-utility JSON (not uploaded)

## Repository layout

| Path | Purpose |
|---|---|
| `platform/` | The product: local server, Electron shell, ledger, tools, contracts |
| `platform/src/` | All runtime modules (see the module map below) |
| `platform/desktop/` | Electron `main.cjs` + offline renderer (CSP-locked, no CDNs) |
| `platform/test/` | Platform test suite (node:test) |
| `sprints/` | Frozen, zero-dependency engines (1 tally, 2 bank/OCR, 3 GST recon, 4 deadlines, 5 filing, 6 audit) |
| `deploy/` | Marketing/research static site (not the product) |
| `email-relay/` | Optional Cloudflare Worker that sends MyCA notifications via Cloudflare Email Service |
| `infra/` | Terraform for the GCP site + release pipeline |
| `.github/workflows/` | CI, site deploy, Windows build, Terraform plan/apply |
| `vendor/` | Unused reference clones — never imported at runtime |

`platform/src` modules: `ledger` `chart` `invoice` `books` `store` `session`
`tools` `router` `assistant-contract` `intent` `ca-api` `integration-contract`
`provider-catalog` `sandbox-client` `sandbox-adapter` `sandbox-adapter-contract`
`approvals` `govt` `credential-vault` `document-store` `runtime-config`
`sandbox` `nim-client` `post-import` `import-zoho` `tally-xml` `gstr1-json`
`text-safe` `server` `sprint-load` `oss-catalog`.

## Design rules (non-negotiable)

1. **Deterministic engines own the numbers.** The assistant may choose tools; it
   never invents a financial or statutory figure.
2. **Everything is traceable.** Every GST table row traces to an invoice id; every
   audit flag carries a `why` + `source`; every tool run is audited with
   before/after state hashes.
3. **Live portal actions are CA-controlled.** Filing, signing, OTP, and DSC stay
   outside autonomous assistant control, behind the live switch and the approval
   workflow.
4. **No plaintext secrets.** Provider/NIC credentials are encrypted at rest
   (`credential-vault.mjs`: Electron `safeStorage`/DPAPI, AES-256-GCM fallback).
5. **Zero runtime dependencies.** ESM only, Node 22. `node:crypto` is fine.

## Documentation

| Doc | What it covers |
|---|---|
| [`STATUS.md`](STATUS.md) | Built & verified vs. to-be-built inventory |
| [`AGENTS.md`](AGENTS.md) | Conventions and workflow for AI coding agents |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | GCP deployment, releases, domain/TLS, signing, branch protection |
| `platform/PRD.md` | CA-firm API requirements (REQ-CA-001…015) and current status |
| `platform/CA-REVIEW.md` | Reviewer pack: what to click through, and the limits to state honestly |
| `platform/INTEGRATION-RECONCILIATION.md` | Provider-adapter policy and ownership |
| `platform/INTEGRATIONS-SETUP.md` | Step-by-step to go live with each integration (credentials, verification, gotchas) |
| `sprints/*/BENCHMARK.md` | Per-engine fixtures and acceptance numbers |
| `sprints/*/AGENTS.md` | Frozen original build specs for each engine |
