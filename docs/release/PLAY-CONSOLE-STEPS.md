# Play Console: the owner's steps for closed testing (India app)

Written 2026-11-14. Everything the code can do is done; this is what only the owner can
click, in order. Each step names the issue that tracks it. The answers to paste are in
`PLAY-LISTING.md` (listing, declarations), `DATA-SAFETY.md` (Data safety form) and
`PRIVACY-POLICY.md` (policy). Subscriptions stay off for closed testing: billing is off on
the server until the Play products exist, so every feature is free for testers.

App facts you will be asked for:

| Field | Value |
|---|---|
| App name | MyCA: GST, Books and Payroll |
| Package name | `com.mldynamic.myca` (cannot change later) |
| Default language | English (India), en-IN |
| App or game | App |
| Free or paid | Free (subscriptions are in-app purchases, added later) |
| Category | Business |
| Upload key SHA-1 | `0F:27:28:1E:AD:BC:3F:18:23:B7:68:7E:9D:45:E4:05:90:EF:4F:D4` (keystore `D:\keys\myca\myca-upload.jks`) |

Local release check, 2026-11-14 (develop `643f37d`, Flutter 3.44.9): `flutter analyze` clean,
`flutter build appbundle --release --flavor india` builds (89.7 MB bundle, native debug
symbols included, so Play shows no symbols warning), package `com.mldynamic.myca`, target
and compile SDK 36, min SDK 24, the APK's permissions equal `mobile/android/permissions.txt`,
and the APK passes the 16 KB page-size alignment check Play requires for new apps.

## 1. Developer account (#155)

1. Go to https://play.google.com/console/signup and choose **An organisation**, not
   "Yourself". Use ML Dynamic Solutions Private Limited and its D-U-N-S number (free from
   https://www.dnb.com/duns/get-a-duns.html; it can take a few days). An organisation
   account skips Play's rule that new personal accounts need 12 testers for 14 days
   before production.
2. Pay the one-time US$25 fee and finish identity verification. Use a support email
   and phone that customers may see.

## 2. Create the app record (#155)

1. **Home > Create app**: fill the first five rows of the table above, tick the two
   declarations, **Create app**.

## 3. Signing and Google sign-in (#143)

1. **Test and release > Setup > App signing**: keep **Play App Signing** on (the default
   when you upload the first bundle). Play keeps the app signing key; you keep only the
   upload key.
2. After the first upload (step 7), copy the **App signing key certificate SHA-1** from
   that page.
3. In Google Cloud console (project that holds the web OAuth client), **APIs & Services >
   Credentials > Create credentials > OAuth client ID > Android**, package
   `com.mldynamic.myca`, SHA-1 from step 3.2. Make a second Android client with the upload
   key SHA-1 above, so builds installed from GitHub also sign in.
4. Check the repository variable `MYCA_GOOGLE_SERVER_CLIENT_ID` is the **web** client id
   (ends in `.apps.googleusercontent.com`); the tagged build refuses to run otherwise.

## 4. App content (Policy > App content) (#153)

Work down the list; each takes a minute with the sheets.

| Section | Answer |
|---|---|
| Privacy policy | `https://<site>/privacy` once #148's bracketed fields (address, support email, Grievance Officer) are filled and the site is deployed from main |
| App access | "All or some functionality is restricted". Add instructions from `PLAY-LISTING.md` section 4 (reviewer phone number and six-digit code from the vault entry "MyCA Play reviewer"). The reviewer number must be switched on in production first: `DEPLOYMENT.md`, "Play reviewer sign-in" |
| Ads | No, the app has no ads |
| Content rating | Start questionnaire, category **All other app types**, answer **No** to every question (no violence, sexual content, language, controlled substances, gambling, user-to-user sharing of content with strangers, location sharing). Expected rating: Everyone / 3+ |
| Target audience | 18 and over only. Not designed for children |
| News app | No |
| Data safety | Paste from `DATA-SAFETY.md`, in its order. Data is encrypted in transit: Yes. Users can request deletion: Yes, with the URL `https://<site>/delete-account` |
| Government apps | No: MyCA is not made for or on behalf of a government. The listing already carries the "not affiliated" sentence and the official portal links |
| Financial features | Choose none of the lending, payments, banking, crypto or investment options; MyCA moves and holds no money. If asked, describe it as accounting and GST filing software |
| Health | No health features |
| Advertising ID | No, the app does not use the advertising ID |

## 5. Store listing (Grow > Store presence > Main store listing)

1. Paste the app name, short description and full description from `PLAY-LISTING.md`
   section 1 (the three fenced blocks; `node scripts/check-listing.mjs` confirms the lengths).
2. App icon: `docs/release/assets/play-icon-512.png`.
3. Feature graphic: `docs/release/assets/play/feature-graphic.png`.
4. Phone screenshots: `phone-01` to `phone-08` from `docs/release/assets/play/`, in order.
5. **Store settings**: category Business, tags from `PLAY-LISTING.md`, contact email and
   website.

## 6. Countries

**Test and release > Testing > Closed testing > Create track** (or use the default
"Closed testing - Alpha"), **Countries/regions**: India only.

## 7. First upload (#156)

1. Ask for a tagged build (a `v1.0.x` tag on main) or, before then, take the signed
   `myca-android.aab` from the latest **Build Android app** run. The tag build refuses to
   run without the upload key in Secret Manager, an https `MYCA_CLOUD_URL` and the web
   client id, so a finished tag build is ready for Play.
2. **Internal testing > Create new release**, upload the `.aab`, release name = the
   version, notes "First internal build". **Save > Review release > Start rollout**.
3. Add yourself and the CA on the **Testers** tab (an email list), open the opt-in link
   on a phone, install, and run the checklist in `PLAY-LISTING.md` section 5.
4. Read the **Pre-launch report** under the release (about an hour later) and send any
   crash or accessibility item back to this thread.

## 8. Closed testing (#157, #158)

1. **Closed testing > Create release**, **Add from library** the same bundle, roll out.
2. **Testers**: create an email list of your testers (12 or more if the account is
   personal) and share the opt-in link. Testers use `docs/release/TESTER-GUIDE.md`.
3. Keep it running 14 days in a row if the account is personal, then **Apply for
   production** from the dashboard.

## 9. Let CI upload future builds (#156)

1. **Users and permissions > Invite new users**: `gh-deployer@myca-prod-in.iam.gserviceaccount.com`,
   app MyCA, permission **Release to testing tracks** (add production later).
2. In GitHub, set the repository variable `PLAY_TRACK` to `internal` (or `alpha` for
   closed testing). From then on a `v*` tag uploads the bundle as a draft release on that
   track; you press **Start rollout**.

## 10. Subscriptions, later (#154)

Not for closed testing. The Indian prices are settled (2026-11-14): **Monetise >
Subscriptions**, create `essentials` (₹999 a month, ₹9,999 a year), `pro` (₹1,999, ₹19,999)
and `firm` (₹5,999, ₹59,999) with monthly and yearly base plans, add licence testers under
**Setup > Licence testing**, then set `MYCA_PLAY_PRODUCT_ESSENTIALS`,
`MYCA_PLAY_PRODUCT_PRO`, `MYCA_PLAY_PRODUCT_FIRM` on the server (`infra/cloud`). Create
`assured` (₹4,999, ₹49,999) and set `MYCA_PLAY_PRODUCT_ASSURED` only once a CA team is signed
to do its monthly GST and TDS filing. Billing
turns on by itself once those are set; until then nobody is charged.
