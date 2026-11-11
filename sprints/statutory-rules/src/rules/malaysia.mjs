const SEN = 1;
const RINGGIT = 100 * SEN;
const CHECKED = 'read on 2026-11-11 for the MyCA Malaysia pack; secondary summary, not the gazetted text; needs attestation by a Malaysian chartered accountant or licensed tax agent before any filing relies on it';
const YA_LOOKUP = 'Looked up by 31 December of the year of assessment (the calendar year whose income is taxed)';

function record(id, value, basis, effectiveFrom, effectiveTo, act, section, source) {
  return { id, value, basis, effectiveFrom, effectiveTo, act, section, source: `${source} (${CHECKED})`, attestations: [] };
}

const RESIDENT_BANDS = [
  { fromSen: 0, toSen: 5000 * RINGGIT, basisPoints: 0 },
  { fromSen: 5000 * RINGGIT, toSen: 20000 * RINGGIT, basisPoints: 100 },
  { fromSen: 20000 * RINGGIT, toSen: 35000 * RINGGIT, basisPoints: 300 },
  { fromSen: 35000 * RINGGIT, toSen: 50000 * RINGGIT, basisPoints: 600 },
  { fromSen: 50000 * RINGGIT, toSen: 70000 * RINGGIT, basisPoints: 1100 },
  { fromSen: 70000 * RINGGIT, toSen: 100000 * RINGGIT, basisPoints: 1900 },
  { fromSen: 100000 * RINGGIT, toSen: 400000 * RINGGIT, basisPoints: 2500 },
  { fromSen: 400000 * RINGGIT, toSen: 600000 * RINGGIT, basisPoints: 2600 },
  { fromSen: 600000 * RINGGIT, toSen: 2000000 * RINGGIT, basisPoints: 2800 },
  { fromSen: 2000000 * RINGGIT, toSen: null, basisPoints: 3000 },
];

const RELIEFS_YA2025 = {
  individual: { capSen: 9000 * RINGGIT, automatic: true },
  disabledIndividual: { capSen: 7000 * RINGGIT },
  spouse: { capSen: 4000 * RINGGIT },
  disabledSpouse: { capSen: 6000 * RINGGIT },
  educationFees: { capSen: 7000 * RINGGIT },
  medicalSelfSpouseChild: { capSen: 10000 * RINGGIT },
  medicalParents: { capSen: 8000 * RINGGIT },
  disabilityEquipment: { capSen: 6000 * RINGGIT },
  lifestyle: { capSen: 2500 * RINGGIT },
  sportsLifestyle: { capSen: 1000 * RINGGIT },
  evChargingOrComposting: { capSen: 2500 * RINGGIT },
  lifeInsuranceAndEpf: { capSen: 7000 * RINGGIT },
  prsAndDeferredAnnuity: { capSen: 3000 * RINGGIT },
  educationAndMedicalInsurance: { capSen: 4000 * RINGGIT },
  socso: { capSen: 350 * RINGGIT },
  sspnNetSavings: { capSen: 8000 * RINGGIT },
  childcareFees: { capSen: 3000 * RINGGIT },
  breastfeedingEquipment: { capSen: 1000 * RINGGIT },
  firstHomeLoanInterest: { capSen: 7000 * RINGGIT },
  childUnder18: { perChildSen: 2000 * RINGGIT },
  childHigherEducation: { perChildSen: 8000 * RINGGIT },
  disabledChild: { perChildSen: 8000 * RINGGIT },
};

const SERVICE_TAX_BEFORE_EXPANSION = {
  standardBasisPoints: 800,
  reducedBasisPoints: 600,
  reducedCategories: ['food-and-beverage', 'telecommunication', 'parking', 'logistics'],
  creditCardChargeSen: 25 * RINGGIT,
};

const SERVICE_TAX_EXPANSION = {
  standardBasisPoints: 800,
  reducedBasisPoints: 600,
  reducedCategories: ['food-and-beverage', 'telecommunication', 'parking', 'logistics', 'construction', 'healthcare-non-citizen', 'education-non-citizen'],
  exemptForCitizens: ['healthcare', 'education'],
  creditCardChargeSen: 25 * RINGGIT,
};

export const RULES = [
  record(
    'my.income-tax.resident-bands', { bands: RESIDENT_BANDS }, 'chargeable_income_of_a_resident_individual_in_sen',
    '2023-01-01', null, 'ITA-1967', 'Schedule 1 Part I',
    `PwC Worldwide Tax Summaries, Malaysia, individual taxes on personal income, "prevailing tax rates" for residents: 0% to RM5,000, 1% to RM20,000, 3% to RM35,000, 6% to RM50,000, 11% to RM70,000, 19% to RM100,000, 25% to RM400,000, 26% to RM600,000, 28% to RM2,000,000, 30% above (https://taxsummaries.pwc.com/malaysia/individual/taxes-on-personal-income). Coverage starts at year of assessment 2023; ${YA_LOOKUP}`
  ),
  record(
    'my.income-tax.non-resident-rate', { basisPoints: 3000 }, 'chargeable_income_of_a_non_resident_individual',
    '2023-01-01', null, 'ITA-1967', 'Schedule 1 Part I paragraph 1A',
    `PwC Worldwide Tax Summaries, Malaysia: non-residents pay a flat 30% on taxable income (https://taxsummaries.pwc.com/malaysia/individual/taxes-on-personal-income); ${YA_LOOKUP}`
  ),
  record(
    'my.income-tax.rebate', { chargeableIncomeAtMostSen: 35000 * RINGGIT, selfSen: 400 * RINGGIT, spouseSen: 400 * RINGGIT }, 'rebate_against_tax_charged_when_chargeable_income_is_at_most',
    '2023-01-01', null, 'ITA-1967', '6A(2)',
    `RinggitPlus, YA 2025 reliefs: RM400 rebate when chargeable income is RM35,000 or below, another RM400 when the spouse has no income and spouse relief is claimed (https://ringgitplus.com/en/blog/tax/everything-you-can-claim-as-income-tax-relief-in-malaysia-2026-filing-for-ya-2025.html); ${YA_LOOKUP}`
  ),
  record(
    'my.income-tax.reliefs', RELIEFS_YA2025, 'relief_caps_in_sen_for_the_year_of_assessment',
    '2025-01-01', '2025-12-31', 'ITA-1967', '46, 46A, 47, 48, 49, 50',
    `RinggitPlus, everything you can claim as income tax relief in Malaysia 2026 (filing for YA 2025), relief table (https://ringgitplus.com/en/blog/tax/everything-you-can-claim-as-income-tax-relief-in-malaysia-2026-filing-for-ya-2025.html). Year of assessment 2025 only; YA 2026 caps follow Budget 2026 and are not yet recorded; ${YA_LOOKUP}`
  ),
  record(
    'my.income-tax.filing-due', { formBE: '05-15', formB: '07-15', note: 'e-Filing grace dates for the year after the year of assessment' }, 'month_day_after_the_year_of_assessment',
    '2025-01-01', '2025-12-31', 'ITA-1967', '77',
    'RinggitPlus YA 2025 guide: e-Filing of Form BE by 15 May 2026; Form B later (the 30 June statutory date plus the usual 15-day e-Filing grace, to be confirmed against the LHDN 2026 return form programme) (https://ringgitplus.com/en/blog/tax/malaysia-personal-income-tax-guide-2026-ya-2025.html)'
  ),
  record(
    'my.sst.service-tax', SERVICE_TAX_BEFORE_EXPANSION, 'rate_by_category_as_basis_points_of_the_value_of_taxable_service',
    '2024-03-01', '2025-06-30', 'STA-2018', '9; Service Tax (Rate of Tax) Order',
    'Service tax rose from 6% to 8% on 1 March 2024 (Budget 2024), with food and beverage, telecommunication, parking and logistics kept at 6%; PwC Malaysian Tax Booklet, service tax (https://www.pwc.com/my/en/publications/mtb/service-tax.html)'
  ),
  record(
    'my.sst.service-tax', { ...SERVICE_TAX_EXPANSION, reducedCategories: [...SERVICE_TAX_EXPANSION.reducedCategories] }, 'rate_by_category_as_basis_points_of_the_value_of_taxable_service',
    '2025-07-01', '2025-12-31', 'STA-2018', '9; Service Tax (Rate of Tax) (Amendment) Order 2025',
    'Scope expanded 1 July 2025 to rental or leasing, construction, financial, private healthcare, education and beauty services (Ministry of Finance press release, https://mof.gov.my/portal/en/news/press-release/targeted-revision-of-sales-tax-rate-and-expansion-of-service-tax-scope-effective-1-july-2025); rental, financial and beauty at 8%, construction, healthcare and education for non-citizens at 6% (KPMG Malaysia, https://kpmg.com/my/en/insights/2025/06/review-of-goods-for-sales-tax-and-expansion-of-scope-for-service-tax.html)'
  ),
  record(
    'my.sst.service-tax', { ...SERVICE_TAX_EXPANSION, reducedCategories: [...SERVICE_TAX_EXPANSION.reducedCategories, 'rental-or-leasing'] }, 'rate_by_category_as_basis_points_of_the_value_of_taxable_service',
    '2026-01-01', null, 'STA-2018', '9; Service Tax (Rate of Tax) Order as amended',
    'PwC Malaysian Tax Booklet 2026/2027, service tax: rental or leasing services at 6% from 1 January 2026 (8% from 1 July to 31 December 2025); 8% for every other taxable and digital service (https://www.pwc.com/my/en/publications/mtb/service-tax.html)'
  ),
  record(
    'my.sst.sales-tax', { rateBasisPoints: [500, 1000], defaultBasisPoints: 1000, exemptEssentials: true }, 'rate_as_basis_points_of_the_sale_value_of_taxable_goods',
    '2025-07-01', null, 'SaTA-2018', '10; Sales Tax (Rates of Tax) Order 2025',
    'Ministry of Finance press release: essential goods stay exempt, discretionary and non-essential goods are taxed at 5% or 10% from 1 July 2025 (https://mof.gov.my/portal/en/news/press-release/targeted-revision-of-sales-tax-rate-and-expansion-of-service-tax-scope-effective-1-july-2025); the goods schedule decides which rate, so a business records its rate per product'
  ),
  record(
    'my.sst.service-tax.registration', {
      defaultThresholdSen: 500000 * RINGGIT,
      byCategory: { 'rental-or-leasing': 1000000 * RINGGIT, insurance: 1000000 * RINGGIT, 'food-and-beverage': 1500000 * RINGGIT, construction: 1500000 * RINGGIT, healthcare: 1500000 * RINGGIT },
      windowMonths: 12,
    }, 'value_of_taxable_services_in_twelve_months_at_or_above',
    '2025-07-01', null, 'STA-2018', '12; First Schedule, Service Tax Regulations 2018',
    'PwC Malaysian Tax Booklet, service tax registration thresholds: RM500,000 for most taxable services, RM1,000,000 for rental or leasing and insurance or takaful, RM1,500,000 for food and beverage, construction and private healthcare (https://www.pwc.com/my/en/publications/mtb/service-tax.html)'
  ),
  record(
    'my.sst.sales-tax.registration', { thresholdSen: 500000 * RINGGIT, windowMonths: 12 }, 'sale_value_of_taxable_goods_manufactured_in_twelve_months_at_or_above',
    '2018-09-01', null, 'SaTA-2018', '12; Sales Tax (Persons Exempted from Registration) Order 2018',
    'Manufacturers of taxable goods register once the sale value reaches RM500,000 in twelve months (Grant Thornton Malaysia SST alert, https://www.grantthornton.com.my/insights/Tax/revision-of-sales-tax-rates-and-expansion-of-scope-for-service-tax/)'
  ),
  record(
    'my.sst.taxable-period', { months: 2, dueMonthsAfterPeriodEnd: 1, dueDay: 'last', form: 'SST-02' }, 'taxable_period_length_and_return_due_date',
    '2018-09-01', null, 'STA-2018 and SaTA-2018', '26 (service tax); 26 (sales tax)',
    'PwC Malaysian Tax Booklet, service tax: the taxable period is two months and the SST-02 return and payment are due by the last day of the month after the period ends; a different period may be granted by the Director General (https://www.pwc.com/my/en/publications/mtb/service-tax.html)'
  ),
  record(
    'my.sst.late-payment', { stepsBasisPoints: [1000, 1500, 1500], stepDays: 30 }, 'penalty_on_unpaid_tax_by_thirty_day_step_after_the_due_date',
    '2018-09-01', null, 'STA-2018', '41',
    'PwC Malaysian Tax Booklet, service tax: 10% of unpaid tax for the first 30 days late, a further 15% for each of the next two 30-day periods (https://www.pwc.com/my/en/publications/mtb/service-tax.html)'
  ),
  record(
    'my.einvoice.mandate', {
      phases: [
        { from: '2024-08-01', turnoverAboveSen: 100000000 * RINGGIT },
        { from: '2025-01-01', turnoverAboveSen: 25000000 * RINGGIT },
        { from: '2025-07-01', turnoverAboveSen: 5000000 * RINGGIT },
        { from: '2026-01-01', turnoverAboveSen: 1000000 * RINGGIT },
      ],
      exemptBelowSen: 1000000 * RINGGIT,
      consolidationLimitSen: 10000 * RINGGIT,
    }, 'annual_turnover_phase_dates_exemption_and_largest_consolidable_transaction',
    '2026-01-01', null, 'ITA-1967', '82C; e-Invoice Guideline and Specific Guideline',
    'IRBM e-Invoice Guideline and the 2026 relaxation as summarised by info-tech.com.my: phases of 1 Aug 2024 (above RM100m), 1 Jan 2025 (RM25m to RM100m), 1 Jul 2025 (RM5m to RM25m), 1 Jan 2026 (RM1m to RM5m); turnover below RM1 million exempt; from 1 January 2026 a transaction above RM10,000 cannot go into a consolidated e-invoice (https://www.info-tech.com.my/blog/malaysia-new-e-invoice-guidelines/, https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Guideline.pdf)'
  ),
];
