# MyCA US: App Store and Google Play listing copy

November 14, 2026. Marketing master for both stores. The Play fields match
[`docs/release/PLAY-LISTING-US.md`](../../release/PLAY-LISTING-US.md), which keeps the Data safety
table and the Play-specific rules; if the two ever differ, this file wins for wording and that file
wins for policy. Check the Play fields with:

```bash
node scripts/check-listing.mjs docs/marketing/us/STORE-LISTING.md
```

Rules for store text (from the brand kit and the store policies):

- No prices in the descriptions. The stores show the price; the app shows it before you start.
- No competitor names anywhere in store text or keywords (Apple rejects them in keywords).
- No "IRS-approved", "#1", "maximum refund", ratings, user counts or testimonials.
- Federal only; say so. Expert Review is not mentioned until it can be bought.
- Filing goes through our IRS-authorized e-file partner; MyCA is not itself called an e-file provider.

Character counts below were measured with `[...text].length` (Unicode code points), the way both
stores count.

## Google Play

### App name (30)

```listing-title
MyCA US: File Your Taxes
```

24 characters.

### Short description (80)

```listing-short
Your federal tax return, prepared on your phone. See your refund before you pay.
```

80 characters.

### Full description (4000)

```listing-full
MyCA US prepares your federal income tax return (Form 1040) on your phone, explains every number, and e-files it when you are ready.

See your refund first
Add your W-2, 1099 and 1098 forms, answer a few plain questions, and MyCA works out your return as you go. Preparing, checking and downloading your return is free. You pay once, only when you file.

Snap your forms
Take a photo of a W-2 or 1099, or upload the PDF. MyCA reads it box by box and shows you each amount to check before it is saved. You can also type a form in.

A return you can understand
Every line of your Form 1040 shows where it came from: which form, which answer, or which rule. Checks that need fixing link straight to the step that fixes them. Download a PDF of your return for your records.

E-file with confidence
When your return is ready, MyCA hands it to our IRS-authorized e-file partner with your details already filled in. You review it, sign, and file there, and MyCA shows you when the IRS accepts it. If the IRS sends it back, MyCA says what went wrong and how to fix it.

Our accuracy promise
If a mistake in MyCA's calculations means your federal return needs to be corrected, we fix it and you file the correction at no extra charge. This promise does not cover IRS penalties or interest.

Covers the common situations
Wages (W-2), interest and dividends, investment sales (1099-B), freelance and gig income with Schedule C and self-employment tax, retirement distributions, unemployment, Social Security, student loan interest, tuition credits, the Child Tax Credit and the Earned Income Tax Credit, the standard or itemized deduction. If your return needs something MyCA cannot handle yet, it tells you before you pay.

Year-round help with MyCA Plus
An optional yearly plan that works out quarterly estimated payments, checks your withholding, and helps you read and answer IRS letters.

Ask questions any time
A built-in assistant answers tax questions in plain English. It never sees your Social Security number.

Private by design
Your return is encrypted when stored and in transit, and kept on servers in the United States. Social Security numbers are sealed with a separate key and shown only as the last four digits. Federal law (IRC section 7216) means your tax information is used only to prepare and file your return. We never sell it or use it for ads.

Share with the people who help you
Invite your spouse or your tax professional to see the return.

State returns
MyCA files your federal return. State returns are not offered yet; MyCA gives you the federal numbers your state's own filing site asks for.

MyCA US is not affiliated with the IRS or any government agency.
```

## Apple App Store

| Field | Limit | Text | Count |
|---|---|---|---|
| Name | 30 | MyCA US: File Your Taxes | 24 |
| Subtitle | 30 | Federal return, line by line | 28 |
| Promotional text | 170 | Free to prepare your 2026 federal return and see your refund. Pay only when you file. Every line of your Form 1040 explained in plain English. | 142 |
| Keywords | 100 | `1040,w2,1099,refund,irs,efile,return,deduction,freelance,gig,self employed,schedule c,credit,w-2` | 96 |
| Description | 4000 | The Google Play full description above, unchanged | 2,679 |
| What's New (1.0) | 4000 | MyCA US is here for the 2027 filing season. Prepare your 2026 federal return, see your refund, and e-file when you're ready. | 124 |
| Category | | Finance (primary), Productivity (secondary) | |
| Age rating | | 4+ (no objectionable content); declare "Unrestricted web access: No" | |
| Support URL | | `https://[domain]/us/support` (owner) | |
| Marketing URL | | `https://[domain]/us` | |
| Privacy policy URL | | `https://[domain]/privacy#us` | |
| Copyright | | 2026 [US company name] | |

Apple counts the name and subtitle as keywords already, so "MyCA", "US", "file", "your", "taxes",
"federal", "return", "line" are not repeated in the keyword field ("return" is kept once because
Apple matches "tax return" across fields only loosely; drop it if space is needed).

## Screenshot captions (both stores)

Eight portrait screenshots from `mobile/tool/us_screenshots_test.dart`, navy canvas header with the
caption, the screen in a plain device frame below. Captions are 2 to 6 words, sentence case, no
figures that the screen does not show.

1. Your federal return, explained
2. Snap a W-2. We read it.
3. Every line has a reason
4. See your refund first
5. Checked before you sign
6. Free to prepare. Pay to file.
7. Know when the IRS accepts it
8. Private by design

The refund amount on screenshot 4 comes from the sample household in the screenshot tool and is
labelled "Sample return" in small type in the frame.

## Feature graphic and icon

- Play feature graphic: `assets/store/feature-graphic-1024x500.png`
- Play icon: `assets/icon/play-store-icon-512.png` (full bleed, no transparency)
- App Store icon: `assets/icon/app-store-icon-1024.png` (full bleed, no transparency)
