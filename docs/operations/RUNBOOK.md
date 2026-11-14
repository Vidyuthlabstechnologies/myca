# MyCA operations runbook

What runs on its own, what it does when something is wrong, and what a person still
has to do. Everything here was added on 2026-10-14; the pieces that need a Google
Cloud project are written and validated but not yet applied (see the last section).

## 1. What runs automatically

| Where | When | What | Where to look |
|---|---|---|---|
| Desktop app (`platform/src/server.mjs`) | On every launch, then every hour | The daily checks for the open books: a reminder for every filing, estimated tax instalment or payroll approval due in the next fourteen days (never twice for the same one), the ledger chain verified, the dated statutory rules checked for gaps and records ending within ninety days. A second run on the same day does nothing. | Chat: "did the daily checks run?"; `GET /api/health` |
| Desktop app (`platform/src/store-ports.mjs`) | Every save of the books | One copy of `state.json` per day in `backups/` beside it, with a `.sha256`, fourteen days kept. Saves are fsync'd and the rename retries through a Windows file lock. | `GET /api/health` → `backups` |
| Desktop app | On launch, if `state.json` cannot be parsed | The newest backup whose checksum matches is restored; the corrupt file is kept as `state.json.corrupt-<time>`. | `GET /api/health` → `recovered` |
| Hosted API (`cloud/src/jobs.mjs`) | Cloud Scheduler, 02:30 IST daily (`daily_job_schedule`) | `POST /v1/jobs/daily` runs the same daily checks for every business, one transaction each, audited as `tool.run_automation`. Retried three times by the scheduler. | Cloud Logging: `job: "daily"` |
| Hosted API (`cloud/src/jobs.mjs`) | Inside the daily job | `purge`: erases businesses deleted more than thirty days ago (documents, audit trail, access log, members, books, then the row), access-log rows older than a year, crash reports older than ninety days, sign-in codes older than a day. `docs/operations/RETENTION.md`. | Cloud Logging: `job: "purge"` |
| Hosted API (`cloud/src/jobs.mjs`) | Cloud Scheduler, Monday 07:00 IST (`weekly_job_schedule`) | `POST /v1/jobs/weekly` composes the weekly brief for every business with a member who switched it on and sends it as a WhatsApp text through the configured sender; accountants never receive it. | Cloud Logging: `job: "weekly"` |
| Hosted API (`cloud/src/server.mjs`) | On start and on stop | Waits up to thirty seconds for the database before giving up; on `SIGTERM` stops taking requests, finishes the ones in flight, closes the pool. A pooled connection that the database ends while it is idle (a restart or a failover) is dropped and logged, and the next request opens a new one; the process keeps running. | Cloud Logging: `startup`, `shutdown`, `db` |
| Cloud SQL (`infra/cloud`) | 20:30 UTC daily | Automated backups, fourteen kept, point-in-time recovery with seven days of logs. | Cloud Console → SQL → Backups |
| GitHub Actions `Nightly checks` | 03:00 IST daily | Every Node suite (platform, sprints, hosted API against Postgres) and `scripts/rules-watch.mjs`. On any failure an issue "Nightly checks need attention" is opened or updated; it closes itself on the first green night. | Actions → Nightly checks; Issues |
| GitHub Actions `CI` | Every push and pull request | All four suites. | Actions |
| GitHub Actions `Build Windows installer`, `Build Android app` | Tag `v*` | Installers, APK and app bundle with SHA256 sums attached to the release. | Releases |
| GitHub Actions `Deploy hosted API` | Push to `main` touching `cloud/`, `platform/src/` or `sprints/` | Suite first, then the image is built, pushed and rolled out; the old revision keeps serving until the new one answers `/v1/health`. | Actions |
| Dependabot | Weekly | Grouped update PRs for Actions, `platform` dev dependencies, `cloud` and the Flutter packages. CI runs on each. | Pull requests |
| Cloud Monitoring (`infra/cloud`) | Always, once `alert_email` is set | Uptime check on `/v1/health` every five minutes from three regions; alerts when it fails, on more than five 5xx responses in five minutes, when p95 latency passes three seconds for ten minutes, and when Cloud Scheduler gets no 2xx answer from the daily or weekly job. A staging stack's alerts end in "(staging)". | Email |

## 1a. Switches that are off until a person sets them

| Variable | Where | What it turns on |
|---|---|---|
| `MYCA_MODEL_API_KEY` (and `MYCA_MODEL`, default `claude-sonnet-5-5`) | `platform/.env` on a desktop; Cloud Run env for the hosted API | Chat messages that match no built-in action are routed by the model to one tool (never a figure); bills chosen on the phone are read into a draft purchase. Off: the rule-based parser and hand entry, exactly as before |
| `MYCA_SMS_PROVIDER` = `twilio` (`MYCA_SMS_TWILIO_SID`, `_TOKEN`, `_FROM`) or `msg91` (`MYCA_SMS_MSG91_AUTHKEY`, `_TEMPLATE_ID`) | Cloud Run env | Phone-number sign-in. Off: Google Sign-In only |
| `MYCA_DEV_OTP=1` | local only | Prints the code to the console instead of sending it |

## 2. Health

Desktop: `GET http://127.0.0.1:4780/api/health` with the launch token header. The answer
is `200` with `ok: true` when the books are open and the ledger chain verifies, else
`503`. Fields: `version`, `uptimeSeconds`, `books`, `chain`, `backups` (count, verified,
latest), `lastBackup`, `recovered`, `automation` (last run, warnings), `lastTick`.

Hosted: `GET /v1/health` is what Cloud Run's probes, the uptime check and the deploy
workflow read.

## 3. When something is wrong

**The ledger chain is broken** (`chain.ok: false`, or the daily checks warn). Nothing
written since the break can be trusted. Stop entering data. Restore the newest backup
from before the break: close the app, move `state.json` aside, copy
`backups/state-<day>.json` to `state.json`, open the app, confirm `/api/health` says
`chain.ok: true`. Re-enter what was posted after that day from the invoices and bills
themselves.

**`recovered` is set after launch.** The app already restored from a backup because
`state.json` was unreadable. Check the day it restored from, re-enter anything posted
after it, then delete the `state.json.corrupt-*` file once a CA has looked at it.

**The nightly issue says a rule is ending with no successor.** This is a person's job by
design (`docs/product/RULES-CURRENCY.md`): find the notification, add a new dated record
in `sprints/statutory-rules/src/rules/`, never edit the old one, run the suites, send the
new id to the partner firm to attest. The issue closes itself the next night.

**The nightly issue says a suite failed.** Open the run, read the last forty lines of
the failing suite, fix on a branch, merge; the next night closes the issue.

**Cloud Run alert: down.** Open Cloud Run → `myca-api` → Revisions. If the newest
revision is failing its probes, route 100% of traffic back to the previous one from the
console (or with the commands in `DEPLOYMENT.md`, "Roll back the hosted API"), then look at Logs
for the `startup` entries. A database outage shows as `database not ready` repeated ten times
before the instance exits.

**Cloud Run alert: server errors.** Open Logs Explorer with
`resource.type="cloud_run_revision" AND resource.labels.service_name="myca-api" AND httpRequest.status>=500`.
If the errors began with the newest revision, roll back as above and fix on a branch. If
`/v1/health` answers 503 with `DATABASE_UNAVAILABLE`, the database is the cause: check Cloud
SQL → `myca` → Overview for a restart, maintenance or a full disk. Otherwise read the crash
digest (`GET /v1/admin/crashes` as one of `MYCA_ADMIN_USER_IDS`) for the route that fails.

**Scheduler alert: a job failed.** Cloud Scheduler called `/v1/jobs/daily` or
`/v1/jobs/weekly` and got no 2xx answer after its retries, so the daily checks and the
retention purge may not have run. Open Cloud Scheduler → `myca-api-daily` → Logs. A 404
means the token differs: Terraform generates one job token and writes it to both the
scheduler's `x-myca-job-token` header and the service's `MYCA_JOB_TOKEN`, so apply
`infra/cloud` again. A 5xx or a timeout is in the API: read the `job` log lines and the
crash digest. Then press "Force run"; the job is safe to run twice. The alert does not
fire for a job that is paused or deleted, so run
`gcloud scheduler jobs describe myca-api-daily` whenever you do the restore drill and
check its state and last attempt time.

**Cloud Run alert: slow.** Check Cloud Run → `myca-api` → Metrics: if the instance count sits
at `max_instances`, raise it in `infra/cloud` and apply; if latency jumps after idle periods,
`min_instances` is 0 and requests wait for a cold start. Then check Cloud SQL → `myca` →
Query insights for the slowest queries and the CPU graph; a shared-core tier that stays near
full CPU needs a larger `db_tier`.

**Cloud SQL restore drill** (do this once before the first real user, and after any
schema change): create a clone from a point in time, point a local API at it with the
Auth Proxy (`database_connection_name` output), run `npm test` style smoke calls against
`/v1/health` and a business snapshot, delete the clone.

**A suspected data breach** (a lost phone with the app signed in, a leaked token, an
unexpected member in a business, a provider key seen in a log). Within the hour: revoke
the device, either from the app (Your business, then Security, lists the signed-in devices,
each with Sign out) or from the database (`update devices set revoked_at = now() where
id = ...`; every request from it fails at once), rotate the secret involved in Secret
Manager and redeploy, and export the `audit_log` rows for the business from the suspected
time. Within seventy-two hours, as the Digital Personal Data Protection Act requires: tell
each affected business owner in the app's own words what was seen, when, and what they
should change, and write the same to the Data Protection Board of India once it is
constituted; keep the audit export with the notice. Afterwards: add the gap to
`docs/architecture/SECURITY-AND-PRIVACY.md` section 4 and the fix to the next release.

**A user lost their authenticator and recovery codes.** They cannot finish signing in and
nothing in the app can help them. Confirm who they are the way you would for a lost phone
number (the owner of the business vouches for a member; an owner answers questions only
their books can answer), then turn two-step off for them in the database:
`delete from user_totp where user_id = ...;` and
`delete from recovery_codes where user_id = ...;`. Their next sign-in is one step again;
tell them to turn two-step back on from Security in the app. Their signed-in devices are
untouched by those two statements. If the authenticator was on a lost phone, end that
device as well (above). If the user did not switch two-step on themselves, or you cannot
tell, end every device of theirs in the same sitting with
`update devices set revoked_at = now() where user_id = ... and revoked_at is null;`,
because a session that stays signed in can enrol an authenticator of its own again (the
app asks for no fresh code to do that; see section 4 of
`docs/architecture/SECURITY-AND-PRIVACY.md`).

## 4. Redundancy choices and their cost

| Switch | Default | What it buys | Cost |
|---|---|---|---|
| `min_instances` (`infra/cloud`) | 1 | No cold starts; 2 means a second warm instance in another zone of the region | About one more small instance always on |
| `sql_availability_type` | `ZONAL` | `REGIONAL` keeps a standby in a second zone with automatic failover in about a minute | About twice the database cost |
| `max_instances` | 4 | Headroom under load | Only when used |
| Local backups kept | 14 days | Any day's books in the last two weeks | Disk only |
| Cloud SQL backups | 14, PITR 7 days | Any minute in the last week | Included in the instance price |

Flip `sql_availability_type` and `min_instances` in `infra/cloud` when the owner decides
the hosted service is live for real users; both are one-line variable changes and a
`terraform apply`.

## 5. What a person still does

- Apply `infra/cloud` once (it is format-checked and validated on every PR, never
  applied automatically, because it creates billable Cloud SQL and Cloud Run resources).
- Set the GitHub variables and secrets in `DEPLOYMENT.md`, including `GCP_API_REGION`
  for the API deploy, `MYCA_CLOUD_URL` and the Android upload key for Play builds.
- Answer the nightly issue when a rule needs a successor.
- Attestation of rules, live filing credentials, the model decision: outside parties,
  see `docs/superpowers/PROGRESS.md`.
