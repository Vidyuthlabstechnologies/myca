# MyCA Malaysia: Play Data safety answers

Answers for the Play Console Data safety form for `com.mldynamic.myca.my`, in the form's order.
Based on the India sheet (`docs/release/DATA-SAFETY.md`), changed for what the Malaysia app does:
MyInvois instead of NIC and the GST Suvidha Provider; NRIC and passport numbers on e-invoice
parties and in the income tax estimate; no Plaid, no Indian connectors. Re-check whenever a feature
starts sending data somewhere new.

Definitions used (Play Console Help, "Provide information for Google Play's Data safety section",
https://support.google.com/googleplay/android-developer/answer/10787469, accessed 2026-11-14):
"collected" means sent off the device; transfers to **service providers** acting on MyCA's
instructions and **user-initiated** transfers the user expects are not "sharing".

## Overview

| Question | Answer | Why |
|---|---|---|
| Does the app collect or share any of the required user data types? | Yes | Below |
| Is all user data encrypted in transit? | Yes | HTTPS only to the API; MyInvois calls are server-to-server over TLS |
| Can users request that their data be deleted? | Yes | In the app (Delete my account, Delete this business) and on the web delete-account page. Erased 30 days after the request |
| Independent security review (MASA)? | No | |
| Designed for children? | No | Business owners, 18 and over |

## Data types

| Play data type | Collected | Shared | Required / optional | Purposes | Notes |
|---|---|---|---|---|---|
| Personal info: Name | Yes | No | Required | Account management, App functionality | Shown on audit trail and invitations |
| Personal info: Email address | Yes (Google sign-in) | No | Optional if phone sign-in is offered | Account management | |
| Personal info: User IDs | Yes | No | Required | Account management | Server user id, Google subject id |
| Personal info: Phone number | Only if phone sign-in is enabled for Malaysia | No (SMS provider is a service provider) | Optional | Account management | |
| Personal info: Address | Yes, business and party addresses on e-invoices | No (LHDN submission is user-initiated) | Optional | App functionality | LHDN's e-invoice schema requires addresses |
| Personal info: Other info | Yes: TIN, BRN, NRIC or passport numbers of the user and of e-invoice parties; SST registration number | No (sent to LHDN MyInvois only when the user approves an e-invoice: user-initiated) | Optional (required for e-invoices) | App functionality | NRIC masked before any model call |
| Financial info: Purchase history | Yes: Play subscription token and plan | No | Optional | App functionality (entitlement) | MyCA never sees card details |
| Financial info: Other financial info | Yes: the books, e-invoices, SST figures, income and reliefs for the estimate | No (LHDN submission user-initiated; model provider is a service provider) | Required (it is the product) | App functionality | Sealed per business |
| Photos and videos: Photos | Only a bill photo the user picks | No (model provider is a service provider) | Optional | App functionality | |
| Files and docs | Bills, statements, backups the user chooses | No | Optional | App functionality | |
| Messages: Other in-app messages | Yes, chats with Ask Bahi | No (model provider is a service provider) | Optional | App functionality | |
| App info and performance: Crash logs | Only if switched on | No | Optional, off by default | Analytics | Scrubbed on device and server; 90 days |
| Device or other IDs | Yes: random device id made by the server | No | Required | Account management, Security | No hardware or advertising id |
| Location, Contacts, Calendar, Health, Audio, Web history, App activity, Installed apps, Contacts | No | | | | |

## Recipients (for our own records; not "sharing" in Play's sense)

| Recipient | Role | What | When |
|---|---|---|---|
| Google Cloud, Singapore | Service provider (hosting) | Everything collected | Always |
| Google (sign-in, Play) | Service provider / platform | Sign-in token, purchase token | Sign-in, subscription |
| LHDN MyInvois | Government system, user-initiated | E-invoice documents, TIN validation queries | Only when the user approves an e-invoice or adds a party |
| AI model provider (United States) | Service provider | Chat text, bill images, with NRIC masked | Only when the user asks Bahi or reads a bill |
| Email / SMS provider | Service provider | Address, message text | Sign-in codes, notifications |

## Consistency checks before submitting

- [ ] The privacy notice (`docs/compliance/my/PRIVACY-NOTICE.md`) lists the same recipients.
- [ ] No analytics or ads SDK is in the `my` flavor build (`flutter pub deps` and the merged
      manifest checked).
- [ ] The web delete-account page names MyCA Malaysia and works without the app.
