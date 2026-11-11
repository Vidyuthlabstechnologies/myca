# MyCA hosted API

The service the Android app talks to. It owns accounts, sign-in and tenancy, and runs
the unchanged engines in `platform/src` once per request against Postgres. Design:
`docs/superpowers/specs/2026-10-06-cloud-backend-design.md`.

This package has one dependency, the Postgres driver `pg`. `platform/` stays
dependency-free. It has run against a local Postgres and in CI; the Google Cloud project it deploys to is
not created yet (`infra/cloud` is written and validated, applied by hand).

## How a request runs

1. The bearer token is verified, then the device and user are checked in the database,
   so a revoked device stops working at once. A request that is past this check and is
   waiting for the books lock when its device is signed out, or its account deleted, is
   checked again once it holds the lock and once more just before it commits. It then
   answers `401 UNAUTHENTICATED` with `reason: DEVICE_REVOKED`, and nothing it did is kept.
2. The business comes from the URL. If the caller is not a member the answer is 404,
   the same as for a business that does not exist.
3. Files are uploaded first (`POST .../uploads`, text up to 8 MB) and imports refer to
   them by hash; an import with inline content is refused.
4. One transaction locks that business's `books` row, builds in-memory stores from it,
   opens a platform session on them, runs the engine with the caller as the actor,
   writes the row back, and appends to `audit_log`. No request holds one pooled connection
   while it waits for another, apart from the date and cursor that a channel pull saves.
   A request that cannot get a connection in 5 seconds answers `503 SERVER_BUSY` with
   `Retry-After: 2`. A dropped or refused database connection answers `503 SERVER_BUSY`
   with `Retry-After: 2` too, and the pool replaces the dead connection; the API process no
   longer exits when a connection dies.

The two later checks run on every route that works on the books with a device: ask,
propose, confirm, discard, uploads, query, replace, company, the e-invoice and approval
calls, the snapshot and the accountant's shared view. Jobs and WhatsApp carry no device and
are not checked. Two limits are known. A sign-out that lands in the round trip between the
closing check and the commit itself is not caught. The accountant-sharing routes (`ca-share`,
`ca-sync`) take their own transaction and carry no device, so a sign-out in flight does not
stop them. The closing check can also undo a request that has already called an outside
service, because the e-invoice call to the portal runs inside the books transaction: a number
the portal issued for it is then not in the books. That is the price of never saving
changes for a device that was signed out.

Requests that are not what the app sends are answered like any other wrong request. A
request target that cannot be parsed answers `404 NOT_FOUND` and is logged with the path
"(unreadable)". A chat message, from the app or from WhatsApp, is cut to 2,000 characters and
any run of four or more blanks is shortened to its first character, so a padded message
cannot hold the planner. An object, a list or another value of the wrong type where a phone
number, a code or an id belongs, on the sign-in and second-step routes, is read as empty, so
it is a wrong value: the 400 a wrong value gets, with no crash record and no stack in the log.
An answer is turned into JSON before any header is sent, so one that cannot be written is a
plain `500 INTERNAL_ERROR` and the connection is kept.

Request bodies are counted before they are kept. One budget of body bytes in flight is shared by every route that reads a body: the JSON routes, uploads, the restore, the Play billing notification and the WhatsApp webhook. A body is in memory several times over while it is read and parsed (the pieces, the joined buffer, the text, the parsed object), so each byte of body is counted as up to six bytes of memory. The budget is a sixteenth of the memory the process may use (`process.constrainedMemory()`), at least 16 MiB and at most the 200 MB stored-bytes cap, or 64 MiB when that memory is not known; `MYCA_BODY_BUDGET_BYTES` replaces it when it is a positive whole number of bytes. On the 512 MiB instance in `infra/cloud` it is 32 MiB, which is at most about 190 MiB of copies on top of the roughly 100 MiB an idle process takes. A request whose `Content-Length` is more than its route allows, or more than the whole budget, answers `413 BODY_TOO_LARGE` before any of its body is read, so a restore (`POST .../replace`) is taken up to the budget and not up to 200 MB, and a larger one is refused with that 413. A request whose declared length fits is reserved at once, and when the rest of the budget has no room for it the answer is `503 SERVER_BUSY` and the body is discarded as it arrives. A body with no declared length is counted piece by piece, and the piece that no longer fits ends it the same way (503, or 413 past the limit). The bytes are given back when the request has been answered, so a request that waits for the books lock still holds its own, and a request that is refused holds nothing. A body of 64 KiB or less is counted but never refused, so ordinary requests are not slowed. A client that drops the connection before its body is complete is ended with `400 REQUEST_ABORTED` (nobody is left to read it) and is logged as a 400, not as a crash. The owner-only actions (`ca-sync`, `ca-share`, `subscription`, `invitations`, `inbound`, `connectors`, the Plaid, Gusto and TaxJar calls, `connector-sync` and `replace`) answer a staff member or an accountant with `403` before their body is read.

A read-only request (a query, or the snapshot) takes the row for share, writes nothing
back and sends its audit events to `audit_log` alone, so the books do not hold the
events of those reads. `GET /v1/businesses/:id/snapshot` is the summary the app builds
its lists from: `company`, `invoices`, `purchases`, `expenses`, `creditNotes`, `quotes`
and `customerTerms`, with the caller's `role` and `user`, and nothing else (no employees,
documents, users or provider data). An accountant who is set to see a shared copy gets
the copy, with `sharedAsOf`.

## Layout

| Path | Purpose |
|---|---|
| `migrations/` | Schema, applied in name order by `src/db.mjs` |
| `src/tokens.mjs` | Access tokens (HMAC, 15 minutes) and refresh token hashing |
| `src/auth.mjs` | Phone codes, sessions, refresh rotation with reuse detection, account deletion |
| `src/totp.mjs` | Base32, HOTP and TOTP (RFC 4648, 4226, 6238) and the otpauth URI, with no dependency |
| `src/second-factor.mjs` | Optional two-step sign-in: enrolment, the sealed authenticator key, recovery codes, the second-step challenge |
| `src/devices.mjs` | The signed-in device list and remote sign-out |
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
MYCA_LISTEN_HOST=127.0.0.1 MYCA_DATABASE_URL=postgres://myca@127.0.0.1:54329/myca_dev MYCA_TOKEN_SECRET=<32+ random characters> MYCA_BOOKS_KEY=<32+ random characters> MYCA_DEV_OTP=1 PORT=8080 npm run dev
```

`MYCA_GOOGLE_CLIENT_IDS` lists the OAuth client ids (comma-separated) whose Google ID
tokens the API accepts; set it to the web client id the app passes as
`MYCA_GOOGLE_SERVER_CLIENT_ID`. `MYCA_OIDC_ISSUER` with `MYCA_OIDC_CLIENT_IDS` turns on
`POST /v1/auth/oidc` for any OpenID Connect issuer (a firm's Keycloak, Azure AD or
Okta): the issuer's keys are found through its discovery document, or at
`MYCA_OIDC_JWKS_URL` when given, and `GET /v1/auth/methods` names the issuer so the app
can show the button. `MYCA_DOCUMENT_BUCKET` names a Cloud Storage bucket; when set,
uploaded document bytes go there under `businesses/<id>/<sha256>` with the Cloud Run
service account's token from the metadata server, and Postgres keeps only the index
row (`location = 'gcs'`). Without it the bytes stay in Postgres, as they do in tests. `MYCA_DEV_OTP=1` prints phone sign-in codes to the
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

## Sign-in, two-step and devices

Sign-in is one step by default: `POST /v1/auth/otp` then `POST /v1/auth/verify`, or
`POST /v1/auth/google` / `POST /v1/auth/oidc` with an ID token, each answering an access
token (15 minutes) and a refresh token (60 days, rotated by `POST /v1/auth/refresh`). A
user can turn on two-step sign-in with an authenticator app from Security in the app:

| Route | What |
|---|---|
| `GET /v1/me/second-step` | `{ enabled, enabledAt, recoveryCodesLeft }` |
| `POST /v1/me/second-step/begin` | starts enrolment: the base32 key, the `otpauth://` uri and the account name, shown once |
| `POST /v1/me/second-step/confirm {code}` | the first code from the app turns two-step on and returns eight recovery codes, shown once; a wrong code answers `INVALID_CODE` with `attemptsRemaining` (4, 3, 2, 1) and the fifth throws the setup away (`ENROLMENT_RESTART`) |
| `POST /v1/me/second-step/disable {code}` | turns it off; an authenticator code or an unused recovery code. A wrong code answers `INVALID_CODE` with `attemptsRemaining`; the code that was just accepted answers `CODE_USED` (one older than that answers `INVALID_CODE`), and both count as a wrong try, as does anything not shaped like a code. Five wrong tries without a right code between them lock the route: every code, a right one too, is then refused with `429 TOO_MANY_ATTEMPTS` until 15 minutes after the fifth. A right code clears the count |
| `POST /v1/me/second-step/recovery-codes {code}` | replaces the recovery codes; the same check, the same `CODE_USED` answer and the same lock as `disable`, and the two routes share one count (`user_totp.attempts` and `failed_at`, migration 017) |
| `POST /v1/auth/second-step {challengeId, code, deviceLabel}` | finishes a sign-in. With two-step on, verify, google and oidc answer `{ secondStep: true, challengeId, expiresInSeconds: 300, user }` and no tokens; this route takes the authenticator code, or a recovery code once, and issues the tokens with `usedRecoveryCode` and `recoveryCodesLeft`. Five minutes and five attempts per challenge (`CODE_EXPIRED`, `TOO_MANY_ATTEMPTS`); a challenge id that is well formed but not on file, because the nightly job has removed it, answers `CODE_EXPIRED` too. A code that was just used answers `CODE_USED` with `attemptsRemaining` and an older one `INVALID_CODE`; a challenge that has already signed in answers `CODE_USED` with no `attemptsRemaining`, which the app reads as the attempt being over. A wrong code here is counted on the challenge and is not added to the count above; a good sign-in clears that count |
| `GET /v1/me/devices` | the devices signed in to the account with a live refresh token, this one first: `{ id, label, signedInOn, lastActive, current }` |
| `POST /v1/me/devices/:id/sign-out` | ends that device at once; `409 CURRENT_DEVICE` for this one, which uses `POST /v1/auth/logout`; `404 DEVICE_NOT_FOUND` for a device that is not the caller's or is already signed out |
| `POST /v1/me/devices/sign-out-others` | ends every other device; `revoked` counts the ones that were listed |

The authenticator key is sealed per user under `MYCA_BOOKS_KEY`, recovery codes are stored
hashed, and neither appears in a response after enrolment or in a log. Deleting the account
removes both, and the nightly job deletes second-step challenges older than a day.

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
- `GET /v1/businesses/:id/export` (owner only) returns everything the service holds about
  the business as one JSON document: the books, every file keyed by sha256, members,
  connections and the audit trail; the download itself is audited. The Windows app can
  restore the `books` and `documents` parts as a backup.
- `POST /v1/businesses/:id/replace` (owner only) replaces the books with a file saved by
  "Download everything" or a backup from the Windows app: the ledger chain and every
  document hash are verified, approvals and pending actions are dropped, the new files
  are stored, and the replacement is audited with the counts before and after. With the
  export this is how a CA firm's Windows app and the hosted books move either way.
- `POST /v1/inbound/email` is for the email relay only (`x-myca-relay-token` must equal
  `MYCA_INBOUND_RELAY_TOKEN`, 32+ characters). With `MYCA_INBOUND_EMAIL_DOMAIN` set,
  every documents key gets an address `<token>@<domain>` shown under Connections; mail to
  it has its attachments (or its text) stored for that business with a reminder. An
  unknown address answers 404 so the relay bounces the mail.

## Security tests

`test/security.test.mjs` is the consolidated check the cloud plan's step C3 asks for: owner-only
routes refuse staff, every business route looks the same to an outsider as a missing one,
malformed and oversize input stops before any engine runs, a connection key is not a user
token and the reverse, old tokens die on sign-out, revocation and account deletion, and
no response carries a secret, a hash or a phone number.

## Real customers, providers in sandbox

Each business switches itself between test and live. The owner saves the business's own
Quicko and NIC keys under Connections (`quicko` and `nic` connectors, sealed per business) and
picks Mode: Test (sandbox) or Live. `MYCA_PROVIDER_ENV` is the service ceiling: a business never
runs above it, and every request outside the e-invoice and GSTIN routes runs with calls off.
Routes: `POST .../einvoice {invoiceId}` (a sandbox IRN lands in `sandboxIrn`, never `irn`),
`POST .../gstin-check {gstin}`, and `GET`/`POST .../approvals` (live writes need an approval
from an owner or the accountant other than the person who asked; test mode needs none).
Filing a return stays a CA's step on the portal by design. `infra/cloud` inputs:

| Input | Sets | Notes |
|---|---|---|
| `provider_mode` | `MYCA_PROVIDER_ENV`, `MYCA_MOCK_MODE` | the ceiling. `test` (default): every business on the Quicko test host and the NIC sandbox IRP. `live`: each business chooses test or live in the app. `simulated`: labelled results, no network. `dry-run`: nothing sent. `gsp_test_api_key` and `gsp_test_api_secret` are a fallback Quicko test key for businesses that have not added their own |
| `google_client_ids`, `oidc_issuer`, `sms_provider` | sign-in | at least one is required or the API will not start |
| `sms_provider`, `sms_secret`, `sms_twilio_sid`, `sms_twilio_from`, `sms_msg91_template_id` | `MYCA_SMS_*` | `sms_secret` is the Twilio auth token or the MSG91 auth key, kept in Secret Manager; MSG91 in India needs a DLT-registered template |
| `model_api_key`, `model_name`, `model_base_url` | `MYCA_MODEL_*` | optional: reading bills and Hindi or Telugu chat; "unset" runs the English rules only |
| `public_url` | `MYCA_PUBLIC_URL` | the https custom domain, used for OAuth redirect URIs |
| `enable_channel_pulls` | `MYCA_ENABLE_CHANNEL_PULLS` | read-only Amazon, Shopify and Razorpay report pulls with each business's own keys |

## Plans and billing

Subscriptions are sold through Google Play Billing in the Android app. Every business gets Pro
free for 14 days from the day it is created, then Free (30 invoices a month, the owner only)
unless it pays for Pro or CA firm. E-invoicing, connectors and inviting people need a paid plan.
Nothing is gated until the Play products are configured.

| Route | Who | What |
|---|---|---|
| `GET /v1/plans` | anyone | plans, the Play product id for each paid plan, fallback prices (`MYCA_PLAN_PRICES`), trial days |
| `GET /v1/businesses/:id/subscription` | members | current plan, trial days left, status, paid-until, Google Play manage link |
| `POST /v1/businesses/:id/subscription {productId, purchaseToken}` | owner | checks the purchase with the Play Developer API, acknowledges it and turns the plan on |
| `POST /v1/billing/play/notify?token=` | Pub/Sub push | Play real-time developer notifications; the token must match `MYCA_PLAY_NOTIFY_TOKEN`. Without that token the route does not exist and the daily job keeps plans current instead |

How it holds together:

- The app buys with the business id as the obfuscated account id. The API refuses a purchase
  whose account id names another business, and a purchase token can pay for one business only.
- Every renewal, cancellation, hold or expiry arrives as a Play notification. The API re-reads
  the purchase from Google rather than trusting the message, so a replayed message changes
  nothing. A purchase the app never reported (the app closed mid-payment) is picked up from the
  notification through its account id.
- Notifications need a Pub/Sub topic, and Pub/Sub needs a Google Cloud project with billing.
  Without them, subscriptions still work: `MYCA_PLAY_PACKAGE` and at least one
  `MYCA_PLAY_PRODUCT_*` turn billing on, and the daily job (`POST /v1/jobs/daily`) re-reads
  from Google every Play subscription that is active, in grace or cancelled and whose paid
  period ends within two days or ended in the last thirty, up to 500 a run. A renewal moves the
  paid-until date forward, an expiry or a hold drops the business to Free, and each change is
  audited as `billing.renewal_check`. The run's answer has `billing: { checked, changed, failed }`;
  a Play outage keeps the stored plan and counts as `failed`, and the next run asks again. A
  renewal is seen up to a day late, inside the three grace days.
- Outside Cloud Run there is no metadata server, so with Play products set the API refuses to
  start until `MYCA_PLAY_SERVICE_ACCOUNT_JSON` holds the Play service account's JSON key.
- A cancelled subscription keeps its plan until the paid period ends; `on_hold` and `paused`
  drop to Free at once; three grace days follow the paid period otherwise.
- Customers cancel or change payment method in Google Play. Switching plans means cancelling
  and subscribing to the other one.
- The API calls Google as its Cloud Run service account through the metadata server, so no key
  file is needed. `MYCA_PLAY_SERVICE_ACCOUNT_JSON` is there for running elsewhere.

First apply of `infra/cloud` (Cloud Run needs an image from the registry the same apply
creates, so it goes in three steps; afterwards `deploy-cloud` rolls out new images and
Terraform leaves the image alone):

```bash
cd infra/cloud
terraform init
terraform apply -target=google_artifact_registry_repository.api -var-file=myca.tfvars
gcloud builds submit ../.. --project "$PROJECT" --config ../../cloud/cloudbuild.yaml
terraform apply -var-file=myca.tfvars \
  -var="image=asia-south1-docker.pkg.dev/$PROJECT/myca-api/myca-api:first" \
  -var="deployer_service_account=<bootstrap deploy_service_account output>"
```

Play setup (after `terraform apply`):

1. Play Console > Monetize > Subscriptions: create three subscriptions, for example
   `myca_essentials`, `myca_pro` and `myca_firm`. Give each a monthly and a yearly
   auto-renewing base plan: Essentials ₹399 a month or ₹3,999 a year, Pro ₹799 or ₹7,999, CA
   firm ₹2,499 or ₹24,999. Set `play_product_essentials`, `play_product_pro` and
   `play_product_firm` to their product ids. There is no free plan: after the 14-day Pro
   trial the books stay readable and exportable, and nothing new is posted until a plan is
   bought.
2. Play Console > Users and permissions: invite the `api_service_account` output with "View
   financial data" and "Manage orders and subscriptions".
3. Play Console > Monetize > Monetization setup: paste the `play_notifications_topic` output as
   the real-time developer notifications topic and send a test notification.
4. Add license testers (Settings > License testing) so test purchases renew every few minutes
   and no money moves. The app shows when a purchase is a test purchase.

The iOS app shows the plan but sells nothing, since Apple only allows its own in-app purchase.
The Windows app shows the plan and says it is bought in the Android app.

## Environment reference

Every variable the hosted server (`cloud/src`, and the `platform/src` engines it runs) reads.
"Secret" means it goes in the secret store (GCP Secret Manager or AWS SSM SecureString), never
in a plain environment variable, a workflow file or an issue. `unset` counts as empty everywhere.
The server logs one `startup: services` line listing which optional services are on, by name only.

| Name | Needed | Default | Secret | What it does |
|---|---|---|---|---|
| `MYCA_DATABASE_URL` | yes | | yes | Postgres connection string. |
| `MYCA_DATABASE_CA` | production, unless a local socket or `sslmode=verify-*` | | no | CA bundle so the database TLS is verified. |
| `MYCA_TOKEN_SECRET` | yes | | yes | HMAC key for access tokens and keyed hashes (32+ chars). |
| `MYCA_BOOKS_KEY` | production | | yes | Seals each business's books column. |
| `MYCA_CONNECTOR_KEY` | for connectors and the GST portal | | yes | Seals per-business provider credentials. |
| `MYCA_JOB_TOKEN` | for scheduled jobs | | yes | Header token for `/v1/jobs/*` (32+ chars). |
| `MYCA_ENVIRONMENT` | recommended | `production` when `K_SERVICE` or `MYCA_PRODUCTION` is set, else `local` | no | `local`, `staging` or `production`. `staging` refuses to start with any live switch or real-send integration set (see `src/environment.mjs`). Shown in `/v1/health`. |
| `MYCA_PRODUCTION` | outside Cloud Run | | no | Marks a non-Cloud-Run host as production. |
| `MYCA_REVISION` / `K_REVISION` | recommended | `dev` | no | Version reported in `/v1/health` and server crash reports. Set from the image tag at deploy. |
| `MYCA_TRUSTED_PROXY_HOPS` | production outside Cloud Run | 1 on Cloud Run, else 0 | no | Proxies in front that append `X-Forwarded-For`; drives per-address limits. |
| `PORT` | no | 8080 | no | Listen port. |
| `MYCA_PUBLIC_URL` | for Gusto | request host | no | Public https origin for OAuth redirects. |
| `MYCA_BODY_BUDGET_BYTES` | no | from memory limit | no | Total bytes of request bodies held at once. |
| `MYCA_GOOGLE_CLIENT_IDS` | for Google sign-in | | no | Comma list of accepted OAuth client ids (web + Android). |
| `MYCA_OIDC_ISSUER`, `MYCA_OIDC_CLIENT_IDS`, `MYCA_OIDC_JWKS_URL` | for OIDC sign-in | | no | A firm's identity provider. |
| `MYCA_SMS_PROVIDER` | for phone sign-in | | no | `twilio`, `msg91` or `whatsapp`. |
| `MYCA_SMS_TWILIO_SID`, `MYCA_SMS_TWILIO_TOKEN`, `MYCA_SMS_TWILIO_FROM` | with twilio | | token yes | Twilio sender. |
| `MYCA_SMS_MSG91_AUTHKEY`, `MYCA_SMS_MSG91_TEMPLATE_ID` | with msg91 | | authkey yes | MSG91 sender. |
| `MYCA_OTP_GLOBAL_PER_HOUR` | no | 500 | no | Cap on sign-in codes sent per hour across everyone; logs `alarm: otp-global-cap-80` at 80% and `otp-global-cap` when reached. |
| `MYCA_TEST_PHONES`, `MYCA_TEST_CODE` | staging only | | code yes | Test numbers that sign in with a fixed six-digit code and no SMS. Refused in production. |
| `MYCA_REVIEWER_SIGN_IN`, `MYCA_REVIEWER_PHONE`, `MYCA_REVIEWER_CODE` | for the Play reviewer | off | code yes | One reviewer number with a fixed code. Every business it creates is a demo business, it cannot accept invitations, and each code request is logged. Turn it off by setting `MYCA_REVIEWER_SIGN_IN` to `off`. |
| `MYCA_DEV_OTP` | local only | | no | Prints codes to the log; refused in production. |
| `MYCA_ADMIN_USER_IDS` | for the crash digest | | no | Comma list of user ids that may read `GET /v1/admin/crashes?days=N`. |
| `MYCA_PROVIDER_ENV` | no | `off` | no | Provider environment for the engines. Staging allows only `off` or `sandbox`. |
| `MYCA_MOCK_MODE` | staging | | no | `1` makes every provider simulated (`providerMode: simulated`). |
| `MYCA_ENABLE_LIVE_CALLS` | never on hosted today | off | no | The live switch for government, model and write actions. |
| `MYCA_ENABLE_CHANNEL_PULLS` | no | off | no | Lets the nightly job pull read-only marketplace reports. |
| `MYCA_GSP_ENV`, `MYCA_GSP_BASE_URL` | for the GST portal | | no | GSP host selection. |
| `MYCA_GSP_API_KEY`, `MYCA_GSP_API_SECRET`, `MYCA_GSP_TEST_API_KEY`, `MYCA_GSP_TEST_API_SECRET`, `MYCA_GSP_LIVE_API_KEY`, `MYCA_GSP_LIVE_API_SECRET` | for the GST portal | | yes | GSP (Quicko / Sandbox) keys. The live pair is refused in staging. |
| `MYCA_MODEL_API_KEY`, `MYCA_MODEL`, `MYCA_MODEL_BASE_URL` | for the chat model | built-in patterns | key yes | Model used by the chat router (`platform/src/model-adapter.mjs`). This, not `NVIDIA_NIM_API_KEY`, is what the chat reads. |
| `NVIDIA_NIM_API_KEY` / `NIM_API_KEY`, `NVIDIA_NIM_BASE_URL`, `NVIDIA_NIM_MODEL` | no | | key yes | Only the NIM tool (`nim-client.mjs`), not the chat router. |
| `MYCA_WHATSAPP_PROVIDER` | no | `waha` when `MYCA_WAHA_URL` is set, else `meta` | no | WhatsApp route. |
| `MYCA_WAHA_URL`, `MYCA_WAHA_API_KEY`, `MYCA_WAHA_SESSION`, `MYCA_WAHA_WEBHOOK_SECRET` | for WAHA | | key and secret yes | Self-hosted WhatsApp gateway. The URL must be https outside local development. |
| `MYCA_WHATSAPP_VERIFY_TOKEN`, `MYCA_WHATSAPP_APP_SECRET`, `MYCA_WHATSAPP_PHONE_NUMBER_ID`, `MYCA_WHATSAPP_ACCESS_TOKEN` | for Meta WhatsApp | | all but the number id | Meta Cloud API. |
| `MYCA_EMAIL_RELAY_URL`, `MYCA_EMAIL_RELAY_TOKEN`, `MYCA_EMAIL_FROM` | for outgoing email | | token yes | Email relay Worker. Must be https outside local development. |
| `MYCA_INBOUND_EMAIL_DOMAIN`, `MYCA_INBOUND_RELAY_TOKEN` | for bills by email | | token yes | Inbound email relay. |
| `MYCA_PLAY_PACKAGE`, `MYCA_PLAY_PRODUCT_ESSENTIALS`, `MYCA_PLAY_PRODUCT_PRO`, `MYCA_PLAY_PRODUCT_FIRM` | for Play billing | | no | Turns subscriptions on. |
| `MYCA_PLAY_PACKAGE_US` | for US filing fees | `MYCA_PLAY_PACKAGE` | no | Package name of the separate MyCA US app (`com.mldynamic.myca.us`); US payments are checked against it. |
| `MYCA_STRIPE_SECRET_KEY` | for card checkout | unset | yes | Stripe secret key of the US company. With the three settings below it, US returns ($39) and MyCA Plus ($79 a year) are paid by card instead of Google Play (Play exempts tax filing from Play Billing). |
| `MYCA_STRIPE_WEBHOOK_SECRET` | for card checkout | unset | yes | Signing secret of the Stripe webhook pointed at `POST /v1/billing/stripe/webhook` (events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`). |
| `MYCA_US_CHECKOUT_RETURN_URL` | for card checkout | unset | no | https page Stripe returns to; it should open the MyCA US app. |
| `MYCA_STRIPE_PRICE_US_PLUS` | for MyCA Plus | unset | no | Stripe price id of the yearly Plus subscription. |
| `MYCA_US_PLUS_PRICE_USD` | no | `79` | no | Price shown for MyCA Plus. |
| `MYCA_US_EXPERT_REVIEW` | no | `0` | no | `1` offers Expert Review ($129, `MYCA_US_EXPERT_REVIEW_PRICE_USD`). Keep it off until a US CPA or EA partner is signed. |
| `MYCA_PLAY_PRODUCT_US_1040` | for US filing fees | | no | A one-time (consumable) Play product. When set, filing a US return (`file_us_return`) needs that tax year paid; preparing stays free. |
| `MYCA_US_RETURN_PRICE_USD` | | `39` | no | The US filing fee shown before the Play Store price loads. |
| `MYCA_PLAY_SERVICE_ACCOUNT_JSON` | Play billing outside Cloud Run | metadata server on Cloud Run | yes | Play Developer API access. Refused in staging. |
| `MYCA_PLAY_PUSH_AUDIENCE`, `MYCA_PLAY_PUSH_SERVICE_ACCOUNT` | for Play notifications | | no | Pub/Sub push with OIDC authentication: the audience set on the push subscription and the service account it signs as. Preferred. |
| `MYCA_PLAY_NOTIFY_TOKEN` | alternative to push auth | | yes | Shared token, sent only in the `x-myca-notify-token` header. A `?token=` in the URL is refused so it never reaches access logs. |
| `MYCA_PLAN_PRICES` | no | built-in prices | no | Display prices, e.g. `essentials=399,pro=799,firm=2499`. |
| `MYCA_DOCUMENT_BUCKET` | no | documents in Postgres | no | Cloud Storage bucket for document bytes (GCS only). |
| `MYCA_TALLY_HOST`, `MYCA_TALLY_PORT`, `MYCA_LISTEN_HOST`, `MYCA_API_TOKEN`, `MYCA_TOKEN_IN_PAGE`, `MYCA_REQUIRE_SAFE_STORAGE` | desktop only | | | Read by the Windows app's local server, not the hosted API. |

## Not built yet

- The Google Cloud project itself, and the first `terraform apply` of `infra/cloud`.
- A WhatsApp number on the gateway. Two routes are built (`src/whatsapp.mjs`, `src/waha.mjs`), picked by `MYCA_WHATSAPP_PROVIDER` (`waha` when `MYCA_WAHA_URL` is set, else `meta`):
  - WAHA, a self-hosted WhatsApp HTTP API on an ordinary WhatsApp number (unofficial: WhatsApp may ban a number it sees as automated, so use a number you can lose). `POST /v1/whatsapp/waha` takes WAHA's `message` events, checks the `X-Webhook-Hmac` sha512 signature with `MYCA_WAHA_WEBHOOK_SECRET` (Terraform generates it, output `waha_webhook_secret`), ignores own messages, groups, channels and media, looks up senders known only by a privacy id, and replies through `POST {MYCA_WAHA_URL}/api/sendText` with `MYCA_WAHA_API_KEY` and session `MYCA_WAHA_SESSION` (default `default`). Without the secret the route answers 404. `MYCA_SMS_PROVIDER=whatsapp` sends sign-in codes through the same gateway.
  - The Meta Cloud API: the webhook (`GET`/`POST /v1/whatsapp/webhook`) verifies with `MYCA_WHATSAPP_VERIFY_TOKEN`, checks the `X-Hub-Signature-256` with `MYCA_WHATSAPP_APP_SECRET` and replies through `MYCA_WHATSAPP_PHONE_NUMBER_ID` and `MYCA_WHATSAPP_ACCESS_TOKEN`. Without those four the route answers 404.
  Both map the sender's number to a member and run the same chat as the app (preview, then "yes"); a member of several businesses is asked which and "use 2" is remembered. WhatsApp chat is a Pro and CA firm feature when Play billing is on.
- An SMS provider account: the Twilio, MSG91 and WhatsApp-gateway senders exist (`src/sms-sender.mjs`, chosen by `MYCA_SMS_PROVIDER`: `twilio`, `msg91` or `whatsapp`); without one Google Sign-In is the only sign-in.
- Telling an invited person. An invitation is only visible to them after they sign in
  with that number; no SMS is sent because there is no sender yet.
- Per-business government credentials, so e-invoice and filing actions cannot be proposed. Channel credentials (Amazon, Shopify, Razorpay, Zoho, and for a US business Plaid, TaxJar, Gusto and Track1099) are per business: `GET`/`POST /v1/businesses/:id/connectors` list and save them (owner only), sealed with AES-256-GCM under a key derived per business from `MYCA_CONNECTOR_KEY`, and secrets are never returned. `POST .../plaid-link-token` and `.../plaid-exchange` run Plaid Link from the app, `POST .../gusto-connect` returns the Gusto consent link whose state names the business and `GET /v1/oauth/gusto/callback` (no token; the state is checked once) finishes it on the API host (`MYCA_PUBLIC_URL`, else the request host, forms the redirect URI), and `POST .../taxjar-rate` records a sales tax rate in that business's books (2026-10-22). `POST .../connector-sync` and the nightly job pull reports through the action gate only when `MYCA_ENABLE_CHANNEL_PULLS=1` (Terraform `enable_channel_pulls`, off by default): that switch opens read-only channel pulls alone; government, model and write actions stay behind `MYCA_ENABLE_LIVE_CALLS`, which the hosted API still refuses.
- The app has no OIDC sign-in screen yet: `POST /v1/auth/oidc` is served, but the Android app only offers phone and Google until a firm names its issuer.
- Each business holds one pending preview. Two members previewing at once replace each
  other's preview; nothing wrong is posted, but one of them has to start again.
- Reads are audited but no longer rewrite the books row (\`withReadOnlyBooks\`, 2026-10-14).
- Document bytes go to Cloud Storage once `MYCA_DOCUMENT_BUCKET` is set (Terraform
  creates the bucket and sets it); until the project exists they are in Postgres.
  Uploads are still sent in the request body, up to 8 MB; larger files need
  direct-to-storage uploads.
- A business may hold 200 MB of documents in total (\`MAX_BUSINESS_BYTES\`); beyond that an upload answers 413 STORAGE_FULL.

`MYCA_BOOKS_KEY` seals every business's books row (AES-256-GCM, a key derived per business) and every user's authenticator key (`user_totp`, a key derived per user). It is optional locally and required on Cloud Run; Terraform generates it into Secret Manager. Rotating it means re-sealing every row of both, so keep it where the database password is kept.
