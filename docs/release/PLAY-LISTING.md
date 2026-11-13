# Play Store release: listing, declarations and checklist

Everything the Play Console asks for, drafted from what the app actually does
(first drafted 2026-10-14, listing rewritten 2026-11-10). The owner reviews the wording and the legal entity before anything is
submitted; nothing here is published by the repository.

## 1. Listing

Rewritten 2026-11-10 to match the app as it is: it files GSTR-1 and GSTR-3B once the
owner confirms with the EVC OTP, it has three paid plans, and it is not a government
app. The India listing does not mention the US edition. `node scripts/check-listing.mjs`
checks the three text fields below against Play's limits (title 30, short description 80,
full description 4,000 characters) and fails the local gate if one is over.

### App name

```listing-title
MyCA: GST, Books and Payroll
```

### Short description

```listing-short
Books, GST returns and payroll by chat. You approve every entry and filing.
```

### Full description

```listing-full
MyCA keeps a small business's books the way a careful accountant would, from your phone.

Record sales, purchase bills and expenses by typing a sentence or filling a short form. Photograph or share a bill and MyCA reads it into lines for you to check. Nothing posts until you see a preview and confirm it.

GST returns, prepared and filed with your approval
MyCA drafts GSTR-1 and GSTR-3B from your entries, using dated GST rules. You review the draft step by step. When you are ready, MyCA files it on the GST portal through a licensed GST Suvidha Provider, and only after you confirm with the EVC OTP sent to your authorised signatory. A business can also require a second person, such as its CA, to approve a filing first.

What else MyCA does
- Invoices, quotations, credit notes, e-invoices (IRN) and e-way bills
- GSTR-2B matching, with supplier reminders sent only when you allow them
- TDS on payments and receipts, with statements prepared for review
- Payroll with PF, ESI and professional tax
- Bank statements matched to your books
- Reports: profit and loss, balance sheet, trial balance, what you are owed and what you owe
- Invite your CA or staff, each with their own role, and choose how often your CA sees changes
- Export everything, at any time, in one file

Plans
Every new business gets a 14-day free trial of Pro. After the trial the books stay readable and exportable, and posting needs a plan:
- Essentials: Rs 399 a month or Rs 3,999 a year, for 2 people
- Pro: Rs 799 a month or Rs 7,999 a year, for 5 people, with portal filing, e-invoices, connectors and WhatsApp
- CA firm: Rs 2,499 a month or Rs 24,999 a year, for 25 people
Subscriptions are billed through Google Play and renew until you cancel.

Your data
Your books are sealed per business on our servers and sent only over HTTPS. You can delete a business, or your whole account, from inside the app or from our website.

MyCA is not affiliated with, endorsed by or a part of GSTN, the GST Council, the Income Tax Department or the Government of India. Official sources: GST portal https://www.gst.gov.in, e-invoice portal https://einvoice1.gst.gov.in, e-way bill portal https://ewaybillgst.gov.in, Income Tax portal https://www.incometax.gov.in.

MyCA is made by ML Dynamic Solutions Private Limited.
```

### Other fields

| Field | Value |
|---|---|
| Package name | `com.mldynamic.myca` (decided 2026-11-05; Play never lets it change) |
| Category | Business |
| Tags | accounting, GST, invoicing, bookkeeping, payroll |
| Contact email | the company's support address |
| Privacy policy URL | the published copy of `docs/release/PRIVACY-POLICY.md` (served from `deploy/public/privacy.html`) |
| Screenshots | Eight at 1080×2160 in `docs/release/assets/play/` (`phone-01` to `phone-08`): home, a sale waiting for confirmation, a customer, an invoice, taxes, the GST review, reports, the books check. Rendered on sample books by `mobile/tool/play_listing_test.dart` |
| Feature graphic | `docs/release/assets/play/feature-graphic.png`, 1024×500: the wordmark, the short description and Bahi on the cream background |

## 2. Data safety form

| Question | Answer | Why |
|---|---|---|
| Collects personal info | Yes: phone number or Google account (sign-in), name | Account |
| Collects financial info | Yes: invoices, bills, payroll, tax figures the owner enters | App functionality |
| Collects files and photos | Yes, when the owner chooses a bill to read; the image is sent to the hosted service and, if the model is switched on, to the model provider; it is kept only as the content-addressed document the owner uploaded | App functionality |
| Crash logs | Yes, only if the owner turns crash reports on; not linked to a user | App stability |
| Location, contacts, messages, device ids | No | |
| Shared with third parties | Model provider (document text or image, chat text) only when the hosted service has a model key configured; SMS provider (phone number) for sign-in codes; no advertising or analytics SDK | |
| Encrypted in transit | Yes (HTTPS; the desktop app is loopback only) | |
| Deletion | The owner deletes a business, or the whole account, from Businesses in the app (`DELETE /v1/me`); without the app, through the request page `deploy/public/delete-account.html`, whose public URL goes in the Data deletion field | |
| Data processed ephemerally | Chat messages that match no tool are not stored | |

## 3. Permissions and their justification

This is every permission the signed release APK asks for, read from the APK by the Android
build (`aapt2 dump permissions`). The build fails when the APK and
`mobile/android/permissions.txt` differ, so this table must change in the same commit as that
file. Checked 2026-11-10 against the build of `601894e`.

| Permission | Who adds it | Why |
|---|---|---|
| INTERNET | MyCA | Talks to the hosted API |
| POST_NOTIFICATIONS | MyCA | A reminder on the morning something falls due (filing, payroll approval, an instalment); the owner is asked once and can refuse |
| RECEIVE_BOOT_COMPLETED | MyCA | Reschedules those reminders after a restart |
| USE_BIOMETRIC | local_auth | App lock with fingerprint or face |
| USE_FINGERPRINT | local_auth (androidx.biometric) | The same app lock on Android versions before 9 |
| VIBRATE | flutter_local_notifications | A reminder may vibrate, following the phone's own notification setting |
| com.android.vending.BILLING | in_app_purchase | Google Play Billing for the Essentials, Pro and CA firm subscriptions |
| ACCESS_NETWORK_STATE | merged from a library | Checks whether the phone is online before a call; reads no network details |
| CHANGE_NETWORK_STATE | merged from a library | Not used by MyCA's own code; a normal permission that Play does not ask about |
| WAKE_LOCK | merged from a library (background job scheduling) | Lets a scheduled reminder or a library's background job finish; MyCA keeps no screen or CPU awake itself |
| FOREGROUND_SERVICE | merged from a library (background job scheduling) | MyCA starts no foreground service. No typed foreground service is declared, so Play's foreground service form does not apply; if Play still asks, answer that the app has none |
| com.mldynamic.myca.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION | AndroidX core, automatically | The app's own signature-level permission that keeps internal broadcast receivers private; no person is asked |
| File access | (none) | Through the system picker only, for bills to read and files to save; no storage permission is requested |

No camera, location, contacts, SMS, phone or storage permission is requested: photos come
through the system picker, which may open the camera itself.

"Merged from a library" means the permission is not in `mobile/android/app/src/main/AndroidManifest.xml`
or a plugin's own manifest; it comes from a library manifest that Gradle merges in. To see which
one, run `./gradlew :app:processReleaseMainManifest` and read
`app/build/outputs/logs/manifest-merger-release-report.txt`.

## Store icon and launcher icons

The feature graphic and the eight phone screenshots for the listing are in
`docs/release/assets/play/`; its README says how each is made and in what order to upload them.

`docs/release/assets/play-icon-512.png` is the 512 by 512 Play icon (opaque, the MyCA "M" on the
brand ink colour), with its source `play-icon.svg`. The legacy launcher icons for Android 7
(`mipmap-*/ic_launcher.png` and `ic_launcher_round.png`) are drawn from the same path as the
adaptive icon (`drawable/ic_launcher_foreground.xml`). To redraw all of them after a change to
that path, run `node scripts/render-launcher-icons.cjs mobile/android/app/src/main/res docs/release/assets`
(it uses the Chromium that Playwright installs).

## 4. Declarations

- Not a financial services app: MyCA holds no money, moves no money and is not a merchant of record (ADR-0010).
- No government ID collection beyond what the owner types into their own invoices (GSTIN, PAN); never a password for a government portal.
- Content rating: everyone.
- Ads: none. In-app purchases: yes, auto-renewing subscriptions (Essentials, Pro and CA firm) through Google Play Billing, with a 14-day free trial counted by MyCA itself.
- Target audience: business owners, 18 and over.
- App access: some functionality is restricted to signed-in users. Instructions for the reviewer: on the first screen enter the reviewer number, tap "Send code" (no SMS is sent), then enter the six-digit code (vault entry "MyCA Play reviewer"). The account sees only demo businesses with sample books, and cannot join a real business. The number and code are turned on in `infra/cloud` (`DEPLOYMENT.md`, "Play reviewer sign-in").

## 5. Testing track before production

1. Internal testing: the owner and the partner CA firm, from a tagged build (`Build Android app` workflow, signed with the upload key).
2. Closed testing: at least twelve testers opted in for at least fourteen days in a row, as Play requires before a new personal developer account can apply for production (an organisation account is exempt).
3. Checklist per build: sign in, add a business, record a sale and a bill, read a bill from a photo, review a GST month, approve a payroll, save the CA file, open the app after a day and see the week ahead and a notification, delete the business.
4. Crash reports on for the testing tracks; read them in the hosted database.

## 6. What is still a person's job

- Create the Play developer account for the legal entity and pay the registration fee.
- Generate the upload keystore and put it in the four `ANDROID_*` GitHub secrets (`DEPLOYMENT.md`).
- Decide the model provider and sign its terms (ADR-0004), and the SMS provider for phone sign-in.
- Publish the privacy policy at a public URL and paste it into the listing.
- Run the app on a real device once before internal testing; the release build has only run in CI.
- Set the repository variables `MYCA_CLOUD_URL` (the https address of the deployed hosted API) and, for Google sign-in, `MYCA_GOOGLE_SERVER_CLIENT_ID`. A `v*` tag build now refuses to run without the upload key and an https `MYCA_CLOUD_URL`, and takes its version name from the tag and its version code from the run number.
- For a test build, set `MYCA_CLOUD_URL_STAGING` to the staging API address and run Build Android app by hand with backend `test`. That build installs beside the live app as `com.mldynamic.myca.test`, named MyCA Test, with a `-test` version name, and the app shows a test-server banner because the staging API reports a non-production environment. Google sign-in in it needs its own Android OAuth client for the `.test` package and the CI signing SHA-1. Never upload a test build to Play: the tag build always uses `MYCA_CLOUD_URL`.
- Publish `delete-account.html` with the site and paste its URL into the Data deletion field.
