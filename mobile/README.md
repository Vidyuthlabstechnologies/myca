# MyCA for Android and iOS

The owner's app. Books are organised like a messenger: registers (Sales, Purchases,
Taxes and filings), then one thread per customer or supplier, where each entry is
previewed and confirmed before it reaches the books. Flutter; Android application id
and iOS bundle id `com.mldynamic.myca`.

The app holds no tax logic and computes no figures. Every number on screen comes from
the MyCA server; the app only formats and orders what it receives. Forms send
structured arguments to `/api/propose`, which returns the engine's preview and a
one-use token; nothing posts until that token is confirmed.

## What is here

| Path | Purpose |
|---|---|
| `lib/theme.dart` | Palette, type and component styles |
| `assets/fonts/` | Inter 4.1 (Regular, Medium, SemiBold) and its SIL Open Font License |
| `lib/brand.dart`, `lib/marks.dart` | Logo mark and the hand-drawn line icon set |
| `lib/api/` | `MycaApi` contract, HTTP client, response models |
| `lib/registers.dart` | Grouping documents into customers and suppliers; entry arguments |
| `lib/migration.dart` | Where-are-your-books paths and the imports each one offers |
| `lib/attention.dart` | Ordering of "Needs you" and "Coming up" |
| `lib/proposal_flow.dart` | Shared preview, post and discard behaviour |
| `lib/screens/` | Welcome, sign-in, migration, home, business menu, customer picker, register, party thread, expense, taxes, reports, Ask; in hosted mode also phone sign-in, name, business setup, people and invitations, switching business, connectors |
| `lib/cloud/` | Hosted session: tokens, refresh, businesses, people, connectors; Google and OpenID Connect sign-in; Plaid Link behind an interface |
| `ios/` | The Xcode project; see the iOS section below |
| `test/` | Unit and widget tests against a fake API |
| `tool/live_check.dart` | Contract check against a running MyCA server |
| `tool/screenshots_test.dart` | Renders every screen to `tool/screens/*.png` |

## Commands

```bash
flutter analyze
flutter test
flutter build apk --debug --flavor india
flutter test tool/screenshots_test.dart --update-goldens
```

The first Android build downloads Gradle (the wrapper checks it against `distributionSha256Sum`), the
Android NDK and every dependency, which takes a while on a slow line. The wrapper waits up to two
minutes per request (`networkTimeout` in `android/gradle/wrapper/gradle-wrapper.properties`). If the
dependency downloads still time out, give Gradle the same patience for the build:

```bash
export GRADLE_OPTS="-Dorg.gradle.internal.http.connectionTimeout=120000 -Dorg.gradle.internal.http.socketTimeout=120000"
```

`test_smoke/` drives the app's own client (`CloudSession`) against a running hosted API: sign in
with a test number, make a business, book a sale, read Today, delete the business. `p0_flows_test.dart`
adds the release-blocking checks from `docs/release/E2E-CHECKLIST.md`: one business never shows another's
invoices (B5), CGST and SGST for the same state and IGST for another (I1, I3), a wrong GSTIN check digit
is refused (I5), and confirming one preview twice, even at the same moment, posts once (X3, I10). Set
`MYCA_SMOKE_PHONE_2` to a second test number to also check that another account cannot read or write
the business; without it that one test is skipped. The smoke is skipped
unless `MYCA_SMOKE_URL`, `MYCA_SMOKE_PHONE` and `MYCA_SMOKE_CODE` are set; the phone and code must
be one of that API's `MYCA_TEST_PHONES` and its `MYCA_TEST_CODE`. CI runs it on every push against
an API it starts itself (job "App against a running API"), and `app-smoke.yml` runs it nightly or by
hand against `MYCA_CLOUD_URL_STAGING` once the two `MYCA_SMOKE_*` secrets exist.

Run the two smoke files one at a time (`--concurrency=1`). Both sign in with `MYCA_SMOKE_PHONE`,
and asking for a new sign-in code cancels the one asked for before it, so two files signing in at
the same moment make one of them fail with "That code was already used".

```bash
MYCA_SMOKE_URL=http://127.0.0.1:8080 MYCA_SMOKE_PHONE=9876501234 MYCA_SMOKE_PHONE_2=9876501235 MYCA_SMOKE_CODE=482913 flutter test --concurrency=1 test_smoke
```

## MyCA Malaysia (flavor `my`)

`flutter build apk --debug --flavor my` builds MyCA Malaysia: application id
`com.mldynamic.myca.my`, label "MyCA Malaysia" ("MyCA Malaysia Test" for the test build), the
`MycaDesign.forFlavor('my')` light and dark themes, en-MY with Bahasa Melayu (the phone's language,
or the translate button on every MY screen; the choice is kept), ringgit as `RM1,234.50` and dates
as `dd/MM/yyyy`. The privacy notice is fetched with `?region=MY`. Every figure comes from the MY
tools on the server through `/api/query` and `/api/propose` + `/api/confirm`; the app checks only
the shape of what is typed (TIN, MyKad, BRN, postcode, phone, amounts, dates).

| Path | Purpose |
|---|---|
| `lib/my/my_strings.dart` | Every MY string in English and Malay |
| `lib/my/my_tools.dart` | Calls to the MY tools and their response models |
| `lib/my/my_codes.dart`, `lib/my/my_code_tables.dart`, `assets/my/msic.json` | LHDN code tables for the pickers (states, tax types, units, classifications, currencies, countries, 1,175 MSIC codes) |
| `lib/screens/my/` | Welcome, business setup and details (`validate_my_tin`, `set_my_einvoice_profile`), home, e-invoice create, check, send, status, QR and share, cancel within 72 hours with a countdown, credit note after it; e-invoice list (sent from `my_einvoices`, received from `my_received_einvoices` with reject), monthly consolidated e-invoice (`issue_my_consolidated_einvoice`, late reason), SST registration and SST-02, income tax estimator, plans |
| `lib/tour/sample_malaysia.dart` | Sandbox books for every MY tool |
| `tool/my_screenshots_test.dart` | Renders the MY screens to `build/my_screens/390x844/` and `build/my_screens/360x640/` (not committed) |

Self-billed e-invoices (`issue_my_self_billed_einvoice`) have a place in the new e-invoice choice
but no form yet. The income tax estimate always says it is not yet reviewed by a Malaysian tax agent
and that it is prepared in MyCA and filed by the taxpayer in MyTax. Plans are RM299, RM699 and
RM1,999 a year through Google Play (products `myca_my_starter_yearly`, `myca_my_business_yearly`,
`myca_my_pro_yearly`).

```bash
flutter test test/my_*_test.dart
flutter test tool/my_screenshots_test.dart
ANDROID_HOME=/opt/android-sdk flutter build apk --debug --flavor my
```

### Sandbox triggers

"Explore with sample books first" on the MY welcome opens Teratai Digital Sdn Bhd. Its books hold a
valid, an invalid, an older (past 72 hours) and a consolidated e-invoice and one received from a
supplier. In the sandbox, and in the tests that use the same books:

- a business TIN ending `9999` is not found at LHDN;
- a buyer TIN ending `0000` comes back invalid (CF321);
- an invoice number containing `REJECT` is rejected by LHDN (DS302);
- a consolidated line whose largest receipt is above RM10,000 is refused;
- a consolidated month more than 7 days after it ended needs the late reason;
- a number already sent is refused (`EINVOICE_ALREADY_SENT`).

### Malay strings for native review

Every Malay string in `lib/my/my_strings.dart` (the second argument of each `_t(english, malay)`,
320 entries, plus `monthShort`) is a draft written without a native speaker. Please have a native
Bahasa Melayu reviewer check all of them, especially the tax terms: e-Invois, e-Invois disatukan,
bil kendiri, cukai jualan, cukai perkhidmatan, tahun taksiran, pelepasan, rebat, PCB, zakat, ambang,
kotak pasir (sandbox), and the LHDN error messages.

## Running against the local server

The server only answers `127.0.0.1` and needs a per-launch token, so the phone reaches
it through `adb reverse` and both sides are given the same token.

```bash
cd ../platform
MYCA_API_TOKEN=<any 32+ character string> npm run dev
```

```bash
adb reverse tcp:4780 tcp:4780
flutter run --dart-define=MYCA_API_TOKEN=<the same string>
```

Contract check without a phone:

```bash
dart run -DMYCA_API_TOKEN=<the same string> tool/live_check.dart
```

## Running against the hosted API

Built with `MYCA_CLOUD_URL`, the app signs in with Google (when built with
`MYCA_GOOGLE_SERVER_CLIENT_ID`), with a firm's OpenID Connect provider (when built with
`MYCA_OIDC_CLIENT_ID` and the API reports one), or by phone and code, whichever the
API says are on, creates the business, and keeps its tokens in the Android Keystore or
the iOS Keychain. See `cloud/README.md` to start the API.

The two sign-in defines:

| Define | What it is |
|---|---|
| `MYCA_GOOGLE_SERVER_CLIENT_ID` | The **web** OAuth client id; the API verifies Google ID tokens against it |
| `MYCA_OIDC_CLIENT_ID` | The client id the firm's identity provider issued for the app, with `com.mldynamic.myca://oidc` registered there as a redirect URI |

OpenID Connect sign-in is offered only when `GET /v1/auth/methods` says `oidc: true`
and names the issuer. The app reads the issuer's `/.well-known/openid-configuration`,
opens the authorization endpoint in the system browser (`response_type=id_token`,
`openid email profile`, a random state and nonce), receives the redirect as a deep
link on the `com.mldynamic.myca` scheme, checks state and nonce, and posts the ID
token to `/v1/auth/oidc`. If no link comes back within two minutes the screen says
"Could not finish the sign-in" and stays signed out. `lib/cloud/oidc_auth.dart` holds
discovery and the URL building; `test/oidc_test.dart` runs it without a browser.

Google Sign-In needs two OAuth clients in the Google Cloud project, created by the
company:

1. A **web** client. Its id is passed to the app as `MYCA_GOOGLE_SERVER_CLIENT_ID` and
   to the API as `MYCA_GOOGLE_CLIENT_IDS`. ID tokens are issued for it.
2. An **Android** client for package `com.mldynamic.myca` and the SHA-1 of the signing
   key. Add one for the upload key and, once Play App Signing is on, one for Play's
   app signing key; otherwise sign-in fails on installed builds.

```bash
flutter run --dart-define=MYCA_CLOUD_URL=<api url> --dart-define=MYCA_GOOGLE_SERVER_CLIENT_ID=<web client id> --dart-define=MYCA_OIDC_CLIENT_ID=<the firm's client id>
```

```bash
flutter run --dart-define=MYCA_CLOUD_URL=http://127.0.0.1:8080
```

```bash
dart run -DMYCA_CLOUD_URL=http://127.0.0.1:8080 -DMYCA_DEV_OTP_LOG=<server log file> tool/cloud_live_check.dart
```

In hosted mode the app locks itself: on opening, and after two minutes away, it asks
for the phone's fingerprint, face or screen lock before showing or fetching anything.
It can be turned off from the business menu, which itself needs the lock. The lock is a
gate in the app; the stored session is protected by the Android Keystore or the iOS
Keychain, not bound to the fingerprint.

## Reports

Home > Reports lists the reports saved on the server (`list_reports`). Tapping one runs
it (`run_report`) and shows the total for the period, the comparison with the period
before when the report asks for one ("up 12% on 2026-09, ₹5,25,000.00"), and each row
with its earlier figure. The + button saves a new report (name, what, grouped by,
period, compare) through `save_report`, and the bin deletes one through
`delete_report`; both go through the usual preview and confirm. The app computes
nothing; every figure is the engine's.

In both modes a picked file is uploaded first and the import refers to it by hash, so
file contents never sit in a waiting preview.

## Connectors (hosted mode, owner only)

Business menu > "Connections to banks and apps" (`lib/screens/connectors_screen.dart`)
lets the owner connect the channels the hosted API offers without the desktop. A US
business gets Plaid, TaxJar, Gusto and Track1099; an Indian one Amazon, Shopify,
Razorpay and Zoho (the business country comes from the snapshot). Each card shows the
title, connected or not, "Pulled to" when a pull has run, a short how-to with the same
wording as the desktop keys page, an input per field (secrets as password fields that
say "(saved)" once set; the machine-managed Plaid and Gusto fields such as access
tokens, item ids and OAuth state are never shown), the environment as a dropdown, Save,
and the channel's actions:

| Channel | Action | Route under `/v1/businesses/{id}/` |
|---|---|---|
| All | Save | `POST connectors` with `channel` and the typed fields; Pause/Resume sends `enabled` |
| Plaid | Connect my bank | `POST plaid-link-token`, Plaid Link, then `POST plaid-exchange` with the public token |
| Gusto | Connect Gusto | `POST gusto-connect`; the URL opens in the system browser and Gusto returns to the API host, so the owner taps Refresh afterwards |
| TaxJar | Look up rate | `POST taxjar-rate` with zip, city and state; the combined rate and its parts are shown |
| Channels with pull kinds | Pull transactions / payouts / settlement(s) / payroll summaries | `POST connector-sync`; the result for that channel is shown and the list refreshed |

The keys never touch the phone's storage: they go straight to the API, which stores them
encrypted, and come back only as "set". When the service has no connector key the screen
shows the API's hint instead of the cards. `lib/cloud/cloud_session.dart` holds the typed
calls (`listConnectors`, `saveConnector`, `plaidLinkToken`, `plaidExchange`,
`gustoConnect`, `taxjarRate`, `connectorSync`).

Plaid Link is the `plaid_flutter` package behind `PlaidLinkOpener`
(`lib/cloud/plaid_link.dart`); `DevicePlaidLink` opens the native SDK and resolves with
the public token, or null if the owner closes it, and `AppState.plaidLink` takes a fake
in tests (`test/connectors_test.dart`). Android needs nothing beyond the dependency.
iOS needs nothing extra either: the project already targets iOS 15 and carries
`NSCameraUsageDescription`; Plaid's OAuth redirect (a Universal Link registered in the
Plaid dashboard) is only needed for OAuth banks outside the Sandbox and is not set up.

## iOS

`ios/` is the Xcode project (`Runner.xcodeproj`, `Runner/Info.plist`,
`AppDelegate.swift`), bundle id `com.mldynamic.myca`, display name MyCA,
minimum iOS 15 (Apple requires it for uploads from April 2027; `file_picker` needs 14). Building and
signing need a Mac; `Build iOS app` in GitHub Actions builds an unsigned `Runner.app`
on every `v*` tag. `docs/release/APP-STORE.md` lists the owner's steps.

Two placeholders in `ios/Runner/Info.plist` must be filled from the GCP OAuth **iOS**
client before Google sign-in works on an iPhone:

| Key | Fill with |
|---|---|
| `GIDClientID` (`REPLACE_WITH_GOOGLE_IOS_CLIENT_ID…`) | The iOS client id |
| First `CFBundleURLSchemes` entry (`REPLACE_WITH_REVERSED_GOOGLE_IOS_CLIENT_ID`) | The same id reversed, `com.googleusercontent.apps.…` |

The second URL type, scheme `com.mldynamic.myca`, carries the OpenID Connect redirect
and needs no change. Camera, photo library and Face ID usage strings are set; the
system picker asks for the camera only if the owner opens it. Reminders use the same
`flutter_local_notifications` schedule on both platforms, asking iOS for permission
once. Sharing a file into the app from another app is Android only; on iOS the owner
picks the bill from inside the app.

## Migration paths

| Books are in | What the app offers |
|---|---|
| Tally | Day Book CSV, TallyPrime XML, bank statement |
| Zoho Books | Invoice CSV, bank statement |
| Another billing app | Bank statement, or a Tally-format Day Book if the app can export one |
| Excel or Google Sheets | Bank statement |
| Paper, or with a CA | Tally export from the CA, bank statement |
| Starting fresh | Nothing to import |

Direct import from Vyapar, Khatabook, Busy, Marg or a free-form spreadsheet is not
built; the server has no parser for them.

## Release build

Release builds are signed with the upload key named in `android/key.properties`, which
git ignores, as do keystores. Copy `android/key.properties.example`, point `storeFile`
at the company's upload keystore, and fill in the passwords from the company's password
manager. The key and its passwords never go in the repository. Without the file, a
release build falls back to the debug key, prints a warning, and cannot be uploaded to
Play.

MyCA India and MyCA US are two store apps built from this one codebase. The build
flavor picks the app; neither app can switch to the other country.

```bash
flutter build appbundle --release --flavor india --dart-define=MYCA_CLOUD_URL=https://<api host>
flutter build appbundle --release --flavor us --dart-define=MYCA_CLOUD_URL=https://<US api host>
```

The India application id is `com.mldynamic.myca` (owner decision, 6 October 2026) and the
US one is `com.mldynamic.myca.us`. Neither can change after the first upload to Play. The
US app needs its own Play listing, its own Android OAuth client for the new package, and
`MYCA_PLAY_PACKAGE_US` on the server. iOS is not split yet: it still builds one app.

## Not built yet

- A deployed backend. The hosted API in `cloud/` works locally but is not deployed.
- App icon, and the Play and App Store listings submitted.
- An iOS build signed and run on an iPhone; it has only been built unsigned in CI.
- An iOS share extension (receiving a file from another app).

Plain HTTP is allowed in debug builds only; release builds require HTTPS.
