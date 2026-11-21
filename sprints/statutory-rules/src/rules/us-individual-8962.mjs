const D = 100;
const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const line = (firstPerson, eachAdditional) => ({ firstPersonCents: firstPerson * D, additionalPersonCents: eachAdditional * D });
const band = (fromPercent, toPercent, initialBasisPoints, finalBasisPoints) => ({ fromPercent, toPercent, initialBasisPoints, finalBasisPoints });
const READ_2025 = 'read from the 2025 Instructions for Form 8962, irs.gov/pub/irs-pdf/i8962.pdf, on 2026-11-21';
const READ_2026 = 'read from the 2026 draft Instructions for Form 8962 (early release, not for filing), irs.gov/pub/irs-dft/i8962--dft.pdf, and the 2026 draft Form 8962 created 4/21/26, on 2026-11-21';

export const RULES = [
  {
    id: 'us.federal.individual.ptc-poverty-line',
    value: { contiguous: line(15060, 5380), alaska: line(18810, 6730), hawaii: line(17310, 6190) },
    basis: 'federal_poverty_line_for_form_8962_line_4_by_family_size_first_person_plus_each_additional_person_with_separate_tables_for_alaska_and_hawaii',
    ...year(2025),
    act: 'IRC',
    section: '36B(d)(3)',
    source: `IRC section 36B(d)(3): the poverty line most recently published before the start of the open enrollment period, so 2025 coverage uses the 2024 HHS poverty guidelines. Tables 1-1, 1-2 and 1-3 of the instructions, ${READ_2025}: $15,060 for one person plus $5,380 for each additional person in the 48 contiguous states and DC, $18,810 plus $6,730 in Alaska, $17,310 plus $6,190 in Hawaii; every row of the three tables checked against first person plus additional persons`,
    attestations: []
  },
  {
    id: 'us.federal.individual.ptc-poverty-line',
    value: { contiguous: line(15650, 5500), alaska: line(19550, 6880), hawaii: line(17990, 6330) },
    basis: 'federal_poverty_line_for_form_8962_line_4_by_family_size_first_person_plus_each_additional_person_with_separate_tables_for_alaska_and_hawaii',
    ...year(2026),
    act: 'IRC',
    section: '36B(d)(3)',
    source: `IRC section 36B(d)(3): 2026 coverage uses the 2025 HHS poverty guidelines. Tables 1-1, 1-2 and 1-3, ${READ_2026}: $15,650 for one person plus $5,500 for each additional person in the 48 contiguous states and DC, $19,550 plus $6,880 in Alaska, $17,990 plus $6,330 in Hawaii; the final 2026 instructions were not yet published`,
    attestations: []
  },
  {
    id: 'us.federal.individual.ptc-poverty-line',
    value: { contiguous: line(15960, 5680), alaska: line(19950, 7100), hawaii: line(18360, 6530) },
    basis: 'federal_poverty_line_for_form_8962_line_4_by_family_size_first_person_plus_each_additional_person_with_separate_tables_for_alaska_and_hawaii',
    ...year(2027),
    act: 'IRC',
    section: '36B(d)(3)',
    source: 'IRC section 36B(d)(3): 2027 coverage uses the 2026 HHS poverty guidelines, 91 Fed. Reg. (15 January 2026) document 2026-00755, read from govinfo.gov/content/pkg/FR-2026-01-15/html/2026-00755.htm on 2026-11-21: $15,960 for one person plus $5,680 for each additional person in the 48 contiguous states and DC, $19,950 plus $7,100 in Alaska, $18,360 plus $6,530 in Hawaii. The 2027 Form 8962 instructions are not yet published',
    attestations: []
  },
  {
    id: 'us.federal.individual.ptc-applicable-figure',
    value: { bands: [band(0, 150, 0, 0), band(150, 200, 0, 200), band(200, 250, 200, 400), band(250, 300, 400, 600), band(300, 400, 600, 850), band(400, null, 850, 850)], incomeLimitPercent: null, belowPovertyLineLawfullyPresentAllowed: true },
    basis: 'applicable_percentage_rising_linearly_from_the_initial_to_the_final_percentage_within_each_household_income_band_rounded_to_four_decimals_on_the_whole_percent_from_form_8962_line_5_with_no_income_limit',
    ...year(2025),
    act: 'IRC',
    section: '36B(b)(3)(A)(iii)',
    source: `IRC section 36B(b)(3)(A)(iii) as added by the American Rescue Plan Act section 9661 and extended through 2025 by the Inflation Reduction Act section 12001; Rev. Proc. 2024-35 section 2.01, irs.gov/pub/irs-drop/rp-24-35.pdf (0.00% below 150%, 0.00% to 2.00% from 150% to 200%, 2.00% to 4.00% to 250%, 4.00% to 6.00% to 300%, 6.00% to 8.50% to 400%, 8.50% at 400% and above). Table 2 of the instructions, ${READ_2025}; every row of Table 2 reproduced by interpolating within the band and rounding to four decimals. Lawfully present aliens ineligible for Medicaid by immigration status may take the credit below 100% of the poverty line`,
    attestations: []
  },
  {
    id: 'us.federal.individual.ptc-applicable-figure',
    value: { bands: [band(0, 133, 210, 210), band(133, 150, 314, 419), band(150, 200, 419, 660), band(200, 250, 660, 844), band(250, 300, 844, 996), band(300, 400, 996, 996)], incomeLimitPercent: 400, belowPovertyLineLawfullyPresentAllowed: false },
    basis: 'applicable_percentage_rising_linearly_from_the_initial_to_the_final_percentage_within_each_household_income_band_rounded_to_four_decimals_on_the_whole_percent_from_form_8962_line_5_no_credit_above_the_income_limit',
    ...year(2026),
    act: 'IRC',
    section: '36B(b)(3)(A)(i); 36B(c)(1)(A)',
    source: `IRC section 36B(b)(3)(A)(i) indexed for 2026 by Rev. Proc. 2025-25 section 3.01, irs.gov/pub/irs-drop/rp-25-25.pdf (2.10% below 133%, 3.14% to 4.19% from 133% to 150%, 4.19% to 6.60% to 200%, 6.60% to 8.44% to 250%, 8.44% to 9.96% to 300%, 9.96% from 300% to 400%). The ARPA/IRA enhancement in section 36B(b)(3)(A)(iii) ended after 2025: H.R. 1834 (three-year extension) passed the House on 2026-01-08 and has had no Senate vote, so no extension is law as of 2026-11-21. No credit above 400% of the poverty line (section 36B(c)(1)(A)). Table 2 and the line 6 question, ${READ_2026}; every row of Table 2 reproduced by interpolating within the band and rounding to four decimals. From 2026 the lawfully present alien exception below 100% no longer applies (Public Law 119-21 section 71302 struck section 36B(c)(1)(B) for taxable years beginning after 2025)`,
    attestations: []
  },
  {
    id: 'us.federal.individual.ptc-applicable-figure',
    value: { bands: [band(0, 133, 215, 215), band(133, 150, 323, 430), band(150, 200, 430, 678), band(200, 250, 678, 866), band(250, 300, 866, 1022), band(300, 400, 1022, 1022)], incomeLimitPercent: 400, belowPovertyLineLawfullyPresentAllowed: false },
    basis: 'applicable_percentage_rising_linearly_from_the_initial_to_the_final_percentage_within_each_household_income_band_rounded_to_four_decimals_on_the_whole_percent_from_form_8962_line_5_no_credit_above_the_income_limit',
    ...year(2027),
    act: 'IRC',
    section: '36B(b)(3)(A)(i); 36B(c)(1)(A)',
    source: 'IRC section 36B(b)(3)(A)(i) indexed for 2027 by Rev. Proc. 2026-26 section 3.01, read from irs.gov/pub/irs-drop/rp-26-26.pdf on 2026-11-21 (2.15% below 133%, 3.23% to 4.3% from 133% to 150%, 4.3% to 6.78% to 200%, 6.78% to 8.66% to 250%, 8.66% to 10.22% to 300%, 10.22% from 300% to 400%); no credit above 400%. The 2027 Form 8962 Table 2 is not yet published, so the rows follow the same interpolation and rounding as the 2025 and 2026 tables',
    attestations: []
  },
  {
    id: 'us.federal.individual.ptc-repayment-limit',
    value: { capped: true, bands: [{ belowPercent: 200, singleCents: 375 * D, otherCents: 750 * D }, { belowPercent: 300, singleCents: 975 * D, otherCents: 1950 * D }, { belowPercent: 400, singleCents: 1625 * D, otherCents: 3250 * D }] },
    basis: 'limit_on_repaying_excess_advance_premium_tax_credit_by_household_income_percent_of_poverty_line_single_filing_status_or_any_other_no_limit_at_400_percent_or_more',
    ...year(2025),
    act: 'IRC',
    section: '36B(f)(2)(B)',
    source: `IRC section 36B(f)(2)(B) as indexed for 2025 by Rev. Proc. 2024-40 section 3.07, irs.gov/pub/irs-drop/rp-24-40.pdf (the "unmarried" column excludes surviving spouses and heads of household): $375/$750 below 200%, $975/$1,950 from 200% to under 300%, $1,625/$3,250 from 300% to under 400%, no limit at 400% or more. Table 5 of the instructions, ${READ_2025}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.ptc-repayment-limit',
    value: { capped: false, bands: [] },
    basis: 'limit_on_repaying_excess_advance_premium_tax_credit_by_household_income_percent_of_poverty_line_single_filing_status_or_any_other_no_limit_at_400_percent_or_more',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    act: 'Public Law 119-21',
    section: '71305',
    source: `Public Law 119-21 section 71305 struck IRC section 36B(f)(2)(B) for taxable years beginning after 31 December 2025 (text read from govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm on 2026-11-21): the whole excess advance payment is repaid. The 2026 draft Form 8962 reserves lines 28 and 29 and carries line 27 to Schedule 2 line 1a, ${READ_2026}`,
    attestations: []
  }
];
