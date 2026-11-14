# MyCA India brand guidelines

| | |
|---|---|
| Version | 1.0, 14 November 2026 |
| Applies to | The MyCA India app, the website, the Play listing, social, email, print and anything a CA firm sees |
| Built on | The design language in [`docs/design/DESIGN-LANGUAGE.md`](../../docs/design/DESIGN-LANGUAGE.md) and the tokens in [`design/tokens`](../../design/tokens). Where this page and the tokens differ, the tokens win |
| Files | Logo pack in [`brand/logo`](../logo), rendered material in `brand/india/out`, copy in [`brand/india/copy`](copy) |

## 1. Who we are

**MyCA keeps a business's books, GST and payroll the way a careful accountant would, from the
owner's phone, and files nothing until the owner says yes.**

- **Promise (the one line):** Your books, kept right. You approve every entry and filing.
- **Positioning:** a premium accountant's tool, priced against Zoho Books and the monthly CA
  retainer, not against billing apps. We do not compete on being cheap; we compete on being right.
- **Who it is for:** owners of registered small and mid-size Indian businesses (traders,
  manufacturers, agencies, D2C sellers) who are tired of chasing their books at month end, and the
  CA firms who look after them.
- **What we are not:** a government app, a billing toy, a "do your taxes with AI" gimmick, or a
  replacement for the owner's judgement.

### Three pillars (every piece of marketing proves at least one)

| Pillar | What it means | Proof we can show |
|---|---|---|
| **Right** | Figures come from deterministic engines and dated GST rules, never from a guess | The GST review screen, the books check, the rule and date behind every figure |
| **In your control** | Nothing posts, files or pays until you see a preview and say yes | The sale preview card, EVC OTP at filing, optional CA approval |
| **Done for you** | Returns drafted, reminders set, bank matched, while you run the business | GSTR-1 and GSTR-3B drafts, the Monday brief, bank matching |

## 2. Logo

The mark is an **open ledger with a checked page** on ledger green: the bahi-khata every Indian
business knows, with the tick that says the books are right. It was chosen on 13 November 2026.

| File | Use |
|---|---|
| `myca-lockup.svg` | Default. Mark plus wordmark (My in ink, CA in green) on light backgrounds |
| `myca-lockup-on-dark.svg` | On ink or very dark photos. My in white, CA in `#7FC3A0` |
| `myca-lockup-on-green.svg` | On a ledger-green background. White tile, green ledger, white wordmark |
| `myca-lockup-ink.svg`, `myca-lockup-white.svg` | One-colour print, embossing, fax-grade documents |
| `myca-stacked.svg` | Square spaces: event badges, merchandise, profile cover centre |
| `myca-mark.svg` | App icon, avatar, favicon, small spaces. Never below 16 px |
| `myca-mark-reversed.svg`, `myca-mark-ink.svg`, `myca-mark-white.svg` | The mark alone on green, for one-colour use, on dark |

Transparent PNGs 512 and 1024 px tall are rendered to `brand/india/out/logo-pack/` (kept in the project's shared files under `myca/brand-kit/logo-pack/`). The wordmark is outlined Inter
SemiBold, so the SVGs render the same everywhere without the font.

**Clear space:** keep a margin of at least one quarter of the mark's height on every side (24 units
on the 96-unit tile). **Minimum size:** mark 16 px on screen, 6 mm in print; lockup 96 px wide on
screen, 25 mm in print.

**Do:** use the files as they are; put the default lockup on canvas `#FAFAF7` or white; use the
reversed or on-dark versions on colour.

**Don't:** recolour the mark (no red, gold or gradients); stretch, rotate or add shadows; outline the
tile; place the green mark on a green or busy photo; set "MyCA" in another font; write it "MYCA",
"My CA", "Myca" or "myCA". In running text it is always **MyCA**.

## 3. Colour

Ink on paper, with one green. Green is the accent, never the main button.

| Role | Name | Hex | Use |
|---|---|---|---|
| Accent | Ledger green | `#1B5E3F` | The mark, "CA" in the wordmark, links, positive money, highlights, one key word in a headline |
| Accent tint | Ledger mist | `#EAF2ED` | Panels, chips, callouts behind green text |
| Accent on dark | Ledger light | `#7FC3A0` | The accent on ink backgrounds |
| Text and buttons | Ink | `#15181B` | Body text, headlines, primary buttons |
| Background | Canvas | `#FAFAF7` | Default page and slide background |
| Surface | White | `#FFFFFF` | Cards |
| Sunken | Paper | `#F2F1EC` | Store graphics, quiet sections |
| Secondary text | Muted | `#6C7075` | Supporting lines, captions |
| Hairline | Line | `#E6E4DE` | 1 px borders, dividers |
| Mascot only | Bahi red | `#C8312B` | Bahi's cover. Never for text, buttons or warnings |
| Mascot and celebration | Bahi gold | `#E2A93B` | Bahi's thread, sparkles, a single celebration accent |
| Mascot only | Bahi paper | `#FFF8EC` | Bahi's pages, warm callouts |
| Status | Warn amber | `#94570A` on `#FAF1E0` | "Due soon" only |
| Status | Danger red | `#B3261E` on `#FAEAE8` | "Overdue", errors only |

Ratio for a typical piece: 70% canvas or white, 20% ink, 8% green, 2% Bahi colours. Every text
pairing above meets WCAG AA (the design tests check it).

## 4. Type

**Inter** for everything Latin: Regular 400, Medium 500, SemiBold 600. **Noto Sans Devanagari** for
Hindi. Both are free (SIL OFL) and ship in `design/flutter`.

| Use | Size on a 1080 px social post | Weight | Tracking |
|---|---|---|---|
| Headline | 72 to 96 | SemiBold 600 | -2% |
| Sub-headline | 40 to 48 | Medium 500 | -1% |
| Body | 30 to 34 | Regular 400 | 0 |
| Label (overline) | 22, upper case | SemiBold 600 | +8% |
| Money | Any | Medium 500, tabular figures | 0 |

Sentence case everywhere. Money is always written the Indian way, with the rupee sign and lakh
grouping: ₹2,77,600, never Rs. 277600 or INR 2.77 lakh in a headline.

## 5. Bahi, the mascot

Bahi is a red bahi-khata with a gold thread. He is warm, small and helpful, never silly.

| Mood | When to use him |
|---|---|
| Wave | Hello, welcome, launch announcements, the end of an email |
| Happy | Default, feature explanations |
| Thinking | "How it works", tips, questions |
| Celebrate | A filing done, a milestone, a festival greeting |
| Worried | A due date reminder. Never to scare, never for penalties |

Rules: one Bahi per piece; he sits beside the message, not on top of numbers; he never holds a
government logo, a rupee note or a CA's seal; he never speaks for a CA. The mood PNGs are in
`design/flutter/myca_design/assets/mascot/` and the Rive file is `bahi.riv`. Keep him at or under
360 px tall on a 1080 px canvas (the PNGs are 312 px masters).

## 6. Voice and tone

MyCA sounds like **a calm, competent accountant who happens to be a friend**.

| We are | We are not |
|---|---|
| Plain: "Money in", "What you owe", "Needs a look" | Jargon-first: "Accounts payable ageing analysis" |
| Specific: "GSTR-1 due 11 Dec. 3 invoices need a GSTIN" | Vague: "Stay on top of compliance!" |
| Calm: "Here is what to do next" | Alarming: "Avoid heavy penalties NOW" |
| Respectful of the owner's control | Pushy: "Let AI file it for you" |
| Confident and premium | Discount-led: "Cheapest GST app" |

Rules of thumb:

1. Lead with what happens and what to do: "GST due on 20 Nov. Review and pay."
2. Use the statutory word only where the owner meets it on the portal: GSTR-1, GSTR-3B, EVC, IRN.
3. Say "chat" or "type a sentence", not "AI", in headlines. Owners buy "it is done", not AI.
4. No exclamation marks, except Bahi celebrating.
5. Hindi and Hinglish are welcome in WhatsApp and Instagram, written by a native speaker. The
   Hindi in `copy/` is a first draft.

## 7. What we may and may not claim

These are hard rules. Legal and the owner sign off anything outside them.

| We may say | We may not say |
|---|---|
| "Files GSTR-1 and GSTR-3B on the GST portal once you confirm with the EVC OTP" (through a licensed GSP) | "Government approved", "GSTN partner", "official", or show the GSTN, CBIC or Ashoka emblem |
| "If a return MyCA filed is wrong because of our mistake, we correct and refile it at no charge" | "We pay your penalties", "zero penalty guarantee", "no notices ever" |
| "Your CA can approve a filing before it goes" | "CA-approved", "certified by CAs", "ICAI approved" |
| "14-day free trial of Pro" | "Free forever", "free plan" |
| "Nothing posts or files until you approve it" | "Fully automatic, no need to check" |
| Prices: Essentials ₹999, Pro ₹1,999, CA firm ₹5,999 a month, or about ten months' price for a year; MyCA Assured ₹4,999 "opening soon". Google Play shows the final price | Selling MyCA Assured as available before a CA team is signed |
| "Your books are sealed per business and sent only over HTTPS" | "Bank-grade", "military-grade", "unhackable" |
| ML Dynamic Solutions holds ISO 27001 and SOC 2 (only once the certificate scope covering MyCA is confirmed) | Any certification for MyCA itself that is not on a certificate |

Always add, where space allows: "MyCA is not affiliated with GSTN or the Government of India."

## 8. Imagery

- **Product first.** Real app screens from `docs/release/assets/play/` on the sample books
  (Nalanda Textiles LLP). Never a real customer's data, GSTIN or name.
- **People:** Indian owners at work (counter, workshop, warehouse, laptop at home), natural light,
  candid. No stock "business handshake", no suits pointing at charts.
- **Never:** piles of cash, coins raining, tax notices, scared faces, police or courts.

## 9. Layout

- Generous margins: 72 px on a 1080 px post, 96 px on a 1920 px slide.
- One idea per piece: headline, one line of support, one proof (a screen or Bahi), the lockup.
- Cards with 14 px radius and a 1 px line, flat. Pills for labels with full radius.
- The logo goes bottom-left or top-left, never centred over a screen.

## 10. Templates in this kit

| Template | Output | Sizes |
|---|---|---|
| `templates/store-screenshots.html` | Captioned Play screenshots, 8 | 1080 × 2160 |
| `templates/social.html` | Instagram and Facebook posts, LinkedIn cards, stories, WhatsApp status | 1080 × 1080, 1200 × 627, 1080 × 1920 |
| `templates/one-pager.html` | Owner one-pager | A4 PDF and PNG |
| `templates/ca-firm-pitch.html` | CA firm pitch deck | 16:9 PDF, 10 slides |
| `templates/brand-sheet.html` | This guide on one page | 1920 × 2330 |
| `templates/logo-pack.html` | Transparent PNGs of every logo file | 512 and 1024 tall |
| `templates/email-header.html` | Header images for launch emails | 1200 × 400 |

Render them all with `node brand/tools/render.mjs` (Playwright and Chromium, Python with Pillow).
Re-make the logo SVGs with `python3 brand/tools/make-logos.py` (needs `fonttools`).
