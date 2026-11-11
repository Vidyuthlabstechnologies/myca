# Launching MyCA for US filers

Draft, 2026-11-11. What the app does for a US filer today, and what the owner has to do before the US
version can go live in the Play Store and the App Store.

## What a US filer sees

1. **Welcome.** India or US at the top right. It starts on the US when the phone's region is the US,
   and the choice is kept on the phone. The US welcome talks about the 1040, not GST.
2. **Privacy notice.** The US notice (`PRIVACY_NOTICE_US` in `cloud/src/consent.mjs`): what is
   collected, the IRC section 7216 promise, who it is shared with (IRS, Google Cloud, Anthropic with
   SSNs removed), three-year retention for returns and Form 8879.
3. **What would you like to do?** *File my personal tax return* makes a household (a US business
   with `kind: 'household'`); *Keep books for my US business* makes the existing US business books.
   *Filing in India instead?* goes back.
4. **The 1040 hub.** Estimated refund or tax due, the e-file status (with each IRS rejection and a
   *Fix this* button that opens the right step), a tax-year switch, and five steps:
   - **About you**: filing status, names, SSNs (masked, checked against SSA and IRS rules), dates of
     birth, occupation, spouse, dependents with relationship and months lived together, address.
   - **Tax documents**: snap or upload a W-2, 1099 or 1098 (read by the model, then checked box by box
     before saving), or type it in. Twelve form kinds; the boxes come from the engine's `us_form_kinds`
     when it has one.
   - **A few questions**: one at a time, each answer saved before the next.
   - **Review your return**: refund or amount due, checks that must be fixed (with links), every
     Form 1040 line with where it came from, and the PDF.
   - **Sign and e-file**: five-digit signature PINs, last year's AGI, IP PINs, refund by direct
     deposit or check, or payment by direct debit (with the phone number the IRS asks for) or later;
     the Form 8879 declaration; then one more tap to send. The IRS test system is labelled.
5. Account menu: share the return with a spouse or tax pro, plan and billing, security, switch or
   add, sign out. The AI assistant is one tap away and never sees an SSN.

Money is shown in dollars with thousands grouping; dates read *April 15, 2026* and are typed
*MM/DD/YYYY*.

## Who builds what

| Part | Where |
|---|---|
| App screens, onboarding, privacy notice, SSN handling, WISP | this branch (`claude/project-thread-1r0cxl`) |
| Tax engine: profile, forms, interview, Form 1040 and schedules, review, PDF | "Build US federal tax return engine" thread |
| E-file: signing, MeF XML, submission, acknowledgments, rejections | "Enable IRS e-filing for US returns" thread, PR #222 |

The app calls these tools; until the engine and e-file PRs land, the hub shows an error note on a
live server because the tools are missing.

## Owner actions before a US launch

### Legal and IRS

- [ ] A US entity, or a US citizen or green-card holder as Responsible Official and Principal, for
      the EFIN (IRS Pub 3112). Then the IRS e-Services account, EFIN application (Form 8633) as an
      Online Provider and Software Developer and Transmitter, ETIN, and the MeF ATS tests (the e-file
      thread lists them).
- [ ] Counsel review of the US privacy notice and the WISP (`docs/compliance/us/WISP.md`), and name
      the Qualified Individual and privacy contact.
- [ ] Decide where US returns are stored. Recommended: a US region (`us-central1`) for US households.
- [ ] EV TLS certificate for the filing domain, weekly external vulnerability scans, US registrar.
- [ ] Decide whether two-step sign-in is required before signing (recommended: yes).
- [ ] Set `MYCA_PII_KEY` (32+ characters, in Secret Manager, different from `MYCA_BOOKS_KEY`) and
      `MYCA_REQUIRE_PII_KEY=1` in production before any US return is saved.

### Google Play

- [ ] Production, *Countries / regions*: add the United States (and keep India).
- [ ] *Data safety*: add Government ID (SSN/ITIN), financial info (bank account), and say it is
      encrypted in transit and at rest and can be deleted on request.
- [ ] *Financial features* declaration: the app prepares and files tax returns.
- [ ] Store listing in US English with US screenshots (the 1040 hub, forms, review, sign).
- [ ] The US price (see below) as a one-time in-app product, priced in USD for the US.

### App Store

- [ ] *Pricing and Availability*: add the United States storefront.
- [ ] App Privacy: same categories as Data safety.
- [ ] The same in-app product in App Store Connect.

## US pricing

Waiting on the owner's choice in the thread. The recommended option is **$39 per federal return, paid
once per tax year**, sold as a one-time in-app product (`myca_us_1040_<year>`), which keeps US filers off
the India monthly plans. Filing is allowed only once the return is paid for; preparing and reviewing it
is free, so people can see their refund first.
