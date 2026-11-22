# Go to market: onboarding, pricing, website, marketing, cost at scale, security posture

| | |
|---|---|
| Version | 1.0, 17 October 2026 |
| Status | Engineering's proposal for the owner's decision. Prices and claims below are not published anywhere until the owner says so. |
| Depends on | The product name (PRD Q1), the legal entity on the privacy notice, a Play Console account, a WhatsApp Business number |

## 1. How a customer onboards themselves

### Android (the owner)

1. Finds MyCA on the Play Store (or a WhatsApp forward with the link). Installs. No form.
2. Opens the app: three lines say what it does, one button says "Get started".
3. Signs in with Google in one tap (phone and code when Google is off). Nothing else is asked.
4. Gives a name, then the business: name and GSTIN. From the GSTIN the app fills the state and
   the PAN and checks the check digit; an unregistered business picks its state from a list.
   The business exists on the next tap; nothing is sent to anyone.
5. "Where are your books today?" Tally (an XML export), Zoho (CSV), a bank statement (CSV),
   or "I am starting fresh". Each import is previewed with counts and a checksum before it
   lands, and a books check runs on it. Fresh books open empty.
6. Home shows one thing to do first ("Log your first sale"), the Ask bar, and the registers.
   The first sale is a sentence: "invoice Retail Mart 8000 GST 18%". It is previewed and
   posted on "yes".
7. In the first week the automation sets the reminders the owner would otherwise forget:
   bank balance, the GST review on the 5th, GSTR-1 by the 11th, payroll by the 7th. The
   Monday brief is one switch away on the business menu.

Time to first invoice: under three minutes with a GSTIN, under five with an import. No
sales call, no KYC document, no card.

### Windows (the owner or the CA firm)

1. Downloads the installer from the website (signed; one file). Runs it.
2. First launch opens a setup wizard: business name, GSTIN (state and PAN derived), financial
   year from today's date; then "bring in your books" with the same four choices as the
   phone and a fifth, "sample books", for someone who wants to see it working first.
3. The dashboard opens on the books. Everything stays on the PC; the daily backup and the
   nightly checks are already running.

Done in this branch: a fresh install opens with empty books and the two-step setup above;
nothing can post until the business is named.

### Where people drop off, and the fix

| Drop-off | Fix built or planned |
|---|---|
| "I do not know my GSTIN" | Unregistered path with a state picker; the GSTIN can be added later from the business menu |
| "My books are in Tally on my CA's PC" | The CA can be invited as an accountant and bring the Tally export in from the desktop; the owner keeps using the phone |
| "I entered something wrong" | Every entry is previewed first; a posted invoice can be amended, credited or cancelled with the reason kept |
| "What do I do now?" | Home always shows the one thing to do; the Monday brief repeats it |

## 2. Pricing

Principle: there is no free plan. MyCA does the work of an accountant's junior, so it is
priced as a paid tool from the first day, with a 14-day Pro trial so an owner can see their
own books in it before paying. Nothing is metered by invoices, because metering makes
people enter less. A year paid up front costs about ten months.

| Plan | For | Price | What is in it |
|---|---|---|---|
| Essentials | A small registered business keeping its own books | ₹999 a month or ₹9,999 a year | Unlimited invoices, bills, receipts and payments, chat in plain words, GSTR-1 and GSTR-3B worked out from the books, two people |
| Pro | A business that wants the returns filed and the channels connected | ₹1,999 a month or ₹19,999 a year | Essentials, plus filing GSTR-1 and GSTR-3B on the portal with the CA's approval, e-invoices and GSTIN checks, Amazon, Shopify, Razorpay and bank connections, WhatsApp, five people |
| MyCA Assured | A business that wants a CA to do the monthly filing, instead of a ₹1,500 to ₹5,000 retainer | ₹4,999 a month or ₹49,999 a year | Pro, plus a chartered accountant who reviews and files GST and TDS every month, the accuracy promise, priority support. Not sold until a CA team is signed |
| CA firm | A CA firm or a larger business with an accountant in-house | ₹5,999 a month or ₹59,999 a year | Pro, plus twenty-five people, approvals across clients, priority support |

After the trial, a business that has not chosen a plan is read-only: it can see, ask about
and export its books, and nothing new is posted until it subscribes.

Why these numbers (market check, November 2026):

| Product | Entry price a year | Top price a year | Notes |
|---|---|---|---|
| Vyapar | about ₹3,400 | about ₹4,300 | Billing first, mobile and desktop, filing is export only |
| myBillBook | about ₹3,500 | about ₹6,800 | No free plan, billing and GST reports |
| Swipe | about ₹2,800 | about ₹3,800 | Billing and e-invoices |
| Busy | about ₹5,000 | about ₹12,000 | Desktop accounting |
| Zoho Books | ₹8,988 (Standard) | ₹35,988 (Premium) | Cloud accounting, GSTR-1 filing on higher plans |
| TallyPrime | ₹8,100 rental (Silver) | ₹24,300 rental (Gold) | Desktop, ₹22,500 or ₹67,500 to buy, plus ₹4,500 a year TSS |

Sources: codingclave.com best billing software for small business in India, aidukan.in
myBillBook vs Vyapar vs Zoho, tallysupport.in Tally price list. Prices move, so check again
before the Play products are created.

Prices were raised on 2026-11-14 from ₹399, ₹799 and ₹2,499 to a premium ladder: MyCA is
priced against Zoho Books and the CA retainer, not against billing apps. Essentials sits
with Zoho Books Standard and gives real double-entry books, GST worked out and the
assistant. Pro adds portal filing, which Zoho keeps for its higher plans, plus e-invoices,
connectors and WhatsApp. MyCA Assured replaces the monthly CA retainer (₹1,500 to ₹5,000 a
month for GST and TDS) with a CA who files from books that are already right. CA firm is
priced at Zoho Books Premium and above a Tally Gold rental, for twenty-five people.

The promise is accuracy, not penalties: if a return MyCA filed is wrong because of MyCA's
mistake, MyCA corrects and refiles it at no charge. MyCA does not promise to pay a
customer's penalties or interest (decided 2026-11-14). The engines cost almost nothing per business
(section 5), so the margin is in every plan, and the portal and AI costs sit in Pro and CA
firm, where they are used.

What is never charged for: data export, the Tally file, the CSV for the CA, deleting the
account. A business that stops paying keeps read access and every export.

## 3. The website

Lives at `deploy/public/index.html` (Cloudflare Workers, static). The research page the
site used to be is kept at `/research.html`. Pages: home, privacy (`/privacy.html`),
status (`/status.html`). The home page carries, in this order:

1. The promise: "Your books, GST and payroll, kept right from your phone. Every entry
   previewed before it posts."
2. How it works in three steps (say it, see it, say yes), with the actual preview text.
3. What is in it, grouped the way an owner thinks: money in, money out, taxes, people,
   stock, the CA. Only built features, each described in one plain sentence.
4. Pricing, the table above.
5. Security and privacy in five sentences, honest ones (section 6).
6. Download: Play Store badge (link when the listing is live), Windows installer from the
   releases page, "or ask on WhatsApp".
7. Footer: privacy policy, the status page, the company name and address once decided.

No tracking scripts, no cookie banner needed, no external fonts or CDNs. The page scores
full marks on Lighthouse as written.

## 4. Marketing material

All of it is in the owner's words, and every claim in it is something the product does
today. Drafts to put in `docs/marketing/` once the name is decided:

- **WhatsApp forward (the main channel).** 90 words, one screenshot of a preview card,
  the Play link. "Type 'invoice Sharma Traders 12000 GST 18%'. MyCA shows you the invoice,
  you say yes, it is in your books and your GSTR-1. Try it free for 14 days."
- **One-page PDF for CA firms.** The firm workbench: every client's books, shared views,
  working papers, the audit that names its rules. Price per client. A QR code to the site.
- **30-second video script.** A shopkeeper on a counter, phone in hand, three messages,
  one "yes", the Monday brief arriving. No voice-over, captions in Hindi and English.
- **Play Store listing.** Already drafted in `docs/release/PLAY-LISTING.md`.
- **Launch post for LinkedIn and the CA community groups.** Lead with the audit: the only
  product that shows the rule, the section and the date behind every figure.
- **Trade association pitch.** Local trader associations and market committees run WhatsApp
  groups with thousands of owners; one demo evening per market with the 14-day trial as the
  hook.

What we do not do: paid ads before the first 500 paying businesses are in and the brief is landing weekly;
claims about filing until live filing is on; "AI" in the headline (owners do not buy AI,
they buy "it is done").

## 5. Cost at scale

Assumptions: the hosted service as deployed by `infra/cloud` (Cloud Run in Mumbai, Cloud
SQL Postgres, one row of books per business), an owner making 40 requests a day, books of
10 to 30 MB a year, WhatsApp at Meta's India utility rate, SMS only for phone sign-in.
Figures are engineering estimates from public list prices in October 2026, not quotes.

| Users (businesses) | Cloud Run | Cloud SQL | Storage and backups | WhatsApp briefs | Sign-in SMS | Monthly total | Per business per month |
|---|---|---|---|---|---|---|---|
| 1,000 | ₹3,000 | ₹6,000 (db-g1-small, zonal) | ₹500 | ₹1,500 | ₹500 | ~₹12,000 | ₹12 |
| 10,000 | ₹15,000 | ₹25,000 (2 vCPU, regional) | ₹4,000 | ₹15,000 | ₹3,000 | ~₹62,000 | ₹6 |
| 100,000 | ₹1,20,000 | ₹1,50,000 (8 vCPU, read replica) | ₹40,000 | ₹1,50,000 | ₹20,000 | ~₹4,80,000 | ₹5 |
| 1,000,000 | ₹10,00,000 | ₹9,00,000 (sharded by business id across four instances) | ₹4,00,000 | ₹15,00,000 | ₹1,50,000 | ~₹39,50,000 | ₹4 |

Why it stays cheap: the engines are plain JavaScript with no per-request model call
(the model only chooses a tool, and only when the planner did not match, which the
fuzz run put under 5% of messages); a business's books are one row read and written in
one transaction, so there is no fan-out; nothing runs when nobody is using it (Cloud Run
scales to zero); the Monday brief is one text per member per week. The two things that
would change this: a document-reading model on every photo (budget ₹2 to ₹4 per bill
read; charge the add-on for it) and live filing through a GSP (per-return fees; pass
through at cost).

At one million businesses at ₹4 each and a blended ₹250 a month revenue after free
users, infrastructure is under 2% of revenue. The real costs are people: support,
the partner CA firm attesting rules, and the GSP.

## 6. Security posture, stated honestly

What is true today, and what cannot be promised:

- **The engines stay on the server.** The phone app holds no tax logic and computes no
  figure; it sends sentences and form fields and shows what comes back. Someone who
  decompiles the APK finds screens and an HTTP client, not the product. The desktop
  edition does ship the engines, because it is local-only by design; its protection is
  that it holds only that owner's books.
- **Nothing can be made un-analysable.** Any code that runs on a customer's device can be
  read by that customer. Obfuscation slows a reader down by hours, not years, and
  breaks crash reports and store review. We therefore do not sell "cannot be reverse
  engineered"; we sell "there is nothing on the device worth reverse engineering" and
  prove it with the open design.
- **What is enforced, and tested.** Every action is previewed and confirmed with a token
  bound to the exact payload; the owner-only settings are enforced in the engine, not
  the app; the money path was fuzzed with 8,000 messages; sign-in codes are hashed,
  rate-limited per number and per address; keys are refetched at most once a minute;
  one business is one row and a non-member gets the same 404 as a business that does
  not exist; the ledger is an append-only chain with a checksum verified nightly;
  backups are daily with checksums; the hosted suite runs against a real Postgres on
  every push.
- **What is still open** is listed plainly in `docs/architecture/SECURITY-AND-PRIVACY.md`
  section 4 and is the launch gate: envelope encryption of the books column, a staff
  access log, a penetration test, dependency scanning in CI, a retention policy.

## 7. Compliance

| Obligation | Where it stands |
|---|---|
| Digital Personal Data Protection Act 2023 | Consent notice versioned and recorded per user; purpose-limited collection; deletion on request; the grievance officer and retention periods are placeholders until counsel names them |
| GST Act record keeping (s.35, six years) | The books are append-only and exportable; retention policy to be written so deletion requests and the six-year rule are reconciled |
| Income-tax Act books and TDS records | Same; TDS deductions carry section, rate and the dated rule used |
| CERT-In directions of April 2022 (logs 180 days, incident reporting in six hours) | Cloud Logging retention to be set to 180 days in Terraform; the incident runbook names the reporting step |
| Play Store data safety and permissions | Drafted in `docs/release/PLAY-LISTING.md` from what the app does |
| MSMED Act s.15 and Income-tax s.43B(h) | Built into supplier dues and the payment run |
| E-invoice and e-way bill rules | Built behind the live switch and a CA approval; needs NIC production credentials |
| ISO 27001 and SOC 2 | Not now; after the first paying firms ask, on the documented controls above |

## 8. Order of work from here

1. Decide the name and the legal entity; publish the privacy notice and the site.
2. Desktop setup wizard and "bring in your books" on first launch.
3. The remaining small-business workflows: month close with sign-off, payroll flags and
   "can I make payroll", advance tax set-aside, cash forecast bands, restock.
4. Launch gates from the security document: encryption of the books column, access log,
   retention policy, dependency scanning, a penetration test.
5. Play closed testing with the first 50 businesses, then the paid launch with the 14-day trial.
