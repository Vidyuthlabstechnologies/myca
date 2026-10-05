# Cloud backend design

Date: 2026-10-06. Status: approved by the owner on 2026-10-06 (decisions 1, 2, 4 and 5
as recommended; decision 3 still open). Step C0 is implemented; see the end of this
document.

Goal: let the Android app in `mobile/` be used by real business owners over the
internet, so it can ship on the Play Store. Today the server answers only
`127.0.0.1`, for one business, with one global signed-in user.

## Summary

Host the existing engine unchanged behind a small multi-tenant API. One business is one
isolated set of books. Postgres in Mumbai is the system of record, document bytes go to
Cloud Storage, and the API runs on Cloud Run. Owners sign in with a phone number and a
one-time code; the 4-digit PIN becomes a local app lock and leaves the server entirely.
Nothing about how figures are computed changes: the same modules run, with the same
preview-then-confirm step.

```
Android app ──HTTPS──▶ Cloud Run: MyCA API (Node 22, stateless)
                         │  auth, tenancy, rate limits, request log
                         │  runs platform/src engines per request
                         ├──▶ Cloud SQL Postgres (asia-south1): accounts, sessions,
                         │     memberships, business state, audit log
                         ├──▶ Cloud Storage (asia-south1): documents by sha256
                         ├──▶ Cloud KMS: wraps per-business secrets
                         └──▶ GST / e-invoice providers, through the action gate
```

## What the code looks like today

These are measured or read from the code, and they drive the design.

| Fact | Where | Consequence |
|---|---|---|
| All books are one JSON document written whole on every request | `store.mjs` `saveState` | Simple to host as one row per business; grows without bound |
| One invoice adds about 1.7 KB to that document (500 invoices measured: 845 KB) | measured 2026-10-06 | A business raising 50 invoices a month adds ~1 MB a year. A shop with 184 bills a day adds ~110 MB a year, which cannot be rewritten per request |
| One request at a time per process, by an in-memory queue | `session.mjs` `exclusive` | Needs a per-business lock that works across server instances |
| One signed-in user for the whole process | `session.mjs` `activeUser` | Must become per-request identity |
| PIN hashes live in the books document and in backups | `identity.mjs`, `session.backup()` | Credentials must leave the books |
| `/api/tool` runs any tool by name, including `seed_demo` and credential tools | `server.mjs` | Remote callers need an allowlist |
| A posted action is confirmed by sending chat text `confirm <token>` | `router.mjs` | Needs an explicit endpoint with an idempotency key |
| The e-invoice session token was a module-level variable | `nic-client.mjs` | One business's government session could be used for another. Fixed in C0: one session per set of credentials |
| Provider credentials are read from `%APPDATA%` and encrypted with a machine-bound key | `govt.mjs`, `nic-config.mjs`, `credential-vault.mjs` | Needs a cloud key store, per business |
| Import files travel inline in the request and sit in the pending action | `chat-confirm.mjs` | Large files must be uploaded first and referenced by hash |
| Documents are already content-addressed by sha256 and verified on read | `document-store.mjs` | Maps directly onto object storage |
| Infrastructure is Terraform on Google Cloud | `infra/` | Stay on Google Cloud |

## Design

### 1. Tenancy

- **Business** is the unit of isolation: one set of books, one GSTIN (several GSTINs
  for one business is a later change inside the books model, not a tenancy change).
- **User** is a person, identified by a verified phone number.
- **Membership** joins them with a role: `owner`, `staff`, or `accountant`. An owner can
  invite others. This replaces `firmUsers` inside the books.
- Every table row and every storage path carries `business_id`. The API resolves the
  business from the URL, checks membership, and only then loads anything.
- The desktop notion of a CA firm holding many clients in one file (`extraBooks`) is not
  used in the cloud. A CA is a user with `accountant` memberships in several businesses.

### 2. Storage

Two interfaces, each with the current filesystem implementation (desktop keeps working)
and a cloud implementation:

- `BooksStore`: `load(businessId)` returns the books and a version; `save(businessId,
  books, expectedVersion)` fails if the version moved.
- `DocumentStore`: `put(businessId, bytes)` returns the sha256; `read(businessId,
  sha256)` re-verifies it.

Cloud tables (Postgres):

| Table | Holds |
|---|---|
| `users` | id, phone (unique), name, created, deleted |
| `devices` | id, user, public label, last seen, revoked |
| `refresh_tokens` | hash, device, expires, rotated-from, revoked |
| `otp_challenges` | phone hash, code hash, expires, attempts |
| `businesses` | id, name, GSTIN, created, deletion-requested |
| `memberships` | user, business, role, invited-by |
| `books` | business (primary key), version, state JSONB, updated |
| `audit_log` | append-only: business, actor, device, action, before and after hash, request id, time |
| `idempotency_keys` | business, key, response, expires |
| `business_secrets` | business, name, ciphertext, wrapped data key |

Per request that touches books: begin a transaction, `SELECT ... FOR UPDATE` the
business's `books` row, run the engine in memory, write the row back with `version + 1`,
insert the audit rows, commit. The row lock replaces the in-memory queue and is correct
across any number of server instances.

**Known limit, stated up front.** Keeping the books as one document is right for the
first release because it leaves every engine untouched. It stops being right at roughly
10,000 documents per business (about 17 MB rewritten per request). Step C2 below moves
the append-only parts (journal, invoices, audit events) into their own tables. High-volume
counter sales should not be onboarded before C2.

### 3. Sign-in and sessions

- **Sign-in:** phone number, then a 6-digit code by SMS. Codes are stored hashed, expire
  in 5 minutes, allow 5 attempts, and are rate-limited per phone and per IP.
- **Tokens:** a 15-minute access token signed with `node:crypto` (no JWT library), and
  a 60-day refresh token that is rotated on every use, stored hashed, and bound to a
  device. Reuse of a rotated refresh token revokes the device.
- **App lock:** the PIN or fingerprint unlocks the refresh token held in the Android
  Keystore. It is checked on the phone and never sent. `pinHash` and `pinSalt` are
  removed from the books and from backups, which closes both findings from the
  30 September review.
- **Per-request identity:** the API passes the acting user into the engine; the
  process-global `activeUser` is removed from the cloud path.

### 4. API

Versioned under `/v1`, JSON, HTTPS only.

| Endpoint | Purpose |
|---|---|
| `POST /v1/auth/otp`, `/auth/verify`, `/auth/refresh`, `/auth/logout` | Sign-in and sessions |
| `GET /v1/me`, `DELETE /v1/me` | Profile; account deletion (a Play requirement) |
| `GET/POST /v1/businesses` | List mine; create one |
| `GET /v1/businesses/{id}/snapshot` | Books summary for the app |
| `POST /v1/businesses/{id}/propose` | Preview a change; returns a one-use token |
| `POST /v1/businesses/{id}/confirm`, `/discard` | Post or drop a preview; `confirm` takes an idempotency key |
| `POST /v1/businesses/{id}/ask` | Free-text chat |
| `POST /v1/businesses/{id}/query` | Read-only tools from an allowlist (`gst_payable`, `deadlines`, `exceptions`, ...) |
| `POST /v1/businesses/{id}/uploads` | Returns a signed upload URL; imports then reference the sha256 |
| `GET/POST /v1/businesses/{id}/members` | Invite, list, remove |

Rules: writes happen only through `propose` then `confirm`. Nothing reachable from the
internet can run `seed_demo`, credential tools, or `approval_decide`. Request bodies are
capped at 1 MB; files go straight to storage. Errors keep the existing
`{ ok: false, error: 'CODE' }` shape.

### 5. Secrets and provider calls

- Provider credentials are encrypted with a per-business data key, itself wrapped by
  Cloud KMS. `credential-vault.mjs` gains a KMS backend beside the Electron one.
- E-invoice sessions are held per set of taxpayer credentials (done in C0). The
  Sandbox client keeps one shared token on purpose: it authenticates MyCA's own
  provider account, not a taxpayer, so it is the same for every business. An earlier
  draft of this document listed it as a leak; on reading the code it is not.
- The action gate is unchanged: the live switch, plus an approval from a member whose
  role allows it. Live calls stay off in production until provider onboarding is done.

### 6. Privacy, residency and retention

- Everything is in `asia-south1` (Mumbai). Backups stay in India.
- Logs carry request ids, user and business ids, tool names and error codes. They never
  carry amounts, party names, GSTINs, phone numbers or document contents.
- Account deletion: access ends immediately. Whether the books can be erased at once or
  must be kept is a legal question, because tax and company law require records to be
  retained for years (to verify with counsel: 72 months under GST law, 8 financial
  years under the Companies Act). The design supports both outcomes with a
  deletion-requested state and a retention hold.
- A Digital Personal Data Protection Act assessment is a launch blocker: consent notice,
  purpose, access and correction, breach process, grievance contact.

### 7. Operations

- Cloud Run, minimum one instance, stateless. Cloud SQL with point-in-time recovery and
  a nightly export. Storage with object versioning.
- A restore drill before launch: delete a staging business and bring it back.
- Alerts on error rate, latency, failed sign-ins, and any cross-business access denial.
- Three environments: local (filesystem stores, no cloud), staging, production.
  Terraform under `infra/cloud/`.
- Rough running cost at pilot scale: one small Cloud SQL instance, one Cloud Run
  service, storage and SMS. I estimate USD 60 to 120 a month before SMS volume; this is
  an estimate, not a quote.

### 8. Testing

- Every existing platform test keeps passing against the filesystem stores.
- The same suite runs against the Postgres store in CI (a local Postgres container).
- Tenancy tests: user A cannot read, propose, confirm or upload for business B, by any
  endpoint, including with a valid token and a guessed id.
- Concurrency test: two confirms for one business at once produce two correctly numbered
  invoices and an intact ledger chain.
- `mobile/tool/live_check.dart` is extended to run against `/v1`.

## Build order

| Step | What | Why first |
|---|---|---|
| C0 | Store interfaces; per-request identity; remove global provider sessions; PIN out of books; query allowlist; explicit confirm endpoint | All local, all testable today, and each one is also a fix for the desktop app |
| C1 | Accounts, OTP, tokens, memberships; `/v1` API on Cloud Run with Postgres and Cloud Storage; app switches to `/v1` and gains sign-in | First point a real phone works over the internet |
| C2 | Move journal, documents and audit events out of the single document; signed uploads; deadline notifications | Removes the size limit before volume customers |
| C3 | Backups drill, alerts, account deletion and export, privacy assessment, security test, Play closed testing | Launch readiness |
| Later | Windows app sync with the cloud; accountant invitations; several GSTINs per business | Not needed for the first Play release |

## Decisions needed from the owner

1. **Sign-in method.** Phone and SMS code is what Indian owners expect, but sending SMS
   needs sender registration with the telecom operators (DLT), which takes time and is
   yours to start. Alternative for the first release: Google Sign-In, which needs no
   registration. Recommendation: build for phone and code, launch closed testing on
   Google Sign-In if registration is not through.
2. **Database dependency.** AGENTS.md says zero new runtime dependencies in `platform/`.
   The cloud service would be a new package, `cloud/`, with one dependency: the Postgres
   driver. The alternative with no dependency is to keep each business's books as an
   object in Cloud Storage and call Google's APIs with `fetch`; it works but gives up
   transactions and queries. Recommendation: allow the one dependency, in `cloud/` only.
3. **Who approves a live filing.** The gate today expects a CA. In an owner-first app,
   is the owner's own confirmation enough, or must an accountant member approve? This
   does not block C0 or C1.
4. **The Windows app.** Recommendation: it stays local and unchanged for now, and
   AGENTS.md is updated to say the cloud service is the explicit exception to
   local-only.
5. **Volume customers.** Confirm that businesses with hundreds of bills a day wait for
   C2.

## Out of scope

Payments and collections, payroll, becoming a merchant of record, iOS, a web app, and
any change to how tax figures are computed.

## C0 as built (2026-10-06)

| Item | Where | Notes |
|---|---|---|
| Store interfaces | `platform/src/store-ports.mjs` | File and in-memory pairs. A save from a stale version is refused. The interfaces are synchronous; the hosted pair will load before and write after each request rather than change the engines |
| Per-request identity | `session.mjs`, `book-view.mjs`, `tools.mjs` | Session methods take `{ actor }`; tools cannot be told a different identity through arguments. Not yet wired into the desktop renderer |
| E-invoice sessions per taxpayer | `nic-client.mjs` | Keyed by environment, client id, user and GSTIN |
| PIN out of the books | `store.mjs`, `identity.mjs` | Encrypted `state.pins` beside the books; absent from `state.json` and backups; existing files migrate on next save |
| Read-only query list | `remote-contract.mjs`, `/api/query` | Eight tools. `/api/company` updates profile fields only |
| Explicit confirm and discard | `router.mjs`, `/api/confirm`, `/api/discard` | A repeated confirm with the same token replays the first answer |

Carried into C1, found while building C0:

- (Done) Previews and the last confirmation are now saved with the books, and imports
  are held by file hash.
- `ensureDefaultAdmin` gives any user without a PIN the default `1234`, including after a
  lost or damaged `state.pins`. In the cloud there is no PIN on the server, so this
  disappears; on the desktop it should become a forced PIN change.
- `seedDemo` runs whenever books are empty. A hosted business must start empty.
- Provider credentials still come from `%APPDATA%` (`govt.mjs`, `nic-config.mjs`).

## C1 so far (2026-10-06, local Postgres only)

Built and tested against a local Postgres 18. Nothing is deployed.

| Item | Where | Notes |
|---|---|---|
| Schema and migrations | `cloud/migrations/001_init.sql`, `cloud/src/db.mjs` | Tables as designed, plus `documents`. `audit_log` rejects update, delete and truncate |
| Phone sign-in | `cloud/src/auth.mjs` | Codes hashed, 5 minutes, 5 tries, 5 requests an hour per phone. The challenge table holds no phone number |
| Sessions | `cloud/src/tokens.mjs`, `auth.mjs` | 15-minute access token, rotating 60-day refresh token, reuse revokes the device, revocation is immediate |
| Businesses and roles | `cloud/src/businesses.mjs` | A new business starts with empty books; owner, staff, accountant |
| Engine per request | `cloud/src/books-runner.mjs` | Row lock per business; previews persist across requests |
| `/v1` API | `cloud/src/api.mjs` | Auth, me, businesses, snapshot, propose, confirm, discard, query, ask, company, members, state list |
| App | `mobile/lib/cloud/`, phone and business screens | Hosted mode when built with `MYCA_CLOUD_URL`; tokens in the Android Keystore |

Differences from the design above, and why:

- No `idempotency_keys` table. A confirm is made idempotent by its one-use token, which
  the books now remember; a second table would repeat that.
- Document bytes are in Postgres for now. Cloud Storage needs the cloud project.
- Imports work through uploads (built 2026-10-06, pulled forward from C2): a file is
  uploaded, stored by hash under its business, and the import refers to the hash. The
  upload travels in the request body up to 8 MB rather than by a signed storage URL.
- The books are written on every request, including reads, because each call appends an
  audit event. Measured locally at about 7 ms a request with 30 invoices.

Still to do in C1: deployment (Terraform, Cloud Run, Cloud SQL, HTTPS), an SMS sender,
Google Sign-In for closed testing, member invitations, and the on-phone app lock.
