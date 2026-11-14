# MyCA privacy policy (draft for the owner's review)

Effective date: to be set when published.

Data fiduciary (controller): ML Dynamic Solutions Private Limited, CIN [CIN], [registered
office address], support email [support address]. Grievance Officer: [name], [email],
[phone]; we acknowledge within 48 hours and reply within 30 days. The in-app notice
(`cloud/src/consent.mjs`, `LEGAL_INDIA`) holds the same fields; fill both.

The bracketed fields are the only parts left for the owner (issue #148). The published copy
is `deploy/public/privacy.html`; change both in the same commit. Every recipient below is
also in `docs/release/DATA-SAFETY.md`, and the two must stay in step.

## What MyCA is

MyCA is an accounting and compliance app for small businesses. The business owner
enters their own sales, purchases, expenses, payroll and tax details. MyCA keeps those
books, drafts returns from them and, only when the owner confirms with the OTP the
government portal sends, files GST returns through a licensed GST Suvidha Provider. MyCA
does not move or hold money and never asks for or stores a password for a government
portal.

## What we collect and why

| Data | Why | Where it is kept |
|---|---|---|
| Google account (name, email) or phone number | To sign you in and to show who did what in a business | The hosted service in Google Cloud, Mumbai region |
| A random device id the server makes when you sign in | To let you see and sign out your devices | The hosted service |
| The books: invoices, bills, expenses, payroll, bank lines, tax figures, GSTIN and PAN you enter | The service the app provides | The hosted service |
| Documents you choose to upload (bank statements, bills, photos of bills) | To import entries or to read a bill into a draft purchase | The hosted service, addressed by a hash of their content |
| Chat messages to the assistant | To carry out what you ask; recent turns are kept for context | The hosted service |
| Google Play subscription records | To know which plan you have paid for | The hosted service |
| Crash reports | To fix crashes; only if you turn them on (off by default). Emails, tokens, GSTIN, PAN, phone numbers and amounts are removed on the phone before sending | The hosted service, not linked to you, kept 90 days |

We do not collect location, contacts, SMS, call logs, advertising identifiers or anything
from other apps.

## Who else sees it

Each of these is reached only when you use the feature, and only with what that feature needs.

- Members you invite to your business (staff, your accountant) see what their role allows.
- Google: to check a Google sign-in and a Google Play subscription.
- The SMS provider, when phone sign-in is on: your phone number and the sign-in code.
- The GST Suvidha Provider (currently Quicko), when you file a GST return or use the
  e-way bill service through it: the return data, your GSTIN and the OTP step.
- The NIC e-invoice and e-way bill systems, when you generate an IRN or e-way bill: the invoice data.
- The language model provider, when the service has a model switched on: the text of a
  chat message that matches no built-in action, and the text or image of a bill you ask
  MyCA to read. Figures are never computed by the model.
- The WhatsApp gateway, when you send a reminder or link WhatsApp: the message and the
  recipient's number.
- The email relay, when you send an email from the app: the message and the addresses.
- Connected services you switch on yourself (for example a marketplace, payment or
  payroll system): what that connection syncs.
- Our hosting provider, Google Cloud, which stores everything above on our behalf.

Nobody else. We do not sell data and we run no advertising or analytics.

## Where it is kept, and transfers outside India

Your account and books are stored on Google Cloud in Mumbai, India, and our logs are kept
in India. Two features can send information outside India, only when you use them: the
language model provider (United States) and the email relay (a worldwide network). No
transfer goes to a country the Government of India has restricted under s.16 of the Act.

## Your rights

Under the Digital Personal Data Protection Act, 2023 you can ask what we hold and who we
shared it with, have it corrected, completed or erased, withdraw consent, nominate someone
to act for you, and complain. In the app: Your businesses, Your privacy rights
(`POST /v1/me/privacy-requests`); every request gets a reference, an acknowledgement within
48 hours and an answer within 30 days. Or write to the Grievance Officer
(https://[site]/grievance). You can download everything about a business from the
Businesses screen, delete a business there, and delete your account there or at
https://[site]/delete-account. Deleting the account withdraws consent: it disappears at once
and thirty days later the name, phone number, email and Google account link are erased for
good; signing in again within those thirty days cancels it. If you are not satisfied, you
can complain to the Data Protection Board of India.

## Children

MyCA is for people aged 18 and over. Everyone confirms they are 18 or over before using it
(`consents.adult_declared`).

## Retention and security

Books are kept while the business exists and erased thirty days after deletion. Backups are
kept for fourteen days. Security logs and the access log are kept for one year (DPDP Rules
2025), in India. Tax law asks the taxpayer to keep records for six years or more, so the
export is complete and free. Data travels over HTTPS and is stored encrypted at rest. Sign-in
codes expire in five minutes.

## If there is a breach

We tell affected people without delay, in the app and by email where known, and report to the
Data Protection Board of India and CERT-In within the times the law sets
(`docs/operations/INCIDENT-RESPONSE.md`).

## Changes

We will show a new version of this notice inside the app and ask you to accept it
before continuing when anything material changes.
