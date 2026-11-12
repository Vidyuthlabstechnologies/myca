# Device run: guided tour on sample books (#139)

| | |
|---|---|
| Date | 2026-11-12 |
| Device | Android Emulator, Pixel 3a profile, 1080 × 2220, 440 dpi |
| Android | 14 (API 34), Google APIs, arm64 |
| Build | India flavour, debug, Flutter 3.44.9, `MYCA_CLOUD_URL` set to production (the tour sends nothing to it) |
| Code | `develop` at db1bf24, then the same with the coach fix from this folder's PR |

## Steps and result

| Step | What was done | Result | Screenshot |
|---|---|---|---|
| Welcome | Fresh install, app data cleared | Pass: Bahi animates, nothing clipped | `01-welcome.png` |
| 1 of 11 | Take a 2-minute tour first | Pass: "This is Nalanda Textiles, a sample shop. Everything here is pretend… Your own books are not touched." | `02-step1-sample-shop.png` |
| 2, 3 of 11 | Show me around, Next | Pass: the card moves to the top so New entry stays visible | `03-step3-coach-at-top.png` |
| 4 of 11 | New entry, I sold something, Gujarat Weaves, type 8000 | **Fail, fixed**: with the keyboard open, the card covered the amount field, so the typed amount was hidden | `04-step4-keyboard-before-fix.png` |
| 4 of 11, fixed | Same, with the fix | Pass: the card steps aside while the keyboard is open and comes back when it closes | `05-step4-keyboard-after-fix.png`, `06-step4-keyboard-closed.png` |
| 5, 6 of 11 | 18%, Preview, Post it | Pass: "Posted INV-0003, ₹9,440.00" | `07-step6-posted.png` |
| 7 to 10 of 11 | Next through Taxes, Expenses, Books check, Ask MyCA | Pass for layout; **figures disagree** (below) | `08-step7-taxes.png`, `09-step9-books-check.png` |
| 11 of 11 | Next | Pass: "Ready to set up your own books?", Start my books | `10-step11-done.png` |

No crash, no overflow stripe, no text cut off on this screen size.

## Found, not fixed here

The sample books' figures are written by hand in `mobile/lib/tour/sample_books_api.dart` and do not
agree with each other or follow the tour's own sale:

- Home says customers owe ₹2,77,600; the books check and Ask MyCA say ₹3,77,600; none include the
  ₹9,440 the tour posts.
- Taxes flags "INV-0003 cannot be reported", and the tour's sale is also numbered INV-0003.
- After "GST is already counted for this month", October still shows ₹3,600 on 1 sale of ₹20,000.
- The books check flags INV-0009, which does not exist, while Bahi talks about a bank line.

The fix is to generate the tour's books from the platform engines rather than by hand; it needs its
own issue.

## Not covered by this run

- A physical phone, and a low-end one: this was an emulator.
- The release build (R8 shrinking): that is #142.
