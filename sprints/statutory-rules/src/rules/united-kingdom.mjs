const POUND = 100;
const CHECKED = 'read on 2026-11-14 for the MyCA UK pack from GOV.UK and HMRC guidance; not the legislation itself; needs attestation by a UK chartered accountant or chartered tax adviser before any filing relies on it';
const Y2025 = ['2025-04-06', '2026-04-05'];
const Y2026 = ['2026-04-06', '2027-04-05'];
const FROM_2026 = ['2026-04-06', null];
const FROM_2025 = ['2025-04-06', null];

function record(id, value, basis, [effectiveFrom, effectiveTo], act, section, source) {
  return { id, value, basis, effectiveFrom, effectiveTo, act, section, source: `${source} (${CHECKED})`, attestations: [] };
}

const pounds = (amount) => Math.round(amount * POUND);

const ALLOWANCES = {
  personalAllowancePence: pounds(12570),
  taperThresholdPence: pounds(100000),
  taperDivisor: 2,
  marriageAllowancePence: pounds(1260),
  blindPersonsAllowancePence: null,
  tradingAllowancePence: pounds(1000),
  propertyAllowancePence: pounds(1000),
};

const REST_OF_UK_BANDS = [
  { name: 'basic', fromPence: 0, basisPoints: 2000 },
  { name: 'higher', fromPence: pounds(37700), basisPoints: 4000 },
  { name: 'additional', fromPence: pounds(125140), basisPoints: 4500 },
];

const SCOTTISH_BANDS_2025 = [
  { name: 'starter', fromPence: 0, basisPoints: 1900 },
  { name: 'basic', fromPence: pounds(2827), basisPoints: 2000 },
  { name: 'intermediate', fromPence: pounds(14921), basisPoints: 2100 },
  { name: 'higher', fromPence: pounds(31092), basisPoints: 4200 },
  { name: 'advanced', fromPence: pounds(62430), basisPoints: 4500 },
  { name: 'top', fromPence: pounds(125140), basisPoints: 4800 },
];

const SCOTTISH_BANDS_2026 = [
  { name: 'starter', fromPence: 0, basisPoints: 1900 },
  { name: 'basic', fromPence: pounds(3967), basisPoints: 2000 },
  { name: 'intermediate', fromPence: pounds(16956), basisPoints: 2100 },
  { name: 'higher', fromPence: pounds(31092), basisPoints: 4200 },
  { name: 'advanced', fromPence: pounds(62430), basisPoints: 4500 },
  { name: 'top', fromPence: pounds(125140), basisPoints: 4800 },
];

const SAVINGS_2025 = {
  startingRateBandPence: pounds(5000),
  personalSavingsAllowancePence: { basic: pounds(1000), higher: pounds(500), additional: 0 },
  basisPoints: { basic: 2000, higher: 4000, additional: 4500 },
};

const DIVIDENDS_2025 = { allowancePence: pounds(500), basisPoints: { basic: 875, higher: 3375, additional: 3935 } };
const DIVIDENDS_2026 = { allowancePence: pounds(500), basisPoints: { basic: 1075, higher: 3575, additional: 3935 } };

const CLASS_4_2025 = { lowerProfitsLimitPence: pounds(12570), upperProfitsLimitPence: pounds(50270), mainBasisPoints: 600, additionalBasisPoints: 200 };
const CLASS_2_2025 = { smallProfitsThresholdPence: pounds(6845), weeklyPence: 350, weeks: 52, compulsory: false };
const CLASS_2_2026 = { smallProfitsThresholdPence: pounds(7105), weeklyPence: 365, weeks: 52, compulsory: false };

const STUDENT_LOANS_2025 = {
  unearnedIncomeLimitPence: pounds(2000),
  plans: {
    plan1: { thresholdPence: pounds(26065), basisPoints: 900 },
    plan2: { thresholdPence: pounds(28470), basisPoints: 900 },
    plan4: { thresholdPence: pounds(32745), basisPoints: 900 },
    plan5: null,
    postgraduate: { thresholdPence: pounds(21000), basisPoints: 600 },
  },
};

const STUDENT_LOANS_2026 = {
  unearnedIncomeLimitPence: pounds(2000),
  plans: {
    plan1: { thresholdPence: pounds(26900), basisPoints: 900 },
    plan2: { thresholdPence: pounds(29385), basisPoints: 900 },
    plan4: { thresholdPence: pounds(33795), basisPoints: 900 },
    plan5: { thresholdPence: pounds(25000), basisPoints: 900 },
    postgraduate: { thresholdPence: pounds(21000), basisPoints: 600 },
  },
};

const CGT_2025 = { annualExemptAmountPence: pounds(3000), basisPoints: { basic: 1800, higher: 2400 }, residentialBasisPoints: { basic: 1800, higher: 2400 }, businessAssetDisposalBasisPoints: 1400, businessAssetDisposalLifetimePence: pounds(1000000), residentialReportingDays: 60 };
const CGT_2026 = { ...CGT_2025, businessAssetDisposalBasisPoints: 1800 };

export const RULES = [
  record('gb.income-tax.allowances', { ...ALLOWANCES, blindPersonsAllowancePence: pounds(3130) }, 'personal_marriage_blind_trading_and_property_allowances', Y2025, 'ITA-2007', '35, 55B, 38; ITTOIA-2005 783A, 783AK', 'GOV.UK Income Tax rates and allowances for current and past years (https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past)'),
  record('gb.income-tax.allowances', { ...ALLOWANCES, blindPersonsAllowancePence: pounds(3250) }, 'personal_marriage_blind_trading_and_property_allowances', FROM_2026, 'ITA-2007', '35, 55B, 38; ITTOIA-2005 783A, 783AK', 'GOV.UK Income Tax rates and allowances; personal allowance frozen at £12,570 to 2030-31 (Autumn Budget 2025) (https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past)'),
  record('gb.income-tax.bands.rest-of-uk', REST_OF_UK_BANDS, 'taxable_income_bands_for_england_wales_and_northern_ireland', FROM_2025, 'ITA-2007', '6, 10; annual Finance Act', 'GOV.UK Income Tax rates and bands: basic 20% to £37,700, higher 40% to £125,140, additional 45% above; Welsh rates equal the rest of the UK (https://www.gov.uk/income-tax-rates)'),
  record('gb.income-tax.bands.scotland', SCOTTISH_BANDS_2025, 'scottish_taxable_non_savings_income_bands', Y2025, 'Scotland-Act-2016', 'Scottish Rate Resolution 2025-26', 'Scottish Government income tax 2025 to 2026 (https://www.gov.scot/publications/scottish-income-tax-2025-2026/)'),
  record('gb.income-tax.bands.scotland', SCOTTISH_BANDS_2026, 'scottish_taxable_non_savings_income_bands', FROM_2026, 'Scotland-Act-2016', 'Scottish Rate Resolution 2026-27', 'Scottish Government income tax 2026 to 2027 (https://www.gov.scot/publications/scottish-income-tax-2026-2027/)'),
  record('gb.income-tax.savings', SAVINGS_2025, 'starting_rate_band_personal_savings_allowance_and_savings_rates', ['2025-04-06', '2027-04-05'], 'ITA-2007', '7, 12, 12A', 'GOV.UK tax on savings interest; savings rates rise by 2 points from 6 April 2027 (Autumn Budget 2025) (https://www.gov.uk/apply-tax-free-interest-on-savings)'),
  record('gb.income-tax.dividends', DIVIDENDS_2025, 'dividend_allowance_and_dividend_rates', Y2025, 'ITA-2007', '8, 13A', 'GOV.UK tax on dividends 2025-26 (https://www.gov.uk/tax-on-dividends)'),
  record('gb.income-tax.dividends', DIVIDENDS_2026, 'dividend_allowance_and_dividend_rates', FROM_2026, 'ITA-2007', '8, 13A; Finance Act 2026', 'Autumn Budget 2025: ordinary and upper dividend rates up 2 points from 6 April 2026 (https://www.gov.uk/government/publications/budget-2025-overview-of-tax-legislation-and-rates-ootlar)'),
  record('gb.income-tax.property-finance-costs', { reliefBasisPoints: 2000 }, 'basic_rate_tax_reduction_for_residential_finance_costs', FROM_2025, 'ITTOIA-2005', '272A, 274A', 'GOV.UK restricting finance cost relief for individual landlords (https://www.gov.uk/guidance/changes-to-tax-relief-for-residential-landlords-how-its-worked-out-including-case-studies)'),
  record('gb.income-tax.hicbc', { thresholdPence: pounds(60000), stepPence: pounds(200), fullChargeAtPence: pounds(80000) }, 'high_income_child_benefit_charge_one_percent_per_step_over_threshold', FROM_2025, 'ITEPA-2003', '681B to 681H', 'GOV.UK High Income Child Benefit Charge (https://www.gov.uk/child-benefit-tax-charge)'),
  record('gb.ni.class-4', CLASS_4_2025, 'class_4_profits_limits_and_rates', FROM_2025, 'SSCBA-1992', '15', 'GOV.UK rates and thresholds for employers and self-employed National Insurance (https://www.gov.uk/self-employed-national-insurance-rates)'),
  record('gb.ni.class-2', CLASS_2_2025, 'voluntary_class_2_weekly_rate_and_small_profits_threshold', Y2025, 'SSCBA-1992', '11', 'GOV.UK self-employed National Insurance rates 2025-26: Class 2 no longer compulsory from 6 April 2024 (https://www.gov.uk/self-employed-national-insurance-rates)'),
  record('gb.ni.class-2', CLASS_2_2026, 'voluntary_class_2_weekly_rate_and_small_profits_threshold', FROM_2026, 'SSCBA-1992', '11', 'GOV.UK self-employed National Insurance rates 2026-27 (https://www.gov.uk/self-employed-national-insurance-rates)'),
  record('gb.student-loan.plans', STUDENT_LOANS_2025, 'repayment_thresholds_and_rates_by_plan', Y2025, 'Education-Student-Loans-Repayment-Regulations-2009', 'Part 3', 'GOV.UK repaying your student loan: what you pay (https://www.gov.uk/repaying-your-student-loan/what-you-pay)'),
  record('gb.student-loan.plans', STUDENT_LOANS_2026, 'repayment_thresholds_and_rates_by_plan', Y2026, 'Education-Student-Loans-Repayment-Regulations-2009', 'Part 3', 'GOV.UK repaying your student loan: what you pay, 2026-27 thresholds (https://www.gov.uk/repaying-your-student-loan/what-you-pay)'),
  record('gb.cgt.rates', CGT_2025, 'annual_exempt_amount_rates_and_business_asset_disposal_relief', Y2025, 'TCGA-1992', '1H, 1I, 169N', 'GOV.UK Capital Gains Tax rates and allowances (https://www.gov.uk/capital-gains-tax/rates)'),
  record('gb.cgt.rates', CGT_2026, 'annual_exempt_amount_rates_and_business_asset_disposal_relief', FROM_2026, 'TCGA-1992', '1H, 1I, 169N', 'GOV.UK Business Asset Disposal Relief: 18% from 6 April 2026 (https://www.gov.uk/business-asset-disposal-relief)'),
  record('gb.sa.payments-on-account', { minimumBalancePence: pounds(1000), atSourceShareBasisPoints: 8000, firstDue: '01-31', secondDue: '07-31', shareBasisPoints: 5000 }, 'when_payments_on_account_are_due_and_how_much', FROM_2025, 'TMA-1970', '59A; Income Tax (Payments on Account) Regulations 1996', 'GOV.UK understand your Self Assessment tax bill: payments on account (https://www.gov.uk/understand-self-assessment-bill/payments-on-account)'),
  record('gb.sa.deadlines', { registerBy: '10-05', paperBy: '10-31', onlineBy: '01-31', balancingPaymentBy: '01-31', amendWithinMonths: 12 }, 'self_assessment_registration_return_and_payment_deadlines', FROM_2025, 'TMA-1970', '7, 8, 59B', 'GOV.UK Self Assessment tax returns: deadlines (https://www.gov.uk/self-assessment-tax-returns/deadlines)'),
  record('gb.sa.late-filing', { initialPence: pounds(100), dailyFromMonths: 3, dailyPence: pounds(10), dailyMaxDays: 90, sixMonths: { basisPoints: 500, minimumPence: pounds(300) }, twelveMonths: { basisPoints: 500, minimumPence: pounds(300) } }, 'late_filing_penalties_for_returns_outside_making_tax_digital', FROM_2025, 'FA-2009', 'Schedule 55', 'GOV.UK Self Assessment penalties (https://www.gov.uk/self-assessment-tax-returns/penalties)'),
  record('gb.late-payment', { interestOverBaseBasisPoints: 400, penalties: [{ day: 15, basisPoints: 300 }, { day: 30, basisPoints: 300 }], dailyFromDay: 31, yearlyBasisPoints: 1000 }, 'late_payment_penalties_for_mtd_vat_and_mtd_income_tax_and_interest_over_base_rate', ['2025-04-06', '2027-03-31'], 'FA-2021', 'Schedule 26', 'GOV.UK late payment penalties for VAT and MTD Income Tax from April 2025 (https://www.gov.uk/guidance/penalties-for-late-payment-of-vat-or-income-tax)'),
  record('gb.mtd-it.mandate', { phases: [{ from: '2026-04-06', qualifyingIncomeAbovePence: pounds(50000), readFromYear: '2024-25' }, { from: '2027-04-06', qualifyingIncomeAbovePence: pounds(30000), readFromYear: '2025-26' }, { from: '2028-04-06', qualifyingIncomeAbovePence: pounds(20000), readFromYear: '2026-27' }] }, 'qualifying_income_thresholds_and_start_dates', FROM_2025, 'FA-2021', 'Schedule 24; Income Tax (Digital Requirements) Regulations 2021', 'GOV.UK use Making Tax Digital for Income Tax: get started (https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/get-started)'),
  record('gb.mtd-it.periods', { standard: [['04-06', '07-05', '08-07'], ['07-06', '10-05', '11-07'], ['10-06', '01-05', '02-07'], ['01-06', '04-05', '05-07']], calendar: [['04-01', '06-30', '08-07'], ['07-01', '09-30', '11-07'], ['10-01', '12-31', '02-07'], ['01-01', '03-31', '05-07']], finalDeclarationBy: '01-31', cumulative: true }, 'quarterly_update_periods_deadlines_and_final_declaration', FROM_2025, 'Income-Tax-Digital-Requirements-Regulations-2021', '7, 8, 12', 'GOV.UK send quarterly updates through MTD for Income Tax (https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates)'),
  record('gb.penalty-points', { quarterlyThreshold: 4, monthlyThreshold: 5, annualThreshold: 2, penaltyPence: pounds(200), expiryMonths: { quarterly: 12, monthly: 6, annual: 24 } }, 'late_submission_points_and_fixed_penalty', FROM_2025, 'FA-2021', 'Schedule 24', 'GOV.UK penalty points for late submission (https://www.gov.uk/guidance/penalty-points-for-late-submission-of-vat-returns)'),
  record('gb.vat.rates', { standardBasisPoints: 2000, reducedBasisPoints: 500, zeroBasisPoints: 0 }, 'standard_reduced_and_zero_rates', FROM_2025, 'VATA-1994', '2, 29A, 30', 'GOV.UK VAT rates (https://www.gov.uk/vat-rates)'),
  record('gb.vat.registration', { registerAbovePence: pounds(90000), deregisterBelowPence: pounds(88000), windowMonths: 12, forwardDays: 30, notifyWithinDays: 30 }, 'rolling_twelve_month_and_forward_thirty_day_tests', FROM_2025, 'VATA-1994', 'Schedule 1', 'GOV.UK register for VAT: when to register (https://www.gov.uk/register-for-vat)'),
  record('gb.vat.schemes', { flatRateJoinBelowPence: pounds(150000), flatRateLeaveAbovePence: pounds(230000), limitedCostTraderBasisPoints: 1650, limitedCostShareBasisPoints: 200, limitedCostYearlyPence: pounds(1000), firstYearDiscountBasisPoints: 100, cashAccountingJoinBelowPence: pounds(1350000), cashAccountingLeaveAbovePence: pounds(1600000), annualAccountingJoinBelowPence: pounds(1350000) }, 'flat_rate_cash_and_annual_accounting_limits', FROM_2025, 'VAT-Regulations-1995', 'Part VIIA, Part VIII, regulations 49 to 55', 'GOV.UK VAT Flat Rate Scheme and cash accounting (https://www.gov.uk/vat-flat-rate-scheme, https://www.gov.uk/vat-cash-accounting-scheme)'),
  record('gb.vat.return', { dueMonthsAndDaysAfterPeriodEnd: { months: 1, days: 7 }, boxes: 9, poundsOnlyBoxes: [6, 7, 8, 9] }, 'vat_return_due_date_and_box_rules', FROM_2025, 'VAT-Regulations-1995', '25; HMRC VAT (MTD) API', 'GOV.UK VAT returns: deadlines and HMRC VAT (MTD) API (https://www.gov.uk/submit-vat-return, https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/vat-api)'),
];
