const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const IT511_2025 = 'Georgia Department of Revenue, 2025 IT-511 Individual Income Tax Instruction Booklet (dor.georgia.gov/document/document/2025-it-511-individual-income-tax-booklet/download) with the 2025 Form 500 and Schedules 1 and 3 (apps.dor.ga.gov/FillableForms/webpdf/examples/2025GA500.pdf), read 2026-11-21';
const HB463 = 'Georgia House Bill 463 (2026 session), the Georgia Economic Growth and Tax Relief Act of 2026, as passed House and Senate (www.legis.ga.gov/api/legislation/document/20252026/249080), Sections 2-1 to 2-4 and 5-1, signed by the Governor on 2026-05-11 (gov.georgia.gov press release of 2026-05-11), read 2026-11-21';

export const RULES = [
  {
    id: 'us.state-return.ga.income-tax',
    value: { rateBasisPoints: 519, standardDeduction: { mfj: 24000, other: 12000 }, dependentExemption: 4000, otherStateIncomeTaxCap: { mfs: 5000, other: 10000 } },
    basis: 'flat_rate_on_georgia_taxable_income_after_the_georgia_standard_or_itemized_deduction_and_the_dependent_exemption_with_other_state_income_taxes_removed_from_itemized_deductions_on_the_pre_2025_federal_salt_cap',
    ...year(2025),
    act: 'O.C.G.A. Title 48, Chapter 7, as amended by HB 111 (2025)',
    section: '48-7-20(a.1); 48-7-26(b); 48-7-27(a)(1)',
    source: `${IT511_2025}: What's New "Effective January 1, 2025, the income tax rate is 5.19%"; Line 11 standard deduction $24,000 married filing jointly and $12,000 for every other status; Line 14 "Multiply the number of dependents on Line 7c by $4,000"; Line 12b note limiting other state income taxes to the $10,000 ($5,000 married filing separately) federal cap`,
    attestations: []
  },
  {
    id: 'us.state-return.ga.income-tax',
    value: { rateBasisPoints: 499, standardDeduction: { mfj: 30000, other: 15000 }, dependentExemption: 5000, otherStateIncomeTaxCap: { mfs: 5000, other: 10000 } },
    basis: 'flat_rate_on_georgia_taxable_income_after_the_georgia_standard_or_itemized_deduction_and_the_dependent_exemption_with_other_state_income_taxes_removed_from_itemized_deductions_on_the_pre_2025_federal_salt_cap',
    ...year(2026),
    act: 'Georgia Economic Growth and Tax Relief Act of 2026 (HB 463)',
    section: '48-7-20(a.1)(1); 48-7-26(b); 48-7-27(a)(1)(B)',
    source: `${HB463}: rate "4.99 percent for taxable years beginning on or after January 1, 2026"; standard deduction $30,000 married filing jointly and $15,000 single, head of household or married filing separately; dependent deduction $5,000; the other state income tax cap follows the 2025 IT-511 because Georgia had not adopted the 2025 federal SALT cap change as of 2026-11-21`,
    attestations: []
  },
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ga.retirement-exclusion',
    value: { age62Maximum: 35000, age65Maximum: 65000, earnedIncomeMaximum: 5000, lowerAge: 62, upperAge: 65 },
    basis: 'retirement_income_exclusion_for_each_spouse_aged_62_to_64_or_disabled_up_to_35000_and_aged_65_or_over_up_to_65000_of_which_at_most_5000_may_be_earned_income_prorated_for_part_year_and_nonresidents_by_the_earned_and_unearned_georgia_ratios',
    ...year(y),
    act: y === 2025 ? 'O.C.G.A. 48-7-27(a)(5)' : 'O.C.G.A. 48-7-27(a)(5)(A)(xiii) as amended by HB 463 (2026)',
    section: '48-7-27(a)(5)',
    source: y === 2025 ? `${IT511_2025}: Subtractions item 1 ($35,000 for ages 62-64 or permanently disabled, $65,000 for 65 or older, "Up to $5,000 of the maximum allowable exclusion may be earned income") and the Retirement Income Exclusion page with the part-year example` : `${HB463}: division (xiii) keeps $35,000 and $65,000 for taxable years "ending on or before December 31, 2026"; $70,000 applies only from 2027; the $5,000 earned income limit is not amended`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.ga.credits',
    value: { lowIncomeAgiBelow: 20000, lowIncomeTable: [{ agiBelow: 6000, credit: 26 }, { agiBelow: 8000, credit: 20 }, { agiBelow: 10000, credit: 14 }, { agiBelow: 15000, credit: 8 }, { agiBelow: 20000, credit: 5 }], itemizerCredit: 300, itemizerResidentDays: 183, path2CollegePerBeneficiary: { mfj: 8000, other: 4000 } },
    basis: 'low_income_credit_per_exemption_by_federal_agi_band_below_20000_eligible_itemizer_credit_of_300_and_path2college_deduction_per_beneficiary',
    ...year(y),
    act: 'O.C.G.A. 48-7-29; 48-7-27.1; 48-7-27(a)(14)',
    section: '48-7-29(b); 48-7-27.1; 48-7-27(a)(14)',
    source: `${IT511_2025}: Low Income Credit Worksheet credit table (under $6,000 $26; $6,000-$7,999 $20; $8,000-$9,999 $14; $10,000-$14,999 $8; $15,000-$19,999 $5), Line 17 (federal AGI under $20,000), Line 19 Georgia Eligible Itemizer Tax Credit "up to $300 per taxpayer" for residents of 183 days or living in Georgia on the last day of the year, Subtraction 15 Path2College ($4,000 per beneficiary, $8,000 on a joint return)${y === 2026 ? `; for 2026 these statutory amounts are unchanged by ${HB463}` : ''}`,
    attestations: []
  })),
  {
    id: 'us.state-return.ga.tips-overtime',
    value: { cashTipsMaximum: 1750, overtimeMaximum: 1750 },
    basis: 'subtraction_of_cash_tips_up_to_1750_and_qualified_overtime_of_full_time_hourly_employees_up_to_1750_for_2026_to_2028',
    ...year(2026),
    act: 'Georgia Economic Growth and Tax Relief Act of 2026 (HB 463)',
    section: '48-7-27(a)(16) and (17)',
    source: `${HB463}: Section 2-4, "(16)(A) ... qualified overtime compensation ... up to $1,750.00 received by a full-time employee paid by an hourly wage" and "(17)(A) ... any amount up to $1,750.00 received in cash tips"`,
    attestations: []
  },
];
