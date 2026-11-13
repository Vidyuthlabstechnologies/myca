# M3 hosted pilot: handover report

Prepared 2026-11-12 from `main` at `ab4c22e` and the open issues on that day. This is the report
for #171. Sections marked **owner** can only be finished by a person with the Play Console, the
Google Cloud project or the team vault. Update this file when they are, and do not paste any
secret into it.

## 1. Play testing links

| Track | Opt-in link | State |
|---|---|---|
| Internal testing | **owner**: Play Console, Testing, Internal testing, Testers, "Copy link" | Not created yet: the developer account and app record are #155, the first upload is #156 |
| Closed testing | **owner**: same place under Closed testing | Not started (#158). A new personal developer account needs 12 testers for 14 days before production |

The signed `v1.0.0` app bundle and APK are on the GitHub release `v1.0.0`. `build-android.yml`
builds a `test` app (`com.mldynamic.myca.test`, "MyCA Test") against staging, and a live app
against production.

## 2. Environments

| Environment | Address | State on 2026-11-12 |
|---|---|---|
| Production API | https://myca-api-tvfsqs2oha-el.a.run.app | Healthy: `/v1/health/live` reports `environment: production`, `providerMode: test`, revision `myca-api-00004-zxx`. Google Cloud project `myca-prod-in`, region `asia-south1` |
| Production site | https://myca-site-tvfsqs2oha-el.a.run.app | `/privacy` and `/delete-account` return 200 |
| Staging API | **owner**: the `api_url` output of the staging apply (DEPLOYMENT.md, "Staging (test) backend") | The stack is defined (#227, #229) but has not been applied. Set the repository variable `MYCA_CLOUD_URL_STAGING` once it is up |
| Old AWS stack | `infra/aws` | Retired (#181). Never apply it. Shut the AWS account down and then delete the folder and `deploy-aws.yml` |

Deploys run from GitHub Actions on every push to `main`. The repository variable `MYCA_CLOUD_URL`
must point at the production API above. On 2026-11-11 it still pointed at the AWS address, so check
it before the next Android build.

## 3. Credentials

There are no values here or anywhere in GitHub. Everything is in the team vault (#170):

- "MyCA staging test phones": the staging `MYCA_TEST_PHONES` numbers and their `MYCA_TEST_CODE`.
  The same values are the `MYCA_SMOKE_PHONE`, `MYCA_SMOKE_PHONE_2` and `MYCA_SMOKE_CODE` repository
  secrets for the nightly smoke.
- "MyCA Play reviewer": the reviewer number and code that go into Play Console, App access.
- The Android upload keystore and its passwords, which are also the four `ANDROID_*` repository secrets.
- Sandbox by Quicko: the test key now, and the live key only for the production release.
- Google Cloud: the deployer is the workload identity in DEPLOYMENT.md, and nobody holds a
  downloaded service account key.

## 4. Documents

- [`DEPLOYMENT.md`](../../DEPLOYMENT.md): hosting, variables, secrets, deploys and rollbacks.
- [`docs/release/TESTER-GUIDE.md`](../release/TESTER-GUIDE.md): how a tester joins and what to try.
- [`docs/release/E2E-CHECKLIST.md`](../release/E2E-CHECKLIST.md) and
  [`E2E-RESULTS.md`](../release/E2E-RESULTS.md): what "verified" means and the results log.
- [`docs/release/DATA-SAFETY.md`](../release/DATA-SAFETY.md),
  [`PRIVACY-POLICY.md`](../release/PRIVACY-POLICY.md) and
  [`PLAY-LISTING.md`](../release/PLAY-LISTING.md): what goes into the Play Console.
- [`docs/release/assets/play/README.md`](../release/assets/play/README.md): the feature graphic
  and screenshots.
- [`OWNER-CHECKLIST.md`](OWNER-CHECKLIST.md) and [`DEVELOPER-HANDOVER.md`](DEVELOPER-HANDOVER.md).

## 5. What was merged for this release

M3 backlog and release work, 2026-11-10 to 2026-11-12:

| PR | What |
|---|---|
| #213 | The M3 release backlog: erasure, test mode, demo businesses, Android build, Play docs, repository hygiene (closed 19 issues) |
| #217 | Ignore signing keys and key files across the repository |
| #219 | Firm sign-in with PKCE, the `test` Android build, the app smoke against a real API, Google Cloud docs |
| #221 | Launcher icons and the Play icon; the end-to-end checklist, results log and tester guide |
| #214 | Hosted API and site moved to Google Cloud (Cloud Run, Cloud SQL) |
| #227, #229 | Staging stack and multi-environment Cloud Run deploys |
| #218 | Website matches the app |
| #239 to #242 | Post-merge launch fixes; the website runs as its own service account |
| #243 | `infra/aws` retired (#181), automated release-blocking smoke checks (M3.7) |
| #250 | Play listing assets (#152): the feature graphic and eight phone screenshots in `docs/release/assets/play/` |

The feature work merged in the same window, such as the tax assistant, GSTR-1 and GSTR-3B filing
through Quicko, e-way bills, the country packs and the US app, is listed in `git log` and
`STATUS.md`.

## 6. Still open in M3.1 to M3.9

All of these are assigned to Ekaanth, with @varshinicb1 as reviewer. "Who" says who can move each
one next.

| Issue | Priority | What is left | Who |
|---|---|---|---|
| #123 | P0 | Owner decisions before the testing release | owner |
| #139 | P2 | Land the guided tour (#121 merged) after a run on a device | tester |
| #142 | P1 | Audit the merged manifest of the release bundle on a device build | developer |
| #143 | P0 | Play App Signing, and the Play signing SHA-1 as an Android OAuth client | owner |
| #148 | P0 | One privacy policy that matches the app, published at the site's `/privacy` | owner and developer |
| #152 | P1 | Upload the assets from #250 to the listing | owner |
| #153 | P0 | Play Console policy declarations and App access | owner |
| #154 | P1 | Play Billing products, licence testers, notifications | owner |
| #155 to #158 | P0 and P1 | Developer account, first upload, internal round, closed testing | owner, then testers |
| #160 to #168 | P1 | Device and network runs from the E2E checklist. The API side of B5, I1, I3, I5, X3 and I10 is automated in `mobile/test_smoke/p0_flows_test.dart`, and A2 in `cloud/test/account-erasure.test.mjs` | testers |
| #170 | P1 | Fill the vault entries in section 3 | owner |
| #171 | P1 | This report: fill in the **owner** cells and get a review | owner and reviewer |
| #172 | P1 | Branch protection and CODEOWNERS on `main` | owner |
| #178 | P2 | `sql_availability_type = REGIONAL` and `min_instances = 2` (about twice the database cost) | owner decision |
| #182 | P3 | Split oversized modules, one PR per file, no change in behaviour | developer |
| #185 | P3 | Pin the desktop code-signing certificate thumbprint once a certificate exists | owner, then developer |

M3.10 (security hardening, #196 to #211) is a separate milestone and is not part of this handover.

## 7. Known risks and owner actions

- **No Play track yet.** Nothing below can be tested by outside users until #155 and #156 are done.
- **Staging not applied.** The `test` build and the nightly smoke have no address to talk to.
  Until then, the only automated run is the CI job against an API that it starts itself.
- **`MYCA_CLOUD_URL` may still be the AWS address.** A live Android build made now would talk to a
  retired server.
- **Provider mode is `test` in production.** Live GST, e-invoice and e-way bill calls stay off
  until the CA sign-off and the live Quicko key are in place.
- **One database instance and one minimum API instance** (#178). A zone outage takes the service
  down until Cloud SQL recovers.
- **`develop` and `main`**: both are at `ab4c22e`. Keep merging `develop` into `main` through a PR so
  that the deploy on `main` is the one that is tested.
- **The old branch `claude/ecs-express-and-uncommitted`** holds two Firebase keys that GitHub flagged.
  Rotate the keys and then delete the branch; that is the owner's call.

## 8. Status file

`STATUS.md` now says "As of main on 2026-11-10" with the counts from that day, so the stale
2026-10-14 header in the issue is fixed. Refresh it again at the next release with
`node scripts/check-all.mjs`.
