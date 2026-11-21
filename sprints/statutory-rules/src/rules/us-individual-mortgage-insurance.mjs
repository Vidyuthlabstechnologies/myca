const D = 100;
const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const PHASE_OUT = { phaseOutStartCents: { other: 100000 * D, mfs: 50000 * D }, phaseOutStepCents: { other: 1000 * D, mfs: 500 * D }, reductionPerStepBasisPoints: 1000 };

export const RULES = [
  {
    id: 'us.federal.individual.mortgage-insurance-premiums',
    value: { deductible: false, ...PHASE_OUT },
    basis: 'qualified_mortgage_insurance_premiums_not_deductible_for_2025_schedule_a_line_8d_reserved',
    ...year(2025),
    act: 'IRC',
    section: '163(h)(3)(E)(iv)',
    source: 'IRC section 163(h)(3)(E)(iv): premiums paid or accrued after December 31, 2021 are not treated as qualified residence interest, and P.L. 119-21 section 70108 restores the treatment only for taxable years beginning after December 31, 2025. The 2025 Schedule A (created 11/20/25, irs.gov/pub/irs-pdf/f1040sa.pdf) shows line 8d as Reserved for future use, and the 2025 Instructions for Schedule A (irs.gov/pub/irs-pdf/i1040sca.pdf) say the same, both read on 2026-11-21',
    attestations: []
  },
  {
    id: 'us.federal.individual.mortgage-insurance-premiums',
    value: { deductible: true, ...PHASE_OUT },
    basis: 'qualified_mortgage_insurance_premiums_on_acquisition_debt_treated_as_mortgage_interest_reduced_10_percent_for_each_1000_or_fraction_of_agi_over_100000_500_over_50000_married_filing_separately',
    ...year(2026),
    act: 'IRC',
    section: '163(h)(3)(E)',
    source: 'IRC section 163(h)(3)(E)(i) and (ii) as made permanent by P.L. 119-21 section 70108 for taxable years beginning after December 31, 2025 (text of 163(h)(3)(E) read at law.cornell.edu/uscode/text/26/163 and the OBBBA 163(h) summary at sjsu.edu/people/annette.nellen/163h_OBBB_Changes.pdf on 2026-11-21): premiums for qualified mortgage insurance on acquisition debt are treated as interest, reduced (but not below zero) by 10 percent for each $1,000 ($500 married filing separately), or fraction thereof, that adjusted gross income exceeds $100,000 ($50,000 married filing separately); contracts issued before 2007 do not qualify. The 2026 draft Schedule A (created 5/12/26, irs.gov/pub/irs-dft/f1040sa--dft.pdf) has line 8d Mortgage insurance premiums, added into line 8e. Form 1098 box 5 reports the premiums. The 2026 Schedule A instructions were not yet published, so the line 8d worksheet could not be checked',
    attestations: []
  },
  {
    id: 'us.federal.individual.mortgage-insurance-premiums',
    value: { deductible: true, ...PHASE_OUT },
    basis: 'qualified_mortgage_insurance_premiums_on_acquisition_debt_treated_as_mortgage_interest_reduced_10_percent_for_each_1000_or_fraction_of_agi_over_100000_500_over_50000_married_filing_separately',
    ...year(2027),
    act: 'IRC',
    section: '163(h)(3)(E)',
    source: 'IRC section 163(h)(3)(E)(i) and (ii) as made permanent by P.L. 119-21 section 70108 for taxable years beginning after December 31, 2025 (read at law.cornell.edu/uscode/text/26/163 on 2026-11-21). The $100,000 and $50,000 thresholds and the $1,000 and $500 steps are fixed in the statute and not indexed for inflation, so the 2026 figures carry over; no 2027 Schedule A draft was published when checked',
    attestations: []
  }
];
