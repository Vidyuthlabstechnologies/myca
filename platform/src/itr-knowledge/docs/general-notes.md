---
id: general-notes
title: ITR forms, filing season, due dates and data sources
source: general-notes ("General Notes.pdf", Taxvela, 2 pages)
applies-to: ITR-1, ITR-2, ITR-3, ITR-4, ITR-5, ITR-6, ITR-7
---

# ITR forms, filing season, due dates and data sources

## Two families of forms

- **ITR-1 and ITR-2** can be filed from pre-filled, available data (AIS, Form 16, broker statements). They are aimed directly at individual (B2C) customers.
- **ITR-3, ITR-4 and ITR-5** (and ITR-6 and ITR-7) need separate calculations from MyCA's side: books of account, profit and loss, balance sheet, depreciation, presumptive income and GST turnover.

## Filing season

- The tax season starts every year in June; the main deadline is 31 July.
- ITR-1 and ITR-2 must be ready by June.
- ITR-3 and ITR-4 can come a little later, but should also be ready by the first week of June.
- ITR-5 can be a month later.
- ITR-6 and ITR-7 are audit-backed forms; the department releases their forms and schemas late.

## Due dates (as given in the source)

| Form | Due date | Note |
|---|---|---|
| ITR-1, ITR-2 | 31 July | |
| ITR-3, ITR-4 | 31 August | New deadline; it used to be 31 July. |
| ITR-3, ITR-5, ITR-6 (audit cases) | 31 October | Where a tax audit is required. ITR-6 is for companies. ITR-3 has cases with and without audit. |

Due dates move by notification; MyCA's dated rules (`due-date.income-tax.*`) are the figures the assistant quotes for a given year.

## Common data sources

1. **AIS** (Annual Information Statement), available only from the income tax portal.
2. **GST data** for business forms (ITR-3, 4, 5, 6), through a GST API.
3. **VDA (crypto)**: a KoinX-like tool that pulls exchange transactions and computes gains on FIFO.
4. **Bank statements**: uploaded by the customer, or fetched through an Account Aggregator with the customer's OTP.
5. **Accounting data** for business forms: Tally, Excel, Zoho Books or other software.
6. **Stock and F&O trading**: the exchange or broker statements (PDF) the customer uploads.
7. **Form 16** from each employer.

## Ways to file

**Renting an ERI's API.** A company can register with the department as an e-Return Intermediary (ERI) and file through its APIs, but the net-worth requirement is high (₹1 crore) and registration is long. Technology providers who already hold ERI access rent it out; the source names Sandbox (income tax and GST APIs).

**Credential method.** Some desktop filing software asks for the taxpayer's income tax portal credentials. A bot fills the ITR JSON, uploads it to the portal and files the return after the user submits, in a visible browser window or a headless browser.

## Bank statement APIs named in the source

Account Aggregator providers such as Signzy and Setu, as an alternative to uploaded statements.
