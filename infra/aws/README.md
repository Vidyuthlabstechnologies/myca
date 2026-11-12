# MyCA API on AWS (Mumbai), retired

**Not production.** Production moved to Google Cloud on 2026-11-10 (`infra/cloud`, see
`DEPLOYMENT.md` "Google Cloud production"). This folder is kept only so the old AWS stack can
be read and torn down. It describes App Runner, which is not what ran there last (ECS Express,
set up by hand), so **never run `terraform apply` here**: it would rewrite the old role trust and
SSM values. `deploy-aws.yml` is manual-only for the same reason. Delete this folder and that
workflow once the AWS account is shut down.

The original notes follow.

## What it creates

| Piece | What | Why |
|---|---|---|
| App Runner service `myca-api` | The API container, 0.25 vCPU and 0.5 GB, one warm instance, at most two | HTTPS address with no load balancer to pay for |
| ECR repository `myca-api` | Immutable image tags, scan on push, keeps 15 | Where the image is pushed |
| RDS PostgreSQL 16 `myca-api` | db.t4g.micro, 20 GB gp3 growing to 100 GB, encrypted, private, TLS forced, 7 days of backups, deletion protection | The books |
| VPC with two public and two private subnets | The database and the API's outbound traffic stay inside | |
| NAT instance (t4g.nano, Amazon Linux 2023) | Outbound internet for the API: Google sign-in keys, Play, SMS, the model | A NAT gateway costs about $33 a month before traffic; this costs a few dollars. EC2 recovers it automatically on a host failure |
| SSM Parameter Store `/myca/api/*` | The database URL, the RDS CA bundle and the generated keys, as SecureStrings | Read only by the API's instance role |
| EventBridge rules and API destinations | `POST /v1/jobs/daily` at 02:30 IST and `/v1/jobs/weekly` on Monday at 07:00 IST with the job token header | The daily checks, reminders and the 30-day erasure of deleted accounts |
| Budget, SNS and alarms (when `alert_email` is set) | 80% of the monthly budget spent, 100% forecast; database storage and CPU; NAT instance status | |

The service runs with `MYCA_PRODUCTION=1`: dev sign-in codes are refused, the books key is
required, one proxy hop is trusted, and the server will not start unless the database is
reached over TLS that verifies the server (`MYCA_DATABASE_CA`).

## Cost (rough, ap-south-1, light pilot traffic)

| Item | About |
|---|---|
| RDS db.t4g.micro + 20 GB gp3 + backups | $16–19 |
| App Runner, one warm 0.25 vCPU / 0.5 GB instance, light use | $5–10 |
| NAT instance t4g.nano + 8 GB disk + public IPv4 | $7–8 |
| Parameter Store, ECR, EventBridge, CloudWatch logs | $1–3 |
| **Total** | **$30–40 a month** |

Check against the AWS pricing pages before relying on it; data transfer out is extra.

## Sign-in

Production needs a real sign-in method. Either:

- **Google Sign-In** (recommended): in Firebase for `myca-prod-app`, enable Authentication →
  Google, add the SHA-1 of the upload key and of Play's app-signing key to the Android app,
  then set `google_client_ids` to the web client id and build the app with
  `--dart-define=MYCA_GOOGLE_SERVER_CLIENT_ID=<the same id>`; or
- **A closed pilot**: `pilot_sign_in_codes_in_logs = true`. Sign-in codes are written to the
  App Runner application log instead of being sent, so only someone who can read the AWS logs
  can let a person in. The production switch is off in this mode. Do not open the app to the
  public like this.

With neither set, `terraform plan` stops: the API refuses to start when it has no sign-in
method, and App Runner would otherwise fail health checks for ten minutes before giving up.
App Runner sets `PORT` itself (it is a reserved name), so the service does not set it.

## GST portal (Sandbox by Quicko)

MyCA files GST returns as an ASP through Sandbox by Quicko. Put the key pair from the Sandbox
dashboard in `terraform.tfvars`, never in GitHub:

```hcl
gsp_api_key     = "key_test_..."
gsp_api_secret  = "secret_test_..."
gsp_environment = "test"
```

Both go to Parameter Store as SecureStrings. `provider_mode` caps it: `test` (the default)
only reaches `test-api.sandbox.co.in`. Each business connects its own GSTIN in the app with the
portal OTP; that session lasts 6 hours, and an hourly EventBridge job refreshes it before it
lapses, for as long as the business keeps API access enabled on gst.gov.in (up to 30 days).
Switch to a `key_live_` pair, `gsp_environment = "live"` and `provider_mode = "live"` only
after Quicko approves the ASP onboarding.

## First deploy (three steps)

Sign in as a non-root user first (`aws configure sso`, profile `myca`), then:

```bash
cd infra/aws
terraform init -backend-config="path=D:/keys/myca/aws-state/terraform.tfstate"
terraform apply -var="alert_email=you@example.com"
```

The first apply creates everything except the service (no image yet). Then build and push:

```bash
aws ecr get-login-password --profile myca --region ap-south-1 | docker login --username AWS --password-stdin <image_repository host>
docker build -f cloud/Dockerfile -t <image_repository>:<git sha> .
docker push <image_repository>:<git sha>
```

and apply again with the image:

```bash
terraform apply -var="alert_email=you@example.com" -var="image=<image_repository>:<git sha>"
```

`api_url` is the address for `MYCA_CLOUD_URL`. Check `<api_url>/v1/health`.

## Later deploys

Push a new tag and apply with the new `image`. To tear down a test stack, set
`deletion_protection = false`, apply, then destroy; a final snapshot is kept.

## Keep the state safe

The Terraform state holds the database password and every generated key. It lives in
`D:/keys/myca/aws-state/`, which should stay locked to the owner's Windows account and be
backed up somewhere safe.
