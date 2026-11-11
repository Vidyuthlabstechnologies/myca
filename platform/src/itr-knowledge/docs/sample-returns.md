---
id: sample-returns
title: Sample returns (two salaried taxpayers)
source: sample-form16-a, sample-form16-b, sample-json-a, sample-json-b (identity removed before use)
applies-to: ITR-1, ITR-2
---

# Sample returns

Two redacted samples came with the folder. Names, PANs, addresses, account numbers and signatories are not reproduced anywhere in MyCA. The figures are kept as worked examples and test data.

## Subject A: high salary, ITR-2 (AY 2025-26)

- **Form 16 (scanned, 8 pages):** one employer for the full year (1 April 2024 to 31 March 2025). Salary paid or credited about ₹75.14 lakh; TDS deducted and deposited about ₹21.98 lakh across the four quarters, all challans status F.
- **ITR-2 JSON:** salary ₹72,55,240 plus perquisites ₹2,58,597, gross salary ₹75,13,837; standard deduction ₹75,000; income under "Salaries" ₹74,38,837. Other sources ₹61,861 (savings interest ₹8,638, term deposit interest ₹7,679, dividends ₹45,544, all dividends in the 16-31 March slot). Capital gains in Schedule CG and Schedule 112A; long-term capital losses carried forward from earlier years (Schedule CFL); foreign assets in Schedule FA (country: United States).
- **Tax:** tax at normal rates ₹19,52,487 and at special rates ₹5,952; surcharge ₹1,95,844; cess ₹86,171; gross liability ₹22,40,454. Interest u/s 234B ₹2,401 and 234C ₹537. Taxes paid ₹22,47,542 (TDS ₹22,00,442 including ₹2,073 on other income, self-assessment tax ₹47,100); refund ₹4,150.
- **Why ITR-2:** income above ₹50 lakh, capital gains, and foreign assets. It shows the surcharge band above ₹50 lakh, the AIS-to-return match for dividends and interest, and the dividend quarter split used for 234C.

A copy with every identifying value replaced by placeholders is the test fixture `platform/test/fixtures/itr/subject-a-itr2.json`. It is used to test `check_itr_json`.

## Subject B: salaried, new regime, ITR-1 skeleton (AY 2025-26)

- **Form 16 (digital, 10 pages):** one employer, full year, not opting out of the new regime. Salary u/s 17(1) ₹22,05,694; no perquisites, no section 10 exemptions; standard deduction ₹75,000; income under "Salaries" and gross total income ₹21,30,694; no Chapter VI-A deductions; TDS ₹3,42,376 across 12 monthly challans, all status F. See form16-structure for the line-by-line mapping.
- **ITR-1 JSON:** a skeleton with every amount zero and identity blanked; useful only to see the ITR-1 layout.
- **Note:** total income above ₹50 lakh is the limit for ITR-1, so ₹21.3 lakh of salary alone fits ITR-1, provided the other ITR-1 conditions hold.
