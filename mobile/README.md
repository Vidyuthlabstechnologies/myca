# MyCA for Android

The owner's app. Books are organised like a messenger: registers (Sales, Purchases,
Taxes and filings), then one thread per customer or supplier, where each entry is
previewed and confirmed before it reaches the books. Flutter, Android only,
application id `com.mldynamic.myca`.

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
| `lib/screens/` | Welcome, sign-in, migration, home, business menu, customer picker, register, party thread, expense, taxes, Ask; in hosted mode also phone sign-in, name, business setup, people and invitations, switching business |
| `lib/cloud/` | Hosted session: tokens, refresh, businesses, people |
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
`MYCA_GOOGLE_SERVER_CLIENT_ID`) or by phone and code, whichever the API says are on,
creates the business, and keeps its tokens in the Android Keystore. See
`cloud/README.md` to start the API.

Google Sign-In needs two OAuth clients in the Google Cloud project, created by the
company:

1. A **web** client. Its id is passed to the app as `MYCA_GOOGLE_SERVER_CLIENT_ID` and
   to the API as `MYCA_GOOGLE_CLIENT_IDS`. ID tokens are issued for it.
2. An **Android** client for package `com.mldynamic.myca` and the SHA-1 of the signing
   key. Add one for the upload key and, once Play App Signing is on, one for Play's
   app signing key; otherwise sign-in fails on installed builds.

```bash
flutter run --dart-define=MYCA_CLOUD_URL=<api url> --dart-define=MYCA_GOOGLE_SERVER_CLIENT_ID=<web client id>
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
gate in the app; the stored session is protected by the Android Keystore, not bound to
the fingerprint.

In both modes a picked file is uploaded first and the import refers to it by hash, so
file contents never sit in a waiting preview.

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
- App icon, Play listing, Data safety and Financial features forms.
- Bill capture by camera, payroll, GST filing pack, notifications.

Plain HTTP is allowed in debug builds only; release builds require HTTPS.
