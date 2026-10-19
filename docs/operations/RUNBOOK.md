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
| Hosted API (`cloud/src/server.mjs`) | On start and on stop | Waits up to thirty seconds for the database before giving up; on `SIGTERM` stops taking requests, finishes the ones in flight, closes the pool. | Cloud Logging: `startup`, `shutdown` |
| Cloud SQL (`infra/cloud`) | 20:30 UTC daily | Automated backups, fourteen kept, point-in-time recovery with seven days of logs. | Cloud Console → SQL → Backups |
| GitHub Actions `Nightly checks` | 03:00 IST daily | Every Node suite (platform, sprints, hosted API against Postgres) and `scripts/rules-watch.mjs`. On any failure an issue "Nightly checks need attention" is opened or updated; it closes itself on the first green night. | Actions → Nightly checks; Issues |
| GitHub Actions `CI` | Every push and pull request | All four suites. | Actions |
| GitHub Actions `Build Windows installer`, `Build Android app` | Tag `v*` | Installers, APK and app bundle with SHA256 sums attached to the release. | Releases |
| GitHub Actions `Deploy hosted API` | Push to `main` touching `cloud/`, `platform/src/` or `sprints/` | Suite first, then the image is built, pushed and rolled out; the old revision keeps serving until the new one answers `/v1/health`. | Actions |
| Dependabot | Weekly | Grouped update PRs for Actions, `platform` dev dependencies, `cloud` and the Flutter packages. CI runs on each. | Pull requests |
| Cloud Monitoring (`infra/cloud`) | Always, once `alert_email` is set | Uptime check on `/v1/health` every minute; alerts when it fails, on 5xx responses, and when p95 latency passes three seconds. | Email |

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
console, then look at Logs for the `startup` entries. A database outage shows as
`database not ready` repeated ten times before the instance exits.

**Cloud SQL restore drill** (do this once before the first real user, and after any
schema change): create a clone from a point in time, point a local API at it with the
Auth Proxy (`database_connection_name` output), run `npm test` style smoke calls against
`/v1/health` and a business snapshot, delete the clone.

**A suspected data breach** (a lost phone with the app signed in, a leaked token, an
unexpected member in a business, a provider key seen in a log). Within the hour: revoke
the device from the database (`update devices set revoked_at = now() where id = ...`;
every refresh from it fails at once), rotate the secret involved in Secret Manager and
redeploy, and export the `audit_log` rows for the business from the suspected time. Within
seventy-two hours, as the Digital Personal Data Protection Act requires: tell each
affected business owner in the app's own words what was seen, when, and what they
should change, and write the same to the Data Protection Board of India once it is
constituted; keep the audit export with the notice. Afterwards: add the gap to
`docs/architecture/SECURITY-AND-PRIVACY.md` section 4 and the fix to the next release.

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
