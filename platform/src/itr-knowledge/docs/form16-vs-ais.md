---
id: form16-vs-ais
title: Reconciling Form 16 with AIS and Form 26AS
source: form16-vs-ais ("Scenarios of Form 16 vs AIS.pdf", Taxvela, 3 pages); itr-1-guide section 3 and 5.3
applies-to: ITR-1, ITR-2 (salaried taxpayers); the same checks apply to salary in ITR-3 and ITR-4
---

# Reconciling Form 16 with AIS and Form 26AS

Form 16 is prepared from the employer's payroll. AIS and Form 26AS are built from the TDS returns the employer files. When the two disagree, neither is automatically right.

## Scenario 1: salary or TDS differs between Form 16 and AIS

**What happens.** The employer files the TDS return late or with wrong figures (wrong challan, wrong month, wrong PAN or TAN). Form 16 shows the right salary and TDS, but AIS shows less or more TDS, or splits the salary wrongly across months.

**Why it matters.** If the return trusts AIS blindly, the taxpayer may under-report salary, over-report TDS, or pay self-assessment tax they do not owe.

**Fix.**
- Check Form 16 against payslips and bank credits to confirm the actual salary and TDS.
- If Form 16 is right and AIS is wrong, submit AIS feedback on the e-filing portal and ask the employer to file or revise the TDS return.

## Scenario 2: TDS missing from AIS, or extra TDS in AIS

**TDS deducted but not in AIS.** The portal shows nil or low TDS, so the taxpayer appears to owe more. Once the employer's data reaches the department, a rectification brings a refund, but late and with extra work.

**AIS shows more TDS than Form 16** (another employer, FD interest, rent and so on). If the return relies only on Form 16, it under-reports TDS; if it claims TDS that was never deducted, the department flags the mismatch, may send a notice and may hold the refund.

**How to avoid it.**
- Add TDS from every source: Form 16, Form 16A, Form 26AS and AIS.
- Before claiming TDS that appears only in AIS, verify it against Form 26AS and the interest or rent statements.

## Scenario 3: gratuity and leave encashment in Form 16

**Gratuity** is salary, with a limited exemption under section 10(10). Form 16 should include gratuity paid in gross salary and show only the exempt part as an exemption. If Form 16 leaves gratuity out, or shows it fully exempt without working, AIS treats it as taxable salary and a mismatch follows.

**Leave encashment** taken during service is fully taxable and must be in Form 16. Taken on retirement, part may be exempt under section 10(10AA); Form 16 must show the taxable and exempt parts correctly.

**What to do.**
- Check that gratuity and leave encashment are in gross salary and that only the eligible exemption is deducted.
- If Form 16 shows more exemption than allowed, AIS will show a higher taxable salary and raise a mismatch.
- If Form 16 shows no exemption where one is due, the correct exemption can still be claimed in the return, with evidence (Form 10E and the working).

## Scenario 4: job change during the year (two Form 16s)

**Both Form 16s are needed.** Salary and TDS from the old and new employer are added to get total taxable salary and total TDS.

**AIS problems.**
- The old employer may not file, or may file late, the TDS return for the last months, so AIS misses part of the salary or TDS.
- If the new employer was not told about the earlier salary (Form 12B not given), it withholds too little and AIS shows lower TDS for the year. The taxpayer may then owe tax at filing.

**How to reconcile.**
1. Collect Part A and Part B of both Form 16s, Form 26AS and AIS for the same year.
2. Check that salary and TDS from both employers appear in AIS; look for duplicates, missing months and wrong amounts.
3. If one employer's data is missing or wrong, ask that employer to file or revise the TDS return and issue a revised Form 16. Report the difference through AIS feedback and keep payslips, appointment and resignation letters and bank statements as proof.

## What MyCA does when a figure conflicts

From the ITR-1 field guide (section 3.1), whenever a primary source (such as Form 16) and a validation source (such as AIS) disagree:

1. Pause filling the affected field. Never pick one value silently.
2. Show both figures with a plain-language reason why they may differ.
3. Ask one specific question that names the exact figures and the difference, with tap-to-answer options where possible.
4. Accept a confirmed figure with a reason, or an uploaded document, and update the field.
5. Re-run every affected validation rule before moving on.

AIS is fetched at the start of every filing session and is the baseline for salary, interest, dividends, TDS, TCS and advance tax. Unreconciled figures are never shown to the taxpayer as confirmed.

## Reading the OLTAS status on Form 16 Part A

| Code | Meaning |
|---|---|
| F (Final) | Payment details in the bank match the TDS statement. Credit is final. |
| U (Unmatched) | Tax not deposited, or wrong payment particulars. Credit appears only when they match. |
| P (Provisional) | Government deductors only; becomes F once the Pay and Accounts Officer verifies it. |
| O (Overbooked) | The statement claims more than was paid; credit becomes final only when the deductor corrects it. |

Only TDS with status F should be treated as safe to claim without a follow-up question.
