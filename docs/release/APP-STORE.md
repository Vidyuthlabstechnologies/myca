# App Store release: what the owner must do

The iOS target lives in `mobile/ios` (bundle id `com.mldynamic.myca`, display name
MyCA, iOS 15 or later). `Build iOS app` (`.github/workflows/build-ios.yml`) analyzes,
tests and builds an unsigned `Runner.app` on every `v*` tag. Signing, TestFlight and
the listing need an Apple account and a Mac; nothing here is published by the
repository. The answers below are drafted from what the app does on 2026-10-20 and
match `PLAY-LISTING.md` and `PRIVACY-POLICY.md`; the owner reviews them before
submitting.

## 1. Account and identifiers

- Enrol the legal entity in the Apple Developer Program (organisation, D-U-N-S number
  required; a yearly fee).
- In Certificates, Identifiers & Profiles, register the App ID `com.mldynamic.myca`
  with no extra capabilities (push notifications are not used; reminders are local).
- In App Store Connect, create the app with that bundle id and the name MyCA. The
  bundle id cannot change after the first build is uploaded.

## 2. Sign-in clients

- Google: create an **iOS** OAuth client in the Google Cloud project for bundle id
  `com.mldynamic.myca` and put its client id in `mobile/ios/Runner/Info.plist` as
  `GIDClientID`, and its reversed form (`com.googleusercontent.apps.…`) as the first
  `CFBundleURLSchemes` entry. The two placeholders are named
  `REPLACE_WITH_GOOGLE_IOS_CLIENT_ID` and `REPLACE_WITH_REVERSED_GOOGLE_IOS_CLIENT_ID`.
  The web client id still goes in as `MYCA_GOOGLE_SERVER_CLIENT_ID` (`mobile/README.md`).
- A firm's OpenID Connect provider: the `com.mldynamic.myca` URL scheme is already
  registered; build with `MYCA_OIDC_CLIENT_ID` and register
  `com.mldynamic.myca://oidc` as a redirect URI at the provider.

## 3. Signing and TestFlight

The workflow `.github/workflows/build-ios.yml` signs and uploads to TestFlight on its own
once these repository secrets exist (until then it only uploads the unsigned app):

| Secret | What |
|---|---|
| `APPLE_CERTIFICATE_BASE64` | the Apple Distribution certificate with its key, as a base64 `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_PROVISIONING_PROFILE_BASE64` | the App Store provisioning profile for `com.mldynamic.myca`, base64 |
| `APPLE_PROFILE_NAME` | that profile's name as shown in the developer portal |
| `APPLE_TEAM_ID` | the ten-character team id |
| `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_BASE64` | an App Store Connect API key (App Manager role) and its `.p8`, base64 |

Push a `v*` tag and the signed build lands in TestFlight; the manual steps below remain
the fallback and the way to do the first upload from a Mac.


1. Open `mobile/ios/Runner.xcworkspace` in Xcode on a Mac after `flutter pub get` and
   `pod install` in `mobile/ios`.
2. In Signing & Capabilities, choose the team and let Xcode manage the distribution
   profile, or install the company's certificate from its password manager. Keys and
   profiles never go in the repository.
3. `flutter build ipa --release --dart-define=MYCA_CLOUD_URL=https://<api host>` (plus
   `MYCA_GOOGLE_SERVER_CLIENT_ID` and `MYCA_OIDC_CLIENT_ID` as used), then upload the
   archive with Transporter or Xcode's Organizer.
4. Internal TestFlight: the owner and the partner CA firm. External TestFlight needs a
   short beta review; use the review notes in section 5.

## 4. App privacy (nutrition labels)

Answer the same way as the Play Data safety form.

| Data type | Collected | Linked to the user | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact info: phone number, name, email (Google or firm account) | Yes | Yes | No | App functionality (sign-in, who did what) |
| Financial info: invoices, bills, payroll and tax figures the owner enters | Yes | Yes | No | App functionality |
| User content: photos and documents the owner chooses (bills, bank statements) | Yes | Yes | No | App functionality; sent to the model provider only when the hosted service has a model key |
| Diagnostics: crash logs | Yes, only if the owner turns them on | No | No | App functionality |
| Identifiers, location, contacts, usage data, purchases | No | | | |

Tracking: none. No advertising or analytics SDK. Third parties: the model provider
(document image or text, chat text) and the SMS provider (phone number) as in the
privacy policy; Apple's own sign-in is not offered. If Sign in with Apple is ever
required because Google sign-in is on, add it then; today Google sign-in is only
offered when the hosted service enables it, alongside phone and the firm's provider.

Permissions and their strings (`Info.plist`): camera and photo library for reading a
bill or receipt; Face ID for the app lock. Notifications are asked for once, for a
reminder on the morning something falls due.

Privacy policy URL: the published copy of `PRIVACY-POLICY.md`.

## 5. Review notes

Paste into App Review Information.

> MyCA keeps a small business's books. Two modes: **local**, where the app talks only
> to the MyCA desktop server on the owner's own computer over `adb reverse` or the
> local network and no account exists (reviewers cannot use this mode without that
> server; sign in with the demo PIN only if a demo server URL is supplied below); and
> **hosted**, where the app signs in by phone code, Google or the firm's identity
> provider against our API. For review use the hosted build and the demo account
> below. The app holds no money, moves no money, files no returns and signs nothing;
> every entry is previewed and confirmed by the owner. It needs no in-app purchase.

Supply a demo phone number with a fixed code, or a demo Google account, created on
the hosted service for the review period, and the API URL the build was made with.

## 6. Listing

Reuse the Play listing text (`PLAY-LISTING.md` section 1): name MyCA, subtitle "Books,
GST, TDS and payroll", category Business, age rating 4+ (no restricted content), no
ads, no in-app purchases at launch. Screenshots: 6.7-inch and 6.1-inch iPhone sets of
Home, a customer thread with a preview, Taxes, the GST review, Payroll and Reports.

## 7. Still a person's job

- Apple Developer Program enrolment and the yearly fee.
- The iOS Google OAuth client and the two placeholder values in `Info.plist`.
- Signing certificate, archive, TestFlight and the review submission from a Mac.
- Running the app on a real iPhone once before TestFlight; it has only been built in
  CI.
- Export compliance: the app uses only HTTPS; answer "no" to proprietary encryption.
