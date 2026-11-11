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

MyCA US is its own Play app, `com.mldynamic.myca.us` (Android flavor `us`), separate from MyCA
India (`com.mldynamic.myca`, flavor `india`). The US app opens straight into the US experience and
has no switch to India. CI builds both; it uploads the US bundle when `PLAY_US_TRACK` is set.

- [ ] Create the `com.mldynamic.myca.us` app in Play Console. *Countries / regions*: United States only.
- [ ] Add an Android OAuth client for `com.mldynamic.myca.us` with the Play signing SHA-1.
- [ ] Set `MYCA_PLAY_PACKAGE_US` (Terraform `play_package_us`) so US payments are checked against the US app.
- [ ] Create the yearly subscription for MyCA Plus (USD 249) in the US app and set `MYCA_PLAY_PRODUCT_US_PLUS`. Plus is sold through Play inside the app because Play's payments policy requires Play billing for software subscriptions; the $129 return is tax filing and stays on card.
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

Owner direction (2026-11-11): price as premium, at or above TurboTax at each tier. **$129 per federal return, paid once per tax year;** MyCA Plus $249 a year; Expert Review $299 once a CPA or EA partner is signed. All three are settings (`MYCA_US_RETURN_PRICE_USD`, `MYCA_US_PLUS_PRICE_USD`, `MYCA_US_EXPERT_REVIEW_PRICE_USD`). Launch offer (owner, 2026-11-11): the first season's return is $99 until 15 April 2027 (`MYCA_US_RETURN_LAUNCH_PRICE_USD`, `MYCA_US_LAUNCH_OFFER_UNTIL`); the price line says it is a launch price and names the $129 list price. Card checkout charges the launch price by itself. If the return is sold through the Play product, set that product to USD 99 in Play Console for the season and back to USD 129 after 15 April. Preparing, reviewing
and downloading the return are free, so people see their refund first; filing with the IRS unlocks once
that year is paid. Households never fall into the India trial or read-only plan.

How it works:

- One consumable Play product, for example `myca_us_1040`, priced USD 129. Set it as
  `MYCA_PLAY_PRODUCT_US_1040` (Terraform `play_product_us_1040`). Consumable, so the same product is bought
  again next year; each payment is recorded against one tax year (`us_return_purchases`, migration 022).
- The app's Sign and e-file screen shows "Pay $129 and continue" after signing. The server checks the
  payment with Google (`purchases.products`), acknowledges it, records it, and writes the
  `billing.us_return_paid` audit event. A payment token can pay for only one return and one year.
- `file_us_return` is refused with `US_RETURN_UNPAID` until that year is paid, whether it comes from the
  app, a confirm, or chat.
- With no product set, filing is not held back (sandbox and development).
- Not done yet: refunds and voided purchases are not watched (Play voided-purchases API), and iOS uses
  the App Store product once the iOS build ships.
