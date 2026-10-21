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
flutter build apk --debug
flutter test tool/screenshots_test.dart --update-goldens
```

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
iOS needs nothing extra either: the project already targets iOS 14 and carries
`NSCameraUsageDescription`; Plaid's OAuth redirect (a Universal Link registered in the
Plaid dashboard) is only needed for OAuth banks outside the Sandbox and is not set up.

## iOS

`ios/` is the Xcode project (`Runner.xcodeproj`, `Runner/Info.plist`,
`AppDelegate.swift`, `Podfile`), bundle id `com.mldynamic.myca`, display name MyCA,
minimum iOS 14 (what `file_picker` needs; the other plugins need 13). Building and
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

```bash
flutter build appbundle --release --dart-define=MYCA_CLOUD_URL=https://<api host>
```

The application id is `com.mldynamic.myca` (owner decision, 6 October 2026). It cannot
change after the first upload to Play.

## Not built yet

- A deployed backend. The hosted API in `cloud/` works locally but is not deployed.
- App icon, and the Play and App Store listings submitted.
- An iOS build signed and run on an iPhone; it has only been built unsigned in CI.
- An iOS share extension (receiving a file from another app).

Plain HTTP is allowed in debug builds only; release builds require HTTPS.
