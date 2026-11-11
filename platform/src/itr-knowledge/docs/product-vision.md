---
id: product-vision
title: Product vision for ITR-1 and ITR-2 filing
source: product-vision ("Product Vision.docx"); itr-1-guide and itr-2-guide section 5
applies-to: ITR-1, ITR-2
---

# Product vision for ITR-1 and ITR-2

ITR-1 and ITR-2 are aimed directly at individual customers. The experience should be:

- **Two or three taps to file.** Preparing and filing the return should take two or three confirmations, each with a clear confirmation message.
- **Simple clarification.** When a reconciliation error appears, ask about it in a very simple way.
- **Chat, with little typing.** For salaried people, a chat interface that feels as easy as a messaging app (not a copy of one). Wherever MyCA needs an answer, offer options to tap instead of typing.
- **Both regimes, every time.** Work out tax under the old and the new regime, show what the user owes under each, and let them pick one and file with it. The new regime is the default, but the choice stays with the taxpayer.
- **Local languages.** Speak Telugu, Tamil or Kannada like a friend, not only English.

## Behaviours the field guides require

- **Eligibility first.** Before collecting figures, check that the taxpayer can use the form, and redirect them (ITR-1 to ITR-2, ITR-3 or ITR-4; ITR-2 to ITR-3 or ITR-4) if not.
- **Regime.** Compute both regimes, explain them plainly, make the taxpayer confirm, then enforce that regime's rules for the rest of the return (block deductions it does not allow). The regime cannot be changed after the section 139(1) due date.
- **Pre-fill from AIS** at the start of each session and reconcile every document against it (see form16-vs-ais).
- **Read documents**, including scanned images: Form 16 Parts A and B, bank interest certificates, home loan interest certificates, premium receipts and broker capital gains statements. Flag any figure read with low confidence for the taxpayer to check.
- **Deduction interdependencies.** 80C, 80CCC and 80CCD(1) share one cap; 80CCD(1B) is a separate cap on top; 80EE and 80EEA cannot both be claimed; 80TTA and 80TTB are mutually exclusive by age; HRA under 10(13A) and 80GG cannot both be claimed for the same period. Check after each entry and alert at once.
- **ITR-2 extras.** Split long-term capital gains by transfer date (before or on/after 23 July 2024); pre-fill brought-forward losses (Schedule CFL) with a reason for any override; block HUF-ineligible deductions and Schedule ESOP for a HUF; zero 80QQB and 80RRB if filed after the due date; block NRI-ineligible schedules and deductions automatically.

## Open items the source leaves for discussion (ITR-2)

1. Schedule VDA: a KoinX-like aggregation tool, its data format, and who is liable for its calculations.
2. Schedule FSI (foreign income): which foreign documents MyCA accepts and how.
3. Schedule TR (DTAA relief): Form 67 is a prerequisite; whether MyCA guides its filing or only checks it.
4. Schedule 5A (Portuguese Civil Code, Goa, Daman and Diu): self-declaration or a review step.
