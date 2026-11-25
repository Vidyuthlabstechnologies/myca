# India ITR builder: handover

The tool `build_itr_json` prepares an income tax return JSON for upload to the e-filing portal, works out the tax, and checks the JSON against the CBDT schema held in `platform/src/itr-knowledge/forms`. Competitor comparison and backlog: `INDIA-TAX-SOFTWARE-GAPS.md`.

## Where things are

| File | What it does |
|---|---|
| `platform/src/itr-return.mjs` | Entry point. Routes ITR-1, ITR-2, ITR-3 and ITR-4. `tools.mjs` and `router.mjs` call this. |
| `platform/src/itr-return-builder.mjs` | ITR-4 and ITR-3 builders, the shared helpers (`shared`), interest 234A/B/C and fee 234F, Chapter VI-A, the schema skeleton, `finish` (validation and the output shape). |
| `platform/src/itr-return-individual.mjs` | ITR-1 builder and the `houseProperty` rule. |
| `platform/src/itr-return-itr2.mjs` | ITR-2 builder. |
| `platform/src/itr-gain-schedules.mjs` | Schedules shared by ITR-2 and ITR-3: capital gains (CG, 112A, SI, current-year and brought-forward set-off) and house property. Form-specific field names are handled in one place. |
| `platform/src/it-house-property.mjs`, `itr-util.mjs` | House property rule; small shared helpers (`layer` fills required fields of optional sections). |
| `platform/src/itr-books.mjs` | `booksFigures`: reads a financial year's profit and loss, balance sheet, receipts, advance tax and TDS from the ledger. |
| `platform/src/it-depreciation.mjs` | Income-tax depreciation by block (WDV, half rate under 180 days). |
| `platform/src/itr-rules.mjs` | Portal arithmetic rules checked on every built or uploaded JSON (33 for ITR-2; CBDT ids attached for ITR-2). |
| `platform/src/capital-gains.mjs` | Classifies each sale, sets off losses, applies the 112A exemption. |
| `sprints/sprint-5-filing-assistant/src/income-tax.mjs` | `computeIncomeTax` and `computeIncomeTaxSpecial` (special-rate income). |
| `platform/src/tool-schemas-tax.mjs` | Strict argument schema for `build_itr_json`. A new input needs an entry here, in `tools.mjs` (`args`) and a test. |
| `platform/test/itr-return-builder.test.mjs`, `itr-return-itr2.test.mjs`, `capital-gains.test.mjs` | Tests. |

Run: `cd platform && node --env-file=.env.test --test test/itr-return-itr2.test.mjs` (or `npm test`).

## How a return is built

1. `skeletonFor(form)` walks the CBDT schema and fills every required field with a typed default. `itemAt(path)` does the same for one array item or one optional section.
2. The builder computes the figures and `layer`s them over the skeleton (ITR-2) or `mergeInto`s them (the others). Optional sections are created from the schema first so their required fields exist.
3. `finish` validates against the schema when the assessment year matches the held schema (AY 2025-26), turns schema errors into `problems`, and returns `{ ready, problems, warnings, notes, summary, validation, json }`. `ready` is false while any problem remains.

Amounts are whole rupees in and out. The tax engine runs in paise.

## Inputs by form

`taxpayer`, `fy`, `regime` (`new`, `old`, `auto`), `bank`, `taxesPaid` apply to every form.

- **ITR-1**: `salary`, `houseProperty`, `otherIncome`, `deductions`, `ltcg112A`.
- **ITR-2**: `salary.employers[]`, `salary.hra`, `houseProperties[]` (with `sharePercent`, `interestLoans`), `otherIncome`, `capitalGains.transactions[]`, `broughtForward` (`shortTermCapitalLoss`, `longTermCapitalLoss`, `houseProperty`), `deductions`.
- **ITR-3**: `profitAndLoss`, `adjustments`, `balanceSheet`, `fixedAssets`, `taxAudit`, `broughtForwardBusinessLoss`, or `fromBooks: true`; plus `houseProperties[]`, `capitalGains.transactions[]` and `broughtForward` as for ITR-2 (the old single `houseProperty.netIncome` still works when neither is given).
- **ITR-4**: `businesses` or `professions`, or `fromBooks: true`.

A capital gains transaction: `kind` (`listed-equity`, `equity-mf`, `property`, `unlisted-shares`, `gold`, `debt-mf`, `bond`, `other`), `buyDate`, `sellDate`, `saleValue`, `cost`, `transferExpenses`, `improvementCost`, optional `fmv31Jan2018`, `indexedCost` (property), `isin` (required for 112A rows), `stt`, `listed`.

## Rules the code implements

These were written from the Income-tax Act as amended and the CBDT schema. None has been signed off by a CA.

- **Capital gains** (`capital-gains.mjs`). Long term after 12 months for listed shares and equity fund units, 24 months for property and unlisted shares, and for the rest after 23 July 2024; 36 months before it. Specified mutual funds bought from 1 April 2023 and unlisted bonds sold after 23 July 2024 are short term (section 50AA). Equity bought before 1 February 2018 uses the higher of cost and the lower of the 31 January 2018 value and the sale value. Rates by transfer date: 111A 15% before and 20% from 23 July 2024; 112A 10% and 12.5% with ₹1.25 lakh exempt; other long term 20% and 12.5%. Property bought before 23 July 2024 gets the lower of 12.5% without indexation and 20% with indexation when `indexedCost` is given. A short-term loss sets off against any gain, a long-term loss only against long-term gains, then brought-forward losses the same way. The result keeps who set off against whom (`lossMatrix`, `bfSetoff`) for Schedule CG.
- **Tax with special rates** (`computeIncomeTaxSpecial`). Unused basic exemption is set against special-rate income, highest rate first. The 87A rebate covers the whole tax before FY 2025-26 and only the normal-rate tax from FY 2025-26 in the new regime. Surcharge on special-rate income is capped at 15%. Marginal relief on surcharge is not computed and the result says so.
- **House property** (`houseProperty`). Net annual value less 30%, less interest. Self-occupied interest up to ₹2 lakh in the old regime only. Loss set-off against other heads up to ₹2 lakh in the old regime, otherwise carried forward.
- **Interest and fee**. 234A on months or part; 234B at 1% a month when advance tax is under 90%; 234C by instalment with the 12% and 36% relief; 234F ₹1,000 or ₹5,000. Capital gain relief for 234C is applied to the whole year's gains, which is a simplification.
- **Depreciation**. Block rates in `it-depreciation.mjs`; half rate when used under 180 days; sales above the block value become a short-term gain under section 50.

## Choices a CA should confirm

1. **Order of the ₹1.25 lakh 112A exemption.** Applied first to gains at 12.5% (transfers from 23 July 2024), then at 10%, as in the CBDT sample return. Settled by the sample; no longer a CA question.
2. **Where the exemption shows.** The exempt gain stays in total income and Schedule SI; only the tax falls. Part B-TI is before brought-forward set-off, which is shown in Schedule BFLA. Both follow the sample return.
3. **234C with capital gains**, as above.
4. **Surcharge** for income above ₹50 lakh with special-rate gains.
5. **Dividend by quarter** defaults to the first quarter when not given.

## What is not built

Schedule FA and FSI (foreign assets), Schedule AL (required above ₹50 lakh), sections 54, 54EC and 54F claims, ESOP schedule, carry-forward loss schedule (Schedule CFL; the amounts are in `summary.lossesToCarryForward`), non-resident and not-ordinarily-resident returns, Form 3CD, a business loss of the year set off against other heads, and the portal's Category A and B rules beyond six for ITR-4.

## Owner or CA items

- The AY 2026-27 schema and utility from the e-filing portal, placed in `platform/src/itr-knowledge/forms/itr-N/`, then `SCHEMA_AY` in `itr-return-builder.mjs` updated. Until then returns for AY 2026-27 are built but marked unchecked.
- CA review of the outputs on real returns.
