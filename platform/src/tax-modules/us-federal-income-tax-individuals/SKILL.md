---
name: us-federal-income-tax-individuals
description: US federal income tax for individuals filing Form 1040. Filing status, tax brackets, the standard deduction and itemizing, the SALT cap, capital gains and qualified dividend rates, the child tax credit, the earned income credit, education credits, self-employment tax and the QBI deduction, the 2025 to 2028 deductions for tips, overtime, car loan interest and seniors, taxable Social Security, the net investment income tax, estimated tax and the April due date. Use when someone asks how much federal tax they owe, whether a deduction or credit applies, or which form a figure goes on.
license: Proprietary. Part of MyCA.
compatibility: Designed for MyCA's tax assistant. Figures in double braces are read from MyCA's dated statutory rules for the date asked about.
metadata:
  jurisdiction: "US"
  domain: "income-tax"
  version: "1.0.0"
  reviewed-on: "2026-11-11"
  review-status: "awaiting CPA sign-off"
allowed-tools: us_return_review us_tax_estimate us_return_status schedule_se schedule_c_summary estimated_tax_dates
---

# Federal income tax for individuals

Section numbers are those of the Internal Revenue Code. Public Law 119-21 (the One Big Beautiful Bill Act, July 2025) made the 2017 rates and standard deduction permanent and added several deductions for 2025 to 2028; MyCA's dated rules carry each year's figures.

## filing-status: Filing status
Keywords: filing status, single, married filing jointly, joint return, married filing separately, head of household, qualifying surviving spouse, widow, mfj, mfs, hoh
Source: IRC s.1, s.2(a), s.2(b), s.7703

Your status is set by your situation on 31 December. Married couples choose a joint return or separate returns; a joint return usually costs less, and several credits (the earned income credit, education credits, the student loan interest deduction and the 2025 to 2028 deductions) are limited or barred on a separate return. Head of household is for an unmarried person who paid more than half the cost of a home for a qualifying person. A qualifying surviving spouse keeps the joint rates for two years after the spouse's death while a dependent child lives at home.

Use `us_tax_estimate` to compare statuses on the same figures.

## brackets: Tax brackets
Keywords: tax bracket, brackets, rate, tax rate, marginal rate, 10 percent, 12 percent, 22 percent, 24 percent, 32 percent, 35 percent, 37 percent, how much tax, federal income tax rates
Source: IRC s.1(j) as made permanent by Public Law 119-21 s.70101; annual inflation adjustment revenue procedure
Rules: us.federal.individual.brackets

Single: {{us.federal.individual.brackets#single}}.

Married filing jointly and qualifying surviving spouse: {{us.federal.individual.brackets#mfj}}.

Head of household: {{us.federal.individual.brackets#hoh}}.

Married filing separately: {{us.federal.individual.brackets#mfs}}.

Each rate applies only to the income inside its band. Below $100,000 of taxable income the IRS Tax Table is used, which taxes the middle of each $50 band; `us_return_review` does the same.

## standard-deduction: The standard deduction
Keywords: standard deduction, deduction, 65, over 65, blind, additional standard deduction, dependent standard deduction, itemize or standard
Source: IRC s.63(c) as amended by Public Law 119-21 s.70102
Rules: us.federal.individual.standard-deduction

The standard deduction is {{us.federal.individual.standard-deduction#basicCents.single}} single or married filing separately, {{us.federal.individual.standard-deduction#basicCents.mfj}} married filing jointly and {{us.federal.individual.standard-deduction#basicCents.hoh}} head of household.

Each spouse aged 65 or blind adds {{us.federal.individual.standard-deduction#additionalMarriedCents}} (twice if both); an unmarried person adds {{us.federal.individual.standard-deduction#additionalUnmarriedCents}}. Someone who can be claimed as a dependent gets the greater of {{us.federal.individual.standard-deduction#dependentMinimumCents}} or earned income plus {{us.federal.individual.standard-deduction#dependentEarnedIncomeAddCents}}, capped at the normal amount.

If you are married filing separately and your spouse itemizes, you must itemize too.

## itemized-salt: Itemizing and the SALT cap
Keywords: itemize, itemized deductions, schedule a, salt, state and local tax, property tax, salt cap, mortgage interest, medical expenses, 7.5 percent, charity, charitable, donations
Source: IRC s.164(b)(6) and (7) as amended by Public Law 119-21 s.70120; s.213(a); s.163(h)(3); s.170
Rules: us.federal.individual.salt-cap, us.federal.individual.medical-floor, us.federal.individual.charitable

Itemize on Schedule A only when the total is more than your standard deduction.

State and local income (or sales) tax, property tax and personal property tax together are capped at {{us.federal.individual.salt-cap#capCents}} ({{us.federal.individual.salt-cap#mfsCapCents}} married filing separately). The cap falls by {{us.federal.individual.salt-cap#phaseDownBasisPoints}} of modified AGI above {{us.federal.individual.salt-cap#phaseDownStartCents}}, but never below {{us.federal.individual.salt-cap#floorCents}}.

Medical and dental expenses count only above {{us.federal.individual.medical-floor#basisPoints}} of AGI. Mortgage interest on up to $750,000 of acquisition debt is deductible. Cash gifts to public charities are deductible up to {{us.federal.individual.charitable#cashAgiLimitBasisPoints}} of AGI; from 2026 only gifts above {{us.federal.individual.charitable#itemizedFloorBasisPoints}} of AGI count, and someone who does not itemize can deduct cash gifts up to {{us.federal.individual.charitable#nonItemizerCents.other}} ({{us.federal.individual.charitable#nonItemizerCents.mfj}} joint); before 2026 that non-itemizer amount is nil.

## capital-gains: Capital gains, losses and qualified dividends
Keywords: capital gain, capital gains, long term, short term, qualified dividends, 0 percent, 15 percent, 20 percent, stock sale, 1099-b, form 8949, schedule d, capital loss, 3000, carryover, wash sale
Source: IRC s.1(h), s.1(j)(5), s.1211(b), s.1212(b), s.1091
Rules: us.federal.individual.capital-gains-rates, us.federal.individual.capital-loss-limit

Assets held more than one year give long-term gains; those and qualified dividends are taxed at 0%, 15% or 20%. The 0% rate applies while taxable income stays at or below {{us.federal.individual.capital-gains-rates#zeroRateMaxCents.single}} single ({{us.federal.individual.capital-gains-rates#zeroRateMaxCents.mfj}} joint, {{us.federal.individual.capital-gains-rates#zeroRateMaxCents.hoh}} head of household), and 15% up to {{us.federal.individual.capital-gains-rates#fifteenRateMaxCents.single}} single ({{us.federal.individual.capital-gains-rates#fifteenRateMaxCents.mfj}} joint). Short-term gains are taxed as ordinary income.

Each sale goes on Form 8949 and the totals on Schedule D. A net capital loss reduces other income by at most {{us.federal.individual.capital-loss-limit#maxCents}} a year ({{us.federal.individual.capital-loss-limit#mfsMaxCents}} married filing separately); the rest carries forward. A loss on a sale is disallowed when the same security is bought within 30 days before or after (a wash sale); the broker reports it in box 1g.

## child-tax-credit: Child tax credit and credit for other dependents
Keywords: child tax credit, ctc, additional child tax credit, actc, refundable, other dependents, odc, schedule 8812, under 17, kids, children
Source: IRC s.24 as amended by Public Law 119-21 s.70104
Rules: us.federal.individual.child-tax-credit

The credit is {{us.federal.individual.child-tax-credit#perChildCents}} for each qualifying child under 17 at the end of the year with an SSN valid for work, and {{us.federal.individual.child-tax-credit#otherDependentCents}} for each other dependent. It falls by {{us.federal.individual.child-tax-credit#phaseOutPerThousandCents}} for each $1,000 (or part) of modified AGI above {{us.federal.individual.child-tax-credit#phaseOutStartCents.mfj}} on a joint return and {{us.federal.individual.child-tax-credit#phaseOutStartCents.other}} otherwise.

If the credit is more than your tax, up to {{us.federal.individual.child-tax-credit#refundablePerChildCents}} a child can be refunded as the additional child tax credit, limited to {{us.federal.individual.child-tax-credit#refundableBasisPoints}} of earned income above {{us.federal.individual.child-tax-credit#earnedIncomeFloorCents}}. Schedule 8812 works this out.

## earned-income-credit: Earned income credit
Keywords: earned income credit, eic, eitc, earned income tax credit, low income, refundable credit, investment income limit, qualifying child
Source: IRC s.32
Rules: us.federal.individual.eitc

The EIC is a refundable credit for workers with modest earned income. With no qualifying child it is {{us.federal.individual.eitc#byChildren.0.creditBasisPoints}} of earned income up to {{us.federal.individual.eitc#byChildren.0.earnedIncomeAmountCents}}; with one child {{us.federal.individual.eitc#byChildren.1.creditBasisPoints}} up to {{us.federal.individual.eitc#byChildren.1.earnedIncomeAmountCents}}; with two {{us.federal.individual.eitc#byChildren.2.creditBasisPoints}} and with three or more {{us.federal.individual.eitc#byChildren.3.creditBasisPoints}}, both up to {{us.federal.individual.eitc#byChildren.3.earnedIncomeAmountCents}}.

It phases out once AGI or earned income passes {{us.federal.individual.eitc#byChildren.1.phaseOutStartCents.other}} with children ({{us.federal.individual.eitc#byChildren.1.phaseOutStartCents.joint}} joint), and {{us.federal.individual.eitc#byChildren.0.phaseOutStartCents.other}} without ({{us.federal.individual.eitc#byChildren.0.phaseOutStartCents.joint}} joint). Investment income above {{us.federal.individual.eitc#investmentIncomeLimitCents}} rules it out. Without a qualifying child you or your spouse must be 25 to 64. A separate return qualifies only if you lived apart from your spouse for the last six months of the year.

## education-credits: Education credits
Keywords: education credit, american opportunity, aotc, lifetime learning, llc, tuition, 1098-t, college, form 8863
Source: IRC s.25A
Rules: us.federal.individual.education-credits

The American opportunity credit is all of the first {{us.federal.individual.education-credits#aotcFullCents}} and a quarter of the next {{us.federal.individual.education-credits#aotcQuarterCents}} of qualified expenses per eligible student, for the first {{us.federal.individual.education-credits#aotcMaxYears}} years of college, and {{us.federal.individual.education-credits#aotcRefundableBasisPoints}} of it is refundable. The lifetime learning credit is {{us.federal.individual.education-credits#llcBasisPoints}} of up to {{us.federal.individual.education-credits#llcExpenseCapCents}} of expenses per return.

Both phase out between {{us.federal.individual.education-credits#phaseOutCents.other.from}} and {{us.federal.individual.education-credits#phaseOutCents.other.to}} of modified AGI ({{us.federal.individual.education-credits#phaseOutCents.mfj.from}} to {{us.federal.individual.education-credits#phaseOutCents.mfj.to}} joint). Neither is allowed on a separate return. Expenses paid with tax-free scholarships do not count.

## self-employment: Self-employment tax and the QBI deduction
Keywords: self employment, self-employed, schedule c, schedule se, se tax, 1099-nec, freelancer, contractor, side hustle, qbi, qualified business income, 199a, 20 percent deduction
Source: IRC s.1401, s.1402, s.164(f), s.199A
Rules: us.federal.se-tax, us.federal.fica.social-security, us.federal.individual.qbi

Net profit from Schedule C is taxed twice: as income, and as self-employment tax on {{us.federal.se-tax#netEarningsBasisPoints}} of it at {{us.federal.se-tax#socialSecurityBasisPoints}} for Social Security (up to the {{us.federal.fica.social-security#wageBaseCents}} wage base, less wages already earned) plus {{us.federal.se-tax#medicareBasisPoints}} for Medicare. No SE tax is due on net earnings under {{us.federal.se-tax#minimumNetEarningsCents}}. Half the SE tax is deducted on Schedule 1.

The qualified business income deduction is {{us.federal.individual.qbi#basisPoints}} of the business profit (after that half and any self-employed health insurance and retirement deductions), limited to the same share of taxable income less net capital gain. The simple Form 8995 applies while taxable income before it is at or below {{us.federal.individual.qbi#thresholdCents.single}} ({{us.federal.individual.qbi#thresholdCents.mfj}} joint); above that, wage and property limits apply.

## obbba-deductions: Tips, overtime, car loan interest and the senior deduction
Keywords: no tax on tips, tips deduction, overtime, no tax on overtime, car loan, auto loan interest, senior deduction, 6000, seniors, schedule 1-a, one big beautiful bill, obbba
Source: IRC s.224, s.225, s.163(h)(4), s.151(d)(5)(C), added by Public Law 119-21 s.70201, s.70202, s.70203 and s.70103
Rules: us.federal.individual.tips-deduction, us.federal.individual.overtime-deduction, us.federal.individual.car-loan-interest, us.federal.individual.senior-deduction

For 2025 to 2028 these are deducted on Schedule 1-A whether or not you itemize. They lower taxable income, not AGI.

Qualified tips, in a job where tips are customary: up to {{us.federal.individual.tips-deduction#maxCents}} a return. The overtime premium (the part above the regular rate): up to {{us.federal.individual.overtime-deduction#maxCents.other}} ({{us.federal.individual.overtime-deduction#maxCents.mfj}} joint). Both shrink by {{us.federal.individual.tips-deduction#phaseOutPerThousandCents}} for each $1,000 of modified AGI above {{us.federal.individual.tips-deduction#phaseOutStartCents.other}} ({{us.federal.individual.tips-deduction#phaseOutStartCents.mfj}} joint), and a married couple must file jointly.

Interest on a loan taken after 2024 for a new personal car assembled in the United States: up to {{us.federal.individual.car-loan-interest#maxCents}}, shrinking by {{us.federal.individual.car-loan-interest#phaseOutPerThousandCents}} for each $1,000 above {{us.federal.individual.car-loan-interest#phaseOutStartCents.other}} ({{us.federal.individual.car-loan-interest#phaseOutStartCents.mfj}} joint).

Each taxpayer or spouse aged 65 or over with a valid SSN deducts {{us.federal.individual.senior-deduction#perPersonCents}}, reduced by {{us.federal.individual.senior-deduction#phaseOutBasisPoints}} of modified AGI above {{us.federal.individual.senior-deduction#phaseOutStartCents.other}} ({{us.federal.individual.senior-deduction#phaseOutStartCents.mfj}} joint). This is on top of the extra standard deduction at 65.

## social-security-benefits: Taxable Social Security benefits
Keywords: social security, ssa-1099, benefits, retirement benefits, taxable social security, provisional income, combined income
Source: IRC s.86
Rules: us.federal.individual.social-security-benefits

Up to half of your benefits are taxable once half the benefits plus your other income (including tax-exempt interest) passes {{us.federal.individual.social-security-benefits#baseCents.other}} ({{us.federal.individual.social-security-benefits#baseCents.mfj}} joint), and up to 85% once it passes {{us.federal.individual.social-security-benefits#adjustedBaseCents.other}} ({{us.federal.individual.social-security-benefits#adjustedBaseCents.mfj}} joint). A married person filing separately who lived with the spouse at any time in the year starts at nil. These amounts are not indexed for inflation.

## investment-taxes: Net investment income tax and additional Medicare tax
Keywords: niit, net investment income tax, 3.8 percent, additional medicare tax, 0.9 percent, form 8960, form 8959, high income
Source: IRC s.1411; s.3101(b)(2); s.1401(b)(2)
Rules: us.federal.individual.niit, us.federal.se-tax

The net investment income tax is {{us.federal.individual.niit#basisPoints}} of the lesser of your investment income (interest, dividends, capital gains, rents) or modified AGI above {{us.federal.individual.niit#thresholdCents.single}} single or head of household, {{us.federal.individual.niit#thresholdCents.mfj}} joint and {{us.federal.individual.niit#thresholdCents.mfs}} separate.

The additional Medicare tax is {{us.federal.se-tax#additionalMedicareBasisPoints}} of wages and self-employment earnings above {{us.federal.se-tax#additionalMedicareThresholdCents.single}} single ({{us.federal.se-tax#additionalMedicareThresholdCents.married_joint}} joint, {{us.federal.se-tax#additionalMedicareThresholdCents.married_separate}} separate). An employer withholds it once your wages there pass the lower threshold, whatever your status; the return settles the difference on Form 8959.

## due-dates-payments: When to file and pay
Keywords: due date, deadline, april 15, tax day, extension, form 4868, estimated tax, 1040-es, quarterly, withholding, penalty, underpayment
Source: IRC s.6072(a), s.6081, s.6654
Rules: us.federal.individual.return-due

The return and any tax owed are due {{us.federal.individual.return-due}} of the year after the tax year, moved to the next business day when it falls on a weekend or holiday. Form 4868 extends the time to file by six months, not the time to pay.

Tax not covered by withholding is paid in four estimated instalments; `estimated_tax_dates` lists them. You generally avoid the underpayment penalty when withholding and estimates cover 90% of this year's tax or 100% of last year's (110% if last year's AGI was above $150,000).
