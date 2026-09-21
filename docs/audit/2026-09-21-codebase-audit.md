# MyCA codebase audit, 2026-09-21

Commit `d2416c9`, branch `claude/codebase-audit-review-9cf396`. Six parallel reviews covered: local server and Electron security, ledger and GST maths, provider gates and approvals, tool and contract consistency, statutory engines, and infra/CI/Workers. Nearly every finding was reproduced by running the real modules. The rest are marked *(read)*: taken from reading the code, not run. The three headline claims (GSTIN checksum, IRN gate, new-regime slabs) were re-checked independently.

## Verdict

- **Engineering is disciplined, but the numbers are not safe yet.**
  - The ledger core, the input escaping and the CI pipeline are sound.
  - Several statutory engines compute wrong figures: GSTIN validation, new-regime income tax, TDS thresholds, due dates, 2B matching and the Rule 37A check.
  - The tests pass because the frozen specs (`sprints/*/AGENTS.md`) encode the same errors.
- **The safety gates have gaps.**
  - NIC e-invoice writes bypass CA approval.
  - Tool arguments can override the live switch and redirect credentials.
  - Approvals are not bound to the payload or the client.
- **Per-client isolation is maintained by convention and leaks.**
  - `syncView` drops counters.
  - Attachments are shared across clients.
  - A client id like `constructor` resolves to the firm's own books.
- **Against the product vision** (autonomous compliance, cloud-hosted, CA-first):
  - The statutory, gate and isolation findings carry straight over and must be fixed in any architecture.
  - Most local-server findings (DNS rebinding, port squatting) disappear once the desktop becomes a cloud client, but they need patching for any pilot that ships the current build.

Totals: 4 critical, 18 high, about 60 medium and low.

Test baseline: all green. Platform 133, sprints 11/11/33/44/58/2, **292 total**.

---

## Critical

| # | Finding | Where | Evidence |
|---|---|---|---|
| C1 | GSTIN checksum uses the plain weighted sum instead of `floor(p/36) + p%36`. It rejects every real GSTIN and accepts invalid ones. Also missing: state codes 38/97/99, and a 14th char other than `Z` is always rejected, so TCS/UIN/NRTP/OIDAR formats fail. It blocks `set_company` and short-circuits `validate_gstin`. | `sprints/sprint-3-gst-recon/src/gstin.mjs:54-58`; `platform/src/tools.mjs:67,856` | GSTN sample `27AAPFU0939F1ZV` rejected; 0 of 2000 generated valid GSTINs accepted; the README example `27AAACH7409R1Z3` is accepted but invalid (correct check char `1`) |
| C2 | NIC e-invoice writes (generate IRN, cancel IRN, e-Way Bill) never call `findApproval`/`consumeApproval`. `govt_generate_irn` is not assistant-blocked. Chat routes "cancel irn INV-2", "what is the irn of INV-1" and "do not generate irn for INV-3" all to generate. | `platform/src/tools.mjs:259,300,495-502`; `assistant-contract.mjs:449,629-632` | Real IRN issued with zero approvals; cancel ends `irnStatus: CNL` |
| C3 | Raw tool args are passed as NIC client options. `allowLive:true` bypasses the live switch. `host` redirects auth, leaking `client_id`/`client_secret` to any URL. `payload` forges the document but stamps the IRN on the real invoice. `govt_nic_health {host}` is an SSRF that returns 200 chars of the response. | `platform/src/tools.mjs:239,481,501` → `nic-client.mjs:30,83-115,170,197-206,241` | All four reproduced with `fetch` stubbed |
| C4 | Client ids `constructor`, `toString` or `__proto__` resolve to built-in object properties. Postings for that client land in the firm's SELF books, and the counters pollute `Object.prototype`. It persists across restarts. Reachable via `add_client`, `POST /api/ca/clients`, or a restored backup. | `platform/src/books.mjs:78`; `ca-api.mjs:96-98`; `session.mjs:58-62` | SELF invoices 2 → 3; `Object.invoiceSeq = 3` |

## High: statutory figures

| # | Finding | Where | Correct law |
|---|---|---|---|
| H1 | New-regime income tax taxes the 8–12L, 12–16L and 16–20L bands at 15/18/22%. There is no 87A marginal relief and no surcharge; `fy` is ignored. Wrong for every year: ₹12L salary gives ₹9,100 (should be 0); ₹13L gives ₹87,880 (should be ₹26,000); ₹60L gives ₹14.53L (should be ₹15.53L). | `sprints/sprint-5-filing-assistant/src/core.mjs:1-14` | FY 2025-26: 0/5/10/15/20/25/30%, 87A ₹60k to ₹12L with marginal relief, surcharge 10/15/25% |
| H2 | Every Saturday and Sunday rolls the due date forward. ITR (audit) and TDS Q2 due Sat 31-Oct-2026 show as 2-Nov, so escalation fires late. | `sprints/sprint-4-deadlines/src/calendar.mjs:22-31` | E-filing deadlines don't roll over on weekends |
| H3 | TDS thresholds are the FY 2024-25 values on the wrong basis: 194J ₹30k single payment, 194I ₹2.4L/yr, 194A ₹40k. 2% rates (194J technical, 194I plant and machinery) are not modelled. | `sprint-5-filing-assistant/src/tdsmonitor.mjs:45-52`; `sprint-6-defensible-audit/src/auditrules.mjs:4-9` | From 1-Apr-2025: 194J ₹50k FY aggregate; 194I ₹50k/month; 194A ₹10k (non-bank) / ₹50k (bank) |
| H4 | "Rule 37A" reports the invoice value as blocked credit (fixture: ₹56,000 blocked vs ₹6,000 actual ITC). It is really an s.16(2)(aa) availability check, not Rule 37 (180-day non-payment) or 37A (supplier's 3B not filed). A credit note missing from the books is reported with a positive sign. | `sprints/sprint-3-gst-recon/src/rule37a.mjs:59,66,74` | Use the ITC (cgst+sgst+igst); name and implement the actual rule |
| H5 | GSTR-2B matching checks taxable value only. Books ITC ₹18,000 vs 2B ₹5,000 counts as exact, and so does CGST+SGST vs IGST. Book credit notes missing from 2B vanish. `CNTR-77` is treated as a credit note. | `sprints/sprint-3-gst-recon/src/match2b.mjs:34-38,64,72` | Compare each tax head within tolerance |
| H6 | GSTR-1: the platform JSON has no B2CL bucket. Sprint-5 uses the old ₹2.5L threshold on taxable value and sends intra-state B2C sales to B2CL. The 40% rate is missing, so those invoices are dropped. `export_gstr1_json` ignores `fp` and exports every invoice. | `platform/src/gstr1-json.mjs:23-24,54`; `tools.mjs:429`; `sprint-5-filing-assistant/src/gstr1.mjs:5,148` | B2CL is inter-state and invoice value > ₹1L (from 1-Aug-2024); 40% slab from 22-Sep-2025 |

## High: gates, integrity, isolation

| # | Finding | Where | Evidence |
|---|---|---|---|
| H7 | `syncView` copies back only 6 fields. `approvalSeq`, `documentSeq`, `auditSeq` and `integrationConnections` are lost whenever a client is active. The result is duplicate approval ids (a reviewer approves the wrong operation), duplicate document ids (the second overwrites the first), duplicate audit ids, and integration connects silently discarded. | `platform/src/session.mjs:49-66` | `APR-000002 APR-000002` → `approved op: einvoice_generate`; found independently by 3 reviewers |
| H8 | Approvals: `requestedBy`/`decidedBy`/`role` are request-body strings, so maker-checker is bypassed with `ca` vs `CA`. An approval is bound only to `operationId`, not to params or client, so an August GSTR-1 approval files November. Restore trusts approvals, and an empty `expiresAt` never expires. | `platform/src/approvals.mjs:67,108-110`; `sandbox-adapter.mjs:419-426`; `session.mjs:152-172` | `filed: true` with the mismatched period and client |
| H9 | `nicAuthenticate`, `nicHealth` and `probeGovt` ignore `liveCallsEnabled()`. With live OFF, "nic auth" in chat sends the client secret, and "probe govt" hits 6 government hosts. | `platform/src/nic-client.mjs:82,197`; `govt.mjs:21` | `client_secret header sent` with the switch off |
| H10 | Ordinary chat questions post entries. "Has INV-0003 been paid yet?" records a full receipt. The rate regex has no word boundary ("format 2" posts an invoice). Attachments persist, so "how do I reconcile my bank statement?" re-imports the bank rows. | `platform/src/assistant-contract.mjs:634-658`; `intent.mjs:24` | Reproduced for each phrase |
| H11 | Tally import adds GST on top of GST-inclusive amounts, and treats an explicit 0% as 18%. | `platform/src/post-import.mjs:10-18,33` | ₹1,180 incl. voucher → total ₹1,392.40 |
| H12 | Re-imports double-post: Zoho, Tally receipts/payments, and bank rows have no dedup, and explicit invoice ids aren't checked for uniqueness. The Tally dedup key `TALLY-<voucherNo>` collides across financial years. | `platform/src/tools.mjs:799-811`; `post-import.mjs:40,56,71-104`; `ca-api.mjs` `postVoucher` | TB debit doubles on the second import |
| H13 | The period lock does a plain string compare on un-normalised dates. `2026-6-1` and `2026/06/01` slip past a lock through `2026-06-30`. | `platform/src/period-lock.mjs:16` | 3 of 3 bypasses accepted |
| H14 | `state.files` is root-level and shared, so SELF's inward CSV feeds client B's GSTR-3B ITC. | `platform/src/tools.mjs:437` (+ `gst_reconcile`, `import_tally_xml`, `monitor_tds`, `audit_books`) | B shows `netItc 2000` from SELF's file |
| H15 | Party lookup matches GSTIN **or** name, so a same-name party with a new GSTIN or state reuses the old one. Result: CGST/SGST where IGST is due, and a sticky "Walk-in" place of supply. | `platform/src/invoice.mjs:16` | `cgst 90 sgst 90 igst 0` for an inter-state sale |
| H16 | DNS rebinding: `Host` is never validated, a missing `Origin` is allowed, and `x-myca-client: renderer` is a constant, not a secret. Any website can read `/api/snapshot`, ledgers, documents and audit events (GET only; POSTs stay blocked). Any local process can drive the full API. | `platform/src/server.mjs:20,25-35,80-91` | Snapshot and a client document read via rebound Host |
| H18 | The `deadlines` tool hard-codes today as `asOfDate: '2026-09-07'` and the months as Aug–Oct 2026, so every status is computed as of 7 Sept 2026 forever. On 21 Sept, GSTR-1 (due 11 Sept) and GSTR-3B (due 20 Sept) show as upcoming, not overdue. It also invents the firm's profile (₹2.5 Cr turnover, LLP, monthly GST, audit required), leaves out registered clients, and builds the CSV with a string template instead of `text-safe.mjs` (a comma in the firm's name corrupts it). Found during design, after the six reviews. | `platform/src/tools.mjs:918-928`; `sprints/sprint-4-deadlines/src/index.mjs:6` | Checked by reading the code |
| H17 | Infra (not yet live): Workload Identity trusts every branch in the repo. The deployer SA holds `iam.serviceAccountUser` + `run.admin` + `secretmanager.admin` + project-wide `storage.admin`, which is an escalation path to Editor. Following the bootstrap comment makes both modules share `default.tfstate`, so CI would destroy the WIF pool. | `infra/bootstrap/main.tf:12-15,39,45-47,130`; `infra/bootstrap/versions.tf:4-6`; `infra/versions.tf:6` | *(read)* |

## Medium

- **Ledger:**
  - Blocked ITC (`itcEligible:false`) still reduces GST payable (`invoice.mjs:243-246`).
  - Negative or illegal GST rates are accepted via `/api/tool`, and the schema rejects the legal 40% (`invoice.mjs:37,203`; `assistant-contract.mjs:18,444`).
- **Ledger chain:**
  - `verifyChain` only checks links and never recomputes CRCs, so tampered amounts pass.
  - Post/void advance the checksum without appending a row, which makes false breaks.
  - Restore never verifies the chain (`ledger.mjs:347-386`).
- **Ledger idempotency (latent):**
  - A re-submitted id with a different amount returns `exists:true`.
  - Duplicate ids within one batch are both applied.
  - A pending transfer can be posted twice, or posted and voided (`ledger.mjs:227-238`).
- **Zoho CSV:**
  - Rows are split on newlines before quotes are handled.
  - A blank tax becomes 18%, and `18%` becomes NaN.
  - The taxable column is never used (`import-zoho.mjs:26-27,81`).
- **Mock treated as real:**
  - A mock IRN is written onto the real invoice with no marker, and a later live cancel would send it.
  - `allowFallback` stamps a mock IRN after a real rejection.
  - A mock notification marks the outbox message `sent`.
  - `govt_save_credentials {env:'mock'}` pins NIC to mock (`nic-client.mjs:220-225,244`; `notifications.mjs:109-113`).
- **NIC protocol:**
  - The Sek is used without AES-decrypting it with the AppKey, so every live IRN call would fail `INVALID_SEK` (`nic-client.mjs:117,137`).
  - A decrypt failure is returned as `ok:true` (`:192`).
  - The auth `token`/`sek` are returned in tool results (`:141-150`).
- **Tool results:**
  - Tools return `ok:true` on failure: the NIC wrappers, and `import_zoho` on `NO_HEADER` or all-rows-locked (`tools.mjs:474-501,803-811`).
- **Availability:**
  - ReDoS (catastrophic regex backtracking) in `intent.mjs:6`: 160k spaces take 8 s, and it runs inside the Electron main process.
  - There are no `fetch` timeouts, and a hung provider holds the session lock (`sandbox-client.mjs:67,97`; `nim-client.mjs:29,99`; `notifications.mjs:71,93`).
- **Audit digest:** `stateDigest` omits `lockThrough`, `integrationConnections` and the per-book `company`/`imports`, so lock and unlock log identical before/after hashes (`ca-api.mjs:19-39`).
- **Deadlines:**
  - Q4 is labelled `2027-28` for Jan–Mar 2027.
  - A trader with ₹70L turnover is treated as needing a tax audit (the ₹1Cr/₹10Cr limits are ignored).
  - GSTR-9 is skipped for QRMP filers above ₹2Cr.
  - GSTR-7 is generated for income-tax deductors.
  - TDS deposit (7th) and PMT-06 (25th) are missing (`deadlines.mjs:36,89,97`).
- **ITR:**
  - A standard deduction is applied to business-only income and is not capped at salary.
  - 80C and 80D are uncapped.
  - A TDS refund is lost (`itr.mjs:142-143,165`).
- **Parsing:**
  - `Dr`/`Cr` suffixes block every row (`sprint-2 validate.mjs:15-27`; sprint-1 has the same code).
  - A signed "Amount" column ingests zeros with `ok:true`.
  - `"Rs. 5,000"` parses as 0.5 (sprint-5/6 `parseAmount`).
  - The second line of a multi-line Tally voucher is flagged as a duplicate.
- **Sprint-6:**
  - 3CD-1 is hard-coded to fail.
  - The rent check is inverted.
  - A clean ledger fails 4 of 6 checks.
  - Clause references are wrong (TDS is 34(a)/21(b), not 26; borrowings are CARO 3(ix)).
  - `rows: 24` is hard-coded.
  - Sampling has no random start and no size basis, and "Nothing noted" is written without running a procedure.
- **IMS:** ITC is overstated because credit notes are added and ITC-unavailable rows are included (`ims.mjs:27-34`).
- **Local data:**
  - `state.json` is rewritten in place, so a torn write bricks startup (`store.mjs:135`).
  - `putDocument` never repairs a half-written file (`document-store.mjs:18`).
- **Backups:**
  - A backup `sha256` is used as a path (`..\..\x` reads any `.txt` file).
  - Restore accepts forged approvals, audit events and users (`document-store.mjs:24`; `session.mjs:152-172`).
- **CA API:**
  - `documentId` is caller-chosen, so a cross-client document swap is possible (`ca-api.mjs:181`).
  - `POST audit-events` accepts caller-supplied ids, timestamps and hashes (`:286-288`).
- **Electron:**
  - A squatted port 4780 is silently "reused" and loaded with the preload bridge.
  - The PDF print window runs page JS that can `fetch('file:///…')` (`server.mjs:150-153`; `main.cjs:25,37-41`).
- **CI:**
  - Tag-name shell injection via `${{ github.ref_name }}` in `run:` (`build-windows.yml:76`).
  - The release job runs `npm ci` + electron-builder while holding `id-token: write` + `contents: write`.
  - Third-party actions are pinned by tag.
- **Release:**
  - `"signExecutable": false` prevents signing even after `CSC_LINK` is set, and no checksums are published (`package.json:39`).
  - The uptime check on 443 lacks `use_ssl`, so it fails permanently (`infra/main.tf:300-303`).
  - CI apply passes only 2 vars, which undoes a local `manage_dns=false` / `alert_email` apply (`terraform.yml:58-67`).

## Low

- **Server and client:**
  - No `X-Frame-Options`/`frame-ancestors`, so the app can be clickjacked.
  - The vault fallback key is derivable from hostname + username (dev only; Electron uses DPAPI).
  - A failed decrypt silently wipes stored credentials on the next save.
  - CSV neutralisation misses leading `\t`, `\r`, whitespace and full-width `＝`.
  - A backup over 25 MB can't be restored (body cap).
- **Money formatting:**
  - An odd-paise split gives CGST ≠ SGST, and floats show on printed invoices (`CGST ₹0.30000000000000004`).
  - Limit checks count pending credits.
  - `paise(1.005)` = 100.
  - GSTR-1 `gt`/`cur_gt` are set to the period's taxable value.
  - B2B items are not grouped by rate.
  - Tally XML entities are not decoded.
  - A numeric `partyState` gives IGST on an intra-state sale.
- **Tool and contract:**
  - Read-only tools write audit events and rewrite `state.json` on every refresh.
  - The validator lets `constructor`/`__proto__` keys through and has no `integer` type.
  - `post_expense` args have drifted from its schema.
  - `TOOL_RISK` labels 12 of 54 assistant-visible tools.
  - `provider_doctor` opens a TCP socket with live OFF and ignores `process.env`.
  - The NIC public-key loader rejects a DER `.cer` and accepts EC keys.
  - The secret-key blocklist misses `sek`, `appKey`, `x-api-key`, `pwd`; `payloadSummary` is unchecked.
- **Email relay (not an open relay):**
  - `ALLOWED_FROM_DOMAIN: ""` disables the sender check.
  - No recipient cap or rate limit.
  - Non-constant-time token compare.
  - CR/LF passes through in `fromName`.
  - The client reads `data.id` but the relay returns `messageId`.
- **Infra:**
  - Downloads aliases are served stale for up to 2 days.
  - Deleted site files stay reachable via object versions.
  - The Terraform lock file is gitignored.
  - Fixed cert name.
  - PR plans can hold the state lock during apply.
  - Branch protection and environment approval are unenforceable on the current private free plan.

## Docs drift

- **Test counts:** the docs claim 268 tests (README), "platform 109" (README/STATUS) and "platform 76" (DEPLOYMENT). Actual: **292**, platform **133**.
- **Tool count:** the docs claim 60 tools; `TOOLS` has **69**.
- **Installer:** "built and verified in CI" is not true; `ci.yml` never builds it.
- **Example GSTIN:** the README's `27AAACH7409R1Z3` is invalid.
- **Broken link:** `MyCA_Credentials_Guide.html:265` links outside the repo.
- **Stale spec:** `sprints/*/AGENTS.md` encode several of the statutory errors above, so they are no longer a trustworthy spec.

## Checked and fine

- CI runs all 7 suites under `set -euo pipefail` on Node 22, with no `continue-on-error`. There is no `pull_request_target`, and `ci.yml` is `contents: read`.
- No secrets in git history. `.gitignore` covers `.env*`, tfstate and tfvars. The HTML guides load nothing remote and post nothing.
- Cross-origin POSTs are refused (`text/plain`, `Origin: null`, other localhost ports). Static-path traversal returns 404 in every encoding tried.
- The renderer writes with `textContent` only. Print HTML escapes all five characters. `contextIsolation` is on and `nodeIntegration` off. Child windows get no bridge. `openExternal` is limited to `mailto:` and WhatsApp.
- Chat enforces the blocked-tool list at execution time with strict schemas. `runSandboxOperation` checks the live switch before any client call. Approval expiry and single-use are checked at consume time.
- NIC crypto primitives: `randomBytes` AppKey, RSA PKCS#1 v1.5, AES key-length checks. TLS verification is never disabled.
- Linked transfers are atomic, with full rollback. The trial balance always ties. IGST/total-tax paise rounding is exact over 200k cases.
- Deadline date arithmetic is UTC-safe. Old-regime slabs, the ₹12.5k rebate and cess are correct. The bank tie-out and lakh-grouping parser are correct. `sprint-load` resolves engines in the packaged app.

## Repro scripts

The reviewers' repro scripts live in the session scratchpad, outside the repo:
- `srv.mjs`, `restore.mjs`, `squat.mjs`, `docs.mjs`
- `ledger.mjs`, `session.mjs`, `invoice.mjs`, `gstr1.mjs`, `imports.mjs`, `proto.mjs`, `files.mjs`
- `r1_live_switch.mjs` … `r5_intent.mjs`
- `itr.mjs`, `tds.mjs`, `dl.mjs`, `gstin.mjs`, `g1.mjs`, `aud.mjs`
- `contract-diff.mjs`, `session-repro.mjs`, `chat-repro.mjs`, `redos.mjs`

Each confirmed finding should become a regression test in `platform/test/` or the relevant sprint suite when it is fixed.
