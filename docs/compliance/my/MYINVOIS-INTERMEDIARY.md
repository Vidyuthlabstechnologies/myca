# MyCA as a MyInvois intermediary

Status: draft, 14 November 2026. How a Malaysian taxpayer lets MyCA submit e-invoices to LHDN for
it, what MyCA needs in production, which businesses must e-invoice, and the consolidated e-invoice
rules the app enforces.

> **Important change found while writing this (verify and update the knowledge pack).** The
> exemption threshold is no longer RM1 million. LHDN raised it to **annual turnover below
> RM3 million from 1 September 2026** (IRBM e-Invoice Guideline version 4.8, 30 August 2026,
> section 1.6.1(e); LHDN statement reported by The Star, 30 August 2026). Taxpayers between RM1m
> and RM3m who had started may stop. `platform/src/countries/knowledge/my.md` (checked 2026-11-11)
> still says RM1 million and must be corrected by the Malaysia build thread; every marketing claim
> in `docs/marketing/my/` uses RM3 million.

## 1. Who must issue e-invoices

| Phase | Annual turnover or revenue | Mandatory from |
|---|---|---|
| 1 | More than RM100 million | 1 August 2024 |
| 2 | More than RM25 million up to RM100 million | 1 January 2025 |
| 3 | More than RM5 million up to RM25 million | 1 July 2025 |
| 4 | Up to RM5 million (now: RM3 million up to RM5 million, after the exemption) | 1 January 2026 |
| Exempt | Below RM3 million (from 1 September 2026; was RM1 million from 1 January 2026, RM500,000 before) | Not required; may join voluntarily |

- Turnover is taken from the audited financial statements for financial year 2022, or the YA 2022
  tax return if there are none, pro-rated if the period was not 12 months. Once the date is set, a
  later change in turnover does not move it (Guideline, Table 1.1 notes).
- The exemption does **not** apply if a non-individual shareholder, the holding company, a related
  company or a joint venture partner has turnover of RM3 million or more (Guideline s1.6.10).
- Businesses that start after the phases use the rules in the Guideline for new businesses (the
  app asks for the business's start date and turnover and shows the answer with the rule cited).
- Voluntary adopters below the threshold may claim a deduction for qualifying implementation
  costs (up to RM50,000 a year of assessment, YA 2024 to YA 2027, as reported; counsel to confirm).
- **Interim relaxation for phase 4**: extended to **31 December 2026** (Specific Guideline v4.6,
  5 January 2026, per Grant Thornton); during it, consolidated e-invoices may be issued for all
  transactions and consolidated self-billed e-invoices for all self-billed cases, **except** that a
  single transaction over RM10,000 needs its own e-invoice. A further extension to 31 December
  2027 is reported by one secondary source; **not verified**, do not market it.
- Offence for not issuing a required e-invoice: ITA 1967 s120(1)(d), fine RM200 to RM20,000,
  up to 6 months' jail, or both, per offence (secondary; confirm).

The app's eligibility check (`my.einvoice.phase` rule) must read these as dated rules. Marketing
must not tell an exempt business it is "required" to e-invoice.

## 2. Consolidated e-invoice rules the app enforces

From the IRBM e-Invoice Specific Guideline version 4.9 (7 September 2026), section 3.6:

- Used for sales to buyers who do not ask for an e-invoice (typically consumers). The supplier
  still issues a normal receipt to the buyer.
- Submitted **monthly, within 7 calendar days after the month ends**.
- **Not allowed** (Table 3.6) for: sale of motor vehicles; flight tickets and private charters;
  construction contracts; licensed betting and gaming pay-outs (casino and gaming machine
  pay-outs exempt until further notice); payments to agents, dealers or distributors; electricity
  supply (from 1 January 2026); telecommunications postpaid plans, internet subscriptions and
  device sales (from 1 January 2026); and, for **all industries, any single transaction above
  RM10,000 (from 1 January 2026)**. Luxury goods and jewellery: on hold, consolidation allowed
  until further notice.
- Self-billed consolidation only in the cases in section 3.6.5.

From the IRBM e-Invoice Guideline version 4.8 (30 August 2026), sections 2.3.6 and 2.4.5:

- The buyer may ask to **reject** an e-invoice within **72 hours** of validation; the supplier may
  **cancel** within 72 hours with a reason. After 72 hours, corrections are by credit note, debit
  note or refund note e-invoice only.

App behaviour to check in the end-to-end test list:

| Case | Expected |
|---|---|
| Consumer sale of RM10,000.01 | App refuses to put it in the monthly consolidated batch and prompts "This sale needs its own e-invoice" |
| Consolidated batch for October | Due banner "Send October's consolidated e-invoice by Fri, 7 Nov"; overdue after 7 Nov |
| Motor vehicle dealer business type | Consolidation switched off, with the rule cited |
| Cancel on day 4 | Cancel button replaced by "Issue a credit note" |
| Business below RM3m | Home says "You don't have to e-invoice yet. You can start voluntarily." |

## 3. How a taxpayer authorises MyCA (portal steps)

MyCA acts as an **intermediary**: it logs in with its own system credentials and sends an
`onbehalfof` header with the taxpayer's TIN (or `TIN:BRN`). The taxpayer must first grant MyCA
the permissions in the MyInvois portal. Do this in the sandbox
(`preprod-mytax.hasil.gov.my`) for testing and again in production (`mytax.hasil.gov.my`).

The in-app checklist (English; Malay in the app strings):

1. Sign in to **MyTax** at https://mytax.hasil.gov.my with the director's or authorised person's
   login.
2. Choose **Role selection**, then the role for the company (for example "Directors of company"),
   then the company.
3. Open **MyInvois Portal** from the top bar.
4. From the profile menu (top right), choose **View Taxpayer profile**.
5. Scroll to **Representatives**, open the **Intermediary** tab, then **Intermediaries**.
6. Choose **Add Intermediary**. Enter MyCA's TIN, BRN and name (shown in the app with a copy
   button), search, then **Continue**.
7. Set **Representation From** and **Representation To** (the app suggests today and the
   subscription's end, or "no end date" if the portal allows).
8. Switch on the permissions MyCA needs: submit documents, cancel documents, reject documents,
   view and search documents, and the notifications permission if offered. Leave the others off.
9. Choose **Add Intermediary** to save, and check MyCA appears in the list.
10. Back in MyCA, tap **I've added MyCA**. MyCA tests the link with a token request and a
    harmless search call and shows "Connected to MyInvois" or the exact LHDN error.

Steps follow vendor guides that mirror the portal (the portal labels can change; re-check before
launch and capture screenshots for the in-app guide).

Sources (accessed 2026-11-14):
- LHDN SDK, Login as Intermediary System: https://sdk.myinvois.hasil.gov.my/api/08-login-as-intermediary-system
- ClearTax, "Add ClearTax as an intermediary on MyInvois portal": https://docs.cleartax.in/product-help-and-support/for-large-businesses/cleartax-e-invoicing-malaysia/resources/add-cleartax-as-an-intermediary-on-myinvois-portal
- Storecove, MyInvois intermediary guideline (PDF): https://app.storecove.com/myinvois_intermediary_guideline.pdf

### Alternative for a taxpayer who cannot add an intermediary

The taxpayer registers MyCA as an **ERP** under its own profile (MyInvois Portal, View Taxpayer
profile, ERP, **Register ERP**, name "MyCA", choose a duration) and pastes the client ID and
client secret into MyCA. MyCA then logs in as the taxpayer's own system (no `onbehalfof`).
This also works if MyCA has no Malaysian TIN yet, but the documents must then be signed with the
**taxpayer's own** certificate (section 5), which costs the taxpayer about RM1,500 a year. Use it
only as a fallback.

Source: BigSeller help, "How to Get Client Secret and Client ID from MyInvois System": https://help.bigseller.pro/en_US/detailPage/19/1/8736/content (accessed 2026-11-14).

## 4. MyCA's production credentials (owner and engineering)

| # | Step | Who | Notes |
|---|---|---|---|
| 1 | MyCA needs a **Malaysian TIN and BRN** to be added as an intermediary and to hold a signing certificate in its own name. The simplest route is a Malaysian company (Sdn. Bhd.) registered with SSM, then a company tax file with LHDN | Owner | Whether a foreign company with no Malaysian registration can be an intermediary is **not confirmed**; ask LHDN (MyInvois helpdesk) and counsel. Registering a foreign company branch with SSM is the other route |
| 2 | Register MyCA's own taxpayer profile in MyTax and open the MyInvois portal | Owner | Director's MyTax login |
| 3 | In the **sandbox** portal, register the intermediary system (ERP) and record the client ID and client secrets | Engineering | Already used by the Malaysia build thread for `preprod-api.myinvois.hasil.gov.my` |
| 4 | Pass the sandbox test cases: submit, get, search, cancel, reject, TIN validation, rate limits (login about 12 a minute per client; token lasts 3,600 s, reuse it) | Engineering | `platform/src/countries/malaysia/myinvois-client.mjs` |
| 5 | In the **production** portal, register the production system and get production client ID and secrets | Owner | Store only in Secret Manager (`MYCA_MYINVOIS_CLIENT_ID`, `MYCA_MYINVOIS_CLIENT_SECRET`); never in the app |
| 6 | Buy the **signing certificate** (section 5) and store the private key in Secret Manager or a KMS-backed key | Owner, then engineering | |
| 7 | Production smoke test with MyCA's own TIN (issue one real e-invoice to a friendly buyer, then cancel within 72 hours) | Owner and engineering | |
| 8 | Set expiry reminders for client secrets and the certificate (the certificate lasts 1 year) | Engineering | |

LHDN recommends separate credentials for intermediary systems rather than reusing a taxpayer's.
Login fails if the system user registered against the taxpayer is blocked or expired, so the app
must surface "Ask your director to renew MyCA's access in MyInvois" on that error.

## 5. The digital signing certificate

- Document version 1.1 must carry a digital signature (UBL 2.1 XAdES-style, or the JSON alternative
  representation), one signature per document.
- The certificate must come from a **certification authority in Malaysia** licensed or recognised
  under the Digital Signature Act 1997 (the SDK links MCMC's list). Common choices: **MSC Trustgate**
  and **Pos Digicert**.
- Certificate fields LHDN validates: CN and O = company name; C = `MY`; organisation identifier =
  TIN; serial number = BRN; Key Usage includes Non-Repudiation; Extended Key Usage includes Document
  Signing (1.3.6.1.4.1.311.10.3.12).
- It may be issued to the **document issuer** (the taxpayer) **or to an intermediary** that is an
  active representative of the taxpayer with submission permission on the issue date. In that case
  the certificate's TIN and BRN are the intermediary's, not the document's. So **one MyCA
  certificate can sign for every client**, once MyCA has a Malaysian TIN and BRN.
- Pos Digicert's e-invoice certificates (published prices, excluding 8% SST): **Soft Certificate
  RM1,500 a year** (a .p12 file kept on MyCA's server); **Roaming Certificate RM15,000 a year**
  (key held in Pos Digicert's HSM, used through an API). Recommendation: the soft certificate, key
  in Secret Manager with access limited to the signer service, rotated yearly.
- MSC Trustgate publishes an e-invoice certificate guide; get a quote from both.

Sources (accessed 2026-11-14):
- LHDN SDK, Signature: https://sdk.myinvois.hasil.gov.my/signature/
- LHDN SDK, Signature creation (JSON): https://sdk.myinvois.hasil.gov.my/signature-creation-json/
- Pos Digicert, Digital Certificate for e-Invoice: https://posdigicert.com.my/digital-certificate-for-einvoice
- MSC Trustgate, e-Invoice user guide: https://www.msctrustgate.com/eInvoice-user-guide

## 6. What MyCA promises, and what it does not

- MyCA submits an e-invoice only after the user taps **Approve and send to LHDN** on a screen that
  shows the buyer, the total, the tax and the document type.
- MyCA shows LHDN's validation result, UUID and the QR link as LHDN returns them.
- MyCA is **not** "LHDN-certified" or "LHDN-approved": LHDN does not certify software. Copy must
  say "connects to LHDN MyInvois" or "submits to MyInvois through LHDN's API".
- MyCA does not use the LHDN or MyInvois logos.

## 7. Sources for the phases, threshold and consolidated rules (accessed 2026-11-14)

- IRBM e-Invoice Guideline (version 4.8, 30 August 2026): https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Guideline.pdf
- IRBM e-Invoice Specific Guideline (version 4.9, 7 September 2026): https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Specific-Guideline.pdf
- LHDN e-Invoice General FAQs: https://www.hasil.gov.my/wp-content/uploads/lhdnm-e-invoice-general-faqs.pdf
- The Star, "Over 1.1 million businesses to benefit from higher e-invoicing threshold, says LHDN" (30 August 2026): https://thestar.com.my/news/nation/2026/08/30/over-11-million-businesses-to-benefit-from-higher-e-invoicing-threshold-says-lhdn
- Grant Thornton Malaysia, tax alert on updated e-Invoice guidelines and FAQs (30 August, 4 and 7 September 2026): https://www.grantthornton.com.my/globalassets/1.-member-firms/malaysia/publications/tax-2026/tax-alert---updated-e-invoice-guidelines-and-general-faqs---30-august-4-and-7-september-2026.pdf
- Grant Thornton Malaysia, "Updated e-Invoice Specific Guideline and General FAQs: 5 January 2026": https://www.grantthornton.com.my/insights/Tax/Tax-Alert-6-January-2026/
- RinggitPlus, "Freelancers Are Now Exempt From e-Invoicing Too" (1 September 2026): https://ringgitplus.com/en/blog/personal-finance-news/freelancers-are-now-exempt-from-e-invoicing-too.html
- Beancount.io, "Malaysia e-invoicing phase 4, RM3m exemption, RM10,000 rule" (secondary, for the 2027 relaxation claim and s120 penalty): https://beancount.io/blog/2026/09/16/malaysia-e-invoicing-phase-4-rm3m-exemption-rm10000-rule-guide
