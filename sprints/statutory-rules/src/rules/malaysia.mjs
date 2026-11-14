const SEN = 1;
const RINGGIT = 100 * SEN;
const KIB = 1024;
const CHECKED = 'read on 2026-11-11 for the MyCA Malaysia pack; secondary summary, not the gazetted text; needs attestation by a Malaysian chartered accountant or licensed tax agent before any filing relies on it';
const CHECKED_14 = 'read on 2026-11-14 for the MyCA Malaysia pack; not the gazetted text; needs attestation by a Malaysian chartered accountant or licensed tax agent before any filing relies on it';
const YA_LOOKUP = 'Looked up by 31 December of the year of assessment (the calendar year whose income is taxed)';

function record(id, value, basis, effectiveFrom, effectiveTo, act, section, source, checked = CHECKED) {
  return { id, value, basis, effectiveFrom, effectiveTo, act, section, source: `${source} (${checked})`, attestations: [] };
}

const CONSOLIDATION_EXCLUDED = ['automotive', 'aviation', 'construction', 'construction-materials', 'betting-and-gaming', 'agents-dealers-distributors'];
const CONSOLIDATION_SOURCE = 'IRBM e-Invoice Guideline: a supplier may aggregate transactions with buyers who do not ask for an e-invoice into a consolidated e-invoice, issued to the general public (TIN EI00000000010) with classification 004, within seven calendar days after the end of the month (KPMG Tax Whiz on Guideline 3.2 and Specific Guideline 3.0, https://assets.kpmg.com/content/dam/kpmg/my/pdf/e-invoicing-tax-whiz-guidelines-3-2-and-specific-3-0.pdf; ClearTax, https://www.cleartax.com/my/en/consolidated-einvoicing-malaysia)';

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
  upskillingCourses: { capSen: 2000 * RINGGIT, within: 'educationFees' },
  medicalSelfSpouseChild: { capSen: 10000 * RINGGIT },
  vaccination: { capSen: 1000 * RINGGIT, within: 'medicalSelfSpouseChild' },
  dentalTreatment: { capSen: 1000 * RINGGIT, within: 'medicalSelfSpouseChild' },
  medicalExamination: { capSen: 1000 * RINGGIT, within: 'medicalSelfSpouseChild' },
  childLearningDisability: { capSen: 6000 * RINGGIT, within: 'medicalSelfSpouseChild' },
  medicalParents: { capSen: 8000 * RINGGIT },
  parentsMedicalExamination: { capSen: 1000 * RINGGIT, within: 'medicalParents' },
  disabilityEquipment: { capSen: 6000 * RINGGIT },
  lifestyle: { capSen: 2500 * RINGGIT },
  sportsLifestyle: { capSen: 1000 * RINGGIT },
  evChargingOrComposting: { capSen: 2500 * RINGGIT },
  lifeInsuranceAndEpf: { capSen: 7000 * RINGGIT },
  epf: { capSen: 4000 * RINGGIT, within: 'lifeInsuranceAndEpf' },
  lifeInsurance: { capSen: 3000 * RINGGIT, within: 'lifeInsuranceAndEpf' },
  prsAndDeferredAnnuity: { capSen: 3000 * RINGGIT },
  educationAndMedicalInsurance: { capSen: 4000 * RINGGIT },
  socso: { capSen: 350 * RINGGIT },
  sspnNetSavings: { capSen: 8000 * RINGGIT },
  childcareFees: { capSen: 3000 * RINGGIT },
  breastfeedingEquipment: { capSen: 1000 * RINGGIT },
  firstHomeLoanInterest: { capSen: 7000 * RINGGIT },
  firstHomeLoanInterestUpTo500k: { capSen: 7000 * RINGGIT, within: 'firstHomeLoanInterest' },
  firstHomeLoanInterest500kTo750k: { capSen: 5000 * RINGGIT, within: 'firstHomeLoanInterest' },
  childUnder18: { perChildSen: 2000 * RINGGIT },
  childPreUniversity: { perChildSen: 2000 * RINGGIT },
  childHigherEducation: { perChildSen: 8000 * RINGGIT },
  disabledChild: { perChildSen: 8000 * RINGGIT },
  disabledChildHigherEducation: { perChildSen: 8000 * RINGGIT },
};

const SERVICE_TAX_2018 = {
  standardBasisPoints: 600,
  reducedBasisPoints: 600,
  reducedCategories: [],
  creditCardChargeSen: 25 * RINGGIT,
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
    'my.income-tax.non-resident-rate', { basisPoints: 3000, reliefsAllowed: false, rebatesAllowed: false }, 'chargeable_income_of_a_non_resident_individual',
    '2023-01-01', null, 'ITA-1967', 'Schedule 1 Part I paragraph 1A',
    `PwC Worldwide Tax Summaries, Malaysia: non-residents pay a flat 30% on taxable income and are not entitled to personal reliefs (https://taxsummaries.pwc.com/malaysia/individual/taxes-on-personal-income); ${YA_LOOKUP}`
  ),
  record(
    'my.income-tax.rebate', { chargeableIncomeAtMostSen: 35000 * RINGGIT, selfSen: 400 * RINGGIT, spouseSen: 400 * RINGGIT, zakat: 'actual amount paid, limited to the tax charged after the RM400 rebate, any excess not refundable' }, 'rebate_against_tax_charged_when_chargeable_income_does_not_exceed',
    '2023-01-01', null, 'ITA-1967', '6A(2), 6A(3)',
    `PwC Worldwide Tax Summaries, Malaysia, other tax credits: MYR 400 when chargeable income does not exceed MYR 35,000, another MYR 400 for a spouse with no income, zakat at the actual amount paid; rebates are deducted from tax charged and any excess is not refundable (https://taxsummaries.pwc.com/malaysia/individual/other-tax-credits-and-incentives); RinggitPlus YA 2025 reliefs (https://ringgitplus.com/en/blog/tax/everything-you-can-claim-as-income-tax-relief-in-malaysia-2026-filing-for-ya-2025.html); ${YA_LOOKUP}`,
    CHECKED_14
  ),
  record(
    'my.income-tax.reliefs', RELIEFS_YA2025, 'relief_caps_in_sen_for_the_year_of_assessment_a_cap_marked_within_also_counts_toward_its_parent',
    '2025-01-01', '2025-12-31', 'ITA-1967', '46, 46A, 47, 48, 49, 50',
    `LHDN tax reliefs page, year of assessment 2025 table: individual 9,000; parents medical 8,000 (examination 1,000 within); disability equipment 6,000; disabled individual 7,000; education fees 7,000 (upskilling 2,000 within); medical 10,000 (vaccination 1,000, dental 1,000, examination 1,000, child learning disability 6,000 within); lifestyle 2,500; sports 1,000; breastfeeding 1,000; childcare 3,000; SSPN 8,000; spouse 4,000; disabled spouse 6,000; child under 18 2,000; child 18+ pre-university 2,000 or diploma and above 8,000; disabled child 8,000 plus 8,000 in higher education; life insurance and EPF 7,000 (EPF 4,000, life insurance or voluntary EPF 3,000); PRS and deferred annuity 3,000; education and medical insurance 4,000; SOCSO 350; EV charging and composting 2,500; first home loan interest 7,000 (house up to RM500,000) or 5,000 (RM500,001 to RM750,000) (https://www.hasil.gov.my/en/individual/individual-life-cycle/income-declaration/tax-reliefs/). Year of assessment 2025 only; YA 2026 caps follow Budget 2026 and are not yet recorded; ${YA_LOOKUP}`,
    CHECKED_14
  ),
  record(
    'my.income-tax.filing-due', { formBE: '05-15', formB: '07-15', note: 'e-Filing grace dates for the year after the year of assessment' }, 'month_day_after_the_year_of_assessment',
    '2025-01-01', '2025-12-31', 'ITA-1967', '77',
    'RinggitPlus YA 2025 guide: e-Filing of Form BE by 15 May 2026; Form B later (the 30 June statutory date plus the usual 15-day e-Filing grace, to be confirmed against the LHDN 2026 return form programme) (https://ringgitplus.com/en/blog/tax/malaysia-personal-income-tax-guide-2026-ya-2025.html)'
  ),
  record(
    'my.sst.service-tax', SERVICE_TAX_2018, 'rate_by_category_as_basis_points_of_the_value_of_taxable_service',
    '2018-09-01', '2024-02-29', 'STA-2018', '9; Service Tax (Rate of Tax) Order 2018',
    'Service tax was charged at 6% from 1 September 2018 until it rose to 8% on 1 March 2024 (Budget 2024), with a flat RM25 a year on each credit or charge card; PwC Malaysian Tax Booklet, service tax (https://www.pwc.com/my/en/publications/mtb/service-tax.html)',
    CHECKED_14
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
    'PwC Malaysian Tax Booklet 2026/2027, service tax: rental or leasing services at 6% from 1 January 2026 (8% from 1 July to 31 December 2025); 8% for every other taxable and digital service (https://www.pwc.com/my/en/publications/mtb/service-tax.html). BDO (5 January 2026) describes the 6% as for industrial-use rental and says the rate order was not yet gazetted (https://www.bdo.global/en-gb/insights/tax/indirect-tax/malaysia-changes-made-to-sales-and-service-tax)'
  ),
  record(
    'my.sst.sales-tax', { rateBasisPoints: [500, 1000], defaultBasisPoints: 1000, exemptEssentials: true }, 'rate_as_basis_points_of_the_sale_value_of_taxable_goods',
    '2018-09-01', '2025-06-30', 'SaTA-2018', '10; Sales Tax (Rates of Tax) Order 2018',
    'Sales tax has been charged at 5% or 10% of the sale value since 1 September 2018, with goods in the exemption schedule taxed at nothing and a few goods (petroleum) at specific rates that MyCA does not compute (Grant Thornton Malaysia SST alert, https://www.grantthornton.com.my/insights/Tax/revision-of-sales-tax-rates-and-expansion-of-scope-for-service-tax/)',
    CHECKED_14
  ),
  record(
    'my.sst.sales-tax', { rateBasisPoints: [500, 1000], defaultBasisPoints: 1000, exemptEssentials: true }, 'rate_as_basis_points_of_the_sale_value_of_taxable_goods',
    '2025-07-01', null, 'SaTA-2018', '10; Sales Tax (Rates of Tax) Order 2025',
    'Ministry of Finance press release: essential goods stay exempt, discretionary and non-essential goods are taxed at 5% or 10% from 1 July 2025 (https://mof.gov.my/portal/en/news/press-release/targeted-revision-of-sales-tax-rate-and-expansion-of-service-tax-scope-effective-1-july-2025); the goods schedule decides which rate, so a business records its rate per product'
  ),
  record(
    'my.sst.service-tax.registration', {
      defaultThresholdSen: 500000 * RINGGIT,
      byCategory: { 'food-and-beverage': 1500000 * RINGGIT, 'credit-card': 0 },
      windowMonths: 12,
      test: 'exceeds',
    }, 'value_of_taxable_services_in_twelve_months_exceeding',
    '2018-09-01', '2025-06-30', 'STA-2018', '12; First Schedule, Service Tax Regulations 2018',
    'Registration is due when the value of taxable services in twelve months exceeds the threshold (paragraph 12(2), historical and prospective tests; https://ccs-co.com/post/part-4-comprehensive-guide-to-service-tax-in-malaysia-definitions-thresholds-and-statutory-obligations-under-the-service-tax-act-2018/); RM500,000 for most services, RM1,500,000 for food and beverage, nil for credit and charge cards (PwC Malaysian Tax Booklet, https://www.pwc.com/my/en/publications/mtb/service-tax.html)',
    CHECKED_14
  ),
  record(
    'my.sst.service-tax.registration', {
      defaultThresholdSen: 500000 * RINGGIT,
      byCategory: { 'rental-or-leasing': 1000000 * RINGGIT, insurance: 1000000 * RINGGIT, 'food-and-beverage': 1500000 * RINGGIT, construction: 1500000 * RINGGIT, healthcare: 1500000 * RINGGIT, 'credit-card': 0 },
      windowMonths: 12,
      test: 'exceeds',
    }, 'value_of_taxable_services_in_twelve_months_exceeding',
    '2025-07-01', null, 'STA-2018', '12; First Schedule, Service Tax Regulations 2018',
    'PwC Malaysian Tax Booklet, service tax registration thresholds: RM500,000 for most taxable services, RM1,000,000 for rental or leasing and insurance or takaful, RM1,500,000 for food and beverage, construction and private healthcare, nil for credit and charge cards (https://www.pwc.com/my/en/publications/mtb/service-tax.html); registration is due when the twelve-month value exceeds the threshold (paragraph 12(2), https://ccs-co.com/post/part-4-comprehensive-guide-to-service-tax-in-malaysia-definitions-thresholds-and-statutory-obligations-under-the-service-tax-act-2018/). PwC lists wellness centres and private education at RM1,500,000 ambiguously; those stay at the default until a gazetted schedule is read'
  ),
  record(
    'my.sst.sales-tax.registration', { thresholdSen: 500000 * RINGGIT, windowMonths: 12, test: 'exceeds' }, 'sale_value_of_taxable_goods_manufactured_in_twelve_months_exceeding',
    '2018-09-01', null, 'SaTA-2018', '12; Sales Tax (Persons Exempted from Registration) Order 2018',
    'Manufacturers of taxable goods register once the sale value exceeds RM500,000 in twelve months (Grant Thornton Malaysia SST alert, https://www.grantthornton.com.my/insights/Tax/revision-of-sales-tax-rates-and-expansion-of-scope-for-service-tax/)'
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
    '2026-01-01', '2026-08-31', 'ITA-1967', '82C; e-Invoice Guideline and Specific Guideline',
    'IRBM e-Invoice Guideline and the 2026 relaxation as summarised by info-tech.com.my: phases of 1 Aug 2024 (above RM100m), 1 Jan 2025 (RM25m to RM100m), 1 Jul 2025 (RM5m to RM25m), 1 Jan 2026 (RM1m to RM5m); turnover below RM1 million exempt; from 1 January 2026 a transaction above RM10,000 cannot go into a consolidated e-invoice (https://www.info-tech.com.my/blog/malaysia-new-e-invoice-guidelines/, https://www.hasil.gov.my/wp-content/uploads/IRBM-e-Invoice-Guideline.pdf)'
  ),
  record(
    'my.einvoice.mandate', {
      phases: [
        { from: '2024-08-01', turnoverAboveSen: 100000000 * RINGGIT },
        { from: '2025-01-01', turnoverAboveSen: 25000000 * RINGGIT },
        { from: '2025-07-01', turnoverAboveSen: 5000000 * RINGGIT },
        { from: '2026-01-01', turnoverAboveSen: 1000000 * RINGGIT },
      ],
      exemptBelowSen: 3000000 * RINGGIT,
      exemptionLostWhenRelatedCompanyAtOrAboveSen: 3000000 * RINGGIT,
      consolidationLimitSen: 10000 * RINGGIT,
    }, 'annual_turnover_phase_dates_exemption_and_largest_consolidable_transaction',
    '2026-09-01', null, 'ITA-1967', '82C; e-Invoice Guideline version 4.8 (30 August 2026) section 1.6.1(e)',
    'LHDN raised the e-invoice exemption from annual turnover below RM1 million to below RM3 million from 1 September 2026 (The Star, 30 August 2026, quoting LHDN: https://thestar.com.my/news/nation/2026/08/30/over-11-million-businesses-to-benefit-from-higher-e-invoicing-threshold-says-lhdn; beancount.io summary, https://beancount.io/blog/2026/09/16/malaysia-e-invoicing-phase-4-rm3m-exemption-rm10000-rule-guide). e-Invoice Guideline version 4.8 section 1.6.1(e), as read by the MyCA compliance engineer: the exemption does not apply when a related company, holding company or shareholder company has annual turnover of RM3 million or more. The RM10,000 limit on a consolidated transaction stays',
    CHECKED_14
  ),
  record(
    'my.einvoice.workflow', {
      cancelWithinHours: 72,
      rejectWithinHours: 72,
      issueDateMaxAgeHours: 72,
      duplicateSubmissionMinutes: 10,
      maxDocumentsPerSubmission: 100,
      maxSubmissionBytes: 5 * KIB * KIB,
      maxDocumentBytes: 300 * KIB,
      maxReasonCharacters: 300,
      tokenSeconds: 3600,
    }, 'myinvois_api_time_windows_and_size_limits',
    '2024-08-01', null, 'ITA-1967', '82C; MyInvois SDK',
    'MyInvois SDK: cancel within 72 hours of validation (https://sdk.myinvois.hasil.gov.my/einvoicingapi/03-cancel-document/), buyer rejection within 72 hours of validation, once (https://sdk.myinvois.hasil.gov.my/einvoicingapi/04-reject-document), at most 100 documents, 5 MB a submission and 300 KB a document, an identical submission within 10 minutes refused as DuplicateSubmission (https://sdk.myinvois.hasil.gov.my/einvoicingapi/02-submit-documents), a 3,600-second token (https://sdk.myinvois.hasil.gov.my/integration-practices/); an issue date and time more than 72 hours before submission is refused as too old (AutoCount support, https://autocount.freshdesk.com/support/solutions/articles/69000874510-e-invoice-issuance-date-time-is-too-old-you-can-set-issue-date-time-to-current-date-in-document-info)',
    CHECKED_14
  ),
  record(
    'my.einvoice.consolidation', { submitWithinDaysAfterMonthEnd: 7, buyerTin: 'EI00000000010', classification: '004', frequency: 'Monthly', excludedActivities: [...CONSOLIDATION_EXCLUDED], onHoldActivities: ['luxury-goods-and-jewellery'] }, 'days_after_the_end_of_the_month_to_submit_the_consolidated_e_invoice',
    '2024-08-01', '2025-12-31', 'ITA-1967', '82C; e-Invoice Guideline section 3.6; e-Invoice Specific Guideline',
    `${CONSOLIDATION_SOURCE}; activities that may not consolidate: automotive sales, aviation, construction contracts, wholesale or retail of construction materials, licensed betting and gaming, payments to agents, dealers and distributors; luxury goods and jewellery on hold (https://kschia.blogspot.com/2025/09/irbm-bans-consolidated-e-invoices-for.html)`,
    CHECKED_14
  ),
  record(
    'my.einvoice.consolidation', { submitWithinDaysAfterMonthEnd: 7, buyerTin: 'EI00000000010', classification: '004', frequency: 'Monthly', excludedActivities: [...CONSOLIDATION_EXCLUDED, 'electricity', 'telecommunication'], onHoldActivities: ['luxury-goods-and-jewellery'] }, 'days_after_the_end_of_the_month_to_submit_the_consolidated_e_invoice',
    '2026-01-01', null, 'ITA-1967', '82C; e-Invoice Guideline section 3.6; e-Invoice Specific Guideline',
    `${CONSOLIDATION_SOURCE}; from 1 January 2026 electricity and telecommunication services also may not consolidate, and no transaction above RM10,000 may be consolidated (https://kschia.blogspot.com/2025/09/irbm-bans-consolidated-e-invoices-for.html)`,
    CHECKED_14
  ),
];
