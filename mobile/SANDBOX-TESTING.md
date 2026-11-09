# MyCA mobile — sandbox user testing (India)

This is the test script for trying the Android `india` build against a local
hosted API. Nothing here touches a live portal, a bank, or real money.

Sandbox means: phone codes print to the server log instead of SMS, channel
pulls run as a dry run, and filing, e-invoice and DSC stay off. Prefer the
drop-in form in `tool/sandbox-setup.html` (open it in a browser, no server
needed) over hand-writing env files. The server
refuses to start with `MYCA_ENABLE_LIVE_CALLS` set, so a tester cannot
accidentally go live from this setup.

## 1. What you need

- Flutter 3.44 (Dart 3.12), Android Studio or VS Code, one Android phone or
  emulator with USB debugging.
- Postgres 13+ running locally for the API.
- This repo at `mobile/` and `cloud/`.

## 2. Start the sandbox API

```bash
# one-time: create the databases the tests and the dev server use
# postgres must listen on 127.0.0.1:54329, user myca
MYCA_TEST_DATABASE_URL=postgres://myca@127.0.0.1:54329/postgres npm test --prefix cloud
```

```bash
MYCA_DATABASE_URL=postgres://myca@127.0.0.1:54329/myca_dev \
MYCA_TOKEN_SECRET=<32+ random characters> \
MYCA_BOOKS_KEY=<32+ random characters> \
MYCA_DEV_OTP=1 \
PORT=8080 npm run dev --prefix cloud
```

Check: `GET http://127.0.0.1:8080/v1/auth/methods` answers
`{"ok":true,"data":{"phone":true,...}}`. Keep this terminal open: phone
sign-in codes print here.

`MYCA_CONNECTOR_KEY` (32+ characters) is optional. Without it the Connections
screen says the service has no connector key and hides the cards; with it the
four India cards appear and Pull runs as a dry run. `MYCA_ENABLE_CHANNEL_PULLS`
stays `0` for user testing.

## 3. Run the app against it

```bash
adb reverse tcp:8080 tcp:8080
flutter run --flavor india --dart-define=MYCA_CLOUD_URL=http://127.0.0.1:8080
```

Use the `india` flavor: it ships no Plaid SDK and shows the India channels
(Amazon, Shopify, Razorpay, Zoho). Release and Play builds use the same
flavor with `--dart-define=MYCA_CLOUD_URL=https://<api host>`.

## 4. Sign in (no SMS in sandbox)

1. Enter any 10-digit Indian mobile number, for example `98765 43210`.
2. Read the 6-digit code from the API terminal (`MYCA_DEV_OTP=1` prints it).
3. Enter the code in the app. It expires in five minutes.

Google sign-in is offered only when the build passes
`MYCA_GOOGLE_SERVER_CLIENT_ID` and the API sets `MYCA_GOOGLE_CLIENT_IDS`.
Firm SSO appears only when the API reports an OIDC issuer. For sandbox
testing, phone sign-in alone is enough.

## 5. Create the test business

- Name: `Nalanda Textiles (sandbox)`
- GSTIN: `27AAACH7409R1Z1` (Maharashtra), or leave empty and pick state `27`
  to test an unregistered business.
- Other GSTINs you can reuse from the engines: `24AAACF7856R1ZY`,
  `27AABCT1332L1ZE`.

Creating the business seeds empty books. One business per test run keeps the
audit trail readable.

## 6. What to try, in order

1. **First sale.** Home > + > Sale: party `Retail Mart`, GSTIN
   `27AAACH7409R1Z1`, `10 x Cotton fabric rolls @ 500`, GST 5%. Check the
   preview shows the tax split, then Post. The register updates from the
   server snapshot; the app computes nothing.
2. **Purchase and expense.** Same flow from Purchases and Expenses. Cash vs
   bank is explicit at entry.
3. **Receipt.** Open the sale thread, record a part receipt in cash. The
   thread balance changes; nothing posts without the preview step.
4. **Bank statement import.** Documents > import the sample:
   `Date,Narration,Withdrawal,Deposit,Balance` with two rows. It previews with
   counts before anything lands.
5. **Taxes review.** Taxes > review sales, then purchases, then approve. The
   figures are restated at the gate. Filing itself is out of scope: record the
   ARN back as `record_filing`, never a live submit.
6. **Reports.** Home > Reports > + saves a report; opening it shows the total
   and the prior-period compare. Deleting it goes through preview and confirm.
7. **Connections (dry run).** Business menu > Connections to banks and apps.
   Save Razorpay test keys (`rzp_test_…`) or a Shopify dev-store token, then
   Pull. In sandbox the result says dry run and drops a file reminder instead
   of posting. Live keys must not be entered here.
8. **Lock.** Turn app lock on from the business menu, background the app for
   two minutes, and confirm it asks for the device lock on return.

A waiting preview holds a file hash, never file bytes. Discard voids the
one-use token; nothing posts silently.

## 7. Reset between runs

Sign out from the business menu and sign in with a different number, or
create a fresh business. Each business holds one pending preview: two phones
previewing at once will replace each other's preview, which is expected.

## 8. Out of scope for this round

Live GST filing, e-invoice / e-way bill submission, DSC signing, real
settlements or payouts, SMS delivery, Play billing, iOS signing, and Vyapar /
Khatabook / Busy / Marg direct import (the server has no parser for them;
use the Tally Day Book or bank statement path instead).

## 9. When something looks wrong

Note the screen, the business name, the approximate time, and the server log
lines around it. For books issues, owner menu > Download everything gives one
JSON document with the books and file hashes; attach it instead of
re-typing figures.
