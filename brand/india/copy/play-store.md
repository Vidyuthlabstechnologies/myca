# Play Store: captions and promotional text (India)

The listing text itself (title, short and full description) is the one in
[`docs/release/PLAY-LISTING.md`](../../../docs/release/PLAY-LISTING.md); it is checked against Play's
limits by `node scripts/check-listing.mjs` and is not repeated here so there is one source.

## Captioned screenshots

Play shows the first three screenshots in search, so they carry the three pillars. Each caption
is under 40 characters for the headline and under 60 for the support line. Rendered by
`templates/store-screenshots.html` into `out/store-screenshots/` from the raw screens in
`docs/release/assets/play/`. Upload either the captioned set (recommended for the store page) or
the raw set, not a mix.

| # | Screen | Headline | Support line |
|---|---|---|---|
| 1 | Home | Your books, kept right | See what needs you today, in one place |
| 2 | Sale preview | Type it. Check it. Say yes. | Nothing posts until you approve it |
| 3 | GST review | GST returns, ready for review | GSTR-1 and GSTR-3B drafted from your books |
| 4 | Invoice | GST invoices in seconds | E-invoice and e-way bill when you need them |
| 5 | Taxes | Every due date, handled | GST, TDS and payroll reminders, on time |
| 6 | Customer | Know who owes you | Invoices, quotes and reminders per customer |
| 7 | Reports | Reports your CA will like | P&L, balance sheet and trial balance |
| 8 | Books check | Checked every night | Your books balanced and backed up daily |

## Promotional content (Play "Promotional content" and LIVE ops cards)

| Card | Title (≤ 80) | Description (≤ 80) |
|---|---|---|
| Launch | MyCA is here: books, GST and payroll by chat | Try Pro free for 14 days. You approve every filing |
| GST month end | GSTR-1 due on the 11th. Yours is drafted | Open MyCA, review the draft, file with your EVC OTP |
| For CA firms | Every client's books, one approvals queue | MyCA CA firm plan: 25 people, approvals across clients |

## Search terms to watch (for the listing and Play ads later)

GST app, GST billing app, accounting app India, GSTR-1 filing app, GSTR-3B, Tally alternative,
bookkeeping app, payroll app India, e-invoice app, e-way bill app, CA app.

The title already carries "GST, Books and Payroll". Do not stuff keywords into the description:
Play penalises repetition.
