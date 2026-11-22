# India app languages

The India app has tables for English, Hindi, Marathi, Gujarati, Tamil, Telugu, Kannada and Bengali. **It launches with
English and Hindi only** (owner decision, 22 Nov 2026). The six regional languages stay in the code but are not offered
in the language switch, and a phone set to one of them opens the app in English, until a native speaker has reviewed
that language. The app follows the phone's language when it is offered, and the owner can pick another one from the
translate button on the home screen (or "Same as my phone").

## Native review status

**No Indian language has been reviewed by a native speaker yet.** All lines were written by MyCA's team with AI help,
aiming for the words a shopkeeper uses (for example "बिल", "उधार", "GST", "रिटर्न"), not textbook translation. Before
launch each language needs one native speaker who runs a business to read every line in the app.

| Language | Code | Lines | Native review | In the app |
| --- | --- | --- | --- | --- |
| Hindi | hi | all India lines (about 1,990) | needed | yes, launched before review (`launch: true`) |
| Marathi | mr | all of Hindi's lines | needed | hidden |
| Gujarati | gu | all of Hindi's lines | needed | hidden |
| Tamil | ta | all of Hindi's lines | needed | hidden |
| Telugu | te | all of Hindi's lines | needed | hidden |
| Kannada | kn | all of Hindi's lines | needed | hidden |
| Bengali | bn | all of Hindi's lines | needed | hidden |

Lines the translators flagged as uncertain (greetings like "Good afternoon", short month names, reminder tone words that are
slotted into a sentence, balance-sheet terms such as Equity and Liabilities, and the tour line that says the assistant
understands the language) are the first place for a reviewer to look. Buttons named inside tour lines must match the
button's own translation.

When a reviewer signs off a language, set `reviewed: true` for it in `mobile/lib/india/india_strings.dart` and update
this table. That one flag switches the language on: a language is offered when its table is filled and it is either
`reviewed` or has `launch: true` (only Hindi has that). Then add its code to the expected list in the test
"India launches with English and Hindi, ..." in `mobile/test/india_languages_test.dart`. Hidden languages are still
checked for script, `{part}` and coverage by the same test file.

## How it works

- Every India line is written in English on the screen and goes through one of three helpers in
  `mobile/lib/india/india_strings.dart`:
  - `inText(context, 'Sales')` for a fixed line;
  - `inFormat(context, 'Paid {amount} to {name}', {'amount': ..., 'name': ...})` for a line with names or amounts, so
    a language can put the parts in its own order;
  - `inCount(context, n, '1 bill', '{n} bills')` for one or many.
- Shared screens use `UaeStrings` (`mobile/lib/uae/uae_strings.dart`); its `_()` and `_t()` fall back to the India
  tables by the same English line, so those screens need no change.
- Tables live in `mobile/lib/india/lang/`: Hindi is split by area (`hi_core.dart`, `hi_taxes.dart`, ...) and joined in
  `hi.dart`; every other language is one file keyed by exactly the same English lines.
- `mobile/test/india_languages_test.dart` fails if a line on screen has no Hindi, if a Hindi line is unused, if a
  language is in the wrong script, drops a `{part}`, has a line Hindi lacks, or falls more than a tenth behind Hindi.
  A new line needs Hindi straight away; until the other languages get it they show the English line.
- `flutter test tool/india_export_test.dart` writes `build/india_keys.json` with each language's missing lines, for
  the translators.

## Adding a language

1. Copy the Hindi key list into a new file in `mobile/lib/india/lang/` and translate each line.
2. Add one `IndiaLanguage(...)` entry to `indiaLanguages` with its script range.
3. Run `flutter test test/india_languages_test.dart`.

A language with an empty table, or one not yet marked `reviewed`, is not offered in the picker, so a half-started or unreviewed language never reaches owners.

## What stays in English

Tax names and form numbers (GST, GSTR-1, ITR, TDS, PAN, GSTIN, HSN), amounts and dates in Western digits, and anything
typed by the owner (customer names, item names). Government portals are English or Hindi only, so filing screens keep
the official English names next to the translated line.

## Assistant replies

The assistant reads the owner's language from the app and from the script of the message, works in English, and
translates its reply back, refusing the translation if any figure changed. Without the model key the assistant
replies in English.
