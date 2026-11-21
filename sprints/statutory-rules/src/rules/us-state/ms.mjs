const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const INSTR_2025 = 'Mississippi Department of Revenue, 2025 Resident, Non-Resident and Part-Year Resident Income Tax Instructions, Form 80-100-25-1-1-000 (www.dor.ms.gov/sites/default/files/tax-forms/individual/80100251%202.pdf), with Form 80-105-25-8 (80105258%201.pdf), Form 80-205-25-8 (80205258%201.pdf), Form 80-108-25-8 (80108258%201.pdf) and Form 80-160-25-8 (80160258%201.pdf) from www.dor.ms.gov/individual/individual-income-tax-forms, read 2026-11-21';
const GENERAL_INFO = 'Mississippi Department of Revenue, Individual Income Tax General Information, Tax Rates (www.dor.ms.gov/general-information): "Tax Year 2025 Excess of $10,000 of Taxable Income is taxed @ 4.4%; Tax Year 2026 Excess of $10,000 of Taxable Income is taxed @ 4%; Tax Year 2027 ... @ 3.75%", read 2026-11-21';

const BASE = {
  exemption: { mfj: 12000, mfs: 12000, hoh: 8000, single: 6000 },
  additionalExemption: 1500,
  standardDeduction: { mfj: 4600, mfs: 2300, hoh: 3400, single: 2300 },
  zeroBracket: 10000,
  medicalFloorBasisPoints: 750,
  nationalGuardMaximum: 15000,
  collegeSavingsMaximum: { mfj: 20000, other: 10000 },
};

export const RULES = [
  {
    id: 'us.state-return.ms.income-tax',
    value: { ...BASE, brackets: [{ overCents: 0, rateBp: 0 }, { overCents: 1000000, rateBp: 440 }] },
    basis: 'zero_percent_on_the_first_10000_and_4_4_percent_above_for_each_column_of_taxable_income_after_the_fixed_standard_deduction_and_the_filing_status_and_1500_additional_exemptions',
    ...year(2025),
    act: 'Miss. Code Ann. Title 27, Chapter 7 (Income Tax), as amended by HB 531 (2022)',
    section: '27-7-5(1); 27-7-17(3); 27-7-21',
    source: `${INSTR_2025}: Filing Status and Exemptions table (Married joint or combined $12,000 exemption and $4,600 standard deduction; Married filing separate $6,000 and $2,300; Head of Family $8,000 and $3,400; Single $6,000 and $2,300), Additional Exemptions $1,500 for each dependent and for 65 or over or blind, Line 15 married filing separately uses one half of line 12, Tax Rates "0% on the first $10,000.00 of taxable income and 4.4% on taxable income in excess of $10,000.00", Schedule of Tax Computation with Column A and Column B, line 55 National Guard "$15,000 statutory exclusion", lines 56-57 MACS "$20,000 for joint filers and $10,000 for single and other filers", Schedule A line 2b 7.5% of federal AGI`,
    attestations: []
  },
  {
    id: 'us.state-return.ms.income-tax',
    value: { ...BASE, brackets: [{ overCents: 0, rateBp: 0 }, { overCents: 1000000, rateBp: 400 }] },
    basis: 'zero_percent_on_the_first_10000_and_4_percent_above_for_each_column_of_taxable_income_after_the_fixed_standard_deduction_and_the_filing_status_and_1500_additional_exemptions',
    ...year(2026),
    act: 'Miss. Code Ann. Title 27, Chapter 7 (Income Tax), as amended by HB 531 (2022) and HB 1 (2025)',
    section: '27-7-5(1); 27-7-17(3); 27-7-21',
    source: `${GENERAL_INFO}; ${INSTR_2025} (What's New, House Bill 1 sets 3.75% from 2027 and leaves 2026 at the HB 531 rate). The exemptions, additional exemptions, standard deductions and the $10,000 zero-rate amount are fixed dollar amounts in the statute, not indexed, and are unchanged for 2026`,
    attestations: []
  },
  {
    id: 'us.state-return.ms.itemized',
    value: { taxesCap: { mfs: 20000, other: 40000 } },
    basis: 'mississippi_schedule_a_follows_federal_schedule_a_less_state_income_taxes_with_the_federal_40000_limit_on_taxes',
    ...year(2025),
    act: 'Miss. Code Ann. 27-7-17(3)(a)',
    section: '27-7-17(3)(a)(i)',
    source: `${INSTR_2025}: Form 80-108 Schedule A lines 1-8 and the Lines 3a through 3c note "Per the One Big Beautiful Bill Act, there is a $40,000 limitation ($20,000 if married filing separately) on this deduction"`,
    attestations: []
  },
  {
    id: 'us.state-return.ms.itemized',
    value: { taxesCap: { mfs: 20000, other: 40000 }, provisional: true },
    basis: 'mississippi_schedule_a_follows_federal_schedule_a_less_state_income_taxes_with_the_federal_40000_limit_on_taxes',
    ...year(2026),
    act: 'Miss. Code Ann. 27-7-17(3)(a)',
    section: '27-7-17(3)(a)(i)',
    source: 'Mississippi had not published the 2026 Form 80-108 or instructions as of 2026-11-21, so it is not known whether the $40,000 limit on taxes is raised to the 2026 federal amount; the 2025 limit is carried and marked provisional',
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ms.credits',
    value: { dependentCareBasisPoints: 2500, dependentCareAgiLimit: 50000 },
    basis: 'dependent_care_credit_of_25_percent_of_the_federal_child_and_dependent_care_credit_for_federal_agi_up_to_50000_limited_to_the_tax',
    ...year(y),
    act: 'Miss. Code Ann. Title 27, Chapter 7',
    section: 'Dependent Care Credit (credit code 44)',
    source: `${INSTR_2025}: Income Tax Credits, Dependent Care Credit "equal to twenty five percent (25%) of the amount of the federal income tax credit claimed", "federal adjusted gross income of not more than fifty thousand dollars ($50,000)", limited to the total income tax liability${y === 2026 ? '; a statutory percentage and limit with no change enacted for 2026' : ''}`,
    attestations: []
  })),
];
