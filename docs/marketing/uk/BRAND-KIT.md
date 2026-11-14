# MyCA UK brand kit

Draft 2026-11-14. The UK expression of the one MyCA design language
([`docs/design/DESIGN-LANGUAGE.md`](../../design/DESIGN-LANGUAGE.md)); tokens in
[`design/tokens/countries.json`](../../../design/tokens/countries.json) (`gb`) and
`design/tokens/base/color.json`. If anything here disagrees with the tokens, the tokens win.

## 1. The idea

**Calm, competent, on your side.** MyCA UK is the accountant-friend in your pocket for Making Tax
Digital: it keeps your records tidy, tells you what is due and when, and sends nothing to HMRC until
you say so. The UK look is **plum** with **gold**: distinct from the US navy and India's ledger
green, quietly premium, and not a flag pastiche.

## 2. Colour

### UK colours

| Token | Hex | Use | Never |
|---|---|---|---|
| UK accent (plum) `gb.accent` | `#5B2A6E` | Links, selected states, progress, positive money, the "UK" in the wordmark, headline highlights on the site, Play feature graphic background | Primary buttons, errors, warnings, body text blocks |
| UK accent, dark theme `gb.accentDark` | `#CDA6DC` | The same roles on dark backgrounds | On light backgrounds (fails contrast) |
| UK soft tint `gb.accentSoft` | `#F1EAF4` | Selected rows, chips, callout panels, screenshot frame backgrounds | Text colour |
| UK soft tint, dark `gb.accentSoftDark` | `#2A1B31` | Same, dark theme | Light theme |
| Highlight (gold) `gb.highlight` | `#E2A93B` | Illustration, celebration moments (a return accepted by HMRC), small accents in marketing art, Bahi's thread | Text on white (fails contrast), warnings (use amber) |

### Shared colours (same in every country)

| Token | Hex | Use |
|---|---|---|
| Canvas | `#FAFAF7` | Page and app background |
| Surface | `#FFFFFF` | Cards, sheets |
| Sunken | `#F2F1EC` | Inset areas |
| Line | `#E6E4DE` | 1-pixel card borders |
| Ink | `#15181B` | Text and **primary buttons** (ink, never the accent) |
| Muted text | `#6C7075` | Secondary text |
| Faint | `#9A9DA1` | Placeholders, disabled (not for meaningful text) |
| Warn amber | `#94570A` on `#FAF1E0` | Deadlines close, things to look at |
| Danger red | `#B3261E` on `#FAEAE8` | Errors, overdue, penalty points |
| Ledger green (logo) | `#1B5E3F` | The logo tile only, in the UK app |
| Bahi red | `#C8312B` | Bahi's cover only |
| Bahi paper | `#FFF8EC` | Bahi's pages, warm illustration backgrounds |

Contrast: the plum accent passes 4.5:1 on canvas, surface and its own tint, and white text on plum
passes 4.5:1 (checked by `design/test`). Gold does not pass as text on white: use it for shapes only.

### Proportions for marketing art

About 60% canvas or white, 25% ink, 10% plum, 5% gold. Plum full-bleed backgrounds are fine for the
Play feature graphic and social cards, with white text and a single gold detail.

## 3. Type

**Inter** everywhere (app, site, social, print). Tabular figures for every amount.

| Step | Size / weight | Marketing use |
|---|---|---|
| display | 34 / 500 | One big line: "Making Tax Digital, made calm." |
| headline | 26 / 500 | Section titles on the site |
| heading | 21 / 600 | Card titles |
| body | 15.5 / 400 | Reading text |
| caption | 12.5 / 400 | Footnotes ("HMRC recognition in progress") |

On social cards scale up proportionally; keep sentence case. No other typefaces.

## 4. Logo

The MyCA mark is the **green ledger tick**: an open ledger with a tick on the right page, white on a
rounded green (`#1B5E3F`) tile. Source: `/mnt/project-files/myca/logo/option2-ledger-tick.svg`.

- The mark never changes by country. The UK app keeps the **green** tile; the country shows in the
  wordmark: **MyCA** in ink with **UK** in plum (`Wordmark(showCountry: true)`).
- Clear space: at least a quarter of the tile's width on every side.
- Minimum size: 24 px on screen, 10 mm in print.
- On plum or dark backgrounds use the tile as is (the green tile sits on its own rounded square).
  Do not recolour the tile plum.

**Do not:** recolour, stretch, rotate, outline, add shadows, put the tick on its own, place the mark
on busy photos, combine it with HMRC's crown or logo, or add a Union flag to it.

## 5. App icon notes

- Adaptive icon: 108 dp canvas, keep the ledger inside the 72 dp safe zone (66 dp circle for round
  masks). Foreground: the white ledger and green tick; background: solid `#1B5E3F`.
- Play Store icon: 512 x 512 px, 32-bit PNG, no transparency beyond the shape Play masks, no text,
  no badge.
- Monochrome (themed icons, Android 13+): the ledger outline in a single colour.
- The UK and India apps will look alike on the home screen. That is deliberate (one brand), but a
  person with both may confuse them. **Owner decision:** keep identical, or add the app label only
  (recommended: identical icon, label "MyCA UK"). Do not add flags.

## 6. Bahi

Bahi the ledger is the mascot in every country: **red cover `#C8312B`, gold thread, paper pages**.
He is a brand constant, never recoloured plum.

| Mood | UK use |
|---|---|
| Wave | Welcome, sign-off emails, the end of onboarding |
| Happy | Empty states ("No receipts yet. Snap one and I'll file it.") |
| Thinking | Importing a bank statement, waiting for HMRC's calculation |
| Celebrate | HMRC has accepted a VAT return or a quarterly update; the only mood allowed an exclamation mark |
| Worried | A deadline is close, a penalty point is showing |

Rules: Bahi does not appear on screens where the person reads numbers or approves a submission
(review, 9-box, final declaration). He never gives tax figures or advice in marketing either. His
lines are short and warm, in British English: "Hi Sam, I'm Bahi. I keep your books tidy." Always a
spoken label for screen readers; a still picture with reduced motion.

## 7. Tone of voice (UK)

MyCA talks like a calm, competent accountant who happens to be a friend.

- **Plain British English.** Organise, colour, licence (noun), programme, cheque. "Tax year", not
  "fiscal year". "Sole trader", "landlord", "self-employed". "Mobile", not "cell".
- **Say HMRC's word where the person will meet it**: quarterly update, final declaration, VAT
  return, Making Tax Digital, UTR, National Insurance number, penalty points. Explain it once.
- **Lead with what happened and what to do**: "Your next quarterly update is due 7 February. Review
  it now."
- **Promise safety**: "Nothing goes to HMRC until you approve it."
- **Never blame**: "That UTR has 9 digits; UTRs have 10. Check your HMRC letter."
- **No fear selling.** Name the deadline and the penalty-point rule plainly, once; do not threaten.
- Sentence case. No exclamation marks except Bahi celebrating. Dates as "7 February 2027". Money as
  "£1,234.56".

### Words we use and avoid

| Use | Avoid |
|---|---|
| Built for Making Tax Digital, HMRC recognition in progress (until recognised) | HMRC accredited, approved, certified, endorsed, official, government-backed |
| HMRC recognised (only after HMRC lists MyCA) | "HMRC's choice", "HMRC partner" |
| Free fix-and-refile if our error | Penalty-proof, guaranteed, no penalties ever, we pay your fines |
| Your figures come from fixed rules you can check | AI does your taxes, AI accountant |
| Assistant | Adviser, accountant, CA, chartered |
| Premium, careful, done properly | Cheapest, free (there is no free plan) |
| Making Tax Digital for Income Tax (MTD IT after first use) | "The new HMRC app", "HMRC software" |

## 8. Play screenshot frames

Play's rules (**check before upload**): PNG or 24-bit JPEG, no alpha, up to 8 MB; phone screenshots
between 320 and 3,840 px a side with the long side at most twice the short; tablet screenshots 16:9 or
9:16, each side between 1,080 and 7,680 px.

| Set | Canvas | Count | Device frame |
|---|---|---|---|
| Phone | 1080 x 1920 px portrait | 6 to 8 | Flat, frameless rounded screen (radius 48 px), screen area 900 x 1600 px, top 220 px for the caption |
| 7 inch tablet | 1080 x 1920 px portrait (9:16) | 4 | Screen area 960 x 1536 px, top 260 px caption |
| 10 inch tablet | 1440 x 2560 px portrait, or 2560 x 1440 landscape (9:16 or 16:9) | 4 | Screen area 1280 x 2048 px portrait; landscape puts caption left |
| Feature graphic | 1024 x 500 px | 1 | No frame: plum background, wordmark, one line, Bahi waving at the right, nothing important in the outer 15% |

Frame style: canvas `#FAFAF7` or UK soft `#F1EAF4` background; caption in Inter 600 ink, at most
6 words, sentence case; one plum word highlighted at most; gold only as a small detail. Screens
show real engine output from a demo business (never invented figures), in GBP, with UK dates and
fictional names. No HMRC logos in screenshots (blur or crop HMRC's own pages if shown).

Suggested phone set and captions:

1. Home: "Your books, tidy every day"
2. Transactions with categories: "Bank lines sorted as they land"
3. Receipt capture: "Snap a receipt. Done."
4. MTD IT obligations: "Every quarterly update, on time"
5. VAT 9-box review: "Check all nine boxes before you send"
6. HMRC accepted (Bahi celebrate): "Sent to HMRC with your approval"
7. Tax estimate: "Know your tax bill early"
8. Deadlines and penalty points: "Never miss a deadline"
