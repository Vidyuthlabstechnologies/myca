# MyCA Malaysia: Play screenshots and captions

Eight phone screenshots, 1080×2160 (9:18), rendered on a sample Malaysian business
("Kedai Runcit Siti Sdn. Bhd.", fictional) with the `my` flavor, like the India set
(`mobile/tool/play_listing_test.dart`). Two sets: English UI with English captions, Malay UI with
Malay captions. Captions sit above the device frame, Inter 600, ink `#15181B` on canvas
`#FAFAF7`, with a gold `#F2B705` rule under the first word. Keep each caption to two short lines.

Sample data must be clearly fictional: no real TINs, NRIC numbers or company names. Use LHDN's
documented test TINs or obviously fake numbers (for example `C00000000000`).

| # | Screen | English caption | Malay caption |
|---|---|---|---|
| 1 | Home: "You're up to date" with the next deadline | Your books, e-invoices and SST in one place | Buku akaun, e-Invois dan SST di satu tempat |
| 2 | "Do I have to e-invoice?" result | Find out in a minute if you must e-invoice | Ketahui dalam seminit jika anda perlu e-Invois |
| 3 | MyInvois setup checklist with progress | Connect to LHDN MyInvois step by step | Sambung ke LHDN MyInvois langkah demi langkah |
| 4 | New e-invoice, buyer TIN checked | Create an e-invoice in a few taps | Buat e-Invois dengan beberapa sentuhan |
| 5 | Approve screen: "Nothing goes to LHDN until you approve" | Nothing goes to LHDN until you approve | Tiada apa dihantar ke LHDN tanpa kelulusan anda |
| 6 | Validated: UUID, QR link, Bahi celebrate | See LHDN's validation straight away | Lihat pengesahan LHDN serta-merta |
| 7 | Consolidated e-invoice for the month, RM10,000 sale flagged | Monthly consolidated e-invoice, rules built in | E-Invois disatukan bulanan, peraturan sedia ada |
| 8 | SST-02 figures for the period | SST-02 figures ready for MySST | Angka SST-02 sedia untuk MySST |

Optional extra screenshots (tablet 7" and 10" are not required for a phone-first launch):

| # | Screen | English caption | Malay caption |
|---|---|---|---|
| 9 | Income tax estimate (Form BE) | Your income tax estimate, ready for MyTax | Anggaran cukai pendapatan, sedia untuk MyTax |
| 10 | Ask Bahi with a sourced answer | Ask Bahi, with the source | Tanya Bahi, berserta sumbernya |

Checks before upload:

- [ ] No status bar clutter (clock 9:41, full battery, no notifications).
- [ ] Amounts formatted `RM1,234.50`; dates "Fri, 7 Nov" style, never ISO.
- [ ] The word "sandbox" or "test" is not visible.
- [ ] Malay set reviewed by the native reviewer.
