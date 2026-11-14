# MyCA UAE: compliance register

Written 2026-11-14 for the separate UAE app (`com.mldynamic.myca.uae`, "MyCA UAE"). It covers what
the law and the stores ask of MyCA in the UAE, what the app and the marketing may and may not say,
and what only the company can do. It is a working register, not legal advice: before the app is
sold, a UAE-qualified lawyer reviews sections 1, 2 and 7, and a registered tax agent reviews
sections 3 to 6.

Sources are marked **primary** (the law, a ministry, the FTA, the official government portal,
Google) or **secondary** (law firms, Big Four alerts, news). Every secondary point has a recheck
note. Dates are when the source was read (2026-11-14) unless another date is given.

## Product facts this register assumes

| Fact | Today |
|---|---|
| Who sells | ML Dynamic Solutions Private Limited (India). No UAE entity or free-zone licence yet |
| Who it is for | UAE businesses and the tax agents and accounting firms that serve them. No personal income tax features (the UAE has none) |
| What it does | Books, VAT 201 preparation, Corporate Tax return preparation, Small Business Relief and Qualifying Free Zone Person checks, e-invoice readiness (PINT AE data), English and Arabic with right-to-left layout |
| What it does not do | File on EmaraTax (there is no filing API; the business or its tax agent files), act as a tax agent, send e-invoices over Peppol (no Accredited Service Provider is contracted), move or hold money |
| Mode | Sandbox. E-invoices are validated and shown, never transmitted |
| Hosting | Google Cloud, Doha, Qatar (`me-central1`) until an in-UAE region is contracted (AWS `me-central-1` or Azure UAE North) |
| Payments | Google Play billing for the software subscriptions: Starter AED 299, Business AED 799, Firm AED 2,499 a month |

## 1. Federal data protection law (PDPL)

**Law:** Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data, in force
2 January 2022. It applies to processing of personal data of anyone resident or with a place of
business in the UAE, and to controllers and processors inside or outside the UAE who process the
data of UAE data subjects. So MyCA, an Indian company hosting in Qatar, is inside its scope.
Primary: https://u.ae/en/about-the-uae/digital-uae/data/data-protection-laws (page updated
4 December 2025).

### 1.1 Status of the regulator and the executive regulations

- The Executive Regulations were due within six months of publication and are still not issued
  as of the sources read. Timelines for breach notice, the transfer controls and DPO details that
  the law leaves to them therefore remain undefined. Secondary:
  https://www.kayrouzandassociates.com/insights/cross-border-data-transfers-under-uae-law-in-2026
  (February 2026) and Morgan Lewis, June 2026 (below).
- The regulator in the law is the UAE Data Office (Federal Decree-Law No. 44 of 2021). Primary:
  the u.ae page above. On 14 June 2026 a new Federal Authority for Artificial Intelligence and
  Data was announced that absorbs the Emirates Data Office; private-sector enforcement has so far
  been limited. Secondary:
  https://www.morganlewis.com/pubs/2026/06/uae-establishes-federal-authority-for-artificial-intelligence-and-data
  **Recheck monthly** until the regulations appear; when they do, update this section, the
  privacy notice and the breach runbook in the same change.
- Fines: AED 50,000 to AED 5 million are widely reported but depend on a Cabinet decision.
  Secondary (Kayrouz, above). Treat as indicative.

### 1.2 Controller or processor

| Data | MyCA's role | Why |
|---|---|---|
| Account data: name, email, phone, device id, plan, support messages | Controller | MyCA decides why and how |
| The business's books: its customers', suppliers' and employees' names, TRNs, emails, phone numbers, salaries | Processor for the business | The business decides what goes in and why; MyCA processes on its instructions |
| Crash reports (opt-in), audit trail | Controller | Security and service quality |

The terms of service must contain a processing clause (PDPL Art. 8): act only on the customer's
instructions, keep it confidential, secure it, tell the customer of a breach "as soon as it
becomes aware" (Art. 9(3)), return or delete at the end, list sub-processors.

### 1.3 Lawful basis and consent

The PDPL starts from consent (Art. 4) and lists exceptions; there is no general "legitimate
interests" ground as in the GDPR. The exceptions MyCA relies on are: processing needed to perform
a contract the data subject is party to, and processing needed to meet obligations under UAE law
(tax record keeping). Secondary for the article list:
https://www.twobirds.com/en/insights/2021/uae/how-does-the-new-uae-federal-decree-law-on-personal-data-protection-compare-against-the-gdpr

| Processing | Basis |
|---|---|
| Sign-in, the books, VAT and CT preparation, subscription | Contract with the account holder |
| Keeping books and tax records for the statutory periods (section 3) | Legal obligation under UAE tax law |
| Crash reports | Consent: unticked box, off by default (already how the app works) |
| Sending bill images or unmatched chat text to the model provider | Contract (the user asks for the feature), plus a plain notice at the point of use |
| Marketing email or WhatsApp | Consent, separate from sign-up, withdrawable in one tap. The Consumer Protection Law also limits using consumer data for marketing (section 5) |
| Hosting in Qatar | See 1.6 |

Consent rules (Art. 6): specific, clear, unambiguous, given by a clear positive act, provable,
and withdrawable as easily as it was given. No pre-ticked boxes; keep the consent record with a
timestamp and the notice version.

### 1.4 Data subject rights

Rights to: information about the processing (Art. 13), receive and transfer the data in a
readable form (Art. 14), correction and erasure (Art. 15), restriction (Art. 16), stop or object
to processing including direct marketing (Art. 17), and not be subject to purely automated
decisions with legal effects (Art. 18). Secondary for article numbers (Bird & Bird, above).

What MyCA already has: export of a whole business as one file, deletion of a business and of the
account with erasure 30 days later, in-app correction. What to add for the UAE: a rights request
address on the privacy notice, a 30-day response target (no statutory deadline until the
regulations set one), and a check that a deletion request leaves alone the records the business
must keep by law (section 3). For data where MyCA is processor, requests from the business's own
customers or staff are passed to the business.

Automated decisions: the AI assistant and bill reader suggest entries; the person confirms every
entry and every return. Keep it that way, and say so in the notice; it keeps MyCA outside Art. 18.

### 1.5 Security, breach notice, DPIA, records

- Security (Art. 20): encryption in transit and at rest, least-privilege access, audit trail, as
  `docs/architecture/SECURITY-AND-PRIVACY.md` already sets out.
- Breach (Art. 9): the controller notifies the Data Office of a breach that prejudices privacy,
  confidentiality or security, with its nature, causes, likely effects, the DPO's contact and the
  measures taken, and tells affected data subjects. A processor tells the controller as soon as it
  becomes aware. No hour limit yet. MyCA's rule: tell affected UAE customers within 72 hours of
  confirming a breach (matching DIFC/ADGM practice), and notify the Data Office or its successor
  through whatever channel exists at the time. Add a UAE row to `docs/operations/INCIDENT-RESPONSE.md`.
  Secondary: https://docs.modulos.ai/frameworks/uae-pdpl/security-breaches-dpia-and-cross-border-transfers
- DPIA (Art. 21): needed for high-risk processing with new technology or large-scale sensitive
  data. Bookkeeping data is not "sensitive" under the PDPL (that covers health, biometrics,
  religion, and similar), but AI reading of bills is new technology over financial records. Write
  a short DPIA before launch; it costs a day and answers the question.
- Records of processing (Arts. 7(4), 8(7)): keep a register that includes the cross-border
  transfer to Qatar.
- Scope note: the PDPL excludes banking and credit data that has its own legislation (Art. 2).
  A business's own books are not in that exclusion; treat them as in scope.

### 1.6 DPO

Art. 10 requires a Data Protection Officer where processing is high-risk because of new
technology or volume, involves systematic evaluation of sensitive data, or large volumes of
sensitive data. MyCA at launch probably does not meet these tests, but the DPIA may say
otherwise. Recommendation: name a DPO (it may be an existing employee or an outside service, and
need not be in the UAE) and publish a contact address. It costs little and the breach report form
asks for the DPO's details anyway.

### 1.7 Hosting in Doha: the transfer basis

Hosting UAE personal data in Qatar is a cross-border transfer.

- Art. 22 (adequacy): allowed to a country with a data protection law and a regulator, or with
  which the UAE has an agreement, in cases the Data Office approves. Qatar has a data protection
  law (Law No. 13 of 2016) and a regulator, but **no UAE adequacy list has been published**, so
  MyCA cannot rely on Art. 22 alone today.
- Art. 23 (no adequacy): allowed under a binding contract that requires the recipient to apply
  PDPL-level protection, with the data subject's express consent, or where the transfer is needed
  to perform a contract with the data subject.

MyCA's basis, in this order:
1. **Contract** (Art. 23): the Google Cloud data processing terms bind Google to protections at
   least equal to the PDPL (encryption, access control, sub-processor rules, breach notice). Keep a
   one-page mapping of those terms to PDPL Arts. 8, 9 and 20 on file.
2. **Performance of the contract** with the account holder: the service cannot run without the
   hosting.
3. **Express consent** as a back-stop for the account holder's own data: a clear line on sign-up
   ("Your data is stored by Google Cloud in Doha, Qatar, until we move it to a UAE region"),
   recorded with the consent log. It does not cover the business's customers and staff, so it is
   a back-stop only.
4. **Move** to an in-UAE region when a contract is signed, and say so in the notice. That removes
   the question entirely and is what larger customers and DIFC/ADGM firms will ask for.

Model provider: if a bill or chat leaves Qatar for a model provider in the US or elsewhere, that
is a second transfer under the same Art. 23 contract basis. Name the provider and country in the
notice.

### 1.8 Customers in DIFC or ADGM

The two financial free zones have their own laws, and the federal PDPL does not apply there.

- DIFC: Data Protection Law, DIFC Law No. 5 of 2020, Commissioner of Data Protection. Controllers
  in DIFC register with the Commissioner, and transfers out of DIFC need an adequate country (the
  DIFC list does not include Qatar or mainland UAE) or safeguards such as standard clauses.
  Primary for the law: https://assets.u.ae/api/public/content/bb94d503629243a7aa548a8cd387ea86?v=df38af26
- ADGM: Data Protection Regulations 2021, Office of Data Protection. Similar rules. Secondary
  (Kayrouz, above).

For MyCA, a DIFC or ADGM business is the controller of its books and MyCA is its processor. That
customer will need: a processor agreement that meets DIFC Art. 24 / ADGM equivalents, standard
contractual clauses for the transfer to Qatar, the list of sub-processors, and breach notice to
them without undue delay. Prepare a DIFC/ADGM addendum to the terms (owner-only: legal sign-off).
Until it exists, sales to DIFC/ADGM firms should wait or the move to an in-UAE region should come
first. **Recheck** both regimes with counsel before signing such a customer.

## 2. Tax records MyCA must help keep

| Record | How long | Source |
|---|---|---|
| Accounting and tax records in general (VAT) | 5 years from the end of the tax period | Federal Decree-Law No. 28 of 2022 on Tax Procedures, Art. 5; primary PDF of its regulations: https://mof.gov.ae/wp-content/uploads/2023/07/Cabinet-Decision-No-74-of-2023-On-Executive-Regulations-of-Federal-Decree-Law-No.-28-of-2023-Tax-Procedures-Law.pdf |
| Records about real estate | 7 years from the end of the calendar year (Cabinet Decision 74 of 2023, Art. 3). Older guidance said 15 years under the VAT Executive Regulation; Cabinet Decision 74 is the later rule | Secondary summary: https://www.crowe.com/ae/news/new-executive-regulations-to-the-tax-procedures ; older 15-year rule: https://www.khaleejtimes.com/business/vat-in-uae/uae-property-firms-must-keep-financial-records-for-15-years (2017) |
| Corporate Tax records | 7 years from the end of the tax period (Federal Decree-Law No. 47 of 2022, Art. 56) | Secondary: https://www.meydanfz.ae/blog/record-retention-uae |
| Pending refund | 2 more years while a refund application is pending (Cabinet Decision 17 of 2026, in force 1 April 2026) | Secondary: https://www.pwc.com/m1/en/services/tax/middle-east-tax-news-alerts/2026/uae-tax-procedures-law-executive-regulations-amendments.html |
| Tax Procedures amendments | Federal Decree-Law No. 17 of 2025, in force 1 January 2026: refunds limited to 5 years from period end; FTA may audit beyond the limit in some cases | Primary: https://mof.gov.ae/en/news/ministry-of-finance-to-implement-amendments-to-the-tax-procedures-law-starting-early-2026/ |

What the app does about it:
- The default retention for a UAE business is 7 years after the end of the tax period (it
  covers CT and real estate in one rule), plus 2 years when a refund is marked pending.
- Deleting a business inside the retention window warns that the law expects the records to be
  kept and offers the full export first. Deletion still happens if the owner insists, because the
  legal duty is the business's, not MyCA's; record that the warning was shown.
- Arabic: records may be kept in English, and the FTA may ask for an Arabic translation (Cabinet
  Decision 74 of 2023, Art. 5, secondary Crowe summary above). MyCA's exports and PDFs of tax
  invoices and returns can be produced in Arabic, and invoices carry both languages. Do not
  promise a "certified" translation; MyCA is not a legal translator.
  reviewer; note it as open.

## 3. Taxes the app prepares (facts to keep in the copy)

| Tax | Rule | Source |
|---|---|---|
| VAT | 5%. Returns (VAT 201) and payment 28 days after period end; quarterly below AED 150m turnover | `platform/src/countries/knowledge/ae.md` (secondary sources; confirm with FTA) |
| Corporate Tax | 0% up to AED 375,000 of taxable income, 9% above; return 9 months after period end | ae.md |
| Small Business Relief | Revenue up to AED 3 million, extended to tax periods ending on or before 31 December 2029 by Ministerial Decision No. 131 (announced 7 August 2026) | Secondary: https://en.aletihad.ae/news/uae/4683761/ministry-of-finance-extends-small-business-relief-for-corpor (WAM). Exclusions (members of multinational groups, Qualifying Free Zone Persons) come from MD 73 of 2023; confirm with the FTA |
| Qualifying Free Zone Person | 0% on qualifying income, must still register and file | ae.md |

## 4. E-invoicing

### 4.1 Timeline

| Group | Appoint an ASP by | Go live | Source |
|---|---|---|---|
| Pilot | | 1 July 2026 | Ministerial Decision 244 of 2025, primary: https://mof.gov.ae/wp-content/uploads/2025/09/Ministerial-Decision-No.-244-of-2025-on-the-Implementation-of-the-Electronic-Invoicing-System.pdf |
| Revenue AED 50 million or more | 31 July 2026, **extended to 30 October 2026** by an amendment to MD 244 | 1 January 2027 | Secondary: https://sovos.com/regulatory-updates/global-vat/uae-e-invoicing-service-provider-appointment-deadline-for-phase-1-businesses-extended/ (11 May 2026) |
| Revenue below AED 50 million (MyCA's market) | 31 March 2027 | 1 July 2027 | MD 244 of 2025; Sovos above |
| Government entities | later dates | | MD 244 |

Format and network: PINT AE over Peppol, five-corner model, only through a Ministry of
Finance-accredited ASP. B2B and B2G in scope; B2C later.

### 4.2 Penalties (Cabinet Decision No. 106 of 2025, issued 24 November 2025)

| Failure | Penalty |
|---|---|
| Not implementing e-invoicing, or not appointing an ASP on time | AED 5,000 for each month or part of a month |
| Not issuing and sending an e-invoice | AED 100 per invoice, up to AED 5,000 a calendar month |
| Not issuing and sending an e-credit note | AED 100 per note, up to AED 5,000 a calendar month |
| Issuer not telling the FTA of a system failure | AED 1,000 per day |
| Recipient not telling the issuer of a system failure | AED 1,000 per day |
| Not updating the ASP when registered data changes | AED 1,000 per day |

Voluntary adopters are outside the penalties. Secondary:
https://taxnews.ey.com/news/2025-2433-uae-ministry-of-finance-publishes-cabinet-decision-on-penalties-for-noncompliance-with-e-invoicing
(5 December 2025). Confirm against the MoF copy before quoting numbers in ads.

### 4.3 What MyCA may say

- Allowed: "Get ready for e-invoicing", "PINT AE-ready invoice data", "Checks your invoices
  against the PINT AE fields", "We are working with Accredited Service Providers; we will name
  our partner when the agreement is signed".
- Not allowed until a contract is signed: "Send e-invoices through MyCA", "MyCA is your ASP",
  "Accredited", "FTA-approved", "Peppol-certified", or any logo of the MoF, FTA or OpenPeppol.
- The campaign hook "Appoint your ASP by 31 March 2027" is a fact; pair it with "MyCA helps you
  get your invoice data ready and will connect you to an accredited provider". If no ASP is
  contracted by early 2027, the campaign must say plainly that the customer appoints the ASP.

## 5. Tax agent rules: what MyCA is not

Only a person registered with the FTA and listed on its register may act as a tax agent:
represent a taxpayer before the FTA, file on its behalf under the agency link in EmaraTax, or hold
themselves out as one. Practising without registration is an offence. Requirements include a
relevant degree, 3 years' experience, Arabic and English, the FTA exam, insurance and a fee.
Primary: https://tax.gov.ae/en/tax.support/tax.agents/how.to.become.a.tax.agent.aspx and
https://tax.gov.ae/en/services/registration.of.tax.agency.aspx

MyCA is software. The business, or the tax agent it appoints, reviews and files on EmaraTax.

| Never write | Write instead |
|---|---|
| "We file your VAT return" / "MyCA files with the FTA" | "MyCA prepares your VAT 201. You or your tax agent file it on EmaraTax" |
| "Your tax agent in an app" / "Registered tax agent" / "FTA-approved" | "Bookkeeping and tax software for UAE businesses" |
| "We represent you before the FTA" | "Share a read-only view with your tax agent" |
| "Guaranteed compliant" / "No penalties" | "Checks that catch common errors before you file" |
| "Tax advice" | "Explains the rule and links to the FTA guide; for advice, ask a registered tax agent" |
| "Replace your accountant" | "Less time on the books; more time for advice" |

The Firm plan is for registered tax agents and accounting firms to use MyCA as their tool. The
agent files under their own agency; MyCA never logs in to EmaraTax for anyone and never asks for
an EmaraTax password. An FTA tax agent partner (section 9) can be offered to customers who want
one; the agreement must say the agent, not MyCA, gives the tax service.

## 6. Consumer protection and advertising

Federal Law No. 15 of 2020 on Consumer Protection and its regulations (Cabinet Decision No. 66 of
2023, in force October 2023). "Consumer" includes legal persons, so assume it can reach small
business buyers. Secondary: https://cms.law/en/are/legal-updates/the-uae-s-new-consumer-protection-landscape-implications-and-key-provisions
(4 October 2023). Points that matter to MyCA:

- Information, invoices, ads and contract terms must be available in Arabic (other languages
  alongside). The listing, the terms, the privacy notice, the paywall and receipts get Arabic.
- No misleading claims, direct or indirect. See the claims list in section 8.
- Prices shown in AED. State whether VAT is included (Play shows the final price; on the website
  say "AED 299 a month, VAT included where it applies" once MyCA's UAE VAT status is settled).
- Unfair terms that exclude liability unreasonably are void; no changing a plan's terms without
  notice.
- Promotions may need prior approval from the emirate's economic department; check with the
  Dubai Department of Economy and Tourism before running a discount campaign.
- Do not use customer data for marketing without consent (also PDPL).
- Fines up to AED 1 million and suspension are possible.

Also: Federal Decree-Law No. 34 of 2021 on Combatting Rumours and Cybercrimes applies to online
content; avoid naming or disparaging competitors in a way that could be read as defamation.
Comparisons must be factual, sourced and dated (section 8).

## 7. Google Play

### 7.1 Billing

Play's Payments policy requires Google Play billing for app functionality and "cloud software and
services, such as data storage, productivity tools, and financial management software" sold in
the app, and forbids leading users to another payment method inside the app or listing.
Primary: https://support.google.com/googleplay/android-developer/answer/9858738 . Alternative or
user-choice billing exists only in listed countries through a programme; do not assume the UAE
is listed: https://support.google.com/googleplay/android-developer/answer/13821247 .

So: Starter, Business and Firm are sold through Play in the Android app. No "cheaper on our
website" text or link in the app. Website sales through Stripe are fine for web users, but the
app must not point to them. Prices in AED are set in the Play Console per plan.

### 7.2 Data safety form answers (UAE app)

| Question | Answer |
|---|---|
| Collects or shares required data types | Yes |
| Encrypted in transit | Yes (HTTPS only) |
| Deletion request available | Yes: in the app (Businesses, Delete my account) and on the web deletion page; erased 30 days after the request, except records the business asks us to keep for its legal retention |
| Independent security review (MASA) | No |
| Designed for children | No (18+, businesses) |

| Data type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| Personal info: Name | Yes | No | Required | App functionality, Account management |
| Personal info: Email address | Yes | No (email relay is MyCA's processor) | Required for Google sign-in | Account management, App functionality |
| Personal info: Phone number | Yes, if phone sign-in | No (SMS provider is a processor) | Optional | Account management |
| Personal info: Address | Business address for invoices | No | Optional | App functionality |
| Personal info: Other (TRN, trade licence number) | Yes | No in sandbox. When an ASP is live: shared with the ASP on the user's instruction (user-initiated) | Optional | App functionality |
| Financial info: Purchase history | Play purchase token and plan | No | Required for paid plans | App functionality |
| Financial info: Other (the books) | Yes | No in sandbox; ASP later, as above | Required | App functionality |
| Photos | Bill photos the user picks | Processed by the model provider as a processor | Optional | App functionality |
| Files and docs | Bills, statements, backups the user picks | As photos | Optional | App functionality |
| Messages: in-app messages | Assistant chat | Unmatched text to the model provider, as a processor | Optional | App functionality |
| App info and performance: Crash logs | Only if opted in | No | Optional, off by default | Analytics (stability) |
| Device or other IDs | Random server-made device id | No | Required | Account management, Security |
| Location, contacts, calendar, health, audio, web browsing, app activity, installed apps, advertising id | No | | | |

Keep this table in step with `docs/release/DATA-SAFETY.md` and `docs/uae/PRIVACY-NOTICE.md`.

### 7.3 Other Play requirements

- Privacy policy URL in English and Arabic (publish `PRIVACY-NOTICE.md` as a web page).
- Account deletion URL (web), as for the India app.
- Financial features declaration: the app is bookkeeping and tax preparation software; it offers
  no loans, payments, banking, crypto or investment features. Answer "none of these" except any
  category Play adds for tax software.
- Content rating questionnaire: utility/productivity, no user-to-user content, no gambling,
  violence or ads. Expected rating: Everyone / 3+.
- Target audience 18+; not in the Families programme.
- Developer account: the publisher name shown must match the legal entity (section 9).
- Store listing in Arabic and English with RTL screenshots (see `PLAY-LISTING.md`).

## 8. Marketing claims rules

- No claim of being FTA-accredited, an ASP, a registered tax agent, or "approved" by any authority.
- No use of government logos (FTA, MoF, EmaraTax, UAE Pass) in ads or graphics.
- No testimonials, ratings, customer counts or "trusted by" until real and documented.
- Comparisons with Zoho Books, QuickBooks, Tally, Xero, Wafeq or tax agencies must be about
  checkable features with a source and date, kept on file, and refreshed before each campaign. Do
  not say "cheapest", "best", "number one" or "beats every competitor" in public copy; that
  aspiration lives in the internal brand kit only.
- Penalty figures and deadlines quoted in ads must match section 4 and be rechecked before use.
- "AI" claims: say what it does (reads bills, suggests categories), and that a person approves.

## 9. Owner-only actions

Things the code and the docs cannot do. Each blocks the step after it.

| # | Action | Blocks | Notes |
|---|---|---|---|
| 1 | Set up a UAE entity or free-zone licence (e.g. DMCC, IFZA, Meydan, RAKEZ), or decide to sell from India | Contracts with an ASP and tax agents, a UAE bank account, Stripe UAE, local trust | A free-zone software licence is the usual route; check whether it can sell to mainland customers |
| 2 | Decide MyCA's own UAE VAT and CT position (as a non-resident selling digital services; registration may be needed above the threshold) | Price display, invoices to customers | Ask a registered tax agent |
| 3 | Sign an ASP partnership (Ministry of Finance accredited list) | Any claim of sending e-invoices; leaving sandbox for e-invoicing | Before 31 March 2027 to be useful for the second wave |
| 4 | Sign an FTA registered tax agent partner | Offering "file with a tax agent" to customers | The agreement says the agent gives the tax service |
| 5 | Sign a hosting contract in a UAE region (AWS `me-central-1` or Azure UAE North), or approve Doha hosting with the transfer basis in 1.7 | The residency rule in the country pack; DIFC/ADGM customers | Record the decision in `platform/src/countries/planned.mjs` residency note |
| 6 | Appoint a DPO and publish the contact; approve the DPIA | Privacy notice placeholders | |
| 7 | Legal review: terms of service with the processing clause, DIFC/ADGM addendum, privacy notice EN/AR | Launch | A UAE-qualified lawyer |
| 8 | Native Arabic review of the app strings, the notice and the listing | Store release in Arabic | |
| 9 | Play Console: create the UAE app, publisher name, Data safety form, content rating, financial declaration, AED prices, listing | Release | |
| 10 | Approve promotions with the emirate's economic department if discounts are offered | Discount campaigns | |
| 11 | Register the trademark "MyCA" in the UAE (Ministry of Economy) | Brand protection | Optional before launch, wise before ad spend |

## 10. Open questions

- Whether the UAE is in Play's user-choice billing programme (affects only web-to-app pricing).
- Whether MyCA's PINT AE output needs ASP certification before customers rely on it.
- Exact executive-regulation timelines for PDPL breach notice when published.
- Confirm the text of Ministerial Decision No. 131 on the MoF site and its exclusions.
- Whether records may be stored outside the UAE without FTA approval (Tax Procedures).
