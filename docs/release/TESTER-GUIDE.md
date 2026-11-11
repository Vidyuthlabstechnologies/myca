# Tester guide

For anyone testing MyCA before it is on the Play Store. Nothing secret is written here: where you
need a code or a password, the guide names the entry in the team vault. Ask the owner for access to
the vault collection "MyCA testing".

## 1. Get the app

- **Internal or closed testing on Play.** The owner adds your Google account to the tester list.
  Open the opt-in link from the vault entry "MyCA Play testing links", accept, then install MyCA
  from the Play Store on that account.
- **A test build from GitHub.** For testing against staging. Run "Build Android app" with backend
  `test` (or ask the owner to), download the APK from the run's artifacts and install it. It
  installs beside the store app as "MyCA Test" and shows a test-server banner at the top.

## 2. Sign in

| Where | How | Vault entry |
|---|---|---|
| Staging (MyCA Test) | Phone number and code; no SMS is sent | "MyCA staging test phones" |
| Production, Play reviewer | Phone number and code for the reviewer account | "MyCA Play reviewer" |
| Production, your own account | Continue with Google | none |
| Subscriptions | Your Google account must be a licence tester in the Play Console | "MyCA licence testers" (the list, not passwords) |

The staging numbers are refused by production, and the reviewer sign-in works only for its one
number.

## 3. What is real and what is simulated

| Feature | On staging | On production |
|---|---|---|
| Books, invoices, GST maths, reports | Real engines, test data | Real |
| GST portal filing, e-invoice (IRN), e-way bill | Simulated: you get a simulated reference, nothing reaches the government | Simulated until live filing is switched on with a CA's approval |
| SMS codes | Not sent; use the test numbers | Sent only if phone sign-in is on |
| WhatsApp and email sending | Off | On only when configured |
| Payments for subscriptions | Licence testers are never charged | Real for everyone else |

If anything looks like it reached a real government system from a test build, stop and report it as
a P0.

## 4. What to test

Follow [`E2E-CHECKLIST.md`](E2E-CHECKLIST.md) and record each run in
[`E2E-RESULTS.md`](E2E-RESULTS.md) (or send your notes to the owner, who adds them).

## 5. Reporting a problem

Open a GitHub issue with the "Tester report" template. Include the step id from the checklist, the
build version (Businesses → About this app), the phone and Android version, what you did, what you expected
and what happened, and a screenshot. Never put a code, password, GSTIN of a real business or a
customer's details in an issue: the repository is public.

## 6. Who has access

The owner keeps the list below current and removes access when someone leaves.

| Access | Who grants it | How to remove it |
|---|---|---|
| Vault collection "MyCA testing" | Owner | Remove the member from the collection, then change the staging test code (`MYCA_TEST_CODE`) |
| Play Console (testers list, licence testers) | Owner | Remove the email from the tester list and licence testers |
| GitHub repository (write) | Organization owner | Remove from the organization or repository |
| Google Cloud project `myca-prod-in` | Owner (project owner role) | Remove the IAM binding |
| Android upload key | Nobody new: it lives in Secret Manager and only CI reads it | n/a |
