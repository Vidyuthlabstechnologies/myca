const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const INSTR_2025 = 'Idaho State Tax Commission, 2025 Individual Income Tax Forms and Instructions EIN00046 (tax.idaho.gov/wp-content/uploads/forms/EIN00046/EIN00046_03-02-2026.pdf) with Form 40 EFO00089, Form 43 EFO00091, Form 39R EFO00088, Form 39NR EFO00087 and Idaho Worksheet 1-A EFO00341 (all 03-02-2026), read 2026-11-21';
const WH_2026 = 'Idaho State Tax Commission press release "Withholding tables updated for 2026" of 2026-07-31 (tax.idaho.gov/pressrelease/withholding-tables-updated-for-2026/), read 2026-11-21';
const PROVISIONAL_2026 = 'Idaho has not published the 2026 Form 40 or Form 43 instructions as of 2026-11-21, so the indexed 2026 amount is carried from 2025 and the record is marked provisional until the Tax Commission publishes it';

const zeroBracket = (single, other) => ({ single: [{ overCents: 0, rateBp: 0 }, { overCents: single * 100, rateBp: 530 }], mfs: [{ overCents: 0, rateBp: 0 }, { overCents: single * 100, rateBp: 530 }], other: [{ overCents: 0, rateBp: 0 }, { overCents: other * 100, rateBp: 530 }] });

export const RULES = [
  {
    id: 'us.state-return.id.income-tax',
    value: { brackets: zeroBracket(4811, 9622), rateBasisPoints: 530, permanentBuildingFund: 10, useTaxRateBp: 600, filingThreshold: { mfs: 5, nonresident: 2500 } },
    basis: 'idaho_taxable_income_less_the_filing_status_amount_times_the_flat_rate_with_the_permanent_building_fund_tax_for_filers_required_to_file',
    ...year(2025),
    act: 'Idaho Code Title 63 Chapter 30 as amended by House Bill 40 (2025)',
    section: '63-3024; 63-3082',
    source: `${INSTR_2025}: What's New "Effective January 1, 2025, the individual income tax rate is 5.3%"; Line 20 tax worksheet (Form 40) and Line 42 tax worksheet (Form 43): subtract $4,811 single or married filing separately, $9,622 married filing jointly, head of household or qualifying surviving spouse, multiply by 5.3%; Line 31 (Form 43 line 52) permanent building fund tax of $10; Line 28 use tax at 6%; Who must file (married filing separately $5 gross income, nonresidents $2,500 of Idaho gross income)`,
    attestations: []
  },
  {
    id: 'us.state-return.id.income-tax',
    value: { brackets: zeroBracket(4811, 9622), rateBasisPoints: 530, permanentBuildingFund: 10, useTaxRateBp: 600, filingThreshold: { mfs: 5, nonresident: 2500 }, provisional: true },
    basis: 'idaho_taxable_income_less_the_filing_status_amount_times_the_flat_rate_with_the_permanent_building_fund_tax_for_filers_required_to_file',
    ...year(2026),
    act: 'Idaho Code Title 63 Chapter 30 as amended by House Bill 40 (2025)',
    section: '63-3024; 63-3082',
    source: `${WH_2026} and the 2026 percentage-method table it links keep the 5.3% rate; ${PROVISIONAL_2026} (the $4,811 and $9,622 zero-tax amounts are indexed each year)`,
    attestations: []
  },
  {
    id: 'us.state-return.id.deductions',
    value: { standard: { single: 15750, mfs: 15750, hoh: 23625, mfj: 31500, qss: 31500 }, additional: { married: 1600, unmarried: 2000 }, dependentFiler: { minimum: 1350, earnedPlus: 450 }, saltLine5dLimit: { mfs: 20000, other: 40000 } },
    basis: 'federal_standard_deduction_under_idaho_conformity_with_the_age_and_blind_additions_and_the_dependent_limit_federal_itemized_deductions_less_state_income_or_sales_tax',
    ...year(2025),
    act: 'Idaho Code 63-3022(j) and 63-3004 (IRC conformity as of January 1, 2026; House Bill 559 of 2026)',
    section: '63-3022(j)',
    source: `${INSTR_2025}: Form 40 standard deduction $15,750 single or married filing separately, $23,625 head of household, $31,500 married filing jointly or qualifying surviving spouse; Standard Deduction Worksheet ($1,350 or earned income plus $450 for a dependent, $1,600 per box or $2,000 if single or head of household); Line 14 rule (federal Schedule A line 5a when line 5d is $40,000 or less, $20,000 married filing separately, otherwise line 5e minus lines 5b and 5c)`,
    attestations: []
  },
  {
    id: 'us.state-return.id.deductions',
    value: { standard: { single: 16100, mfs: 16100, hoh: 24150, mfj: 32200, qss: 32200 }, additional: { married: 1650, unmarried: 2050 }, dependentFiler: { minimum: 1350, earnedPlus: 450 }, saltLine5dLimit: { mfs: 20200, other: 40400 } },
    basis: 'federal_standard_deduction_under_idaho_conformity_with_the_age_and_blind_additions_and_the_dependent_limit_federal_itemized_deductions_less_state_income_or_sales_tax',
    ...year(2026),
    act: 'Idaho Code 63-3022(j) and 63-3004 (IRC conformity as of January 1, 2026)',
    section: '63-3022(j)',
    source: 'Idaho uses the federal standard deduction (Idaho Code 63-3022(j); 2025 instructions "Idaho conforms to the IRC as of January 1, 2026"); the 2026 federal amounts are IRC 63(c) as amended by Public Law 119-21 and Rev. Proc. 2025-32 section 4.15 ($16,100, $32,200, $24,150, additional $1,650 or $2,050), and the federal Schedule A line 5d test follows the 2026 federal SALT limit of $40,400 ($20,200 married filing separately) under IRC 164(b)(7) as amended; read 2026-11-21',
    attestations: []
  },
  {
    id: 'us.state-return.id.subtractions',
    value: { retirementMaximum: { mfj: 72324, other: 48216 }, collegeSavingsMaximum: { mfj: 12000, other: 6000 }, childCareMaximum: 12000, retirementAge: 65, disabledRetirementAge: 62 },
    basis: 'form_39r_retirement_benefits_deduction_maximum_reduced_by_social_security_and_railroad_benefits_idaho_college_savings_contribution_limit_and_child_care_deduction_limit',
    ...year(2025),
    act: 'Idaho Code 63-3022A; 63-3022(j); 63-3022(g)',
    section: '63-3022A; 63-3022(g); 63-3022(j)',
    source: `${INSTR_2025}: Form 39R Part B line 8a ($48,216 single, $72,324 married filing jointly, at least age 65 or disabled and at least 62), line 14 ($6,000, $12,000 joint), line 6 worksheet ($12,000 for one or more children)`,
    attestations: []
  },
  {
    id: 'us.state-return.id.subtractions',
    value: { retirementMaximum: { mfj: 72324, other: 48216 }, collegeSavingsMaximum: { mfj: 12000, other: 6000 }, childCareMaximum: 12000, retirementAge: 65, disabledRetirementAge: 62, provisional: true },
    basis: 'form_39r_retirement_benefits_deduction_maximum_reduced_by_social_security_and_railroad_benefits_idaho_college_savings_contribution_limit_and_child_care_deduction_limit',
    ...year(2026),
    act: 'Idaho Code 63-3022A; 63-3022(j); 63-3022(g)',
    section: '63-3022A; 63-3022(g); 63-3022(j)',
    source: `${PROVISIONAL_2026} (the retirement benefits maximum follows the yearly Social Security maximum benefit)`,
    attestations: []
  },
  {
    id: 'us.state-return.id.credits',
    value: { childTaxCredit: 205, childTaxCreditMaxAge: 16, childTaxCreditPerMonth: 17.08, foodTaxCredit: 155, foodTaxCreditPerMonth: 12.92, familyMemberCredit: 100, familyMemberCreditMaximum: 300 },
    basis: 'idaho_child_tax_credit_per_qualifying_child_aged_16_or_under_food_tax_credit_per_person_and_100_dollar_credit_for_a_family_member_65_or_older',
    ...year(2025),
    act: 'Idaho Code 63-3029L; 63-3024A; 63-3025D',
    section: '63-3029L; 63-3024A; 63-3025D',
    source: `${INSTR_2025}: Line 24 Child Tax Credit Worksheet ($205 per qualifying child age 16 or under), Form 43 line 46 worksheet ($17.08 per month), Line 43 Food Tax Credit ($155 each, $12.92 per month), Line 44 ($100 per person up to $300)`,
    attestations: []
  },
  {
    id: 'us.state-return.id.credits',
    value: { childTaxCredit: 0, childTaxCreditMaxAge: 16, childTaxCreditPerMonth: 0, foodTaxCredit: 155, foodTaxCreditPerMonth: 12.92, familyMemberCredit: 100, familyMemberCreditMaximum: 300, provisional: true },
    basis: 'idaho_child_tax_credit_per_qualifying_child_aged_16_or_under_food_tax_credit_per_person_and_100_dollar_credit_for_a_family_member_65_or_older',
    ...year(2026),
    act: 'Idaho Code 63-3029L; 63-3024A; 63-3025D',
    section: '63-3029L; 63-3024A; 63-3025D',
    source: `${WH_2026}: "The Idaho Child Tax Credit has sunsetted per Idaho Code section 63-3029L", so the child tax credit is $0 for 2026; the food tax credit and family member credit are carried from 2025 because the 2026 instructions are not published; ${PROVISIONAL_2026}`,
    attestations: []
  }
];
