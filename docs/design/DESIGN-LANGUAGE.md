# MyCA design language

One design language for every MyCA app and site: India, the United States, Malaysia, and later the
United Kingdom, Canada, the UAE and Australia. Each country is its own store app, but a person who
has used one should feel at home in any other. The code lives in [`design/`](../../design/README.md).

## What changes by country, and what never does

| Never changes | Changes by country |
|---|---|
| The MyCA mark and wordmark, Inter, the type scale, spacing, radii, motion | Accent colour and its soft tint (one per country, see below) |
| Ink-on-paper surfaces: canvas `#FAFAF7`, surface white, ink `#15181B` | Highlight colour used in illustration and celebration moments |
| Warn amber and danger red, so a problem looks the same everywhere | Currency, number grouping, date order, week start, from the locale |
| Bahi the mascot, his moods and his voice | Languages offered, and right-to-left for Arabic |
| Primary buttons are ink, never the accent | Tax words: GST, Sales tax, SST, VAT, GST/HST; GSTIN, EIN, TIN, TRN, ABN |
| Money in tabular figures, never as a float | Tax year label and start (financial year from 1 April, tax year from 6 April, ...) |

Where the facts come from: the country packs in `platform/src/countries` (one file per country,
served at `GET /v1/countries`) own currency, symbol, locale, languages, tax year, tax ID label,
tax name and app flavor. The design system owns only the look per country code. Dates, grouping
(lakh and crore for `en-IN`), week start and text direction are derived from the locale through
CLDR (`intl` in Flutter, `Intl` in JavaScript), so they are never typed in by hand.

## Country looks

Every accent is checked by the test suites: at least 4.5:1 on canvas, surface and its own tint in
both light and dark themes, and white text on the accent at 4.5:1 too.

| Country | Accent | Dark-theme accent | Highlight | Idea |
|---|---|---|---|---|
| India (`IN`) | `#1B5E3F` ledger green | `#7FC3A0` | `#E2A93B` gold | The app's existing green, unchanged |
| United States (`US`) | `#1E3A6E` navy | `#9DB8E8` | `#C8312B` Bahi red | Federal navy, trustworthy at tax time |
| Malaysia (`MY`) | `#0E4D92` Jalur Gemilang blue | `#8DB6EC` | `#F2B705` yellow | Flag blue with the crescent's yellow |
| United Kingdom (`GB`) | `#5B2A6E` plum | `#CDA6DC` | `#E2A93B` | Distinct from US navy |
| Canada (`CA`) | `#8A2432` maple | `#EBA3AD` | `#E2A93B` | Deep maple, darker than danger red |
| UAE (`AE`) | `#006659` teal | `#7FD1C3` | `#C8312B` | Gulf teal, works in Arabic and English |
| Australia (`AU`) | `#0B5C7A` ocean | `#86C6DE` | `#E2A93B` | Ocean blue |

The accent is for links, selected states, positive money, progress and the country part of the
wordmark (`MyCA` + `Malaysia` in the accent). It is never used for a primary button, an error or
a warning.

## Voice

MyCA talks like a calm, competent accountant who happens to be a friend.

- Plain words over jargon: "Money in", "Money out", "Needs a look". Say the statutory word only
  where the person will meet it on the government side: GSTR-3B, Form 1040, SST-02.
- Lead with what happened and what to do next: "GST due on 20 Nov. Review and pay".
- Never blame the person. Errors say what we will do: "You're offline. We'll keep this and send it
  when you're back."
- Promise safety where money or filing is involved: "Nothing is filed or paid until you approve it."
- Sentence case for every label, button and heading. No exclamation marks except Bahi's
  celebrate mood.
- Numbers are always real numbers from the engines. Copy never invents a figure.

Shared strings live in `design/flutter/myca_design/lib/l10n/` (English, Hindi, Malay, Arabic,
Spanish, French, Simplified Chinese). The English file is the source. The other languages are
first drafts and need a native speaker's review before a store release in that language.

## Bahi

Bahi the ledger is the mascot in every country. He keeps his red cover (`#C8312B`), gold thread and
paper pages everywhere, so he is a brand constant, not a country colour.

- Moods: happy (default), thinking (working on something), celebrate (a filing went through, books
  balance), worried (something needs the person), wave (hello and goodbye).
- He appears on welcome, the guided tour, empty states (`BahiNote`) and celebrations. He does not
  sit on screens where the person is reading numbers or approving a filing.
- His voice is short and warm: "Hi Asha, I'm Bahi. I keep your books tidy."
- With reduced motion on, he is a still picture. He always has a spoken label for screen readers.
- The Rive file is `assets/mascot/bahi.riv` with view model `Bahi` (mood 0 to 4, talking). PNGs of
  each mood are the fallback.

## Type

Inter for Latin, with Noto Sans Arabic and Noto Sans Devanagari as fallbacks in the apps that show
those scripts (the `myca_fonts_arabic` and `myca_fonts_devanagari` packages, added only to the UAE
and India apps so other apps stay small).

| Step | Size | Weight | Use |
|---|---|---|---|
| display | 34 | 500 | One big number or greeting per screen |
| headline | 26 | 500 | Screen titles on hero screens |
| heading | 21 | 600 | Section titles |
| title | 17 | 600 | App bar, card titles |
| subtitle | 15.5 | 600 | List row titles |
| body | 15.5 | 400 | Reading text |
| small | 14 | 400 | Secondary text, muted |
| caption | 12.5 | 400 | Notes, status tags |
| overline | 11 | 600 | Section labels, upper case in Latin scripts only |

## Layout, shape and motion

- 4-point spacing scale. Screens use 16 or 20 side padding. Content is capped at 720 wide on
  tablets and desktop, the website at 1080.
- Radii: chip 8, control 10, card 14, sheet 18. Buttons and fields are 50 tall.
- Cards are flat: a 1-pixel line, no shadow inside the app. The website may use the soft
  `elevation.card` shadow.
- Motion is quick and quiet: 160 to 220 ms with the standard curve. Nothing moves when the person
  has reduced motion on.

## Right to left

Arabic turns the whole layout around. Build with `EdgeInsetsDirectional`, `AlignmentDirectional`
and `start`/`end`, never left and right. Chevrons flip (`MycaChevron`). Money and IDs stay left to
right inside a right-to-left line (`MycaMoney` sets this). Section labels are not upper-cased in
scripts without case.

## Accessibility

- AA contrast for every text colour, enforced by the tests in `design/test` and
  `design/flutter/myca_design/test`.
- Touch targets 48 or more.
- Every picture has a label or is excluded from screen readers.
- Status is never colour alone: a tag carries a word, a dot and a colour.

## Using it

- Flutter apps: depend on `design/flutter/myca_design` and build the app from `MycaDesign`.
- Website and desktop renderer: link `design/generated/css/myca.css`, set `data-country` and
  `lang` on `<html>`, and format with `design/web/index.mjs`.

See [`design/README.md`](../../design/README.md) for the code.
