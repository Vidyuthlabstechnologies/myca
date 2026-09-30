# Phase 0: Pilot readiness — design

Date: 2026-09-21. Status: approved in brainstorming, awaiting written-spec review.
Inputs: `docs/audit/2026-09-21-codebase-audit.md` (finding IDs C1–C4, H1–H18 below refer to it).

## 1. Context

### Vision
MyCA replaces the CA's repetitive work for Indian small and mid-size businesses:
- one chat interface;
- automated end to end, from invoicing to accounting to tax filing;
- a Windows app for CA firms and a mobile app for their clients.

### Decisions already made

| Decision | Choice |
|---|---|
| First market | CA firms first. The mobile app launches as the CA's client companion; direct-to-SMB for non-audit businesses comes later |
| v1 jobs | GST cycle, books, TDS, ITR: job types on one shared pipeline, built in filing-calendar order (GST → books → TDS → ITR) |
| Master copy of data | Cloud (India region, each firm isolated), with the desktop keeping an offline cache and syncing |
| CA review | Exceptions only: a clean return goes to one-tap client approval; the CA sees only exceptions plus a batch sign-off |
| Route | Fix the current code, pilot it, then move to the cloud (option A) |
| Pilot mode | Shadow first; switch a firm to live once it matches a full cycle |
| Rule verification | Layered: rules prepared with citations, signed off by an advisor CA, and each pilot firm may also sign off or dispute |
| Identity before cloud | A PIN for each firm user |
| Chat changes to books | A preview card; nothing posts until one tap to confirm |

### Legal limits that shape every phase
- A tax audit and a statutory audit must be signed by a practising CA.
- Every filing needs the taxpayer's OTP/EVC or DSC (companies and LLPs need a DSC).
- Filing on a client's behalf needs a GSP/ASP (GST) and ERI registration (income tax).
- Holding clients' financial data in the cloud brings DPDP Act 2023 duties.

## 2. Phase 0 goal, non-goals, exit criteria

**Goal.** 2–3 CA firms run real client data through the current Windows app, with no risk of:
- a wrong filing;
- one client's data reaching another client;
- an external action that bypasses approval.

**Non-goals.**
- Cloud backend, mobile app, LLM chat agent, new features.
- Low-severity findings, unless the fix is one line.
- Terraform apply.

**Exit criteria.**
1. Every Critical and High finding (C1–C4, H1–H18) has a regression test. The test fails on `d2416c9` and passes after the fix.
2. Every rule used by an engine is signed off by the advisor CA. Every golden case passes for FY 2025-26 and FY 2026-27.
3. For each pilot client, MyCA's recomputed GSTR-1/3B for the last 3 filed months matches the filed return. Any difference is classified and explained in the shadow report.
4. The platform suite and all sprint suites are green in CI. README/STATUS counts match reality.

## 3. Pilot mode

**Shadow phase.**
- The live switch stays off for every pilot firm.
- Each firm keeps filing as it does today. MyCA prepares every return in parallel, and the action gate records a **dry run**: the exact payload it would have sent.
- The shadow harness (§8.4) diffs each dry run against the return that was actually filed.

**Going live.** A firm goes live only after a full return cycle with every difference resolved. Going live means:
- turning on the live switch for that install;
- filing through the action gate, with approvals.

## 4. W1: Tax rules as dated data

### 4.1 Package
Add a new zero-dependency package, `sprints/statutory-rules/`. It is bundled automatically by the existing `extraResources` filter.
- **Rule data:** `src/rules/gst.mjs`, `income-tax.mjs`, `tds.mjs`, `due-dates.mjs`, `holidays.mjs`.
- **API:** `src/index.mjs`.
- **Golden cases:** `golden/*.json`.

### 4.2 Rule record
```js
{
  id: 'gst.b2cl.threshold',
  value: 100000,
  basis: 'invoice_value',
  effectiveFrom: '2024-08-01',
  effectiveTo: null,
  act: 'CGST',
  section: 'GSTR-1 Table 5',
  source: 'Notification 12/2024-Central Tax',
  attestations: [
    { by: 'Advisor name, ICAI membership no.', role: 'advisor', firmId: null, on: '2026-10-02', verdict: 'verified' }
  ]
}
```
- `effectiveFrom` and `effectiveTo` are inclusive ISO dates. `effectiveTo: null` means the rule is still in force.
- `act` is one of `CGST | IGST | IT-1961 | IT-2025 | …`.
- `section` holds the section under that Act. Rules for FY 2026-27 onward cite the Income-tax Act 2025. The advisor confirms the section mapping; it is never guessed.
- `verdict` is `verified` or `disputed`.

### 4.3 API
- `rule(id, onDate)` returns one of:
  - `{ ok: true, value, record }`
  - `{ ok: false, error: 'RULE_UNKNOWN' }`
  - `{ ok: false, error: 'RULE_NOT_IN_FORCE', id, onDate }`

  It **never falls back** to the latest version.
- `rulesUsed` is collected by each engine call and returned as `{ rulesUsed: [id@effectiveFrom…], unverifiedRules: [...] }`.
- `isVerifiedFor(record, firmId)` is true only when both hold:
  - there is an advisor `verified` attestation, or that firm's own `verified` attestation;
  - that firm has no `disputed` attestation.

### 4.4 Which date selects the rule

| Rule kind | Date used |
|---|---|
| Per-transaction (GST rate set, B2CL threshold, e-invoice applicability) | Invoice or transaction date |
| Per-year (slabs, 87A, surcharge, standard deduction, TDS aggregate thresholds, audit thresholds) | FY start date (e.g. `2026-04-01`) |
| Due dates | End of the return period |

### 4.5 Determinism
- Engines never read the clock. The tool layer passes `asOf` (today's date) and `fy` explicitly.
- This removes the hard-coded `'2026-09-07'` and fixed month lists (H18).

### 4.6 Engine fixes, all expressed through rules

| Finding | Fix |
|---|---|
| C1 | GSTIN checksum uses `floor(p/36)+p%36`. Add state codes 38/97/99. Accept any alphanumeric 14th character. Special formats (TCS, UIN, NRTP, OIDAR) are validated only against real sample GSTINs the advisor supplies as golden cases, never guessed. |
| H1 | New-regime slabs 0/5/10/15/20/25/30. 87A ₹60k with marginal relief. Surcharge 10/15/25 (new regime capped at 25) with marginal relief. Use the `fy` argument. |
| H2 | No weekend rollover. Due dates move only for notified extensions, which are rule records. |
| H3 | TDS thresholds from 1-Apr-2025 on the correct basis (FY aggregate, per month, per payee type). Add the 2% rates for 194J technical and 194I plant & machinery. |
| H4 | Blocked credit is based on ITC (cgst+sgst+igst). Rename the module to what it actually checks (s.16(2)(aa) availability). Add Rule 37 (180-day non-payment) and Rule 37A (supplier's 3B not filed by 30 Sept) as separate, correctly labelled checks. CDNR is negative. |
| H5 | 2B matching compares each tax head within tolerance. Unmatched book credit notes are reported. Credit-note detection uses document type, not the `CN` prefix. Invoice numbers are normalised (leading zeros, separators). |
| H6 | B2CL = inter-state AND invoice value > ₹1L, as a dated rule. Rate set comes from rules, including 40%, 3% and 0.25%. `export_gstr1_json` filters by `fp`. B2B items are grouped by rate. `gt`/`cur_gt` come from input. |
| H18 | The deadlines tool uses the real company and registered clients, today's date, a rolling month window, holidays from rules, and CSV built with `text-safe.mjs`. |
| Medium | Deadline Q4 label; audit threshold (₹1Cr, or ₹10Cr if cash ≤5%, business; ₹50L/₹75L profession); GSTR-9 for QRMP filers above ₹2Cr; GSTR-7 only for GST TDS deductors; TDS deposit and PMT-06 dates; ITR standard deduction scope, 80C/80D caps and refunds; `Dr`/`Cr` and signed-amount parsing; `Rs.` prefix; IMS credit-note sign; sprint-6 clause checks, clause references and sampling basis. |

The frozen status of `sprints/*` is lifted for Phase 0. The `sprints/*/AGENTS.md` specs are marked superseded where they encode wrong law.

## 5. W2: One gate for every external action

### 5.1 Module
`platform/src/action-gate.mjs` exports `performExternalAction(state, { actionId, clientId, params, actor }, execute)`.

Every outbound call goes through it:
- Sandbox adapters;
- NIC auth, IRN generate/get/cancel, e-Way Bill, GSTIN master, health;
- the government probe;
- notification sends;
- NIM.

### 5.2 Action classes
Declared in one table:
- `read` — credentialed lookups. Needs the live switch.
- `write` — file, IRN generate/cancel, EWB, send. Needs the live switch **and** an approval.

### 5.3 Check order
1. **Mock mode.** Returns a tagged fixture. Writes go only to `mock*` fields (`invoice.mockIrn`, outbox `simulated: true`), never to real fields. `allowFallback` is removed.
2. **Live switch.** If off, return `LIVE_CALLS_DISABLED` and write a dry-run record: `{ actionId, clientId, paramsHash, payload }`, with secret fields redacted.
3. **Approval** (write class only). Must match all of:
   - `operationId`;
   - `clientId`;
   - `paramsHash = sha256(canonicalJson(params))`.

   The approver's `userId` must differ from the requester's (user IDs compared normalised). The approval must not have expired; a missing `expiresAt` counts as expired.
4. **Reserve.** Mark the approval `in_flight` before calling `execute`.
5. **Settle.** Mark it `used` on success or `failed` on error. A `failed` approval cannot be reused. Irreversible actions are never retried automatically.
6. **Audit.** Record an event with before/after hashes and `paramsHash`. Secret values are never recorded.

### 5.4 No network options from tool arguments
- Remove `host`, `allowLive`, `payload`, `allowFallback` and `mock` from tool implementations and schemas.
- Hosts come only from config.
- NIC result objects never contain `token`, `sek` or raw `Data`.

### 5.5 NIC protocol fixes
- Decrypt `Sek` with the AppKey.
- A decrypt failure returns `ok: false, error: 'DECRYPT_FAILED'`.
- NIC wrappers return `fail(...)` when the inner result is not ok.
- The public-key loader accepts a DER `.cer` and rejects non-RSA keys.
- Add fetch timeouts (`AbortSignal.timeout`) and response size caps in every transport.

### 5.6 Identity (firm-user PIN)
- `state.firm.users` entries: `{ userId, name, role: 'partner'|'reviewer'|'admin'|'staff', pinHash, pinSalt, clientIds }`.
  - `pinHash` uses scrypt.
  - `role` is checked against this record; a role passed as an argument is never trusted.
- **First run** creates an admin with a PIN.
- **App start** asks who is working. `POST /api/session { userId, pin }` returns a session bound to the launch token (§7).
  - Sessions expire after 30 minutes idle.
  - Five wrong PINs lock that user out for 5 minutes.
- **Actor source.** `actor` always comes from the session, never from request arguments. The assistant's actor is `assistant`, and `assistant` may never decide an approval.

### 5.7 Enforcement test
`fetch(` may appear only in the transport modules (`sandbox-client`, `nic-client`, `nim-client`, `notifications`, `govt`), and only `action-gate.mjs` may import them. An architecture test fails otherwise.

## 6. W3: Client isolation and data integrity

### 6.1 Firm-level state
- Move all firm-wide data under one object:
  `state.firm = { approvals, approvalSeq, documents, documentSeq, audit, auditSeq, integrations, users }`
- The shallow view shares this object with the root state. `syncView` keeps only per-book fields.
- Migration: `store.mjs` lifts the legacy top-level fields into `state.firm` on load, one time, and saves the new shape. Restoring an older backup runs the same migration.

### 6.2 Guarded view
- `toolState()` returns a `Proxy`. Setting any top-level key outside `BOOK_KEYS` throws `VIEW_WRITE_OUTSIDE_BOOK`.
- The test suite runs every tool under the proxy.

### 6.3 Client IDs
- Pattern `^[A-Z0-9][A-Z0-9_-]{1,31}$`. `SELF` is reserved.
- Books are held in null-prototype objects and accessed via `Object.hasOwn`.
- The same pattern is enforced on restore.

### 6.4 Attachments
- Stored per book in `book.files`.
- Cleared after a successful import.
- Document IDs are always assigned by the server. The file cache is keyed by sha256, and the hash is re-verified on read.

### 6.5 Imports are idempotent
- Each imported row has `sourceKey = sha256(kind + FY + normalisedRow)`, stored in `book.importKeys`. A re-import skips the row.
- `createInvoice` rejects an existing ID.
- Tally keys include the FY and voucher type.
- Tally amounts: when there are no tax columns, the amount is treated as tax-inclusive and GST is backed out. If the rate is unknown, the row is blocked. An explicit 0% stays 0%.
- Zoho CSV: quote-aware parsing across lines. A blank rate means "unknown", not 18%. Strip the `%`. Use the taxable column.
- XML entities are decoded.

### 6.6 Dates
- One `isoDate()` parser rejects anything that is not a valid `YYYY-MM-DD`.
- It runs at every posting entry point before the period-lock check.

### 6.7 Parties and tax
- Parties are matched on GSTIN when one is given.
- Place of supply always comes from the invoice. State codes are normalised to 2-digit strings.
- Blocked ITC is posted to cost.
- The GST rate is validated against the rule-set in force on the invoice date.
- CGST = SGST = round(taxable × rate/2) in integer paise.

### 6.8 Ledger
- `verifyChain` recomputes each CRC from the canonical row body and reconciles balances.
- Post and void append resolve rows to the chain.
- Idempotency compares payloads, and ids are tracked within a batch.
- Restore runs `verifyChain` and refuses the backup if it fails.

### 6.9 Chat: preview, then confirm
- Every tool gets an explicit class in `TOOL_RISK`: `read`, `book_write`, `external_read`, `external_write` or `blocked`. There is no default, and a missing class fails the architecture test.
- Messages longer than 4,000 characters are rejected. This also closes the ReDoS in `intent.mjs:6`.
- Questions ("has/is/what/how/can/does…", or a trailing `?`) route only to `read` tools.
- Preview/confirm applies to the chat path only. The renderer's explicit forms call tools directly, as the session user.
- State-changing intents return a preview instead of executing:

  ```
  { kind: 'proposal', proposalId, tool, args, argsHash, summary, expiresAt }
  ```

  - Proposals are kept in memory only, expire after 10 minutes, and are single-use.
  - The renderer shows a card. `POST /api/confirm { proposalId }` runs exactly the args behind `argsHash`, as the session user.
- The rate regex uses `\b(at|rate)\b|@`.

### 6.10 Storage and audit
- `state.json` is written to a temp file, fsynced, renamed, and the previous copy kept as `.bak`. If the main file fails to parse on load, the `.bak` is used.
- `putDocument` verifies the hash of a file that already exists.
- Read-class tools neither save nor append audit events.
- `stateDigest` includes `lockThrough`, integrations, and per-book `company`/`imports`.
- `POST audit-events` accepts only allow-listed fields. The id, time and hashes are assigned by the server.

## 7. W4: Desktop hardening
- **Port.** The packaged app listens on port 0 and passes the actual port to the window. `npm run dev` keeps 4780.
- **Host check.** Requests must have `Host` of `127.0.0.1:<port>` or `localhost:<port>`; anything else gets 421.
- **Launch token.** `main.cjs` generates 32 random bytes and passes them to the server via env and to the renderer via the preload.
  - Every `/api/*` and `/documents/*` request needs `x-myca-token`.
  - The preload bridge stays narrow: `saveInvoicePdf` plus a read-only token.
  - Under `npm run dev` (plain Node, no preload), the server generates the token and prints `http://127.0.0.1:4780/#t=<token>`. The renderer reads it from the preload if present, otherwise from the URL fragment. The fragment is never sent to the server; the renderer keeps it in `sessionStorage`.
- **Framing.** Send `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` headers.
- **Print window.** `javascript: false`, a strict CSP, and no file-protocol privileges.
- **Restore.**
  - Validates `sha256` values as 64 hex characters, client IDs and the chain.
  - Drops approvals and sessions.
  - Has its own 200 MB body limit.
- **Vault.**
  - The packaged app refuses to store secrets without `safeStorage`.
  - A record that fails to decrypt is kept as-is and reported, never wiped.
- **Low items.** CSV formula neutralisation adds `\t`, `\r`, leading whitespace and fullwidth `＝`.

## 8. W5: Release pipeline, and testing

### 8.1 Release (required before the first public download)
- `build-windows.yml` passes the tag via `env:`, validated against `^v[0-9.]+$`.
- Separate build and publish jobs; only publish holds `id-token`/`contents: write`.
- Third-party actions pinned by commit SHA.
- `SHA256SUMS` published.
- `signExecutable` removed once `CSC_LINK` exists.
- Download aliases updated only for the highest version, with a CDN purge and a concurrency group.
- **WIF** condition: `repository_id` plus (`refs/heads/main` or tag `v*`). PR plans use a separate read-only SA with no environment.
- **Deployer SA** drops `iam.serviceAccountUser`, `run.admin` and `secretmanager.admin`; storage is granted per bucket.
- Bootstrap and root modules use separate state prefixes.
- Uptime check: `use_ssl` and `validate_ssl`.
- CI apply receives every input as `TF_VAR_*`.

### 8.2 Regression tests
Every audit repro becomes a test, written red first.
- Platform findings go in `platform/test/audit-*.test.mjs`.
- Engine findings go in the relevant sprint's `test/`.

### 8.3 Golden and architecture tests
- **Golden:** each engine suite runs `statutory-rules/golden/*.json`.
- **Rules integrity** — a test fails when:
  - two versions of the same rule id overlap;
  - there are gaps inside a declared coverage window;
  - any rule used by an engine lacks `source`.
- **Architecture** — tests check that:
  - `fetch` appears only in transport modules;
  - the proxy view catches out-of-book writes;
  - every state-changing tool emits an audit event;
  - every tool has a schema and a `TOOL_RISK` entry;
  - no tool reads a network option from its args.

### 8.4 Shadow harness
- **Command:** `node scripts/shadow.mjs --client <id> --period YYYY-MM --filed <gstr1.json> --filed3b <3b.json>`.
- **Steps:** loads the client's books and runs the preparation engines. Takes the gate's dry-run payloads. Diffs them against the filed returns:
  - GSTR-1 by table: b2b, b2cl, b2cs, cdnr, hsn;
  - GSTR-3B by table: 3.1, 4.
- **Output:** each difference is classified as `engine_bug`, `data_gap` or `documented_difference`. The report is written to the documents store under the client.

## 9. Order of work

| Step | Work | Depends on |
|---|---|---|
| 1 | W3 structure: `state.firm` + migration, proxy view, client IDs | — |
| 2a | W2 gate + firm-user PIN + NIC fixes | 1 |
| 2b | W1 rules package + engine fixes + golden cases | — (parallel with 2a) |
| 3 | W3 integrity: imports, dates, parties/tax, ledger chain, chat preview/confirm, storage | 1 |
| 4 | W4 hardening, then the shadow harness | 2a, 3 |
| 5 | Docs: README/STATUS counts, AGENTS.md (sprints editable during Phase 0, rules-as-data, gate and proxy invariants) | all |
| — | W5 release pipeline | before any public download |

Estimate: 3–4 weeks of focused work. Advisor sign-off runs in parallel.

## 10. Owner actions outside the code

| Item | Why now |
|---|---|
| Name the advisor CA and agree the sign-off process | Exit criterion 2 depends on it |
| Recruit 2–3 pilot firms; collect 3 months of filed GSTR-1/3B JSON per client | Shadow harness inputs |
| Start GSP/ASP partnership, ERI registration, Account Aggregator (FIU) onboarding, NIC production onboarding | Paperwork takes weeks to months and gates later phases, not Phase 0 |
| DPDP Act assessment for the cloud phase | Needed before Phase 1 stores client data in the cloud |

## 11. After Phase 0

Each phase below gets its own spec → plan → build cycle.
- **Phase 1:** cloud compliance core.
  - Tenant-isolated database; engines reused.
  - The gate and rules move server-side.
  - The desktop becomes a synced client.
  - Real auth replaces the PIN.
  - Minimal audited runtime dependencies on the server; engines stay zero-dependency.
- **Phase 2:** the pipeline and the exception queue.
- **Phase 3:** the mobile client companion.
- **Phase 4:** the LLM chat agent. It proposes tools; the Phase 0 preview/confirm mechanism executes them.
- **Filing rails:** go live as each onboarding completes.
