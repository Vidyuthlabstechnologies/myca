const IN_FORCE = null;
const LAST_DAY_UNDER_1961 = '2026-03-31';
const FIRST_DAY_UNDER_2025 = '2026-04-01';

const QRMP_22ND_STATES = [
  ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['27', 'Maharashtra'], ['29', 'Karnataka'],
  ['30', 'Goa'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'],
  ['25', 'Daman and Diu'], ['26', 'Dadra and Nagar Haveli'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'], ['31', 'Lakshadweep']
];

const QRMP_24TH_STATES = [
  ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['05', 'Uttarakhand'], ['06', 'Haryana'], ['08', 'Rajasthan'],
  ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'],
  ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'],
  ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['01', 'Jammu and Kashmir'], ['38', 'Ladakh'],
  ['04', 'Chandigarh'], ['07', 'Delhi']
];

const PERIOD_END_LOOKUP = 'Looked up by the last day of the return period; the due day is not moved for weekends or holidays';
const RULE_61_SUBSTITUTED = 'CGST Rules 2017 rule 61 as substituted w.e.f. 01.01.2021 by Notification No. 82/2020-Central Tax dated 10.11.2020 (CBIC tax portal, rule 61, footnote 1)';
const STATE_CODES = 'state codes are the GSTIN state codes of the States and Union territories the rule names';
const FA_2026_SECTION_5 = 'Income-tax Act 1961 s.139(1) Explanation 2 as substituted by the Finance Act, 2026 (No. 4 of 2026) s.5, deemed w.e.f. 01.03.2026 (Gazette of India, 30.03.2026)';
const FA_2026_SECTION_66 = 'Income-tax Act 2025 (30 of 2025) s.263(1)(c) Table as substituted by the Finance Act, 2026 (No. 4 of 2026) s.66, in force 01.04.2026 (Gazette of India, 30.03.2026)';

function states(pairs) {
  return pairs.map(([code, name]) => ({ code, name }));
}

function record(id, value, effectiveFrom, effectiveTo, act, section, source) {
  return { id, value, basis: 'period_end', effectiveFrom, effectiveTo, act, section, source: `${source}. ${PERIOD_END_LOOKUP}`, attestations: [] };
}

function extension(dueRule, periodEnd, dueDates, act, section, source) {
  return {
    id: `due-date.extension.${dueRule.slice('due-date.'.length)}.${periodEnd}`,
    value: { dueRule, periodEnd, dueDates },
    basis: 'period_end',
    effectiveFrom: periodEnd,
    effectiveTo: periodEnd,
    act,
    section,
    source,
    attestations: []
  };
}

const GST_RULES = [
  record(
    'due-date.gst.gstr-1.monthly',
    { period: 'month', monthsAfterPeriodEnd: 1, day: 11 },
    '2021-01-01', IN_FORCE, 'CGST', '37(1)',
    'Notification No. 83/2020-Central Tax dated 10.11.2020 (w.e.f. 01.01.2021) under the proviso to s.37(1) read with s.168 extends FORM GSTR-1 to the eleventh day of the month succeeding the tax period; s.37(1) itself says the tenth day'
  ),
  record(
    'due-date.gst.gstr-1.quarterly',
    { period: 'quarter', monthsAfterPeriodEnd: 1, day: 13 },
    '2021-01-01', IN_FORCE, 'CGST', '37(1)',
    'Notification No. 83/2020-Central Tax dated 10.11.2020 (w.e.f. 01.01.2021), proviso: persons filing quarterly under the proviso to s.39(1) (QRMP) furnish FORM GSTR-1 by the thirteenth day of the month succeeding the quarter'
  ),
  record(
    'due-date.gst.iff',
    { period: 'month', onlyQuarterMonths: [1, 2], optional: true, monthsAfterPeriodEnd: 1, day: 13 },
    '2021-01-01', IN_FORCE, 'CGST', '37(1)',
    'CGST Rules 2017 rule 59(2): QRMP filers may use the invoice furnishing facility for the first and second months of a quarter from the 1st till the 13th day of the succeeding month; optional, and the GST portal IFF FAQ gives the 13th as the last date'
  ),
  record(
    'due-date.gst.gstr-3b.monthly',
    { period: 'month', monthsAfterPeriodEnd: 1, day: 20 },
    '2021-01-01', IN_FORCE, 'CGST', '39(1)',
    `${RULE_61_SUBSTITUTED}, sub-rule (1)(i): FORM GSTR-3B for each month on or before the twentieth day of the month succeeding such month`
  ),
  record(
    'due-date.gst.gstr-3b.quarterly',
    {
      period: 'quarter',
      monthsAfterPeriodEnd: 1,
      dayByState: [
        { day: 22, states: states(QRMP_22ND_STATES) },
        { day: 24, states: states(QRMP_24TH_STATES) }
      ]
    },
    '2021-01-01', IN_FORCE, 'CGST', '39(1) proviso',
    `${RULE_61_SUBSTITUTED}, sub-rule (1)(ii) Table: twenty-second or twenty-fourth day of the month succeeding the quarter by the State or Union territory of the principal place of business; ${STATE_CODES}`
  ),
  record(
    'due-date.gst.pmt-06',
    { period: 'month', onlyQuarterMonths: [1, 2], monthsAfterPeriodEnd: 1, day: 25 },
    '2021-01-01', IN_FORCE, 'CGST', '39(7) proviso',
    `${RULE_61_SUBSTITUTED}, sub-rule 61(3): QRMP filers deposit tax for each of the first two months of the quarter in FORM GST PMT-06 by the twenty-fifth day of the month succeeding such month`
  ),
  record(
    'due-date.gst.gstr-7',
    { period: 'month', monthsAfterPeriodEnd: 1, day: 10 },
    '2024-11-01', IN_FORCE, 'CGST', '39(3)',
    'CGST Rules 2017 rule 66(1): FORM GSTR-7 on or before the tenth day of the month succeeding the calendar month, inserted w.e.f. 01.11.2024 by Notification No. 20/2024-Central Tax dated 08.10.2024 after s.39(3) was amended to leave the time to the rules; required only of persons deducting GST TDS under s.51'
  ),
  record(
    'due-date.gst.gstr-9',
    { period: 'year', monthsAfterPeriodEnd: 9, day: 31 },
    '2021-08-01', IN_FORCE, 'CGST', '44',
    'CGST Act s.44 and CGST Rules 2017 rule 80(1) as substituted by Notification No. 30/2021-Central Tax dated 30.07.2021: FORM GSTR-9 on or before the thirty-first day of December following the end of the financial year'
  )
];

const TDS_DEPOSIT = { period: 'month', monthsAfterPeriodEnd: 1, day: 7, overrides: [{ periodEndMonth: 3, monthsAfterPeriodEnd: 1, day: 30 }], appliesTo: 'non-government deductors' };

const INCOME_TAX_RULES = [
  record(
    'due-date.tds.deposit', TDS_DEPOSIT,
    '2025-04-01', LAST_DAY_UNDER_1961, 'IT-1961', '200(1)',
    'Income-tax Rules 1962 rule 30(2): tax deducted in March by 30 April, otherwise within seven days from the end of the month of deduction; e-filing portal Tax Payments FAQ confirms 30 April 2026 for March 2026 deductions by non-government deductors'
  ),
  record(
    'due-date.tds.deposit', TDS_DEPOSIT,
    FIRST_DAY_UNDER_2025, IN_FORCE, 'IT-2025', '397(3)(a)',
    'Income-tax Act 2025 s.397(3)(a) leaves the time to the rules; Income-tax Rules 2026 (G.S.R. 198(E), 20.03.2026) rule 218, which the e-filing portal Tax Payments FAQ says corresponds to rule 30 of the 1962 Rules and keeps the same timelines: the 7th of the following month, 30 April for March'
  ),
  record(
    'due-date.tds.statement',
    { period: 'quarter', monthsAfterPeriodEnd: 1, day: 31, overrides: [{ periodEndMonth: 3, monthsAfterPeriodEnd: 2, day: 31 }], forms: ['138', '140'] },
    FIRST_DAY_UNDER_2025, IN_FORCE, 'IT-2025', '397(3)(b)',
    'Income-tax Act 2025 s.397(3)(b) leaves the time to the Income-tax Rules 2026; e-filing portal Form 138 (earlier 24Q) and Form 140 (earlier 26Q) user manuals: Q1 31 July, Q2 31 October, Q3 31 January, Q4 31 May of the following financial year'
  ),
  record(
    'due-date.income-tax.advance-tax',
    {
      period: 'year',
      instalments: [
        { month: 6, day: 15, cumulativePercent: 15 },
        { month: 9, day: 15, cumulativePercent: 45 },
        { month: 12, day: 15, cumulativePercent: 75 },
        { month: 3, day: 15, cumulativePercent: 100 }
      ]
    },
    FIRST_DAY_UNDER_2025, IN_FORCE, 'IT-2025', '408(1)',
    'Income-tax Act 2025 (30 of 2025) s.408(1) Table: not less than 15% by 15 June, 45% by 15 September, 75% by 15 December and the whole by 15 March of the financial year'
  ),
  record(
    'due-date.income-tax.advance-tax.presumptive',
    { period: 'year', instalments: [{ month: 3, day: 15, cumulativePercent: 100 }] },
    FIRST_DAY_UNDER_2025, IN_FORCE, 'IT-2025', '408(2)',
    'Income-tax Act 2025 (30 of 2025) s.408(2): an assessee declaring profits under s.58(2) Table Sl. No. 1 or 3 pays the whole advance tax on or before 15 March'
  )
];

const RETURN_ROWS = [
  ['due-date.income-tax.return.transfer-pricing', 8, 30, 'assessee, partner of the firm or spouse, where the transfer-pricing report provisions apply (s.92E of the 1961 Act, s.172 of the 2025 Act)'],
  ['due-date.income-tax.return.audit', 7, 31, 'company; assessee whose accounts must be audited under the Act or any other law; partner of such a firm or spouse; transfer-pricing report provisions not applying'],
  ['due-date.income-tax.return.non-audit-business', 5, 31, 'assessee with business or profession income whose accounts need no audit; partner of such a firm or spouse; transfer-pricing report provisions not applying'],
  ['due-date.income-tax.return.other', 4, 31, 'any other assessee']
];

const RETURN_RULES = RETURN_ROWS.flatMap(([id, monthsAfterPeriodEnd, day, appliesTo]) => {
  const value = { period: 'year', monthsAfterPeriodEnd, day, appliesTo };
  return [
    record(id, value, '2026-03-01', LAST_DAY_UNDER_1961, 'IT-1961', '139(1) Explanation 2', FA_2026_SECTION_5),
    record(id, value, FIRST_DAY_UNDER_2025, IN_FORCE, 'IT-2025', '263(1)(c)', FA_2026_SECTION_66)
  ];
});

const OTHER_RULES = [
  record(
    'due-date.esi.contribution',
    { period: 'month', monthsAfterPeriodEnd: 1, day: 15 },
    '2017-01-01', IN_FORCE, 'ESI-1948', 'ESI (General) Regulations 1950 reg. 31',
    'Employees\' State Insurance (General) Regulations 1950 regulation 31, as amended by ESIC notification of 2017: the employer pays the contribution for a calendar month within fifteen days of the last day of that month, through the ESIC portal challan (official text not re-read for this record; the Code on Social Security 2020 in force from 21.11.2025 may change the citation)'
  ),
  record(
    'due-date.pf.contribution',
    { period: 'month', monthsAfterPeriodEnd: 1, day: 15 },
    '2025-04-01', IN_FORCE, 'EPF-1952', 'EPF Scheme 1952 para 38(1)',
    'Employees\' Provident Funds Scheme 1952 para 38(1): the employer pays contributions and administrative charges within fifteen days of the close of every month (official text not re-read for this record; the Code on Social Security 2020 in force from 21.11.2025 may change the citation)'
  ),
  {
    id: 'due-date.rollover',
    value: { weekend: false, holiday: false, movedOnlyBy: 'notified-extension' },
    effectiveFrom: '2021-01-01',
    effectiveTo: IN_FORCE,
    act: 'MyCA',
    section: '',
    source: 'Phase 0 design H2: every provision cited in the due-date records fixes a calendar day and none moves a day that falls on a weekend or holiday; a later day applies only through a notified extension, recorded as a due-date.extension.<rule>.<period end> record (for example Notification No. 01/2026-Central Tax); whether s.10 of the General Clauses Act 1897 applies to electronic filing is left to the advisor CA',
    attestations: []
  }
];

const EXTENSIONS = [
  extension(
    'due-date.gst.gstr-3b.monthly', '2026-03-31',
    [{ dueDate: '2026-04-21', stateCodes: null }],
    'CGST', '39(6)',
    'Notification No. 01/2026-Central Tax dated 21.04.2026 extends the due date for FORM GSTR-3B for the month of March 2026 till the twenty-first day of April 2026 (GST Council Secretariat Newsletter, Issue 85, April 2026); monthly filers under s.39(1) and rule 61(1)(i)'
  )
];

export const RULES = [...GST_RULES, ...INCOME_TAX_RULES, ...RETURN_RULES, ...OTHER_RULES, ...EXTENSIONS];
