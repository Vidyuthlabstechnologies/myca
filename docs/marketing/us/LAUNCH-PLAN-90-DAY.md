# MyCA US: 90-day launch plan, 2027 filing season

Day 1 is **Monday, January 18, 2027**; day 90 is **Saturday, April 17, 2027**, two days after the
April 15 deadline (a Thursday) and the end of the $99 launch price. The IRS has not announced the
2027 opening date as of November 14, 2026; it is usually the last week of January. Adjust the
"season opens" line when it is announced.

All targets below are goals for planning, not results, and are never quoted in marketing.

## Before day 1 (November 16, 2026 to January 17, 2027)

| When | Work | Owner |
|---|---|---|
| By Nov 30 | US company, support email, domain and postal address decided (blanks in every doc) | Owner |
| By Nov 30 | Claim social handles; create the LinkedIn company page | Marketing |
| By Dec 4 | Early-access form live on `/us` (`MYCA_EARLY_ACCESS_URL` set); OG image switched to `social-1200x630.png` | Engineering |
| By Dec 11 | Terms of Service with the accuracy promise and fee refund policy; privacy notice blanks filled | Owner and counsel |
| By Dec 18 | Store listings submitted with screenshots, feature graphic, icons; Play closed test with 20+ US testers | Marketing, engineering |
| By Jan 8 | Partner contract signed, Stripe live on the US company, US stack applied (see `docs/compliance/us/US-LAUNCH.md`) | Owner |
| By Jan 8 | Comparison page re-checked against the 2027-season prices; legal review | Marketing, counsel |
| By Jan 15 | Press kit page (`/us/press`): logo, icon, wordmark, Bahi, screenshots, press release, fact sheet | Marketing |
| Jan 11–15 | Dry run: one full return in the sandbox build, each email triggered once, every link checked | All |

**Go / no-go on January 15:** the app is approved in Play (and the App Store if shipping), payments
work end to end in production with a real card and a refund, partner handoff works, support inbox is
staffed. If any is missing, move day 1 by a week rather than launch broken.

## Phase 1: Open (days 1–14, Jan 18 to Jan 31)

Goal: the people on the early-access list start their returns; the product works under real load.

- Launch day: email the early-access list (one email, the launch price and the end date), social
  launch posts (`LAUNCH-SOCIAL.md`), press release to a short list of personal-finance writers and
  newsletters, Product Hunt listing (no paid upvotes).
- App Store Optimization: watch Play and Apple search-term reports daily; change one field at a
  time.
- Paid search starts small: Apple Search Ads exact-match on the core keywords (`KEYWORDS.md`) and
  Google App campaigns; daily cap set by the owner (suggested to start: $100 to $200 a day in total).
- Content: three guides published: "Reading your W-2 box by box", "Your 1099-NEC and Schedule C",
  "What happens after you e-file".
- Support: reply to every email within one business day; tag every question; publish the top five
  as new FAQ entries by day 14.
- W-2s must be sent by January 31: day 10 to 14 posts and email 2 lean on this.

**Watch:** sign-ups, returns started, forms added per return, returns reaching review, unsupported-
form exits (what forms people needed that we lack), payment success, IRS acceptance and rejection
reasons, crash-free sessions.

## Phase 2: Grow (days 15–60, Feb 1 to Mar 18)

Goal: steady acquisition in the heaviest early-filer weeks (families with refunds file in February).

- Paid: shift budget to the keywords and audiences with the lowest cost per filed return; pause
  anything above the owner's target cost per filed return for seven days in a row.
- Creators: three to five small personal-finance and gig-worker creators, paid, labelled
  "#ad / paid partnership", script approved by us for accuracy and the "free" rule; no refund amounts
  on screen.
- Community: answer tax questions where self-promotion is allowed (no posting in subreddits that ban
  it); always disclose that you work on MyCA.
- Partnerships to approach (no promises): employers' benefits teams, freelancer co-working spaces,
  credit unions' financial-wellness programs.
- Product marketing: a short in-app prompt for MyCA Plus only after a return is accepted, never
  before filing.
- Week 6: review the comparison page and the store screenshots with what users actually tap.

**Mid-season check (day 45, March 3):** if filed returns are well below plan, cut paid spend and
put the money into fixing the biggest drop-off step; if unsupported-form exits are high for one
form, tell the product lead which.

## Phase 3: Deadline (days 61–90, Mar 19 to Apr 17)

Goal: serve the late filers and end the launch price cleanly.

- From April 1: "The $99 launch price ends April 15" in email (to people who started but have not
  filed), social and the store promotional text. No countdown timers, no "last chance" shouting.
- April 12–15: extended support hours; pre-written answers for "I can't finish in time" (point to
  the IRS extension, Form 4868, filed at irs.gov or with any provider; MyCA does not file
  extensions this season).
- April 16: price changes to $129 in the app, the site, the stores' promotional text and every
  social bio; old launch-price ads switched off the night of April 15 (Pacific time).
- April 17 (day 90): season report to the owner: what worked, cost per filed return by channel,
  top unsupported forms, top support questions, rejection reasons, and recommendations for state
  returns and Expert Review in 2028.

## After day 90

- Extension filers (deadline October 15, 2027): one email in late September to people who started
  and did not file.
- MyCA Plus: quarterly estimated-payment reminders for subscribers (June 15, September 15, January
  15 due dates).
- Plan the 2028 season: own e-file route, state returns, Expert Review partner.

## Budget shape (owner sets the totals)

| Line | Share of paid budget | Notes |
|---|---|---|
| Apple Search Ads and Google App campaigns | 55% | Exact match first, broaden only on proven terms |
| Creators | 25% | Paid, labelled, scripted for accuracy |
| Paid social (Meta, TikTok) | 15% | Only after organic posts show which message works |
| Reserve | 5% | For whatever works in February |

## Compliance checklist for every campaign

- [ ] "Free" always next to "pay only when you file" or the price
- [ ] Launch price always with "through April 15, 2027"
- [ ] No refund amounts, user counts, ratings, testimonials or "#1"
- [ ] "Not affiliated with the IRS" on ads with room for a line
- [ ] No tax return information used for targeting or email without IRC 7216 consent
- [ ] Paid creators labelled; their claims checked by us
- [ ] Emails carry the postal address and unsubscribe
- [ ] Expert Review shown only as "coming soon / join the waitlist"
- [ ] Federal only; state returns not offered
