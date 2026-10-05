# TaxMeow decision memo

Date: 2026-10-05. Status: for the owner's decision. No code has changed.

## Recommendation

Do not turn MyCA into a Merchant of Record. Take TaxMeow's promise ("the owner never
thinks about compliance") as the product bar, take its compliance surface as
requirements, and ship that as the owner-first Android app. Revisit a MoR arm only
after the app has paying users, as a separate company decision.

## What TaxMeow is

Source caveat: taxmeow.in does not resolve from this machine (DNS failure on
2026-10-01 and again today). Everything below comes from search-engine snippets of
the site, not the site itself. Pricing, legal entity and terms are unverified.

- It calls itself "India's First Dedicated Merchant of Record".
- The business raises one B2B invoice to TaxMeow. TaxMeow then sells to the end
  customers in its own name: B2C invoicing, tax calculation, collections.
- It handles multi-state GST (IGST/CGST/SGST), filings, input tax credit,
  reconciliation, TDS, e-invoicing and e-way bills.
- The snippet shows "500+ founders" and a price of "0" INR, which reads like a
  waitlist or pre-launch page rather than an operating service.

## What being a Merchant of Record means in India

This is my reading of the GST framework. It must be confirmed by a CA and a lawyer
before any decision that depends on it.

- A MoR built as a reseller is the supplier in law. It buys from the business and
  sells to the customer, so output GST, returns, notices and demands are its own.
- It is not the marketplace model. Under s.52 a marketplace only collects TCS
  (0.5% since 10 July 2024) and the seller stays liable. Under s.9(5) the operator
  is deemed supplier only for notified services. A reseller MoR is neither; it is
  simply a trader with full liability.
- It needs GST registration in each state it supplies from, and for goods that
  means a place of business where stock sits.
- It handles customer money. Collecting its own sale proceeds is ordinary trade;
  collecting on someone else's behalf moves toward RBI payment-aggregator rules.
- It needs working capital, a refunds and returns process, and it carries credit
  and fraud risk on every sale.

## The options

| | A. Become a MoR | B. Model MoR in the books | C. Take the capabilities |
|---|---|---|---|
| What MyCA is | A trading company with software | Accounting app that understands clients who use a MoR | Accounting and compliance app that removes the work |
| Legal load | Multi-state GSTINs, full tax liability, funds handling | None new | None new; filing still needs GSP/ERI onboarding |
| Fits current code | No. Reverses "prepares, the taxpayer confirms", "no money movement" | Yes, small | Yes, this is the existing roadmap |
| Fits Play Store launch | Not an app problem at all; delays the app | Yes | Yes |
| Engineering reuse | Low: ledger and GST engines only | High | High |
| Risk | Very high, regulatory and financial | Low | Low to medium |

### A. Become a Merchant of Record
MyCA would stop being software and become the seller. The ledger, invoice and GST
engines are reusable, but the hard parts are licences, registrations, capital and
operations, none of which is code. It also breaks golden rule 2 in AGENTS.md by
design. Only worth it as a deliberate, funded company pivot.

### B. Model MoR relationships
A business that sells through a MoR has very simple books: one B2B invoice per
period to the MoR, plus purchases. MyCA already handles that. The only addition
is settlement reconciliation (MoR statement against the invoice). Cheap, but it
serves TaxMeow's customers rather than competing for them.

### C. Take the capabilities (recommended)
TaxMeow's list is the same list MyCA needs anyway:

| Capability | State in MyCA today |
|---|---|
| GST split, GSTR-1 JSON, GSTR-3B draft, 2B reconciliation | Built and tested |
| E-invoicing (NIC direct and Sandbox failover) | Built, sandbox only, gated |
| E-way bill generate/get | Client built, sandbox only |
| TDS threshold monitor | Built; returns (FVU) wired through Sandbox only |
| Multi-state GST (several GSTINs for one business) | Not built: one GSTIN per book |
| Collections / payment links | Not built |
| Filing without the owner touching a portal | Blocked on GSP/ASP and ERI onboarding (owner action) |

The gap versus TaxMeow's promise is multi-GSTIN books, live filing, and a phone
app. That is the work, with or without TaxMeow.

## What the Play Store goal adds

- There is no Android code in the repo. The product today is a Node server plus an
  Electron window on Windows.
- A phone cannot run that local server as it stands. The app needs either the
  cloud core (Phase 1 in the tracker) or an on-device port of the engines. This is
  the largest open decision and it reverses the local-only rule in AGENTS.md.
- Play requirements to plan for: the Financial features declaration (mandatory for
  every app), Data safety form, privacy policy, in-app account deletion, current
  target API level. Google also restricts finance apps by developer account type;
  check whether an organisation account is required before registering.
- DPDP Act assessment becomes a launch blocker, not a Phase 1 nicety.

## Decisions needed from the owner

1. Confirm option C (or choose A or B).
2. Phone architecture: cloud-backed app, or engines on the device.
3. First release scope for Play: suggested GST cycle only (invoice, GSTR-1/3B
   pack, 2B reconciliation, deadlines), filing by export until GSP onboarding lands.
4. Start the owner actions already listed in PROGRESS.md; GSP/ERI onboarding has
   the longest lead time.

## Sources

- https://taxmeow.in/ (unreachable; search snippets only)
- https://taxguru.in/goods-and-service-tax/gst-tcs-commerce-operators-section-52-gstr-8-0-5-percent-rate.html
- https://cleartax.in/s/gst-on-notified-services-ecommerce-operators-95
- https://support.google.com/googleplay/android-developer/answer/13849271?hl=en
- https://support.google.com/googleplay/android-developer/answer/9876821?hl=en
