# Launch emails (India)

Five emails: a launch announcement, a three-step trial sequence for people who installed, and an
invitation for CA firms. Header images are rendered by `templates/email-header.html` into
`out/email-header/`. Nothing here is sent: the owner sends from the company domain once it exists
(the support address and postal address still need filling in, as on `/privacy`).

Every email ends with the same footer:

> MyCA is made by ML Dynamic Solutions Private Limited, {{ADDRESS}}. MyCA is not affiliated with GSTN or the Government of India. You are receiving this because {{REASON}}. [Unsubscribe]({{UNSUBSCRIBE}})

---

## 1. Launch announcement (to the waitlist and early contacts)

**Subject:** MyCA is live: your books, kept right
**Preview text:** Books, GST and payroll by chat. You approve every entry and filing.
**Header:** `header-01-launch.png`

Hi {{FIRST_NAME}},

MyCA is now on Google Play.

It keeps your books the way a careful accountant would, from your phone:

- **Type it or snap it.** "Invoice Sharma Traders 12,000 GST 18%" or a photo of a purchase bill.
- **See it first.** MyCA shows you exactly what it will post. Nothing goes in until you say yes.
- **GST, drafted.** GSTR-1 and GSTR-3B are worked out from your books. File on the portal with your EVC OTP when you are ready, or ask your CA to approve first.

And our promise: if a return MyCA filed is wrong because of our mistake, we correct it and refile it at no charge.

Your first business gets 14 days of Pro, free.

[Get MyCA on Google Play]({{PLAY_LINK}})

Bahi and the MyCA team

---

## 2. Trial day 1: the first entry

**Subject:** Your first sale in MyCA takes one line
**Preview text:** Try "invoice {{CUSTOMER}} 8,000 GST 18%"
**Header:** `header-02-first-entry.png`

Hi {{FIRST_NAME}},

The fastest way to see MyCA work is to record one real sale.

Open the app and type a sentence in the Ask bar, for example:

> invoice Retail Mart 8000 GST 18%

MyCA shows the invoice with the GST split for your state. Check it and tap **Yes**. It is now in your books, your sales register and next month's GSTR-1.

Bringing books from Tally or Zoho? Choose **Bring in your books** from the business menu. You see the counts before anything lands.

[Open MyCA]({{APP_LINK}})

---

## 3. Trial day 5: GST without the scramble

**Subject:** Your GSTR-1 is already taking shape
**Preview text:** See this month's draft, built from the entries you made
**Header:** `header-03-gst.png`

Hi {{FIRST_NAME}},

Every sale and bill you record in MyCA flows into the month's GST draft.

Open **Taxes** to see GSTR-1 and GSTR-3B for this month: what is ready, what needs a look (an invoice without a GSTIN, a bill that is not in GSTR-2B yet) and the date it is due.

When you are on Pro, you can file on the portal from MyCA once you confirm with the EVC OTP sent to your authorised signatory. Prefer your CA to check first? Turn on **CA approval** and invite them.

[Review this month's GST]({{APP_LINK}})

---

## 4. Trial day 12: choose a plan

**Subject:** Two days left on your Pro trial
**Preview text:** Your books stay yours whatever you choose
**Header:** `header-04-plans.png`

Hi {{FIRST_NAME}},

Your 14-day Pro trial ends on {{TRIAL_END}}.

| Plan | For | Price |
|---|---|---|
| Essentials | Keep your own books, GST worked out, 2 people | ₹999 a month or ₹9,999 a year |
| Pro | Plus portal filing, e-invoices, connectors, WhatsApp, 5 people | ₹1,999 a month or ₹19,999 a year |
| CA firm | Plus 25 people and approvals across clients | ₹5,999 a month or ₹59,999 a year |

No per-invoice limits. Google Play shows the final price before you pay, and you can cancel any time.

If you do not choose a plan, nothing is lost: your books stay readable and you can export everything.

[Choose a plan]({{APP_LINK}})

---

## 5. For CA firms (one-to-one, sent by the owner, not a mass mail)

**Subject:** A quieter month end for your GST clients
**Preview text:** Your clients keep the books; you review and approve
**Header:** `header-05-ca.png`

Dear {{CA_NAME}},

I am {{SENDER}}, from MyCA, a bookkeeping and GST app for small businesses, built by ML Dynamic Solutions.

We built MyCA so that a firm like yours receives books that are already right, instead of a bag of bills on the 9th:

- Your clients record sales, bills and expenses on their phone. Every entry is previewed and confirmed.
- You see every client in one place, with an approvals queue for filings that need your sign-off.
- Every figure shows the GST rule and the date it came from, so review is fast.
- Export to Tally or CSV whenever you want to work in your own tools.

The CA firm plan is ₹5,999 a month for 25 people across your clients, and each client of yours who subscribes earns your firm a free month.

Could I show you a 20-minute walkthrough on sample books this week? I have attached a short pitch.

Warm regards,
{{SENDER}}
{{PHONE}}
