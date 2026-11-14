# MyCA UK: data protection impact assessment

Draft 2026-11-14, following the structure of the ICO's sample DPIA template. Covers two things:
(A) handling taxpayers' HMRC data and making MTD submissions, and (B) the AI assistant. Owner signs
section 8 before launch; review again before production HMRC access is switched on and after any
change to the model provider, the hosting region or the fraud prevention data.

## 1. Why a DPIA is needed

- Large volumes of financial data and national identifiers (NINO, UTR, VRN) about individuals who
  are sole traders and landlords, so the data is personal data, not company data.
- Data matched with a government system (HMRC) and used for legal obligations; an error can cost
  the person penalties.
- Device and network data collected on every MTD call (fraud prevention headers), which is a form
  of tracking the person may not expect.
- New technology: a language model in the loop, even if limited to choosing tools.
- Possible transfers outside the UK (model provider, support access).

The ICO lists "innovative technology" combined with other criteria, and processing of financial
data at scale, as indicators. A DPIA is the safe position.

## 2. The processing

**Nature.** Users enter, import or photograph their records. The engine (`platform/src/countries/
united-kingdom/`) keeps the digital records, builds the VAT 9-box return and the MTD Income Tax
quarterly cumulative updates for self-employment and UK property, asks HMRC for in-year and final
calculations, and sends the final declaration. Every submission waits for the person's approval.
Tokens from HMRC (OAuth 2.0) are sealed and stored. Fraud prevention data is collected from the
phone and the server for each HMRC call.

**Scope.** Categories in ROPA.md activities 2 to 10. Target: tens of thousands of users in year
one. Data stays in Google Cloud London. Retention per DATA-RETENTION.md.

**Context.** Users are adults running a business or letting property, some of them less confident
with technology, who are compelled by law to use MTD software. They expect their accounting app to
talk to HMRC, but may not expect device data to go with each call. Accountants may act for many
clients.

**Purposes.** Help users keep digital records and meet MTD obligations accurately and on time.

## 3. Consultation

- HMRC's published requirements (terms of use, fraud prevention guidance) are the main external
  input (gb.md).
- [Owner: run five usability sessions with UK sole traders and landlords on the HMRC connect screen
  and the fraud data explanation, and record findings here.]
- [UK solicitor review of this DPIA.]
- Processors' security documentation (Google Cloud, model provider).

## 4. Necessity and proportionality

- **Lawful basis**: contract for the service; legal obligation (**check source**) for fraud
  prevention data. Marketing only on consent.
- **Minimisation**: the app asks only for what HMRC calls need. NINO is asked only when the person
  joins MTD Income Tax; VRN only for VAT. Fraud data is exactly the set HMRC lists for
  `MOBILE_APP_VIA_SERVER`, nothing more (no contacts, no location, no advertising id).
- **Accuracy**: identifiers are checked for format and check digits before use; HMRC's own
  calculation is shown beside MyCA's estimate.
- **Transparency**: privacy notice, a plain screen before HMRC connect, the fraud data page.
- **Rights**: export, correct, disconnect and delete in the app.
- **Processors**: written contracts; UK hosting.
- **Transfers**: none planned for stored data; limited exceptions listed in the privacy notice
  with safeguards.

## 5. Risks

Likelihood: remote, possible, probable. Severity: minimal, significant, severe.

| # | Risk to individuals | Likelihood | Severity | Overall |
|---|---|---|---|---|
| A1 | Theft of HMRC tokens lets an attacker read a person's tax data or file in their name | Possible | Severe | High |
| A2 | A database breach exposes NINOs, UTRs and financial records (identity fraud, embarrassment) | Possible | Severe | High |
| A3 | A wrong figure is submitted to HMRC (penalties, interest, stress) | Possible | Significant | Medium |
| A4 | A submission is made without the person's real approval (staff member, compromised phone) | Remote | Severe | Medium |
| A5 | Fraud prevention data is used for something other than HMRC, or kept too long | Remote | Significant | Low |
| A6 | An accountant sees clients they should not, or a staff member sees more than their role allows | Possible | Significant | Medium |
| A7 | Deadline reminder fails and a person collects penalty points | Possible | Significant | Medium |
| A8 | Records are deleted before the 5-year HMRC period and the person cannot answer an enquiry | Possible | Significant | Medium |
| B1 | The AI assistant states a tax figure or rule that is wrong, and the person relies on it | Possible | Significant | Medium |
| B2 | Personal data in prompts is retained or used for training by the model provider | Remote | Significant | Low |
| B3 | Prompts are processed outside the UK without a safeguard | Possible | Significant | Medium |
| B4 | Prompt injection in an uploaded document makes the assistant run an unwanted tool | Possible | Significant | Medium |
| B5 | People think the assistant is a qualified adviser | Possible | Significant | Medium |

## 6. Measures

| Risk | Measure | Effect | Residual |
|---|---|---|---|
| A1 | OAuth 2.0 only, never HMRC credentials; tokens sealed with AES-256-GCM per business under a key in Secret Manager; never logged or returned to the app; short-lived access tokens; disconnect deletes them; two-step sign-in required before submitting | Reduced | Low |
| A2 | Books sealed per business; TLS 1.2+; least-privilege production access; pgaudit; pen test; ISO 27001 and SOC 2 controls extended to the UK stack; backups encrypted | Reduced | Medium |
| A3 | Deterministic engine owns every figure; HMRC's calculation shown beside ours; review screen listing every box; free fix-and-refile if the error is ours (TERMS.md); regression tests against HMRC sandbox scenarios | Reduced | Low |
| A4 | Only the owner role (or an accountant the owner authorises for that business) can approve; approval is a separate tap after review; audit event with who, device and time; two-step sign-in | Reduced | Low |
| A5 | Headers sent only on HMRC calls; stored only inside the sealed submission record; not used for analytics; retention limited | Reduced | Low |
| A6 | Roles owner, accountant, staff (`cloud/src/members.mjs`); per-business isolation; access log the owner can read | Reduced | Low |
| A7 | Obligations read from HMRC, not guessed; reminders at 14, 7 and 1 days by push and email; the app shows penalty points HMRC reports | Reduced | Low |
| A8 | Warning and full export before account closure; read-only export window after a subscription ends (DATA-RETENTION.md) | Reduced | Low |
| B1 | Assistant may only call tools; numbers in its replies come from tool results; every reply that quotes a figure shows where it came from; it says when it does not know | Reduced | Low |
| B2 | Provider terms with no training on API data; minimal retention [to confirm]; identifiers (NINO, UTR, VRN, bank details) masked before leaving the server | Reduced | Low |
| B3 | Choose a UK or EU region for the model if available; otherwise a transfer safeguard before launch | Reduced | Low once done |
| B4 | The assistant cannot submit to HMRC or pay; state-changing tools need the person's confirmation; document text treated as data | Reduced | Low |
| B5 | Assistant labelled as software, not an accountant; terms say MyCA is not tax advice | Reduced | Low |

## 7. Open items before sign-off

1. Model provider and region (B2, B3).
2. Whether staff outside the UK get production access (A2 and transfers).
3. Retention period for submission records and fraud data confirmed by counsel.
4. Usability findings on the fraud data explanation (section 3).
5. Pen test report (A1, A2).

## 8. Sign-off

| Item | Name and date | Notes |
|---|---|---|
| Measures approved by | | |
| Residual risks approved by | | If any stay high, consult the ICO before launch (Article 36) |
| DPO or adviser advice | | |
| Next review | | Before production HMRC access, then yearly |
