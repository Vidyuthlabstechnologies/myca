# Sandbox now, live later: keys and the go-live switch

MyCA runs every outside service in **one provider mode** for the whole server. The mode is set by
`MYCA_PROVIDER_ENV` (Terraform `provider_mode`):

| Mode | What happens | Banner in the app |
|---|---|---|
| `test` | Real calls, but only to each provider's sandbox (Quicko test host, NIC sandbox IRP, Stripe test mode, Plaid sandbox, Gusto demo). Anything without a sandbox is held as a dry run. | Production server: "Sandbox mode: nothing is filed with the government yet". Staging: "Test environment: nothing is filed, paid or sent" |
| `live` | Real filings, real payments, real messages. Live writes still need a second person's approval. | None |
| `simulated` | No network; labelled simulated answers (`MYCA_MOCK_MODE=1`). | Same as test |
| `off` | Nothing leaves the server; every outside action is kept as a dry run. | Same as test |

Production runs in `test` today. Going live is changing that one value, after the live keys are
in their slots.

## The key layout: one TEST slot and one LIVE slot

Every key that is different in sandbox and production has two names. The API copies the slot of
the active mode into the name the code reads and **removes the other slot from the running
process**, so a sandbox server never holds a live key in memory.

| Integration | TEST slot (fill now) | LIVE slot (fill before go-live) | Terraform variables |
|---|---|---|---|
| Sandbox by Quicko (GST, e-invoice incl. RCM self-invoices, e-way bill, income tax) | `MYCA_GSP_TEST_API_KEY`, `MYCA_GSP_TEST_API_SECRET` | `MYCA_GSP_LIVE_API_KEY`, `MYCA_GSP_LIVE_API_SECRET` | `gsp_test_api_key/secret`, `gsp_live_api_key/secret` |
| Stripe (US card checkout) | `MYCA_STRIPE_TEST_SECRET_KEY`, `MYCA_STRIPE_TEST_WEBHOOK_SECRET`, `MYCA_STRIPE_TEST_PRICE_US_PLUS` | `MYCA_STRIPE_LIVE_SECRET_KEY`, `MYCA_STRIPE_LIVE_WEBHOOK_SECRET`, `MYCA_STRIPE_LIVE_PRICE_US_PLUS` | `stripe_test_*`, `stripe_live_*` |
| US e-file partner (Column Tax or April) | `MYCA_US_FILER_TEST_BASE_URL`, `MYCA_US_FILER_TEST_API_KEY`, `MYCA_US_FILER_TEST_WEBHOOK_SECRET` | `MYCA_US_FILER_LIVE_*` (same three) | added with the partner contract (PR #279) |

The old single names (`MYCA_GSP_API_KEY`, `MYCA_STRIPE_SECRET_KEY`, ...) still work, but the API
checks their prefix against the mode.

Keys that are the same in both modes: the AI model key (`MYCA_MODEL_API_KEY` or
`NVIDIA_NIM_API_KEY`), WAHA (`MYCA_WAHA_URL`, `MYCA_WAHA_API_KEY`), SMS, the email relay and the
Play service account. In sandbox mode WhatsApp and email still answer people who write in, but
reminders and invoices from the outbox go out only in live mode.

Keys each business enters in the app (under Connections), not on the server: its NIC e-invoice /
e-way bill API user, its own Quicko key if it has one, Plaid, Gusto, Pinwheel and TaxJar. While
the server is not live, these always reach the provider's sandbox even if a business picked
"production". After go-live, each business's NIC connection stays on test until the business
switches it to production in the app.

Google Play billing has no sandbox key: license testers buy with test cards and their purchases
are stored with `testPurchase = true`. RevenueCat is not used; Play is verified directly.

## What stops the API from starting

The API refuses to start, and Cloud Run keeps the previous revision serving, when:

- a TEST slot holds a live key (`key_live_`, `sk_live_`, `rk_live_`) or a LIVE slot holds a test key;
- a plain name holds a live key while the mode is not live, or a test key while live;
- a LIVE slot is set on a staging or local server;
- a key is there without its partner: a Quicko key without its secret, Stripe without its webhook
  secret, the e-file partner address without its key or webhook secret;
- `MYCA_GSP_ENV` contradicts the mode (Terraform now sets it from `provider_mode`);
- the mode is live for India without the live Quicko key and secret.

The startup log line `"startup":"services"` lists which slots were used and each integration's
status, never a key's value.

## Check keys before they go anywhere

```
node scripts/check-keys.mjs prod.env          # would the API start with these settings?
node scripts/check-keys.mjs prod.env --live   # and would it start if I switched to live now?
```

`prod.env` is a plain `NAME=value` file; it never leaves your machine and nothing is printed but
names and statuses.

## Sandbox smoke test

```
node scripts/sandbox-smoke.mjs
```

One real call to each sandbox: Quicko sign-in and GSTIN search; an IRN for an RCM self-invoice on
the NIC sandbox through Quicko; Stripe test balance; a Plaid sandbox bank and its transactions;
Gusto demo; TaxJar sandbox; the WAHA session; the AI model; the e-file partner's sandbox address.
It refuses to run if any key looks live and refuses any request to a production host. A check
without keys says "skipped", never "passed".

**Every night on the server.** While `provider_mode` is `test`, Cloud Scheduler calls
`POST /v1/jobs/sandbox-smoke` at 03:15 (job token only). The API runs the same checks with the
keys it already holds (Quicko, Stripe test, WAHA, the model) and writes one log line,
`"job":"sandbox-smoke"`, with each check's result. It does nothing while live. Keys stay in
Secret Manager; nothing is copied to GitHub.

**On a PC**, for the checks the server cannot do alone, export these test keys in the shell first
(never commit them):

| Name | What |
|---|---|
| `MYCA_GSP_TEST_API_KEY`, `MYCA_GSP_TEST_API_SECRET` | Quicko test key pair |
| `MYCA_SMOKE_IRP_USER`, `MYCA_SMOKE_IRP_PASSWORD`, `MYCA_SMOKE_IRP_GSTIN` | The sandbox IRP API user Quicko gives with the test key |
| `MYCA_STRIPE_TEST_SECRET_KEY` | Stripe test mode |
| `MYCA_SMOKE_PLAID_CLIENT_ID`, `MYCA_SMOKE_PLAID_SECRET` | Plaid sandbox keys |
| `MYCA_SMOKE_GUSTO_ACCESS_TOKEN` | A Gusto demo company token |
| `MYCA_SMOKE_TAXJAR_TOKEN` | TaxJar sandbox token |
| `MYCA_WAHA_URL`, `MYCA_WAHA_API_KEY` | WAHA |
| `NVIDIA_NIM_API_KEY` (or `MYCA_MODEL_API_KEY`) | The model key |
| `MYCA_US_FILER_TEST_BASE_URL`, `MYCA_US_FILER_TEST_API_KEY` | The e-file partner sandbox |

Every push also runs the smoke checks against fake sandboxes (`cloud/test/sandbox-smoke.test.mjs`),
so a change that breaks a check's request is caught before it reaches the server.

## Go-live checklist

Do these in order. Nothing here is undone by going live; rolling back is step 7.

1. **Get the live keys.** Quicko live key pair (after the GSP onboarding), Stripe live keys of the
   US company with a live webhook pointed at `/v1/billing/stripe/webhook`, the e-file partner's
   production key, Play products created and active.
2. **Put them in the LIVE slots** where you keep the production Terraform variables
   (`gsp_live_api_key`, `gsp_live_api_secret`, `stripe_live_secret_key`, `stripe_live_webhook_secret`,
   `stripe_live_price_us_plus`). Terraform refuses a test key in a live variable. Apply: the API
   keeps running in sandbox and the live keys stay out of the process.
3. **Check:** `node scripts/check-keys.mjs prod.env --live` says OK for "after switching to live".
4. **Read last night's smoke result** (Cloud Logging, `jsonPayload.job="sandbox-smoke"`) and run
   `node scripts/sandbox-smoke.mjs` on the PC; every check you rely on must say passed.
5. **Switch:** set `provider_mode = "live"` and apply. That is the only change.
6. **Verify within ten minutes:**
   - `GET /v1/health/live` answers `"providerMode":"live"`;
   - the app no longer shows the sandbox banner (pull to refresh or reopen);
   - a GSTIN search in the app answers from the live portal;
   - one real e-invoice for your own company (then cancel it inside 24 hours if it was only a test);
   - a Stripe payment of the smallest price with a real card, then refund it;
   - the startup log shows `quicko: ready` and the live slots in `keySlots`.
7. **Roll back** if anything is wrong: set `provider_mode = "test"` and apply. The live keys stay
   in their slots, unused, and the banner comes back.
8. Tell each business that its NIC connection can now be switched to production in the app.
