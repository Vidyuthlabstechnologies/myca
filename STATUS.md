# MyCA — Status

As of the latest commit on `main`. Verification: platform **93/93**, sprint engines
**159/159** (`11 / 11 / 33 / 44 / 58 / 2`), CI green, end-to-end smoke runs on
Windows. "Verified" means covered by tests or an actual run — not merely written.

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
- GSTR-1 tables + GSTN **offline-utility JSON** (real sha256 `hash`, `gt`/`cur_gt`,
  B2B invoice-wise, B2CS consolidated by place-of-supply × rate)
- GSTR-3B draft; combined filing pack
- GSTR-2B vs purchase register matching, GSTR-1 vs 3B matching, Rule 37A, IMS snapshot
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
- 44 named tools; strict JSON-schema validation; keyword router
- Unsafe tools blocked from the assistant (`govt_save_credentials`, `seed_demo`,
  `approval_decide`)
- Local CA API contract harness: REQ-CA-001…015 readiness, clients, ledger,
  trial-balance, vouchers, documents, users, access, audit-events
- Integration registry (connect/disconnect) driving readiness; provider catalog;
  Sandbox adapter plan

### Integrations
- Sandbox by Quicko provider client (GST, e-invoice, OTP, income tax, TDS)
- **Adapter registry** translating provider responses into MyCA engines, behind four
  gates: secret redaction → live switch → assistant block → CA approval.
  Wired: GSTIN verify, return status, income-tax calculate, TDS analytics,
  GSTR-2B recon job, e-invoice authenticate/generate/cancel, taxpayer OTP generate/verify
- **CA approval workflow**: request / decide / consume, maker-checker separation,
  reviewer roles (partner/reviewer/admin), 24-hour expiry, single use
- NIC e-invoice: RSA v1.04 auth, IRN payload build, mock IRN, government host probe
- NVIDIA NIM client (gated)

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
- Electron shell + offline renderer: folio, books, GST, govt, APIs, OSS, tools, print tabs
- Bundled fonts; no external network calls at runtime

### Deployment & release
- GCP Terraform: GCS site origin, Cloud CDN, global HTTPS LB + managed cert, Cloud DNS,
  uptime monitoring, public `/downloads/*` mirror, Artifact Registry
- GitHub Actions: CI (tests), deploy-site (rsync + CDN purge), Terraform plan/apply,
  Windows installer (NSIS + portable)
- Keyless GitHub → GCP Workload Identity Federation; least-privilege deployer SA
- Windows installer build verified: `MyCA Setup 0.1.0.exe` + `MyCA 0.1.0.exe` (106 MB each)

## ⚠️ Built, but not yet verified against live external systems

- Sandbox adapters run only with injected mocks in tests; never against a real provider
- NIC e-invoice: mock auth verified; live auth needs a registered API user and the sandbox `.cer`
- `gst_save_gstr1` and `gst_file_gstr1_evc`: declared in the contract, fail closed as
  `NOT_IMPLEMENTED` (no verified endpoint wired)
- GCP site/infra: `terraform fmt` + `validate` pass; never applied to a real project
  (awaits the one-time owner bootstrap)

## 🔜 To be built

| Area | Missing |
|---|---|
| REQ-CA-011–015 | Task/deadline API, client chase portal, notifications (email/WhatsApp/SMS), knowledge base (RAG), eval logs |
| Live filing | ASP/GSP onboarding, production credentials, column-exact GSTR-1 save/file, ITR, MCA21, DSC signing |
| Integrations | Account Aggregator bank feed, Tally/Zoho write-back, real OCR provider |
| Firm backend | Cloud Run + Cloud SQL + GCS document vault; multi-tenant auth/SSO/RBAC |
| UI | Approval-workflow screen, document download/retrieval, multi-client switcher |
| Ops | Custom domain + TLS active, GitHub Pro branch protection, code-signing certificate, app auto-update |

## Known limitations (stated honestly, not hidden)

- The AES-256-GCM vault fallback is not hardware-backed; the shipped Electron app uses
  real DPAPI via `safeStorage`.
- The local CA API is a contract/test harness, not a production connector layer.
- The marketing site under `deploy/` is research/status content, not the product.
- `vendor/` reference clones are never imported (licence reasons — see `vendor/README.md`).
