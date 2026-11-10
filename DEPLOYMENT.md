# MyCA — GCP Deployment Runbook

Automated deployment for the **marketing site** and **Windows installers**.
Everything after the one-time bootstrap is triggered by `git push`.

## Architecture

```
GitHub (Vidyuthlabstechnologies/myca, moved from varshinicb1/myca on 2026-10-13; the old URL redirects)
  │
  ├─ push to main, deploy/public/** ──► deploy-site ──► GCS site bucket ──► Cloud CDN
  │                                                                       └─► Global HTTPS LB ──► myca.in (+ www)
  ├─ tag vX.Y.Z ──► build-windows
  │                   ├─ build   (windows, contents: read, no cloud identity)
  │                   │    npm ci + electron-builder ──► NSIS + portable .exe + SHA256SUMS (workflow artifact)
  │                   └─ publish (ubuntu, the only job with contents: write + id-token: write)
  │                        verify SHA256SUMS ──► GitHub Release (.exe + SHA256SUMS)
  │                        ──► gs://<artifacts>/releases/vX.Y.Z/
  │                        ──► gs://<downloads>/downloads/{myca-setup.exe, myca-portable.exe, SHA256SUMS}
  │                            (always the highest archived version) ──► CDN purge of /downloads/*
  ├─ PR touching infra/** ─────────► terraform: check (fmt + validate) + read-only plan
  ├─ push to main, infra/** ───────► terraform: check + apply
  └─ every push/PR ────────────────► CI (platform suite + every sprint suite)

Auth: no service-account keys. GitHub OIDC ──► Workload Identity Federation:
  pool "myca-github"      (repository_id + refs/heads/main or refs/tags/v*) ──► gh-deployer SA
  pool "myca-github-plan" (repository_id + pull_request events)             ──► gh-planner SA (read-only)
Region: asia-south1 (Mumbai). Static origin bucket: ASIA multi-region.
```

**Roles:** Akhil = GCP owner (runs the bootstrap once). Everyone else = normal GitHub
contributors (push code, open PRs). Nobody needs GCP console access afterwards.

### What each CI identity can do

| Identity | Used by | Can |
|---|---|---|
| `gh-deployer` | `deploy-cloud`; with `manage_site` also `terraform` apply, `deploy-site`, `build-windows` publish | Always: push to the `myca-api` registry, `run.developer` on the `myca-api` service and actAs on its service account only (granted by `infra/cloud` through `deployer_service_account`). Only with `manage_site = true`: manage compute/LB, DNS, monitoring and Artifact Registry; create buckets; administer only the site, artifacts and downloads buckets (IAM conditions per bucket name). Reads and writes only the `root/` prefix of the state bucket. It holds no project-wide `iam.serviceAccountUser`, `run.admin`, `secretmanager.admin` or `storage.admin`. |
| `gh-planner` | `terraform` plan on pull requests | Read-only roles (`browser`, `compute.viewer`, `dns.reader`, `monitoring.viewer`, `artifactregistry.reader`, `storage.bucketViewer`, `iam.securityReviewer`) and read the `root/` prefix of the state bucket. It gets no basic `roles/viewer`, which would also let it read every object in every bucket. It cannot take the state lock, so PR plans run with `-lock=false` and never block an apply. |

Tokens are accepted only from the repository with the configured numeric ID. The deploy pool
also requires `refs/heads/main` or a `refs/tags/v*` ref; the plan pool requires a
`pull_request` event. Pull requests from forks get no OIDC token at all.

---

## Phase 0 — Akhil runs this once (≈10 minutes, Cloud Shell)

Prereqs Akhil already has as owner: a GCP **project** with **billing enabled**.

Open <https://console.cloud.google.com/cloudshell> (Terraform & gcloud are preinstalled),
then:

```bash
# 1. configure
gcloud config set project YOUR_PROJECT_ID

# 2. get the repo (or upload the infra/ folder) — replace with the real repo URL
git clone https://github.com/Vidyuthlabstechnologies/myca.git
cd myca/infra/bootstrap

# 3. the repository's numeric ID (survives renames; a deleted repo's name cannot hijack it)
gh api repos/Vidyuthlabstechnologies/myca --jq .id     # or ask the repo owner for it

# 4. one-time apply: APIs, state bucket, both WIF pools, deployer + planner SAs
terraform init
terraform apply \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="github_repository_id=REPO_NUMERIC_ID"
```

**Sharing a project with another app.** Every name the bootstrap and `infra/cloud` create starts
with `myca` (pools, service accounts, secrets, the SQL instance, the log bucket), the project's
`_Default` log bucket is left alone, and the API's `cloudsql.client` is limited to the `myca`
instance. The marketing site (root module: load balancer, DNS, site buckets, uptime checks) is
off unless you pass `-var="manage_site=true"` to the bootstrap and set the GitHub variable
`MYCA_MANAGE_SITE=true`; until then the `terraform`, `deploy-site` and Windows publish jobs skip,
and `gh-deployer` holds no project-wide network, DNS, monitoring or registry admin.

If you will override any bucket name in the root module (`site_bucket_name`,
`artifacts_bucket_name`, `downloads_bucket_name`), pass the same names to the bootstrap:
the deployer's storage access is granted per bucket name.

Terraform prints the values you need next:

```
tf_state_bucket                  = "YOUR_PROJECT_ID-myca-tfstate"
workload_identity_provider       = "projects/123456789/locations/global/workloadIdentityPools/myca-github/providers/myca-github"
deploy_service_account           = "gh-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com"
plan_workload_identity_provider  = "projects/123456789/locations/global/workloadIdentityPools/myca-github-plan/providers/myca-github-plan"
plan_service_account             = "gh-planner@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

**Bootstrap state** stays in `infra/bootstrap/terraform.tfstate` on the machine that ran it.
Keep it (Cloud Shell's home directory persists). To move it into the state bucket, follow
the note in `infra/bootstrap/versions.tf`: it uses the `bootstrap` prefix, separate from the
root module's `root` prefix, so CI can never read, overwrite or destroy it.

That's Akhil's entire involvement. Nothing else in the GCP console is required.

---

## Phase 1 — one-time GitHub setup (repo owner)

**Repo → Settings → Secrets and variables → Actions → Variables** (not Secrets — no keys).
Every Terraform input comes from these variables (as `TF_VAR_*`), so CI is the single
source of truth: a value set only on someone's laptop is reverted by the next CI apply.

| Variable | Value | Used as |
|---|---|---|
| `GCP_PROJECT_ID` | `YOUR_PROJECT_ID` | `project_id` (required) |
| `GCP_REGION` | `asia-south1` | `region` (required) |
| `GCP_WIF_PROVIDER` | the `workload_identity_provider` output | deploy auth |
| `GCP_DEPLOY_SA` | the `deploy_service_account` output | deploy auth |
| `GCP_WIF_PLAN_PROVIDER` | the `plan_workload_identity_provider` output | PR plan auth |
| `GCP_PLAN_SA` | the `plan_service_account` output | PR plan auth |
| `GCP_TF_STATE_BUCKET` | the `tf_state_bucket` output | state backend |
| `GCP_SITE_BUCKET` | `YOUR_PROJECT_ID-myca-site` | `site_bucket_name`, site deploys |
| `GCP_ARTIFACTS_BUCKET` | `YOUR_PROJECT_ID-myca-artifacts` | `artifacts_bucket_name`, release archive |
| `GCP_DOWNLOADS_BUCKET` | `YOUR_PROJECT_ID-myca-downloads` | `downloads_bucket_name`, download aliases |
| `GCP_URL_MAP` | `myca-site-lb-urlmap` | CDN purges |
| `GCP_DOMAIN` | `myca.in` (or empty to serve on the LB IP) | `domain_name` |
| `GCP_MANAGE_DNS` | `true` or `false` | `manage_dns` (required) |
| `GCP_CREATE_ARTIFACT_REGISTRY` | `true` or `false` | `create_artifact_registry` (required) |
| `GCP_ALERT_EMAIL` | an address, or empty to skip alerting | `alert_email` |
| `GCP_API_REGION` | the region `infra/cloud` was applied in, or empty until it is | hosted API deploys (`deploy-cloud`) |
| `MYCA_MANAGE_SITE` | `true` to run the root module (site, LB, DNS), empty to leave it off | `terraform`, `deploy-site`, Windows publish |
| `MYCA_CLOUD_URL` | the `api_url` output of `infra/cloud`, or empty for a local-mode app; a `v*` tag build refuses anything but an https address | Android release builds (`build-android`) |
| `MYCA_GOOGLE_SERVER_CLIENT_ID` | the web OAuth client id the hosted API accepts for Google sign-in, or empty | Android release builds (`build-android`) |
| `MYCA_OIDC_CLIENT_ID` | the client id of a firm's own OpenID Connect provider, or empty | Android release builds (`build-android`) |
| `MYCA_CI_RUNNER` | the runner label for CI and the Android build, `self-hosted` to use your own runner; empty means `ubuntu-latest` | CI (`ci`), Android builds (`build-android`) |

`GCP_MANAGE_DNS` and `GCP_CREATE_ARTIFACT_REGISTRY` must be `true` or `false`: an empty
value fails the plan instead of silently falling back to a default. `GCP_PROJECT_ID` and
`GCP_REGION` are validated as non-empty for the same reason.

The `deploy-site` workflow and the Terraform **apply** job use the **`production`** GitHub
Environment. Create it under Settings → Environments. The PR **plan** job deliberately has
no environment. Required reviewers on an environment are not available for private repos on
the free plan (see Hardening §3).

Then create the infrastructure (first run of the root module) — either push a change under
`infra/` to `main` and let the **Terraform** workflow apply it, or run it locally with the
same values as the GitHub variables:

```bash
cd infra
terraform init -backend-config="bucket=YOUR_PROJECT_ID-myca-tfstate"   # state goes under root/
terraform apply -lock-timeout=10m \
  -var="project_id=YOUR_PROJECT_ID" -var="region=asia-south1" \
  -var="domain_name=myca.in" -var="manage_dns=true" \
  -var="create_artifact_registry=true" -var="alert_email="
```

If you used a domain, copy the `dns_nameservers` output to your registrar's NS records, then
wait for the managed certificate to go `ACTIVE` (up to ~30 min).

---

## Google Cloud production (2026-11-10, replaces AWS)

The hosted API runs on Cloud Run in Mumbai again, in project `myca-prod-in` (billing account with the
Google Cloud credit). AWS ECS keeps serving the v1.0.0 app until a build pointing at Cloud Run is out;
after that, the AWS stack can be torn down. GCP started with an empty database (owner decision): no
data or keys were copied from AWS.

| Piece | Where |
|---|---|
| API | Cloud Run `myca-api`, https://myca-api-tvfsqs2oha-el.a.run.app (health: `/v1/health`) |
| Database | Cloud SQL Postgres 16 `myca` (db-g1-small, zonal, daily backups x14, PITR 7 days) |
| Secrets | Secret Manager, one secret per env var (`myca-books-key`, ...), generated by `infra/cloud` |
| Jobs | Cloud Scheduler `myca-api-daily` (21:00 IST) and `myca-api-weekly` |
| Alerts | Uptime check plus down/5xx/latency alerts to the owner's email |
| Site | Cloud Run `myca-site` (nginx, `deploy/site`), https://myca-site-tvfsqs2oha-el.a.run.app (`/privacy`, `/delete-account`), deployed by `deploy-site` |
| Terraform state | `gs://myca-prod-in-myca-tfstate` (`bootstrap/`, `cloud/`) |

Non-secret settings are in `infra/cloud/production.tfvars`. Optional keys (model, WAHA, SMS, email relay,
Quicko, Play) go in as `TF_VAR_*` or `-var`, never in that file. Apply from `infra/cloud`:

```bash
terraform init -backend-config="bucket=myca-prod-in-myca-tfstate"
terraform plan -out=plan -var-file=production.tfvars -var image=<current image> \
  -var alert_email=<owner email> -var deployer_service_account=gh-deployer@myca-prod-in.iam.gserviceaccount.com
terraform apply plan
```

GitHub repository **variables** for `deploy-cloud` (API on every push to main) and `deploy-site`:

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `myca-prod-in` |
| `GCP_API_REGION` | `asia-south1` |
| `GCP_WIF_PROVIDER` | `projects/541813254937/locations/global/workloadIdentityPools/myca-github/providers/myca-github` |
| `GCP_DEPLOY_SA` | `gh-deployer@myca-prod-in.iam.gserviceaccount.com` |
| `MYCA_CLOUD_URL` | `https://myca-api-tvfsqs2oha-el.a.run.app` (Android builds) |

No GitHub **secrets** are needed for Google Cloud or Android: CI signs in with Workload Identity
Federation. The Android upload key lives in Secret Manager as four secrets that Terraform creates empty
(`myca-android-keystore-base64`, `myca-android-keystore-password`, `myca-android-key-alias`,
`myca-android-key-password`); add each value once in the console (Secret Manager > secret > New version).
Only `gh-deployer` can read them, and only from `main` or `v*` tags. Play uploads use a short-lived token
for `gh-deployer`, so invite `gh-deployer@myca-prod-in.iam.gserviceaccount.com` in Play Console > Users and
permissions with release rights instead of creating a key; `PLAY_SERVICE_ACCOUNT_JSON` is no longer read.

Leave `MYCA_MANAGE_SITE` unset: the root module's load balancer is not used. The AWS deploy is now the
manual `deploy-aws` workflow.

## AWS hosted API and Play releases (previous production, 2026-11-09)

The hosted API runs on AWS ECS in Mumbai (`ap-south-1`); the GCP runbook above is kept for
the site and for reference. Keys never go in chat, in the repo or in plain workflow
variables. Each one lives in exactly one place:

| Key | Lives in | Read by |
|---|---|---|
| Server secrets (token, books and connector keys, database URL, job token) | AWS SSM SecureString under `/myca/api/*`, generated by Terraform | the ECS task |
| Quicko (Sandbox) API key and secret, test pair now and live pair for production | AWS SSM `/myca/api/MYCA_GSP_API_KEY` and `/myca/api/MYCA_GSP_API_SECRET` (Terraform `gsp_api_key`, `gsp_api_secret`, `gsp_environment`) | the ECS task |
| Play service account JSON for the server (subscription checks) | AWS SSM `/myca/api/MYCA_PLAY_SERVICE_ACCOUNT_JSON` | the ECS task |
| Play uploads | no key: a short-lived token for `gh-deployer` (invite it in Play Console) | `build-android` `play` job |
| Android upload keystore and its passwords | Secret Manager in `myca-prod-in`: `myca-android-keystore-base64`, `myca-android-keystore-password`, `myca-android-key-alias`, `myca-android-key-password`; the original file stays offline at `D:\keys\myca` | `build-android` |
| AWS access for deploys | no stored key: GitHub OIDC assumes the role in `AWS_DEPLOY_ROLE_ARN` | `deploy-cloud` |
| Terraform state (holds every generated secret) | `D:\keys\myca\aws-state\terraform.tfstate` on the owner's PC | `deploy-aws.ps1` |

GitHub variables (Settings → Secrets and variables → Actions → Variables) for the AWS deploy
and the Play upload:

| Variable | Value | Used by |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | the IAM role GitHub assumes; empty keeps `deploy-cloud` off | `deploy-cloud` |
| `AWS_REGION` | `ap-south-1` (default) | `deploy-cloud` |
| `AWS_ECR_REPOSITORY` | `myca-api` (default) | `deploy-cloud` |
| `AWS_ECS_CLUSTER` | the ECS cluster of the Express service (`default` if unset) | `deploy-cloud` |
| `AWS_ECS_SERVICE` | the ECS service name; empty keeps `deploy-cloud` off | `deploy-cloud` |
| `MYCA_API_URL` | the public https address, checked at `/v1/health` after a rollout | `deploy-cloud` |
| `PLAY_TRACK` | `internal`, `alpha` (closed testing), `beta` or `production`; empty keeps uploads off | `build-android` `play` job |
| `PLAY_PACKAGE` | `com.mldynamic.myca` (default) | `build-android` `play` job |
| `PLAY_RELEASE_STATUS` | `draft` (default; you press release in Play Console) or `completed` | `build-android` `play` job |

The deploy role trusts `token.actions.githubusercontent.com` for
`repo:Vidyuthlabstechnologies/myca:environment:production` only, and may push to the
`myca-api` ECR repository, call `ecs:DescribeServices`, `ecs:DescribeTaskDefinition`,
`ecs:RegisterTaskDefinition`, `ecs:UpdateService`, and pass the task's execution and task
roles (`iam:PassRole` on those two ARNs only). Both workflows run on GitHub Actions minutes:
`deploy-cloud` on each merge to `main` that touches the server, `play` on each `v*` tag.

### Optional services on AWS (2026-11-10)

`infra/aws` takes these as variables; an empty one leaves that service off and creates no
secret for it. Secrets land in SSM under `/myca/api/*`.

| Service | Terraform variables | What it turns on |
|---|---|---|
| WhatsApp through a WAHA gateway | `waha_url`, `waha_api_key`, `waha_session` | Chat on WhatsApp. Point WAHA's webhook at `<api>/v1/whatsapp/waha` with HMAC sha512 and the `waha_webhook_secret` output as its key, events `message` only |
| Sign-in codes | `sms_provider` (`whatsapp`, `twilio` or `msg91`), `sms_twilio_sid`, `sms_twilio_from`, `sms_twilio_token`, `sms_msg91_template_id`, `sms_msg91_authkey` | Phone sign-in beside Google. `whatsapp` needs `waha_url` |
| The AI model | `model_api_key`, `model_name` | The assistant answers in its own words instead of the built-in patterns |
| Email | `email_relay_url`, `email_from`, `email_relay_token` | Invoice and reminder emails through the relay in `email-relay/` |
| Channel pulls | `channel_pulls` (default `true`) | Nightly read-only pulls from Amazon, Shopify and Razorpay for businesses that saved their keys |
| Play subscriptions | `play_product_essentials`, `play_product_pro`, `play_product_firm`, `play_service_account_json` | Paid plans; there is no free plan, so set these before the trial of the first users ends |

The live ECS Express service was made outside Terraform, so until it is imported these
values also have to be set on the service's task definition by hand.

## Phase 2 — day-to-day (no GCP access, no Akhil)

| I want to… | Do this |
|---|---|
| Update the marketing site | Edit `deploy/public/**`, commit, push to `main` → syncs the bucket + purges the CDN |
| Ship a Windows build | `git tag v0.2.0 && git push origin v0.2.0` → GitHub Release with the installers and `SHA256SUMS`, archived to the artifacts bucket, and `/downloads/*` updated |
| Test a Windows build (no release) | Actions → **Build Windows installer** → *Run workflow* → download the `myca-windows` artifact (the publish job does not run) |
| Change cloud infra | Edit `infra/**`, open a PR (fmt/validate + read-only plan shown), merge to `main` (applied). `infra/cloud` is validated too but applied by hand, because it creates billable Cloud SQL and Cloud Run resources |
| Ship an Android build | The same `v*` tag runs **Build Android app**: APK and app bundle with sums attached to the release, signed with the upload key when the `ANDROID_*` secrets exist |
| Ship the hosted API | Merge to `main` touching `cloud/`, `platform/src/` or `sprints/` → **Deploy hosted API**: suite, image, Cloud Run roll-out, live health check. Skips until `GCP_API_REGION` is set |
| Verify code | Every push and PR runs **CI**: all four suites. **Nightly checks** rerun the Node suites against today's clock, run `scripts/rules-watch.mjs`, and open or close the issue "Nightly checks need attention" (`docs/operations/RUNBOOK.md`) |

### How a release is published

1. **build** (Windows, `contents: read`, no cloud identity) runs `npm ci` and
   `electron-builder`, checks Authenticode signatures when signing is configured, writes
   `SHA256SUMS` (`platform/scripts/sha256sums.mjs`) and uploads everything as a workflow artifact.
2. **publish** (Ubuntu, tag pushes only) is the only job holding `contents: write` and
   `id-token: write`, and it runs no package scripts. It:
   - rejects a tag that does not match `^v[0-9.]+$` (the tag reaches scripts only through `env`);
   - checks `sha256sum -c SHA256SUMS` and that the file covers every installer;
   - creates the GitHub Release with the installers and `SHA256SUMS`;
   - archives them to `gs://<artifacts>/releases/vX.Y.Z/`;
   - finds the **highest** archived version (`sort -V`), verifies its `SHA256SUMS`, and copies
     it to `gs://<downloads>/downloads/myca-setup.exe`, `myca-portable.exe` and `SHA256SUMS`
     (`Cache-Control: max-age=300`), so re-running an old tag never rolls the download back;
   - purges `/downloads/*` from Cloud CDN.

Publishes share the `release-publish` concurrency group and run one at a time. GitHub keeps
only the newest *pending* run in a group: if you push several tags within a minute or two,
re-run any publish that shows as cancelled. The download aliases still end at the highest
version.

### Download links (stable)

The site's **Download for Windows** button points at these CDN-backed paths, which always
serve the highest released version:

- `https://<domain>/downloads/myca-setup.exe` — NSIS installer
- `https://<domain>/downloads/myca-portable.exe` — portable executable
- `https://<domain>/downloads/SHA256SUMS` — checksums of the two files above

Check a download with `sha256sum -c SHA256SUMS --ignore-missing` (Linux/macOS) or compare
`Get-FileHash .\myca-setup.exe` (PowerShell) with the matching line. The GitHub Release carries
a `SHA256SUMS` for the versioned file names.

The buckets grant anonymous users `roles/storage.legacyObjectReader` (read an object by name,
no listing). Overwritten or deleted site files are kept as noncurrent versions for 7 days
(rollback window) and release archives for 30 days, then deleted.

---

## Hardening

### 1. Custom domain + managed TLS (activate)

1. Akhil (or the domain owner) points the domain's NS records at the `dns_nameservers`
   output, **or** sets an `A` record to the `load_balancer_ip` output and `GCP_MANAGE_DNS=false`.
2. Set repo variable `GCP_DOMAIN`, then push a trivial change under `infra/` (or run
   `terraform apply` locally with the same values). The managed cert is created automatically.
3. Wait for the certificate to become `ACTIVE` (up to ~30 min), then confirm:

   ```bash
   cd infra
   gcloud compute ssl-certificates describe "$(terraform output -raw ssl_certificate_name)" \
     --global --format="get(managed.status)"
   ```

   Requests to port 80 are 301-redirected to HTTPS; HTTP/3 is enabled.

The certificate name ends in a hash of its domain list. Changing the domains creates the new
certificate before the old one is destroyed, and HTTPS serves the new one once it is `ACTIVE`.
The uptime check probes port 443 with TLS and certificate validation, so it (and the alert, if
`GCP_ALERT_EMAIL` is set) reports failures until the certificate is `ACTIVE`.

### 2. Code signing the installer (optional)

Today the `.exe` is unsigned → users see a SmartScreen prompt. To sign, add two repo
**secrets** (Settings → Secrets and variables → Actions → Secrets) — no workflow change needed:

| Secret | Value |
|---|---|
| `CSC_LINK` | base64 of your `.pfx` (or a `data:` URL / file URL) |
| Quiet updates (no variable) | the installed app installs an update by itself only when the installer's Authenticode signature is valid, its certificate thumbprint is in `TRUSTED_SIGNER.thumbprints` in `platform/desktop/update-install.cjs`, and the subject CN equals `TRUSTED_SIGNER.commonName`. The list is empty until the certificate exists: add the thumbprint (and the exact CN) in that file and ship a signed build; the pin lives in the signed app, not in a setting, so nothing on GitHub or the machine can widen it |
| `CSC_KEY_PASSWORD` | the `.pfx` password |
| `APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD` | the Apple Distribution certificate with its key as a base64 `.p12`, and its password; without them the iOS build is unsigned |
| `APPLE_PROVISIONING_PROFILE_BASE64`, `APPLE_PROFILE_NAME`, `APPLE_TEAM_ID` | the App Store provisioning profile for `com.mldynamic.myca` (base64), its name, and the team id |
| `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_BASE64` | an App Store Connect API key (App Manager) and its `.p8`; with them the signed IPA is uploaded to TestFlight |

`electron-builder` signs whenever `CSC_LINK` is set (there is no `signExecutable` switch in
`platform/package.json`). When the secret is present the build job also checks every `.exe`
with `Get-AuthenticodeSignature` and fails unless the status is `Valid`.

### 3. Protect `main` and release tags (requires GitHub Pro on a private repo)

Branch protection, tag rulesets and required reviewers on environments are **not available
for private repos on the free plan** (the API returns HTTP 403: *"Upgrade to GitHub Pro or
make this repository public"*). Until then, anyone with write access can push to `main` or
push a `v*` tag, and either one obtains a `gh-deployer` token. Two options:

- **Recommended:** upgrade the org/account to **GitHub Pro** (~$4/user/month), then:

  ```bash
  gh api --method PUT repos/Vidyuthlabstechnologies/myca/branches/main/protection \
    --input .github/branch-protection.json -H "Accept: application/vnd.github+json"
  ```

  and add a tag ruleset limiting who can create `v*` tags, plus required reviewers on the
  `production` environment.

- Or make the repo public (only if you intend to open-source it).

The config in `.github/branch-protection.json` requires PRs, the two CI checks
(`Platform tests`, `Sprint engine tests`), linear history, and blocks force-pushes/deletions.
It deliberately keeps `enforce_admins: false` so the owner has an emergency bypass.

### 4. Supply chain

- Every action in `.github/workflows/` is pinned to a full commit SHA with its release
  noted beside it; `.github/dependabot.yml` proposes updates weekly.
- `infra/.terraform.lock.hcl` and `infra/bootstrap/.terraform.lock.hcl` pin the Google
  provider version and checksums; CI runs `terraform init -lockfile=readonly`. After changing
  a provider version, refresh them with
  `terraform providers lock -platform=linux_amd64 -platform=windows_amd64 -platform=darwin_arm64`
  in each module and commit the result.
- `platform/test/release-pipeline.test.mjs` checks these invariants (tag handling, job
  permissions, SHA pins, checksums, signing, aliases, WIF and IAM scope, state prefixes,
  Terraform inputs, and this document's variable list) on every CI run.

### 5. Email relay (Cloudflare Worker)

`email-relay/` is deployed separately with Wrangler (see `email-relay/README.md`). It refuses
every send until `ALLOWED_FROM_DOMAIN` is set in `email-relay/wrangler.jsonc`, accepts at most
10 recipients per request, and returns `{ ok, id, messageId }`.

The same Worker receives mail for the per-business forwarding addresses: Email Routing on
`inbound_email_domain` sends a catch-all to the Worker, which posts attachments to
`/v1/inbound/email` with the `inbound_relay_token` output of `infra/cloud` (set it with
`wrangler secret put INBOUND_RELAY_TOKEN`, and `vars.MYCA_API_URL` to the API URL).

---

## Costs (asia-south1, low traffic)

| Item | Approx. |
|---|---|
| Global HTTPS LB + forwarding rules | ~$18–20 / month (fixed) |
| GCS site + artifacts | < $1 / month |
| Cloud CDN egress | cents at low traffic |
| Cloud DNS zone | ~$0.20 / month |
| Monitoring uptime check | free tier |

To cut the LB cost while traffic is low, you can serve the site from **Cloud Run** or
**Firebase Hosting** instead; the bucket + CDN + LB is the highest-performance option.

---

## Teardown

```bash
cd infra && terraform destroy -var="project_id=YOUR_PROJECT_ID" -var="region=asia-south1" \
  -var="domain_name=myca.in" -var="manage_dns=true" -var="create_artifact_registry=true" -var="alert_email="
cd bootstrap && terraform destroy -var="project_id=YOUR_PROJECT_ID" -var="github_repository_id=REPO_NUMERIC_ID"
```

(The state bucket has `force_destroy = false`; delete it manually if you truly want it gone.)

---

## Out of scope (next milestones)

- **Firm backend** (PRD REQ-CA-001…015): Cloud Run + Cloud SQL + GCS document vault. The
  Artifact Registry repo (`myca`) is already provisioned for its images. The deployer no
  longer holds `run.admin`, `secretmanager.admin` or `iam.serviceAccountUser`; grant narrowly
  scoped roles when that work starts.
- **Local-first secrets vault** (Windows DPAPI) for GSP/NIC credentials.
- The Cloudflare config in `deploy/wrangler.jsonc` is retained but unused; GCS + CDN replaces it.
