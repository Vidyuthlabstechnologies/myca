# MyCA UK: Google Play listing

Drafted 2026-11-14 for the separate UK app (`com.mldynamic.myca.uk`, "MyCA UK"). The owner reviews
the wording before anything is submitted; nothing here is published by the repository.
`node scripts/check-listing.mjs docs/marketing/uk/PLAY-LISTING.md` checks the three fields against
Play's limits (title 30, short 80, full 4,000 characters).

What the text may and may not promise:

- "Built for Making Tax Digital, HMRC recognition in progress" until HMRC lists MyCA; then "HMRC
  recognised". Never accredited, approved or certified. No HMRC logo.
- No penalty guarantee and no "approved by accountants". The promise is "free fix-and-refile if our
  error".
- No prices in the description (Play shows them). Do not say "free"; there is a 14-day free trial
  but no free plan, and Play shows the trial.
- No competitor names.
- The assistant chooses tools; it does not "do your taxes" or invent figures.
- Bank feeds: say "import your bank statements" unless a bank feed provider is live; then "connect
  your bank" is fine.

### App name

```listing-title
MyCA UK: Making Tax Digital
```

### Short description

```listing-short
Bookkeeping, VAT and Making Tax Digital for sole traders, landlords and firms.
```

### Full description

```listing-full
MyCA UK keeps your business records tidy on your phone and helps you send your VAT returns and Making Tax Digital for Income Tax updates to HMRC, with nothing sent until you approve it.

Built for Making Tax Digital, HMRC recognition in progress.

Digital records, done for you
Import your bank statements and MyCA sorts each line into the right category as it lands. Snap a receipt and it is matched and filed. Add invoices, rent, repairs and other costs in a few taps. Your records are kept the way HMRC asks: digitally, as you go.

Making Tax Digital for Income Tax
For sole traders and landlords. MyCA reads your obligations from HMRC, builds each quarterly update for your self-employment and UK property income, and shows it to you before anything is sent. See HMRC's in-year calculation, then send your final declaration at the end of the tax year.

VAT returns, box by box
MyCA reads your VAT obligations from HMRC and prepares your nine-box VAT return from your records. Check every box, see where each figure came from, then submit.

Know your tax bill early
An estimate of your Self Assessment bill as the year goes on: income tax (including Scottish rates), Class 4 National Insurance, student loan repayments, the High Income Child Benefit Charge, dividends, savings, capital gains and payments on account. HMRC's own calculation is shown beside ours whenever HMRC provides one.

Never miss a deadline
Reminders before every quarterly update, VAT return, final declaration and payment, and a clear view of any penalty points HMRC has recorded.

Checks before you send
MyCA checks your UTR, National Insurance number and VAT number are in a valid format before they are used, and flags anything in a quarter that looks incomplete.

An assistant that does not make things up
Ask questions in plain English. The assistant picks the right MyCA tool to answer and shows you the result. Every figure comes from MyCA's fixed rules, never from the assistant itself.

For accountants
Invite your accountant to your books, or, if you are a firm, work on all your clients' records and submissions from one place.

Your data stays in the UK
Your records are stored on servers in London and encrypted in transit and at rest. You connect to HMRC on HMRC's own sign-in page; MyCA never sees or stores your HMRC password. Export all your records at any time.

Our promise
Nothing goes to HMRC until you approve it. If a figure we sent was wrong because of our error, we fix it and help you refile for free.

Plans
Sole Trader, Business and Accountant firm plans, each with a 14-day free trial. Cancel any time in Google Play.

MyCA UK is not HMRC and is not affiliated with HMRC or any government body. It is software, not tax advice.
```

### Release notes (first release)

```text
Welcome to MyCA UK. Keep digital records, prepare your Making Tax Digital quarterly updates and VAT returns, see your tax estimate, and get reminders before every deadline. Nothing is sent to HMRC until you approve it.
```

### Release notes (template for later releases)

```text
What's new: [one line per change, plain words]. Fixes: [one line]. Thank you for the feedback.
```

## Store settings

| Setting | Value |
|---|---|
| Default language | English (United Kingdom), en-GB |
| Countries | United Kingdom only |
| Category | Finance |
| Tags (pick from Play's list) | Accounting, Business, Taxes, Productivity [check the tags Play offers] |
| Contact email | [support@ address] |
| Website | [MyCA UK site URL] |
| Privacy policy | [URL of PRIVACY-NOTICE.md once published] |
| Content rating | Questionnaire: no violence, no user-to-user content, no gambling. Expected: Everyone or PEGI 3 |
| Target audience | 18 and over |
| Ads | No ads |
| App access for review | Provide a demo account with sandbox HMRC data and instructions; two-step sign-in code for the reviewer |

## Keywords

Play has no keyword field; these words should appear naturally in the title, short and full
description (they do) and in the website copy:

making tax digital, MTD, MTD for income tax, MTD for VAT, quarterly update, final declaration, VAT
return, self assessment, sole trader, self-employed, landlord, property income, bookkeeping, digital
records, receipts, bank statements, HMRC, tax estimate, UTR, National Insurance, accountant.

## Data safety form

Answers for Play Console, App content, Data safety. Reason for each is in the privacy notice and
ROPA (`docs/compliance/uk/`). **Check before submitting** against Play's current definitions,
especially on what counts as "shared".

### Overview

| Question | Answer |
|---|---|
| Does the app collect or share any required user data types? | Yes |
| Is all user data encrypted in transit? | Yes |
| Do you provide a way for users to request that their data is deleted? | Yes, in the app (Settings, Delete account) and by email. Some submission records are kept for a limited period (see privacy notice) |
| Independent security review | [Only if done through Play's recognised programme; otherwise no] |

### Data types

| Category | Type | Collected | Shared | Optional | Purposes |
|---|---|---|---|---|---|
| Personal info | Name | Yes | No | Required | App functionality, account management |
| Personal info | Email address | Yes | No | Required | Account management, app functionality, developer communications |
| Personal info | User IDs | Yes | No (sent to HMRC as required by law; see note) | Required | Account management, fraud prevention and security |
| Personal info | Address | Yes | No | Required for tax | App functionality |
| Personal info | Phone number | Yes | No | Optional | Account management, security |
| Personal info | Other info (UTR, National Insurance number, VAT number) | Yes | No (user-initiated submission to HMRC) | Required for HMRC features | App functionality |
| Financial info | Purchase history (plan) | Yes | No | Required | App functionality, account management |
| Financial info | Other financial info (income, expenses, bank statement lines, tax figures) | Yes | No (user-initiated submission to HMRC) | Required | App functionality |
| Photos and videos | Photos (receipts) | Yes, when the user adds them | No | Optional | App functionality |
| Files and docs | Files and docs (statements, invoices) | Yes, when the user adds them | No | Optional | App functionality |
| App activity | Other user-generated content (assistant messages) | Yes | No (processed by our AI model provider as a service provider) | Optional | App functionality |
| App activity | App interactions | Yes | No | Required | Analytics (aggregated), fraud prevention and security |
| App info and performance | Crash logs, diagnostics | Yes | No | Required | App functionality, analytics |
| Device or other IDs | Device or other IDs (MyCA device id; device make, model, OS, screen, time zone, IP addresses) | Yes | No (sent to HMRC as required by law; see note) | Required for HMRC features | Fraud prevention, security and compliance |

Not collected: location, contacts, calendar, messages, health, audio, web browsing, installed apps,
advertising id.

Note on "shared": Play does not count as sharing a transfer the user starts (sending a return to
HMRC), a transfer to a service provider processing for us, or a transfer required by law (fraud
prevention headers). On that basis the answer is "No" for each. If Play's reviewers or counsel
disagree, declare HMRC as a recipient for User IDs, Other info, Other financial info and Device or
other IDs; it costs nothing to be cautious. IP addresses are not used to work out location, so
"Approximate location" is not declared.

## Financial features declaration

"The app keeps business records and prepares and sends VAT returns and Making Tax Digital for Income
Tax updates and declarations to HMRC, with the user's approval." It does not lend money, hold
deposits, move money, or provide investment or crypto services. Payments to HMRC are made by the
user through HMRC's own payment routes.
