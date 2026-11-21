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
  The `Build iOS app` workflow fills both from repository variables, so nothing is committed:
  `MYCA_GOOGLE_IOS_CLIENT_ID` (India, bundle `com.mldynamic.myca`) and
  `MYCA_GOOGLE_IOS_CLIENT_ID_US` (MyCA US, a second iOS client for `com.mldynamic.myca.us`).
  A signed build stops with a clear error when the variable is missing, because Google
  sign-in crashes on iPhone without it. The workflow also passes `MYCA_GOOGLE_SERVER_CLIENT_ID`
  and uses the run number as the build number, so every TestFlight upload is accepted.
  The web client id still goes in as `MYCA_GOOGLE_SERVER_CLIENT_ID` (`mobile/README.md`).
- A firm's OpenID Connect provider: the `com.mldynamic.myca` URL scheme is already
  registered; build with `MYCA_OIDC_CLIENT_ID` and register
  `com.mldynamic.myca://oidc` as a redirect URI at the provider.

## 2a. Sign in with Apple (MyCA US on iOS, guideline 4.8)

MyCA US offers Google sign-in, so guideline 4.8 needs an equivalent login that limits
data to name and email, lets the person hide their email and does not track. Sign in
with Apple is built (2026-11-14): the black "Continue with Apple" button sits above
Google on the iOS sign-in screen of the US app, and `POST /v1/auth/apple`
(`cloud/src/apple.mjs`) checks Apple's identity token: issuer
`https://appleid.apple.com`, Apple's keys at `https://appleid.apple.com/auth/keys`, an
accepted audience, and a nonce that is the SHA-256 of a fresh random value the app
made for that one sign-in. The US build adds the entitlement
`com.apple.developer.applesignin` (`mobile/ios/Runner/RunnerUS.entitlements`, set by
the `app: us` step of *Build iOS app*). It is off until the owner does this:

1. Certificates, Identifiers & Profiles: open the App ID `com.mldynamic.myca.us`, tick
   **Sign in with Apple** (as a primary App ID) and save.
2. Regenerate the App Store provisioning profile for `com.mldynamic.myca.us` so it
   carries the capability, and replace `APPLE_PROVISIONING_PROFILE_BASE64_US`. A
   signed US build fails with an entitlement error until this is done; the unsigned
   build is not affected.
3. On the US hosted service set `MYCA_APPLE_CLIENT_IDS=com.mldynamic.myca.us`
   (Terraform `apple_client_ids`). Without it `GET /v1/auth/methods` says
   `apple: false` and the app hides the button.
4. Private relay email: in Certificates, Identifiers & Profiles → Services → Sign in
   with Apple for Email Communication, register the domain MyCA sends from (and its
   SPF/DKIM) if MyCA will ever email a relay address. MyCA sends no email to users
   today, so this can wait.
5. Only if a web or Android flow is wanted later: create a **Services ID** (for
   example `com.mldynamic.myca.us.web`), configure its domain and return URL, create a
   Sign in with Apple **key** (`.p8`) and keep it in Secret Manager, then add the
   Services ID to `MYCA_APPLE_CLIENT_IDS`. The Android app hides the button until such
   a flow exists (`appleSignInOffered` in `mobile/lib/cloud/apple_auth.dart`).

Account deletion and token revocation: Apple asks apps to revoke Apple tokens with the
REST API when an account is deleted. MyCA never exchanges Apple's authorization code,
so it holds no Apple access or refresh token and there is nothing to revoke; only
Apple's stable user id (`oidc_issuer`/`oidc_sub`) and the verified email are stored.
`DELETE /v1/me` works the same for Apple users (tested in `cloud/test/apple.test.mjs`):
the account is closed at once and erased after the grace period, and signing in with
Apple afterwards starts a new account. If a Services ID key is ever added and refresh
tokens are kept, add a call to `https://appleid.apple.com/auth/revoke` to the deletion.

The name Apple shares arrives only on the first authorization and only on the device;
the app sends it with that sign-in and the server keeps it if the account has no name.
Later sign-ins may carry no email; the stored one is kept.

For review, the demo account stays a phone number with a fixed code; the reviewer can
also use their own Apple ID once step 3 is done.

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

**MyCA US on iOS.** The US app is its own App Store app, `com.mldynamic.myca.us` ("MyCA US"), as
on Android. Run *Build iOS app* by hand with `app: us`. It swaps the bundle id and name, builds with
`MYCA_EDITION=US` (straight into the US experience) and points at `MYCA_CLOUD_URL_US` when that
repository variable is set. It needs two more secrets: `APPLE_PROVISIONING_PROFILE_BASE64_US`
(the App Store profile for `com.mldynamic.myca.us`) and `APPLE_PROFILE_NAME_US`. Register the
bundle id and create the app in App Store Connect with the United States storefront first.

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
privacy policy. In the India app Apple's own sign-in is not offered. MyCA US on iOS
offers Sign in with Apple beside Google (section 2a), so the email Apple gives may be a
private relay address; it is collected for sign-in only, like the Google email.

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
- Sign in with Apple for MyCA US: the capability on the App ID, the regenerated US
  profile and `MYCA_APPLE_CLIENT_IDS` (section 2a).
- Signing certificate, archive, TestFlight and the review submission from a Mac.
- Running the app on a real iPhone once before TestFlight; it has only been built in
  CI.
- Export compliance: the app uses only HTTPS; answer "no" to proprietary encryption.
