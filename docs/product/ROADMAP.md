# Roadmap

| | |
|---|---|
| Version | 1.0, 6 October 2026 |
| Basis | The [product PRD](PRD.md); progress in [`../superpowers/PROGRESS.md`](../superpowers/PROGRESS.md) |
| Status | Engineering's proposed order. No dates: the pace depends on owner actions listed at the end. |

About 68% of the PRD is built. The order below is chosen so that each milestone gives a
pilot owner something usable, and so that work blocked on outside parties is not on the
critical path of work that is not.

## Milestones

### M1. Daily use on a phone

The owner can do a normal day's work in the app.

| Item | Requirement | Depends on |
|---|---|---|
| Invoice screen, save as PDF, share by WhatsApp or email (**done** 2026-10-06; audit of a share still to do) | FR-INV-3, FR-INV-6 | Nothing |
| Expense heads and the tagger, expense chats (**done** 2026-10-06) | FR-TAG-2 to 4, FR-UI-2 | Nothing |
| Credit notes, debit notes and cancelling an invoice (**done** 2026-10-06 and 2026-10-12) | FR-ACC-4 | Nothing |
| Dashboard: sales, purchases, expenses, owed and owing (**done** 2026-10-06; owing to suppliers added with supplier payments) | FR-UI-4 | Nothing |
| Run on a real phone and fix what breaks | NFR-10 | A phone on USB |

### M2. The return, reviewed

The owner can take a month's GST from draft to a file ready for the portal, in chat.

| Item | Requirement | Depends on |
|---|---|---|
| Review cards with "Is this information correct?" (**done** 2026-10-06) | FR-GST-2 | M1 credit notes |
| Set-off rules and the amount to pay (**done** 2026-10-12; labelled unreviewed until the advisor CA attests the rules) | FR-GST-3 | Nothing |
| GSTR-2B upload, credit at risk in the app (**done** 2026-10-06) | FR-2B-1, FR-2B-2 | Nothing |
| Supplier reminder drafts sent from the owner's own apps (**done** 2026-10-07, share sheet) | FR-2B-3, FR-2B-4 | PRD Q6 answered for now: the owner's own apps |
| Entries export for a CA (**done** 2026-10-06, spreadsheet; Tally format to come) | FR-CA-2 | Nothing |

### M3. Hosted pilot

Real businesses, real data, closed testing on the Play Store.

| Item | Requirement | Depends on |
|---|---|---|
| Deploy: Terraform, Cloud Run, Cloud SQL, storage, backups, monitoring | NFR-4 | Google Cloud project |
| Sign-in for real users | ADR-0008 | SMS registration or Google Sign-In (PRD Q4) |
| Privacy notice, consent, retention, staff access log | NFR-9 | DPDP assessment |
| Release build, signing, store listing, data safety form | NFR-10 | Play Console account; name (PRD Q1) |
| Proposals per member; staff role narrowed | | Nothing |

### M4. Reading documents

| Item | Requirement | Depends on |
|---|---|---|
| Photograph or forward a supplier invoice | FR-CAP-1 | Model decision (PRD Q3) |
| Free-text chat through tool selection | FR-UI-3, FR-UI-5 | Model decision |
| Evaluation set of messages and documents | ADR-0004 | Pilot data, with consent |

### M5. Filing for real

| Item | Requirement | Depends on |
|---|---|---|
| Live GSTR-1, then GSTR-3B | FR-GST-4, FR-GST-5 | GSP/ASP onboarding; PRD Q2 |
| E-way bill and e-invoice in the invoice flow | FR-INV-5 | NIC production credentials |
| TDS on entries, quarterly draft and review (**done** 2026-10-12; filing through the provider to come) | FR-TDS-2, FR-TDS-3 | Nothing |
| Sync setting for accountants (**done** 2026-10-07) | FR-CA-3 | Nothing |

### M6. Payroll and POS

| Item | Requirement | Depends on |
|---|---|---|
| Payroll step 1: compute and record (employee records **done** 2026-10-07; the run waits for the rules) | FR-PAY-1, 2, 4 | Advisor CA verification |
| Payroll step 2: statutory files | FR-PAY-4 | Step 1 in use |
| Payroll step 3: payouts | FR-PAY-3 | Payout partner (PRD Q5) |
| POS inbound API and daily summary import | FR-CAP-2 | A POS partner (PRD Q7) |
| Quotes (**done** 2026-10-06) | FR-INV-4 | Nothing |

## Matching and beating Spark

The owner's goal is to lead this sector. Lighthaus's assistant, Spark, shows four things on
its public page. Each maps onto work here, with how ours should be better.

| Spark shows | Ours, built or planned | How ours is better |
|---|---|---|
| Invoice from one WhatsApp message: GST-correct, buyer GSTIN verified, payment terms from the PO, "shall I send it?", sends, generates the IRN, books the entry | Invoice by message with preview and confirm, PDF, share sheet (built). To build: payment terms on the customer, IRN in the flow (needs NIC credentials), WhatsApp as an input channel | The owner sees every figure before it posts; the GST rate is never guessed but offered from what this customer was charged before; the GSTIN is checked by its checksum before anything is sent |
| "Can I afford ₹40L of stock in September?" answered with a cash projection and a suggested split | Not built. Needs a cash position and forecast engine first (balances, receivables, payables, recurring expenses) | Every number in the answer comes from that engine with the entries behind it, so the owner can see why; the model only chooses the question |
| Hindi or Hinglish question about a marketplace payout; matched to bank; a pending claim tracked; "remind me" | Not built: settlement matching, Hindi, reminders | Reminders are small and come first. Hindi follows the language model decision. Settlement matching only if marketplace sellers become a target (open question) |
| Voice or text, English, Hindi, Telugu, on WhatsApp or Slack; answers auditable; Excel on demand; escalates to an accountant | English text in the app; every answer from a named tool; entries CSV (built) | Escalation goes to the owner's own CA inside the product, with the entries attached; nothing goes out without approval |

Order, after M2: (1) remind-me follow-ups (**done** 2026-10-06, in the app; phone notifications wait for deployment), (2) cash position and forecast tool (**done** 2026-10-06), (3) invoice
terms (**done** 2026-10-06) and IRN in the flow (needs NIC credentials), (4) the language model selecting tools under ADR-0004, which
unlocks free text, Hindi and voice, (5) WhatsApp as an input channel once PRD Q6 is
answered, (6) "send this to my CA" on any finding (**done** 2026-10-06 as "Ask my CA").

## What can start today with nothing from anyone

All of M1 except device testing; in M2 the review cards, the 2B upload and the entries
export; in M3 the proposals and role changes; quotes.

## Owner actions that unblock the rest

| Action | Unblocks |
|---|---|
| Decide the launch name | Store listing, application id |
| Create a Google Cloud project with billing | M3 |
| Start SMS sender registration, or choose Google Sign-In | M3 |
| Name the advisor CA | Payroll, and sign-off on every existing rule (set-off and TDS then lose their "not reviewed" label) |
| Commission the DPDP assessment | M3, and the model decision |
| Choose the model and where it may run | M4 |
| Start GSP/ASP and NIC production onboarding | M5 |
| Decide who may approve a filing | M5 |
| Recruit two or three pilot businesses | M3, M4 |
| Connect a phone | M1 device testing |
| Restore GitHub Actions, or accept the local gate | Automated checks on every change |

## Not on the roadmap

iOS, web, regional languages, voice, inventory, income tax return filing, notices and
appeals, a CA-firm console in the hosted service.
