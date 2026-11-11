# MyCA consumer research and UX principles (November 2026)

Desk research on the people the country apps serve, an audit of the current India app screens
against it, and the principles the screen drafts follow. The drafts are on the design canvas
"MyCA Screen Drafts" (https://claude.ai/artifact/C8v9Sx4VHzJs3UpegZYB6p, private to the owner until shared). This is secondary research: the next step is five short interviews per
country with real owners and filers (script at the end).

## Who we design for

| Country | Main person | What they are doing | Where they are |
|---|---|---|---|
| India | Owner of a shop, trader or small manufacturer, often with a part-time CA | Sales, purchases, GST every month or quarter | Phone first, WhatsApp all day, UPI for payments, Hindi or a regional language at home |
| United States | Individual filing Form 1040, some with side income | One return a year, fear of mistakes and missed credits | Phone or laptop, used to TurboTax or a paid preparer |
| Malaysia | Owner of a small business facing the LHDN e-invoice mandate | E-invoices through MyInvois, SST, Form B/BE | Phone first, English and Malay, often mixed |

## What the research says

### India: owners want the compliance to stop eating their day

- MSMEs rate quarterly filing as the most helpful GST provision; 61% want interest worked out
  for them, and 54% struggle to connect the Invoice Management System to their books, with
  unclear timelines adding audit anxiety (Deloitte survey via
  [Republic Business](https://www.republicworld.com/business/refund-woes-audit-fears-why-gst-still-isnt-easy-for-msmes)).
- The smallest, unincorporated firms carry the heaviest compliance burden relative to size
  ([Business Today, Sep 2026](https://www.businesstoday.in/latest/economy/story/gst-compliance-burden-weighs-more-heavily-on-smaller-unincorporated-firms-558531-2026-09-29)).
- Over 85% of small business owners already run the business from a smartphone, and UPI and
  smartphones drive their digital adoption
  ([Storyboard18](https://www.storyboard18.com/digital/over-85-of-small-business-owners-using-smartphones-for-biz-ops-report-35559.htm),
  [PayNearby via CXOToday](https://cxotoday.com/media-coverage/73-msmes-report-business-growth-via-digital-adoption-led-by-upi-and-smartphones-paynearby-survey/));
  about 36% still struggle with technology adoption
  ([BusinessWorld](https://businessworld.in/article/about-36-msmes-struggle-with-tech-adoption-18-cite-high-costs-report-524353)).
- What owners praise in Vyapar and Khatabook: easy enough for new staff, WhatsApp invoice
  sharing and payment reminders, "cut my accounting time by half". What they complain about:
  support that doesn't answer, data that goes missing or totals that don't match, slow and buggy
  updates, unreliable sync, and fixed date formats
  ([Capterra Vyapar reviews](https://www.capterra.com/p/180579/Vyapar/reviews/),
  [Khatabook feedback summary](https://kimola.com/reports/unlock-key-insights-khatabook-app-user-feedback-report-google-play-hi-148328)).

### United States: fear of mistakes and of being upsold

- Nearly half of adults don't fully understand their tax forms, 64% find preparing taxes
  stressful, 36% fear they are missing deductions or credits, and 36% say making a mistake is
  their biggest fear (Savanta, March 2025, via
  [CPA Practice Advisor](https://www.cpapracticeadvisor.com/2025/03/17/confusion-and-stress-drive-many-americans-desire-for-tax-reform-survey-finds/157471/)).
- IRS Direct File showed what calm feels like: 90% rated it excellent or above average, 86% said
  it raised their trust in the IRS, three in five filed in under an hour, and people named ease,
  trust and "free" as what they valued
  ([Customer Experience Dive](https://www.customerexperiencedive.com/news/irs-direct-file-pilot-taxpayer-user-satisfaction/714630/)).
- Simple filers leave money on the table by missing credits they qualify for
  ([Stacker](https://stacker.com/stories/personal-finance-investing/why-simple-tax-filers-are-leaving-money-table-and-how-fix-it)).

### Malaysia: e-invoicing is the moment, and people want a checklist

- Only 30% of SMEs fully understand e-invoicing, 31% have fully integrated it, and 19% have
  not started. 55% name unclear rules as the top challenge, 49% the volume of data, 47% data
  security, 45% limited in-house skills. 70% want step-by-step guides or checklists, 59% help
  connecting existing systems. Smaller firms most often cite lack of time (Xero whitepaper,
  500 respondents, April to May 2025, via
  [Malaysia SME](https://www.malaysiasme.com.my/malaysias-smes-need-more-support-ahead-of-e-invoicing-mandate-xero-whitepaper-finds/)).
- The rollout dates moved more than once, and owners are frustrated by the changes
  ([The Rakyat Post](https://www.therakyatpost.com/news/2025/12/08/malaysians-are-upset-over-e-invoicing-flip-flops-by-the-government/)).

## What the current India app gets right, and what to fix

Audited from `mobile/tool/screens` (welcome, home, new entry, new sale, preview, taxes, review,
books check).

Right: the "What happened?" sheet speaks in the owner's words; nothing posts or files without a
confirm; amounts are big and clear; the approve step is explicit.

To fix:

1. **Machine dates everywhere**: "Due 2026-10-11", "last balance 2026-09-28". Use "Sat, 11 Oct"
   and "in 6 days".
2. **Return names and ledger words as headlines**: "INV-0003 cannot be reported in GSTR-1",
   "Settlements matched to the bank", "Every entry has a matching debit and credit". Lead with
   what it means for the owner, and put the form name second.
3. **The home screen has no single answer**: three cards compete (taxes, books today, this
   week). Owners want one line first: "You're up to date" or "1 thing needs you before Sat".
4. **Numbers without meaning**: "₹3,600.00" alone. Say "You'll pay ₹3,600 GST by 20 Nov" and
   compare with last month.
5. **Vague buttons**: "Not yet", "Preview", "Post it". Say what happens: "Save the sale",
   "Fix it for me", "Approve and pay".
6. **No way in without typing**: the research shows WhatsApp, photos and voice are how owners
   work. Make "forward to MyCA on WhatsApp", "take a photo" and "say it" first-class.
7. **Bahi is missing** from the moments that need warmth: first run, empty states, a finished
   filing.
8. **Trust is invisible**: say where data lives, show the last backup, show the CA's name where a
   CA reviews.

## Principles for every country's screens

1. **One answer first.** Every screen opens with the one sentence the person came for.
2. **Plain words, statutory name second.** "Sales report for October (GSTR-1)".
3. **Dates as people say them, with a countdown.** From the locale, never ISO on screen.
4. **Every number has a sentence.** Who pays whom, how much, by when, compared with what.
5. **Buttons say what happens.** Verb plus object; the safe choice is never the hidden one.
6. **Nothing files or pays without a clear approve**, and the approve screen shows exactly what
   leaves the app.
7. **Meet people where they are.** WhatsApp forward, photo, voice, in their language.
8. **Step by step when the rules are new** (Malaysia e-invoicing, a first US return): a checklist
   with progress and "why we ask".
9. **Show the safety net.** Data stays in the country, backed up today, a person to ask.
10. **No upsell inside a task.** Plans appear in settings and on the plan screen, never mid-filing.

## Screens drafted

| Flow | Screens |
|---|---|
| India owner | Welcome and language, Home (Today), Add anything, Record a sale, Fix a problem, Pay GST, Done |
| US filer | Start your return, One question at a time, Refund so far and review, Sign and file |
| Malaysia owner | Home in Malay, E-invoice checklist, Ask Bahi |

## Interview script for the next round (15 minutes each)

1. Walk me through the last time you dealt with tax or your books. What happened just before?
2. What was the most annoying part? What did you do about it?
3. Who helps you (CA, family, staff)? How do you send them things?
4. Show me how you'd record yesterday's biggest sale. (Then the draft screen.)
5. On this screen, what would you tap first? What does this number mean to you?
6. What would make you trust an app with your books or your return?
