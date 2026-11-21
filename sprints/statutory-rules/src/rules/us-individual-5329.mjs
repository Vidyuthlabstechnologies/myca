const D = 100;
const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const READ_2025 = 'read from the 2025 Form 5329 (created 6/12/25), irs.gov/pub/irs-prior/f5329--2025.pdf, and the 2025 Instructions for Form 5329, irs.gov/pub/irs-prior/i5329--2025.pdf, on 2026-11-21';
const READ_2026 = 'read from the 2026 Form 5329 (created 11/12/26), irs.gov/pub/irs-pdf/f5329.pdf, and the 2026 draft Instructions for Form 5329, irs.gov/pub/irs-dft/i5329--dft.pdf, on 2026-11-21';
const RATES = { simpleEarlyBasisPoints: 2500, excessContributionBasisPoints: 600, excessAccumulationBasisPoints: 2500, excessAccumulationCorrectedBasisPoints: 1000 };
const CODES_2025 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '99'];
const IRA_ONLY = ['07', '08', '09'];
const NOT_IRA = ['01', '06'];

export const RULES = [
  {
    id: 'us.federal.individual.form-5329-rates',
    value: RATES,
    basis: 'additional_tax_rates_as_basis_points_25_percent_on_a_simple_ira_early_distribution_within_two_years_6_percent_on_ira_excess_contributions_25_percent_on_an_rmd_shortfall_or_10_percent_when_corrected_in_the_correction_window',
    ...year(2025),
    act: 'IRC',
    section: '72(t)(6); 4973(a); 4974(a); 4974(e)',
    source: `IRC section 72(t)(6) (25 percent instead of 10 percent on a SIMPLE IRA distribution in the 2-year period after first participation, 1099-R box 7 code S), section 4973(a) (6 percent of the excess contributions, not more than 6 percent of the account value at year end), section 4974(a) (25 percent of the RMD shortfall, as amended by the SECURE 2.0 Act section 302) and section 4974(e) (10 percent when corrected during the correction window). Form 5329 lines 4, 17, 25, 54a and 54b, ${READ_2025}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.form-5329-rates',
    value: RATES,
    basis: 'additional_tax_rates_as_basis_points_25_percent_on_a_simple_ira_early_distribution_within_two_years_6_percent_on_ira_excess_contributions_25_percent_on_an_rmd_shortfall_or_10_percent_when_corrected_in_the_correction_window',
    ...year(2026),
    act: 'IRC',
    section: '72(t)(6); 4973(a); 4974(a); 4974(e)',
    source: `IRC sections 72(t)(6), 4973(a), 4974(a) and 4974(e), not indexed and unchanged by Public Law 119-21. Form 5329 lines 4, 17, 25, 54a and 54b keep their 2025 numbers and rates, ${READ_2026}; on the 2026 Schedule 2 line 4 goes to line 5 and the excess taxes to line 18`,
    attestations: []
  },
  {
    id: 'us.federal.individual.early-distribution-exceptions',
    value: { codes: CODES_2025, iraOnly: IRA_ONLY, notIra: NOT_IRA, caps: { '09': 10000 * D, '19': 5000 * D, '22': 10300 * D, '23': 1000 * D }, domesticAbuseAccountBasisPoints: 5000, qualifiedDisasterMaxCents: 22000 * D },
    basis: 'form_5329_line_2_exception_numbers_with_dollar_caps_per_person_first_home_lifetime_birth_or_adoption_per_child_domestic_abuse_indexed_emergency_per_year_and_the_qualified_disaster_recovery_distribution_limit',
    ...year(2025),
    act: 'IRC',
    section: '72(t)(2); 72(t)(8); 72(t)(11)',
    source: `Exception numbers 01 to 23 and 99 (more than one exception), instructions for line 2, ${READ_2025}. Caps: 09 first home $10,000 lifetime (section 72(t)(8)(B)); 19 qualified birth or adoption $5,000 per child (section 72(t)(2)(H)(ii)); 22 domestic abuse victims the lesser of $10,300 or 50 percent of the vested account (section 72(t)(2)(K)(ii)(I), Notice 2024-80, irs.gov/pub/irs-drop/n-24-80.pdf, read on 2026-11-21: increased from $10,000 to $10,300); 23 emergency personal expense $1,000 a year (section 72(t)(2)(I)(ii)). Codes 07, 08 and 09 apply only to IRAs, 01 and 06 not to IRAs (the instructions' wording). Qualified disaster recovery distributions are left out of line 1, up to $22,000 per disaster (section 72(t)(11)(B)(i))`,
    attestations: []
  },
  {
    id: 'us.federal.individual.early-distribution-exceptions',
    value: { codes: [...CODES_2025.slice(0, -1), '24', '99'], iraOnly: IRA_ONLY, notIra: NOT_IRA, caps: { '09': 10000 * D, '19': 5000 * D, '22': 10500 * D, '23': 1000 * D, '24': 2600 * D }, domesticAbuseAccountBasisPoints: 5000, qualifiedDisasterMaxCents: 22000 * D },
    basis: 'form_5329_line_2_exception_numbers_with_dollar_caps_per_person_first_home_lifetime_birth_or_adoption_per_child_domestic_abuse_indexed_emergency_per_year_long_term_care_and_the_qualified_disaster_recovery_distribution_limit',
    ...year(2026),
    act: 'IRC',
    section: '72(t)(2); 72(t)(8); 72(t)(11); 401(a)(39)',
    source: `Exception numbers 01 to 24 and 99, instructions for line 2, ${READ_2026}: 24 (qualified long-term care distributions) is new for 2026. Caps as for 2025 except 22 domestic abuse $10,500 (Notice 2025-67, irs.gov/pub/irs-drop/n-25-67.pdf, read on 2026-11-21: increased from $10,300 to $10,500) and 24 long-term care $2,600 (section 401(a)(39)(B)(i)(III) as added by the SECURE 2.0 Act section 334, Notice 2025-67: remains $2,600). The 2026 instructions are a draft, not for filing`,
    attestations: []
  },
  {
    id: 'us.federal.individual.form-5329-rates',
    value: RATES,
    basis: 'additional_tax_rates_as_basis_points_25_percent_on_a_simple_ira_early_distribution_within_two_years_6_percent_on_ira_excess_contributions_25_percent_on_an_rmd_shortfall_or_10_percent_when_corrected_in_the_correction_window',
    ...year(2027),
    act: 'IRC',
    section: '72(t)(6); 4973(a); 4974(a); 4974(e)',
    source: 'IRC sections 72(t)(6), 4973(a), 4974(a) and 4974(e): fixed rates in the statute, not indexed, and no amendment for 2027 as of 2026-11-21. The 2027 Form 5329 is not yet published',
    attestations: []
  },
  {
    id: 'us.federal.individual.early-distribution-exceptions',
    value: { codes: [...CODES_2025.slice(0, -1), '24', '99'], iraOnly: IRA_ONLY, notIra: NOT_IRA, caps: { '09': 10000 * D, '19': 5000 * D, '22': 10900 * D, '23': 1000 * D, '24': 2700 * D }, domesticAbuseAccountBasisPoints: 5000, qualifiedDisasterMaxCents: 22000 * D },
    basis: 'form_5329_line_2_exception_numbers_with_dollar_caps_per_person_first_home_lifetime_birth_or_adoption_per_child_domestic_abuse_indexed_emergency_per_year_long_term_care_and_the_qualified_disaster_recovery_distribution_limit',
    ...year(2027),
    act: 'IRC',
    section: '72(t)(2); 72(t)(8); 72(t)(11); 401(a)(39)',
    source: 'Indexed caps from Notice 2026-66, irs.gov/pub/irs-drop/n-26-66.pdf, read on 2026-11-21: domestic abuse (section 72(t)(2)(K)(ii)(I)) increased from $10,500 to $10,900; long-term care (section 401(a)(39)(B)(i)(III)) increased from $2,600 to $2,700. The fixed caps ($10,000 first home, $5,000 birth or adoption, $1,000 emergency, $22,000 qualified disaster) are in the statute. The exception numbers are the 2026 list (01 to 24 and 99): the 2027 Form 5329 instructions are not yet published',
    attestations: []
  }
];
