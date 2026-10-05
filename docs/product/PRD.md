# Product requirements: Taxmeow (working title)

| | |
|---|---|
| Document | Product PRD, engineering edition |
| Version | 1.0, 6 October 2026 |
| Source | The owner's PRD, "Taxmeow (working title), Product Requirements Document, v0.1", 28 September 2026 |
| Owner | Product owner (varshinicb1) |
| Status | Approved direction; individual features are specified in [`features/`](features/) |
| Code name | The repository, packages and app are still named **MyCA**. See open question Q1. |

This document restates the owner's PRD as numbered, testable requirements and records
how far each one is built. Where this document and the owner's PRD disagree, the owner's
PRD wins and this document is wrong.

## 1. Problem

A small business owner in India has to keep books, raise GST invoices, file GSTR-1 and
GSTR-3B every month or quarter, deduct and report TDS, run payroll, and chase suppliers
whose late filing costs them input tax credit. Today that means an accounting package
the owner does not understand, a CA paid to operate it, and a monthly scramble of
forwarded bills and phone calls.

## 2. Product

A headless tax and accounting assistant. There is no accounting software to learn: the
owner talks to it. It keeps the books in the background and files GST and TDS returns
once the owner approves.

## 3. Users

| User | Who they are | What they need |
|---|---|---|
| Owner | Runs a retail, B2B or service business. Not an accountant. | Spend as little time on compliance as possible, and never be surprised by a notice or a penalty. |
| Staff | Works for the owner: billing clerk, store manager. | Record sales, purchases and receipts without being able to approve a filing. |
| Chartered accountant | Engaged by the owner. | See the books without asking for exports; look only at what is flagged. |

Out of scope as a user for now: CA firms managing many clients as their primary
workflow. The Windows desktop app in `platform/` serves that case and stays local.

## 4. Principles

These are requirements, not slogans. Each one has a test in section 9.

| ID | Principle | What it rules out |
|---|---|---|
| P1 | Automation first | Any flow where the owner types a debit, a credit or an account head. |
| P2 | Simple language | Accounting or tax jargon on any owner-facing screen without a plain explanation. |
| P3 | Owner stays in control | Filing a return, sending a reminder or sending a document without an explicit approval of exactly what will go out. |
| P4 | One place for everything | Sending the owner to another product for accounting, tax, invoices or payroll. |
| P5 | Numbers come from engines | A figure produced by a language model. The model may choose a tool; a deterministic engine computes. |
| P6 | Everything is traceable | A number on a return that cannot be traced to a document, or a warning without its reason and source. |

P5 and P6 are engineering principles added by this document. They are how P3 is made
safe: an approval means something only if the figure approved is reproducible.

## 5. Functional requirements

Status is one of **Built**, **Partly**, **Not built**. "Built" means implemented and
covered by automated tests; nothing is deployed yet and nothing has filed a live return.
Percentages are engineering estimates and are tracked in
[`../superpowers/PROGRESS.md`](../superpowers/PROGRESS.md).

### 5.1 Automatic accounting ([feature spec](features/01-accounting-and-tagging.md))

| ID | Requirement | Status |
|---|---|---|
| FR-ACC-1 | Every sale, purchase, receipt, payment and expense creates balanced double-entry postings without the owner seeing them. | Built |
| FR-ACC-2 | The books always tie: total debits equal total credits, verifiable at any time. | Built |
| FR-ACC-3 | A posted entry is never edited; a correction is a new entry that refers to the old one. | Built |
| FR-ACC-4 | Credit notes, debit notes and cancelling a posted invoice. | Not built |
| FR-ACC-5 | Existing books can be brought in from Tally, Zoho Books or a bank statement. | Built |

### 5.2 Smart tagging

| ID | Requirement | Status |
|---|---|---|
| FR-TAG-1 | Sales, purchases and each GST head are placed under the right account automatically. | Built |
| FR-TAG-2 | An expense is placed under the right expense head (rent, salary, travel, and so on) from its description or its supplier. | Built: fifteen heads, a word-based tagger that says why; unknown wording goes to Other expenses with a nudge |
| FR-TAG-3 | The product remembers how a supplier or an item was tagged and reuses it. | Built, per payee and per wording |
| FR-TAG-4 | The owner can correct a tag in plain words, and the correction is remembered. | Built by tapping (a head picker before or after posting); not yet by typing |

### 5.3 Invoices, quotes and e-way bills ([feature spec](features/02-invoices-quotes-eway-bills.md))

| ID | Requirement | Status |
|---|---|---|
| FR-INV-1 | Create a tax invoice from one message, for example "Create an invoice for ABC Ltd for Rs. 50,000 for consulting services." | Built, rule-based |
| FR-INV-2 | The owner sees the invoice before it is posted and confirms it. | Built |
| FR-INV-3 | Send the invoice by email or WhatsApp after the owner checks it. | Built in the app through the phone's share sheet; not yet tried on a phone, and a share is not yet audited |
| FR-INV-4 | Create and send a quote, and turn an accepted quote into an invoice. | Not built |
| FR-INV-5 | Generate an e-way bill with the invoice when goods move. | Partly: provider client exists, not in the flow |
| FR-INV-6 | An invoice the owner can save or print as a PDF. | Built in the app; the invoice has no buyer address, and HSN codes are blank unless entered |

### 5.4 GST returns ([feature spec](features/03-gst-returns.md))

| ID | Requirement | Status |
|---|---|---|
| FR-GST-1 | Prepare GSTR-1 and GSTR-3B drafts for one tax period from the posted entries. | Built |
| FR-GST-2 | Walk the owner through the draft in chat: "Is this information correct?", answered by typing or tapping. | Not built |
| FR-GST-3 | Show the amount to pay after input credit is set off. | Not built: set-off is not implemented, so the app shows tax and credit separately |
| FR-GST-4 | File through the API only after the owner approves. | Partly: provider adapters behind the action gate, sandbox only |
| FR-GST-5 | Save the acknowledgement in the chat. | Not built |
| FR-GST-6 | Export the GSTR-1 file for the GST offline tool. | Built |

### 5.5 TDS ([feature spec](features/04-tds.md))

| ID | Requirement | Status |
|---|---|---|
| FR-TDS-1 | Warn when a payment to a supplier crosses a TDS threshold. | Built |
| FR-TDS-2 | Work out the TDS on a payment and post it. | Not built |
| FR-TDS-3 | Prepare the quarterly TDS return and take it through the same review and approval as GST. | Partly: file generation is wired to a provider; no draft or review |

### 5.6 Payroll ([feature spec](features/05-payroll.md))

| ID | Requirement | Status |
|---|---|---|
| FR-PAY-1 | Keep employees and their salary structures. | Not built |
| FR-PAY-2 | Run payroll for a month: gross, statutory deductions, net. | Not built |
| FR-PAY-3 | Pay salaries from the same product. | Not built; needs a payout partner (Q5) |
| FR-PAY-4 | Post payroll to the books and feed TDS on salary into the TDS return. | Not built |

### 5.7 GSTR-2B matching and supplier reminders ([feature spec](features/06-gstr2b-matching-and-reminders.md))

| ID | Requirement | Status |
|---|---|---|
| FR-2B-1 | Match purchase entries with GSTR-2B. | Built as an engine; 2B has to be imported as a file |
| FR-2B-2 | Flag suppliers who filed late or whose figures do not match. | Built as an engine; not shown in the app |
| FR-2B-3 | Draft a reminder to the supplier. | Not built |
| FR-2B-4 | Send a reminder only with the owner's permission. | Not built |

### 5.8 CA collaboration ([feature spec](features/07-ca-collaboration.md))

| ID | Requirement | Status |
|---|---|---|
| FR-CA-1 | The owner can invite a CA to the business. | Built |
| FR-CA-2 | The owner can export the accounting entries for a CA. | Partly: GSTR-1 file only |
| FR-CA-3 | A sync setting: the CA sees changes in real time or at set intervals. | Not built; an invited CA currently always sees live books |
| FR-CA-4 | The owner can remove a CA's access at any time. | Built |

### 5.9 Chat and dashboard ([feature spec](features/08-chat-and-dashboard.md))

| ID | Requirement | Status |
|---|---|---|
| FR-UI-1 | Chat is the main screen. | Built |
| FR-UI-2 | Chats are grouped by transaction type, one chat per customer or supplier. | Built: sales and purchases by party, expenses by head |
| FR-UI-3 | A single "one-chat" entry point that takes any message. | Built, rule-based |
| FR-UI-4 | A dashboard showing sales, purchases, taxes and payroll at a glance. | Partly: taxes only |
| FR-UI-5 | The owner can ask a doubt in plain words and get a plain answer. | Partly: fixed questions only |

### 5.10 Reading documents ([feature spec](features/09-document-capture-and-pos.md))

| ID | Requirement | Status |
|---|---|---|
| FR-CAP-1 | A forwarded or photographed supplier invoice is read automatically and becomes a purchase entry after the owner confirms. | Not built |
| FR-CAP-2 | Every POS sale creates an entry in the sales register. | Not built |
| FR-CAP-3 | Anything the product cannot read with confidence is shown to the owner as a question, not guessed. | Built for file imports |

## 6. Non-functional requirements

| ID | Requirement | Status |
|---|---|---|
| NFR-1 | Money is exact: integer paise in the ledger, rounding only on output. | Built |
| NFR-2 | Every rate, threshold and due date is a dated record with its legal citation; asking outside its dates is an error. | Built; advisor CA sign-off is open |
| NFR-3 | One business can never read or change another's data. | Built and tested for the hosted service |
| NFR-4 | Financial data is stored in India. | Designed (Mumbai region); not deployed |
| NFR-5 | Every state change records who did it, when, and the state before and after. | Built |
| NFR-6 | No plaintext secrets in code, logs, state or tool results. | Built |
| NFR-7 | Nothing reaches a government portal without the live switch and an approval bound to the exact payload. | Built |
| NFR-8 | The app can be locked with the phone's fingerprint or screen lock. | Built; not yet run on a device |
| NFR-9 | An owner can delete their account and data, subject to legal retention. | Partly: account deletion exists; retention policy is not written |
| NFR-10 | Android first, distributed through the Google Play Store. | App builds; no release build or store listing |

## 7. Out of scope

- Being the seller of record or holding customer money. The product records and files;
  it does not sit in the payment flow. See the
  [decision memo](../research/2026-10-05-taxmeow-decision-memo.md).
- Tax audit and statutory audit sign-off. These need a practising CA by law.
- Income tax return filing for the owner personally.
- iOS and web clients, until the Android app has paying users.
- Languages other than English, until the chat understands free text reliably.

## 8. Dependencies outside engineering

| Dependency | Needed for | State |
|---|---|---|
| GSP/ASP onboarding | Live GST filing (FR-GST-4) | Not started |
| NIC production credentials | E-invoice and e-way bill (FR-INV-5) | Not started |
| TDS filing provider or TIN-FC route | FR-TDS-3 | Not started |
| SMS sender with DLT registration, or Google Sign-In | Sign-in outside development | Not started |
| Google Cloud project with billing | Deployment | Not started |
| Advisor CA | Sign-off on statutory rules (NFR-2) | Not named |
| Payout partner | FR-PAY-3 | Not chosen |
| DPDP Act assessment | Launch | Not commissioned |
| Play Console account and data safety declarations | NFR-10 | Not started |

## 9. Acceptance

The product meets this PRD when all of the following hold for a pilot business over one
full tax period:

1. The owner recorded every sale, purchase and expense by message, photo or import, and
   never chose an account head. (P1, FR-ACC, FR-TAG, FR-CAP)
2. No owner-facing screen needed explaining by a CA. (P2)
3. GSTR-1 and GSTR-3B were prepared, reviewed in chat and filed, and each figure
   matches a recomputation from the invoices. (FR-GST, P5, P6)
4. Nothing left the product without a recorded approval naming the person and the exact
   content. (P3, NFR-5, NFR-7)
5. The owner's CA saw the books without receiving a file by email. (FR-CA)
6. Salaries for the month were computed and posted from the product. (FR-PAY)

## 10. Open questions

| # | Question | Who decides | Blocks |
|---|---|---|---|
| Q1 | Is the product named Taxmeow or MyCA at launch? The Play listing, app id (`in.myca.app`) and every screen depend on it. | Owner | Store listing |
| Q2 | Who may approve a live filing: the owner only, or also an invited CA? | Owner | FR-GST-4 |
| Q3 | Which language model reads documents and free text, and may documents leave India to reach it? | Owner, with the DPDP assessment | FR-CAP-1, FR-UI-5 |
| Q4 | Sign-in at launch: SMS code (needs DLT) or Google Sign-In? | Owner | Closed testing |
| Q5 | Does payroll move money, or only compute and record it? Moving money needs a regulated partner. | Owner | FR-PAY-3 |
| Q6 | Is sending by WhatsApp a share from the owner's own WhatsApp, or a business API sender in the product's name? | Owner | FR-INV-3, FR-2B-4 |
| Q7 | Which POS systems first? | Owner | FR-CAP-2 |

## 11. Revision history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-10-06 | First engineering edition, from the owner's PRD v0.1. |
