---
id: form16-structure
title: Reading Form 16 and mapping it to the ITR
source: sample-form16-b (layout of Part A and Part B, figures used only as a worked example); itr-1-guide field mapping; itr-1-schema and itr-2-schema field names
applies-to: salary in ITR-1, ITR-2, ITR-3, ITR-4
---

# Reading Form 16 and mapping it to the ITR

Form 16 is the certificate under section 203 for tax deducted on salary under section 192 (or pension and interest of a specified senior citizen under section 194P). It is downloaded by the employer from TRACES and digitally signed.

## Part A (from TRACES)

- Certificate number and "last updated on" date.
- Name and address of the employer and the employee; PAN and TAN of the deductor; PAN of the employee; employee reference number.
- CIT (TDS) address, assessment year, and the period with the employer (from and to).
- **Quarterly summary:** receipt numbers of the quarterly TDS statements (Form 24Q), amount paid or credited, tax deducted, and tax deposited, for Q1 to Q4 and the total.
- **Tax deposited through book adjustment** (government deductors): Form 24G receipt and DDO numbers, transfer voucher date, matching status.
- **Tax deposited through challan:** each month's amount, BSR code, deposit date, challan serial number and OLTAS matching status (F, U, P or O; see form16-vs-ais).

If the employee worked for more than one employer, each issues Part A for its own period; Part B may come from each employer or the last one.

## Part B (Annexure I, from the employer)

| Form 16 Part B line | Meaning | ITR-1 field | ITR-2 field |
|---|---|---|---|
| A. Opting out of 115BAC(1A)? | Regime the employer used for TDS | FilingStatus.OptOutNewTaxRegime (the return's choice can differ) | PartA_GEN1.FilingStatus.OptOutNewTaxRegime |
| 1(a) Salary u/s 17(1) | Basic, allowances, bonus | ITR1_IncomeDeductions.Salary | ScheduleS.Salaries[].Salarys.Salary |
| 1(b) Perquisites u/s 17(2) (Form 12BA) | | ITR1_IncomeDeductions.PerquisitesValue | ...Salarys.ValueOfPerquisites |
| 1(c) Profits in lieu of salary u/s 17(3) | | ITR1_IncomeDeductions.ProfitsInSalary | ...Salarys.ProfitsinLieuOfSalary |
| 1(d) Total | | ITR1_IncomeDeductions.GrossSalary | ...Salarys.GrossSalary |
| 1(e) Salary from other employers | Reported under Form 12B | add the other Form 16 | another ScheduleS.Salaries[] entry |
| 2(a) to 2(h) Exemptions u/s 10 | LTA 10(5), gratuity 10(10), commuted pension 10(10A), leave encashment 10(10AA), HRA 10(13A), special allowances 10(14), others | AllwncExemptUs10.AllwncExemptUs10Dtls[] (one row per section) | ScheduleS.AllwncExtentExemptUs10 |
| 3 Salary from this employer [1(d) − 2(i)] | | NetSalary | NetSalary |
| 4(a) Standard deduction 16(ia) | | DeductionUs16ia | DeductionUnderSection16ia |
| 4(b) Entertainment allowance 16(ii) | Government employees, old regime | EntertainmentAlw16ii | EntertntalwncUs16ii |
| 4(c) Professional tax 16(iii) | Old regime | ProfessionalTaxUs16iii | ProfessionalTaxUs16iii |
| 6 Income under "Salaries" | | IncomeFromSal | TotIncUnderHeadSalaries |
| 7 Other income reported to the employer (192(2B)) | House property, other sources | ITR1_IncomeDeductions.TotalIncomeOfHP, IncomeOthSrc | Schedule HP, Schedule OS |
| 10 Chapter VI-A deductions (gross and deductible) | 80C, 80CCC, 80CCD(1), 80CCD(1B), 80CCD(2), 80D, 80E, 80G, 80TTA and others | UsrDeductUndChapVIA / DeductUndChapVIA | ScheduleVIA |
| Tax on total income, rebate 87A, surcharge, cess, relief 89 | Employer's TDS computation | ITR1_TaxComputation | PartB_TTI |
| Total TDS (Part A total) | | TDSonSalaries.TDSonSalary[].TotalTDSSal | ScheduleTDS1.TDSonSalary[].TotalTDSSal |

Field names are from the AY 2025-26 schemas; look them up exactly with `itr_knowledge` (for example field "GrossSalary" on ITR-1).

## Checks before using Form 16 figures

- Part A total TDS equals the sum of the challans and matches Form 26AS and AIS (status F).
- Part B gross salary matches AIS salary for the same TAN; a difference starts the conflict process in form16-vs-ais.
- The employer's regime (line A) is only how TDS was worked out; the taxpayer chooses the regime in the return.
- Exemptions and Chapter VI-A deductions claimed by the employer must be allowed in the regime the return uses. In the new regime most are blocked (ITR-1 rules A-1 to A-17 and the regime rules).
- With two employers, add both Part Bs; check that the standard deduction is claimed once.

## Worked example (sample-form16-b, identity removed)

AY 2025-26, one employer for the full year, new regime (not opting out). Salary u/s 17(1) ₹22,05,694, no perquisites, no exemptions. Standard deduction ₹75,000, so income under "Salaries" is ₹21,30,694, which is also gross total income (no other income reported). No Chapter VI-A deductions. TDS deducted and deposited ₹3,42,376 across 12 monthly challans, all status F. Quarterly amounts paid: ₹5,00,913, ₹5,00,913, ₹6,44,434, ₹5,59,434.
