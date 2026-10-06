# MyCA hosted API

The service the Android app talks to. It owns accounts, sign-in and tenancy, and runs
the unchanged engines in `platform/src` once per request against Postgres. Design:
`docs/superpowers/specs/2026-10-06-cloud-backend-design.md`.

This package has one dependency, the Postgres driver `pg`. `platform/` stays
dependency-free. Nothing here is deployed yet; it has only run against a local Postgres.

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

`MYCA_DEV_OTP=1` prints sign-in codes to the console instead of sending an SMS. It is
for local development only; without it the server refuses to start because no SMS
sender exists yet. The server also refuses to start if `MYCA_ENABLE_LIVE_CALLS` is set.

Point the app at it:

```bash
flutter run --dart-define=MYCA_CLOUD_URL=http://127.0.0.1:8080
```

(with `adb reverse tcp:8080 tcp:8080` for a phone on USB).

## Not built yet

- Deployment: Terraform, Cloud Run, Cloud SQL, HTTPS. Needs a Google Cloud project.
- An SMS sender, and Google Sign-In for closed testing.
- Telling an invited person. An invitation is only visible to them after they sign in
  with that number; no SMS is sent because there is no sender yet.
- Changing a member's role, or adding a second owner.
- Per-business provider credentials, so e-invoice and filing actions cannot be proposed.
- Each business holds one pending preview. Two members previewing at once replace each
  other's preview; nothing wrong is posted, but one of them has to start again.
- Reads write: every query appends an audit event, so it rewrites the books row.
- Document bytes are in a Postgres table for now, not Cloud Storage. Uploads are sent
  in the request body, up to 8 MB; larger files need direct-to-storage uploads.
- No limit yet on how much a business can upload in total.
