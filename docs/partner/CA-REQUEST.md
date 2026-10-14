# What MyCA needs from the partner CA firm

Prepared 14 October 2026 for the firm validating MyCA as case-study partner. Everything
below is something only a practising chartered accountant can give us; nothing here
asks for money, and no credential is ever to be sent in writing. Each item says why we need it, what form to
send it in, and what it unblocks. The reference material is the validation brief
(`docs/partner/myca-validation-brief.html`) and `docs/product/RULES-CURRENCY.md`.

## 1. Attestation of the statutory rules (highest value, about two days of review)

MyCA holds every statutory figure as a dated record with its act, section and source.
None of the 98 rule ids (177 records) has been reviewed by a CA yet, so every figure in
the app carries a "not reviewed" note. Your attestation removes that note for your
clients.

| Family | Ids | What to check against |
|---|---|---|
| GST rates, thresholds, set-off order, interest, late fee, ITC blocks (s.17(5)), e-way bill threshold | 12 | CBIC central tax and rate notifications; CGST Rules 36, 37, 37A, 61, 88A, 138 |
| TDS sections 194A, 194C, 194I, 194J, 192, no-PAN rate, thresholds from 1 April 2025 | 16 | Finance Act 2025; CBDT circulars |
| Income tax slabs, rebate, surcharge, cess (new and old regime, FY 2024-25 to 2026-27) | 15 | Finance Act First Schedule; Income-tax Act 2025 |
| Tax audit and presumptive limits (44AB, 44AD, 44ADA) | 2 | Finance Act amendments |
| Return due dates and rollover: GSTR-1, GSTR-3B, QRMP day by state, TDS statements, ITR | 20 | CBIC and CBDT notifications |
| Gazetted holidays 2026 | 2 | DoPT memorandum |
| EPF and ESI: rates, wage ceilings, administrative charges | 7 | EPFO and ESIC circulars |
| Professional tax slabs for fifteen states | 15 | Each state's commercial tax department |

**How to send it.** For each rule id, one line: the id, `verified` or `disputed`, the
date you checked it, and for a dispute the correct figure and its notification. A
spreadsheet with four columns is enough; we convert each line into the record's
`attestations` entry under your firm id. The ids and their current values are listed by
the `rules_status` tool and in the brief.

**Unblocks:** the "not reviewed" note on every figure; the GST review, payroll and TDS
screens being usable in front of a client without a caveat.

## 2. Figures only a person can supply (these are missing today)

| Item | Why we cannot add it ourselves | What to send |
|---|---|---|
| Professional tax schedules for Meghalaya, Manipur, Mizoram, Nagaland, Sikkim and Tripura | The secondary sources contradict each other and nothing reliable was found for Tripura, so nothing was encoded rather than guess | The state notification or the slab table with its notification number and date, per state |
| Gazetted holiday calendar for 2027 | The DoPT memorandum for 2027 has to be read by a person; the current records end on 31 December 2026 and the nightly check flags this | The memorandum reference and the list of compulsory and restricted holidays for Delhi |
| GSTR-9 table 5 split | MyCA sees lines invoiced at 0% but cannot tell nil-rated from exempt from non-GST supplies | Your rule for how a client's 0% lines should be classified, by HSN or by description, if one exists in your practice |
| Any rate or threshold change announced after 14 October 2026 | We watch the sources monthly, but you will hear first | A line to engineering with the notification number |

## 3. Government and provider access (your firm holds these)

Live filing, e-invoicing and GSTR-2B fetch run only through credentials that a registered
practitioner or the taxpayer holds. We ask your firm, not the client, to arrange them.

| Access | What we need | How it is used |
|---|---|---|
| GSP / ASP onboarding (Sandbox by Quicko, or the GSP your firm already uses) | The live API key and secret for the firm's GSP account, and the GSTINs it is authorised for | GSTR-1 and GSTR-3B save and file, GSTR-2B fetch; every call goes through the action gate and needs a CA approval in the app |
| NIC e-invoice (IRP) | Registration of each client GSTIN on `einvoice1.gst.gov.in` with API access, the API user id and password, and the production public key (.cer) | IRN generation and cancellation, e-way bill from the IRN |
| GST portal | Confirmation of which clients the firm is authorised to file for (the engagement letter or authorisation on the portal); no portal password is ever asked for or stored | Deciding which business may be filed from the app |
| TRACES / TDS | The firm's TAN registration and the FVU route it uses (provider or utility) | Quarterly TDS statements and Form 16 / 16A issue |
| A sandbox set first | Sandbox credentials for the GSP and the NIC sandbox before any production key | Every flow is exercised against the sandbox and signed off by you before the live switch is turned on |

**How to hand them over.** Never by email, chat or a shared document. Either enter them
yourself on the Integrations screen of the app, where they are encrypted at rest and
never leave the machine, or hand them to the owner in person for the same screen. The
app refuses to send a credential anywhere until the live switch is on, and that switch
stays off until your firm has signed off the sandbox run.

## 4. Review of the method, not the figures (about half a day)

Please read these and say where a CA would do it differently:

1. **GST set-off** (`platform/src/gst-set-off.mjs` and the GST review screen): the order
   of utilisation of IGST, CGST and SGST credit, credit brought forward, interest at 18%
   on net cash liability and the late fee cap.
2. **Invoice amendments after filing**: the difference is posted to the books in the
   month of the amendment and the GSTR-1 of that month carries B2BA, B2CLA or B2CSA with
   the original number and date; the filed month is never regenerated with new figures.
3. **Credit notes against B2CS sales** netted in table 7, and the rule that a credit
   note cannot exceed what is outstanding on the invoice.
4. **Payroll**: PF on basic and dearness allowance up to the ceiling, ESI below the wage
   limit, professional tax by work state, salary TDS by the new regime unless the
   employee opts out, proration by days.
5. **Form 16, 16A and Annexure II of 24Q** drafts: the figures come from approved payroll
   months and recorded challans; tell us what TRACES would reject.
6. **GSTR-9 draft**: tables 4, 6, 7, 8, 9, 17 are filled from the books; 5 is partial; 4F
   advances and portal-side amendments are not.

Send comments as a numbered list against these six points. A one-line "this is how a CA
would do it" per point is more useful than a long note.

## 5. A test client we can both look at (one afternoon)

A real but closed financial year of one consenting client, anonymised, as:

- the Tally day book export (XML or the Excel day book) or a Zoho Books CSV;
- the bank statement CSVs for the year;
- the GSTR-1 and GSTR-3B JSON files as filed, and the GSTR-2B JSON for each month;
- the TDS statement and challans for the year;
- the payroll register if the client runs payroll.

We import it, regenerate every return, and compare line by line with what was filed
(`npm run shadow` does the comparison). Every difference is either our bug or a
judgement your firm made; both are what the case study is for.

## 6. Decisions where your view decides the product

| Question | Why it matters |
|---|---|
| Should MyCA ever compute salary TDS from investment declarations, or always take the amount the firm sets per employee? | Today it computes under the new regime from the salary alone and the firm can override |
| When a client's GSTR-2B shows credit the books lack, should the app post a suggested purchase, or only flag it? | Today it only flags (credit at risk by supplier) |
| How far ahead should the app remind a client before a due date: seven days, fourteen, or your firm's own calendar? | Today reminders are created fourteen days ahead and the week ahead shows seven |
| What should a client see about their accountant's work: nothing, "sent to CA", or the CA's comments? | Today the client sees requests to the CA and the CA's replies, and the shared books as of the last sync |
| Would your firm sign in to MyCA to review clients, or only receive files? | Decides whether the firm-side screens get more work |

## 7. What you will receive from us

- Read access to the repository and the validation brief.
- A build of the Windows app and the Android test build, with a demo business.
- The `rules_status` inventory as a spreadsheet to attest against.
- Every difference found in the test-client comparison, written up with the figure the
  app produced, the figure filed and the rule each came from.

## 8. Timing

| When | What |
|---|---|
| Week 1 | Items 2, 3 and 5: the missing schedules, the sandbox credentials and the test client's files |
| Week 2 | Item 1: attestation of the GST, TDS and due-date families first; payroll and income tax after |
| Week 3 | Item 4: the method review, and the comparison meeting on the test client |
| Then | Item 6 in one conversation; production credentials once the sandbox run is signed off |
