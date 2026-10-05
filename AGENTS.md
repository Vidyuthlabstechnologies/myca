# AGENTS.md — MyCA

Guidance for AI coding agents working in this repository. Read this first; also read
`README.md` (architecture) and `STATUS.md` (what exists).

## What this project is

MyCA is a **Windows-first, local-only** accounting and compliance workbench for Indian
SMBs and CA firms. A single local server (`platform/src/server.mjs`) serves an Electron
renderer over `127.0.0.1`. The **tax invoice is the source of truth**; the trial balance
and GST returns are projections of posted invoices.

The Windows app is local-only, and that is a deliberate privacy/data-residency posture.
The one explicit exception (owner decision, 2026-10-06) is the hosted service for the
Android app, specified in `docs/superpowers/specs/2026-10-06-cloud-backend-design.md`.
It will live in its own `cloud/` package, which may depend on the Postgres driver;
`platform/` stays dependency-free. Do not host anything outside that spec.

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
5. **Zero new runtime dependencies.** ESM only, Node 22. `node:crypto` and other
   built-ins are fine. Do not add to `platform/package.json` dependencies.
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
| `infra/` | Terraform (GCP site + release pipeline). `infra/bootstrap` is the one-time owner step. |
| `.github/workflows/` | CI, site deploy, Windows build, Terraform. |
| `deploy/` | Marketing/research static site — not the product. |
| `vendor/` | Unused reference clones. **Never import from here** (licences). |

## Commands

```bash
cd platform
npm test                 # platform suite (must stay green)
npm run dev              # http://127.0.0.1:4780
npm start                # Electron (requires: npm i)
npm run pack             # Windows installer (requires electron-builder)

# a single sprint engine
cd sprints/sprint-3-gst-recon && npm test
```

One command runs every suite in the repository (platform, each sprint, the hosted API
and the Android app) and prints a pass/fail table:

```bash
node scripts/check-all.mjs            # everything
node scripts/check-all.mjs platform   # or any of: platform sprints cloud mobile
```

GitHub Actions is not running jobs for this repository at the moment (account billing),
so this command is the gate: run it before every push and say in the commit what it
reported. The hosted API suite is skipped, and reported as skipped, when no Postgres is
reachable.

There is **no linter or typechecker**. The `npm test` suites are the gate. Run the
platform suite plus any sprint suite you touched before committing.

Test script note: suites use `node --test "test/*.test.mjs"` (quoted glob). This needs
**Node 22**; Node 20 cannot expand the glob. CI pins Node 22 for this reason.

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
- **Assistant tools** must be declared in `tools.mjs`, have a strict schema in
  `assistant-contract.mjs` (`additionalProperties: false`), and be tested.
  `assistantTools()` filters blocked tools; keep `TOOL_RISK` current.

## Adding a feature — checklist

1. Add logic to a focused `platform/src/*.mjs` module; keep it pure where possible.
2. If it changes books/state, record an audit event and reconsider `stateDigest`.
3. Expose it via a named tool in `tools.mjs` with a clear `title`/`description`.
4. Add the schema to `assistant-contract.mjs`; mark it blocked if it is unsafe to
   run autonomously.
5. Route it from `intent.mjs` only if it is safe to trigger from chat.
6. Add regression tests to `platform/test/edges.test.mjs` (or a new `*.test.mjs`).
7. Run `npm test` in `platform` (and any touched sprint).
8. Update `STATUS.md` if the built/not-built picture changed.

## Style

- ESM, named exports, uppercase acronyms (`REQ-CA-001`, `GSTIN`).
- Small pure helpers; side effects confined to `session.mjs`, `server.mjs`, `store.mjs`,
  `document-store.mjs`, `govt.mjs`.
- Errors are returned as `{ ok: false, error: 'CODE', ... }`, not thrown, in engines;
  throw only for HTTP-level failures (e.g. `CLIENT_NOT_FOUND` with `statusCode`).
- Determinism: no randomness, no `Date.now()` inside rule/flag engines.

## Git & PRs

- `main` is the deploy branch; CI runs on every push.
- Only commit when the user asks. Stage intended files; never commit `.env*`,
  `node_modules/`, `.terraform/`, `*.tfstate`, or anything under `%APPDATA%`.
- Keep commit messages descriptive; note what was verified.

## Where to look for context

| Question | Doc |
|---|---|
| What must the product do? | `docs/product/PRD.md` (the owner's PRD as numbered requirements) and `docs/product/features/` |
| How does the system fit together, and why? | `docs/architecture/ARCHITECTURE.md`, `DATA-MODEL.md`, `SECURITY-AND-PRIVACY.md`, `decisions/` |
| What comes next? | `docs/product/ROADMAP.md` |
| What is built / missing? | `STATUS.md` |
| What API surfaces must the desktop product have? | `platform/PRD.md` (REQ-CA-001…015) |
| How should provider adapters behave? | `platform/INTEGRATION-RECONCILIATION.md` |
| How do I demo/review the product? | `platform/CA-REVIEW.md` |
| How do I make an integration live? | `platform/INTEGRATIONS-SETUP.md` |
| How is it deployed/released? | `DEPLOYMENT.md` |
| Engine fixtures and expected numbers | `sprints/*/BENCHMARK.md` |
