# Launching MyCA Malaysia

Draft, 14 November 2026. What the owner must decide or do before MyCA Malaysia
(`com.mldynamic.myca.my`, label "MyCA Malaysia") goes live on Google Play in Malaysia. Mirrors
`docs/compliance/us/US-LAUNCH.md`. Engineering items are listed only where the owner's input
unblocks them.

## What a Malaysian user gets at launch

1. **Welcome** in English or Bahasa Melayu, with Bahi.
2. **Privacy notice** in both languages (`PRIVACY-NOTICE.md`), accepted before an account is made.
3. **"Do I have to e-invoice?"** check: turnover band, related companies, start date; the answer
   cites the rule (exempt below RM3 million from 1 September 2026).
4. **E-invoice checklist**: add MyCA as intermediary in MyInvois (`MYINVOIS-INTERMEDIARY.md`
   section 3), test the link, issue the first e-invoice with an explicit approve step.
5. **Consolidated e-invoice** for consumer sales, with the RM10,000 and 7-day rules enforced.
6. **SST**: SST-02 figures for each two-month period, ready to copy into MySST.
7. **Income tax estimate** for the owner (Form BE or B), to file in MyTax.
8. **Ask Bahi** for questions with sources; nothing is filed without approval.

## Owner decisions and actions

Legend: **Blocker** = cannot launch without it. **Before scale** = can soft-launch, needed soon.

### Legal entity and registrations

- [ ] **Blocker. Malaysian entity or not.** Recommendation: incorporate a **Sdn. Bhd.** (SSM) or
      register a foreign company branch, because MyCA needs a Malaysian **TIN and BRN** to be a
      MyInvois intermediary and to hold the signing certificate in its own name, and a local entity
      makes PDPA applicability, a Malaysian DPO, a MYR bank account and local contracts simple.
      Without it, launch only in the fallback mode where each taxpayer registers MyCA as their own
      ERP and buys their own certificate (about RM1,500 a year each), which kills the SME offer.
- [ ] **Blocker. SSM registration** of the entity (Companies Act 2016), its registered office and
      company secretary, and the company's **LHDN tax file and TIN**.
- [ ] **Before scale.** Check whether MyCA's own sales need **SST registration** (taxable services
      above the threshold if sold by a Malaysian entity) or, while sold from India, the
      **service tax on imported digital services** (foreign service provider registration above
      RM500,000 a year to Malaysian consumers). Google Play collects and remits tax on Play sales
      in Malaysia (confirm in Play Console tax settings), which covers in-app subscriptions.
- [ ] Ask LHDN's MyInvois helpdesk, in writing, whether a foreign company can be an intermediary.

### Personal data (PDPA)

- [ ] **Blocker. Appoint a DPO**: fluent in Bahasa Melayu and English, resident in Malaysia or
      easily reachable; employee or outsourced. Notify the Commissioner within 21 days; publish the
      contact in the notice. (`PDPA-COMPLIANCE.md` section 5)
- [ ] **Blocker. Counsel review** of `PRIVACY-NOTICE.md` (both languages), PDPA applicability and
      data user registration.
- [ ] **Blocker. Transfer Impact Assessment** for Singapore hosting; accept the Google Cloud DPA
      for the Malaysia project; DPA with the model provider; intra-group transfer agreement for
      India support access.
- [ ] Breach register set up and one tabletop run of `BREACH-RESPONSE.md`.
- [ ] Publish the privacy notice and a delete-account page on the website; give Play the URLs.

### LHDN MyInvois

- [ ] **Blocker. Production credentials**: MyCA's own MyTax login, MyInvois intermediary system
      registered in production, client ID and secrets into Secret Manager.
- [ ] **Blocker. Signing certificate** from a Malaysian licensed CA (MSC Trustgate or Pos Digicert;
      Pos Digicert soft certificate RM1,500 + SST a year). Needs the entity's TIN and BRN.
- [ ] Production smoke test with MyCA's own TIN (one real e-invoice, then cancel within 72 hours).
- [ ] In-app screenshots of the portal steps, captured from production with a test company.

### Tax content and partners

- [ ] **Blocker for income tax.** Attest the dated rules (`my.income-tax.*`, `my.sst.*`,
      `my.einvoice.*`) with a Malaysian tax agent or counsel; until then the screens say "estimate".
- [ ] **Before scale. Tax agent partner** (s153 approved) for an "expert review" add-on and for
      escalations. Not needed for the software-only launch.
- [ ] Counsel's opinion on the tax-agent wording (`SST-AND-TAX-DISCLAIMERS.md` section 6).
- [ ] Professional indemnity and cyber insurance that covers Malaysian users.

### Google Play

- [ ] **Blocker.** Create the app `com.mldynamic.myca.my` in Play Console (Android flavor `my`,
      label "MyCA Malaysia"; the flavor is not yet on `develop`, engineering to add it as for `us`).
      Countries/regions: Malaysia only.
- [ ] **Blocker. Payments profile able to sell in MYR.** Play lets an Indian developer account
      sell in Malaysia with Google converting payouts; a Malaysian entity would need its own
      developer account and merchant profile (owner decides which account publishes; the package
      name cannot move between accounts easily, so decide before first upload).
- [ ] **Blocker.** Subscriptions in Play Console, base plans in MYR: SME RM299/month, Growth
      RM699/month, Firm RM1,999/month (`docs/release/my/PLAY-BILLING.md`); set the product ids in
      the server settings.
- [ ] Android OAuth client for the package with the Play signing SHA-1.
- [ ] Store listing EN and MS, Data safety, content rating, screenshots
      (`docs/release/my/`).
- [ ] Closed testing track with at least 12 testers for 14 days if the developer account is a
      new personal account (Play's testing requirement); not needed for an organisation account.

### Language and brand

- [ ] **Blocker. Native Bahasa Melayu review** of: app strings (`design/flutter/myca_design/lib/l10n/`),
      the privacy notice, the Play listing, the landing page, the FAQ and the social posts.
- [ ] Approve the Malaysia brand kit (`docs/marketing/my/BRAND-KIT.md`) and the Bahi usage.
- [ ] Malaysian support channel: WhatsApp Business number (+60), support email, hours (MYT).

### Pricing check (owner decision)

- [ ] **Decide.** The planned prices (RM299, RM699, RM1,999 a month) are 2 to 10 times what
      Malaysian SMEs pay for accounting with e-invoicing (Bukku from RM35, SQL Account Cloud from
      RM79, AutoCount Cloud from RM70 a month; free tiers exist, and LHDN's own MyInvois portal is
      free). Recommendation in `docs/marketing/my/MARKETING-PLAN.md` section 6: keep the prices
      only with a "done-with-you" promise (onboarding call, MyInvois setup done for them,
      WhatsApp support), or add an entry tier. The owner's call.

## Summary table for the owner

| # | Item | Blocker? |
|---|---|---|
| 1 | Malaysian entity (Sdn. Bhd.) or not, and SSM registration | Yes |
| 2 | LHDN TIN for the entity | Yes |
| 3 | DPO named, Commissioner notified | Yes |
| 4 | Counsel review: notice, PDPA applicability, tax-agent wording | Yes |
| 5 | TIA and DPAs for Singapore and the model provider | Yes |
| 6 | MyInvois production credentials | Yes |
| 7 | Signing certificate (MSC Trustgate or Pos Digicert) | Yes |
| 8 | Play app, MYR merchant/payments profile, subscriptions | Yes |
| 9 | Native Malay review | Yes |
| 10 | Tax rule attestation by a Malaysian tax agent | Yes for income tax screens |
| 11 | Tax agent partner | Before scale |
| 12 | SST / digital service tax registration check | Before scale |
| 13 | Pricing decision | Before marketing spend |
| 14 | Malaysian support WhatsApp and email | Yes |
