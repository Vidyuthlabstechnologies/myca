# Owner's checklist: everything MyCA still needs from you

Prepared 14 October 2026. The code is built; what is left is accounts, keys, decisions
and a few things only a person can read. Each item says what to do, where it goes, and
what it switches on. Items are grouped by what they unlock, cheapest first. Do not paste
any secret into chat or into the repository; secrets go into GitHub Secrets, the Cloud
Run environment or `platform/.env` only.

## A. Decisions (no cost, each unblocks a line of work)

| Decision | Options | Where the answer goes |
|---|---|---|
| Language model provider and region (ADR-0004) | Claude via the Anthropic API (built); an Indian region or none. Chat text and bill images leave India if the provider is abroad; the DPDP assessment calls this a transfer | `MYCA_MODEL_API_KEY`, `MYCA_MODEL` on Cloud Run and in `platform/.env`; name the provider in the privacy policy |
| SMS provider for phone sign-in | Twilio or MSG91 (both built); or Google Sign-In only | `MYCA_SMS_PROVIDER` and its keys on Cloud Run |
| Hosted redundancy | Keep the cheap defaults, or set `sql_availability_type = REGIONAL` and `min_instances = 2` (about twice the database cost plus one warm instance) | `infra/cloud` variables |
| Legal entity for the Play listing and privacy policy | The publishing company, its registered address, support email, grievance officer | `docs/release/PRIVACY-POLICY.md` and `deploy/public/privacy.html`; the Play Console |
| The six US-edition questions in the spec (section 9) | Seller of record, who enters rates, due dates for states beyond TX and CA, withholding from W-4 or owner-entered, state payroll, pricing | `docs/superpowers/specs/2026-10-13-us-edition-design.md` |
| Whether MyCA is a product for CA firms as well as owners | Decides how much more work the firm-side screens get | Roadmap |

## B. Accounts to create (cost noted)

| Account | Cost | What to do | What it switches on |
|---|---|---|---|
| Google Cloud project for the hosted service (`vidyuthlabs` project exists for the site) | Cloud Run and a small Cloud SQL: roughly $40 to $70 a month at the cheap defaults | Enable billing; run `infra/bootstrap` once (DEPLOYMENT.md Phase 0, about ten minutes in Cloud Shell); set the GitHub variables in Phase 1; apply `infra/cloud` by hand once | The Android app's hosted mode, sign-in, backups, the daily job, alerts, automatic deploys |
| Google Play developer account | one-time registration fee | Register the company; complete identity verification | Internal testing, then closed testing (Play requires 14 days with at least 12 testers for a new account), then production |
| Anthropic API key (if Claude is chosen) | pay per use | Create the key in the console with a spend limit | Model-routed chat and bill reading |
| Twilio or MSG91 account (if phone sign-in is wanted) | pay per SMS | Twilio: account SID, auth token, a sending number. MSG91: auth key and an approved OTP template | Phone-number sign-in |
| A US CPA (if the US edition ships) | per engagement | Attest the `us.federal.*` and `us.salestax.*` rules and answer the section-9 questions | The "not reviewed" note on every US figure |

## C. Keys and secrets to place (never in chat, never in the repo)

| Secret | Where | Used for |
|---|---|---|
| Android upload keystore: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | GitHub → Settings → Secrets | Signed APK and app bundle on every `v*` tag; without them the build is debug-signed and cannot go to Play |
| Windows code-signing certificate: `CSC_LINK`, `CSC_KEY_PASSWORD` (optional) | GitHub Secrets | Signed installers |
| `MYCA_MODEL_API_KEY` | Cloud Run env (Secret Manager) and `platform/.env` on your machine | The model |
| Email relay: `INBOUND_RELAY_TOKEN` (the `inbound_relay_token` output of `infra/cloud`) and `vars.MYCA_API_URL`; Email Routing catch-all on the `inbound_email_domain` sent to the Worker | `wrangler secret put` in `email-relay/`; Cloudflare dashboard | Per-business forwarding addresses for bills |
| SMS provider keys | Cloud Run env | Sign-in codes |
| GSP, NIC and TRACES credentials | Come from the CA firm (their request document, section 3), entered on the Integrations screen into the app's vault; `MYCA_ENABLE_LIVE_CALLS` stays off until the firm signs off the sandbox run | Live filing |
| Google Sign-In client ids | `google_client_ids` Terraform variable and the app's `--dart-define` | Sign-in with Google |

## D. GitHub variables to set (DEPLOYMENT.md Phase 1)

After `infra/bootstrap`: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`,
`GCP_DEPLOY_SA`, `GCP_WIF_PLAN_PROVIDER`, `GCP_PLAN_SA`, `GCP_TF_STATE_BUCKET`, the three
bucket names, `GCP_URL_MAP`, `GCP_DOMAIN`, `GCP_MANAGE_DNS`, `GCP_CREATE_ARTIFACT_REGISTRY`,
`GCP_ALERT_EMAIL`. After `infra/cloud` is applied: `GCP_API_REGION` (turns on automatic
API deploys) and `MYCA_CLOUD_URL` (puts the hosted address into Android release builds).

## E. Things only a person can read or do

| Item | What to do | Why |
|---|---|---|
| Run the Android app on a real phone once | Install the APK from the next tagged build; go through the checklist in `docs/release/PLAY-LISTING.md` section 5; try the notification and the bill photo | The release build and the notifications have only run in CI, never on hardware |
| The 2027 Social Security wage base | When the SSA announces it (October 2026), send the figure and the announcement link to engineering, or add the record yourself under `sprints/statutory-rules/src/rules/us-federal.mjs` | The current record ends 31 December 2026; the nightly check will keep opening an issue until it is added |
| The 2027 gazetted holiday calendar | Ask the CA (it is on their list) or send the DoPT memorandum | Same nightly issue |
| Answer the nightly issue when it appears | Actions → Nightly checks; the issue "Nightly checks need attention" closes itself once green | The only alarm that fires without a cloud project |
| Screenshots and the feature graphic for the listing | Pixel-size screenshots of Home, a thread with a preview, Taxes, the GST review, Payroll; a 1024×500 graphic | Play listing |
| Publish the privacy policy at a public URL | Once the entity details are filled in: merge, and the site deploy puts `privacy.html` live when the GCP variables exist; or host it anywhere and paste the URL into the Play Console | Play requires the URL |
| Free disk space on the development machine | The C: drive was down to 250 MB during testing; Flutter cannot compile tests under about 2 GB free | Local test runs |

## F. What happens by itself once the above is in place

- Every push and PR runs all four suites; nightly, every suite plus the rules watch.
- A `v*` tag builds and signs the Windows installers and the Android APK and bundle, attaches them to a GitHub release and updates the download aliases.
- A merge to `main` deploys the hosted API to Cloud Run with a live health check.
- The daily job runs at 02:30 IST for every business; the desktop runs the same checks on launch.
- Cloud SQL backs itself up nightly with seven days of point-in-time recovery; the desktop keeps fourteen daily verified copies and restores itself from them.
- Dependabot opens grouped update PRs weekly.

## G. Order I would do it in

1. Decisions A (one sitting).
2. Play developer account and the upload keystore (the 14-day testing clock starts only after a build is uploaded).
3. Google Cloud: bootstrap, variables, `infra/cloud` apply; then `GCP_API_REGION` and `MYCA_CLOUD_URL`.
4. Model key and SMS provider if chosen.
5. Device run; screenshots; privacy policy URL; internal testing track.
6. The government credentials arrive from the CA firm, last, because live filing stays behind the approval gate regardless.
