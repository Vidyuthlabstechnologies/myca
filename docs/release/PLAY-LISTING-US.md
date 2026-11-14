# MyCA US: store listing (Google Play and App Store)

Drafted 2026-11-14 for the separate US app (`com.mldynamic.myca.us`, "MyCA US"), from what the app
does for the 2027 season (tax year 2026). The owner reviews the wording before anything is submitted;
nothing here is published by the repository. `node scripts/check-listing.mjs docs/release/PLAY-LISTING-US.md`
checks the three fields against Play's limits.

What the text may and may not promise:

- E-filing goes through MyCA's IRS-authorized e-file partner (Column Tax or April) for 2027. Do not
  say MyCA itself is an IRS e-file provider until MyCA's own EFIN is in place.
- Federal return only. State returns are not filed; MyCA gives the numbers for the state's own site.
- Forms MyCA cannot handle (for example rental income on Schedule E) are named in the app before any
  payment; the listing must not claim "every situation".
- No prices in the description; the store and the app show them. Preparing, checking and downloading
  the return is free; the filing fee is paid once, when filing.
- No comparison with other tax products by name.

### App name

```listing-title
MyCA US: File Your Taxes
```

### Short description

```listing-short
Your federal tax return, prepared on your phone. See your refund before you pay.
```

### Full description

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

## Data safety and privacy labels

Same categories for Play *Data safety* and App Store *App Privacy*. Under Play's definitions, data sent to
a service provider that processes it for MyCA (Google Cloud, Anthropic, Stripe) or sent because the user
asked for it (handing the return to the e-file partner when they tap File) is not "shared"; it is still
listed in the privacy notice. Checked against `docs/compliance/us/COMPLIANCE-REVIEW.md`.

| Data | Collected | Why | Shared (Play's meaning) | Optional |
|---|---|---|---|---|
| Name, email, phone | Yes | Account, the return | No | No |
| Government ID (SSN/ITIN) | Yes | The return | No (to the e-file partner only when the user files, and only with the separate IRC 7216 consent) | No |
| Financial info (income forms, bank account for refund or payment, purchase history) | Yes | The return, refund, payment | No | No |
| Photos and files (tax forms, IRS letters) | Yes, when the user adds them | Reading the form | No (read by the AI model as a service provider, SSNs removed, not kept by it) | Yes |
| Device or other IDs (install id, device type) | Yes | Security, the e-file signature record | No | No |
| App activity (screens reached, for the sign-up funnel) | Yes | Analytics | No | No |
| Crash logs | Yes, only if the user turns them on | Fixing errors | No | Yes |

Encrypted in transit: yes. Users can ask for deletion: yes, in the app and at the web deletion link
(`/delete-account`, which must name "MyCA US"). Data kept after deletion: a return MyCA itself e-filed and
its Form 8879 are kept three years, as the IRS requires (none in 2027, when the partner files).

Target audience: 18 and over. Not designed for children.

## Financial features declaration (Play)

There is no tax-filing category. Choose *Support services > Other* and describe it: "The app prepares
personal income tax returns and hands them to an IRS-authorized e-file provider to file." It does not lend
money, hold deposits or move money; refunds are paid by the IRS directly to the filer.

## Payments (Play)

Since 29 October 2025 Play Billing is not required for US users; card checkout for the return fee is
allowed. If the card checkout stays inside the app, enrol in Play's alternative billing program (reporting
and fees from 1 October 2026). MyCA Plus stays a Play subscription, and its screen states the renewal terms.
