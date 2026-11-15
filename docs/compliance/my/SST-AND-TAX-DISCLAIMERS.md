# MyCA Malaysia: SST and income tax, the tax-agent rule, and safe product wording

Status: draft for Malaysian counsel, 14 November 2026. Not legal advice.

## 1. The rule

Section 153 of the Income Tax Act 1967 (ITA) restricts who may act for another person under the
Act. In summary (counsel to confirm the exact words of s153(1) and (3)):

- Only a **tax agent** may, for reward, act on behalf of another person for any purpose under the
  ITA, or prepare on another's behalf any return, statement or document under the ITA.
- A tax agent is a professional accountant approved under s153(3) or a person approved by the
  Minister of Finance. Approval is applied for through LHDN (MyCukai portal) and bound by LHDN's
  Code of Ethics for Tax Agents.
- Acting as a tax agent without approval is an offence under **s120(1)(d)**: a fine of RM200 to
  RM20,000, up to 6 months' jail, or both. Separately, **s114(1A)** makes it an offence to assist
  or advise in preparing a return that understates tax (fine RM2,000 to RM20,000, up to 3 years'
  jail, or both).

Sources (accessed 2026-11-14):
- LHDN, Tax Agent, Non-compliance and offences: https://www.hasil.gov.my/en/tax-agent/non-compliance-and-offences/
- LHDN, Profession as a Tax Agent: https://www.hasil.gov.my/en/tax-agent/profession-as-a-tax-agent/
- LHDN media release via CTIM, "The Need to Obtain Legitimate Tax Agent Services" (2015): https://www.ctim.org.my/file/news/14/03465_The%20Need%20to%20Obtain%20Legitimate%20Tax%20Agent%20Services%20-%20LHDNM%20Media%20Release%20(261115).pdf

## 2. How this affects MyCA

| What MyCA does | Is MyCA acting "on behalf of" the taxpayer for reward? | Safe? |
|---|---|---|
| Software the taxpayer uses to compute **their own** income tax estimate (Form BE / B), which the taxpayer then types into MyTax and submits **themselves** | No: the taxpayer prepares and files; MyCA is a tool, like a spreadsheet or tax calculator. MyCA never logs in to MyTax, never signs, never deals with LHDN on income tax | Yes, with the wording rules below |
| A human at MyCA reviewing a user's return figures and advising on them for a fee | Yes, likely | **No**, unless done by an approved tax agent partner who contracts with the user |
| Submitting the return in MyTax using the user's credentials | Yes | **No**. MyTax has no third-party API and MyCA must never ask for MyTax passwords |
| Submitting **e-invoices** to MyInvois as an intermediary | E-invoicing is under the ITA (s82C), but LHDN itself creates the intermediary role for software and service providers and the taxpayer grants it in the portal | Yes; it is LHDN's own model. Counsel to confirm no s153 issue |
| Preparing **SST-02** figures for the business to file in MySST | SST is under the Sales Tax Act 2018 and Service Tax Act 2018, not the ITA; s153 does not apply. We found no equivalent licensing rule for preparing SST-02 working papers | Yes, the business files and pays in MySST itself. Counsel to confirm |
| AI assistant (Ask Bahi) explaining how reliefs or SST rates work, with sources | General information, not acting for the person | Yes, with the disclaimer; it must not tell a user what to declare in their return as personalised advice |
| "Expert review" add-on | Only if the reviewer is an approved tax agent (s153) who contracts with the user and is paid for that service | Owner item: sign a Malaysian tax agent partner before offering it |

Conclusion: the product is safe if MyCA is **software that the taxpayer uses**, the taxpayer files
income tax and SST themselves, and any human tax advice comes from an approved tax agent partner.

## 3. Wording rules for the app, the listing and marketing

| Do say | Don't say |
|---|---|
| "Estimate your income tax and get your Form BE or B figures ready. You file in MyTax." | "We file your income tax." / "We'll do your taxes." |
| "Prepare your SST-02 figures. You submit and pay in MySST." | "We file your SST." |
| "Submit e-invoices to LHDN MyInvois with your approval." | "LHDN-approved", "LHDN-certified", "official MyInvois app" |
| "Connects to LHDN MyInvois through LHDN's API." | Use of LHDN, MyInvois, Customs or Jata Negara logos |
| "Reviewed by [Firm], an approved tax agent" (only once a partner is signed, naming them) | "Tax agent", "tax consultant", "tax adviser" to describe MyCA itself |
| "Figures from the rules published by LHDN for YA 2025. Check before you file." | "Guaranteed correct", "no penalties", "maximum refund" |
| "Below RM3 million? You don't have to e-invoice yet." | "Every business must e-invoice." |

## 4. Disclaimers (English and Malay)

### Income tax estimate screen and PDF

> **This is an estimate to help you file.** MyCA works it out from what you entered and the rates
> and reliefs LHDN publishes for this year of assessment. You are responsible for your return:
> check the figures, then file and pay in MyTax yourself. MyCA does not file income tax returns
> and is not a tax agent. For advice on your situation, speak to an approved tax agent.

> **Ini anggaran untuk membantu anda membuat pengisytiharan.** MyCA mengiranya berdasarkan
> maklumat yang anda masukkan serta kadar dan pelepasan yang diterbitkan oleh LHDN bagi tahun
> taksiran ini. Anda bertanggungjawab atas borang nyata anda: semak angka-angka ini, kemudian
> failkan dan bayar sendiri di MyTax. MyCA tidak memfailkan borang nyata cukai pendapatan dan
> bukan ejen cukai. Untuk nasihat tentang keadaan anda, hubungi ejen cukai yang diluluskan.

### SST screen

> **Your SST-02 figures, ready to copy.** MyCA prepares them from your books. You submit the
> return and pay in MySST by the due date. Rates and thresholds follow the Customs orders in force
> on the invoice date.

> **Angka SST-02 anda, sedia untuk disalin.** MyCA menyediakannya daripada buku akaun anda. Anda
> menghantar penyata dan membayar sendiri di MySST sebelum tarikh akhir. Kadar dan ambang
> mengikut perintah Kastam yang berkuat kuasa pada tarikh invois.

### E-invoice approve screen

> **Nothing goes to LHDN until you approve.** When you tap Approve, MyCA submits this e-invoice
> to LHDN MyInvois as your intermediary, signed with MyCA's certificate. LHDN validates it; you
> can cancel within 72 hours of validation.

> **Tiada apa yang dihantar kepada LHDN sehingga anda meluluskannya.** Apabila anda menekan
> Luluskan, MyCA menghantar e-Invois ini ke LHDN MyInvois sebagai perantara anda, ditandatangani
> dengan sijil MyCA. LHDN akan mengesahkannya; anda boleh membatalkannya dalam tempoh 72 jam
> selepas pengesahan.

### Ask Bahi (assistant) footer

> Bahi gives general information with sources, not tax advice. Check with an approved tax agent
> for your situation.

> Bahi memberi maklumat umum beserta sumber, bukan nasihat cukai. Rujuk ejen cukai yang
> diluluskan untuk keadaan anda.

### Store listing and website footer

> MyCA is not affiliated with, endorsed by or part of LHDN (Inland Revenue Board of Malaysia),
> the Royal Malaysian Customs Department or the Government of Malaysia. MyCA is not a tax agent.
> Official sources: MyTax https://mytax.hasil.gov.my, MyInvois https://myinvois.hasil.gov.my,
> MySST https://mysst.customs.gov.my.

> MyCA tidak bergabung dengan, disokong oleh atau sebahagian daripada LHDN (Lembaga Hasil Dalam
> Negeri Malaysia), Jabatan Kastam Diraja Malaysia atau Kerajaan Malaysia. MyCA bukan ejen cukai.
> Sumber rasmi: MyTax https://mytax.hasil.gov.my, MyInvois https://myinvois.hasil.gov.my,
> MySST https://mysst.customs.gov.my.

## 5. SST facts the copy may use (with dates)

Pointers only; the app uses the dated rules in `platform/src/countries/malaysia/sst.mjs`, which
are unattested until counsel or a tax agent signs them off.

- Sales tax 5% or 10% by goods; service tax 8% generally, 6% for listed services (food and
  beverage, telecommunications, parking, logistics, and from 1 January 2026 rental or leasing).
- Service tax registration threshold RM500,000 in 12 months for most services (higher for some).
- SST-02 covers a two-month taxable period and is due with payment by the last day of the month
  after the period ends.

Source: PwC Malaysia, Service tax: https://www.pwc.com/my/en/publications/mtb/service-tax.html
(accessed 2026-11-14, secondary); the Royal Malaysian Customs Department's MySST portal
https://mysst.customs.gov.my is the primary place to confirm.

## 6. Owner items

1. Counsel's opinion that MyCA as described in section 2 is not acting as a tax agent, and that
   the intermediary role and SST-02 preparation need no licence.
2. Sign an approved Malaysian tax agent firm as partner before any "expert review" or human advice
   is sold.
3. Professional indemnity insurance covering Malaysian users (owner to check the policy wording).
