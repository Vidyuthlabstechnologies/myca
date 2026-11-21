const D = 100;
const READ_ON = '2026-11-21';

const RESIDENTIAL_EVEN_LATE = [3637, 3637, 3637, 3637, 3637, 3637, 3636, 3636, 3636, 3636, 3636, 3636];
const RESIDENTIAL_ODD_LATE = [3636, 3636, 3636, 3636, 3636, 3636, 3637, 3637, 3637, 3637, 3637, 3637];
const residentialLateRows = () => Array.from({ length: 18 }, (_, index) => {
  const recoveryYear = 10 + index;
  return { fromYear: recoveryYear, toYear: recoveryYear, rates: recoveryYear % 2 === 0 ? RESIDENTIAL_EVEN_LATE : RESIDENTIAL_ODD_LATE };
});

export const RULES = [
  {
    id: 'us.federal.individual.passive-loss-special-allowance',
    value: {
      maxCents: 25000 * D,
      mfsLivedApartMaxCents: 12500 * D,
      phaseOutEndCents: 150000 * D,
      mfsLivedApartPhaseOutEndCents: 75000 * D,
      phaseOutBasisPoints: 5000,
      mfsLivedTogetherAllowed: false,
    },
    basis: 'special_allowance_for_rental_real_estate_losses_with_active_participation_reduced_by_half_of_modified_agi_over_the_start_mfs_living_apart_halved_mfs_living_together_none',
    effectiveFrom: '1987-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '469(i)',
    source: `IRC section 469(i)(2), (3)(A) and (5): up to twenty-five thousand dollars (twelve thousand five hundred for a separate return living apart all year, none for a separate return living together at any time), reduced by fifty per cent of modified AGI above one hundred thousand dollars (fifty thousand separate); not indexed and not changed by Public Law 119-21. Read from the 2025 Form 8582 lines 4 to 9 and its instructions (Special Allowance for Rental Real Estate Activities; Line 5; Line 6; Line 8), irs.gov/pub/irs-pdf/f8582.pdf and irs.gov/pub/irs-pdf/i8582.pdf, on ${READ_ON}. The 2026 Form 8582 was not yet published when read; the statute is unchanged`,
    attestations: []
  },
  {
    id: 'us.federal.individual.dwelling-unit-personal-use',
    value: { personalUseDays: 14, personalUseBasisPoints: 1000, minimalRentalDays: 15 },
    basis: 'dwelling_unit_used_as_a_home_when_personal_use_days_exceed_the_greater_of_fourteen_days_or_ten_percent_of_fair_rental_days_rented_fewer_than_fifteen_days_is_not_reported',
    effectiveFrom: '1976-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '280A(d)(1); 280A(g)',
    source: `IRC section 280A(d)(1) (used as a residence if personal use exceeds the greater of fourteen days or ten per cent of the days rented at a fair rental) and 280A(g) (rented fewer than fifteen days: income not included, no rental deduction). Read from the 2025 Instructions for Schedule E (Form 1040), Line 1b and Line 2, irs.gov/pub/irs-pdf/i1040se.pdf, and Pub. 527 (2025), irs.gov/pub/irs-pdf/p527.pdf, on ${READ_ON}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.macrs-real-property',
    value: {
      ratesPer: 100000,
      residential: {
        recoveryPeriod: '27.5',
        convention: 'mid-month',
        method: 'straight-line',
        placedInServiceFrom: '1987-01-01',
        form4562Line: '19i',
        table: 'A-6',
        rows: [
          { fromYear: 1, toYear: 1, rates: [3485, 3182, 2879, 2576, 2273, 1970, 1667, 1364, 1061, 758, 455, 152] },
          { fromYear: 2, toYear: 9, rates: [3636, 3636, 3636, 3636, 3636, 3636, 3636, 3636, 3636, 3636, 3636, 3636] },
          ...residentialLateRows(),
          { fromYear: 28, toYear: 28, rates: [1970, 2273, 2576, 2879, 3182, 3485, 3636, 3636, 3636, 3636, 3636, 3636] },
          { fromYear: 29, toYear: 29, rates: [0, 0, 0, 0, 0, 0, 152, 455, 758, 1061, 1364, 1667] },
        ],
      },
      nonresidential: {
        recoveryPeriod: '39',
        convention: 'mid-month',
        method: 'straight-line',
        placedInServiceFrom: '1993-05-13',
        form4562Line: '19j',
        table: 'A-7a',
        rows: [
          { fromYear: 1, toYear: 1, rates: [2461, 2247, 2033, 1819, 1605, 1391, 1177, 963, 749, 535, 321, 107] },
          { fromYear: 2, toYear: 39, rates: [2564, 2564, 2564, 2564, 2564, 2564, 2564, 2564, 2564, 2564, 2564, 2564] },
          { fromYear: 40, toYear: 40, rates: [107, 321, 535, 749, 963, 1177, 1391, 1605, 1819, 2033, 2247, 2461] },
        ],
      },
    },
    basis: 'macrs_general_depreciation_system_straight_line_mid_month_percentages_of_unadjusted_basis_by_recovery_year_and_month_placed_in_service_residential_rental_27_5_years_nonresidential_real_39_years_rates_in_thousandths_of_a_percent',
    effectiveFrom: '2025-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '168(b)(3); 168(c); 168(d)(2)',
    source: `IRC section 168(b)(3) straight line, 168(c) recovery periods of 27.5 years (residential rental) and 39 years (nonresidential real property placed in service after 12 May 1993) and 168(d)(2) mid-month convention. Percentages copied from Pub. 946 (2025) Appendix A, Table A-6 and Table A-7a, irs.gov/pub/irs-pdf/p946.pdf, read on ${READ_ON}; each month column was checked to total 100.000 per cent. The tables come from Rev. Proc. 87-57 and are not changed by Public Law 119-21`,
    attestations: []
  },
];
