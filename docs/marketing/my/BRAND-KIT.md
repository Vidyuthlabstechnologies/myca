# MyCA Malaysia brand kit

Version 1.0, 14 November 2026. The Malaysia variant of the MyCA design language
(`docs/design/DESIGN-LANGUAGE.md`, tokens in `design/tokens/`). Everything that never changes by
country stays as it is; this kit sets what Malaysia changes and how to use it in marketing.

Visual sheet: `assets/brand-sheet.html`, rendered to `assets/png/brand-sheet.png`.

## 1. Colours

| Role | Name | Hex | Use |
|---|---|---|---|
| Accent | Jalur Gemilang blue | `#0E4D92` | Links, selected states, the "Malaysia" part of the wordmark, app icon background, hero panels |
| Accent soft | Blue tint | `#E6EEF8` | Chips, selected rows, soft panels |
| Accent (dark theme) | Sky | `#8DB6EC` | Accent on dark surfaces |
| Accent soft (dark theme) | Night blue | `#14233A` | Soft panels in dark theme |
| Highlight | Crescent gold | `#F2B705` | Illustration, celebration, one accent bar or underline per layout. **Never for text on light backgrounds** |
| Ink | Ink | `#15181B` | Text, primary buttons |
| Canvas | Paper | `#FAFAF7` | Page background |
| Surface | White | `#FFFFFF` | Cards |
| Muted text | Slate | `#6C7075` | Secondary text |
| Warn | Amber | `#94570A` | Warnings only |
| Danger | Red | `#B3261E` | Errors only |
| Bahi | Ledger red / gold / paper | `#C8312B` / `#E2A93B` / `#FFF8EC` | The mascot only, never UI state |

### Contrast (WCAG 2.x, computed 2026-11-14)

| Foreground on background | Ratio | Passes |
|---|---|---|
| Blue `#0E4D92` on white `#FFFFFF` | 8.42:1 | AAA text |
| Blue `#0E4D92` on canvas `#FAFAF7` | 8.05:1 | AAA text |
| Blue `#0E4D92` on blue tint `#E6EEF8` | 7.19:1 | AAA text |
| White on blue `#0E4D92` | 8.42:1 | AAA text |
| Paper `#FFF8EC` on blue `#0E4D92` | 7.97:1 | AAA text |
| Gold `#F2B705` on blue `#0E4D92` | 4.63:1 | AA text (use 18px+ or bold for comfort) |
| Ink `#15181B` on gold `#F2B705` | 9.80:1 | AAA text |
| Gold `#F2B705` on white | 1.82:1 | **Fails**: decoration only |
| Gold `#F2B705` on canvas | 1.74:1 | **Fails**: decoration only |
| Ink `#15181B` on canvas | 17.04:1 | AAA |
| Slate `#6C7075` on canvas | 4.77:1 | AA text |
| Sky `#8DB6EC` on ink `#15181B` | 8.52:1 | AAA (dark theme) |
| Sky `#8DB6EC` on night blue `#14233A` | 7.54:1 | AAA (dark theme) |

The same checks run in the design test suites for the app; marketing must keep to these pairs.

## 2. Typography

- **Inter** for everything (Latin covers Malay fully). Weights 400, 500, 600 only.
- Display 34/38 weight 500, tracking -0.9px; headline 26 weight 500; heading 21 weight 600;
  body 15.5 weight 400 at 1.45 line height; caption 12.5. Marketing may scale display up to
  64 to 96px for posters, keeping weight 500 and negative tracking.
- Numbers in tabular figures (`font-variant-numeric: tabular-nums`) wherever amounts line up.
- Money: `RM1,234.50` (no space after RM). Dates: "Fri, 7 Nov 2026" / "Jum, 7 Nov 2026".
- Sentence case for headings and buttons, in both languages. No exclamation marks except Bahi's
  celebrate moments.

## 3. Logo

- **Mark**: the open ledger with a tick, white on a rounded square. For Malaysia the square is
  blue `#0E4D92` and the tick inside the right page is blue. Source: the shared mark at
  `/mnt/project-files/myca/logo/myca-logo.svg` (India green); Malaysia recolours only the fill.
- **Wordmark**: "MyCA" in ink, weight 600, followed by "Malaysia" in blue, weight 500.
- Clear space: the height of the tick on every side. Minimum size: 24px mark, 96px wordmark width.
- On blue backgrounds use the white mark (no square) and a white wordmark with "Malaysia" in gold.
- Don't: recolour the mark in gold, put it on photos without a solid panel, stretch it, add
  shadows or outlines, rebuild the wordmark in another font, add the Jalur Gemilang flag or
  Jata Negara to it, or place it next to LHDN or MyInvois logos as if endorsed.

## 4. Bahi the mascot

- Bahi is the red ledger with gold thread and a cream page, the same in every country. He does
  not change colour for Malaysia; the blue and gold sit around him.
- Moods: happy (default), thinking, celebrate, worried, wave. Marketing uses happy, wave and
  celebrate; worried only to illustrate a problem MyCA solves, never to scare.
- Placement: welcome, empty states, finished e-invoice, social posts and the landing hero. Never
  on screens or graphics showing numbers to approve or legal text.
- Size: at least 20% of the shortest side in social posts; never cropped through the face.
- Voice (English): short and warm. "Hi, I'm Bahi. I'll keep your e-invoices tidy."
- Voice (Malay): "Hai, saya Bahi. Saya jaga e-Invois anda supaya kemas."
- Don't: dress Bahi in national costume or religious symbols, make him hold money or
  government documents, give him speech claiming legal certainty, or use him in a sad or angry
  state in ads.

Source assets: `/mnt/project-files/myca/mascot/` (Bahi.gif, bahi.riv, moods video).

## 5. Tone of voice

MyCA sounds like a calm, competent accountant who happens to be a friend. In Malaysia many
owners mix English and Malay; write each language cleanly, and let the reader switch.

| | English | Bahasa Melayu |
|---|---|---|
| Lead with the answer | "You don't have to e-invoice yet." | "Anda belum perlu mengeluarkan e-Invois." |
| Say what happens next | "Approve and send to LHDN" | "Luluskan dan hantar ke LHDN" |
| Safety | "Nothing goes to LHDN until you approve." | "Tiada apa dihantar ke LHDN sehingga anda luluskan." |
| No blame | "LHDN couldn't check this TIN. Let's fix it together." | "LHDN tidak dapat menyemak TIN ini. Mari kita betulkan bersama." |
| Dates | "Due Fri, 7 Nov (in 3 days)" | "Tarikh akhir Jum, 7 Nov (3 hari lagi)" |
| Plain words, form name second | "Your SST for Sep to Oct (SST-02)" | "SST anda untuk Sep hingga Okt (SST-02)" |

Malay style notes: use "anda" (not "awak" or "kamu"); "e-Invois" with capital I as LHDN writes it;
keep official names untranslated (MyInvois, MyTax, MySST, LHDN, SST-02, Borang BE/B); prefer
standard Malay (DBP) spellings; avoid Indonesian forms ("faktur", "pajak").

## 6. Do and don't

| Do | Don't |
|---|---|
| Say "connects to LHDN MyInvois" | Say "LHDN-approved", "certified", "official" |
| Say "below RM3 million you're exempt from 1 September 2026" | Tell exempt businesses they "must" e-invoice or face fines |
| Show real app screens with fictional sample data | Show real TINs, NRIC numbers or customer names |
| Use blue for structure and gold for one highlight | Fill large areas with gold or set body text in gold on white |
| Ink primary buttons | Blue or gold primary buttons |
| Bahi happy, waving or celebrating | Bahi worried in an ad headline |
| Both languages side by side or as separate posts | Machine-translated Malay without review |
| Cite the source and date for any rule | Invent statistics or penalties |
| Respect Malaysian cultural and religious sensitivities (Ramadan timing, no alcohol or gambling imagery, modest imagery) | Use the flag, Jata Negara or royal imagery |

## 7. Visual files

All in `docs/marketing/my/assets/`. Each HTML file is self-contained (Bahi and the mark are
inlined), uses Inter from the system with a system-ui fallback, and is the editable master.

| File | What | PNG (in `assets/png/`, rendered at device scale 2) |
|---|---|---|
| `brand-sheet.html` | This kit on one page | `brand-sheet.png` (1640 px wide) |
| `feature-graphic.html` | Play feature graphic | `feature-graphic.png` (1024×500, Play's size) |
| `social-posts.html` | The 10 posts of `SOCIAL-POSTS.md` in English and Malay; open without a query to see all 20, or `?post=3&lang=ms` for one | `social-01-en.png` to `social-10-ms.png` (1080×1080) |
| `sales-sheet.html` | The one-page sales sheet, A4, `?lang=en` or `?lang=ms` | `sales-sheet-en.png`, `sales-sheet-ms.png` (1190×1684) |
| `myca-malaysia-mark.svg` | The mark in Malaysia blue | |
| `bahi-wave.png`, `bahi-happy.png`, `bahi-thinking.png`, `bahi-celebrate.png` | Bahi moods with transparent background, cut from `bahi-moods.mp4` | |

Re-render: `NODE_PATH="$(npm root -g)" node docs/marketing/my/assets/render.mjs` (Playwright with
Chromium). PNGs over about 480 KB were reduced to a 256-colour palette with Pillow afterwards
(only `brand-sheet.png` needed it); every PNG is under 500 KB.

Sample data in the visuals is fictional ("Syarikat Contoh Sdn. Bhd.", TIN `C0000000000`).
