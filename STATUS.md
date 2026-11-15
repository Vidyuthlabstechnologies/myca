# MyCA — Status

As of main on 2026-11-10. Verification: platform **1,351**, the hosted API **341** against Postgres,
email relay **3**, every sprint suite, the Android app about **600** widget tests (`node scripts/check-all.mjs`),
CI green, end-to-end smoke runs on Windows. Hosting: the API and the public site run on Google Cloud
(Cloud Run and Cloud SQL in Mumbai, project `myca-prod-in`) since 2026-11-10, with an empty database;
the earlier AWS deployment (2026-11-08) is being switched off. A separate staging stack (`environment = "staging"`,
simulated providers, no real sends) is defined in `infra/cloud` and rolled out before production, but not yet
applied. [`DEPLOYMENT.md`](DEPLOYMENT.md) is the source of truth. "Verified" means covered by tests or an
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
- IRS e-file for Form 1040 (2026-11-11): Form 8879 self-select PIN signing bound to the
  return, MeF XML and manifest from the computed 1040, the transmission zip, a WS-Security
  A2A client behind the action gate, acknowledgements and rejections with the fix and the
  screen; sandbox simulator by default, never validated against the IRS schema or ATS yet
  (`docs/integrations/IRS-EFILE.md`)
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

- Competitive gaps (2026-11-14, see docs/product/COMPETITIVE-GAP-MATRIX.md): US refund booster
  (`us_refund_boost`, each unused deduction priced by re-running the return); UK simplified expenses
  and trading allowance check (`gb_simplified_expenses`) and CIS deductions (`gb_cis_deductions`);
  UAE end-of-service gratuity (`ae_gratuity`) and WPS salary file (`ae_wps_file`), all from dated rules
- India counter billing (2026-11-14): `find_item` looks up a SKU by code or barcode, `set_sku_cost`
  stores barcode and selling price; the Android Counter sale screen scans with the camera, bills through
  `create_invoice` and prints the engine's figures on a 58/80 mm Bluetooth ESC/POS printer
- Malaysia PCB (2026-11-14): `my_payroll` works out the monthly tax deduction by LHDN's computerised
  method from `my.payroll.pcb` and the resident bands and rebate rules (categories 1 to 3, children,
  bonus, year to date, zakat, TP1 deductions; flat rate for non-residents)
- UAE payroll run (2026-11-14): `ae_payroll_run` pays overtime on the basic hourly wage, rest days,
  unpaid leave, GPSSA pension for Emiratis and the month's gratuity accrual from dated rules
  (`ae.labour.overtime`, `ae.labour.wage-deductions`, `ae.pension.gpssa`) and hands WPS lines to `ae_wps_file`
- US start from last year (2026-11-14): `import_us_prior_year` copies the profile, sealed SSNs and
  dependents from last year's MyCA return, fills last year's AGI, tax and capital loss carryovers (or
  takes them typed), and lists the forms to expect; the US app has a Start from last year screen
- UK payroll calculation (2026-11-15): `gb_payroll_run` works out a weekly or monthly pay run for 2026-27 by the
  HMRC computerised PAYE method (cumulative, week 1/month 1, K, BR, D and NT codes, Scottish and Welsh
  prefixes, the 50% limit), Class 1 National Insurance by category letter, student and postgraduate loans
  and pensions, from `gb.paye.calculation` and `gb.ni.class-1`; it does not send RTI to HMRC
- UK bank feed (2026-11-15): the Plaid connector now serves UK businesses too. The link token asks for GB
  banks and carries the UK app's Android package, the Connections screen offers it in the UK edition, and the
  pulled transactions import as a bank statement like the US ones. It stays off until the owner has Plaid UK
  production access, registers `com.mldynamic.myca.uk` in the Plaid dashboard and saves the keys; the UK
  privacy notice names Plaid with its entity and region left for the solicitor to confirm
- US state income tax, first slice (2026-11-15): `us_state_tax` answers from the started federal return. Alaska,
  Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas and Wyoming need no state return; Illinois,
  Michigan and North Carolina get a 2025 estimate (federal AGI, state exemptions or standard deduction, flat
  rate, W-2 state withholding) from dated rules in `sprints/statutory-rules/src/rules/us-states.mjs`. It is an
  estimate: no state subtractions or credits, no state form, no e-file, no 2026 figures yet
- Quality review fixes (2026-11-15): the ₹50,000 buyer-details threshold is now the dated rule
  `gst.invoice.unregistered-buyer-details` (rule 46(e)), tested on taxable value, and `create_invoice` returns a
  `buyerDetails` notice (shown in chat) when an unregistered buyer's name or address is missing, so chat, desktop and
  API get it as well as the counter sale; the invoice is still posted, not refused. `us_state_tax` with no year
  uses the started return's year. Signing a US return uses the prior-year AGI brought in by the import for the
  taxpayer (a spouse's is still typed). The LINDUNG 24 Jam note names the month its current rate began
- US state income tax, 2026 figures (2026-11-15): the seven states now answer for tax year 2026 from announced
  figures (Illinois $2,925 exemption; Michigan $5,900; North Carolina 3.99%; Georgia 4.99%, $15,000 or $30,000
  and $5,000 a dependent under HB 463; Kentucky 3.5% and $3,360; Louisiana $12,875 or $25,750; Colorado 4.4%).
  Each is marked provisional and the reply says to check again at filing, since no state has published its 2026
  return. Colorado's 2026 rate is from a secondary source and ignores any TABOR rate cut; Louisiana's amounts
  are the ones its withholding tables used
- US state income tax, four more states (2026-11-15): Colorado (4.4% of federal taxable income), Georgia (5.19%,
  $12,000 or $24,000 standard deduction, $4,000 a dependent), Kentucky (4%, $3,270 standard deduction) and
  Louisiana (flat 3%, $12,500 or $25,000 standard deduction) join the 2025 estimate, each from the state's own
  published figures. Same limits as the first slice
- India in Hindi, shared screens (2026-11-15): the wording class the shared screens use now reads the same
  Hindi table, so cash, bank, reports, statements, repeating entries, reminders, expenses, parties and the
  entry forms show their fixed wording in Hindi on a Hindi phone (about 340 more lines). Lines built with a
  name or an amount inside them, taxes and payroll stay in English for now
- India in Hindi, first screens (2026-11-15): on a phone set to Hindi the India app shows the home screen, the
  new entry sheet and the counter sale in Hindi from `mobile/lib/india/india_strings.dart`; a test fails if a
  text passed to `inText` has no Hindi line. Other screens and server replies stay in English for now
- India counter sale buyer details (2026-11-15): a counter bill of ₹50,000 or more is held until the
  customer's name and address are entered, and the address goes on the invoice (`partyAddress`)
- US federal figures checked against the IRS text (2026-11-15): the 2025 and 2026 brackets, capital gains
  thresholds, earned income credit table, student loan interest phase-out and QBI thresholds, and the 2026
  standard deduction and child tax credit, were compared line by line with Rev. Proc. 2024-40 and 2025-32. All
  match; those records now say so. Still resting on secondary summaries: the other US individual records and
  the 2027 figures
- Malaysia PCB checked against LHDN (2026-11-15): the 2026 PCB rule now cites LHDN's own specification, and three
  differences from it are fixed: a PCB that falls under RM10 only after zakat is still deducted (it was dropped),
  the RM10 floor is tested on normal pay and on a bonus separately, and the spread EPF figure is cut to the sen
  as LHDN does. Disabled employee (RM7,000) and disabled spouse (RM6,000) reliefs are added for 2026. LHDN's
  worked example (category 3, three children, RM5,500) gives RM110.00 here too
- Malaysia CP39 file (2026-11-15): `my_cp39_file` builds the monthly PCB remittance text file for e-PCB Plus or
  a bank from LHDN's 2026 specification (Exhibit 4 and 5): a 57-character header with the employer numbers and
  totals, a 136-character line per employee, amounts in sen with no decimal point, file name
  `<employer no><mm>_<yyyy>.txt`. The layout is the dated rule `my.payroll.cp39-text-file`. Employees with no
  deduction are left out. Not yet done: a download button in the app, and an upload to e-PCB Plus to prove the
  file is accepted (the specification does not say how lines end; the file uses CR LF)
- Malaysia payroll screen (2026-11-15): the Malaysia app has a Payroll screen on the home page. It takes the month
  and each employee's wages, bonus, PCB category and children, shows EPF, SOCSO, EIS, PCB and net pay per employee
  with the month's totals and due date from `my_payroll`, and saves the CP39 file from `my_cp39_file`. Employees
  with nothing to remit no longer need a tax number for the CP39 file. Open: employees are typed in each month,
  the sandbox does not run payroll, and the file has not been uploaded to e-PCB Plus.
- Malaysia payroll remembers employees (2026-11-15): after a payroll run the Malaysia app keeps the employees (name,
  wages, PCB category, children, tax number, MyKad or passport) and the employer's E number in the phone's secure
  storage, per business, and fills them in next month. The bonus is not kept. Nothing is sent to the server, so
  they do not follow the user to another phone.
- Malaysia income tax sources (2026-11-15): the resident bands and the RM400 rebate were checked against LHDN's own
  tax rate and rebate pages and match; the records now cite LHDN first. The 30% non-resident rate, the SST records
  and the UAE labour records still rest on secondary summaries; UAE VAT and corporate tax already cite the FTA.
- Malaysia LINDUNG 24 Jam (2026-11-15): `my.payroll.lindung-24-jam` records the employee-paid Non-Employment
  Injury Scheme from June 2026 (0.75%, then 1% and 1.25%; mandatory for foreign workers, voluntary for
  locals); `my_payroll` says it is due and not in net pay, because the ringgit schedule is not encoded yet
- UK flat-rate mileage (2026-11-15): `gb.income-tax.simplified-expenses` is 55p a mile for the first 10,000
  business miles from 6 April 2026 and stays 45p for 2025-26


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
- **All Sandbox by Quicko APIs (2026-11-11)**: a catalogue of all 366 documented endpoints
  (`sandbox-catalog.mjs`, built from Sandbox's OpenAPI files) behind the action gate, each
  classed read, OTP/login, save, file or money; writes need a CA approval and are blocked for
  the assistant. Named tools: `read_form16`, `read_form26as`, `capital_gains_pnl`,
  `quicko_tax_check`, `verify_pan`, `pan_aadhaar_status`, `check_206ab`, `search_tan`,
  `lookup_ifsc`, `verify_bank_account`, `mca_company`, `gstins_for_pan`, `quicko_catalog`.
  Hosted: `GET/POST /v1/businesses/:id/quicko` runs the named tools and read-only catalogue
  calls (filing, OTP, sign-in and money ops stay on the desktop with a CA approval), and
  `POST .../quicko-session` signs in to the ITD or TRACES portal; the session token is sealed
  per business in `quicko_portal_sessions` (migration 024) and never returned. Android:
  Taxes → Income tax checks reads Form 16 / 26AS PDFs and runs PAN, 206AB and bank account
  checks, and signs in to the income tax portal
- `income_tax_calculate` stays fail-closed and points to `quicko_tax_check`; `prepare_itr`
  remains the source of truth
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
- GSTR-1 and GSTR-3B on the portal (2026-11-10): `gst_save_gstr1`, `gst_file_gstr1_evc`,
  `gst_save_gstr3b`, `gst_gstr3b_liability`, `gst_gstr3b_offset` and `gst_file_gstr3b_evc`
  run through Sandbox by Quicko behind the action gate, the approved review and an unchanged
  draft. Each filing step needs a CA approval asked by month and bound to the draft, so a
  change to the books needs a fresh approval. Verified against fixtures only; the GSTR-3B
  save path `POST /gst/compliance/tax-payer/gstrs/gstr-3b/{y}/{m}` follows the GSTR-1 pattern
  and must be checked with the test key
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
- `.env.example` documents `MYCA_MOCK_MODE` (default `0`); copy it to `.env` to try mock mode. The
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
| Firm backend | The hosted API (`cloud/`) is built with accounts, tenancy, roles, backups and a daily job, and runs on Cloud Run in Mumbai since 2026-11-10 (deployed by `deploy-cloud.yml` through workload identity, no stored keys). Built 2026-10-16: the Cloud Storage document vault (`MYCA_DOCUMENT_BUCKET`; bytes by sha256 per business, Postgres keeps the index, every read re-verifies the hash; Terraform creates the bucket) and OpenID Connect sign-in for a firm's own identity provider (`POST /v1/auth/oidc`, `MYCA_OIDC_ISSUER` and `MYCA_OIDC_CLIENT_IDS`, keys through discovery). The app's firm sign-in screen uses the authorization code flow with PKCE (S256) since 2026-11-10. Left: a firm that names its issuer |
| D2C and marketplace brands (decided 2026-10-16, `docs/superpowers/specs/2026-10-16-d2c-programme.md`) | Built 2026-10-16: D1 settlement reconciliation, D2 orders and returns with settlements posting, D3 TCS and 194-O credits against the portal statement and 26AS, D4 several GSTINs under one business with stock transfers, D5 SKU costs, stock and margins, D7 the daily close; on the phone as the Marketplace screen, the close on Home and registration-scoped Taxes. D6 connectors built to the credential boundary 2026-10-16 (`set_channel_connector`, `fetch_channel_report`, `sync_channels` for Amazon SP-API, Shopify and Razorpay through the action gate with mock fixtures; the desktop fetches daily; Flipkart, Myntra, Nykaa, Meesho and Unicommerce stay file imports). Hosted pulls built 2026-10-16: each business saves its connector credentials on the hosted API (`POST /v1/businesses/:id/connectors`, sealed per business with `MYCA_CONNECTOR_KEY`, never shown back), the nightly job and `POST .../connector-sync` pull through the gate behind the separate read-only switch `MYCA_ENABLE_CHANNEL_PULLS` (government and model calls stay behind the live switch, which the hosted API still refuses). Left to go live: seller credentials (the pull switch is on by default on the hosted API since 2026-11-10); and D8: the WhatsApp webhook is built on the hosted API, on the Meta Cloud API or (2026-11-10) a self-hosted WAHA gateway on a normal WhatsApp number, signature-checked, members matched by number, the same preview-and-confirm chat; it waits on the gateway host and its scanned number; Hindi and Telugu wait on the model decision |
| UI polish | Invoice design built 2026-10-16 (colour, layout, bank details, terms, footer, signatory, HSN column; desktop print and app PDF). Export invoices in a foreign currency (2026-10-15) cover the multi-currency need for Indian businesses; the desktop has keyboard shortcuts (Ctrl+K or / for chat, Ctrl+1 to 8 for the tabs, Esc clears) |
| Ops | Custom domain + TLS active, GitHub Pro branch protection, code-signing certificate. The packaged app checks the project's GitHub release page on launch; once the installer is signed by the publisher it downloads, verifies and installs it quietly (2026-10-21), until then it offers the download |
| Tax assistant (2026-11-09) | Built: five tax knowledge modules in the open Agent Skills format (`platform/src/tax-modules/*/SKILL.md`: GST returns, input tax credit, income tax for individuals, TDS on business payments, presumptive income) whose figures are filled in from the dated statutory rules for the date asked about; `ask_tax` answers from them through the action gate and refuses a model answer that quotes a figure not in the rules; `tax_plan` (both regimes, break-even deductions, 87A edge, 44AD/44ADA against actual profit); `review_income_tax` (checks a prepared return against MyCA's computation, Form 26AS and the year's GST sales). New rule records `income-tax.presumptive.business` and `.profession`. Left: CA sign-off on the modules and the new records, capital gains, house property and HRA in the computation, reading a prepared ITR JSON or Form 16 straight into the review, and screens in the desktop and Android apps (both reach the tools through chat today) |
| Batch 4 leftovers (2026-11-06) | AIS in the Form 26AS check (the check and `import_26as_credits` read Form 26AS only; `prepare_itr` already takes an AIS file for the regime comparison). The file the GSTN IMS portal takes for decisions (MyCA keeps the decisions and sends nothing to the portal). A server-side step-up before another device is ended (the server asks for no code; the app asks the phone's own screen lock). A line in the privacy notice for the authenticator key (the notice then in force, `draft-2026-10-07`, does not name it). A daily WhatsApp message for MSME dates (the reminder is on Home and goes to nobody; the weekly brief, where switched on, already names MSME bills past their date) |

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
