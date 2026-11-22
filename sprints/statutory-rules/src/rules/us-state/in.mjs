const year = (y) => ({ effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31` });

const BOOKLET_2025 = 'Indiana Department of Revenue, 2025 IT-40 Full-Year Resident Individual Income Tax Booklet (forms.in.gov/Download.aspx?id=16915) and 2025 Form IT-40 with Schedules 2, 3, 5 and 6 (forms.in.gov/Download.aspx?id=16914, 16933, 16936, 16939, 16940), read 2026-11-21';
const PNR_2025 = 'Indiana Department of Revenue, 2025 IT-40PNR Booklet and Form IT-40PNR with Schedules A, C, D and CT-40PNR (forms.in.gov/Download.aspx?id=16921, 16919, 16944, 16949, 16950, 16904), read 2026-11-21';
const DN1_2026 = 'Indiana Department of Revenue, Departmental Notice #1 (R47 / 10-26), effective Oct. 1, 2026 (in.gov/dor/files/dn01.pdf), read 2026-11-21';
const LEG_2026 = 'Indiana Department of Revenue news release of April 15, 2026 on Senate Enrolled Act 243 (in.gov/dor/files/legislative-session-2026-news-release.pdf), read 2026-11-21';
const NOT_PUBLISHED_2026 = 'Indiana has not published the 2026 IT-40 booklet or schedules as of 2026-11-21; the 2025 amounts (set by statute, not indexed) are carried until the Department publishes the 2026 forms, so the record is marked provisional';

const RATES_2025 = { 'Adams': 16000, 'Allen': 15900, 'Bartholomew': 17500, 'Benton': 17900, 'Blackford': 25000, 'Boone': 17000, 'Brown': 25234, 'Carroll': 22733, 'Cass': 29500, 'Clark': 20000, 'Clay': 23500, 'Clinton': 26500, 'Crawford': 16500, 'Daviess': 15000, 'Dearborn': 14000, 'Decatur': 24500, 'DeKalb': 21300, 'Delaware': 15000, 'Dubois': 12000, 'Elkhart': 20000, 'Fayette': 28200, 'Floyd': 18900, 'Fountain': 21000, 'Franklin': 17000, 'Fulton': 28800, 'Gibson': 13000, 'Grant': 25500, 'Greene': 21500, 'Hamilton': 11000, 'Hancock': 19400, 'Harrison': 10000, 'Hendricks': 17000, 'Henry': 20200, 'Howard': 19500, 'Huntington': 19500, 'Jackson': 21000, 'Jasper': 28640, 'Jay': 25000, 'Jefferson': 10300, 'Jennings': 25000, 'Johnson': 14000, 'Knox': 17000, 'Kosciusko': 10000, 'LaGrange': 16500, 'Lake': 15000, 'LaPorte': 14500, 'Lawrence': 17500, 'Madison': 22500, 'Marion': 20200, 'Marshall': 12500, 'Martin': 25000, 'Miami': 25400, 'Monroe': 21400, 'Montgomery': 26500, 'Morgan': 27200, 'Newton': 10000, 'Noble': 17500, 'Ohio': 20000, 'Orange': 17500, 'Owen': 25000, 'Parke': 26500, 'Perry': 14000, 'Pike': 12000, 'Porter': 5000, 'Posey': 14500, 'Pulaski': 28500, 'Putnam': 23000, 'Randolph': 30000, 'Ripley': 23800, 'Rush': 21500, 'St. Joseph': 17500, 'Scott': 21600, 'Shelby': 16000, 'Spencer': 8000, 'Starke': 17100, 'Steuben': 19900, 'Sullivan': 17000, 'Switzerland': 14500, 'Tippecanoe': 12800, 'Tipton': 26000, 'Union': 20000, 'Vanderburgh': 12500, 'Vermillion': 15000, 'Vigo': 20000, 'Wabash': 29000, 'Warren': 21200, 'Warrick': 10000, 'Washington': 20000, 'Wayne': 12500, 'Wells': 21000, 'White': 23200, 'Whitley': 16829 };
const RATES_2026 = { 'Adams': 16000, 'Allen': 15900, 'Bartholomew': 17500, 'Benton': 17900, 'Blackford': 25000, 'Boone': 17000, 'Brown': 25234, 'Carroll': 24733, 'Cass': 29500, 'Clark': 20000, 'Clay': 23500, 'Clinton': 26500, 'Crawford': 16500, 'Daviess': 15000, 'Dearborn': 14000, 'Decatur': 24500, 'DeKalb': 21300, 'Delaware': 15000, 'Dubois': 12000, 'Elkhart': 20000, 'Fayette': 28200, 'Floyd': 18900, 'Fountain': 21000, 'Franklin': 17000, 'Fulton': 28800, 'Gibson': 13000, 'Grant': 27500, 'Greene': 23500, 'Hamilton': 11000, 'Hancock': 19400, 'Harrison': 10000, 'Hendricks': 17000, 'Henry': 20200, 'Howard': 23500, 'Huntington': 19500, 'Jackson': 21000, 'Jasper': 28640, 'Jay': 25000, 'Jefferson': 10300, 'Jennings': 25000, 'Johnson': 14000, 'Knox': 17000, 'Kosciusko': 10000, 'LaGrange': 16500, 'Lake': 15000, 'LaPorte': 14500, 'Lawrence': 17500, 'Madison': 22500, 'Marion': 20200, 'Marshall': 12500, 'Martin': 25000, 'Miami': 25400, 'Monroe': 21400, 'Montgomery': 26500, 'Morgan': 27200, 'Newton': 10000, 'Noble': 17500, 'Ohio': 20000, 'Orange': 17500, 'Owen': 25000, 'Parke': 26500, 'Perry': 14000, 'Pike': 12000, 'Porter': 5000, 'Posey': 14500, 'Pulaski': 28500, 'Putnam': 23000, 'Randolph': 30000, 'Ripley': 23800, 'Rush': 21500, 'St. Joseph': 17500, 'Scott': 21600, 'Shelby': 17000, 'Spencer': 8000, 'Starke': 17100, 'Steuben': 19900, 'Sullivan': 17000, 'Switzerland': 14500, 'Tippecanoe': 12800, 'Tipton': 26000, 'Union': 27500, 'Vanderburgh': 12500, 'Vermillion': 15000, 'Vigo': 20000, 'Wabash': 29000, 'Warren': 21200, 'Warrick': 10000, 'Washington': 20000, 'Wayne': 12500, 'Wells': 21000, 'White': 23200, 'Whitley': 16829 };

const EXEMPTIONS = { personal: 1000, dependent: 1000, additionalDependentChild: 1500, firstYearAdditionalDependentChild: 1500, adoptedChild: 3000, ageOrBlind: 1000, lowIncomeSenior: 500, lowIncomeSeniorLimit: { mfs: 20000, other: 40000 } };
const DEDUCTIONS = { renterMaximum: { mfs: 1500, other: 3000 }, propertyTaxMaximum: { mfs: 1250, other: 2500 }, privateSchoolPerChild: 1000, unemploymentBase: { mfj: 18000, mfsLivedApart: 12000, mfsLivedTogether: 0, other: 12000 } };
const CREDITS = { eicBasisPoints: 1000, elderlyIncomeLimit: 10000, elderlyMinimumResidentDays: 183, elderlyBothOver65: [{ under: 1000, credit: 140 }, { under: 3000, credit: 90 }, { under: 10000, credit: 80 }], elderlyOneOver65: [{ under: 1000, credit: 100 }, { under: 3000, credit: 50 }, { under: 10000, credit: 40 }], reverseCreditStates: ['AZ', 'OR', 'DC'] };

export const RULES = [
  {
    id: 'us.state-return.in.income-tax',
    value: { rateBasisPoints: 300 },
    basis: 'flat_state_adjusted_gross_income_tax_rate_on_indiana_adjusted_gross_income',
    ...year(2025),
    act: 'Indiana Code',
    section: 'IC 6-3-2-1',
    source: `${BOOKLET_2025}: Form IT-40 line 8 "State adjusted gross income tax: multiply line 7 by 3% (.03)"`,
    attestations: []
  },
  {
    id: 'us.state-return.in.income-tax',
    value: { rateBasisPoints: 295 },
    basis: 'flat_state_adjusted_gross_income_tax_rate_on_indiana_adjusted_gross_income',
    ...year(2026),
    act: 'Indiana Code as amended by HEA 1001-2023',
    section: 'IC 6-3-2-1',
    source: `${DN1_2026}: "For 2026, the state adjusted gross income tax rate for individuals is 2.95%"`,
    attestations: []
  },
  {
    id: 'us.state-return.in.exemptions',
    value: EXEMPTIONS,
    basis: 'personal_dependent_additional_dependent_child_adopted_child_age_65_or_blind_and_low_income_age_65_exemptions',
    ...year(2025),
    act: 'Indiana Code',
    section: 'IC 6-3-1-3.5',
    source: `${BOOKLET_2025}: Schedule 3 lines 1-6 ($1,000 each filer and dependent, $1,500 additional dependent child, $3,000 instead of $1,500 the first year a child qualifies, $3,000 adopted child, $1,000 for age 65 or blind, $500 if age 65 and IT-40 line 1 under $40,000 or $20,000 married filing separately); ${PNR_2025} Schedule D lines 1-9`,
    attestations: []
  },
  {
    id: 'us.state-return.in.exemptions',
    value: { ...EXEMPTIONS, provisional: true },
    basis: 'personal_dependent_additional_dependent_child_adopted_child_age_65_or_blind_and_low_income_age_65_exemptions',
    ...year(2026),
    act: 'Indiana Code',
    section: 'IC 6-3-1-3.5',
    source: `${NOT_PUBLISHED_2026}; ${DN1_2026} confirms the $1,000 personal, $1,500 additional and first-time additional dependent and $3,000 adopted child exemptions for 2026 withholding`,
    attestations: []
  },
  {
    id: 'us.state-return.in.deductions',
    value: { ...DEDUCTIONS, federalScheduleOneADeductions: [] },
    basis: 'schedule_2_renter_homeowner_property_tax_private_school_and_unemployment_deductions',
    ...year(2025),
    act: 'Indiana Code',
    section: 'IC 6-3-1-3.5(a); IC 6-3-2-6 (sections as named in the booklet\'s information bulletins, not re-read)',
    source: `${BOOKLET_2025}: Schedule 2 line 1 renter's deduction "lesser of $3,000 ($1,500 if married filing separately) or amount of rent paid", line 2 homeowner's residential property tax "lesser of $2,500 ($1,250 if married filing separately)", line 8 "$1,000 per qualifying child", line 10 Unemployment Compensation Worksheet ($12,000 single, $18,000 joint, $0 or $12,000 married filing separately)`,
    attestations: []
  },
  {
    id: 'us.state-return.in.deductions',
    value: { ...DEDUCTIONS, federalScheduleOneADeductions: ['13', '21', '30'], provisional: true },
    basis: 'schedule_2_deductions_plus_the_2026_deduction_equal_to_the_federal_tips_overtime_and_car_loan_interest_deductions',
    ...year(2026),
    act: 'Indiana Code; Senate Enrolled Act 243 (2026)',
    section: 'IC 6-3-2-6; SEA 243-2026',
    source: `${NOT_PUBLISHED_2026}; ${LEG_2026}: SEA 243 "Provides a deduction from state adjusted gross income for the 2026 tax year equal to the amount deducted for federal tax purposes: Auto Loan Interest Deduction, Overtime Deduction, Tips Deduction"`,
    attestations: []
  },
  {
    id: 'us.state-return.in.credits',
    value: CREDITS,
    basis: 'indiana_eic_10_percent_of_federal_eic_unified_tax_credit_for_the_elderly_tables_and_states_whose_credit_is_taken_on_their_own_return',
    ...year(2025),
    act: 'Indiana Code',
    section: 'IC 6-3.1-21-6; IC 6-3-3-9; IC 6-3-3-3',
    source: `${BOOKLET_2025}: Schedule 5 line 6 "Your 2025 EIC will be your federal EIC multiplied by 10%", line 5 Unified Tax Credit for the Elderly Tables A and B (line 1 under $10,000, resident at least six months), Schedule 6 line 5 Group A worksheet and Group C reverse-credit states Arizona, Oregon, Washington D.C.; ${PNR_2025}: EIC multiplied by Schedule A line 21D`,
    attestations: []
  },
  {
    id: 'us.state-return.in.credits',
    value: { ...CREDITS, provisional: true },
    basis: 'indiana_eic_10_percent_of_federal_eic_unified_tax_credit_for_the_elderly_tables_and_states_whose_credit_is_taken_on_their_own_return',
    ...year(2026),
    act: 'Indiana Code',
    section: 'IC 6-3.1-21-6; IC 6-3-3-9; IC 6-3-3-3',
    source: NOT_PUBLISHED_2026,
    attestations: []
  },
  {
    id: 'us.state-return.in.county-tax',
    value: { ratePpmByCounty: RATES_2025 },
    basis: 'local_income_tax_rate_of_the_county_of_residence_on_january_1_or_for_a_nonresident_the_county_of_principal_work_on_january_1_rates_in_millionths',
    ...year(2025),
    act: 'Indiana Code',
    section: 'IC 6-3.6',
    source: 'Indiana Department of Revenue, 2025 Schedule CT-40 "2025 Indiana County Income Tax Rates and County Codes" (forms.in.gov/Download.aspx?id=16902) and Schedule CT-40PNR (id=16904), read 2026-11-21',
    attestations: []
  },
  {
    id: 'us.state-return.in.county-tax',
    value: { ratePpmByCounty: RATES_2026, provisional: true },
    basis: 'local_income_tax_rate_of_the_county_of_residence_on_january_1_or_for_a_nonresident_the_county_of_principal_work_on_january_1_rates_in_millionths',
    ...year(2026),
    act: 'Indiana Code',
    section: 'IC 6-3.6',
    source: `${DN1_2026}: county rates effective Oct. 1, 2026, with Boone County at its rate before the Oct. 1, 2026 change (the notice marks Boone as the only county changed since the Jan. 1, 2026 notice; .017 is its 2025 chart rate). The 2026 Schedule CT-40 rate chart, which sets the annual rate for a county that changed its rate during the year, is not published as of 2026-11-21, so the record is provisional`,
    attestations: []
  }
];
