const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const I760 = 'Virginia Department of Taxation, 2025 Form 760 Resident Individual Income Tax Instructions (www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf, Rev. 05/26), read 2026-11-21';
const I760PY = 'Virginia Department of Taxation, 2025 Form 760PY Instructions (www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760py-instructions.pdf) and 2025 Form 763 (www.tax.virginia.gov/sites/default/files/taxforms/individual-income-tax/2025/763-2025.pdf), read 2026-11-21';
const SCHA = 'Virginia Department of Taxation, 2025 Schedule A Instructions (www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-sch-a-instructions.pdf, Rev. 06/26) and 2025 Schedule A with the Limited Itemized Deduction Worksheet (www.tax.virginia.gov/sites/default/files/taxforms/individual-income-tax/2025/schedule-2025.pdf), read 2026-11-21';
const LEG2025 = 'Virginia Department of Taxation, 2025 Legislative Summary (www.tax.virginia.gov/sites/default/files/inline-files/2025-legislative-summary.pdf): the eleventh enactment clause of the 2025 Appropriation Act (House Bill 1600, Chapter 725) sets the standard deduction at $8,750 single and $17,500 married filing jointly and the refundable earned income credit at 20 percent "for taxable years beginning on and after January 1, 2025, but before January 1, 2027", read 2026-11-21';
const LEG2026 = 'Virginia Department of Taxation, 2026 Legislative Summary (www.tax.virginia.gov/sites/default/files/inline-files/2026-legislative-summary.pdf): the 2026 Appropriation Act (House Bill 30, Special Session I, Chapter 1) raises the standard deduction only from 2027 and extends the 20 percent refundable earned income credit through 2029, read 2026-11-21';
const PROVISIONAL = 'Virginia has not published the 2026 Schedule A as of 2026-11-21; the overall itemized deduction limitation thresholds are inflation-indexed each year, so the 2025 thresholds are carried and marked provisional until the Department publishes the 2026 amounts';

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.va.income-tax',
    value: { brackets: [{ overCents: 0, rateBp: 200 }, { overCents: 300000, rateBp: 300 }, { overCents: 500000, rateBp: 500 }, { overCents: 1700000, rateBp: 575 }], standardDeduction: { mfj: 17500, other: 8750 }, personalExemption: 930, ageOrBlindExemption: 800, filingThreshold: { mfj: 23900, other: 11950 }, spouseTaxAdjustmentMaximum: 259, spouseTaxAdjustmentIncome: 17000 },
    basis: 'graduated_2_3_5_5_75_percent_rates_on_virginia_taxable_income_after_the_virginia_standard_or_itemized_deduction_and_930_personal_and_800_age_or_blind_exemptions_no_tax_below_the_filing_threshold_spouse_tax_adjustment_up_to_259',
    ...year(y),
    act: 'Code of Virginia Title 58.1, Chapter 3; 2025 Appropriation Act (HB 1600, Chapter 725)',
    section: '58.1-320; 58.1-321; 58.1-322.03; 58.1-324',
    source: `${I760}: Tax Rate Schedule (2% up to $3,000; $60 + 3% over $3,000; $120 + 5% over $5,000; $720 + 5.75% over $17,000), Line 11 standard deduction ($8,750 filing status 1 and 3, $17,500 filing status 2), Exemptions ($930 each; $800 for 65 or older and blind), filing thresholds ($11,950 single or separate, $23,900 joint), Spouse Tax Adjustment Worksheet (cannot exceed $259); part-year and nonresident methods (Standard Deductions Worksheet, Ratio Schedule for prorating exemptions, Nonresident Allocation Percentage) from ${I760PY}; ${LEG2025}${y === 2026 ? `; ${LEG2026}` : ''}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.va.age-deduction',
    value: { amount: 12000, notIncomeBasedBornOnOrBefore: '1939-01-01', bornOnOrBefore: `${y - 64}-01-01`, afagiThreshold: { single: 50000, married: 75000 } },
    basis: 'age_deduction_of_12000_for_each_filer_65_or_older_by_january_1_of_the_next_year_reduced_dollar_for_dollar_above_50000_single_or_75000_married_adjusted_federal_agi_except_for_filers_born_on_or_before_january_1_1939',
    ...year(y),
    act: 'Code of Virginia',
    section: '58.1-322.03(5)',
    source: `${I760}: Line 4 and the Age 65 and Older Deduction Worksheet ("taxpayers born on or before January 1, 1961" for 2025, $12,000 reduced $1 for every $1 of AFAGI above $50,000 single or $75,000 married)${y === 2026 ? '; for 2026 the statute fixes the amounts and the birth date moves one year to January 1, 1962' : ''}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.va.itemized',
    value: { medicalFloorBasisPoints: 1000 },
    basis: 'virginia_itemized_deductions_are_federal_itemized_deductions_without_the_salt_cap_on_property_taxes_less_income_taxes_with_medical_expenses_over_10_percent_of_federal_agi',
    ...year(y),
    act: 'Code of Virginia',
    section: '58.1-322.03(1)',
    source: `${SCHA}: Line 3 "Multiply Line 2 by 10%", Lines 5b and 5c property taxes not subject to the SALT cap, Line 18 reduction for income taxes${y === 2026 ? '; the Code fixes these rules for 2026 and the 2026 Amendments to the 2025 Appropriation Act (HB 29, Chapter 7) keep Virginia off the federal SALT cap and the federal overall limitation' : ''}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.va.itemized-limitation',
    value: { threshold: { mfj: 399200, qss: 399200, hoh: 365950, single: 332700, mfs: 199600 }, reductionBasisPoints: 300, maximumBasisPoints: 8000, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'pease_overall_limitation_reduces_itemized_deductions_by_the_smaller_of_3_percent_of_federal_agi_over_the_threshold_or_80_percent_of_deductions_other_than_medical_investment_interest_casualty_and_gambling',
    ...year(y),
    act: 'Code of Virginia',
    section: '58.1-322.03(1)',
    source: y === 2025 ? `${SCHA}: Line 17 thresholds $399,200 joint or qualifying surviving spouse, $365,950 head of household, $332,700 single, $199,600 married filing separately; Limited Itemized Deduction Worksheet Lines 4 (80%) and 8 (3%)` : PROVISIONAL,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.va.credits',
    value: { lowIncomePerExemption: 300, povertyGuidelines: y === 2025 ? [15650, 21150, 26650, 32150, 37650, 43150, 48650, 54150] : [15960, 21640, 27320, 33000, 38680, 44360, 50040, 55720], povertyPerAdditionalPerson: y === 2025 ? 5500 : 5680, eitcBasisPoints: 2000 },
    basis: 'credit_for_low_income_individuals_300_per_exemption_at_or_below_the_federal_poverty_guideline_published_in_the_taxable_year_or_virginia_eitc_of_20_percent_of_the_federal_eic_refundable_for_full_year_residents_only',
    ...year(y),
    act: 'Code of Virginia; 2025 Appropriation Act (HB 1600, Chapter 725); 2026 Appropriation Act (HB 30, Special Session I, Chapter 1)',
    section: '58.1-339.8',
    source: y === 2025 ? `${I760}: Schedule ADJ Lines 10-17 (Poverty Guideline Table $15,650 for 1 to $54,150 for 8, add $5,500 each; Line 13 "Multiply Line 12 by $300"; Line 16b "Multiply Line 14 by 20%"); Code of Virginia 58.1-339.8 (law.lis.virginia.gov/vacode/title58.1/chapter3/section58.1-339.8/), read 2026-11-21; ${LEG2025}` : `Code of Virginia 58.1-339.8 (law.lis.virginia.gov/vacode/title58.1/chapter3/section58.1-339.8/) uses "the poverty guidelines published during such taxable year" for the 48 contiguous states; the 2026 HHS Poverty Guidelines (Federal Register document 2026-00755, public-inspection.federalregister.gov/2026-00755.pdf): $15,960 for 1 person to $55,720 for 8, add $5,680 each, read 2026-11-21; ${LEG2026}`,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.va.subtractions',
    value: { militaryBasicPayMaximum: 15000, collegeSavingsPerAccount: 4000, collegeSavingsFullDeductionAge: 70 },
    basis: 'military_basic_pay_subtraction_up_to_15000_reduced_dollar_for_dollar_above_15000_and_commonwealth_savers_deduction_up_to_4000_per_account_or_all_of_it_at_age_70',
    ...year(y),
    act: 'Code of Virginia',
    section: '58.1-322.02(15); 58.1-322.03(4)',
    source: `${I760}: subtraction code 38 (up to $15,000 of military basic pay, reduced $1 for each $1 over $15,000) and deduction code 104 (lesser of $4,000 or the amount contributed to each Commonwealth Savers account, all of it if age 70 or older)${y === 2026 ? '; the Code amounts are not indexed' : ''}`,
    attestations: []
  })),
];
