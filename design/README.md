# MyCA design system

The one design system every MyCA country app and site uses. The design language (what it looks
like, how it talks, what changes by country) is in
[`docs/design/DESIGN-LANGUAGE.md`](../docs/design/DESIGN-LANGUAGE.md).

```
design/
  tokens/               W3C design tokens (DTCG JSON): colour, type, space, radius, motion, themes, country looks
  country-facts.json    Snapshot of the country packs (platform/src/countries); rebuilt from them
  build.mjs             Style Dictionary build: tokens + packs -> CSS, JS and Dart
  generated/css/myca.css   CSS custom properties, light and dark, one block per country
  generated/js/tokens.mjs  TOKENS and COUNTRIES for JavaScript
  web/index.mjs         Formatting for the web and Electron: money, dates, numbers, direction
  preview/index.html    Every country side by side (open through a local server)
  flutter/myca_design   Flutter package: theme, country, formatting, Bahi, components, strings
  flutter/myca_fonts_arabic, flutter/myca_fonts_devanagari   Script fonts, only for apps that need them
```

Ready-made packages do the heavy lifting: [Style Dictionary](https://styledictionary.com) builds
the tokens, [`intl`](https://pub.dev/packages/intl) and `flutter_localizations` format money and
dates and generate the strings, [`rive`](https://pub.dev/packages/rive) plays Bahi, and the
browser's `Intl` formats on the web. Nothing country specific is typed in by hand: CLDR supplies
grouping, date order and week start.

## Change a token

```bash
cd design
npm ci
# edit tokens/*.json
npm run build      # rewrites generated/ and flutter/myca_design/lib/src/tokens.g.dart
npm test           # fails if generated files are stale or a colour drops below AA
```

`npm run build` reads `platform/src/countries` when it exists and refreshes `country-facts.json`
from it. Country facts are edited in the packs, never here. A new country needs a pack there and
a look in `tokens/countries.json`; the tests fail until both exist.

## Flutter

```yaml
# pubspec.yaml of a country app
dependencies:
  myca_design:
    path: ../design/flutter/myca_design
  myca_fonts_arabic:              # UAE app only
    path: ../design/flutter/myca_fonts_arabic
```

```dart
import 'package:myca_design/myca_design.dart';

final design = MycaDesign.forFlavor(appFlavor, fallbackCode: 'IN');

MaterialApp(
  theme: design.light,
  darkTheme: design.dark,
  localizationsDelegates: MycaDesign.localizationsDelegates,
  supportedLocales: design.supportedLocales,
  localeResolutionCallback: (locale, supported) => design.resolveLocale([?locale], supported),
  home: const HomeScreen(),
);
```

Inside the app:

| Need | Use |
|---|---|
| Colours | `context.myca.accent`, `.ink`, `.muted`, `.line`, `.warn`, `.danger`, ... |
| The country | `context.mycaCountry.facts.taxName`, `.taxId`, `.currency`, `.yearLabel(2026)` |
| Money | `MycaMoney(1250.5)`, `MycaMoney(paise, minor: true)`, or `MycaFormat(country, locale).money(x)` |
| Dates | `MycaFormat(country, locale).date(day, style: MycaDateStyle.medium)` |
| Strings | `MycaLocalizations.of(context).approvalPromise`, `.taxDueOn(taxName, date)` |
| Parts | `MycaPanel`, `MycaAmountRow`, `MycaSectionLabel`, `MycaStatusTag`, `MycaNotice`, `MycaChevron` |
| Brand | `BrandMark`, `Wordmark(showCountry: true)` |
| Bahi | `Bahi(mood: BahiMood.wave)`, `BahiNote(text: ..., action: ...)` for empty states |

The India palette in the package is exactly the one `mobile/lib/theme.dart` ships today (a test
holds it there), so the India app can switch over without a visual change. Fonts, mascot assets
and the Rive file come from the package (`packages/myca_design/...`); an app that adopts it can
drop its own copies of Inter and the mascot.

```bash
cd design/flutter/myca_design
flutter pub get && flutter analyze && flutter test
flutter gen-l10n     # after editing lib/l10n/*.arb
```

## Web and desktop

```html
<html lang="en-MY" data-country="my">
<link rel="stylesheet" href="/design/generated/css/myca.css">
```

```js
import { formatMoney, formatDate, applyCountry } from '../design/web/index.mjs';

applyCountry(document.documentElement, 'MY', { language: 'ms' });
formatMoney(1234.5, 'MY');                 // "RM 1,234.50"
formatMoney(123456750, 'IN', { minor: true }); // "₹12,34,567.50"
formatDate('2026-11-11', 'US');            // "Nov 11, 2026"
```

CSS variables: `--canvas`, `--surface`, `--sunken`, `--ink`, `--muted`, `--faint`, `--line`,
`--accent`, `--accent-soft`, `--highlight`, `--warn`, `--danger`, plus `--space-*`, `--radius-*`,
`--type-*`, `--motion-*`. Dark mode follows the system unless `data-theme="light"` or
`data-theme="dark"` is set.
