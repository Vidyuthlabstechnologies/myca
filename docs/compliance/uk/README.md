# MyCA UK: compliance pack

Status: drafts for the owner and a UK solicitor, 2026-11-14. Applies to the separate Android app
**MyCA UK** (flavor `uk`, application id `com.mldynamic.myca.uk`) and the UK deployment of the
hosted API in Google Cloud London (`europe-west2`).

The facts about UK tax and HMRC's rules come from `platform/src/countries/knowledge/gb.md`
(checked 2026-11-11, not yet attested). Anything that page does not settle is marked
**check before publishing**. Nothing here is legal advice; every document needs a UK legal review
before it is published or relied on.

## Where things stand

- The UK engine (`platform/src/countries/united-kingdom/`) is being built and is tested against the
  **HMRC sandbox** only. HMRC has not yet granted production credentials.
- Until HMRC grants production access and lists MyCA, every public text says
  **"built for Making Tax Digital, HMRC recognition in progress"**. After that, and only then,
  **"HMRC recognised"**. Never "HMRC accredited", "approved" or "certified" (gb.md, HMRC terms of use).
- No UK company exists yet. Wherever a controller or registered office is needed, the documents say
  **[UK entity to confirm]**. ML Dynamic Solutions Private Limited (India) holds ISO 27001 and SOC 2
  and may be the applicant to HMRC; gb.md notes that an organisation outside the UK can give
  equivalent evidence of registration.

## The documents

| File | What it is | Who signs it off |
|---|---|---|
| [PRIVACY-NOTICE.md](PRIVACY-NOTICE.md) | UK GDPR and DPA 2018 privacy notice for the app and site | UK solicitor, then owner |
| [ROPA.md](ROPA.md) | Record of processing activities (UK GDPR Article 30) | Owner (data protection lead) |
| [DPIA.md](DPIA.md) | Data protection impact assessment for HMRC data and the AI assistant | Owner, with the DPO or adviser |
| [DATA-RETENTION.md](DATA-RETENTION.md) | What is kept, for how long, and how it is deleted (UK schedule) | Owner, counsel confirms periods |
| [BREACH-RESPONSE.md](BREACH-RESPONSE.md) | UK personal data breach procedure: ICO and HMRC within 72 hours | Owner |
| [HMRC-PRODUCTION-APPLICATION.md](HMRC-PRODUCTION-APPLICATION.md) | Answers pack for the HMRC Developer Hub production checklist and security questionnaire | Owner (responsible individual) |
| [FRAUD-PREVENTION-HEADERS.md](FRAUD-PREVENTION-HEADERS.md) | Every `Gov-Client-*` and `Gov-Vendor-*` header for `MOBILE_APP_VIA_SERVER`: what, why, how the user is told | Engine engineer, owner |
| [ACCESSIBILITY.md](ACCESSIBILITY.md) | WCAG 2.2 AA statement and test plan | Owner, after the audit |
| [PLAY-BILLING.md](PLAY-BILLING.md) | Which UK charges use Google Play billing, refunds and cancellation | Owner, counsel |
| [TERMS.md](TERMS.md) | Draft terms of service for MyCA UK | UK solicitor, then owner |

Marketing material and the brand kit for the UK app are in [`docs/marketing/uk/`](../../marketing/uk/).

## Launch checklist: steps only the owner can take

These cannot be done from the repository. Tick each one with the date and who did it.

### 1. The UK entity

- [ ] **Decide who is the controller and the HMRC applicant**: a new UK company, the Indian company
      or the US company. Recommended: a UK private limited company. It gives HMRC a UK registered
      organisation, a UK address for the privacy notice and the ICO, and avoids the need for a UK
      representative.
- [ ] If the controller is **not** established in the UK, appoint a **UK representative**
      (UK GDPR Article 27) and name them in the privacy notice. **Check before publishing** with a
      UK solicitor.
- [ ] If staff in India (or anywhere outside the UK) can reach UK production data, that is a
      restricted transfer even with UK hosting. Put an International Data Transfer Agreement (IDTA)
      or the UK Addendum to the EU SCCs in place between the UK controller and each overseas group
      company, with a transfer risk assessment. See PRIVACY-NOTICE.md section 8.
- [ ] Replace every **[UK entity to confirm]** in these files and in the app's UK privacy notice.

### 2. HMRC

- [ ] Developer Hub: register the production application (separate from the sandbox application),
      name the responsible individual, and work through the checklist with
      [HMRC-PRODUCTION-APPLICATION.md](HMRC-PRODUCTION-APPLICATION.md). The application lapses after
      6 months if unfinished (gb.md).
- [ ] Ask for the APIs MyCA uses: VAT (MTD), the Income Tax (MTD) set (business details,
      obligations, self-employment business, property business, individual calculations, and the
      others the engine calls), and the Test Fraud Prevention Headers API in sandbox.
- [ ] Pass the fraud prevention header checks in sandbox (Test Fraud Prevention Headers API), then
      watch HMRC's monthly status emails once live.
- [ ] Publish the privacy notice and terms at stable URLs before submitting; HMRC asks for both.
- [ ] Subscribe to the MTD IT software developer newsletter and read each edition (gb.md).
- [ ] After HMRC grants production and lists MyCA, change every "recognition in progress" line to
      "HMRC recognised" (search the repo for `recognition in progress`).
- [ ] Ask a UK adviser whether the £149 Self Assessment return preparation (any human review or
      acting for the client) brings MyCA inside mandatory tax adviser registration from May 2026
      (gb.md, "Licences and registrations"). Do not sell it until answered.

### 3. ICO

- [ ] Pay the **ICO data protection fee** as the controller (UK entity). gb.md found the amounts on
      the ICO page out of line with the 2025 increase: **check the current tier and amount before
      paying**.
- [ ] Put the ICO registration number in the privacy notice.
- [ ] Set up a complaints route for data protection complaints (the Data (Use and Access) Act 2025
      expects controllers to handle complaints before people go to the ICO; **check the
      commencement date**).

### 4. Security assurance

- [ ] **Penetration test** of the UK API, the Android app and the HMRC connection by a CREST or
      CHECK accredited tester, scoped per the NCSC guidance. Fix highs and criticals, keep the report
      and the retest letter for HMRC.
- [ ] **Cyber Essentials** (Plus if affordable) for the UK entity or the group. HMRC recommends
      Cyber Essentials or equivalent; ISO 27001 is equivalent evidence but Cyber Essentials is cheap
      and UK buyers and accountants recognise it.
- [ ] Extend the ISO 27001 and SOC 2 scope statements to cover the UK deployment
      (`europe-west2`), or get a letter from the auditor that they do.
- [ ] Self-audit against the ICO security checklist (gb.md).

### 5. Legal review

- [ ] UK solicitor reviews PRIVACY-NOTICE.md, TERMS.md and PLAY-BILLING.md (consumer cancellation,
      the Digital Markets, Competition and Consumers Act 2024 subscription rules, unfair terms).
- [ ] Owner signs off ROPA.md, DPIA.md, DATA-RETENTION.md and BREACH-RESPONSE.md, and names the
      data protection lead and the breach lead.
- [ ] Data processing agreements in place with every processor in ROPA.md (Google Cloud, the AI model
      provider, email relay, Stripe, Google Play), with UK transfer terms where any is outside the UK.

### 6. Google Play

- [ ] Create the app `com.mldynamic.myca.uk` ("MyCA UK") in Play Console. Countries: United Kingdom.
- [ ] Android OAuth client for `com.mldynamic.myca.uk` with the Play signing SHA-1.
- [ ] Subscriptions: Sole Trader £49/month, Business £99/month, Accountant firm £499/month, each with
      a 14-day free trial. **Check before publishing** whether the prices are set inclusive of VAT
      (Play shows UK consumer prices with VAT included). See PLAY-BILLING.md.
- [ ] Data safety form from [`docs/marketing/uk/PLAY-LISTING.md`](../../marketing/uk/PLAY-LISTING.md).
- [ ] Financial features declaration: the app keeps business records and sends tax returns and
      updates to HMRC; it does not lend, hold money or move money.
- [ ] Store listing, screenshots and feature graphic from `docs/marketing/uk/`.
- [ ] Accessibility statement URL live (ACCESSIBILITY.md).

### 7. Before the first real taxpayer

- [ ] Production HMRC credentials stored in Secret Manager in the UK project, never in the repo.
- [ ] The UK stack applied in `europe-west2`; `cloud/src/residency.mjs` passes for `GB`.
- [ ] Two-step sign-in available, and required before any HMRC submission (feeds
      `Gov-Client-Multi-Factor`).
- [ ] A dry run of BREACH-RESPONSE.md with the named leads.
