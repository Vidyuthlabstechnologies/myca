---
id: excel-utility
title: The department's Excel utility and the JSON upload flow
source: itr-1-utility to itr-6-utility (Help and Instructions sheets, sheet layout, drop-down lists)
applies-to: ITR-1, ITR-2, ITR-3, ITR-4, ITR-5, ITR-6 (AY 2025-26 utilities)
---

# The department's Excel utility and the JSON upload flow

The income tax department publishes an Excel workbook ("utility") for each form. MyCA does not use the workbook, but its sheets show how each form is laid out, and its drop-down lists hold the codes the JSON expects. Both are in `forms/itr-N/utility.json`.

## How a return is produced with the utility

1. Fill the applicable schedules (sheets). Optional sheets can be hidden by answering Y or N on the first sheet.
2. Click Validate on each sheet and fix what it finds.
3. Click Calculate Tax. It must be done before generating the JSON.
4. Generate JSON: the utility revalidates every sheet and shows the schedules and the row count per schedule that will be written.
5. Save JSON. The file is named after the PAN.
6. Upload on the e-filing portal: e-File > Income Tax Returns > choose the form, assessment year and the JSON file.
7. Verify: with a registered digital signature (DSC) the filing is complete at upload; otherwise e-verify (Aadhaar OTP, net banking, bank or demat EVC), or post a signed ITR-V to CPC Bengaluru by ordinary or speed post within the time allowed (120 days in the utility's instructions; the period was later shortened to 30 days for returns filed from 1 August 2022).

## Conventions the utility enforces

- Mandatory fields are marked red; data entry cells are green; computed and linked cells have a blue font on white.
- Amounts are in whole rupees. Dates are dd/mm/yyyy in the sheet (the JSON uses yyyy-mm-dd). Percentages take up to two decimals, without the % sign.
- Tables such as TDS, TCS and IT (tax payments) grow with "Add rows"; blank rows are not written to the JSON.

## Importing

- **Previous version:** data filled in an older version of the utility can be imported.
- **Pre-filled JSON:** download it from the portal (Downloads > Pre-filled JSON for the assessment year) and import the personal and tax details. This is the same data MyCA reads from the portal's pre-fill.
- **A generated JSON** can be imported back into the utility.

## Sheets by form (from the AY 2025-26 utilities)

- **ITR-1:** Income Details, Schedule EA 10(13A) (HRA), Schedule 24(b) (home loan interest), Part A Gen 139(8A) (updated return), TDS, TCS, Taxes Paid and Verification, Part B ATI, and deduction sheets 80C, 80D, 80G, 80GGA, 80GGC, 80U/80DD, 80E/80EE/80EEA/80EEB.
- **ITR-2:** Part A General, Schedule S (salary), House Property, CG (capital gains), Schedule 112A, Schedule 115AD(1)(iii) proviso, VDA, OS, CYLA-BFLA, CFL, Unabsorbed Depreciation, ICDS, 10AA, the 80-series and VI-A sheets, AMT and AMTC, SPI-SI, EI, FSI, PTI, TPSA, TR-FA, Schedule 5A, AL, ESOP, Tax Calculated, Part B TI-TTI, IT, TDS, Part B ATI, Verification. The workbook also carries balance sheet and P&L sheets shared with ITR-3.
- **ITR-3:** everything in ITR-2 plus Nature of Business, Part A BS, Manufacturing Account, Trading Account, Profit and Loss, Part A OI, Quantitative Details, BP, DPM-DOA, DEP-DCG, ESR, GST.
- **ITR-4:** Income Details, Schedule 44AE (goods carriages), BP (presumptive 44AD, 44ADA), Schedule EA 10(13A), Schedule 24(b), TDS, TCS, IT, Part B ATI, Taxes Paid and Verification, 80-series sheets, AL, TaxCalc.
- **ITR-5:** Part A General (two sheets), balance sheet, manufacturing, trading and P&L accounts, Part A OI, Tax (old and new), Quantitative Details, House Property, BP, DPM-DOA, DEP-DCG, ESR, CG, 112A, 115AD, VDA, OS, CYLA-BFLA, CFL, Unabsorbed Depreciation, ICDS, 10AA, 80G, 80GGA, 80GGC, RA, 80, 80IAC, 80LA, 80P, VI-A, AMT, AMTC, SI, IF, EI, PTI, TPSA, FSI, TR-FA, GST, Part B TI-TTI, Part B ATI, IT, 115TD, TDS, FD, Verification.
- **ITR-6:** Part A General (two sheets), Subsidiary Details, Nature of Business, balance sheet, manufacturing, trading and P&L accounts in both the old format and Ind AS, Part A OI and OL, Quantitative Details, Tax, House Property, VDA, BP, DPM-DOA, DEP-DCG, ESR, CG, 112A, 115AD, OS, CYLA-BFLA, CFL, Unabsorbed Depreciation, ICDS, 10AA, 80G, 80GGA, 80GGC, 80IAC, 80LA, 80M, RA, VI-A, SI, IF, EI, PTI, MAT, MATC, BBS, TPSA, 115TD, FSI, TR-FA, SH-1 and SH-2 (shareholding), AL-1 and AL-2, GST, FD, Part B TI-TTI, Part B ATI, IT, TDS, Verification.

## Drop-down lists worth knowing

The utility's lists include: status, employer category, the section the return is filed under, residential status questions (resident, RNOR and NRI conditions), exempt allowances under section 10, nature of exempt income, TDS and TCS section codes, 80D categories, 80DD and 80U disability types, 80DDB diseases, 80GGA clauses, States and Union Territories, country codes, DTAA articles, nature of business codes (including the 44AD, 44ADA and 44AE lists), cost inflation index, stock units, and the Form 3CD audit table. Search them with `itr_knowledge` (kind "dropdown").

Bank, IFSC and ISIN master lists are left out (they are large and change often); the utility's sheet-protection keys are dropped.
