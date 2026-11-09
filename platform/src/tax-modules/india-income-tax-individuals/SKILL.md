---
name: india-income-tax-individuals
description: Indian income tax for resident individuals and proprietors. Old and new regimes, slab rates, standard deduction, the section 87A rebate and its marginal relief, 80C and 80D limits, surcharge and cess, choosing or switching regime, advance tax instalments, return due dates, and belated, revised and updated returns. Use when the owner or CA asks how much tax is due, which regime is cheaper, whether a deduction is allowed, when the return or advance tax is due, or how to fix a filed return.
license: Proprietary. Part of MyCA.
compatibility: Designed for MyCA's tax assistant. Figures in double braces are read from MyCA's dated statutory rules for the date asked about.
metadata:
  jurisdiction: "IN"
  domain: "income-tax"
  version: "1.0.0"
  reviewed-on: "2026-11-09"
  review-status: "awaiting CA sign-off"
allowed-tools: tax_plan review_income_tax advance_tax record_advance_tax tds_credit_check
---

# Income tax for individuals

Section numbers below are those of the Income-tax Act, 1961, which governs income up to FY 2025-26. The Income-tax Act, 2025 governs the tax year 2026-27 onward and renumbers most sections; MyCA's dated rules carry the figures for each year under the right Act.

## regimes: The old and new tax regimes
Keywords: regime, new regime, old regime, default, choose, switch, opt out, 115bac, form 10-iea, compare, cheaper, which regime
Source: Income-tax Act 1961 s.115BAC(1A) and s.115BAC(6) as amended by the Finance Act 2023; Income-tax Act 2025 s.202

The new regime is the default from FY 2023-24. An individual without business income chooses the old regime afresh each year, in the return itself, by the return due date. An individual with business or professional income opts out of the new regime with Form 10-IEA by the return due date, and can come back to the new regime only once; after that they cannot leave it again.

The new regime has lower slab rates but disallows most deductions, including those under 80C and 80D. Use `tax_plan` to compare both regimes on the same figures before choosing.

## slabs: Slab rates
Keywords: slab, slabs, rate, tax rate, basic exemption, tax free, income tax rates, how much tax
Source: Income-tax Act 1961 s.115BAC(1A) (new regime); First Schedule to the annual Finance Act (old regime); Income-tax Act 2025 s.202
Rules: income-tax.new-regime.slabs, income-tax.old-regime.slabs.below-60, income-tax.old-regime.slabs.60-to-79, income-tax.old-regime.slabs.80-plus

New regime, the same for every age: {{income-tax.new-regime.slabs}}.

Old regime, below sixty: {{income-tax.old-regime.slabs.below-60}}. Sixty to seventy-nine: {{income-tax.old-regime.slabs.60-to-79}}. Eighty and above: {{income-tax.old-regime.slabs.80-plus}}.

## standard-deduction: Standard deduction for salary and pension
Keywords: standard deduction, salary, salaried, pension, 16(ia), employee
Source: Income-tax Act 1961 s.16(ia); s.115BAC(2) for the new regime
Rules: income-tax.new-regime.standard-deduction, income-tax.old-regime.standard-deduction

From salary or pension, the standard deduction is {{income-tax.new-regime.standard-deduction#maxPaise}} in the new regime and {{income-tax.old-regime.standard-deduction#maxPaise}} in the old regime, or the salary itself if lower. It needs no proof and is not available against business income.

## rebate-87a: The section 87A rebate and its marginal relief
Keywords: 87a, rebate, tax free, zero tax, 12 lakh, 7 lakh, marginal relief, just above
Source: Income-tax Act 1961 s.87A and its provisos as amended by the Finance Act 2025
Rules: income-tax.new-regime.rebate, income-tax.old-regime.rebate

A resident individual whose total income does not exceed {{income-tax.new-regime.rebate#maxTotalIncomePaise}} pays no tax in the new regime: the rebate is the tax itself, up to {{income-tax.new-regime.rebate#maxRebatePaise}}. Just above that limit, marginal relief keeps the tax from exceeding the income above the limit, so earning one rupee more never costs more than one rupee of tax.

In the old regime the rebate is up to {{income-tax.old-regime.rebate#maxRebatePaise}} where total income does not exceed {{income-tax.old-regime.rebate#maxTotalIncomePaise}}, and there is no marginal relief.

MyCA applies the rebate to tax at slab rates. Tax on capital gains at special rates is outside it.

## deductions-80c-80d: Deductions under 80C and 80D
Keywords: 80c, 80d, deduction, ppf, elss, life insurance, tuition fees, home loan principal, health insurance, mediclaim, parents, senior citizen, chapter vi-a, new regime deductions
Source: Income-tax Act 1961 s.80C, s.80CCE, s.80D; s.115BAC(2) (deductions not allowed in the new regime)
Rules: income-tax.deduction.80c.cap, income-tax.deduction.80d.caps

In the old regime 80C (PF, PPF, ELSS, life insurance premium, children's tuition fees, home loan principal and similar) is capped at {{income-tax.deduction.80c.cap#maxPaise}} a year, together with 80CCC and 80CCD(1).

80D allows health insurance premium of up to {{income-tax.deduction.80d.caps#insuranceMaxPaise}} for self, spouse and children, and the same again for parents; the limit for a group is {{income-tax.deduction.80d.caps#seniorInsuranceMaxPaise}} where anyone in it is a senior citizen. Premium paid in cash does not qualify (a preventive health check-up may be paid in cash).

In the new regime neither 80C nor 80D is allowed. The employer's contribution to NPS under 80CCD(2) is one of the few deductions the new regime keeps.

## surcharge-cess: Surcharge and health and education cess
Keywords: surcharge, cess, 4 percent, health and education cess, 50 lakh, 1 crore, high income, marginal relief surcharge
Source: First Schedule to the annual Finance Act, Part I and Part III; Income-tax Act 1961 s.115BAC(1A) proviso (new regime cap)
Rules: income-tax.surcharge.individual, income-tax.new-regime.surcharge-cap, income-tax.cess.health-education

Surcharge is added to tax for total income above set thresholds: {{income-tax.surcharge.individual#tiers}}. In the new regime it cannot exceed {{income-tax.new-regime.surcharge-cap#maxRatePercent}}. Just above each threshold, marginal relief keeps the extra tax and surcharge from exceeding the income above the threshold.

Health and education cess of {{income-tax.cess.health-education#ratePercent}} is charged on tax plus surcharge.

## advance-tax: Advance tax instalments
Keywords: advance tax, instalment, installment, 15 june, 15 september, 15 december, 15 march, 234b, 234c, interest, self assessment
Source: Income-tax Act 1961 s.207, s.208, s.211, s.234B, s.234C
Rules: due-date.income-tax.advance-tax, due-date.income-tax.advance-tax.presumptive

Advance tax is payable when the tax for the year, after TDS and TCS, is ten thousand rupees or more. A resident senior citizen with no business or professional income need not pay it. The instalments are {{due-date.income-tax.advance-tax}}. A taxpayer on presumptive income pays the whole by {{due-date.income-tax.advance-tax.presumptive}}.

A shortfall carries simple interest of one per cent a month: under 234C for each instalment paid short, and under 234B when less than ninety per cent of the tax was paid by 31 March. `advance_tax` works out the instalments from the books.

## return-due-dates: When the income tax return is due
Keywords: itr, return, due date, last date, 31 july, file return, audit, 31 october, filing deadline
Source: Income-tax Act 1961 s.139(1) Explanation 2; Income-tax Act 2025 s.263
Rules: due-date.income-tax.return.other, due-date.income-tax.return.non-audit-business, due-date.income-tax.return.audit, due-date.income-tax.return.transfer-pricing

The return is due {{due-date.income-tax.return.other}} for most individuals; {{due-date.income-tax.return.non-audit-business}} for business or professional income whose accounts need no audit; {{due-date.income-tax.return.audit}} where the accounts must be audited; and {{due-date.income-tax.return.transfer-pricing}} where a transfer-pricing report is needed.

A return after the due date loses the right to carry forward most losses and attracts a late fee under s.234F and interest under s.234A.

## belated-revised-updated: Belated, revised and updated returns
Keywords: belated return, revised return, updated return, itr-u, 139(4), 139(5), 139(8a), mistake in return, correct return, missed deadline
Source: Income-tax Act 1961 s.139(4), s.139(5), s.139(8A) as amended by the Finance Act 2025; s.140B

A return missed by the due date can still be filed as a belated return, and a filed return can be revised for any mistake, until 31 December after the end of the year (or before the assessment is completed, if earlier).

After that, an updated return (ITR-U) can add income that was left out, within forty-eight months from the end of the assessment year, by paying the tax with interest and an additional tax of 25 to 70 per cent of the tax and interest depending on how late it is. An updated return cannot reduce the tax or increase a refund.
