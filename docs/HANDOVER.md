# MyCA handover for coding agents

| | |
|---|---|
| Written | 2026-11-25, from `develop` at the head of that day and `main` at `32f69ef6` |
| Owner | ML Dynamic Solutions Private Limited (`vidyuthlabs`) |
| Audience | A coding agent or developer starting work with no earlier context |
| Rule of thumb | When this file and the code disagree, the code wins. Fix this file in the same PR. |

Read [`AGENTS.md`](../AGENTS.md) first (golden rules and code invariants), then this file. Older
documents that describe the product as "Windows-first, local-only" or "about half built"
(`STATUS.md`, `README.md`, `docs/handover/DEVELOPER-HANDOVER.md`) are history; the banner on each says so.

## 1. What MyCA is

A chat-first accounting and tax product, one Android/iOS app per country. The owner types or speaks
("invoice ABC Ltd 50,000 for consulting, GST 18%"); the app shows a preview; the entry posts only after
a confirmation. A deterministic engine computes every figure. The language model only chooses tools and
never produces a number (ADR-0004). Filing to a government goes through one approval gate
(`MYCA_ENABLE_LIVE_CALLS`, ADR-0005).

| Country | Status | App id | Data region | Main engines |
|---|---|---|---|---|
| India | live (sandbox providers) | `com.mldynamic.myca` | `asia-south1` | GST, e-invoice/IRP, e-way bill, TDS, ITR, payroll, offline billing, 8-language registry (English and Hindi shown) |
| United States | beta | `com.mldynamic.myca.us` | `us-central1` | Form 1040 and schedules, 41 states plus DC, e-file through a partner (Column Tax), sales tax, 1099/W-2 |
| United Kingdom | beta | `com.mldynamic.myca.uk` | `europe-west2` | HMRC MTD VAT and Income Tax, Self Assessment, payroll |
| UAE | beta | `com.mldynamic.myca.uae` | `me-central1` | VAT 201, corporate tax, e-invoicing (PINT AE), Arabic |
| Malaysia | beta | `com.mldynamic.myca.my` | `asia-southeast1` | SST, MyInvois e-invoice, PCB/CP39, income tax |
| Canada, Australia | planned | `.ca`, `.au` | | pack file only |

`node scripts/countries.mjs` prints the live table (status, prices, filing authorities, what is built,
what licences are still needed) and fails on any inconsistency. Trust it over this table.

## 2. Architecture in one page

```
Flutter app (mobile/, flavor per country)
      │ HTTPS, bearer token + device
      ▼
Hosted API (cloud/, Cloud Run, Node 22, one dep: pg)
      │ per request: one Postgres transaction, lock the business's books row
      ▼
Engines (platform/src, dependency-free ESM)  ──►  sprints/* (frozen ledger, GST, TDS, rules)
      │ provider calls only through sandbox-adapter.mjs (four gates)
      ▼
Quicko (GST/e-way/IT), NIC IRP, Stripe, Plaid, Column Tax, HMRC, LHDN, Play, Anthropic, Twilio/MSG91, WAHA
```

- **One engine, two hosts** (ADR-0006). The same `platform/src` runs in the hosted API and in the local
  Electron server (`platform/desktop`, Windows installer built on `v*` tags).
- **Country packs and engines.** `platform/src/countries/<country>.mjs` is the pack (prices, tools,
  filing routes, residency, app flavor). `platform/src/countries/<folder>/` is the engine, declared by a
  `manifest.mjs`; the manifest feeds tools, schemas, the router, the remote contract and the book. Never
  edit the shared files to add a country tool. See `docs/architecture/COUNTRY-PACKS.md` and
  `COUNTRY-ENGINES.md`. `countries/kit` has brackets, tax periods, return life cycle, check digits.
  `countries/knowledge/*.md` holds sourced, dated country facts, checked by `node scripts/countries.mjs`.
- **Data residency.** One deployment per country (`infra/cloud/countries/*.tfvars`, `cloud/src/residency.mjs`).
  `MYCA_COUNTRIES` (set by Terraform) decides which countries a deployment serves. Only India's stack is deployed today.
- **Statutory values are dated rules** (ADR-0002) in `sprints/statutory-rules`; `scripts/rules-sources.json` lists the sources and is
  watched nightly by `scripts/rules-watch.mjs`, which opens an issue when a rule is missing or about to end.
- **Provider modes.** `MYCA_PROVIDER_ENV` is `test` (sandbox calls), `live`, `simulated` or `off`. Production
  runs `test`. Each secret has a TEST and a LIVE slot (see `docs/release/GO-LIVE.md`); the server removes the
  inactive slot from process memory.
- **Mobile.** `mobile/lib` has no tax logic. Country code lives in `mobile/lib/{india,us,uk,uae,my}`; shared
  UI in `design/flutter/myca_design`. Android flavors are in `mobile/android/app/build.gradle.kts`.
- **Storage.** Postgres (Cloud SQL) holds one sealed books document per business plus accounts, devices,
  audit log, consent and billing. Migrations are numbered SQL in `cloud/migrations` (latest 036) and run
  at startup. See `docs/architecture/DATA-MODEL.md`.
- **Website.** `deploy/public` is static HTML served by Cloud Run (nginx) and by Cloudflare Pages.

Architecture decisions: `docs/architecture/decisions/0001` to `0011`. Security: `SECURITY.md`,
`docs/architecture/SECURITY-AND-PRIVACY.md`.

## 3. Repository layout

See the table in `AGENTS.md`. Extra pointers: tests live beside each package (`platform/test`, `cloud/test`,
`mobile/test`, `mobile/test_smoke`, `design/test`, `infra/cloud/tests`, `deploy/seo`, `deploy/qa`).

## 4. Set up a machine from nothing

| Tool | Version | Notes |
|---|---|---|
| Node | 22 (CI uses `"22"`) | Node 20 cannot expand the test glob. Node 26 is not supported (Dependabot bump #379 is held for this reason). |
| Postgres | 16 | Only for `cloud/` tests. `service postgresql start`; create superuser role `myca`; allow `127.0.0.1` with `trust` in `pg_hba.conf`. |
| Flutter | 3.44.9 | `git clone --depth 1 --branch 3.44.9 https://github.com/flutter/flutter.git /opt/flutter`, add `/opt/flutter/bin` to `PATH`. |
| Android SDK | platform 36, build-tools 36.0.0, cmdline-tools | Only to build APKs. There is no emulator in cloud containers (no `/dev/kvm`); test with widget tests and `test_smoke`. |
| Terraform | 1.13 | `cd infra/cloud && terraform init -backend=false && terraform validate && terraform test`. |
| Java 17 | | Android builds. |

```bash
git clone https://github.com/Vidyuthlabstechnologies/myca.git && cd myca && git checkout develop
(cd cloud && npm ci --ignore-scripts)
(cd design && npm ci --ignore-scripts)
(cd mobile && flutter pub get)
(cd design/flutter/myca_design && flutter pub get --enforce-lockfile)
export MYCA_TEST_DATABASE_URL=postgres://myca@127.0.0.1:5432/postgres
node scripts/check-all.mjs
```

`platform/` and the sprints need no `npm install`. Copy `platform/.env.example` to `platform/.env` for local
runs; never commit it. Secrets belong in GitHub Secrets, Secret Manager or `.env`, never in chat or the repo.

## 5. Build, run and test

| What | Command |
|---|---|
| Everything | `node scripts/check-all.mjs` (skips with a reason when Postgres or Flutter is missing) |
| Platform | `cd platform && npm test` (2,966 tests on 2026-11-25) |
| Frozen sprint engines | `cd sprints/sprint-3-gst-recon && npm test` (each sprint and `statutory-rules`) |
| Hosted API | `cd cloud && npm test` (about 580 tests, needs Postgres) |
| App | `cd mobile && flutter analyze && flutter test` (about 5,500 widget tests) |
| App against a local API | start the API as `app-smoke` in `.github/workflows/ci.yml` does, then `cd mobile && flutter test --concurrency=1 test_smoke` (use a fresh DB each run: OTP rate limits) |
| Design | `cd design && npm run build && npm test`; `cd design/flutter/myca_design && flutter analyze && flutter test` |
| Website | `node --test deploy/seo/*.test.mjs` (quote the glob), `nginx -t` on `deploy/site/nginx.conf`, Playwright in `deploy/qa` |
| Terraform | `cd infra/cloud && terraform test` |
| Country consistency | `node scripts/countries.mjs` |
| Local server | `cd platform && npm run dev` (http://127.0.0.1:4780); hosted API: `cd cloud && node src/server.mjs` with `MYCA_DEV_OTP=1` and a Postgres URL, see `cloud/README.md` |
| US sandbox end to end | `node scripts/us-sandbox.mjs` (`--check` walks the whole path), `docs/release/US-SANDBOX.md` |
| Android build, local | `cd mobile && flutter build apk --flavor india --dart-define=MYCA_CLOUD_URL=<api url>` (debug-signed; test builds add `-PmycaTest`) |

Numbers drift every day; the output of `check-all` is the truth. A PR is ready when `check-all` is green
for the packages it touched, and the PR says what it ran. After a failure re-run only the failing tests
while fixing, and the whole thing once before the push. Do not skip or delete a test to get green.

## 6. Configuration

- **Hosted API variables:** the complete table with defaults, secrecy and refusal rules is in
  `cloud/README.md` (about 120 `MYCA_*` names). Startup refuses unsafe combinations (live key in the wrong
  slot, plain-http URLs outside local, missing `MYCA_TOKEN_SECRET` and `MYCA_BOOKS_KEY` in production). The
  refusal runs before migrations, and Cloud Run keeps the previous revision when a new one fails to start.
- **App build-time values** (`--dart-define`): `MYCA_CLOUD_URL`, `MYCA_GOOGLE_SERVER_CLIENT_ID`,
  `MYCA_OIDC_CLIENT_ID`; `MYCA_EDITION` is derived from the Android flavor (`mobile/lib/app_config.dart`). See `mobile/README.md`.
- **Terraform variables:** `infra/cloud/variables.tf`, one tfvars file per country.
- **GitHub variables and secrets** used by workflows: `GCP_PROJECT_ID`, `GCP_API_REGION`, `GCP_WIF_PROVIDER`,
  `GCP_DEPLOY_SA`, the `*_STAGING` and `*_US` variants, `MYCA_CLOUD_URL`, `MYCA_CLOUD_URL_STAGING`,
  `MYCA_PAGES_PROJECT`; secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`. The Android upload key lives in
  Secret Manager (`myca-android-*`), not in GitHub. The agent cannot set repository variables or secrets.

## 7. CI and deployment

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PR, push to `main` | dependency audit, platform, email-relay, sprints, cloud (Postgres service), design, mobile, `app-smoke` |
| `codeql.yml` | PR and push to `main`/`develop`, weekly | CodeQL |
| `site-quality.yml` | PR, push to `main`/`develop`, weekly | SEO tests, nginx, Playwright |
| `nightly.yml` | 21:30 UTC daily | every suite, `rules-watch`, opens or closes the "Nightly checks need attention" issue |
| `app-smoke.yml` | daily, manual | app against staging |
| `deploy-cloud.yml` | push to `main` touching `cloud/`, `platform/src/`, `sprints/`; manual with `country` (IN or US) | Postgres test, build image, roll out to Cloud Run (`cloud-run-rollout.yml`), health check |
| `deploy-site.yml` | push to `main` touching `deploy/` | website to Cloud Run |
| `deploy-pages.yml` | same paths | website to Cloudflare Pages (`myca-site.pages.dev`); skipped until the `CLOUDFLARE_*` secrets exist |
| `terraform.yml` | PR, push to `main` | plan; applies only the `infra` root and only when `MYCA_MANAGE_SITE` is `true`. `infra/cloud` is applied by the owner by hand. |
| `build-android.yml` | tag `v*`, manual | signed APK and AAB per flavor, SBOM, release assets, Play upload (`scripts/play-upload.mjs`). Inputs: `backend` (`live` or `test`), `edition`, `cloud_url`. |
| `build-ios.yml`, `build-windows*.yml` | tag `v*`, manual | iOS, Windows installers |
| `deploy-aws.yml` | manual only | retired; leave alone |

Production (2026-11-25): Google Cloud project `myca-prod-in`, Cloud Run `myca-api` (asia-south1, latest
revision at the last release was `myca-api-00011-wdx`), `myca-site`, Cloud SQL in Mumbai. Provider mode
`test`. Check health with `curl <api>/v1/health` (shows version, environment, provider mode, hosted countries).
Details, costs and teardown: `DEPLOYMENT.md`. Runbook for incidents, backups and switches: `docs/operations/RUNBOOK.md`.

## 8. Branches and pull requests

1. Branch from `develop`, name it for the work (`claude/...` or `<issue>-<slug>`).
2. Open a **draft** PR into `develop`, fill in the template, say which suites ran.
3. Merge when checks are green and the diff has been reviewed. Merge or rebase `develop` first; several
   agents work in parallel and conflicts are common in `platform/src/countries/index.mjs`, `cloud/src/api.mjs`
   and the mobile route files.
4. Dependabot PRs target `develop`. Group updates are safe to merge when `check-all` is green; Node base
   image majors and Flutter bumps need a CI change in the same PR.
5. Never force-push a shared branch; never skip a hook; never commit secrets or keystores.
6. `.github/CODEOWNERS` assigns the owner as reviewer; `.github/branch-protection.json` documents the intended
   protection (required checks, one code-owner review, resolved conversations).

## 9. Releasing to production (owner's go-ahead required)

`main` auto-deploys the API and the site. Only release when the owner says so.

1. Make sure `develop` is green: `node scripts/check-all.mjs` with Postgres and Flutter, `terraform test`,
   website tests.
2. **Upgrade test:** run `main`'s `cloud/` against a fresh database (fixed `MYCA_TOKEN_SECRET` and
   `MYCA_BOOKS_KEY`), seed through HTTP, stop it, start `develop` on the same database, and check old tokens,
   books and migrations survive. CI does not do this.
3. Read the release notes risks: new migrations (numbered, one-way ones are flagged), privacy notice version
   bumps (every user re-accepts), env or key-slot changes that make startup refuse, anything needing a hand
   `terraform apply` in `infra/cloud`.
4. Open a PR `develop` into `main`, let CI and CodeQL run (a large diff shows many "new" CodeQL alerts; compare
   against `main` before treating them as real), merge.
5. Watch the `deploy-cloud` and site runs; `curl <api>/v1/health`; curl every public page (`-L` for folder
   addresses such as `/my`). Cloud Run keeps the old revision if the new one fails, so a failed start is safe.
6. Build signed apps: dispatch `build-android.yml` **on `main`** (signing only runs on `main` or a `v*` tag)
   with `backend=live` and `cloud_url=<API url>` (the `MYCA_CLOUD_URL` variable is stale, see section 10).
7. Record the release (main commit, revision, notes) in the PR and in the docs that changed.

## 10. What only the owner can do

An agent cannot finish these; do not guess around them. Each is tracked in the linked file.

- Accounts and keys: Play Console organisation account, upload and Play signing keys (SHA-1 into the Android
  OAuth client), Stripe approval, Quicko **live** key and the GSP agreement, IRS EFIN/ETIN or the e-file partner
  contract, HMRC production application, LHDN MyInvois intermediary status, Twilio/MSG91, Anthropic spend limit.
  See `docs/handover/OWNER-CHECKLIST.md`, `docs/release/GO-LIVE.md`, `docs/release/PLAY-CONSOLE-STEPS.md`.
- GitHub settings: repository variables and secrets, secret scanning, the `v*` tag rule, environment
  `production-us`.
- **Stale variable:** `MYCA_CLOUD_URL` still points at the retired AWS address. Until the owner fixes it, pass
  `cloud_url` (the Cloud Run API URL) on every `build-android.yml` dispatch.
- Google Cloud: `infra/bootstrap` and `infra/cloud` applied by hand (Cloud Shell), new country stacks, switching
  `provider_mode` to `live`, custom domain, the `myca-site` service account step in `DEPLOYMENT.md`.
- Cloudflare: Pages project secrets and the free site address (`myca/cloudflare` in the project files).
- People and legal: a CA to sign off India rules (question sheet `myca/ca-questions` in the project files),
  a US CPA and e-file partner, a UK adviser, Malaysia tax agent and DPO, UAE tax agent and ASP; privacy notices
  need legal review (`docs/compliance/*`); native review of Indian regional languages before the flag shows them.
- Pricing, brand and go-to-market decisions (`docs/product/GO-TO-MARKET.md`).

## 11. Conventions that bite

- No code comments; self-explanatory names; ESM only; `platform/` has no runtime dependencies.
- Money is integer minor units (paise, cents); round on output; no floats in ledgers.
- A new top-level book field goes into exactly one of `BOOK_KEYS` or `FIRM_KEYS` (`book-view.mjs`).
- New tools: declare in `tools.mjs` (or the country manifest), strict schema, `TOOL_RISK`, test. `/api/query`
  runs only read-only tools in `REMOTE_QUERY_TOOLS`.
- Provider calls only via `runSandboxOperation`; filing needs `MYCA_ENABLE_LIVE_CALLS` and approval.
- Statutory figures need a source, an effective date and a test. Never invent a rate. Country knowledge files
  carry a `checked` date; `scripts/countries.mjs` fails when they go stale.
- Each store listing, privacy notice and data-safety form must match what the code collects. Changing what is
  collected means bumping the notice version.
- Date-dependent tests have broken the build before (tax years rolling over): pin dates in tests.
- Android permissions are checked against `mobile/android/permissions.txt` in the build; a new permission
  must be added there.
- Website folder routes need a page behind them (`/my` once looped in production).
- Terraform changes need `terraform test`; do not add live keys to tfvars.

## 12. Open work

Nothing here blocks the handover; everything the code can do for India, the US, the UK, the UAE and Malaysia
is merged to `develop`. Pick up in this order unless the owner says otherwise.

| Area | What is open | Where |
|---|---|---|
| Pull requests | #411 India ITR-3 and ITR-4 plus Winman/ClearTax gap matrix (draft, in review). #341 sandbox on Google Cloud for all five apps and sandbox APKs (old draft; check if still wanted before rebasing). Dependabot PRs #342, #344, #345, #381, #400, #401, #402 target `main`; retarget or recreate on `develop`. #379 (Node 26) should be closed. | GitHub |
| India | Competitive gaps vs Winman, ClearTax, Vyapar, Zoho (ITR forms beyond 1 to 4, more retail features); CA sign-off questions; regional languages shown only after native review; live GSP key | `docs/product/COMPETITIVE-GAP-MATRIX.md`, `docs/product/INDIA-LANGUAGES.md`, `docs/compliance/india/`, `docs/handover/M3-HANDOVER-REPORT.md` |
| United States | Real e-file partner contract (Column Tax or April), W-2/payroll data API, CPA attestation of rules, Stripe approval, state returns marked provisional or unverified, iOS release | `docs/compliance/us/US-LAUNCH.md`, `docs/integrations/US-EFILE-PARTNER.md`, `docs/architecture/US-STATE-RETURNS.md`, `docs/release/US-SANDBOX.md` |
| United Kingdom | HMRC production credentials and recognition; live Making Tax Digital for Income Tax waits for the 2027-28 window; UK bank feed through Plaid | `docs/compliance/uk/` |
| UAE | ASP partner, in-country host, tax agent partner, PDPL notice, Arabic copy review | `docs/uae/COMPLIANCE.md` |
| Malaysia | MyInvois intermediary status, signing certificate, DPO, `MYCA_MYINVOIS_SANDBOX=1` for sandbox | `docs/compliance/my/MALAYSIA-LAUNCH.md` |
| Canada, Australia | Pack files only; build the engines with `node scripts/new-country.mjs` | `docs/architecture/COUNTRY-ENGINES.md`, `platform/src/countries/knowledge/` |
| Launch | Play closed testing (12 testers for 14 days), store listings, screenshots | `docs/release/PLAY-CONSOLE-STEPS.md`, `docs/release/PLAY-LISTING*.md` |
| Quality | Keep the issue backlog (GitHub Issues) at zero; milestone M3 issues from the external developer are mostly closed. | GitHub Issues |
| Growth | Funnel analytics, invite codes, SEO pages exist; domain pending | `docs/product/GO-TO-MARKET.md` |

## 13. Where project knowledge lives besides this repository

The Claude project's shared folder (not in git) holds the brand kit, logo and mascot files, Play kit, sandbox
APKs, the CA question sheet, the Cloudflare worker steps, audit patches and deploy scripts for the owner's PC.
Ask the owner to share it; it is not required to build or test the code.

## 14. Document index

| Topic | File |
|---|---|
| Agent rules | `AGENTS.md` |
| This manual | `docs/HANDOVER.md` |
| Deployment, costs, teardown | `DEPLOYMENT.md` |
| Security policy | `SECURITY.md` |
| Product requirements and features | `docs/product/PRD.md`, `docs/product/features/` |
| Roadmap (original, October) | `docs/product/ROADMAP.md` |
| Competitive gaps | `docs/product/COMPETITIVE-GAP-MATRIX.md` |
| Languages | `docs/product/INDIA-LANGUAGES.md` |
| Statutory rule currency | `docs/product/RULES-CURRENCY.md` |
| Architecture and ADRs | `docs/architecture/` |
| Offline billing | `docs/architecture/OFFLINE-BILLING.md` |
| Privacy assessment (DPDP) | `docs/architecture/DPDP-ASSESSMENT.md` |
| Design language, UX research | `docs/design/` |
| Release: go-live keys, Play steps, listings, data safety, QA checklist, tester guide | `docs/release/` |
| Operations: runbook, incident response, retention | `docs/operations/` |
| Compliance per country | `docs/compliance/{india,us,uk,my}/`, `docs/uae/` |
| Integrations | `docs/integrations/`, `platform/INTEGRATIONS-SETUP.md` |
| Owner's checklist (October, still the best list of accounts and keys) | `docs/handover/OWNER-CHECKLIST.md` |
| Original developer handover (October, history) | `docs/handover/DEVELOPER-HANDOVER.md` |
| Specs and plans | `docs/superpowers/specs/`, `docs/superpowers/plans/` |
| Hosted API reference | `cloud/README.md` |
| Mobile app | `mobile/README.md` |
