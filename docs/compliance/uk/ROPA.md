# MyCA UK: record of processing activities

UK GDPR Article 30(1), controller record. Draft 2026-11-14. Owner reviews every six months and
whenever a new processor, purpose or data type is added.

## Controller

| | |
|---|---|
| Controller | [UK entity to confirm] |
| Registered office | [UK entity to confirm] |
| UK representative (Article 27) | [Only if the controller is not established in the UK] |
| Data protection lead | [Owner to name] |
| DPO | Not required on current facts (no large-scale special category data, no systematic monitoring of public areas). **Check before publishing** once volume grows; HMRC and fraud data at scale may tip this |
| ICO registration | [number] |

## Processing activities

| # | Activity | Purpose | Data subjects | Personal data | Lawful basis | Recipients | Transfers outside UK | Retention | Security |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Accounts and sign-in | Create and secure accounts | Users (owners, accountants, staff) | Name, email, phone, Google id, device records, two-step keys (sealed), consents | Contract | Google Cloud (processor) | None planned | Account life + 30 days | Sealed keys, hashed codes, rate limits |
| 2 | Digital records and bookkeeping | Keep the user's books, invoices, receipts, statements, property records | Users; their customers, suppliers and tenants named in records | Transaction details, names on invoices, bank statement lines, documents | Contract | Google Cloud; members the user invites | None planned | Account life; deleted 30 days after a deletion request | Books sealed per business (AES-256-GCM), document hashes verified |
| 3 | Bank feed import | Bring bank transactions into the books | Users; counterparties on statements | Account name, sort code and last digits, transactions | Contract | Bank feed provider [to confirm, FCA authorised] | [to confirm] | As activity 2; feed consent ends when the user disconnects or after the bank's consent period | Provider's own controls; tokens sealed as connector secrets |
| 4 | HMRC connection | Read obligations, business details, calculations, liabilities; submit what the user approves | Users (taxpayers), agent users | UTR, NINO, VRN, HMRC data, OAuth tokens | Contract | HMRC (separate controller) | None | Tokens: until disconnect or account close + 30 days | OAuth 2.0 only, tokens sealed (AES-256-GCM), never logged |
| 5 | Submissions to HMRC (VAT 9-box return, MTD IT quarterly updates, final declaration) | Meet the user's filing obligations | Users | Return figures, identifiers, receipt ids, approver, time | Contract; supports the user's legal obligation | HMRC | None | 6 years after submission (**check**) | Approval required, audit event per submission |
| 6 | Fraud prevention headers | Send HMRC the data it requires with each MTD call | Users | Device id, IPs, port, screens, window, time zone, OS, make, model, user id, MFA method and time | Legal obligation (**check source**); fallback legitimate interests | HMRC | None | Kept with the submission record, 6 years (**check**); non-submission calls 12 months | Sent only to HMRC; never placeholders; access restricted |
| 7 | Tax estimates | Self Assessment, Class 4 NI, student loan, HICBC, dividends, savings, CGT, payments on account | Users | Income, gains, allowances, Scottish taxpayer status, student loan plan, child benefit | Contract | None | None | With the books | Deterministic engine; no figures from the AI |
| 8 | Identifier checks | Check UTR, NINO, VRN format and check digits | Users | UTR, NINO, VRN | Contract | None (local check); HMRC where an API lookup is used | None | With the books | Masked in support views |
| 9 | Reminders | Deadlines, penalty points, trial ending | Users | Email, phone, obligations | Contract | Email provider [to confirm], push service | [to confirm] | Account life | No financial figures in the message body beyond the due date |
| 10 | AI assistant | Pick the right tool for a question | Users | Messages, tool results | Contract | AI model provider [to confirm] | [to confirm] | Conversation with the books; provider keeps none beyond its abuse window [to confirm] | Identifiers masked before leaving the server; no training |
| 11 | Support | Answer questions and fix problems | Users | Messages, screenshots | Contract; legitimate interests | Support staff | [India group company if they reach UK data: IDTA] | 2 years after the ticket closes | Last characters of identifiers only |
| 12 | Payments | Plans and the Self Assessment return fee | Users | Order ids, plan, dates, last card digits (Stripe) | Contract; legal obligation (accounting records) | Google Play, Stripe | Google, Stripe [to confirm] | 6 years | No card numbers held |
| 13 | Security logs and audit trail | Detect misuse, investigate incidents, show the owner who looked at their books | Users, staff | Request logs, access log, database audit | Legitimate interests | Google Cloud | None | 180 to 365 days (DATA-RETENTION.md) | Append-only audit, restricted access |
| 14 | Crash reports | Fix errors | Users | Device model, app version, stack trace (no names, amounts or numbers) | Legitimate interests | Google Cloud | None | 90 days from last occurrence | Scrubbed at source |
| 15 | Marketing email | Product news and offers | Users and prospects who opted in | Name, email, preferences | Consent (PECR) | Email provider | [to confirm] | Until consent is withdrawn, then suppression list only | Unsubscribe in every email |

## Processors

| Processor | Role | Contract | Location | State |
|---|---|---|---|---|
| Google Cloud EMEA Limited | Hosting, database, storage, logs | Cloud Data Processing Addendum | `europe-west2` London | Owner: confirm DPA accepted on the UK project |
| AI model provider [to confirm] | Model inference for the assistant | Commercial terms with no training | [to confirm] | Owner: choose a UK or EU region if possible |
| Email relay and email provider [to confirm] | Service email | DPA | [to confirm] | Owner |
| Bank feed provider [to confirm] | Account information service | Its own FCA permissions; partner agreement | [to confirm] | Not chosen |
| Stripe | Card payments for the return fee | Stripe DPA | [to confirm] | Owner: Stripe account for the UK entity |
| Google Play | In-app subscription billing | Google Play developer terms | Global | Owner |
| Group company in India (ML Dynamic Solutions Private Limited) | Engineering and support, if they reach UK data | Intra-group DPA and IDTA | India | Owner: decide whether India staff get UK production access |

## Separate controllers we exchange data with

HMRC (for every MTD call), Google (for Google sign-in), and any accountant firm that uses the
Accountant firm plan for its own clients. Where an accountant firm uses MyCA for its clients, the
firm is the controller of its clients' records and MyCA acts as its processor; TERMS.md contains the
processing terms (Article 28) for that case. **Check before publishing.**
