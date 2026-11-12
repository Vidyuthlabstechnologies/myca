# Store assets

Everything the Play listing needs, made from the repository so it can be redrawn after a change.

| File | Size | Play field | Made by |
|---|---|---|---|
| `play-icon-512.png` (`play-icon.svg`) | 512 × 512, opaque | App icon | `node scripts/render-launcher-icons.cjs mobile/android/app/src/main/res docs/release/assets` |
| `feature-graphic-1024x500.png` | 1024 × 500, no transparency | Feature graphic | `node scripts/render-feature-graphic.cjs` |
| `play/phone-01-home.png` … `play/phone-08-books-check.png` | 1080 × 2160 (2:1), no transparency | Phone screenshots, in this order | See below |

The two scripts use the Chromium that Playwright installs and the Inter font in
`mobile/assets/fonts`. The feature graphic shows the brand mark and the short description from
`PLAY-LISTING.md` on the app's canvas colour (`Palette.canvas` in `mobile/lib/theme.dart`); change
both together.

## Phone screenshots

The screens come from `mobile/tool/screenshots_test.dart`, which renders the real app at 1080 × 2160
against the demo data in `mobile/test/fake_api.dart` (Nalanda Textiles LLP and its customer Gujarat
Weaves; no real business). Play allows at most 2:1, which is why the size is 1080 × 2160 and not a
taller phone.

```bash
cd mobile
flutter test tool/screenshots_test.dart --update-goldens
```

Then copy the eight chosen screens without transparency into `play/`:

| Play order | From `mobile/tool/screens/` | Shows |
|---|---|---|
| 1 | `05_home.png` | Home: what needs you today, tax on sales |
| 2 | `10_not_posted_yet.png` | A sale typed in plain words, waiting for your OK |
| 3 | `14_invoice.png` | A GST tax invoice |
| 4 | `12_taxes.png` | Taxes and filings: what is due and what it costs |
| 5 | `20_review_sales.png` | Reviewing the month's return step by step |
| 6 | `17_expense_preview.png` | An expense, checked before it is posted |
| 7 | `24_cash.png` | Cash now and the next 30 days |
| 8 | `23_books_check.png` | The books check |

```bash
python3 - <<'PY'
from PIL import Image
pick = ['05_home', '10_not_posted_yet', '14_invoice', '12_taxes', '20_review_sales', '17_expense_preview', '24_cash', '23_books_check']
names = ['home', 'sale-preview', 'invoice', 'taxes', 'gst-review', 'expense', 'cash', 'books-check']
for i, (src, name) in enumerate(zip(pick, names), 1):
    Image.open(f'mobile/tool/screens/{src}.png').convert('RGB').save(f'docs/release/assets/play/phone-{i:02d}-{name}.png', optimize=True)
PY
```
