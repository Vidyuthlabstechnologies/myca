const D = 100;
const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });
const band = (upTo, basisPoints) => ({ upToCents: upTo * D, basisPoints });
const rates = (mfj, hoh, other) => ({ mfj: [band(mfj[0], 5000), band(mfj[1], 2000), band(mfj[2], 1000)], hoh: [band(hoh[0], 5000), band(hoh[1], 2000), band(hoh[2], 1000)], other: [band(other[0], 5000), band(other[1], 2000), band(other[2], 1000)] });
const SAVERS_2027 = 'From 2027 SECURE 2.0 Act section 103 replaces the credit for IRA and plan contributions with the saver\'s match deposited into the account; the 2025 and 2026 Form 8880 instructions say Form 8880 will then be used only for ABLE account contributions, so no 2027 record is kept here';
const READ_5695 = 'read from the 2025 Form 5695 (created 3/20/25), irs.gov/pub/irs-pdf/f5695.pdf, and the 2025 Instructions for Form 5695 (Jan 22, 2026), irs.gov/pub/irs-pdf/i5695.pdf, on 2026-11-21';
const READ_5695_2026 = 'read from the 2026 draft Form 5695 "Carryforward of Residential Energy Credit" (created 4/1/26, not for filing), irs.gov/pub/irs-dft/f5695--dft.pdf, its draft instructions (Aug 27, 2026), irs.gov/pub/irs-dft/i5695--dft.pdf, and the 2026 draft Schedule 3, irs.gov/pub/irs-dft/f1040s3--dft.pdf, on 2026-11-21';

export const RULES = [
  {
    id: 'us.federal.individual.savers-credit',
    value: { contributionCapCents: 2000 * D, minimumAge: 18, rates: rates([47500, 51000, 79000], [35625, 38250, 59250], [23750, 25500, 39500]) },
    basis: 'retirement_savings_contributions_credit_rate_by_agi_band_and_filing_status_on_up_to_the_cap_per_person_of_contributions_less_testing_period_distributions',
    ...year(2025),
    act: 'IRC',
    section: '25B',
    source: `IRC section 25B(a) and (b): 50%, 20% or 10% of up to $2,000 a person; AGI limits for 2025 under section 25B(b)(1)(A) to (D) as adjusted by Notice 2024-80, irs.gov/pub/irs-drop/n-24-80.pdf (joint $47,500 / $51,000 / $79,000; head of household $35,625 / $38,250 / $59,250; all others $23,750 / $25,500 / $39,500). Checked against the line 9 table, the $2,000 on line 6 and the "born after January 1, 2008" age test of the 2025 Form 8880 (created 11/4/25), irs.gov/pub/irs-prior/f8880--2025.pdf, on 2026-11-21. Dependents and full-time students excluded by section 25B(c). ${SAVERS_2027}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.savers-credit',
    value: { contributionCapCents: 2000 * D, minimumAge: 18, rates: rates([48500, 52500, 80500], [36375, 39375, 60375], [24250, 26250, 40250]) },
    basis: 'retirement_savings_contributions_credit_rate_by_agi_band_and_filing_status_on_up_to_the_cap_per_person_of_contributions_less_testing_period_distributions',
    ...year(2026),
    act: 'IRC',
    section: '25B',
    source: `IRC section 25B(a) and (b); AGI limits for 2026 as adjusted by Notice 2025-67, irs.gov/pub/irs-drop/n-25-67.pdf, and IRS news release IR-2025-111 (joint $48,500 / $52,500 / $80,500; head of household $36,375 / $39,375 / $60,375; all others $24,250 / $26,250 / $40,250). Checked against the line 9 table and the "born after January 1, 2009" age test of the 2026 Form 8880 (created 3/16/26), irs.gov/pub/irs-pdf/f8880.pdf, on 2026-11-21. The saver's credit AGI limits are published in the retirement plan cost-of-living notice, not in Rev. Proc. 2025-32. ${SAVERS_2027}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.residential-clean-energy',
    value: { newExpenditures: true, creditBasisPoints: 3000, fuelCellPerKilowattCents: 1000 * D, fuelCellMinimumKilowatts: 0.5, batteryMinimumKilowattHours: 3 },
    basis: 'residential_clean_energy_credit_percent_of_costs_with_fuel_cell_limit_per_kilowatt_and_carryforward_of_the_unused_credit',
    ...year(2025),
    act: 'IRC',
    section: '25D',
    source: `IRC section 25D(a) and (g): 30% for property placed in service 2022 to 2025; section 25D(b)(1): fuel cell credit at most $500 for each half kilowatt of capacity (Form 5695 line 10: kW in half-kW steps times $1,000, nothing below 0.5 kW); section 25D(d)(6): battery storage of at least 3 kilowatt hours (line 5a); section 25D(c): the unused credit carries forward (lines 12 and 16). Public Law 119-21 section 70506 moved the termination in section 25D(h): no credit for expenditures made after 2025-12-31, an expenditure being made when installation is completed (section 25D(e)(8); IRS FAQs on Public Law 119-21, irs.gov/EnergyCreditFAQs, Q1 and Q7). Schedule 3 line 5a. ${READ_5695}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.residential-clean-energy',
    value: { newExpenditures: false, creditBasisPoints: 0, carryforwardAllowed: true },
    basis: 'residential_clean_energy_credit_ended_for_expenditures_after_2025_only_the_carryforward_of_an_earlier_unused_credit_can_be_claimed',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '25D(c), 25D(h)',
    source: `Public Law 119-21 section 70506 (section 25D(h)): no credit for expenditures made after 2025-12-31. Section 25D(c) (carryforward) was not changed, so an unused credit from 2025 is still claimed and the remainder carried on (Congressional Research Service Insight IN12611). The 2026 Form 5695 has only four lines: carryforward from 2025 line 16, the limit from the Residential Clean Energy Credit Limit Worksheet, the credit (to Schedule 3 line 5a) and the carryforward to 2027; the 2026 Schedule 3 has no line 5b. ${READ_5695_2026}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.energy-home-improvement',
    value: { allowed: true, creditBasisPoints: 3000, annualCapCents: 1200 * D, doorEachCapCents: 250 * D, doorsCapCents: 500 * D, windowsCapCents: 600 * D, propertyItemCapCents: 600 * D, auditCapCents: 150 * D, heatPumpCapCents: 2000 * D, qmidRequired: true },
    basis: 'energy_efficient_home_improvement_credit_percent_of_costs_with_annual_cap_item_caps_and_separate_heat_pump_and_biomass_cap',
    ...year(2025),
    act: 'IRC',
    section: '25C',
    source: `IRC section 25C(a) and (b) as amended by the Inflation Reduction Act section 13301: 30% of costs, at most $1,200 a year, within it $250 a door and $500 for all doors, $600 for windows and skylights, $600 for each item of energy property (central air conditioner, gas, propane or oil water heater, furnace or boiler, and panelboard or circuit improvements) and $150 for a home energy audit, plus a separate $2,000 a year for heat pumps, heat pump water heaters and biomass stoves and boilers. Section 25C(h): from 2025 a qualified manufacturer identification number (QMID) for each item of specified property. Public Law 119-21 section 70505 moved the termination date in section 25C(g): no credit for property placed in service after 2025-12-31 (IRS FAQs on Public Law 119-21, irs.gov/EnergyCreditFAQs, Q1). Lines 18 to 32 and Schedule 3 line 5b. ${READ_5695}`,
    attestations: []
  },
  {
    id: 'us.federal.individual.energy-home-improvement',
    value: { allowed: false, qmidRequired: true },
    basis: 'energy_efficient_home_improvement_credit_ended_for_property_placed_in_service_after_2025_with_no_carryforward',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    act: 'IRC',
    section: '25C(g)',
    source: `Public Law 119-21 section 70505 (termination date in section 25C(g)): no credit for property placed in service after 2025-12-31. Section 25C has no carryforward, so nothing remains for 2026. ${READ_5695_2026}`,
    attestations: []
  }
];
