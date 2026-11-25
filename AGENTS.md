# AGENTS.md — MyCA

Guidance for AI coding agents working in this repository. Read this file first, then
[`docs/HANDOVER.md`](docs/HANDOVER.md), which is the full operating manual: architecture, every country
app, toolchain setup, build, test, deploy, release, what only the owner can do, and the open work.

## What this project is

MyCA is a chat-first accounting and tax product sold as **one app per country** (India, US, UK,
UAE, Malaysia; Canada and Australia planned). The owner talks to the app; the app proposes an
entry, shows a preview, and posts it only after the owner confirms. The **tax invoice is the
source of truth**; the trial balance and returns are projections of posted entries.

One engine, two hosts (ADR-0006): the dependency-free `platform/src` engines run inside the
hosted API (`cloud/`, Cloud Run + Cloud SQL) for the Flutter apps in `mobile/`, and inside a local
server for the older Windows desktop app (`platform/desktop/`). Each country's data stays in that
country: one deployment per country. The hosted service was an explicit owner decision
(2026-10-06); `platform/` stays dependency-free and `cloud/` is the only package that may use a
database driver.

## Golden rules

1. **Never invent financial or statutory numbers.** Deterministic engines own the maths;
   an LLM may only choose tools, never produce a figure.
2. **Keep live portal actions out of autonomous control.** Filing, signing, OTP, DSC, and
   credential operations require the live switch and a CA approval. Never bypass
   `MYCA_ENABLE_LIVE_CALLS` or the approval workflow.
3. **Everything is auditable.** New state-changing operations must record an audit event
   (via `appendAuditEvent`) and be explainable (`why` + `source` for any flag).
4. **No plaintext secrets** in code, logs, `state.json`, or tool results. Use
   `credential-vault.mjs` for anything secret.
5. **Zero new runtime dependencies in `platform/`.** ESM only, Node 22. `node:crypto` and other
   built-ins are fine. Do not add to `platform/package.json` dependencies. Prefer a ready-made
   package or provider over writing your own: check `platform/src/countries/ready-made.mjs`,
   install a package in `cloud/` and hand it to the engine through a port
   (`docs/architecture/COUNTRY-ENGINES.md`). Never embed GPL, AGPL or source-available code.
6. **No code comments.** The codebase convention is self-explanatory names, no comments
   (the frozen sprint specs state this explicitly and it is followed throughout).

## Repository map

| Path | Notes |
|---|---|
| `platform/src/` | All runtime modules. This is where product changes go. |
| `cloud/` | Hosted API for the Android app: accounts, sign-in, tenancy, and a per-request transaction around the `platform/src` engines. One dependency (`pg`). See `cloud/README.md`. |
| `mobile/` | Flutter Android app for business owners. Holds no tax logic; see `mobile/README.md`. |
| `platform/desktop/` | Electron `main.cjs` + offline renderer (`index.html`, `app.js`, `styles.css`). `preload.cjs` exposes only `window.myca.saveInvoicePdf` — keep that bridge narrow. |
| `platform/test/` | `node:test` suite. Add regression tests here. |
| `sprints/sprint-1..6/` | **Frozen engines.** Treat as read-only unless a task explicitly targets them. |
| `infra/` | Terraform. `infra/bootstrap` is the one-time owner step (state bucket, workload identity for GitHub). `infra/cloud` is production on Google Cloud: Cloud Run API and site, Cloud SQL, Secret Manager, Cloud Scheduler, Pub/Sub for Play. `infra/aws` is the earlier AWS deployment, kept only until it is switched off; do not build on it. |
| `email-relay/` | Cloudflare Worker that sends the app's email. `node --test`, three tests. |
| `.github/workflows/` | CI, nightly, the Cloud Run deploy (`deploy-cloud.yml`), site deploy, Terraform, and the Android, Windows and iOS builds. |
| `design/` | Universal design system for every country app and site: tokens (Style Dictionary), generated CSS/JS/Dart, web formatting, and the `myca_design` Flutter package (theme, country formats, Bahi, components, strings). Design language in `docs/design/DESIGN-LANGUAGE.md`. Edit tokens, then `npm run build` in `design/`. |
| `deploy/` | Marketing/research static site — not the product. |
| `vendor/` | Unused reference clones. **Never import from here** (licences). |

## Repository map

| Path | Notes |
|---|---|
| `platform/src/` | All runtime engines and tools. Product logic goes here. Zero runtime dependencies. |
| `platform/src/countries/` | One pack file per country (`india.mjs`, `united-states.mjs`, ...) plus one folder per country engine (`united-states/`, `united-kingdom/`, `uae/`, `malaysia/`), the shared `kit/`, `knowledge/` (sourced per-country facts) and `manifests.mjs`. |
| `cloud/` | Hosted API: accounts, sign-in, tenancy, billing, jobs, a per-request transaction around the engines. One dependency (`pg`). `cloud/README.md` holds the full environment-variable table. |
| `mobile/` | Flutter app. Five Android flavors (`india`, `us`, `my`, `uk`, `uae`), iOS and Windows shells. Holds no tax logic: every figure comes from the server. |
| `design/` | Design tokens (Style Dictionary), generated CSS/JS/Dart, the `myca_design` Flutter package. Edit tokens, then `npm run build` in `design/`. |
| `platform/desktop/` | Electron shell and offline renderer for the Windows app. `preload.cjs` exposes only `window.myca.saveInvoicePdf`; keep it narrow. |
| `sprints/sprint-1..6/`, `sprints/statutory-rules` | **Frozen engines** (ledger, GST, TDS, payroll, rules). Read-only unless a task targets them; statutory rule records are the exception (see the rules-watch section of the runbook). |
| `infra/` | Terraform. `infra/bootstrap` is the one-time owner step. `infra/cloud` is production on Google Cloud (one `countries/*.tfvars` per country). `infra/aws` is the retired AWS deployment: do not build on it. |
| `deploy/` | The public website (`deploy/public`), its nginx and Cloudflare Pages config, SEO and QA tests. |
| `email-relay/` | Cloudflare Worker that sends and receives the app's email. |
| `scripts/` | `check-all.mjs` (every suite), `countries.mjs` (country table and consistency checks), `new-country.mjs`, `rules-watch.mjs`, `play-upload.mjs`, sandbox helpers. |
| `.github/workflows/` | CI, nightly, CodeQL, Cloud Run deploys, site deploys, Terraform, Android/iOS/Windows builds. |
| `docs/` | Product, architecture, compliance, release, operations, handover. Index in `docs/HANDOVER.md` section 14. |
| `vendor/` | Unused reference clones. **Never import from here** (licences). |

## Countries

Everything that differs by country (tools, prices, filing routes, data region, app flavor, tax
modules) lives in one file per country under `platform/src/countries/`. Read
`docs/architecture/COUNTRY-PACKS.md` before adding country-only behaviour. Country-only tools go
in that pack's sorted `tools` list, never in `country.mjs`. Each country's data stays in that
country: one deployment per country, checked by `cloud/src/residency.mjs` and `infra/cloud/country.tf`.

A country's code lives in its own folder, `platform/src/countries/<name>/`, and is declared in a
manifest: read `docs/architecture/COUNTRY-ENGINES.md`. Do not edit `tools.mjs`,
`assistant-contract.mjs`, `chat-confirm.mjs`, `router.mjs`, `remote-contract.mjs`, `store.mjs`,
`books.mjs` or `cloud/src/api.mjs` to add a country's tool; the manifest feeds all of them. Use
`countries/kit` for brackets, tax periods, the return life cycle, check digits and the country's
slice of the book. `node scripts/new-country.mjs` starts a new country.

## Commands

Node 22 is required (Node 20 cannot expand the quoted test glob). Flutter is pinned to **3.44.9**
(CI clones that tag). There is no linter or typechecker for the Node packages; the test suites are the
gate, and `flutter analyze` is the gate for Dart.

```bash
node scripts/check-all.mjs                 # every suite, prints a pass/fail table
node scripts/check-all.mjs platform        # or any of: platform sprints cloud email-relay listing design mobile
node scripts/countries.mjs                 # country table; exits 1 on any pack, manifest or knowledge problem
node scripts/rules-watch.mjs               # statutory gaps and records ending soon; exit 1 when a person is needed

cd platform && npm test                    # platform suite
cd platform && npm run dev                 # local server on http://127.0.0.1:4780
cd cloud && npm test                       # needs Postgres: MYCA_TEST_DATABASE_URL=postgres://myca@127.0.0.1:5432/postgres
cd mobile && flutter analyze && flutter test
cd design && npm run build && npm test
```

The hosted API suite is skipped, and reported as skipped, when no Postgres is reachable. Run
`node scripts/check-all.mjs` before every push and say in the commit and PR what it reported.
Fresh machines: `docs/HANDOVER.md` section 4 lists every install step.

## Non-obvious invariants (read before editing)

- **Money is integer paise** in the ledger (`paise()`), rupees only at the edges.
  Round on output, never accumulate floats.
- **Transfers are append-only.** Never mutate a posted transfer; add a resolving entry.
- **`books.mjs`**: `SELF` maps to the root state object; other clients get isolated books.
  Any new per-client concern must go through `getBook`.
- **Active-client view**: `session.mjs` runs tools/chat against `bookView(root, book)`
  (`book-view.mjs`), a Proxy that routes `BOOK_KEYS` to the active client's book and
  `FIRM_KEYS` to the root. Writing any other top-level key throws
  `VIEW_WRITE_UNKNOWN_KEY`. Add a new top-level field to exactly one of the two sets;
  `test/book-view.test.mjs` fails on any unclassified write or on a key that
  `newBook()`/`createState()` carries without classifying it. Never enumerate, inspect or
  clone a view (spread, `Object.keys`, `JSON.stringify`, `util.inspect`, `structuredClone`):
  its key list comes from the root, so book-only fields go missing and inspected values are
  the root's. Read fields by name. The throw is a developer tripwire, not a transaction:
  writes made before it are kept.
- **Client ids** match `^[A-Z0-9][A-Z0-9_-]{1,31}$` and are upper-cased on entry
  (`normalizeClientId`); `SELF` is reserved. `extraBooks` is a null-prototype map; look
  books up with `Object.hasOwn`, never by truthiness or `in`. Legacy ids that do not fit
  the pattern are migrated on load to a free canonical id (the original kept as
  `legacyClientId`, every reference rewritten, and a copy of the pre-migration
  `state.json` written next to it); only prototype keys such as `__proto__` are refused.
- **Attachments are per book.** `book.attachments` (persisted metadata) and `book.files`
  (in-memory cache, never persisted) live on each client's book. Document bytes are
  content-addressed on disk, and every read re-verifies the sha256 (`readVerifiedDocument`).
- **`text-safe.mjs`** is the only place CSV/HTML escaping should live (`csvCell`, `csvRows`,
  `htmlEscape`). Do not hand-roll `join(',')` or string-built HTML.
- **`runtime-config.mjs`** owns `loadEnvFile()` and `liveCallsEnabled()`. Do not
  re-implement env loading; do not add a second source of truth for the live switch.
- **Provider calls** go through `sandbox-adapter.mjs` (`runSandboxOperation`), which
  enforces the four gates. Do not call `sandbox-client.mjs` directly from a tool.
- **Backups and the daily checks are automatic.** `createFileBooksStore` keeps one
  verified copy of `state.json` per day in `backups/` (fourteen kept) on every save and
  restores the newest good one when the file will not parse; `server.mjs` runs
  `run_automation` on launch and hourly, and the hosted API's `/v1/jobs/daily` runs it
  for every business overnight. A reminder the automation creates carries `source`; a
  new dated item goes in `automation.mjs` `dueSoon`, never a second scheduler. The
  nightly workflow and `scripts/rules-watch.mjs` watch the rules; `docs/operations/RUNBOOK.md`.
- **Storage goes through `store-ports.mjs`.** `session.mjs` loads and saves books only
  through a `BooksStore` (`load()` / `save(state, expectedVersion)`, which refuses a
  stale version with `VERSION_CONFLICT`) and reads and writes document bytes only
  through a `DocumentStore`. `openSession(path)` builds the file pair; pass
  `{ books, documents, path }` to supply another. Do not call `loadState`, `saveState`
  or `putDocument` from the session or from tools; outside the session use
  `documentsOf(state)`.
- **PINs are not books.** `serialize()` strips `pinHash`, `pinSalt` and the lockout
  counters, so `state.json` and backups never carry them. They are kept encrypted in
  `state.pins` beside the books and merged back on load. A restore keeps the PINs
  already on the machine and ignores any in the payload.
- **Who is acting comes from the session, not the arguments.** Session methods take
  `{ actor }`; when one is given, `runTool` overwrites `actorId`, `role`,
  `requestedBy` and `decidedBy` with it (except the `assistant` marker, which only
  lowers what is allowed). The desktop renderer does not pass an actor yet, so there
  the arguments are still used.
- **Remote callers** (the Android app) use `/api/propose`, `/api/confirm`,
  `/api/discard`, `/api/query`, `/api/upload` and `/api/company`. `/api/query` runs only the tools in
  `REMOTE_QUERY_TOOLS` (`remote-contract.mjs`); add a tool there only if it is
  read-only. `/api/tool` runs anything and must never be exposed beyond `127.0.0.1`.
- **A waiting import holds a file hash, not the file.** `import-documents.mjs` moves
  inline content into the document store before a preview is held and reads it back
  at preview and at confirm, so `pendingChatAction` and `state.json` never carry file
  contents. Send imports as `{ documentSha256 }` after `/api/upload`.
- **An IRP session belongs to its taxpayer.** `nic-client.mjs` holds one session per
  set of credentials (`nicSessionKey`). Never reintroduce a module-level session.
- **Assistant tools** must be declared in `tools.mjs`, have a strict schema in the
  matching `tool-schemas-*.mjs` file (`books`, `sales-purchases`, `tax`, `us`;
  `additionalProperties: false`), and be tested. `tool-schemas.mjs` joins them and
  `assistant-contract.mjs` re-exports `TOOL_ARG_SCHEMAS`. `assistantTools()` in
  `assistant-tools.mjs` filters blocked tools; keep `TOOL_RISK` there current.

## Adding a feature — checklist

1. Add logic to a focused `platform/src/*.mjs` module; keep it pure where possible.
2. If it changes books/state, record an audit event and reconsider `stateDigest`.
3. Expose it via a named tool in `tools.mjs` with a clear `title`/`description`.
4. Add the schema to the matching `tool-schemas-*.mjs` file and its risk to `TOOL_RISK`
   in `assistant-tools.mjs`; mark it blocked there if it is unsafe to run autonomously.
5. Route it from `intent.mjs` only if it is safe to trigger from chat.
6. Add regression tests to `platform/test/edges.test.mjs` (or a new `*.test.mjs`).
7. Run `npm test` in `platform` (and any touched sprint).
8. Update `docs/HANDOVER.md` (open work, section 12) if the built/not-built picture changed.

## Style

- ESM, named exports, uppercase acronyms (`REQ-CA-001`, `GSTIN`).
- Small pure helpers; side effects confined to `session.mjs`, `server.mjs`, `store.mjs`,
  `document-store.mjs`, `govt.mjs`.
- Errors are returned as `{ ok: false, error: 'CODE', ... }`, not thrown, in engines;
  throw only for HTTP-level failures (e.g. `CLIENT_NOT_FOUND` with `statusCode`).
- Determinism: no randomness, no `Date.now()` inside rule/flag engines.

## Git & PRs

- **Branches.** Base every branch on `develop` and open the PR into `develop`. `main` is the
  production branch: a push to `main` deploys the API and the website on its own. Only the owner (or
  an agent the owner has told to release) merges `develop` into `main`, through a PR, after the
  release checks in `docs/HANDOVER.md` section 9. Never push to `main` or `develop` directly.
- Dependabot PRs target `develop`. Do not bump the Node base image past 22 or Flutter past 3.44.9
  without changing CI in the same PR.
- Commit only when asked. Stage intended files; never commit `.env*`, `node_modules/`, `.terraform/`,
  `*.tfstate`, keystores, `key.properties`, or anything under `%APPDATA%`.
- Keep commit messages descriptive and say what was verified. Rebase or merge `develop` before you
  merge; other agents work in parallel.
- Several agents share this repository. Before starting an issue, check open PRs and the
  `claude/*` branches for the same work.

## Where to look for context

| Question | Doc |
|---|---|
| How do I set up, build, test, deploy, release? What is owner-only? What is open? | `docs/HANDOVER.md` |
| What must the product do? | `docs/product/PRD.md`, `docs/product/features/` |
| How does the system fit together, and why? | `docs/architecture/` (`ARCHITECTURE.md`, `COUNTRY-PACKS.md`, `COUNTRY-ENGINES.md`, `DATA-MODEL.md`, `SECURITY-AND-PRIVACY.md`, `decisions/`) |
| Environment variables of the hosted API | `cloud/README.md` |
| How is it deployed and released? | `DEPLOYMENT.md`, `docs/release/GO-LIVE.md`, `docs/release/PLAY-CONSOLE-STEPS.md`, `docs/operations/RUNBOOK.md` |
| What is competitive or missing? | `docs/product/COMPETITIVE-GAP-MATRIX.md`, `docs/product/ROADMAP.md`, `docs/handover/OWNER-CHECKLIST.md` |
| Per-country compliance and launch | `docs/compliance/<in|us|uk|my>/`, `docs/uae/`, `platform/src/countries/knowledge/` |
| Engine fixtures and expected numbers | `sprints/*/BENCHMARK.md` |
| Design language | `docs/design/DESIGN-LANGUAGE.md` |
