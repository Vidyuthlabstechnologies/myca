# MyCA hosted API

The service the Android app talks to. It owns accounts, sign-in and tenancy, and runs
the unchanged engines in `platform/src` once per request against Postgres. Design:
`docs/superpowers/specs/2026-10-06-cloud-backend-design.md`.

This package has one dependency, the Postgres driver `pg`. `platform/` stays
dependency-free. It has run against a local Postgres and in CI; the Google Cloud project it deploys to is
not created yet (`infra/cloud` is written and validated, applied by hand).

## How a request runs

1. The bearer token is verified, then the device and user are checked in the database,
   so a revoked device stops working at once.
2. The business comes from the URL. If the caller is not a member the answer is 404,
   the same as for a business that does not exist.
3. Files are uploaded first (`POST .../uploads`, text up to 8 MB) and imports refer to
   them by hash; an import with inline content is refused.
4. One transaction locks that business's `books` row, builds in-memory stores from it,
   opens a platform session on them, runs the engine with the caller as the actor,
   writes the row back, and appends to `audit_log`.

## Layout

| Path | Purpose |
|---|---|
| `migrations/` | Schema, applied in name order by `src/db.mjs` |
| `src/tokens.mjs` | Access tokens (HMAC, 15 minutes) and refresh token hashing |
| `src/auth.mjs` | Phone codes, sessions, refresh rotation with reuse detection, account deletion |
| `src/businesses.mjs` | Creating a business with empty books; memberships and roles |
| `src/members.mjs` | Invitations by phone number, joining, leaving and removing members |
| `src/books-runner.mjs` | The per-request transaction around the engine |
| `src/crash-reports.mjs` | Scrubbing, grouping and keeping crash reports from the app and the server |
| `src/crashes.mjs` | `npm run crashes [n]`: the latest crash reports, read from `MYCA_DATABASE_URL` |
| `src/api.mjs` | Routes under `/v1` |
| `src/server.mjs` | Entry point |

## Run locally

Start a private Postgres (any 13 or newer), then:

```bash
npm install
```

```bash
MYCA_TEST_DATABASE_URL=postgres://myca@127.0.0.1:54329/postgres npm test
```

Each test file creates and drops its own database.

```bash
MYCA_DATABASE_URL=postgres://myca@127.0.0.1:54329/myca_dev MYCA_TOKEN_SECRET=<32+ random characters> MYCA_DEV_OTP=1 PORT=8080 npm run dev
```

`MYCA_GOOGLE_CLIENT_IDS` lists the OAuth client ids (comma-separated) whose Google ID
tokens the API accepts; set it to the web client id the app passes as
`MYCA_GOOGLE_SERVER_CLIENT_ID`. `MYCA_DEV_OTP=1` prints phone sign-in codes to the
console instead of sending an SMS, for local development only. The server needs at
least one of the two; without either it refuses to start, because no SMS
sender exists yet. The server also refuses to start if `MYCA_ENABLE_LIVE_CALLS` is set.

Point the app at it:

```bash
flutter run --dart-define=MYCA_CLOUD_URL=http://127.0.0.1:8080
```

(with `adb reverse tcp:8080 tcp:8080` for a phone on USB).

## Operations

- `POST /v1/jobs/daily` with the `x-myca-job-token` header (`MYCA_JOB_TOKEN`, 32+
  characters, else the route does not exist) runs the daily checks for every business:
  reminders for what falls due, the ledger chain, the dated rules. Cloud Scheduler calls
  it at 02:30 IST (`infra/cloud`). Each run is one transaction per business, audited.
- Startup waits for the database (ten tries, three seconds apart); `SIGTERM` drains
  in-flight requests before the pool closes. `npm run migrate` applies migrations on
  their own, for a restore drill.
- `.github/workflows/deploy-cloud.yml` builds the image and rolls it out on merge to
  `main` once `GCP_API_REGION` is set. `docs/operations/RUNBOOK.md` has the rest.

## Inbound keys

An owner creates a key per connected system from the app (Connections) or with
`POST /v1/businesses/:id/inbound` `{ label, source }`; `source` is `pos` or `documents`.
The secret is shown once and stored hashed. The system sends it in the `x-myca-key`
header:

- `POST /v1/inbound/sales` `{ saleId, lines, partyName?, partyGstin?, date? }` posts a sale
  as an invoice without a per-entry confirmation (the one flow that does). It is
  idempotent on `saleId`: the same sale sent twice answers with the first invoice and
  `duplicate: true`. The owner sees today's count and total per key and can turn a key
  off; a disabled key answers 401.
- `POST /v1/inbound/documents` `{ name, content, from? }` stores a forwarded bill or
  statement and leaves a reminder for the owner to read it. Nothing posts.
- `POST /v1/inbound/email` is for the email relay only (`x-myca-relay-token` must equal
  `MYCA_INBOUND_RELAY_TOKEN`, 32+ characters). With `MYCA_INBOUND_EMAIL_DOMAIN` set,
  every documents key gets an address `<token>@<domain>` shown under Connections; mail to
  it has its attachments (or its text) stored for that business with a reminder. An
  unknown address answers 404 so the relay bounces the mail.

## Not built yet

- The Google Cloud project itself, and the first `terraform apply` of `infra/cloud`.
- An SMS provider account: the Twilio and MSG91 senders exist (`src/sms-sender.mjs`, chosen by `MYCA_SMS_PROVIDER`); without one Google Sign-In is the only sign-in.
- Telling an invited person. An invitation is only visible to them after they sign in
  with that number; no SMS is sent because there is no sender yet.
- Per-business provider credentials, so e-invoice and filing actions cannot be proposed.
- Each business holds one pending preview. Two members previewing at once replace each
  other's preview; nothing wrong is posted, but one of them has to start again.
- Reads are audited but no longer rewrite the books row (\`withReadOnlyBooks\`, 2026-10-14).
- Document bytes are in a Postgres table for now, not Cloud Storage. Uploads are sent
  in the request body, up to 8 MB; larger files need direct-to-storage uploads.
- A business may hold 200 MB of documents in total (\`MAX_BUSINESS_BYTES\`); beyond that an upload answers 413 STORAGE_FULL.
