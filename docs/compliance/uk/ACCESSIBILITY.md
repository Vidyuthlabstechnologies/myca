# MyCA UK: accessibility

Draft 2026-11-14. Part 1 is the accessibility statement to publish on the website and link from the
app and the Play listing. Part 2 is the test plan that must be run before the statement is
published. HMRC asks web software to meet WCAG AA (gb.md); MyCA UK targets **WCAG 2.2 level AA**
for the Android app (applied to native apps as the W3C's WCAG2ICT guidance describes) and for every
web page.

The design system already enforces some of this: AA contrast for every text colour and the GB
accent in light and dark themes (tests in `design/test` and `design/flutter/myca_design/test`),
48-point touch targets, labels on every picture, and status never shown by colour alone
(`docs/design/DESIGN-LANGUAGE.md`).

---

## Part 1. Accessibility statement (draft)

### Accessibility statement for MyCA UK

This statement applies to the MyCA UK Android app and the website at [MyCA UK site URL]. It is
published by [UK entity to confirm].

We want as many people as possible to be able to use MyCA UK. You should be able to:

- use the app with TalkBack, Switch Access and Voice Access;
- make text up to 200% bigger, and use Android's display size setting, without losing content or
  functions;
- use the app in light or dark theme, and in portrait or landscape;
- use it with reduced motion, so nothing animates;
- sign in without having to remember or retype a code: you can paste codes, and use a password
  manager;
- understand every screen without relying on colour; statuses always carry a word.

**How accessible the app is.** [After the audit, list any known problems here in plain words, with
the WCAG criterion and the date we will fix it. If none: "We are not aware of any parts of the app
that do not meet WCAG 2.2 AA."]

**Feedback and contact.** If you find a problem, or need information in a different format (for
example large print or a plain text export), email [accessibility@ address]. We reply within 5
working days.

**Preparation of this statement.** Prepared on [date]. Last reviewed on [date]. The app was last
tested on [date] by [internal team / external auditor] against WCAG 2.2 AA, using the method in our
test plan.

---

## Part 2. Test plan

### Scope

Every screen of the UK app, in this order of priority: sign-in and two-step; onboarding and the
14-day trial; connect to HMRC and the fraud data screen; the home screen; transactions and bank
import; receipt capture; invoices; VAT return (9 boxes) review and submit; MTD Income Tax
obligations, quarterly update review and submit, calculations and final declaration; Self
Assessment estimator; deadlines and penalty points; AI assistant; settings, export and deletion;
plans and billing; the website pages (landing, pricing, privacy, terms, this statement).

### Devices and sizes

| Class | Example size (dp) | Device to use |
|---|---|---|
| Small phone | 360 x 640 | An older 5 inch Android or the emulator |
| Typical phone | 393 x 851 | A current mid-range phone |
| Large phone | 412 x 915 | A large-screen phone |
| Foldable, folded and open | 344 x 882 and 673 x 841 | Emulator or a real foldable |
| 7 inch tablet | 600 x 960 | Emulator |
| 10 inch tablet | 800 x 1280 | Emulator or a real tablet |

Each at font scale 100% and 200%, display size default and largest, light and dark theme, portrait
and landscape. Oldest and newest supported Android versions.

### Methods

1. **Automated**: Android Accessibility Scanner on every screen; Flutter `meetsGuideline` tests
   (`androidTapTargetGuideline`, `labeledTapTargetGuideline`, `textContrastGuideline`) in widget
   tests for every screen; the design token contrast tests. On the web, axe or Lighthouse.
2. **Manual with assistive technology**: TalkBack (navigation by swipe and by headings), Switch
   Access, Voice Access, an external keyboard, magnification.
3. **People**: at least three disabled users (for example a screen reader user, a person with low
   vision, a person with dyslexia), paid, in a moderated session on the priority journeys.

### WCAG 2.2 AA checks that matter most here

| Criterion | What to check in MyCA UK |
|---|---|
| 1.1.1 Non-text content | Bahi has a spoken label or is hidden from screen readers; the logo has a label; receipt thumbnails say what they are |
| 1.3.1 Info and relationships | The VAT 9-box review reads box number, label and amount together; tables announce row and column |
| 1.3.4 Orientation | Works in portrait and landscape |
| 1.4.3 and 1.4.11 Contrast | Text 4.5:1; GB accent `#5B2A6E` and dark `#CDA6DC` pass (token tests); focus rings, field borders and chart lines 3:1 |
| 1.4.4 and 1.4.10 Resize and reflow | 200% text, no clipped money amounts, no horizontal scroll on a 320 dp width |
| 1.4.13 Content on hover or focus | Tooltips dismissable |
| 2.1.1 Keyboard | Every action reachable with an external keyboard |
| 2.2.1 Timing adjustable | Sign-in codes give enough time and can be resent; no session times out mid-return without warning and a way to extend |
| 2.4.3 Focus order | Logical on the review and submit screens |
| 2.4.6 Headings and labels | Clear, sentence case headings (design language) |
| 2.4.11 Focus not obscured (new in 2.2) | The sticky approve button and the keyboard never cover the focused field |
| 2.5.7 Dragging movements (new in 2.2) | Any drag (reordering, swiping to categorise) has a tap alternative |
| 2.5.8 Target size minimum (new in 2.2) | 24 x 24 is the minimum; MyCA's own rule is 48 |
| 3.2.6 Consistent help (new in 2.2) | Help and the assistant are in the same place on every screen |
| 3.3.1 and 3.3.3 Errors | Errors say what is wrong and how to fix it, next to the field (for example "This UTR has 10 digits. Yours has 9.") |
| 3.3.4 Error prevention (legal, financial) | Every HMRC submission has a review step, a clear "Submit to HMRC" button and a confirmation; nothing is sent automatically |
| 3.3.7 Redundant entry (new in 2.2) | UTR, NINO, VRN and business details are never asked twice in one journey |
| 3.3.8 Accessible authentication (new in 2.2) | Codes can be pasted; autofill from SMS and password managers works; no puzzle |
| 4.1.2 Name, role, value | Custom widgets (amount fields, status tags, Bahi) expose role and state to TalkBack |

### Pass criteria and records

- No failure of a level A or AA criterion on a priority journey. Other failures listed in the
  statement with a fix date.
- Results recorded per screen, size and setting in `docs/release/device-runs/` (UK files), with
  screenshots at 200% text.
- Re-run before each major release and at least yearly; update the statement's dates.
