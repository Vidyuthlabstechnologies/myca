# MyCA US brand kit

Version 1, November 14, 2026. For everyone who writes, designs or approves anything with the MyCA US
name on it: the app, the store pages, the website, email, social, ads and press.

MyCA US is a separate app from MyCA India. It is for the general US market: W-2 employees,
freelancers and gig workers with 1099 income, young families, and retirees. It is not marketed as an
app for Indians or the Indian diaspora, and nothing in its brand says so.

The universal design system (`design/`, `docs/design/DESIGN-LANGUAGE.md`) still applies. This kit
adds what is specific to the US: the navy accent, the US icon, the US voice, US English and the
legal lines.

## 1. Positioning in one breath

> MyCA US prepares your federal tax return on your phone and explains every line. It is free to
> prepare and see your refund. You pay only when you file.

| | |
|---|---|
| Who it is for | People with W-2s, 1099s and 1098s who want to understand their return, not just finish it |
| Where it sits | Premium, priced at or above the mainstream do-it-yourself apps, because it explains more and pushes less |
| Personality | Honest, calm, exact. A good accountant who happens to be a friend |
| What it never is | Loud, cute about money, urgent, or vague about what it costs |

### Prices (the only figures marketing may use)

| Product | Price | How to say it |
|---|---|---|
| Federal return | $129 | "$129 to file your federal return" |
| Launch price | $99 through April 15, 2027 | "$99 launch price through April 15, 2027" (always with the end date) |
| MyCA Plus | $249 a year | "MyCA Plus, $249 a year": estimated payments, a withholding check, help with IRS letters |
| Expert Review | $299 | "Expert Review is coming soon. Join the waitlist." Never sold, priced as available, or promised until a CPA or EA partner is signed |
| Preparing and seeing your refund | Free | Always paired with "pay only when you file" |
| State returns | Not offered | "MyCA files your federal return. State returns are not offered yet." |

"Free" never stands alone. Any line that says free also says, in the same view and at the same
size or close to it, that filing costs money. This follows the FTC's position on "free" tax
preparation advertising, which it enforced against a large tax software maker in 2024.

### Promises we can keep, and the ones we never make

| Say | Never say |
|---|---|
| "Every line explained" | "IRS-approved", "IRS-certified", "endorsed by the IRS" |
| "Checked before you sign" | "#1", "best", "most accurate", "fastest" |
| "E-filed through our IRS-authorized e-file partner" | "MyCA is an IRS e-file provider" (not until MyCA's own EFIN) |
| "If our error means your return needs fixing, we fix it and you refile free" | "Maximum refund guaranteed", "100% accuracy guarantee", "we pay penalties" |
| "Tells you before you pay if your return needs something it can't handle" | "Handles every tax situation" |
| "Encrypted, kept on US servers, never sold" | "Bank-level security", "unhackable" |
| "Opens in January 2027" | User counts, ratings, reviews or testimonials that do not exist |

**Accuracy promise, exact wording** (use this sentence, do not paraphrase in ads):

> If a mistake in MyCA's calculations means your federal return needs to be corrected, we fix it
> and you file the correction at no extra charge. This promise does not cover IRS penalties or
> interest.

## 2. Name

- The product is **MyCA US**. Use it in full the first time on any page, in store titles, in press
  and in the email sender name. After that, **MyCA** is fine.
- Written as one word, capital M, lower y, capital C, capital A: `MyCA`. Never `MyCa`, `My CA`,
  `MYCA`, `Myca` or `My-CA`.
- Said "my C-A". We do not explain the letters. In the US, CA reads as California to some people and
  as "chartered accountant" to almost no one; the tagline does the explaining instead.
- The paid tiers are **MyCA Plus** and **Expert Review**. The mascot is **Bahi**.
- The company line is "MyCA US is made by [US company name]." Until the US company exists, the
  publisher line in the stores is the owner's legal entity, and marketing does not name a company.

## 3. Logo

The mark is the **ledger with a tick** (logo option 2): an open book whose right page carries a
green tick. In the US the tile is navy and the tick keeps the brand's ledger green, so every MyCA
country shares the tick and each has its own tile.

| File | Use |
|---|---|
| `assets/icon/app-icon-us.svg` (+ `-512`, `-192`, `-48` PNG) | Primary. Navy tile, white ledger, green tick |
| `assets/icon/store-icon-us.svg`, `play-store-icon-512.png`, `app-store-icon-1024.png` | Store icons. Full-bleed square with no transparency; the stores round the corners |
| `assets/icon/adaptive-foreground.svg`, `adaptive-background.svg` | Android adaptive icon layers (108 by 108, mark inside the 66 safe circle) |
| `assets/icon/adaptive-monochrome.svg` | Android 13+ themed icon; the tick is cut out |
| `assets/icon/app-icon-us-reversed.svg` | On navy or photographs: white tile, navy ledger, white tick |
| `assets/icon/app-icon-us-ink.svg` | Ink tile, for black-and-white print and partner co-branding where navy clashes |
| `assets/icon/app-icon-us-mono.svg` | One color, tick cut out: embossing, fax, favicons on busy backgrounds |
| `assets/wordmark/wordmark-us-light.svg`, `-dark.svg` | Lockup: mark + "MyCA" in ink + "US" in navy (sky `#9DB8E8` on dark) |

**Clear space.** Keep empty space around the mark equal to one quarter of the tile width (24 units
on the 96-unit tile) on every side. Around the lockup, the same space measured from the tile.

**Minimum size.** Mark: 24 px on screen, 8 mm in print. Below 24 px use the 48 px PNG, never a
smaller rendering of the SVG with the page lines (they fill in). Lockup: 96 px wide on screen,
25 mm in print.

**Do not:** recolor the tick, put the navy tile on a navy background, add a shadow or gradient,
stretch, rotate, outline, place on a busy photo without the reversed tile, add a flag, eagle, seal,
Capitol, or anything else that suggests a government body, or set "US" in red.

## 4. Color

The US look from `design/tokens/countries.json`. Primary buttons are **ink**, never navy; navy is
for links, selected states, progress, positive money and the "US" in the wordmark.

| Role | Light | Dark theme | Notes |
|---|---|---|---|
| Accent (navy) | `#1E3A6E` | `#9DB8E8` | Links, selection, progress, "US" |
| Accent tint | `#E8EDF6` | `#18223A` | Price pills, selected rows |
| Ink | `#15181B` | `#F2F1EC` | Text and primary buttons |
| Muted | `#6C7075` | `#A6A9AD` | Secondary text |
| Canvas | `#FAFAF7` | `#0E1012` | Page background |
| Surface | `#FFFFFF` | `#1E2226` | Cards |
| Line | `#E6E4DE` | `#2A2E33` | 1 px borders |
| Ledger green (tick) | `#1B5E3F` | `#7FC3A0` | The tick and success ticks only |
| Warn | `#94570A` on `#FAF1E0` | `#E7B566` | Needs a look |
| Danger | `#B3261E` on `#FAEAE8` | `#F2A39C` | Errors |
| Bahi red | `#C8312B` | same | Mascot only, never UI state |
| Bahi gold | `#E2A93B` | same | Mascot and illustration only |
| Bahi paper | `#FFF8EC` | same | Mascot pages, warm backgrounds |

### Contrast pairs (WCAG 2.1, computed)

| Pair | Colors | Ratio | Passes |
|---|---|---|---|
| Navy text on white | `#1E3A6E` on `#FFFFFF` | 11.14:1 | AAA |
| Navy on canvas | `#1E3A6E` on `#FAFAF7` | 10.65:1 | AAA |
| Navy on navy tint | `#1E3A6E` on `#E8EDF6` | 9.48:1 | AAA |
| White on navy | `#FFFFFF` on `#1E3A6E` | 11.14:1 | AAA |
| Ink on white | `#15181B` on `#FFFFFF` | 17.82:1 | AAA |
| Ink on canvas | `#15181B` on `#FAFAF7` | 17.04:1 | AAA |
| White on ink (primary button) | `#FFFFFF` on `#15181B` | 17.82:1 | AAA |
| Muted on white | `#6C7075` on `#FFFFFF` | 4.99:1 | AA |
| Muted on canvas | `#6C7075` on `#FAFAF7` | 4.77:1 | AA |
| Ledger green on white | `#1B5E3F` on `#FFFFFF` | 7.72:1 | AAA |
| Warn on warn tint | `#94570A` on `#FAF1E0` | 5.16:1 | AA |
| Danger on danger tint | `#B3261E` on `#FAEAE8` | 5.60:1 | AA |
| Danger on white | `#B3261E` on `#FFFFFF` | 6.54:1 | AA |
| Bahi red on white | `#C8312B` on `#FFFFFF` | 5.34:1 | AA |
| Gold on navy | `#E2A93B` on `#1E3A6E` | 5.29:1 | AA |
| Paper on navy | `#FFF8EC` on `#1E3A6E` | 10.55:1 | AAA |
| Sky on navy | `#9DB8E8` on `#1E3A6E` | 5.54:1 | AA |
| Dark accent on dark canvas | `#9DB8E8` on `#0E1012` | 9.49:1 | AAA |
| Dark accent on dark surface | `#9DB8E8` on `#1E2226` | 7.97:1 | AAA |
| Dark accent on dark tint | `#9DB8E8` on `#18223A` | 7.87:1 | AAA |
| Dark ink on dark canvas | `#F2F1EC` on `#0E1012` | 16.86:1 | AAA |
| Dark muted on dark surface | `#A6A9AD` on `#1E2226` | 6.78:1 | AA |
| **Bahi red on navy** | `#C8312B` on `#1E3A6E` | 2.08:1 | **Fails.** Never put Bahi or red text on navy |
| **Faint on white** | `#9A9DA1` on `#FFFFFF` | 2.72:1 | **Fails.** Decoration and disabled only |
| **Gold on white** | `#E2A93B` on `#FFFFFF` | 2.11:1 | **Fails.** Never as text |

Ratios are computed with the WCAG 2.1 relative-luminance formula on sRGB values, rounded to two
places. `design/test` enforces the UI pairs on every build.

## 5. Type

Inter everywhere (`deploy/public/assets/fonts`, `design/flutter/myca_design/assets/fonts`), set with
tight tracking (about -2% of the size). No second typeface.

| Use | Size and weight |
|---|---|
| Social and store headlines | 48 to 84 px, SemiBold 600 |
| App display (one big number) | 34, Medium 500 |
| Screen titles | 26, Medium 500 |
| Section titles | 21, SemiBold 600 |
| Body | 15.5, Regular 400 |
| Fine print and disclaimers | 12.5 to 24 px depending on canvas, Regular 400, muted, never below 12 px on screen |

Sentence case for every headline, button and label. No all-caps headlines. Money in tabular figures
in the app.

## 6. Bahi in the US

Bahi is a red ledger with a gold thread. He is the same character in every country; his name is
simply his name, and US material does not explain where it comes from.

- **Where he appears:** welcome, empty states, the guided tour, the moment a return is accepted,
  social posts, store feature graphic, the 404 page.
- **Where he never appears:** any screen or ad that shows tax figures, prices next to his face as if
  he is selling, the signing and payment steps, IRS letters and notices, anything about an audit or
  a penalty, and press material for financial media.
- **What he never does:** give tax advice, promise a refund amount, wear a flag, a hat with stars, or
  anything that suggests a government body, hold money or a check.
- **Background:** canvas, white or paper. Never directly on navy (2.08:1).
- **Moods:** happy (default), wave (hello), thinking (working), celebrate (accepted by the IRS, and
  only then), worried (needs the person's attention, in the app only, never in ads).
- **Voice:** short, warm, first person, no exclamation marks except in celebrate. "Hi, I'm Bahi.
  I'll keep track of your forms."
- **Size:** at least 120 px tall on a 1080 canvas; the PNGs are 312 px, so do not scale them past
  about 420 px. Ask design for the Rive file (`bahi.riv`) for anything larger or animated.

## 7. Voice and tone

MyCA US talks like a calm, competent accountant who happens to be a friend. Plain words, short
sentences, exact facts, no hype.

| Principle | Do | Don't |
|---|---|---|
| Lead with what happened and what's next | "Your W-2 is in. Next: a few questions about your family." | "Awesome! You're crushing it!" |
| Plain words, statutory words only where the IRS uses them | "Money you earned from freelance work goes on Schedule C." | "Your 1099-NEC nonemployee comp flows to Sch. C line 1." |
| Say the price before it matters | "You'll pay $99 when you file. Preparing is free." | "Start free!" (with the fee revealed at the end) |
| Never blame the person | "We couldn't read box 12. Type it in and we'll check it." | "Invalid input." |
| Promise safety where money moves | "Nothing is filed until you sign." | "Filing now..." with no confirmation |
| Calm about the IRS | "The IRS sent your return back for one reason. Here's the fix." | "REJECTED. Act now to avoid penalties!" |
| Honest about limits | "MyCA doesn't do rental income yet. You'll know before you pay." | "We handle everything." |
| No fake urgency | "The launch price ends April 15, 2027." | "Only 3 spots left!" |

Tone moves with the moment: warm on welcome, quiet and exact on review and signing, plain and
helpful on errors, briefly glad on acceptance ("Accepted by the IRS. Nice work.").

## 8. US English style

| Thing | Style | Example |
|---|---|---|
| Spelling | American | color, organize, canceled, check (not cheque) |
| Dates in copy | Month name, day, year | January 26, 2027; Apr 15, 2027 where space is short |
| Dates in forms | MM/DD/YYYY | 04/15/2027 |
| Money | Dollar sign, comma thousands, cents only when not whole | $99, $1,250, $1,250.50 |
| Ranges | En dash or "to" | $0 to $139 |
| Tax year vs filing season | Say both when it matters | "your 2026 return, filed in 2027" |
| Form names | As the IRS writes them | Form 1040, Schedule C, W-2, 1099-NEC, Form 8879 |
| Agencies | IRS on all uses; Social Security Administration in full once | |
| Numbers | Numerals for 10 and up, money, form numbers; words for one to nine in prose | "three questions", "12 forms" |
| Times | 9:00 a.m. ET | |
| Oxford comma | Yes | W-2s, 1099s, and 1098s |

## 9. Legal lines

Use the footer that fits the space. Brackets are blanks only the owner can fill.

**Full footer (website, email, press release):**

> MyCA US is made by [US company name], [postal address]. MyCA prepares federal individual income
> tax returns (Form 1040); returns are e-filed through our IRS-authorized e-file partner. MyCA is not
> affiliated with or endorsed by the Internal Revenue Service or any government agency. State
> returns are not offered. Preparing your return and seeing your refund estimate are free; filing
> costs $129 ($99 launch price through April 15, 2027). MyCA Plus is $249 a year and renews until
> canceled. Expert Review is not yet available. Refund timing is set by the IRS. Information on this
> page is general and is not tax, legal or financial advice. All other trademarks belong to their
> owners.

**Short footer (social cards, ads, store graphics):**

> Federal returns only. Free to prepare; $99 to file through Apr 15, 2027, then $129. Not affiliated
> with the IRS.

**Email footer additions (CAN-SPAM):** the postal address above, and a one-click unsubscribe link.

**Comparisons:** every competitor price carries the date it was checked and its source link, and
competitor names are followed by "is a trademark of its owner" on the page.

**Privacy line:** "We use your tax information only to prepare and file your return (IRC section
7216). We never sell it or use it for ads."

## 10. Asset list and how to rebuild

Everything under `assets/` is generated by `assets/build.mjs` (SVG sources and PNG renders, with
Inter embedded for rendering and Bahi from the design package):

```bash
node docs/marketing/us/assets/build.mjs
```

| Asset | Size | Where it goes |
|---|---|---|
| `store/feature-graphic-1024x500.png` | 1024 by 500 | Google Play feature graphic |
| `social/social-1200x630.png` | 1200 by 630 | Open Graph image for the US pages, X and LinkedIn link cards |
| `social/social-1080x1080.png` | 1080 by 1080 | Instagram and LinkedIn feed |
| `social/social-1080x1920.png` | 1080 by 1920 | Stories, Reels and TikTok covers (keeps the top 250 px and bottom 340 px clear of text) |
| `icon/*` | see section 3 | Stores, Android launcher, website |
| `wordmark/*` | 520 by 140 (PNG at 2x) | Website header, press kit, partner pages |
