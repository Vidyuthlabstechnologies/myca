# MyCA — Status

As of main on 2026-10-14. Verification: platform **682/682**,
engines **330/330** (`11 / 11 / 49 / 51 / 68 / 2` plus **138** statutory-rule tests), the hosted API suite against Postgres in CI, the Android app **166** widget tests,
CI green, end-to-end smoke runs on Windows. "Verified" means covered by tests or an
actual run — not merely written.

Phase 0 (pilot readiness) is **82% complete**: every Critical (4/4) and High (18/18) audit finding is closed; of the mediums, amount parsing and the audit clause checks are done (2026-10-15).
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
- Audit trail (2026-11-06): who changed the books, when, and which invoices, bills and ledger
  entries were involved, for a month, a period or two dates; asked in chat ("audit trail for
  October"), on a screen of the app opened from Reports, and as an Excel workbook
  (`export_xlsx`, report `audit_trail`, which the app also saves) of the events, the day book
  and a summary. Each event holds a SHA-256 hash that takes in the hash of the event before
  it, and the trail says the log is verified or names the first event where the chain breaks.
  The chain has no key (see Known limitations). An event falls on the day of its time on the
  computer MyCA runs on. On the hosted service every write is also copied into the
  append-only `audit_log` table
  ([`10-audit-trail.md`](docs/product/features/10-audit-trail.md))
- MSME payment dates (2026-11-06): the supplier terms sheet in the app and `set_supplier_terms`
  record whether a supplier is an MSME, its category, an Udyam number and its agreed days; the
  pay-by date of a bill is worked out each time from those terms (the agreed days, never more
  than 45, or 15 when none are agreed). The daily run adds a reminder to Home for each unpaid
  bill seven days before its date (today when that day has passed), once that day is within
  the next 14 days; MyCA sends it to nobody, though the weekly brief, where it is switched on,
  names MSME bills already past their date. A bill past its date raises a high
  `MSME_PAST_LIMIT` exception that closes when the bill is paid, a row in the daily close, a
  place at the top of the payment run (past its date or due within three days) and a panel on
  Home. A supplier marked medium is not covered and follows its agreed days. The two rules
  behind it carry no CA sign-off yet, so `supplier_dues` marks its rows `unreviewed`
  ([`02`](docs/product/features/02-invoices-quotes-eway-bills.md))
- Form 26AS check and TDS withheld (2026-11-06): `import_26as_credits` keeps every section of a
  Form 26AS file and skips rows already on file; `tds_credit_check` sets each deductor, section
  and quarter against the TDS recorded on sales invoices (for 194-O, the marketplace
  settlements), by TAN and then by name, as matched, not in books, not in 26AS, short in 26AS
  or more in 26AS, and pairs the same deduction across quarters when the amounts agree
  within ₹1; `record_tds_withheld` records TDS a customer deducted from an invoice,
  previewed first, to TDS receivable (1160), and settles the invoice by that amount. The
  check posts nothing and does not read AIS
  ([`04`](docs/product/features/04-tds.md))
- GST IMS decisions (2026-11-06): `ims_review` lists a month's GSTR-2B as one row for each
  document, with whether the books hold it and a suggestion; `ims_decide` records accept,
  reject, pending or clear on chosen rows or on a word, previewed first, and keeps them in
  `imsDecisions`. In chat, as an Excel sheet (`ims_review`) and on the phone as "Review in
  IMS". MyCA sends nothing to the portal; the owner takes the same decisions there
  ([`06`](docs/product/features/06-gstr2b-matching-and-reminders.md))
- Two-step sign-in (2026-11-06): optional per user on the hosted service. The Security screen
  in the app enrols an authenticator and shows eight recovery codes once. With it on, signing
  in by phone code, Google or OpenID Connect returns a five-minute challenge instead of
  tokens, finished by an authenticator code or a recovery code; five wrong codes end the
  challenge and a code already accepted is refused. Turning two-step off or renewing the
  recovery codes needs a code, and five wrong ones in a row refuse every code for 15 minutes
  ([`SECURITY-AND-PRIVACY.md`](docs/architecture/SECURITY-AND-PRIVACY.md))
- Signed-in devices (2026-11-06): the Security screen lists the devices signed in to the
  account with when each signed in and was last active, marks this phone, and ends any other
  device or all the others; an ended device stops working at once. The server asks for no
  code to do it; the app asks the phone's screen lock when the phone has one
- Supplier bank details and a payout file (2026-10-19): the owner records where a supplier is
  paid (account and IFSC, or UPI); a change is shown old against new with the warning to
  confirm it on the number already on file; a bulk NEFT file for the bills the payment run
  proposes, one row per supplier, with the suppliers lacking details named; MyCA moves no
  money. The Monday brief names customers who have gone quiet
- Provider payrolls posted (2026-10-22): a Gusto payroll summary posts as wages, employer taxes,
  the payables and the bank debits on the check dates, previewed and confirmed from the pull's
  reminder on the desktop or the phone, skipped when already posted, and left out of MyCA's own
  941 draft because the provider files it
- Track1099 and the hosted connector flows (2026-10-21): the 1099-NEC CSV in Track1099's own
  template, payers listed, the import uploaded behind the gate with a CA approval and its job kept;
  the hosted API runs Plaid Link token and exchange, the Gusto connect and callback, and TaxJar
  lookups per business with sealed credentials, so the phone can connect without the desktop
- US connectors (2026-10-21): Plaid (sandbox bank linked without Plaid Link, transactions synced by
  cursor into a bank statement), TaxJar (a zip lookup recorded as the jurisdiction's rate), Gusto
  (OAuth through MyCA's own callback, payroll summaries stored) and Track1099 (keys kept; routes
  wait on its documentation), each with a card and its steps on the keys page, behind the channel
  pull switch; the Indian connectors (Amazon, Shopify, Razorpay, Zoho) got the same cards
- Sandbox keys page (2026-10-21): `keys.html` beside the desktop (the "Sandbox keys" link on the
  tabs) with the steps to get a Sandbox by Quicko key and the NIC e-invoice sandbox credentials;
  Save stores them encrypted in the local vault, the next sandbox call uses them, and the page
  runs the status and provider checks straight away; `.env` variables still win when set
- Leftovers closed (2026-10-21): Hindi and Telugu in chat through the model (the message is
  translated to English, the books change exactly as in English, the reply comes back in the
  owner's language; a translation that changes any figure is refused and nothing is recorded;
  without a model key the reply says so in that language); the packaged desktop installs an
  update quietly once the installer is signed (SHA-256 from the release, Authenticode subject
  must name the publisher, silent NSIS run, else it opens the release page); the iOS workflow
  signs and uploads to TestFlight once the Apple secrets exist; professional tax for Puducherry
  (half-yearly) and nil records for Arunachal Pradesh, the union territories and the states
  that levy none, so no payroll calls a state unknown
- Phone (2026-10-20): the iOS target beside Android (Xcode project, permissions, notifications,
  an unsigned build on macOS in CI, the App Store checklist; not yet built on a Mac); the
  Reports screen; a photographed receipt matched to a posted expense with one tap to attach;
  OpenID Connect sign-in for a firm's own identity provider with the deep link back
- Windows integrations (2026-10-20): the month pushed to Tally on this machine; DSC signing from
  the Windows certificate store behind the gate; the model proposes an expense head for wording
  nothing has seen before (shown as the model's, changeable); professional tax for Meghalaya,
  Manipur, Mizoram, Nagaland, Tripura and Sikkim; the update check on launch; the API token
  through the preload bridge
- Saved reports and receipt matching (2026-10-19): a report saved by name (sales, purchases,
  expenses, owed or owing; by customer, supplier, head or month; this or last month, quarter
  or financial year, compared with the period before) and run again by name, on the phone too;
  a photographed receipt whose total is within fifty paise and whose date within three days of
  an expense or bill already posted is offered as an attachment to that entry, so nothing is
  posted twice
- Accessibility and large type (2026-10-18): fourteen screens checked in the suite for 48-point
  tap targets, labels and text contrast, and rendered at text scale 2.0 with no overflow; the
  same screens read through the accessibility tree on an Android 15 emulator with TalkBack;
  two findings fixed (the Home business tile's tap area, the rupee prefix's contrast)
- Launch gates (2026-10-18): the books column sealed per business with AES-256-GCM under the
  service key (required on Cloud Run); an access log the owner can read and pgaudit on the
  database; a written retention policy enforced by a nightly purge thirty days after a
  deletion; dependency scanning on every push. Still open: a penetration test by an outside
  firm, and counsel's sign-off on the retention periods
- Advance tax set-aside (2026-10-18): for an individual or proprietor, the year's profit to
  date scaled to twelve months (both figures shown), tax under the chosen regime from the
  dated rules, less TDS credit from Form 26AS or marketplace settlements, split into the
  instalments by 15 June, September, December and March (or the whole by 15 March when
  presumptive), met, missed or next, interest sections named not computed, headed "for
  your CA to confirm" with its assumptions; a paid instalment posts bank to advance tax paid
- Restock from velocity (2026-10-18): per SKU, units sold a day over 7 and 28 days net of
  returns and excluding days out of stock, days of cover against the supplier's lead time,
  a status from too late to overstock, slow movers with the rupees tied up, an order sized
  for sixty days plus the lead rounded to the pack; supplier, lead time, pack and MOQ per SKU;
  purchase orders recorded without touching the ledger and counted as on order
- Month close with sign-off (2026-10-18): nine checks for a finished month (entries, possible
  duplicates, documents for bills and expenses above a threshold, settlements, GSTR-2B, payroll
  approved and paid, a bank reading, nothing high open, month-on-month moves), a narrative from
  the figures, approval bound to a draft hash with a note when items are open, and the books
  locked through the month's last day; a read bill or an expense can carry its document hash
- Cash forecast with confidence (2026-10-18): a timing band per customer from their last
  twelve receipts (capped at half, thin history said so), 30/60/90-day windows with low,
  expected and high, bills on their MSMED or agreed pay-by date, salaries, PF, ESI and salary
  TDS as dated outgoings, and up to five named risks; "can I make payroll" answers covered,
  tight or short by an amount and names the customers who usually pay before payday;
  every payroll run flags a changed salary, a missing person, a newcomer, partial days and a
  gross move against last month, and corrects nothing
- Monday brief (2026-10-17): cash and runway, sales deltas, receivable aging buckets, dues,
  exceptions and the one thing to do, from chat and the app; on the hosted service it is sent
  on WhatsApp every Monday 07:00 IST to members who switched it on
- Payment run (2026-10-17): unpaid bills ranked on the MSMED date, the 180-day credit limit
  and agreed terms, held back for open exceptions, with the balance after and whether payroll
  and GST still clear; one preview pays the batch; "Who to pay" on the Cash screen in the app
- Customer payment reminders (2026-10-17): overdue customers scored from a year of paying
  history, one draft each in a matching tone with the bank details, recent payers left out,
  a follow-up reminder set on send; from chat or the bell on a customer's thread in the app
- Defensible audit: full-population rules, SA 230 working papers, systematic sampling,
  Schedule III / CARO / 3CD checks, engagement risk scoring. "Audit the books" runs on the
  books themselves (sales, receipts, credit notes, purchases, payments, expenses with their
  heads and TDS sections, approved payroll) when no ledger file is attached (2026-10-16)

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
- **Ready API Tools**:
  - `track_gst_returns`: Track filed returns (GSTR-1, GSTR-3B) with dates and ARNs via Sandbox / mock
  - `search_gstin`: Look up official taxpayer legal name, trade name, active status, type, and address
  - **Document Store Auto-Discovery**: `gst_reconcile`, `prepare_itr`, and `monitor_tds` discover uploaded client documents automatically when inputs are not passed in command arguments
  - **Redundant E-Invoicing**: Dual-path e-invoicing supporting direct NIC IRP and Quicko Sandbox GSP with fallback/provider selection
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
| REQ-CA-011–015 | Built in on 2026-10-15 (reminders with an assignee, document requests to clients, the outbox, plain-text firm search, the eval log with corrections). Answers from the notes through the model built 2026-10-16 (`ask_knowledge`: the notes that mention the question's words go to the model through the action gate with a prompt that forbids any figure not in the notes; the notes found are shown even when the model is off) |
| Live filing | Save and file GSTR-1 through the GSP and the TDS FVU job are wired end to end behind the action gate (`save_gstr1_portal`, `file_gstr1_portal`, `generate_tds_fvu`, 2026-10-16): a save needs no held invoice, a filing needs the approved review, an unchanged draft, the EVC OTP and a CA approval, and records its acknowledgement. Left: GSP onboarding and production credentials, the live switch, ITR, MCA21. DSC signing built 2026-10-20 (`dsc_certificates` lists the Windows certificate store, `dsc_sign` makes a detached PKCS#7 over an uploaded document through the action gate with a CA approval and stores it beside the books; verified with a self-signed certificate in the suite) |
| Integrations | Account Aggregator FI data imports as a bank statement (2026-10-16: the decrypted JSON an AA client delivers, every account with its Transactions, through `import_bank`; the consent and FIU licence stay with the owner). Zoho Books write-back built 2026-10-16 (`push_zoho_invoices`: the month's invoices not yet in Zoho go through the action gate as a write with a CA approval, the customer is found or created, each line carries its HSN and the matching Zoho tax, and the invoice keeps its Zoho id; credentials in the local vault as the `zoho` connector). Tally write-back over its HTTP port built 2026-10-20 (`push_tally`, previewed, loopback only, audited through the gate as a local application). Documents are read by the model (vision), so no separate OCR provider is planned |
| Firm backend | The hosted API (`cloud/`) is built with accounts, tenancy, roles, backups and a daily job, and deploys itself once a Google Cloud project exists. Built 2026-10-16: the Cloud Storage document vault (`MYCA_DOCUMENT_BUCKET`; bytes by sha256 per business, Postgres keeps the index, every read re-verifies the hash; Terraform creates the bucket) and OpenID Connect sign-in for a firm's own identity provider (`POST /v1/auth/oidc`, `MYCA_OIDC_ISSUER` and `MYCA_OIDC_CLIENT_IDS`, keys through discovery). Left: the Google Cloud project, and an OIDC sign-in screen in the app once a firm names its issuer |
| D2C and marketplace brands (decided 2026-10-16, `docs/superpowers/specs/2026-10-16-d2c-programme.md`) | Built 2026-10-16: D1 settlement reconciliation, D2 orders and returns with settlements posting, D3 TCS and 194-O credits against the portal statement and 26AS, D4 several GSTINs under one business with stock transfers, D5 SKU costs, stock and margins, D7 the daily close; on the phone as the Marketplace screen, the close on Home and registration-scoped Taxes. D6 connectors built to the credential boundary 2026-10-16 (`set_channel_connector`, `fetch_channel_report`, `sync_channels` for Amazon SP-API, Shopify and Razorpay through the action gate with mock fixtures; the desktop fetches daily; Flipkart, Myntra, Nykaa, Meesho and Unicommerce stay file imports). Hosted pulls built 2026-10-16: each business saves its connector credentials on the hosted API (`POST /v1/businesses/:id/connectors`, sealed per business with `MYCA_CONNECTOR_KEY`, never shown back), the nightly job and `POST .../connector-sync` pull through the gate behind the separate read-only switch `MYCA_ENABLE_CHANNEL_PULLS` (government and model calls stay behind the live switch, which the hosted API still refuses). Left to go live: seller credentials and the owner turning the pull switch on; and D8: the WhatsApp webhook is built on the hosted API (Meta Cloud API, signature-checked, members matched by number, the same preview-and-confirm chat; 2026-10-16) and waits on a WhatsApp Business account; Hindi and Telugu wait on the model decision |
| UI polish | Invoice design built 2026-10-16 (colour, layout, bank details, terms, footer, signatory, HSN column; desktop print and app PDF). Export invoices in a foreign currency (2026-10-15) cover the multi-currency need for Indian businesses; the desktop has keyboard shortcuts (Ctrl+K or / for chat, Ctrl+1 to 8 for the tabs, Esc clears) |
| Ops | Custom domain + TLS active, GitHub Pro branch protection, code-signing certificate. The packaged app checks the project's GitHub release page on launch; once the installer is signed by the publisher it downloads, verifies and installs it quietly (2026-10-21), until then it offers the download |
| Tax assistant (2026-11-09) | Built: five tax knowledge modules in the open Agent Skills format (`platform/src/tax-modules/*/SKILL.md`: GST returns, input tax credit, income tax for individuals, TDS on business payments, presumptive income) whose figures are filled in from the dated statutory rules for the date asked about; `ask_tax` answers from them through the action gate and refuses a model answer that quotes a figure not in the rules; `tax_plan` (both regimes, break-even deductions, 87A edge, 44AD/44ADA against actual profit); `review_income_tax` (checks a prepared return against MyCA's computation, Form 26AS and the year's GST sales). New rule records `income-tax.presumptive.business` and `.profession`. Left: CA sign-off on the modules and the new records, capital gains, house property and HRA in the computation, reading a prepared ITR JSON or Form 16 straight into the review, and screens in the desktop and Android apps (both reach the tools through chat today) |
| Batch 4 leftovers (2026-11-06) | AIS in the Form 26AS check (the check and `import_26as_credits` read Form 26AS only; `prepare_itr` already takes an AIS file for the regime comparison). The file the GSTN IMS portal takes for decisions (MyCA keeps the decisions and sends nothing to the portal). A server-side step-up before another device is ended (the server asks for no code; the app asks the phone's own screen lock). A line in the privacy notice for the authenticator key (the notice in force, `draft-2026-10-07`, does not name it). A daily WhatsApp message for MSME dates (the reminder is on Home and goes to nobody; the weekly brief, where switched on, already names MSME bills past their date) |

## Known limitations (stated honestly, not hidden)

- The AES-256-GCM vault fallback is not hardware-backed; the shipped Electron app uses
  real DPAPI via `safeStorage`.
- A fresh install opens with empty books and a blank business (2026-10-18): the desktop shows a
  two-step setup (name and GSTIN, with the state and PAN derived; then Tally, Zoho, a bank
  statement or fresh books) and nothing can post until the business is named; sample books
  load only through `seed_demo`.
- Under Electron the API token reaches the renderer through the preload bridge only
  (`MYCA_TOKEN_IN_PAGE=0`, 2026-10-20); `npm run dev` in a plain browser still serves it in
  the page, which is a development convenience on a single-user machine.
- The local CA API is a contract/test harness, not a production connector layer.
- The marketing site under `deploy/` is research/status content, not the product.
- `vendor/` reference clones are never imported (licence reasons — see `vendor/README.md`).
- A receipt or payment said in chat is read for one amount. A date in words ("on 20
  October"), a reference said as "cheque no 123456" or "UTR 4567891234", a six-digit
  cheque number said after the amount, "net 30" and "30 days" are not counted as amounts.
  Two real amounts, or a short bare number such as "cheque 123", make MyCA say it read
  more than one amount, record nothing and ask for the one amount. An amount of zero or
  less is refused in words and nothing is recorded. "Yesterday" and "the day before
  yesterday" date the entry one or two days back (2026-11-09); other relative words such as
  "last Friday" are not read, the entry is dated today, and the preview shows the date before
  anything posts ([`04-tds.md`](docs/product/features/04-tds.md)).
- The Excel export of the audit trail follows "by <name>" and "last N" (2026-11-09): the
  Audit trail sheet keeps that person's events, or the latest N, and the Summary sheet names
  the filter. The Entries sheet is still the whole period's day book, and a name or count
  that cannot be read ("by me", "limit 5000") is said in words and not applied
  ([`10-audit-trail.md`](docs/product/features/10-audit-trail.md)).
- The audit trail's hash chain has no key. Once a newer event follows, it shows an event that
  was edited or taken out of the log. It does not show events cut off the end of the log, a
  log re-sealed by someone able to write the books, a changed client label (the client an
  event is filed under is not part of the hash) or who appended an event. The trail says
  "verified" and never that the log is whole.
- TDS the business deducts from a supplier is taken when the bill or expense is posted ("bill
  from Fabric Co 10000 GST 5% with TDS 194C", after "we deduct TDS, TAN ..."), or added to a
  posted bill that has none with `add_bill_tds` ("add TDS 194C to BILL-0001", 2026-11-09). That
  works the TDS out as of the bill date and refuses a bill paid in full; TDS on an expense
  already posted, and a payment said with "less TDS", are not split in one step (MyCA asks
  for the bill TDS first). `record_tds_withheld` takes sales invoices (INV- numbers) only.
- E-invoice payloads (2026-11-09, checked against the NIC release notes of 16 October 2026):
  B2B and exports (EXPWP, EXPWOP with country, currency and shipping bill) are built; a B2C
  invoice, a line without a 4, 6 or 8 digit HSN or SAC, a missing seller or buyer PIN, and a
  document before 1 October 2021 are refused before any IRP call, and an IRN older than 24
  hours is not sent for cancellation. Not built: SEZ (SEZWPA, SEZWPNA, SEZWOP), deemed exports
  and the new RCM types (RCMDOM, RCMIMP), the 30-day reporting limit for turnover of 10 crore
  or more (MyCA does not hold the turnover), and the 6-digit HSN rule above 5 crore.
- Switching two-step on needs only a live session (accepted 2026-11-06): a stolen or unlocked
  session can enrol its own authenticator and take the recovery codes, and every later
  sign-in by the owner then stops at a step only the thief can pass until an operator
  steps in. The planned mitigation is in `docs/architecture/SECURITY-AND-PRIVACY.md`
  section 4.
