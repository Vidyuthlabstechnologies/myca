# MyCA — Status

As of the latest commit on the Phase 0 branch. Verification: platform **362/362**,
engines **329/329** (`11 / 11 / 49 / 51 / 68 / 2` plus **137** statutory-rule tests),
CI green, end-to-end smoke runs on Windows. "Verified" means covered by tests or an
actual run — not merely written.

Phase 0 (pilot readiness) is **58% complete**: every Critical (4/4) and High (18/18) audit finding is closed.
See [`docs/superpowers/PROGRESS.md`](docs/superpowers/PROGRESS.md) for the live tracker
and [`README.md`](README.md) for what is left and how it is being done.

## ✅ Built and verified

### Ledger core
- Double-entry ledger; integer paise; debit = credit enforced on every transfer
- Append-only journal with CRC-32 checksum chain (`verifyChain`)
- Idempotent create-by-id; pending → post/void two-phase flags
- Linked transfer bundles that abort atomically if any leg fails
- Account limit flags (e.g. cash cannot be credited past posted debits)
- Chart of accounts, journal listing, trial balance (always ties)
- Tax invoices + purchase bills post AR/AP, sales/purchases, CGST/SGST/IGST
- Receipts clear AR (partial/paid, overpayment rejected); printable escaped invoice HTML

### GST & compliance engines
- Intra/inter GST split, odd-paise safe; GST payable (output − input)
- Dated statutory rules (rates, thresholds, due dates, slabs) with act, section, source
  and golden cases; a rule asked for outside its window fails closed
- GSTR-1 tables + GSTN **offline-utility JSON** for one return period (real sha256
  `hash`, B2B invoice-wise with items grouped by rate, B2CL invoice-wise above the dated
  threshold, B2CS consolidated by place-of-supply × rate, bad-rate and bad-GSTIN
  invoices held back, `gt`/`cur_gt` only when supplied)
- GSTR-3B draft; combined filing pack
- GSTR-2B vs purchase register matched per tax head (tax-type swaps flagged), credit
  notes both ways, s.16(2)(aa) availability, Rule 37 (180 days) and Rule 37A (supplier
  GSTR-3B) as separate checks, GSTR-1 vs 3B matching, IMS snapshot
- Deadline engine (GSTR-1/3B/7/9, TDS quarterly, PF, advance tax, ITR) with
  weekend/gazetted-holiday rollover and escalation levels
- ITR regime comparison (AIS/26AS, old vs new); TDS 194A/C/I/J threshold monitor
- Defensible audit: full-population rules, SA 230 working papers, systematic sampling,
  Schedule III / CARO / 3CD checks, engagement risk scoring

### Data import
- Tally Day Book CSV and TallyPrime XML → posted invoices (row isolation, alias mapping)
- Zoho Books invoice CSV → posted invoices
- Bank CSV / fixed-width TXT / PDF (OCR contract) with running-balance tie-out
- Duplicate protection on import; zero-amount rows dropped

### Assistant, tools, and contracts
- 71 named tools; strict JSON-schema validation; keyword router
- Unsafe tools blocked from the assistant (`govt_save_credentials`, `seed_demo`,
  `approval_decide`)
- Local CA API contract harness: REQ-CA-001…015 readiness, clients, ledger,
  trial-balance, vouchers, documents, users, access, audit-events
- Integration registry (connect/disconnect) driving readiness; provider catalog;
  Sandbox adapter plan

### Integrations
- Sandbox by Quicko provider client — **real endpoint paths** for GST public lookups,
  taxpayer OTP/session, GSTR-1 save/proceed/file, GSTR-2B reconciliation jobs, e-invoice
  auth/generate/cancel, and TDS analytics/FVU jobs
- **Adapter registry** translating provider responses into MyCA engines, behind four
  gates: secret redaction → live switch → assistant block → CA approval.
  Wired: GSTIN verify, return status, GSTR-2B recon job, GSTR-1 save + file (EVC),
  e-invoice authenticate/generate/cancel, taxpayer OTP generate/verify, TDS analytics,
  TDS FVU generate
- `income_tax_calculate` stays fail-closed (`PROVIDER_ENDPOINT_UNDOCUMENTED`): Sandbox
  publishes no stable income-tax calculator path, so `prepare_itr` remains the source of truth
- **CA approval workflow**: request / decide / consume, maker-checker separation,
  reviewer roles (partner/reviewer/admin), 24-hour expiry, single use
- NIC e-invoice: RSA v1.04 auth, IRN payload build, mock IRN, government host probe
- **NIC e-invoice full IRP surface**: split into `nic-config.mjs` (config, CIPHER vault,
  public-key loader, invoice→IRP payload) and `nic-client.mjs` (hosts, AES-256-ECB
  payload encrypt/decrypt with the session `Sek`, v1.04 auth, IRN generate/cancel/
  get/get-by-doc, rejected-IRN list, GSTIN master, e-Way Bill generate/get, heartbeat
  health, mock mode). Correct hosts: sandbox `einv*.gstsandbox.nic.in`, production
  `einvoice1.gst.gov.in` (NOT `api.einvoice.gst.gov.in`). E-Way Bill cancel stays
  honest: the IRP has no cancel endpoint, so it points at the e-Way Bill system.
  Tools added: `govt_nic_health`, `govt_nic_session`, `govt_nic_gstin`,
  `govt_nic_cancel_irn`, `govt_nic_get_irn`, `govt_nic_get_irn_by_doc`,
  `govt_nic_rejected_irns`, `govt_nic_generate_ewb`, `govt_nic_get_ewb`; cancel +
  EWB are assistant-blocked. Live sandbox heartbeat verified end-to-end.
- NVIDIA NIM client (gated)
- **Integration doctor** (`provider_doctor`): per provider, reports configured/environment/
  reachable and the exact list of missing pieces, pinging only when live calls are on
- **Sandbox environment awareness**: the client detects TEST vs LIVE, prefers scoped keys
  (`MYCA_GSP_TEST_*` / `MYCA_GSP_LIVE_*`), and warns when responses are TEST fixtures
- **NIC public-key loader** (`govt_set_public_key`): validates a `.cer`/PEM/base64 key and
  stores it encrypted; NIC auth refuses to send credentials without it
- **`test_notification`**: one-shot delivery test for the configured email/WhatsApp channel
- **`platform/INTEGRATIONS-SETUP.md`**: operator runbook to go live with each integration

### Security & integrity
- Live provider calls opt-in (`MYCA_ENABLE_LIVE_CALLS`, default off); assistant cannot
  reach a provider autonomously
- Credential vault (`credential-vault.mjs`): Electron `safeStorage`/DPAPI with
  AES-256-GCM fallback; legacy plaintext migration; no secrets in state or logs
- Loopback-only server, origin allow-list, client-header auth, strict CSP, no CDNs
- CSV formula neutralization, HTML escaping, state-path sandboxing
- Append-only audit log with before/after state hashes and SHA-256 document digests
- Per-client isolated ledgers; attachment bytes content-addressed on disk

### Desktop app
- Electron shell + offline renderer tabs: Vouchers, Books, GST, Documents, Clients,
  Approvals, Firm, Govt, APIs, Print, OSS, Tools
- **Firm profile editor** (`set_company`): set business name/GSTIN/PAN/state/FY/address,
  validated (GSTIN checksum, PAN, PIN, FY) with history untouched
- **Client registry + active-book switcher** (`add_client`, `list_clients`,
  `set_active_client`): register clients and switch the whole app between isolated books
- **Approvals screen**: request, review, approve/reject gated provider operations
- **Documents screen**: file a document against the active client, list what is on file,
  and download it back (bytes content-addressed on disk, metadata in state)
- **Invoice print + Save as PDF** (Print tab): real PDF via Electron `printToPDF` through
  a narrow preload bridge; falls back to the system print dialog outside Electron
- **Backup / restore books** (Firm tab): one self-contained JSON with every book, client,
  document and the audit trail; restore validates and replaces the open books
- **Period lock** (`lock_period`, `unlock_period`, `period_status`): lock a client's book
  through a date; postings, receipts, expenses and imports on or before it are refused
- **Client sharing + outbox** (`share_invoice`, `list_outbox`, `send_notification`):
  queue an invoice message and open WhatsApp/email from this PC; API delivery (Meta
  Cloud API / email relay) is live-gated and reports exactly what is unconfigured
- Bundled fonts; no external network calls at runtime

### Deployment & release
- GCP Terraform: GCS site origin, Cloud CDN, global HTTPS LB + managed cert, Cloud DNS,
  uptime monitoring, public `/downloads/*` mirror, Artifact Registry
- GitHub Actions: CI (tests), deploy-site (rsync + CDN purge), Terraform plan/apply,
  Windows installer (NSIS + portable)
- Keyless GitHub → GCP Workload Identity Federation; least-privilege deployer SA
- Windows installer build verified: `MyCA Setup 0.1.0.exe` + `MyCA 0.1.0.exe` (106 MB each)

## ⚠️ Built, but not yet verified against live external systems

- Sandbox adapter endpoints were **verified live against the Quicko Sandbox TEST
  environment**: auth, GSTIN verify, and the GSTR-2B reconciliation job (returns a real
  `job_id` + signed upload URLs). Taxpayer OTP, e-invoice auth and TDS FVU accept the
  request (route + payload correct) and return provider business responses. The public
  return-tracking route works but the TEST fixture rejects every FY value tried.
  Only the client (not the provider) is covered by unit tests + these live probes.
- NIC e-invoice: sandbox heartbeat/health endpoint verified live end-to-end; mock auth
  and IRN verified by unit tests; live auth + IRN still need a registered API user
  (portal sign-up, User Type = Tax Payer) and the sandbox `.cer` loaded via
  `govt_set_public_key`
- NIC production: 404 from our network without the production on-boarding (static IPs +
  test report) — infra prereq, not a config issue
- `gst_save_gstr1` and `gst_file_gstr1_evc`: declared in the contract, fail closed as
  `NOT_IMPLEMENTED` (no verified endpoint wired)
- GCP site/infra: `terraform fmt` + `validate` pass; never applied to a real project
  (awaits the one-time owner bootstrap)

## 🧪 Mock mode (`MYCA_MOCK_MODE=1`)

A single global switch makes every provider front door work offline with deterministic,
explicitly-tagged simulated fixtures — demo the whole workflow end-to-end with no keys,
no live switch, no CA approvals, and no bytes leaving the PC.

- **Sandbox by Quicko**: GSTIN verify, return status, taxpayer OTP/session, GSTR-2B
  recon, GSTR-1 save/file (payload, pan+OTP and summary validated), e-invoice
  authenticate/generate/cancel, TDS jobs, income-tax calculation — all 13 operations
  return fixtures via `runSandboxOperation(...,{mock:true})`; audit events are tagged
  `mock:true`.
- **NIC e-Invoice**: auth, IRN generate (stamps the invoice with a sha256-derived IRN +
  signed QR), get/cancel/denied, GSTIN master, E-Way Bill — canned per-path responses;
  `mock:false` still forces the real gate.
- **Notifications**: `sendNotification` marks the message `sent` with `providerId:'mock'`.
- **NIM**: `nim_status` / `nim_ask` return a simulated assistant reply.
- **Tools + doctor**: `validate_gstin`, `sandbox_status`, `provider_doctor` report
  `environment:'mock'` / `mock:true` and skip pings.
- `.env` ships with `MYCA_MOCK_MODE=1`; `.env.example` documents it (default `0`). The
  test suite is hermetic: `npm test` runs with `--env-file=.env.test` which pins both
  `MYCA_MOCK_MODE=0` and `MYCA_ENABLE_LIVE_CALLS=0`, so flakes in `.env` never break CI.
- Mock fixtures are deterministic (sha256-derived IRNs, fixed legal names) and every
  result carries `mock:true` so a simulated response can never be mistaken for a real filing.

## 🔜 To be built

| Area | Missing |
|---|---|
| REQ-CA-011–015 | Task/deadline API, client chase portal, notifications (email/WhatsApp/SMS), knowledge base (RAG), eval logs |
| Live filing | ASP/GSP onboarding, production credentials, column-exact GSTR-1 save/file, ITR, MCA21, DSC signing |
| Integrations | Account Aggregator bank feed, Tally/Zoho write-back, real OCR provider |
| Firm backend | Cloud Run + Cloud SQL + GCS document vault; multi-tenant auth/SSO/RBAC |
| UI polish | Invoice template designer, multi-currency, keyboard shortcuts |
| Ops | Custom domain + TLS active, GitHub Pro branch protection, code-signing certificate, app auto-update |

## Known limitations (stated honestly, not hidden)

- The AES-256-GCM vault fallback is not hardware-backed; the shipped Electron app uses
  real DPAPI via `safeStorage`.
- The local CA API is a contract/test harness, not a production connector layer.
- The marketing site under `deploy/` is research/status content, not the product.
- `vendor/` reference clones are never imported (licence reasons — see `vendor/README.md`).
