# MyCA — GCP Deployment Runbook

Automated deployment for the **marketing site** and **Windows installers**.
Everything after the one-time bootstrap is triggered by `git push`.

## Architecture

```
GitHub (varshinicb1/myca)
  │
  ├─ push to deploy/public/** ──► Actions: deploy-site ──► GCS bucket ──► Cloud CDN
  │                                                                      └─► Global HTTPS LB ──► myca.in (+ www)
  ├─ tag vX.Y.Z ───────────────► Actions: build-windows ──► NSIS/portable .exe
  │                                                          ├─► GitHub Release (download)
  │                                                          └─► GCS artifacts bucket
  ├─ push to infra/** ─────────► Actions: terraform plan/apply ──► GCP infra
  └─ every push/PR ────────────► Actions: CI (platform + sprint tests)

Auth: no service-account keys. GitHub OIDC ──► Workload Identity Federation ──► gh-deployer SA
Region: asia-south1 (Mumbai). Static origin bucket: ASIA multi-region.
```

**Roles:** Akhil = GCP owner (runs the bootstrap once). Everyone else = normal GitHub
contributors (push code, open PRs). Nobody needs GCP console access afterwards.

---

## Phase 0 — Akhil runs this once (≈10 minutes, Cloud Shell)

Prereqs Akhil already has as owner: a GCP **project** with **billing enabled**.

Open <https://console.cloud.google.com/cloudshell> (Terraform & gcloud are preinstalled),
then:

```bash
# 1. configure
gcloud config set project YOUR_PROJECT_ID

# 2. get the repo (or upload the infra/ folder) — replace with the real repo URL
git clone https://github.com/varshinicb1/myca.git
cd myca/infra/bootstrap

# 3. one-time apply: enables APIs, state bucket, GitHub OIDC, deployer SA
terraform init
terraform apply \
  -var="project_id=YOUR_PROJECT_ID" \
  -var="github_repository=varshinicb1/myca"
```

Terraform prints the values you need next:

```
tf_state_bucket             = "YOUR_PROJECT_ID-myca-tfstate"
workload_identity_provider  = "projects/123456789/locations/global/workloadIdentityPools/github/providers/github"
deploy_service_account      = "gh-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

> If you want to restrict deploys to `main` only, add
> `-var="github_branch_restriction=refs/heads/main"`.

That's Akhil's entire involvement. Nothing else in the GCP console is required.

---

## Phase 1 — one-time GitHub setup (repo owner)

**Repo → Settings → Secrets and variables → Actions → Variables** (not Secrets — no keys):

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `YOUR_PROJECT_ID` |
| `GCP_WIF_PROVIDER` | the `workload_identity_provider` output |
| `GCP_DEPLOY_SA` | the `deploy_service_account` output |
| `GCP_TF_STATE_BUCKET` | the `tf_state_bucket` output |

The `deploy-site` and `terraform` jobs use the **`production`** GitHub Environment. Create it
under Settings → Environments (optionally add required reviewers to gate infra changes).

Then create the infrastructure (first run of the root module) — either locally:

```bash
cd infra
terraform init -backend-config="bucket=YOUR_PROJECT_ID-myca-tfstate"
terraform apply -var="project_id=YOUR_PROJECT_ID" -var="domain_name=myca.in"
```

…or just push a change under `infra/` and let the **Terraform** workflow apply it.

If you used a domain, copy the `dns_nameservers` output to your registrar's NS records, then
wait for the managed certificate to go `ACTIVE` (up to ~30 min).

Root-module outputs become GitHub variables for the deploy workflow:

| Variable | Value |
|---|---|
| `GCP_SITE_BUCKET` | `YOUR_PROJECT_ID-myca-site` |
| `GCP_ARTIFACTS_BUCKET` | `YOUR_PROJECT_ID-myca-artifacts` |
| `GCP_DOWNLOADS_BUCKET` | `YOUR_PROJECT_ID-myca-downloads` |
| `GCP_URL_MAP` | `myca-site-lb-urlmap` |
| `GCP_DOMAIN` | `myca.in` (or empty) |

---

## Phase 2 — day-to-day (no GCP access, no Akhil)

| I want to… | Do this |
|---|---|
| Update the marketing site | Edit `deploy/public/**`, commit, push to `main` → auto-deploys + CDN purge |
| Ship a Windows build | `git tag v0.2.0 && git push origin v0.2.0` → installer attached to a Release **and** published to `/downloads/myca-setup.exe` |
| Test a Windows build (no release) | Actions → **Build Windows installer** → *Run workflow* → download the artifact |
| Change cloud infra | Edit `infra/**`, open a PR (plan shown), merge to `main` (applied) |
| Verify code | Every push runs **CI** (platform 76 + sprint suites) |

### Download links (stable)

The site's **Download for Windows** button points at these CDN-backed paths, which always
serve the newest tagged build:

- `https://<domain>/downloads/myca-setup.exe` — NSIS installer
- `https://<domain>/downloads/myca-portable.exe` — portable executable

---

## Hardening

### 1. Custom domain + managed TLS (activate)

1. Akhil (or the domain owner) points the domain's NS records at the `dns_nameservers`
   output, **or** sets an `A` record to the `load_balancer_ip` output and `manage_dns = false`.
2. Set repo variable `GCP_DOMAIN`, then push a trivial change under `infra/` (or run
   `terraform apply` locally). The managed cert is created automatically.
3. Wait for the certificate to become `ACTIVE` (up to ~30 min), then confirm:

   ```bash
   gcloud compute ssl-certificates describe myca-site-lb-cert --global \
     --format="get(managed.status)"
   ```

   Requests to port 80 are 301-redirected to HTTPS; HTTP/3 is enabled.

### 2. Code signing the installer (optional)

Today the `.exe` is unsigned → users see a SmartScreen prompt. To sign, add two repo
**secrets** (Settings → Secrets and variables → Actions → Secrets) — no workflow change needed:

| Secret | Value |
|---|---|
| `CSC_LINK` | base64 of your `.pfx` (or a `data:` URL / file URL) |
| `CSC_KEY_PASSWORD` | the `.pfx` password |

`electron-builder` picks these up automatically on the next tagged build.

### 3. Protect `main` (requires GitHub Pro on a private repo)

Branch protection is **not available for private repos on the free plan** (the API returns
HTTP 403: *"Upgrade to GitHub Pro or make this repository public"*). Two options:

- **Recommended:** upgrade the org/account to **GitHub Pro** (~$4/user/month), then run one command:

  ```bash
  gh api --method PUT repos/varshinicb1/myca/branches/main/protection \
    --input .github/branch-protection.json -H "Accept: application/vnd.github+json"
  ```

- Or make the repo public (only if you intend to open-source it).

The config in `.github/branch-protection.json` requires PRs, the two CI checks
(`Platform tests`, `Sprint engine tests`), linear history, and blocks force-pushes/deletions.
It deliberately keeps `enforce_admins: false` so the owner has an emergency bypass.

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
cd infra && terraform destroy -var="project_id=YOUR_PROJECT_ID" -var="domain_name=myca.in"
cd bootstrap && terraform destroy -var="project_id=YOUR_PROJECT_ID" -var="github_repository=varshinicb1/myca"
```

(The state bucket has `force_destroy = false`; delete it manually if you truly want it gone.)

---

## Out of scope (next milestones)

- **Firm backend** (PRD REQ-CA-001…015): Cloud Run + Cloud SQL + GCS document vault. The
  Artifact Registry repo (`myca`) is already provisioned for its images.
- **Local-first secrets vault** (Windows DPAPI) for GSP/NIC credentials.
- The Cloudflare config in `deploy/wrangler.jsonc` is retained but unused; GCS + CDN replaces it.
