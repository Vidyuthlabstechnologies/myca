const FILS = 1;
const DIRHAM = 100 * FILS;
const CHECKED = 'read on 2026-11-14 for the MyCA UAE pack; secondary summary unless the source is the FTA or Ministry of Finance; needs attestation by a UAE registered tax agent before any filing relies on it';

function record(id, value, basis, effectiveFrom, effectiveTo, act, section, source) {
  return { id, value, basis, effectiveFrom, effectiveTo, act, section, source: `${source} (${CHECKED})`, attestations: [] };
}


export const RULES = [
  record(
    'ae.vat.rate', { standardBasisPoints: 500, zeroBasisPoints: 0 }, 'standard_rate_of_vat_on_taxable_supplies_and_imports',
    '2018-01-01', null, 'Federal Decree-Law 8 of 2017 on VAT', '3',
    'FTA VAT overview: VAT is charged at 5% on most supplies and imports; certain supplies are zero-rated or exempt (https://tax.gov.ae/en/taxes/vat.aspx)'
  ),
  record(
    'ae.vat.registration', { mandatoryFils: 375000 * DIRHAM, voluntaryFils: 187500 * DIRHAM, windowMonths: 12, registerWithinDays: 30 }, 'taxable_supplies_and_imports_over_the_last_twelve_months_or_expected_in_the_next_thirty_days',
    '2018-01-01', null, 'Federal Decree-Law 8 of 2017 on VAT', '13, 17',
    'FTA VAT registration: mandatory above AED 375,000 of taxable supplies and imports in the previous 12 months or expected in the next 30 days, voluntary from AED 187,500; apply within 30 days (https://tax.gov.ae/en/taxes/vat/vat.registration.aspx, https://www.cleartax.com/ae/vat-in-uae)'
  ),
  record(
    'ae.vat.return-period', { quarterlyBelowFils: 150000000 * DIRHAM, months: 3, monthlyMonths: 1, dueDaysAfterPeriodEnd: 28, form: 'VAT201' }, 'tax_period_length_by_annual_turnover_and_days_to_file_and_pay',
    '2018-01-01', null, 'Federal Decree-Law 8 of 2017 on VAT; Cabinet Decision 52 of 2017', '64, 65; Executive Regulation 59',
    'FTA: file the VAT return and pay within 28 days of the end of the tax period; the standard tax period is a quarter, monthly for turnover of AED 150 million or more (https://www.businessdubai.ae/blogs/uae-vat-return-filing)'
  ),
  record(
    'ae.vat.invoice', { fullInvoiceAboveFils: 10000 * DIRHAM, issueWithinDays: 14 }, 'tax_invoice_threshold_for_a_simplified_invoice_and_days_to_issue',
    '2018-01-01', null, 'Federal Decree-Law 8 of 2017 on VAT', '65, 67; Executive Regulation 59, 60',
    'FTA tax invoices guide: a full tax invoice to a registrant or above AED 10,000, a simplified one otherwise, issued within 14 days of the supply (https://www.cleartax.com/ae/vat-in-uae)'
  ),
  record(
    'ae.vat.penalties', { lateReturnFirstFils: 1000 * DIRHAM, lateReturnRepeatFils: 2000 * DIRHAM, repeatWindowMonths: 24, latePaymentAnnualBasisPoints: 1400, incorrectReturnFirstFils: 500 * DIRHAM, incorrectReturnRepeatFils: 2000 * DIRHAM, lateInvoicePerViolationFils: 2500 * DIRHAM, lateRegistrationFils: 10000 * DIRHAM }, 'administrative_penalties_after_cabinet_decision_129_of_2025',
    '2026-04-14', null, 'Cabinet Decision 40 of 2017 as amended by Cabinet Decision 129 of 2025', 'Schedule',
    'Late VAT return AED 1,000, AED 2,000 repeated within 24 months; late payment a flat 14% a year from 14 April 2026, accruing monthly and not compounding; incorrect return AED 500 then AED 2,000; late tax invoice AED 2,500 a violation (https://www.businessdubai.ae/blogs/uae-vat-return-filing, https://bestaxca.com/uae-tax-penalties-2026-changes/)'
  ),
  record(
    'ae.ct.rate', { bands: [{ fromFils: 0, basisPoints: 0 }, { fromFils: 375000 * DIRHAM, basisPoints: 900 }], qualifyingFreeZoneBasisPoints: 0, nonQualifyingFreeZoneBasisPoints: 900 }, 'corporate_tax_bands_on_taxable_income_for_a_tax_period',
    '2023-06-01', null, 'Federal Decree-Law 47 of 2022 on Corporate Tax; Cabinet Decision 116 of 2022', '3, 18',
    'FTA Corporate Tax: 0% on taxable income up to AED 375,000 and 9% above; Qualifying Free Zone Persons 0% on qualifying income and 9% on the rest (https://tax.gov.ae/en/taxes/corporate.tax.aspx)'
  ),
  record(
    'ae.ct.small-business-relief', { revenueCapFils: 3000000 * DIRHAM, lastPeriodEnd: '2029-12-31', firstPeriodStart: '2023-06-01', mneGroupRevenueFils: 3150000000 * DIRHAM }, 'revenue_cap_for_each_period_and_the_last_period_end_that_may_elect_the_relief',
    '2023-06-01', null, 'Federal Decree-Law 47 of 2022 on Corporate Tax; Ministerial Decision 73 of 2023 as extended by Ministerial Decision 131', '21',
    'Small Business Relief for resident persons with revenue of AED 3 million or less in the period and every earlier period, not a Qualifying Free Zone Person or member of an MNE group of AED 3.15 billion, for tax periods ending on or before 31 December 2029; losses are not carried forward in a relief period (https://osome.com/ae/blog/small-business-relief-extended-2029.amp/, https://mof.gov.ae/en/news/ministry-of-finance-issues-decision-on-small-business-relief-for-corporate-tax-purposes/)'
  ),
  record(
    'ae.ct.losses', { offsetCapBasisPoints: 7500 }, 'share_of_taxable_income_that_brought_forward_losses_may_offset',
    '2023-06-01', null, 'Federal Decree-Law 47 of 2022 on Corporate Tax', '37',
    'Tax losses carried forward may offset up to 75% of the taxable income of a later period (https://tax.gov.ae/en/taxes/corporate.tax.aspx)'
  ),
  record(
    'ae.ct.free-zone-de-minimis', { shareBasisPoints: 500, amountFils: 5000000 * DIRHAM }, 'non_qualifying_revenue_a_qualifying_free_zone_person_may_earn',
    '2023-06-01', null, 'Federal Decree-Law 47 of 2022 on Corporate Tax; Cabinet Decision 100 of 2023; Ministerial Decision 265 of 2023', '18; 3',
    'A Qualifying Free Zone Person stays qualifying while non-qualifying revenue is no more than 5% of total revenue or AED 5 million, whichever is lower (https://tax.gov.ae/en/taxes/corporate.tax.aspx)'
  ),
  record(
    'ae.ct.return', { dueMonthsAfterPeriodEnd: 9, registrationLateFils: 10000 * DIRHAM, naturalPersonTurnoverFils: 1000000 * DIRHAM }, 'months_after_the_period_end_to_file_and_pay',
    '2023-06-01', null, 'Federal Decree-Law 47 of 2022 on Corporate Tax', '48, 53',
    'The Corporate Tax return and payment are due within nine months of the end of the tax period; late registration AED 10,000; a natural person registers once business turnover passes AED 1 million in a year (https://gulfnews.com/business/uae-corporate-tax-key-deadlines-thresholds-and-filing-rules-businesses-need-to-know-1.500668857)'
  ),
  record(
    'ae.ct.penalties', { lateReturnPerMonthFirstYearFils: 500 * DIRHAM, lateReturnPerMonthLaterFils: 1000 * DIRHAM, latePaymentAnnualBasisPoints: 1400 }, 'late_corporate_tax_return_penalty_per_month_and_late_payment_rate',
    '2026-04-14', null, 'Cabinet Decision 75 of 2023 as amended by Cabinet Decision 129 of 2025', 'Schedule',
    'Late Corporate Tax return AED 500 a month for the first twelve months and AED 1,000 a month after; late payment 14% a year from 14 April 2026 (https://www.alvarezandmarsal.com/node/89226, https://bestaxca.com/uae-tax-penalties-2026-changes/)'
  ),
  record(
    'ae.einvoice.mandate', {
      phases: [
        { id: 'large', revenueAtLeastFils: 50000000 * DIRHAM, appointAspBy: '2026-10-30', liveBy: '2027-01-01' },
        { id: 'others', revenueAtLeastFils: 0, appointAspBy: '2027-03-31', liveBy: '2027-07-01' },
        { id: 'government', revenueAtLeastFils: null, appointAspBy: '2027-03-31', liveBy: '2027-10-01' },
      ],
      voluntaryFrom: '2026-07-01',
      specification: 'urn:peppol:pint:billing-1@ae-1',
      profile: 'urn:peppol:bis:billing',
      endpointScheme: '0235',
      domesticBuyerNotOnNetwork: '9900000098',
      deemedSupplyBuyer: '9900000097',
      exportBuyerNoPeppol: '9900000099',
      outOfScope: ['b2c', 'exempt-financial-services', 'airline-passenger-ticket', 'sovereign-government'],
    }, 'phase_dates_by_annual_revenue_and_the_pint_ae_identifiers',
    '2026-07-01', null, 'Ministerial Decisions 243 and 244 of 2025', 'Articles 3 to 5',
    'Ministry of Finance UAE Electronic Invoicing Guidelines v1.1, with the May 2026 amendment to Ministerial Decision 244 of 2025 moving the large-business ASP appointment from 31 July to 30 October 2026 (https://gulfnews.com/business/uae-announces-extension-of-einvoicing-provider-deadline-to-october-2026-1.500535895): revenue of AED 50 million or more appoints an ASP by 30 October 2026 and goes live 1 January 2027, others by 31 March 2027 and 1 July 2027, government entities by 31 March 2027 and 1 October 2027; specification urn:peppol:pint:billing-1@ae-1; endpoint 0235 plus the 10-digit TIN; predefined buyer endpoints 9900000098, 9900000097 and 9900000099 (https://mof.gov.ae/wp-content/uploads/2026/02/UAE-Electronic-Invoicing-Guidelines_V-1.0-23Feb2026.pdf)'
  ),
  record(
    'ae.einvoice.penalties', { notImplementedPerMonthFils: 5000 * DIRHAM, perMissingInvoiceFils: 100 * DIRHAM, missingInvoiceMonthlyCapFils: 5000 * DIRHAM, outageNoticePerDayFils: 1000 * DIRHAM }, 'penalties_for_not_issuing_or_not_reporting_electronic_invoices',
    '2027-01-01', null, 'Cabinet Decision 106 of 2025', 'Schedule',
    'Electronic Invoicing penalties apply from each person\'s mandatory date, not to voluntary issuance; amounts as summarised by advisers and not yet read in the decision text (https://mof.gov.ae/wp-content/uploads/2026/02/UAE-Electronic-Invoicing-Guidelines_V-1.0-23Feb2026.pdf)'
  ),
  record(
    'ae.labour.gratuity', { firstYears: 5, daysPerYearFirst: 21, daysPerYearAfter: 30, minimumServiceDays: 365, capMonthsOfWage: 24, dayRateDivisor: 30, wageBasis: 'last-basic-wage', unpaidAbsenceExcluded: true }, 'end_of_service_gratuity_for_full_time_private_sector_workers',
    '2022-02-02', null, 'Federal Decree-Law 33 of 2021 on the Regulation of Labour Relations', '51; Cabinet Resolution 1 of 2022',
    'Article 51: a full-time worker with at least one year of continuous service earns 21 days of the last basic wage for each of the first five years and 30 days for each further year, pro rata for part years, capped at two years of wage; days of unpaid absence do not count; the day rate is the basic monthly wage divided by 30 as MOHRE computes it (https://www.zoho.com/en-ae/payroll/academy/compliance/uae-gratuity-by-tenure.html, https://gulfnews.com/living-in-uae/ask-us/unpaid-leave-days-will-not-be-included-in-gratuity-calculation-mohre-1.1673617486269)'
  ),
  record(
    'ae.labour.wps', { employeeIdLength: 14, routingCodeLength: 9, employerIdMaxLength: 13, accountMaxLength: 23, currency: 'AED', employerReferenceMaxLength: 35 }, 'wage_protection_system_salary_information_file_layout',
    '2009-09-01', null, 'Ministerial Resolution 788 of 2009 on the Wage Protection System; Federal Decree-Law 33 of 2021', '22',
    'Central Bank of the UAE Wage Protection System salary information file (SIF): one EDR line per employee (labour id, agent routing code, IBAN, pay start and end, days, fixed and variable pay, unpaid leave days) and one closing SCR line (employer id, bank routing code, file date and time, salary month MMYYYY, EDR count, total, AED, reference); file named employer id plus YYMMDDHHMMSS.SIF (https://netbanking.mashreqbank.com/B001/WPS_File_Format_eng.html)'
  ),
  record(
    'ae.labour.overtime', { wageBasis: 'basic', dayRateDivisor: 30, normalHoursPerDay: 8, overtimeBasisPoints: 12500, nightOvertimeBasisPoints: 15000, nightFrom: '22:00', nightTo: '04:00', restDayBasisPoints: 15000, maxOvertimeHoursPerDay: 2, shiftWorkersExcluded: true }, 'overtime_pay_as_basis_points_of_the_basic_hourly_wage',
    '2022-02-02', null, 'Federal Decree-Law 33 of 2021 on the Regulation of Labour Relations', '19; Cabinet Resolution 1 of 2022',
    'Overtime is paid at the normal hourly wage, based on the basic salary, plus 25%, rising to 50% for overtime between 10 pm and 4 am; work on a rest day earns a substitute day or the normal wage plus 50%; overtime may not exceed two hours a day and the rule does not apply to shift workers (UAE government portal, working hours in the private sector, https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/working-hours); the hourly wage is the basic monthly wage divided by 30 and by 8 hours (Hono, how to calculate overtime in the UAE, https://www.hono.ai/blog/how-to-calculate-overtime-in-uae)'
  ),
  record(
    'ae.labour.wage-deductions', { maxShareOfWageBasisPoints: 5000, allowed: ['disciplinary fines', 'loan or advance repayment', 'social insurance or pension contributions'] }, 'cap_on_deductions_from_the_wage_of_one_pay_period',
    '2022-02-02', null, 'Federal Decree-Law 33 of 2021 on the Regulation of Labour Relations', '25; Cabinet Resolution 1 of 2022',
    'Deductions from the wage (fines, loan or advance repayments, pension contributions) may not exceed 50% of the wage of the pay period (ATB Legal, UAE federal labour law: wages, https://atblegal.com/blog/uae-federal-labour-law/wages/)'
  ),
  record(
    'ae.pension.gpssa', { employeeBasisPoints: 1100, employerBasisPoints: 1500, governmentShareBasisPoints: 250, governmentShareBelowFils: 20000 * DIRHAM, contributionSalaryCapFils: 70000 * DIRHAM, coveredNationality: 'AE', contributionSalary: 'basic salary and allowances in the employment contract', registeredBefore: '2023-10-31' }, 'pension_contributions_for_uae_nationals_in_the_private_sector',
    '2024-01-01', null, 'Federal Decree-Law 57 of 2023 on Pensions and Social Security', 'Contributions',
    'Emirati private-sector workers who joined after 31 October 2023: employee 11% and employer 15% of the contribution salary, of which the government pays 2.5% when the contribution salary is below AED 20,000; contribution salary is the basic salary and contract allowances, capped at AED 70,000 for the private sector; payments from 1 January 2024 (DLA Piper, new UAE pensions law, https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2024/new-uae-pensions-law.html; The Talent Point, monthly pension contribution system for Emiratis, https://www.thetalentpoint.com/blog/monthly-pension-contribution-system-for-emiratis-in-private-sector)'
  ),
];
