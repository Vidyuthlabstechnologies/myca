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
| `POST /v1/me/second-step/confirm {code}` | the first code from the app turns two-step on and returns eight recovery codes, shown once; five wrong codes throw the setup away (`ENROLMENT_RESTART`) |
| `POST /v1/me/second-step/disable {code}` | turns it off; an authenticator code or an unused recovery code |
| `POST /v1/me/second-step/recovery-codes {code}` | replaces the recovery codes |
| `POST /v1/auth/second-step {challengeId, code, deviceLabel}` | finishes a sign-in. With two-step on, verify, google and oidc answer `{ secondStep: true, challengeId, expiresInSeconds: 300, user }` and no tokens; this route takes the authenticator code, or a recovery code once, and issues the tokens with `usedRecoveryCode` and `recoveryCodesLeft`. Five minutes and five attempts per challenge (`CODE_EXPIRED`, `TOO_MANY_ATTEMPTS`); a code that was used, or an older one, is refused |
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
| `POST /v1/billing/play/notify?token=` | Pub/Sub push | Play real-time developer notifications; the token must match `MYCA_PLAY_NOTIFY_TOKEN` |

How it holds together:

- The app buys with the business id as the obfuscated account id. The API refuses a purchase
  whose account id names another business, and a purchase token can pay for one business only.
- Every renewal, cancellation, hold or expiry arrives as a Play notification. The API re-reads
  the purchase from Google rather than trusting the message, so a replayed message changes
  nothing. A purchase the app never reported (the app closed mid-payment) is picked up from the
  notification through its account id.
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

1. Play Console > Monetize > Subscriptions: create two subscriptions, for example
   `myca_pro_monthly` and `myca_firm_monthly`, each with a monthly auto-renewing base plan and
   a price. Set `play_product_pro` and `play_product_firm` to their product ids.
2. Play Console > Users and permissions: invite the `api_service_account` output with "View
   financial data" and "Manage orders and subscriptions".
3. Play Console > Monetize > Monetization setup: paste the `play_notifications_topic` output as
   the real-time developer notifications topic and send a test notification.
4. Add license testers (Settings > License testing) so test purchases renew every few minutes
   and no money moves. The app shows when a purchase is a test purchase.

The iOS app shows the plan but sells nothing, since Apple only allows its own in-app purchase.
The Windows app shows the plan and says it is bought in the Android app.

## Not built yet

- The Google Cloud project itself, and the first `terraform apply` of `infra/cloud`.
- A WhatsApp Business account on the Meta Cloud API: the webhook (`GET`/`POST /v1/whatsapp/webhook`, `src/whatsapp.mjs`) verifies with `MYCA_WHATSAPP_VERIFY_TOKEN`, checks the `X-Hub-Signature-256` with `MYCA_WHATSAPP_APP_SECRET`, maps the sender's number to a member and runs the same chat as the app (preview, then "yes"), replying through `MYCA_WHATSAPP_PHONE_NUMBER_ID` and `MYCA_WHATSAPP_ACCESS_TOKEN`. Without those four the route answers 404. A member of several businesses is asked which and "use 2" is remembered.
- An SMS provider account: the Twilio and MSG91 senders exist (`src/sms-sender.mjs`, chosen by `MYCA_SMS_PROVIDER`, Terraform `sms_provider` and `sms_secret`); without one Google Sign-In is the only sign-in.
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
