# MyCA Malaysia: Google Play billing rules and subscription setup

Drafted 14 November 2026.

## The rule

Google Play's Payments policy requires Play billing for in-app purchases of digital features,
content and services, **including subscriptions and cloud software**. Exceptions cover physical
goods and services, credit card and utility bill payments, peer-to-peer payments and a few others;
SaaS accounting software is not an exception. MyCA must not steer Android users to pay elsewhere
(no "cheaper on our website" text or links in the app), unless enrolled in an alternative billing
or external offers programme that is available in Malaysia (check Play Console; none is assumed).

Source: Google Play Payments policy, https://support.google.com/googleplay/android-developer/answer/9858738 (accessed 2026-11-14).

Consequences for MyCA Malaysia:

- SME, Growth and Firm are **auto-renewing Play subscriptions**, sold inside the app.
- A firm that pays by bank transfer on the web for its clients can be supported later only through
  a programme Play allows in Malaysia, or for accounts created and paid outside the app with no
  in-app purchase path or steering (counsel and Play policy check first).
- The MyInvois signing certificate cost and any tax agent fees are not sold through the app.

## Products

| Plan | Product id (suggested) | Base plan | Price (MYR, tax-inclusive as shown to buyers) | Who it is for |
|---|---|---|---|---|
| SME | `myca_my_sme` | `monthly` | RM299 | One business: e-invoices, consolidated e-invoices, SST, books, income tax estimate, 3 people |
| Growth | `myca_my_growth` | `monthly` | RM699 | Growing business: more people, more e-invoice volume, bank matching, priority support |
| Firm | `myca_my_firm` | `monthly` | RM1,999 | Accounting firms handling many clients as intermediary |

Seat counts and volume limits are product decisions for the owner; the table gives the
suggested split used in the marketing material.

Setup steps:

1. Play Console, MyCA Malaysia, Monetize, Subscriptions: create the three products.
2. For each, one auto-renewing monthly base plan; set the **MYR** price; confirm Play accepts
   RM1,999 within its MYR price range (Play shows the allowed range when the price is entered).
3. Optional offers: a free trial (for example 14 days, as in India) on SME and Growth; owner
   decides. Trials must be described in the listing if offered.
4. Server settings (engineering, as for India): `MYCA_PLAY_PACKAGE_MY=com.mldynamic.myca.my`,
   `MYCA_PLAY_PRODUCT_MY_SME`, `MYCA_PLAY_PRODUCT_MY_GROWTH`, `MYCA_PLAY_PRODUCT_MY_FIRM`
   (names to match whatever the Malaysia build thread uses).
5. Real-time developer notifications to the API, so renewals, cancellations, grace periods and
   refunds update entitlement; acknowledge each purchase within 3 days or Play refunds it.
6. Test with licence testers before release.

## Prices, tax and fees

- Play shows Malaysian buyers **tax-inclusive** prices and handles the tax on Play sales in
  Malaysia; confirm the setting in Play Console, Setup, Payments profile and tax.
- Play's service fee on auto-renewing subscriptions is **15%** (outside the markets listed with
  different rates). Net per month, before tax: about RM254 (SME), RM594 (Growth), RM1,699 (Firm),
  less the tax Play handles.
  Source: Google Play service fees, https://support.google.com/googleplay/android-developer/answer/112622 (accessed 2026-11-14).
- Payout is to the payments profile's bank account in its currency; with the Indian entity, MYR
  sales are paid out in INR.

## In-app copy rules

- The plan screen lives in Settings and on the "Choose a plan" screen, never in the middle of an
  e-invoice or a filing (UX principle 10).
- Show price, period, what renews, and "Cancel any time in Google Play" in both languages:
  - "RM299 a month. Renews monthly until you cancel in Google Play."
  - "RM299 sebulan. Diperbaharui setiap bulan sehingga anda membatalkannya di Google Play."
- After a lapse: books stay readable and exportable; submitting new e-invoices needs a plan.
  Never block an export or a cancel/credit note needed to fix an e-invoice already sent.
