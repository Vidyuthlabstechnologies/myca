const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const INSTR_2025 = 'Arizona Department of Revenue, 2025 Form 140 Resident Personal Income Tax Return and instructions (azdor.gov/sites/default/files/document/FORMS_INDIVIDUAL_2025_140_f.pdf and FORMS_INDIVIDUAL_2025_140i.pdf), 2025 Form 140PY instructions (FORMS_INDIVIDUAL_2025_140PYi.pdf) and 2025 Form 140NR booklet (FORMS_INDIVIDUAL_2025_140NRBooklet.pdf), read 2026-11-21';
const PROVISIONAL_2026 = 'Arizona has not published the 2026 Form 140 instructions as of 2026-11-21 and its 2026 conformity to the federal standard deduction and the indexed credit and exemption amounts was not enacted in a form MyCA could confirm (H.B. 2785 and S.B. 1106 of the 2026 session were read only as bill summaries on azleg.gov, read 2026-11-21); the 2025 figures are carried and the record is marked provisional until the Department publishes the 2026 instructions';

export const RULES = [
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.az.income-tax',
    value: { rateBasisPoints: 250 },
    basis: 'flat_rate_on_arizona_taxable_income',
    ...year(y),
    act: 'Arizona Revised Statutes Title 43',
    section: '43-1011',
    source: y === 2025 ? `${INSTR_2025}: Form 140 line 46 "Multiply line 45 by 2.5% (.025)"` : 'A.R.S. 43-1011 sets 2.5 percent for taxable years beginning from and after December 31, 2022 with no later change enacted; the statute text was not re-read for this record, the 2025 Form 140 line 46 rate (read 2026-11-21) is the same rate',
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.az.deductions',
    value: { standardDeduction: { single: 15750, mfj: 31500, mfs: 15750, hoh: 23625, qss: 23625 }, charitableIncreaseBasisPoints: 3400, saltLimit: { mfs: 20000, other: 40000 }, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'arizona_standard_deduction_by_filing_status_qualifying_surviving_spouse_files_as_head_of_household_standard_deduction_increased_by_34_percent_of_charitable_contributions_itemized_deductions_follow_federal_schedule_a_with_the_arizona_salt_limit',
    ...year(y),
    act: 'Arizona Revised Statutes Title 43',
    section: '43-1041; 43-1042',
    source: y === 2025 ? `${INSTR_2025}: line 43 standard deduction $15,750 single and married filing separate, $31,500 married filing joint, $23,625 head of household; box 5 head of household includes a federal qualifying widow or widower; line 44 "increase the allowable standard deduction amount equal to 34% (.34)"; 2025 Form 140 Schedule A (FORMS_INDIVIDUAL_2025_140SCHA_f.pdf) worksheet line 4A "Limit from federal Schedule A. Enter $40,000 ($20,000 if married filing separate)"` : PROVISIONAL_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.az.exemptions',
    value: { age65: 2100, blind: 1500, other: 2300, qualifyingParent: 10000, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'arizona_exemptions_2100_age_65_1500_blind_2300_other_exemption_10000_qualifying_parent_or_grandparent',
    ...year(y),
    act: 'Arizona Revised Statutes Title 43',
    section: '43-1023',
    source: y === 2025 ? `${INSTR_2025}: Form 140 line 38 "Multiply the number in box 8 by $2,100", line 39 "by $1,500", line 40 "by $2,300", line 41 "Multiply the number in box 11a by $10,000"` : PROVISIONAL_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.az.subtractions',
    value: { publicPensionPerPerson: 2500, longTermGainBasisPoints: 2500, college529PerBeneficiary: { mfj: 4000, other: 2000 }, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'arizona_subtractions_public_pension_up_to_2500_each_25_percent_of_net_long_term_gain_on_assets_acquired_after_2011_529_and_able_contributions_up_to_2000_per_beneficiary_4000_joint',
    ...year(y),
    act: 'Arizona Revised Statutes Title 43',
    section: '43-1022',
    source: y === 2025 ? `${INSTR_2025}: line 29a "subtract the amount you received or $2,500, whichever is less", line 24 "Multiply line 23 by 25% (.25)", line 34a and 34b "up to a total of $2,000 per beneficiary ($4,000 for a married couple filing a joint return)"` : PROVISIONAL_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.az.credits',
    value: {
      dependent: { under17: 100, other: 25, agiLimit: { mfj: 400000, other: 200000 }, stepDollars: 1000, stepBasisPoints: 500 },
      family: { perPerson: 40, cap: { mfj: 240, hoh: 240, other: 120 }, extraPeople: { mfj: 2, other: 1 }, maxIncome: { mfj: [20000, 20000, 23600, 27300, 31000], hoh: [20000, 20000, 20135, 23800, 25200, 26575], other: [10000] } },
      excise: { perPerson: 25, maximum: 100, agiLimit: { mfj: 25000, hoh: 25000, other: 12500 } },
      ...(y === 2026 ? { provisional: true } : {})
    },
    basis: 'dependent_credit_100_under_17_25_otherwise_reduced_5_percent_per_1000_of_federal_agi_over_the_limit_family_income_credit_40_per_person_capped_by_status_with_income_limits_by_dependents_increased_excise_tax_credit_25_per_person_up_to_100',
    ...year(y),
    act: 'Arizona Revised Statutes Title 43',
    section: '43-1073; 43-1073.01; 43-1074.01',
    source: y === 2025 ? `${INSTR_2025}: line 49 Dependent Tax Credit ($100 under 17, $25 at least 17, reduced above federal AGI $200,000 or $400,000 joint, Table V .95 for $1 to $1,000 over down to .00 for $19,001 and over); line 50 Family Income Tax Credit worksheet (Table I joint maximum income $20,000 for 0 or 1, $23,600 for 2, $27,300 for 3, $31,000 for 4 or more; Table II head of household $20,000, $20,135, $23,800, $25,200, $26,575 for 5 or more; Table III single or separate $10,000; $40 per person; $240 joint or head of household, $120 otherwise); line 56 Increased Excise Tax Credit ($25 per person, $100 maximum, federal AGI $25,000 joint or head of household, $12,500 single or separate)` : PROVISIONAL_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.az.donation-credits',
    value: { qualifyingCharity: { single: 495, mfj: 987, mfs: 493 }, fosterCare: { single: 618, mfj: 1234, mfs: 617 }, publicSchool: { single: 200, mfj: 400, mfs: 200 }, privateSchoolTuition: { single: 769, mfj: 1535, mfs: 767 }, ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'arizona_nonrefundable_credits_for_cash_contributions_capped_per_return_married_filing_separately_takes_half_of_the_joint_maximum_rounded_down',
    ...year(y),
    act: 'Arizona Revised Statutes Title 43',
    section: '43-1088; 43-1089; 43-1089.01',
    source: y === 2025 ? 'Arizona Department of Revenue 2025 credit form instructions read 2026-11-21: Form 321 (FORMS_CREDIT_2025_321_i.pdf) "$495 for single taxpayers or heads of household ... $987" joint; Form 352 (FORMS_CREDIT_2025_352_i.pdf) $618 and "$1,234"; Form 322 (FORMS_CREDIT_2025_322_i.pdf) "$200 for single taxpayers or heads of household ... $400"; Form 323 (FORMS_CREDIT_2025_323_i.pdf) "$769 for single taxpayers or heads of household ... $1,535"; married filing separately "one-half (1/2) of the credit that would have been allowed on a joint return", entered here as half the joint maximum rounded down' : PROVISIONAL_2026,
    attestations: []
  })),
  ...[2025, 2026].map((y) => ({
    id: 'us.state-return.az.other-state-credit',
    value: { qualifyingStates: ['AL', 'AR', 'CO', 'CT', 'DE', 'DC', 'GA', 'HI', 'ID', 'IL', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'PA', 'RI', 'SC', 'UT', 'VT', 'WV', 'WI'], ...(y === 2026 ? { provisional: true } : {}) },
    basis: 'arizona_residents_get_a_credit_only_for_nonresident_returns_filed_with_listed_states_the_credit_is_the_smaller_of_the_other_state_tax_and_the_arizona_tax_times_double_taxed_income_over_arizona_income',
    ...year(y),
    act: 'Arizona Revised Statutes Title 43',
    section: '43-1071',
    source: y === 2025 ? 'Arizona Department of Revenue, 2025 Form 309 and instructions (azdor.gov/sites/default/files/document/FORMS_CREDIT_2025_309_f.pdf and FORMS_CREDIT_2025_309_i.pdf), read 2026-11-21: "As an Arizona resident, nonresident returns filed with the following states qualify for the credit" (list as entered), California, Indiana, Oregon and Virginia do not qualify; line 9 is Arizona adjusted gross income excluding the exemptions for age 65, blind, dependents and qualifying parents; the ratio is to four places and not over 1.0000' : PROVISIONAL_2026,
    attestations: []
  }))
];
