# MyCA UK: billing, refunds and cancellation

Draft 2026-11-14. Which UK charges go through Google Play billing, which go by card, and the refund
and cancellation rules, written for the Consumer Contracts (Information, Cancellation and Additional
Charges) Regulations 2013 (CCR) and the Consumer Rights Act 2015. A UK solicitor must review it,
including the subscription rules in the Digital Markets, Competition and Consumers Act 2024
(DMCC Act) (**check before publishing** which of those rules are in force on launch day).

## What is sold

| Product | Price | What it is | How it is paid | Why |
|---|---|---|---|---|
| MyCA UK Sole Trader | £49 a month | Software subscription: digital records, bank import, MTD VAT, MTD Income Tax updates and final declaration, estimator, reminders, assistant, for one sole trader or landlord | Google Play billing, in the app | Cloud software and services sold in an Android app must use Play billing (Google Play Payments policy; gb.md, us.md) |
| MyCA UK Business | £99 a month | Software subscription for a business with more volume or more users [features to confirm: for example more businesses, staff seats, VAT with partial exemption] | Google Play billing | Same |
| MyCA UK Accountant firm | £499 a month | Software subscription for a firm working on many clients' books [client limit to confirm] | Google Play billing | Same |
| Self Assessment return preparation | £149 per return | A tax filing service for one tax year for one person | Card through Stripe (UK entity's account) | Google's Payments policy says tax preparation and filing should not use Play billing (us.md, source in gb.md). **Check before launch** that the current policy text still says so, and that what the fee buys is filing and preparation, not software features |

All plans start with a **14-day free trial**. There is **no free plan**. There is no annual plan at
launch.

### Things to settle before launch

1. **VAT and the displayed price.** For UK consumers Google sets and remits VAT on Play sales, and
   Play shows prices with VAT included. Decide whether £49, £99 and £499 are the VAT-inclusive
   Play prices (most likely) and say "inc. VAT" wherever prices appear. Business buyers will want
   a VAT invoice; Google's receipts may not serve as one. **Check before publishing.**
2. **Play's price ceiling.** Confirm in Play Console that £499 a month is within the maximum price
   allowed for a GBP subscription. If not, the firm plan cannot be sold in the app at that price.
3. **The firm plan outside the app.** Accountant firms often buy software on a company card and
   need proper invoices. Consider selling the firm plan on the website as well. Do not add a
   "buy on our website" link or price inside the Android app unless a Play programme available in
   the UK allows it. **Check before publishing.**
4. **The £149 fee and adviser registration.** If the £149 service involves a person at MyCA
   preparing or reviewing the return, it may bring MyCA inside mandatory tax adviser registration
   from May 2026 (gb.md). Confirm with a UK adviser before selling it.
5. **What the £149 fee files.** For people in MTD Income Tax, the return is the final declaration
   through HMRC's MTD API. For people not yet in MTD, a Self Assessment return (SA100) is filed by
   a different HMRC channel that needs separate HMRC recognition. Until MyCA has that, the £149
   service must say what it does for non-MTD users (for example: prepares the figures for the user
   to enter on HMRC's own service). **Engine to confirm.**

## How subscriptions work in the app

- The user picks a plan in the app; Play shows the price, the trial length and the renewal date
  before they confirm.
- The trial is free. Three days before it ends, MyCA sends a reminder (in the app and by email)
  with the date of the first charge and how to cancel. (The DMCC Act will require reminders like
  this; MyCA does it from day one.)
- Subscriptions renew monthly until cancelled. The user cancels in Google Play (Play Store,
  Payments and subscriptions, Subscriptions) and the app links straight there. Access continues to
  the end of the paid month.
- If a payment fails, Play's grace period applies and the app keeps working; MyCA shows a notice and
  never deletes records because of a failed payment.
- When a subscription ends, the account turns read-only for export (DATA-RETENTION.md). No HMRC
  submissions are possible without an active plan or trial.
- Upgrades and downgrades go through Play's plan change; proration is Play's.

## Cancellation rights (consumers)

The CCR give a consumer who buys at a distance 14 days to cancel. Many MyCA UK buyers are sole
traders and landlords who may be acting for their business, and the CCR then may not apply. **MyCA
applies the same rights to every UK customer** so that support never has to decide who is a
consumer.

### Subscriptions

- **During the trial**: cancel at any time; nothing is charged.
- **First paid month**: if the user cancels and asks for a refund within **14 days of the first
  charge after the trial**, MyCA refunds that charge in full. [Owner to confirm. This is more
  generous than the CCR's proportionate-payment rule and matches the coming DMCC renewal cooling-off
  rules, so it is the simple, safe position.]
- **Later months**: cancel at any time; no refund for the part of a month already started, except
  where the law requires one or the service was faulty.
- **Faulty service**: under the Consumer Rights Act 2015 a digital service must be provided with
  reasonable care and skill; where it is not, MyCA repairs, re-performs or refunds.

How refunds are paid: Google lets users ask Google directly for a refund within a short window
after purchase (**check** the current window, often 48 hours); after that, MyCA refunds through Play
Console, which returns the money to the user's Play payment method.

### Self Assessment return preparation (£149)

- The user agrees to the service starting at once and acknowledges, at checkout, that once the
  return has been filed the service is fully performed and the right to cancel ends.
- **Before work starts**: full refund on request.
- **After work starts but before filing**: within 14 days, the user can cancel and pay only for work
  done (CCR regulation 36), or MyCA may simply refund in full [owner to decide; full refund is
  simpler].
- **After filing**: no cancellation refund. If the return was wrong because of **MyCA's error**,
  MyCA fixes it and files the amendment free (**free fix-and-refile if our error**). MyCA does not
  promise to pay penalties or interest and never guarantees an outcome with HMRC.
- **If MyCA cannot file** (for example HMRC rejects for a reason we cannot resolve, or the person's
  situation is outside what MyCA covers, which MyCA must say before payment), full refund.

## Information MyCA must give before purchase

Shown in the app before the Play sheet, on the website pricing page and in the terms: the trader's
identity and address ([UK entity to confirm]); the main features of each plan; the total price
including VAT; that it renews monthly until cancelled; the trial length and when the first charge
happens; how to cancel; the cancellation and refund rights above; how to complain.

## Records

Each purchase, renewal, cancellation and refund is recorded (order id, plan, dates, amounts) and
kept 6 years (DATA-RETENTION.md). Google's Real-time developer notifications feed the server so the
plan state is always Google's, not the app's.
