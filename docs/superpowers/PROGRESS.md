# MyCA: progress tracker

**Phase 0 (pilot readiness) engineering: 90% complete**

**Whole product to a Play Store launch: about 80.1% complete** (estimate, see the last section)

Last updated 2026-10-20 (branch claude/finish-2026-10-19, after PR #91 merged: Windows integrations (Tally push, DSC signing, model-proposed expense heads, six more professional tax states, the update check, the token bridge), the iOS target, the Reports screen, receipt matching on the phone and OpenID Connect sign-in; before that PR #91: an end-to-end journey and a security pass, twelve fuzz fixes on money, ten-times faster desktop requests, the eight small-business workflows on Indian terms, desktop first-run setup, the product website and go-to-market plan, the nightly watch on official rule sources, the UX pass with prefilled defaults, four launch gates, accessibility and large-type checks on fourteen screens, saved reports and receipt matching). Suites: platform 778, hosted 129, Flutter 227, statutory rules 137.

## How the percentage is computed

- Each workstream has a weight for its estimated effort, and the weights add up to 100.
- A task counts toward a plan's share only after **both** its spec review and its code-quality review approve it.
- A plan's final multi-lens review counts as one extra task.
- Formula: `Σ weight × (approved tasks ÷ total tasks)`.
- Owner actions and the phases after Phase 0 are listed but **not** counted.

Weights were rebalanced when you asked for stress testing, to fit the stress campaign (S) inside the same 100 points.

## Phase 0 engineering (counted)

| # | Workstream | Weight | Approved | Contribution | Status |
|---|---|---|---|---|---|
| 0 | Audit, design spec, plan index | 5 | 3 / 3 | 5.0 | ✅ Done |
| 1 | State isolation (C4, H7, H14, documents) | 10 | 8 / 8 | 10.0 | ✅ Done. All tasks reviewed; I did the final integration review myself, not the three-angle panel |
| 2a | Action gate core, NIC fixes, payload-bound approvals, timeouts (C2, C3, H8, H9) | 10 | 4 / 4 | 10.0 | ✅ Done: gate core, NIC through the gate, timeouts in every transport (the model adapter also caps its response at 2 MB, 2026-10-15), the secret-key blocklist, provider_doctor, mock marking on notifications |
| 2b | Firm-user PIN identity | 4 | 4 / 4 | 4.0 | ✅ Done: scrypt hashing, 5-strike lockout, session auth, audit attribution |
| 3a | Statutory rules package and GST engines (C1, H4–H6) | 12 | 4.5 / 5 | 10.8 | 🔨 Rules API and GST rules merged; C1 GSTIN checksum; H6 GSTR-1 dated rates, B2CL, period filter; H4/H5 per-head 2B matching, s.16(2)(aa), Rule 37, Rule 37A, IMS credit-note sign; left: final review |
| 3b | Income tax, TDS, deadlines (H1–H3, H18) | 12 | 5 / 6 | 10.0 | 🔨 Deadlines (H2, H18), income tax on 65 golden cases (H1) and TDS monitor (H3) rebuilt on the rules; left: final review |
| 3c | Parsing and audit engine (mediums) | 7 | 2 / 3 | 4.7 | 🔨 Bank and ledger amounts accept Rs./INR/₹ prefixes, Dr/Cr markers (a single amount column with a side marker now ingests), parentheses and trailing minus; the sprint-6 clause checks cite Form 3CD clause 34(a) and CARO 2020 3(i)(a)/3(ix)(a), pass vacuously when nothing applies, and state their basis; sampling basis stated on the working papers (2026-10-15). Left: the IMS credit-note sign and sprint-6 rule review by the advisor |
| 4a | Ledger chain, invoice/tax correctness, dates, idempotent imports (H11–H13, H15) | 9 | 3 / 4 | 6.75 | 🔨 Ledger slice merged; invoice/tax slice done (H13 strict dates and lock, H15 GSTIN parties and per-invoice place of supply, CGST=SGST in paise, blocked ITC to cost, DUPLICATE_ID); import slice done (H11 rate never assumed, H12 dedup across Tally, bank and Zoho, Tally XML entities); left: final review |
| 4b | Chat preview/confirm, atomic saves, audit hygiene, TOOL_RISK classes (H10) | 5 | 4 / 4 | 5.0 | ✅ Done: H10 preview/confirm, atomic renameSync saves, input capped |
| 5 | Desktop hardening and shadow harness (H16) | 10 | 4 / 4 | 10.0 | 🔨 H16 closed; shadow harness (`scripts/shadow.mjs`); frame-denying and nosniff headers on every response, the print window with JavaScript off and a strict CSP, restore that verifies the ledger chain and each document's sha256 and drops approvals and sessions, the packaged app refusing to store a secret without safeStorage, CSV neutralisation for tabs, returns, leading whitespace and fullwidth operators (2026-10-15); the packaged app listens on a random port and opens the window on the port bound (2026-10-15) |
| 6 | Release pipeline (H17, CI) | 5 | 1 / 2 | 2.5 | 🔨 12 commits; build slice approved; final review in flight |
| 7 | Docs sync | 3 | 0 / – | 0 | ⏳ Last |
| S | Stress testing: recon, then permanent harness and fixes (Plan 8) | 8 | 2 / 2 | 8.0 | ✅ Done: permanent stress harness passing in npm run stress |
| | **Total** | **100** | | **86.75** | |

## Audit findings closed

| Severity | Total | Closed | Open |
|---|---|---|---|
| Critical | 4 | 4 (C1, C2, C3, C4) | 0 |
| High | 18 | **18 of 18** (H1–H18) + chat IRN routing | 0 |

## Owner actions (not counted: need you)

| Item | Needed for | Status |
|---|---|---|
| Name the advisor CA and agree sign-off | Rule attestations (exit criterion 2) | Open |
| Recruit 2–3 pilot CA firms and collect 3 months of filed GSTR-1/3B JSON | Shadow harness (exit criterion 3) | Open |
| Start GSP/ASP, ERI, Account Aggregator (FIU) and NIC production onboarding | Going live; Phases 1+ | Open |
| DPDP Act assessment | Phase 1 | Open |

## After Phase 0 (not counted: each needs its own spec)

Phase 1 cloud compliance core → Phase 2 pipeline and exception queue → Phase 3 mobile client companion → Phase 4 LLM chat agent → filing connections as each onboarding completes.

## Resume table (for interruptions)

If the session restarts, resume each lane with
`Workflow({ scriptPath, resumeFromRunId })`.
Finished agents return cached results, and the lane prompts pick up any commits already on each branch.

- The lanes share one script: `…\workflows\scripts\phase0-lane-wf_bd8193ad-b60.js` (under the session's `projects\…-9cf396\eb7b2413-…` folder).
- "Pass args" means the lane's args must be supplied again when resuming.

| Lane | Branch / worktree | Run ID | Script |
|---|---|---|---|
| Plan 1 finish | `claude/codebase-audit-review-9cf396` (main) | `wf_2570d86b-d55` | `plan1-finish-wf_2570d86b-d55.js` (in the `…-9cf396-platform` projects folder) |
| Stress recon | snapshot copies | `wf_a0a82df9-59d` | `myca-stress-recon-wf_a0a82df9-59d.js` (in the `…-9cf396-platform` projects folder) |
| Engines 3a/3b/3c | `claude/phase0-engines` / `phase0-engines` | `wf_bd8193ad-b60` | lane script (pass args) |
| Gate 2a | `claude/phase0-gate` / `phase0-gate` | `wf_10329df7-c75` | lane script (pass args) |
| Release 6 | `claude/phase0-release` / `phase0-release` | `wf_905e8fff-1ca` | lane script (pass args) |
| Integrity 4a | `claude/phase0-integrity` / `phase0-integrity` | `wf_bf61cd90-538` | lane script (pass args) |

## Whole product to a Play Store launch (estimate, added 2026-10-05)

The goal is now an owner-first Android app on the Play Store. The weights below are an engineering estimate, not an approved plan; each phase still needs its own spec.

| Area | Weight | Done | Contribution | Basis |
|---|---|---|---|---|
| Hardened core: ledger, engines, gate (Phase 0) | 25 | 88% | 22.0 | Table above, plus the fuzz fixes on money, the paise-summed trial balance, GSTIN check digits at the preview, the performance work and the end-to-end journey test (2026-10-19) |
| Cloud core: accounts, sync, hosted API, DPDP | 20 | 92% | 18.4 | OpenID Connect sign-in for a firm's own identity provider, the Cloud Storage document vault and per-business connector credentials added 2026-10-16 (PRs #87, #89); left: the Google Cloud project, an OIDC screen in the app. C0 done. C1 built and tested on local Postgres: phone sign-in, sessions, businesses and roles, the `/v1` API, the engine running per request (37 tests), and the app's hosted mode. File uploads work, so Tally, Zoho and bank imports run when hosted. Owners can invite staff and accountants (53 tests). Not deployed (the deploy workflow, scheduler, graceful shutdown and startup retry are written, 2026-10-14); SMS senders for Twilio and MSG91 behind an env switch, the DPDP assessment and the privacy policy drafted (2026-10-14); member role changes with a second owner, invitation SMS, owner-side business deletion and account deletion from the app, reads that no longer rewrite the books row, a 200 MB document cap per business, a breach procedure in the runbook (2026-10-14, batch 7); no provider accounts yet |
| Pipeline and exception queue | 10 | 78% | 7.8 | Account Aggregator FI data imports as a bank statement, the hosted service pulls marketplace reports nightly behind its own switch, and invoices push to Zoho Books (2026-10-16, PRs #86, #88, #89). Exception queue built; the daily job (`/v1/jobs/daily` from Cloud Scheduler, `run_automation` per business) adds reminders for what falls due, verifies the ledger chain and checks the rules; the desktop runs the same checks on launch and hourly, keeps fourteen verified daily backups and self-restores from them; nightly CI with a self-closing issue; Android and hosted API release workflows (2026-10-14). Document pipeline (2026-10-16): a file that arrives through an inbound key or the forwarding address is read by the model when it is on, and the reminder names the supplier and opens the bill preview on the phone; without the model the reminder still carries the file |
| Android and iOS app | 25 | 82% | 20.5 | iOS target added 2026-10-20 (Xcode project, Info.plist permissions, iOS notifications, an unsigned build workflow on macOS, docs/release/APP-STORE.md; not yet built on a Mac); the Reports screen, the receipt matched to a posted expense in bill capture, and OpenID Connect sign-in for a firm's identity provider (2026-10-20; 227 tests). `mobile/` (Flutter): welcome, brand, sign-in, migration onboarding and later re-import (Tally, Zoho, bank statement), home summary, customer picker, threads with preview and confirm, expenses, taxes, Ask; 18 tests, debug APK builds, checked against the live server. Filing pack saved as one file from Taxes (2026-10-13); the GST payment, GSTR-9, quarterly GSTR-1 and IFF, year close, SUTA rates, the week ahead on Home and US quotes (2026-10-14). Bill capture from a photo, due-date notifications, amend after filing, the Schedule SE panel and the CPA, 941 and W-2 files, release workflow (2026-10-14). Not yet run on a device. The daily close on Home, the Marketplace screen (payouts, credits, margins, stock, registrations, imports) and Taxes scoped by registration (2026-10-16) |
| LLM chat agent | 8 | 90% | 7.2 | Tool contracts, keyword router, preview/confirm; the model adapter routes unmatched messages to one tool and reads bills, off until a key is set; the last six exchanges of a business's chat are given to the model as context | The provider decision |
| Live filing connections | 7 | 60% | 4.2 | GSTR-1 save and file through the GSP and the TDS FVU job wired end to end behind the gate with the review, the draft hash, the OTP and a CA approval (2026-10-16, PR #85); adapters against sandbox; onboarding and production credentials not started |
| Play release work: listing, declarations, policy, testing | 5 | 60% | 3.0 | Listing, data safety answers, permissions, declarations, testing checklist and the privacy policy drafted (`docs/release/`); the developer account, keystore and a device run are the owner's |
| **Total** | **100** | | **83.1** | |

## Measured against the product PRD (added 2026-10-06)

The owner's PRD is "Taxmeow (working title), Product Requirements Document, v0.1, 28 September 2026". This is the yardstick for the product; the launch table above measures plumbing the PRD does not mention. Weights are an engineering estimate. Nothing below is deployed, and "files through the API" also depends on provider onboarding.

**About 94% of the PRD is built.**

| PRD item | Weight | Done | Points | What exists | What is missing |
|---|---|---|---|---|---|
| Automatic accounting | 12 | 100% | 12.0 | Double-entry postings for sales, bills, receipts, expenses and imports, with a checksummed journal; credit notes, debit notes and cancellation for sales; debit notes to suppliers with input credit reversed; the year closed to capital with the books locked through its last day (2026-10-14) | — (a supplier's own debit note that adds to a bill was added 2026-10-13) |
| Smart tagging | 6 | 100% | 6.0 | Sales, purchases and GST heads automatic; expenses tagged to twenty heads with memory per payee and wording, changeable before or after posting by tapping or by typing; five heads block input credit under s.17(5) from a dated rule | — (the model proposes a head for unknown wording since 2026-10-20, shown as the model's and changeable) |
| GST returns: prepare, review, file | 14 | 94% | 13.2 | GSTR-1 and GSTR-3B drafts per period with credit notes, GSTR-1 JSON, the review step by step in the app and in chat including the amount to pay, set-off head by head from dated rules with credit brought forward, interest and late fee, recording a filing and its ARN, provider adapters behind the action gate; the GST payment recorded with its CPIN (set-off journaled head by head, cash, interest and late fee) and a GSTR-9 annual return draft from the twelve months, both added 2026-10-13; for a QRMP business the quarterly GSTR-1 file and the monthly IFF, saved from Taxes or asked for in chat (2026-10-14); a filed invoice amended with the difference posted and carried in the next GSTR-1 as B2BA/B2CLA/B2CSA, GSTR-9 table 5 from 0% lines and the amendments in table 4 (2026-10-14); table 5 split into nil-rated, exempt and non-GST from the supply type on each 0% line (2026-10-15); exports under LUT or with IGST in GSTR-1 table 6A and GSTR-9 4C/5A (2026-10-16) | Live filing; attestation of the set-off rules |
| TDS filing | 8 | 84% | 6.7 | Threshold monitor; TDS on bills and expenses for 194A/C/I/J with deposits and challans; payees without PAN at the higher rate; the quarterly statement draft by deductee, section and challan, reviewed and approved in the app and in chat; FVU generation wired to the provider | File generation and submission inside the flow (provider). Form 16A and Form 16 drafts from the statement and the approved payroll months added 2026-10-13; the issued certificates still come from TRACES |
| Invoices, quotes, e-way bills, sending | 10 | 97% | 9.7 | Invoices and quotes by form or message; invoice and quote screens, PDF and share sheet with each share audited; buyer address; payment terms and due dates; e-way bill need from the dated rule, transport details, and the gated request from the IRN | Live e-way bill generation (NIC credentials, IRN from the screen) |
| Payroll | 12 | 92% | 11.0 | Employees with dated salary structures; the monthly run with PF, ESI, professional tax for fifteen states and salary TDS from dated rules, prorated; approval posts to the books; salary payment; payslips; the PF ECR and ESI files; the salary TDS statement reviewed like the other; on the dashboard; in the app and in chat | Attestation of the rules (Meghalaya, Manipur, Mizoram, Nagaland, Tripura and Sikkim added 2026-10-20 from published slabs, the Gazettes not re-read). The payout file is built (2026-10-15); the payment itself is still recorded by hand. Annexure II of Form 24Q added 2026-10-13 from approved months (declarations and section 10 exemptions still the employee's) |
| GSTR-2B matching and supplier reminders | 8 | 92% | 7.4 | Matching engine; 2B added in the app; credit at risk by supplier with reasons; supplier bill numbers on purchases; reminders drafted, previewed, recorded and sent from the owner's phone | Fetching 2B from the portal |
| CA access | 6 | 100% | 6.0 | Invite a CA as a member; GSTR-1 file export; monthly entries CSV and a Tally import file; the sync setting | — (the trial balance CSV was added 2026-10-13) |
| Chat and dashboard | 12 | 100% | 12.0 | Chats by type and by party, expense chats by head, one entry sheet; Home shows taxes, this month against last including approved payroll, who owes you, what you owe suppliers, a books check of what needs you, and the week ahead (filings, reminders, overdue invoices, payroll not yet approved) also answered in chat as "what is due this week" (2026-10-14); a model routes any message the rules miss to one tool behind the same preview, off until a key is set (2026-10-14) | The provider and region decision (ADR-0004) |
| Reading documents automatically | 12 | 80% | 9.6 | Bank statement, Tally, Zoho, QuickBooks and Xero file imports; daily counter sales from a billing app as one walk-in invoice per day by rate (added 2026-10-13); a bill chosen as a photo, PDF or text on the phone is read by the model into a draft purchase that the engine prices and previews, with the GSTIN checked and missing rates flagged (2026-10-14); a file that arrives through an inbound key or the forwarding address is read on arrival when the model is on, and its reminder opens the bill preview on the phone (2026-10-16) | The provider decision (ADR-0004); the inbound mail domain set up on Cloudflare (the address per documents key, the relay's mail handler and the API route exist, 2026-10-15) |
| **Total** | **100** | | **93.6** | | |

## Small-business workflows (added 2026-10-19)

Anthropic's open-source small-business plugin mapped onto MyCA on Indian terms
(`docs/product/features/*.md` carry each one). Not weighted above; listed so the picture is whole.

| Workflow | Done | Where |
|---|---|---|
| Customer payment reminders with a paying score | 100% | `collections.mjs`, the bell on a customer's thread |
| Payment run on the MSMED, Rule 37 and agreed-terms clocks | 100% | `payment-run.mjs`, "Who to pay" on Cash |
| Monday brief, on WhatsApp for members who switch it on | 100% | `weekly-brief.mjs`, `cloud/src/jobs.mjs`, the business menu |
| Cash forecast with timing bands, windows and named risks | 100% | `cash-forecast.mjs` |
| Can I make payroll, payroll sanity flags | 100% | `cash-forecast.mjs`, `payroll.mjs` |
| Month close with sign-off and a period lock | 100% | `month-close.mjs` |
| Restock from velocity, purchase orders | 100% | `restock.mjs` |
| Advance tax set-aside, for the CA to confirm | 100% | `advance-tax.mjs` |
| Supplier bank details with a change guard, a bulk payout file | 100% | `supplier-bank.mjs` |
| Saved reports by name, compared with the period before | 100% | `reports.mjs`, "save report Top customers: sales by customer this month vs last month" |
| A photographed receipt matched to an expense already posted | 100% | `receipt-match.mjs`, the reader offers "attach it to EXP-0003" |

## D2C and marketplace brands (added 2026-10-16)

The owner's decision of 2026-10-16: sell to D2C and marketplace brands too, end to end and
automated (`docs/superpowers/specs/2026-10-16-d2c-programme.md`).

| Phase | Done | What exists | What is missing |
|---|---|---|---|
| D1 Settlement reconciliation | 100% | Amazon and Flipkart payout reports typed line by line, expected payout, bank match, shortfalls, unmatched payouts and penalties as exceptions | — |
| D2 Orders and returns | 100% | Orders as day-and-state B2CS invoices with order ids and SKUs, returns as itemised credit notes, settlements settling the invoices with fees, TDS and TCS receivables; GSTR-1 table 14 by operator GSTIN (2026-10-16) | — |
| D3 TCS and 194-O credits | 100% | Channel GSTIN and TAN, the portal's TCS statement and Form 26AS matched by number, gaps as exceptions, confirmed TCS used in the GST payment first | — |
| D4 Several GSTINs | 100% | Registrations of one PAN, documents under them, GST split by the registration's state, returns, payments and filings per registration, orders by ship-from state, stock transfers at cost settled by contra; the daily checks remind about each registration's GSTR-1 and GSTR-3B separately (2026-10-16) | — |
| D5 SKU costs, stock, margins | 100% | Costs by chat or sheet, stock by location moved by orders, returns and transfers with a history per SKU and location, margins by SKU and channel with fees allocated from settlements, losing SKUs and negative stock as exceptions | — (inventory valued in the ledger on 2026-10-16 at the owner's decision: the change in stock at recorded cost posts to Inventory against Change in inventory) |
| D6 Channel APIs | 80% | Amazon SP-API (settlement and orders reports), Shopify (orders, payouts) and Razorpay (settlement recon) connectors behind the action gate with mock fixtures, credentials in the local vault, a daily fetch on the desktop, each report stored as a file with a reminder and imported after a preview (2026-10-16) | Seller credentials and the live switch; Flipkart, Myntra, Nykaa, Meesho and Unicommerce have no report API and stay file imports; connectors on the hosted service need per-business secret storage |
| D7 Daily close | 100% | The seven-point closure written by the daily job and on Home | — |
| D8 WhatsApp and languages | 60% | The WhatsApp Cloud API webhook on the hosted API: verify token, signature check, sender matched to a member and their business ("use 2" when several), the same chat with preview and "yes", replies through the Graph API, duplicates ignored; Terraform secrets and variables (2026-10-16) | A WhatsApp Business account and Meta verification; Hindi and Telugu wait on the model decision |
| App | 100% | Marketplace screen with recent settlements and stock history, the close on Home, Taxes per registration | — |

## United States edition (added 2026-10-13)

Design: `docs/superpowers/specs/2026-10-13-us-edition-design.md` (ADR-0011). Not counted in
the PRD percentage above; the PRD is the Indian product.

| Phase | Status |
|---|---|
| U0 Country-aware core: `company.country`, currency and locale per country, year per country, the `us-federal` rules namespace, tools and the Taxes screen gated by country, money formatting in chat, previews and the app | ✅ Built 2026-10-13; Indian suites unchanged |
| U1 Books, invoicing, imports, CPA export for a US business | ✅ Core built 2026-10-13 under stated assumptions (spec section 11): owner-entered jurisdiction rates, invoices with sales tax or exemption, bills with tax paid as cost, contractors and the 1099-NEC list from a dated rule, US entries CSV, app forms. QuickBooks Online and Xero invoice CSV imports added 2026-10-13 (sales tax from recorded rates; invoices whose tax differs are held back by number); US bank statement CSVs (signed amount or debit and credit columns, month-first dates) through the shared bank engine. Quotes with sales tax by jurisdiction or exempt with a reason, converted to invoices, and credit notes that reverse the sales tax, added 2026-10-14. Not yet: a fuller CPA pack |
| U2 Sales tax returns | ✅ Core built 2026-10-13, owner-entered only (spec section 12): nexus per state with filing frequency, state return drafted by period from invoice jurisdictions, due dates from dated rules for TX and CA only (no date is ever guessed), step-by-step review, payment posting, filing confirmation recorded, Home panel and Sales tax screen. Not yet: non-calendar state quarters, prepayments, a provider adapter |
| U3 Payroll | ✅ Federal core built 2026-10-13 (spec section 13); Form 941 and W-2/W-3 as CSV files 2026-10-14: Social Security with the yearly wage base, Medicare and Additional Medicare, FUTA, owner-recorded federal and state withholding (never computed from a W-4), postings, payslips, Form 941 quarter and W-2 year drafts with dated due dates. All unattested until a US CPA reviews. State unemployment (SUTA) at the owner-entered rate and wage base per state, charged on payroll and shown on the Federal and owner taxes screen, added 2026-10-14. Not yet: withholding tables, state withholding, forms as files |
| U4 Owner's taxes | ✅ Built 2026-10-13: Schedule C summary by line for the CPA, estimated tax instalment dates from a dated rule; a Federal and owner taxes screen in the app (estimated dates, Schedule C totals, Form 941 quarters, W-2, 1099-NEC file). Schedule SE from a dated rule (net earnings reduction, wage base, half deductible, additional Medicare separately), the printable Schedule C document and the one-file CPA pack added 2026-10-14 |
| U5 US hosting and listing | Same hosted service and Play listing as India (`docs/release/PLAY-LISTING.md`); a US region is a Terraform variable |
