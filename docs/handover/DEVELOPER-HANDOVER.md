# Developer handover

| | |
|---|---|
| Product | MyCA (working title Taxmeow): a chat-first tax and accounting app for Indian business owners |
| Owner | ML Dynamic Solutions Private Limited. All code, designs, data and documentation belong to the company |
| Version | 1.0, 6 October 2026 |
| For | An incoming developer taking the product from about half built to public launch and live filing |
| Commercial terms | In the signed MoU, not here. This document is technical and may be shared with anyone working on the code |

## 1. How to use this document

Read sections 2 to 6 on day one. They tell you what the product is, how it is built,
and the rules the code enforces. Section 7 lists the work in four phases. These match
the phases in the MoU, and the acceptance criteria there are the ones that count.
Sections 8 to 10 cover open decisions, known gaps, and what you will be given access to.

When this document and the repository disagree, the repository wins. Raise the
difference with the product owner and fix this document.

## 2. The product in one page

A business owner runs their books by chatting with the app, in the way they would
message their accountant. A message such as "invoice ABC Ltd 50,000 for consulting, GST
18%" becomes:

- a preview of the GST-correct invoice;
- a confirmation from the owner;
- a ledger entry;
- a PDF the owner can share.

Expenses, credit notes, quotes, reminders, a cash forecast, the GST return review and
"ask my CA" work the same way.

Five ideas shape everything:

1. **The tax invoice is the source of truth.** The trial balance and the GST returns are
   projections of posted invoices and entries.
2. **Nothing posts without a preview and a confirmation.** Every write is proposed,
   shown to the owner, then confirmed or discarded.
3. **No figure is invented.** Deterministic engines own the arithmetic. A language model
   may only choose which tool to run; it never produces a number. Statutory values (rates,
   thresholds, due dates) are dated rules that fail closed when a date is not covered.
4. **Anything that leaves the system goes through one gate.** Filing, signing, OTP, DSC,
   e-invoice and e-way bill calls need the live switch (`MYCA_ENABLE_LIVE_CALLS`) and an
   approval.
5. **Everything is auditable.** State changes record an audit event, and flags carry a
   `why` and a `source`.

Read [`docs/product/PRD.md`](../product/PRD.md) for requirements,
[`docs/product/ROADMAP.md`](../product/ROADMAP.md) for order, and the decision records in
[`docs/architecture/decisions/`](../architecture/decisions/) for why things are the way they are.

## 3. Where it stands (6 October 2026)

About **52% of the PRD** is built. See [`docs/superpowers/PROGRESS.md`](../superpowers/PROGRESS.md)
for the weighted breakdown. There are **1,050 automated tests**:

| Suite | Tests |
|---|---|
| Platform | 550 |
| Engines and statutory rules | 329 |
| Hosted API | 63 |
| Android app | 108 |

**Built and tested**

- **Invoices:** by form or message, with a PDF and the share sheet. Payment terms and due dates. Credit notes and cancellation. Quotes, which can be turned into linked invoices.
- **Expenses and bills:** 15 expense heads, a tagger, bills carrying the supplier's bill number, and payments to suppliers against bills.
- **GST:** the GSTR-1 and GSTR-3B drafts, a review in chat ("Is this information correct?"), GSTR-2B import, and credit at risk.
- **Checks:** a books check, and an entries export for a CA as a spreadsheet.
- **Planning:** reminders, a cash forecast, and "can I afford it?".
- **Your CA:** requests with entries attached, and the CA's replies.
- **Hosted API:** phone sign-in with a development OTP, businesses, members, and propose / confirm / discard over HTTP.
- **Android app:** Flutter, with screens for everything above. Tested in widget tests only; **never run on a real phone**.

**Not built**

- Deployment.
- Real sign-in.
- Push notifications.
- The language model and document reading.
- Subscriptions.
- Live filing.
- E-invoice and e-way bill inside the invoice flow.
- TDS on entries.
- Payroll.
- POS import.
- Set-off and the amount of tax to pay.

## 4. Architecture

```
mobile/      Flutter Android app. Holds no tax logic; every figure comes from the server.
cloud/       Hosted API (Node 22, one dependency: pg). Accounts, sign-in, tenancy, and a
             per-request transaction around the platform engines.
platform/    The engines: invoices, ledger, GST, 2B, reminders, cash, quotes... Node 22 ESM,
             zero runtime dependencies. Also a local server and an Electron desktop shell.
sprints/     Frozen statutory engines and their fixtures. Read-only unless a task targets them.
infra/       Terraform for Google Cloud. infra/bootstrap is a one-time owner step.
docs/        Product, architecture, decisions, research, progress.
vendor/      Reference clones. Never import from here.
```

One engine serves two hosts ([ADR-0006](../architecture/decisions/0006-one-engine-two-hosts.md)):

- the local server for the desktop;
- the cloud API for the phone. The cloud loads a business's books from Postgres, runs the
  same platform tool inside a transaction, and saves the books with a version check.

A request from the phone always follows this path:

```
app ── /api/propose ──▶ cloud ── tool preview (chat-confirm.mjs) ──▶ preview to the owner
app ── /api/confirm ──▶ cloud ── tool runs (tools.mjs) ── audit event ── save books
app ── /api/query   ──▶ cloud ── read-only tools only (REMOTE_QUERY_TOOLS)
```

Further reading: [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md),
[`DATA-MODEL.md`](../architecture/DATA-MODEL.md) and
[`SECURITY-AND-PRIVACY.md`](../architecture/SECURITY-AND-PRIVACY.md).

## 5. Getting set up

| Tool | Version |
|---|---|
| Node | 22. Node 20 cannot expand the quoted test globs |
| Flutter | 3.44 (Dart 3.12) |
| PostgreSQL | 16 or later, for the hosted API tests |
| Android Studio | Any recent version, for device builds |

```bash
node scripts/check-all.mjs              # every suite, with a pass/fail table
node scripts/check-all.mjs platform     # or: sprints, cloud, mobile

cd platform && npm test && npm run dev  # local server on http://127.0.0.1:4780
cd mobile && flutter analyze && flutter test
cd mobile && flutter run --dart-define=MYCA_CLOUD_URL=http://127.0.0.1:8080
```

**Hosted API tests.** These need a Postgres the tests may create databases in. Point
`MYCA_TEST_DATABASE_URL` at it, for example `postgres://myca@127.0.0.1:54329/postgres`.
`check-all` reports the cloud suite as **skipped**, not passed, when no Postgres is
reachable. To run the API locally, see [`cloud/README.md`](../../cloud/README.md); it needs
`MYCA_DATABASE_URL`, `MYCA_TOKEN_SECRET` and, for development only, `MYCA_DEV_OTP=1`.

GitHub Actions is not running for this repository at present (account billing), so
**`check-all` is the gate**. Run it before every push and paste its table into the pull
request.

## 6. Rules the code enforces

[`AGENTS.md`](../../AGENTS.md) is the rulebook; read all of it. The points that catch new
people most often:

- **Money is integer paise** inside the engines. Convert to rupees only at the edges. Never accumulate floats.
- **The ledger is append-only.** Never edit a posted entry; post a resolving one.
- **No code comments.** Use names that explain themselves. This is the codebase convention.
- **Zero new runtime dependencies** in `platform/`. Node built-ins are fine. `cloud/` has exactly one dependency, `pg`.
- **New per-business data** must be added in three places:
  - classified in `book-view.mjs` (`BOOK_KEYS`, or `FIRM_KEYS` for firm-level data);
  - persisted in `books.mjs`;
  - persisted in `store.mjs`.

  `test/book-view.test.mjs` fails if one is missed.
- **A new tool** needs:
  - an entry in `tools.mjs`;
  - a strict schema in `assistant-contract.mjs` (`additionalProperties: false`) and its `TOOL_RISK`;
  - a previewer in `chat-confirm.mjs` if it writes;
  - wording in `router.mjs`;
  - tests.

  To reach the phone, add it to `PROPOSABLE` (`cloud/src/api.mjs`) if it writes, or to
  `REMOTE_QUERY_TOOLS` (`remote-contract.mjs`) if it only reads.
- **Who is acting comes from the session**, not from tool arguments.
- **Statutory figures are checked against the Act, rule or notification**, never against
  an existing test. Several old tests encoded the wrong law. When in doubt, ask the
  advisor CA.
- **Secrets** go through `credential-vault.mjs` locally and Secret Manager in the cloud.
  Never put them in code, logs, `state.json`, test fixtures or chat.
- **Commit and pull-request discipline.**
  - Work on a branch and open a pull request to `main`.
  - Describe what changed and what you verified, and include the `check-all` output.
  - Never commit `.env*`, `node_modules/`, `.terraform/` or `*.tfstate`.

## 7. The four phases

The phase objectives, deliverables and acceptance criteria in the MoU (Schedule A) are
binding. This section adds the technical detail.

### Phase 1: take-over and device readiness

1. Set up all four suites and run `check-all` green on your machine. Walk the product owner through the architecture, to show the take-over is complete.
2. **Run the app on real phones.** Use at least one mid-range and one low-end Android device. Expect layout, keyboard, file-picker, biometric-lock and PDF-share problems that widget tests cannot see. Record every defect.
3. **Remove the default GST rate** (**done** 6 October 2026). Invoices and bills with no
   rate are refused with `RATE_REQUIRED` in the engine. The preview blocks them and
   mentions the rate last charged to that customer, without using it. The desktop
   form makes you choose a rate. GST 0% is still a valid rate.
4. **Supplier payments** (**done** 6 October 2026). `record_payment` pays a bill in part
   or in full from the bank or cash. It works from chat and from the supplier's chat in
   the app. Home shows what is owed to suppliers, and the cash forecast counts only what
   is still owed. Still open: Rule 37 reads payment status from an uploaded purchase
   register, not from these payments.
5. **Crash and error reporting** (**done** 6 October 2026). No SDK: app and server
   crashes are scrubbed of personal and financial data and sent to `POST /v1/crash-reports`.
   Read them with `npm run crashes`. See SECURITY-AND-PRIVACY.md, "Crash reports".

### Phase 2: hosted pilot

1. **Deploy** following [ADR-0007](../architecture/decisions/0007-hosted-service-on-google-cloud-mumbai.md) and the cloud backend spec in `docs/superpowers/specs/`:
   - Cloud Run, Cloud SQL (Postgres), storage for documents, Secret Manager, backups, monitoring and alerts;
   - all in the Mumbai region, through Terraform in `infra/`.
2. **Sign-in.**
   - Replace the development OTP with a registered SMS sender (DLT) or Google Sign-In, as the company decides ([ADR-0008](../architecture/decisions/0008-phone-number-sign-in.md)).
   - Rate-limit OTP requests and verification attempts.
3. **Privacy.**
   - Show a privacy notice and record consent (**done** 6 October 2026, with draft text:
     `cloud/src/consent.mjs`, enforced by the server).
   - Set retention periods and let users delete their data.
   - Log every staff access to a business's data. The DPDP assessment decides the details.
4. **Release.**
   - Application id and signing key, held by the company. (Release signing from
     `android/key.properties` **done** 6 October 2026; the id and the key are the
     company's to decide and create.)
   - A release build, a store listing draft, the data-safety form, and the closed testing track.
5. Run a pilot with two or three businesses for four weeks. Write and test a restore-from-backup drill.

### Phase 3: public launch

1. **Language model** ([ADR-0004](../architecture/decisions/0004-language-model-selects-tools-only.md)):
   - Free-text chat maps to named tools with arguments. The model never writes a figure, and every write still goes through preview and confirm.
   - Supplier-invoice capture by photo or forwarded PDF reads into the same expense preview.
   - Build an evaluation set from pilot messages, with consent, and agree a pass threshold. The company chooses the model and where it may run.
2. Subscriptions through Google Play Billing, with plan limits enforced on the server.
3. Push notifications for reminders, due dates and replies from the CA.
4. Production release on Google Play.

### Phase 4: filing and growth

1. **Live GST filing** through a licensed GSP/ASP: GSTR-1 first, then GSTR-3B.
   - Use the existing action gate, the live switch and CA approval. Never bypass them.
   - Record the acknowledgement and the ARN.
2. **E-invoice (IRN) and e-way bill inside the invoice flow.**
   - The NIC client exists (`nic-client.mjs`; one session per taxpayer).
   - It needs production credentials and the flow wiring.
3. **TDS on entries** and a quarterly draft for review. Set-off and the amount to pay need the advisor CA's sign-off on the rules first.
4. **For accountants.** A Tally-format export and the sync setting.
5. **A second language** (Hindi first, unless the company says otherwise) in the app and in chat.

## 8. Decisions the company owes you

These block work. Ask for them early; the MoU extends a phase's timeline while one is
outstanding.

| Decision | Needed for |
|---|---|
| Launch name and application id | Phase 2 release |
| Google Cloud project with billing | Phase 2 |
| SMS sender registration or Google Sign-In | Phase 2 |
| DPDP assessment | Phase 2, and the model choice |
| Pilot businesses | Phase 2 |
| Which language model, and where it may run | Phase 3 |
| Pricing and plans | Phase 3 |
| GSP/ASP and NIC production onboarding | Phase 4 |
| Who may approve a filing | Phase 4 |
| Advisor CA named, to sign off rules | Phase 4 (set-off, TDS); also re-checks existing rules |

## 9. Known gaps and risks

- **Never run on a device.** Phase 1 exists for this reason.
- **Due dates are "passed", not "late".** The product does not know whether a return was
  filed, so it never says one was late. Keep that honesty when filing goes live.
- **No set-off.** The app shows the return figures but not the cash to pay. Do not add a
  "to pay" figure until the advisor CA has signed off the rules.
- **No CI.** `check-all` must be run by hand before every push.
- **The desktop app** (Electron, local-only) is behind the phone in features. It is not
  a launch target.

## 10. Access you will be given

All of this is held in the company's name and can be withdrawn at any time:

- the GitHub repository (write access, through pull requests to `main`);
- the Google Cloud project (a role scoped to the work);
- the Play Console (release manager);
- sandbox credentials for the GSP, NIC, SMS and model providers, when each is onboarded.

Use a password manager. Turn on two-factor authentication everywhere. Never move
credentials or customer data to personal accounts.

When you leave, follow the exit checklist in the MoU (Schedule E):

- push everything;
- update `STATUS.md` and this document;
- revoke your keys and access;
- delete company material from your devices.

## 11. Index of documents

| Question | Where |
|---|---|
| What must the product do? | [`docs/product/PRD.md`](../product/PRD.md) and `docs/product/features/` |
| In what order? | [`docs/product/ROADMAP.md`](../product/ROADMAP.md) |
| How far along? | [`docs/superpowers/PROGRESS.md`](../superpowers/PROGRESS.md), [`STATUS.md`](../../STATUS.md) |
| How is it built? | [`docs/architecture/`](../architecture/) |
| Why was it built that way? | [`docs/architecture/decisions/`](../architecture/decisions/) |
| Rules for changing code | [`AGENTS.md`](../../AGENTS.md) |
| The hosted API | [`cloud/README.md`](../../cloud/README.md) |
| The Android app | [`mobile/README.md`](../../mobile/README.md) |
| Competitor research | [`docs/research/`](../research/) |
| Deploying and releasing | [`DEPLOYMENT.md`](../../DEPLOYMENT.md) |
