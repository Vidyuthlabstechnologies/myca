# Play Store release: listing, declarations and checklist

Everything the Play Console asks for, drafted from what the app actually does on
2026-10-14. The owner reviews the wording and the legal entity before anything is
submitted; nothing here is published by the repository.

## 1. Listing

| Field | Draft |
|---|---|
| App name | MyCA |
| Short description (80) | Your books, GST, TDS and payroll from your phone. Every entry previewed before it posts. |
| Full description | MyCA keeps a small business's books the way a careful accountant would, from your phone. Record sales, bills and expenses by typing a sentence or filling a short form; see what you are owed and what you owe; let MyCA draft your GSTR-1, GSTR-3B, TDS statements and payroll from dated statutory rules; and hand your CA one file a month. Nothing posts until you see a preview and confirm it. MyCA never files a return or signs anything for you; filing stays with you and your CA. Runs for Indian businesses (GST, TDS, PF, ESI, professional tax) and for US sole proprietors (sales tax, 941, W-2, 1099-NEC, Schedule C). |
| Category | Business |
| Tags | accounting, GST, invoicing, bookkeeping, payroll |
| Contact email | the company's support address |
| Privacy policy URL | the published copy of `docs/release/PRIVACY-POLICY.md` (served from `deploy/public/privacy.html`) |
| Screenshots | Home, a customer thread with a preview, Taxes, the GST review, Payroll. Take them on a Pixel at 1080×2400 after the first device run |
| Feature graphic | 1024×500, the brand mark on the cream background from `mobile/lib/brand.dart` |

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

| Permission | Why |
|---|---|
| INTERNET | Talks to the hosted API |
| USE_BIOMETRIC | App lock with fingerprint or face |
| POST_NOTIFICATIONS | A reminder on the morning something falls due (filing, payroll approval, an instalment); the owner is asked once and can refuse |
| RECEIVE_BOOT_COMPLETED | Reschedules those reminders after a restart |
| File access | Through the system picker only, for bills to read and files to save; no broad storage permission |

No camera permission is requested: photos come through the system picker, which may
open the camera itself.

## 4. Declarations

- Not a financial services app: MyCA holds no money, moves no money and is not a merchant of record (ADR-0010).
- No government ID collection beyond what the owner types into their own invoices (GSTIN, PAN); never a password for a government portal.
- Content rating: everyone.
- Ads: none. In-app purchases: none at launch.
- Target audience: business owners, 18 and over.

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
- Publish `delete-account.html` with the site and paste its URL into the Data deletion field.
- Decide the package name before the first upload: it is `com.mldynamic.myca` today, and Play never lets it change.
