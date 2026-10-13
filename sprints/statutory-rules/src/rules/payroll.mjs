const RUPEE = 100;
const IN_FORCE = null;
const NOT_REREAD = 'official text not re-read for this record; the Code on Social Security 2020, in force from 21.11.2025, may change the citation without changing the figure';

export const RULES = [
  {
    id: 'payroll.epf.wage-ceiling',
    value: { monthlyWagesPaise: 15000 * RUPEE },
    basis: 'monthly_pay_wages_paise_up_to_which_contributions_are_mandatory',
    effectiveFrom: '2014-09-01',
    effectiveTo: IN_FORCE,
    act: 'EPF-1952',
    section: 'EPF Scheme 1952 para 26A(2); EPS 1995 para 3(2); EDLI Scheme 1976 para 7(1)',
    source: `Notifications G.S.R. 608(E), 609(E) and 610(E) dated 22.08.2014 raising the wage ceiling from six thousand five hundred to fifteen thousand rupees a month from 01.09.2014; contributions above the ceiling are voluntary and not computed by MyCA (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'payroll.epf.employee-rate',
    value: { basisPoints: 1200 },
    basis: 'percent_of_pay_wages_up_to_ceiling_as_basis_points',
    effectiveFrom: '2014-09-01',
    effectiveTo: IN_FORCE,
    act: 'EPF-1952',
    section: 'Section 6',
    source: `Employees' Provident Funds and Miscellaneous Provisions Act 1952 section 6 as read with the notification raising the rate to twelve per cent for all establishments other than the notified classes at ten per cent (the ten per cent classes are not encoded); the employee's share equals the employer's (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'payroll.epf.employer-rate',
    value: { basisPoints: 1200, pensionBasisPoints: 833 },
    basis: 'percent_of_pay_wages_up_to_ceiling_as_basis_points_with_the_pension_share_diverted',
    effectiveFrom: '2014-09-01',
    effectiveTo: IN_FORCE,
    act: 'EPF-1952',
    section: 'Section 6; EPS 1995 para 3(1)',
    source: `Section 6 of the 1952 Act (twelve per cent) and Employees' Pension Scheme 1995 para 3(1): eight and one-third per cent of pay is diverted from the employer's share to the pension fund, the rest (three and two-thirds per cent) goes to the provident fund (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'payroll.edli.employer-rate',
    value: { basisPoints: 50 },
    basis: 'percent_of_pay_wages_up_to_ceiling_as_basis_points',
    effectiveFrom: '2014-09-01',
    effectiveTo: IN_FORCE,
    act: 'EDLI-1976',
    section: 'EDLI Scheme 1976 para 7(1)',
    source: `Employees' Deposit Linked Insurance Scheme 1976 para 7(1): employer contribution of one half of one per cent of pay up to the wage ceiling; the employee contributes nothing (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'payroll.epf.admin-charge',
    value: { basisPoints: 50, minimumPerMonthPaise: 500 * RUPEE },
    basis: 'percent_of_pay_wages_up_to_ceiling_as_basis_points_with_a_monthly_minimum',
    effectiveFrom: '2018-06-01',
    effectiveTo: IN_FORCE,
    act: 'EPF-1952',
    section: 'EPF Scheme 1952 para 38; section 6',
    source: `Notification S.O. 1710(E)/1711(E) dated 21.05.2018 (Ministry of Labour and Employment) fixing the administrative charges on the provident fund at one half of one per cent of pay from 01.06.2018, subject to a minimum of five hundred rupees a month for an establishment with members; EDLI administrative charges are nil since 01.04.2017 (${NOT_REREAD})`,
    attestations: []
  },
  {
    id: 'payroll.esi.wage-ceiling',
    value: { monthlyWagesPaise: 21000 * RUPEE },
    basis: 'monthly_gross_wages_paise_up_to_which_the_employee_is_covered',
    effectiveFrom: '2017-01-01',
    effectiveTo: IN_FORCE,
    act: 'ESI-1948',
    section: 'Rule 50, ESI (Central) Rules 1950',
    source: 'Notification G.S.R. 1166(E) dated 22.12.2016 substituting rule 50: wage limit for coverage raised from fifteen thousand to twenty-one thousand rupees a month from 01.01.2017 (twenty-five thousand for persons with disability, not encoded); an employee who crosses the limit during a contribution period stays covered until its end (not encoded; MyCA checks the month\'s wages)',
    attestations: []
  },
  {
    id: 'payroll.esi.rates',
    value: { employeeBasisPoints: 75, employerBasisPoints: 325, employeeExemptDailyWagesUpToPaise: 176 * RUPEE },
    basis: 'percent_of_gross_wages_as_basis_points',
    effectiveFrom: '2019-07-01',
    effectiveTo: IN_FORCE,
    act: 'ESI-1948',
    section: 'Rules 51 and 52, ESI (Central) Rules 1950',
    source: 'Notification G.S.R. 423(E) dated 13.06.2019 substituting rule 51: employee contribution three-quarters of one per cent and employer contribution three and one-quarter per cent of wages from 01.07.2019; rule 52: an employee whose average daily wages are up to one hundred and seventy-six rupees (from 01.09.2019) pays no contribution while the employer still pays its share; the employer share for such employees is still computed',
    attestations: []
  },
  {
    id: 'payroll.pt.27',
    value: {
      state: 'Maharashtra',
      basis: 'monthly',
      slabs: {
        men: [{ payUpToPaise: 7500 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 10000 * RUPEE, paise: 175 * RUPEE }, { payUpToPaise: null, paise: 200 * RUPEE, februaryPaise: 300 * RUPEE }],
        women: [{ payUpToPaise: 25000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: null, paise: 200 * RUPEE, februaryPaise: 300 * RUPEE }]
      }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2023-04-01',
    effectiveTo: IN_FORCE,
    act: 'MH-PT-1975',
    section: 'Schedule I entry 1',
    source: 'Maharashtra State Tax on Professions, Trades, Callings and Employments Act 1975, Schedule I entry 1 as amended from 01.04.2023: men earning up to seven thousand five hundred rupees a month nil, above that and up to ten thousand one hundred and seventy-five rupees a month, above ten thousand two hundred rupees a month and three hundred rupees for February (two thousand five hundred a year); women earning up to twenty-five thousand rupees a month nil, above that two hundred a month and three hundred for February; senior citizens and persons with disability exempt (not encoded; MyCA treats an employee with no sex recorded as a man, the higher charge)',
    attestations: []
  },
  {
    id: 'payroll.pt.29',
    value: {
      state: 'Karnataka',
      basis: 'monthly',
      slabs: { all: [{ payUpToPaise: 2499999, paise: 0 * RUPEE }, { payUpToPaise: null, paise: 200 * RUPEE, februaryPaise: 300 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2025-04-01',
    effectiveTo: IN_FORCE,
    act: 'KA-PT-1976',
    section: 'Schedule entry 1',
    source: 'Karnataka Tax on Profession, Trades, Callings and Employments Act 1976, Schedule entry 1 as amended by the Amendment Act 2023 from 01.04.2023 (nil below twenty-five thousand rupees a month, two hundred a month at twenty-five thousand and above) and the Amendment Act 2025 with effect from 01.04.2025 (three hundred rupees for February, two thousand five hundred a year); figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.19',
    value: {
      state: 'West Bengal',
      basis: 'monthly',
      slabs: { all: [{ payUpToPaise: 10000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 15000 * RUPEE, paise: 110 * RUPEE }, { payUpToPaise: 25000 * RUPEE, paise: 130 * RUPEE }, { payUpToPaise: 40000 * RUPEE, paise: 150 * RUPEE }, { payUpToPaise: null, paise: 200 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'WB-PT-1979',
    section: 'Schedule entry 1',
    source: 'West Bengal State Tax on Professions, Trades, Callings and Employments Act 1979, Schedule entry 1: up to ten thousand rupees a month nil, up to fifteen thousand one hundred and ten, up to twenty-five thousand one hundred and thirty, up to forty thousand one hundred and fifty, above that two hundred; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.36',
    value: {
      state: 'Telangana',
      basis: 'monthly',
      slabs: { all: [{ payUpToPaise: 15000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 20000 * RUPEE, paise: 150 * RUPEE }, { payUpToPaise: null, paise: 200 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'TS-PT-1987',
    section: 'First Schedule entry 1',
    source: 'Telangana Tax on Professions, Trades, Callings and Employments Act 1987, First Schedule entry 1: up to fifteen thousand rupees a month nil, up to twenty thousand one hundred and fifty, above that two hundred; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.37',
    value: {
      state: 'Andhra Pradesh',
      basis: 'monthly',
      slabs: { all: [{ payUpToPaise: 15000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 20000 * RUPEE, paise: 150 * RUPEE }, { payUpToPaise: null, paise: 200 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'AP-PT-1987',
    section: 'First Schedule entry 1',
    source: 'Andhra Pradesh Tax on Professions, Trades, Callings and Employments Act 1987, First Schedule entry 1: up to fifteen thousand rupees a month nil, up to twenty thousand one hundred and fifty, above that two hundred; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.24',
    value: {
      state: 'Gujarat',
      basis: 'monthly',
      slabs: { all: [{ payUpToPaise: 12000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: null, paise: 200 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'GJ-PT-1976',
    section: 'Schedule entry 1',
    source: 'Gujarat State Tax on Professions, Trades, Callings and Employments Act 1976, Schedule entry 1 as revised from 01.04.2022: up to twelve thousand rupees a month nil, above that two hundred a month; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.23',
    value: {
      state: 'Madhya Pradesh',
      basis: 'annual',
      slabs: { all: [{ payUpToPaise: 225000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 300000 * RUPEE, paise: 125 * RUPEE }, { payUpToPaise: 400000 * RUPEE, paise: 166 * RUPEE, lastMonthPaise: 174 * RUPEE }, { payUpToPaise: null, paise: 208 * RUPEE, lastMonthPaise: 212 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'MP-PT-1995',
    section: 'Schedule entry 1',
    source: 'Madhya Pradesh Vritti Kar Adhiniyam 1995, Schedule entry 1, by annual pay: up to two lakh twenty-five thousand rupees nil, up to three lakh one hundred and twenty-five a month, up to four lakh one hundred and sixty-six a month and one hundred and seventy-four in the last month (two thousand a year), above that two hundred and eight a month and two hundred and twelve in the last month (two thousand five hundred a year); the annual pay is taken as twelve times the month\'s full pay; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.21',
    value: {
      state: 'Odisha',
      basis: 'monthly',
      slabs: { all: [{ payUpToPaise: 13304 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 25000 * RUPEE, paise: 125 * RUPEE }, { payUpToPaise: null, paise: 200 * RUPEE, februaryPaise: 300 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'OD-PT-2000',
    section: 'Schedule entry 1',
    source: 'Odisha State Tax on Professions, Trades, Callings and Employments Act 2000, Schedule entry 1: up to thirteen thousand three hundred and four rupees a month nil, up to twenty-five thousand one hundred and twenty-five, above that two hundred a month and three hundred for February; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.10',
    value: {
      state: 'Bihar',
      basis: 'annual',
      slabs: { all: [{ payUpToPaise: 300000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 500000 * RUPEE, paise: 83 * RUPEE, lastMonthPaise: 87 * RUPEE }, { payUpToPaise: 1000000 * RUPEE, paise: 166 * RUPEE, lastMonthPaise: 174 * RUPEE }, { payUpToPaise: null, paise: 208 * RUPEE, lastMonthPaise: 212 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'BR-PT-2011',
    section: 'Schedule',
    source: 'Bihar Tax on Professions, Trades, Callings and Employments Act 2011, Schedule, by annual pay: up to three lakh rupees nil, up to five lakh one thousand a year, up to ten lakh two thousand a year, above that two thousand five hundred a year; the annual amount is spread as eleven equal months and the balance in March, and the annual pay is taken as twelve times the month\'s full pay; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-13; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.20',
    value: {
      state: 'Jharkhand',
      basis: 'annual',
      slabs: { all: [{ payUpToPaise: 300000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 500000 * RUPEE, paise: 100 * RUPEE }, { payUpToPaise: 800000 * RUPEE, paise: 150 * RUPEE }, { payUpToPaise: 1000000 * RUPEE, paise: 175 * RUPEE }, { payUpToPaise: null, paise: 208 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'JH-PT-2011',
    section: 'Schedule entry 1',
    source: 'Jharkhand Tax on Professions, Trades, Callings and Employments Act 2011, Schedule entry 1, by annual pay: up to three lakh rupees nil, up to five lakh one hundred a month, up to eight lakh one hundred and fifty, up to ten lakh one hundred and seventy-five, above that two hundred and eight a month (whether the last month carries two hundred and twelve to reach two thousand five hundred is not confirmed; MyCA charges two hundred and eight); the annual pay is taken as twelve times the month\'s full pay; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.18',
    value: {
      state: 'Assam',
      basis: 'monthly',
      slabs: { all: [{ payUpToPaise: 15000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 2499999, paise: 180 * RUPEE }, { payUpToPaise: null, paise: 208 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2025-04-01',
    effectiveTo: IN_FORCE,
    act: 'AS-PT-1947',
    section: 'Schedule entry 1',
    source: 'Assam Professions, Trades, Callings and Employments Taxation Act 1947, Schedule entry 1 as revised from 01.04.2025: up to fifteen thousand rupees a month nil, above that and below twenty-five thousand one hundred and eighty, twenty-five thousand and above two hundred and eight; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.22',
    value: {
      state: 'Chhattisgarh',
      basis: 'annual',
      slabs: { all: [{ payUpToPaise: 100000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 150000 * RUPEE, paise: 130 * RUPEE }, { payUpToPaise: 200000 * RUPEE, paise: 150 * RUPEE }, { payUpToPaise: 250000 * RUPEE, paise: 200 * RUPEE }, { payUpToPaise: null, paise: 208 * RUPEE, lastMonthPaise: 212 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'CG-PT-1995',
    section: 'Schedule entry 1',
    source: 'Chhattisgarh Vritti Kar Adhiniyam 1995, Schedule entry 1, by annual pay: up to one lakh rupees nil, up to one and a half lakh one hundred and thirty a month, up to two lakh one hundred and fifty, up to two and a half lakh two hundred, above that two hundred and eight a month and two hundred and twelve in the last month; the annual pay is taken as twelve times the month\'s full pay; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.03',
    value: {
      state: 'Punjab',
      basis: 'annual',
      slabs: { all: [{ payUpToPaise: 250000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: null, paise: 200 * RUPEE }] }
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'PB-SDT-2018',
    section: 'Section 4 and Schedule',
    source: 'Punjab State Development Tax Act 2018: two hundred rupees a month from every person whose income is liable to income tax, taken as annual pay above the basic exemption of two lakh fifty thousand rupees; the annual pay is taken as twelve times the month\'s full pay; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.33',
    value: {
      state: 'Tamil Nadu (Greater Chennai)',
      basis: 'half-yearly',
      slabs: { all: [{ payUpToPaise: 21000 * RUPEE, paise: 0 * RUPEE }, { payUpToPaise: 30000 * RUPEE, paise: 180 * RUPEE }, { payUpToPaise: 45000 * RUPEE, paise: 425 * RUPEE }, { payUpToPaise: 60000 * RUPEE, paise: 930 * RUPEE }, { payUpToPaise: 75000 * RUPEE, paise: 1025 * RUPEE }, { payUpToPaise: null, paise: 1250 * RUPEE }] },
      deductedInMonths: [9, 3]
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'TN-CC-1919',
    section: 'Section 138C and Schedule',
    source: 'Tamil Nadu Municipal Laws (Second Amendment) Act 1998 read with the Greater Chennai Corporation schedule revised from 2024-25, by half-yearly pay: up to twenty-one thousand rupees nil, up to thirty thousand one hundred and eighty, up to forty-five thousand four hundred and twenty-five, up to sixty thousand nine hundred and thirty, up to seventy-five thousand one thousand and twenty-five, above that one thousand two hundred and fifty, deducted in September and March; other local bodies in the State set their own schedules (not encoded); the half-yearly pay is taken as six times the month\'s full pay; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  },
  {
    id: 'payroll.pt.32',
    value: {
      state: 'Kerala',
      basis: 'half-yearly',
      slabs: { all: [{ payUpToPaise: 1199999, paise: 0 * RUPEE }, { payUpToPaise: 1799999, paise: 120 * RUPEE }, { payUpToPaise: 2999999, paise: 180 * RUPEE }, { payUpToPaise: 4499999, paise: 300 * RUPEE }, { payUpToPaise: 5999999, paise: 450 * RUPEE }, { payUpToPaise: 7499999, paise: 600 * RUPEE }, { payUpToPaise: 9999999, paise: 750 * RUPEE }, { payUpToPaise: 12499999, paise: 1000 * RUPEE }, { payUpToPaise: null, paise: 1250 * RUPEE }] },
      deductedInMonths: [8, 2]
    },
    basis: 'professional_tax_by_pay_slab',
    effectiveFrom: '2024-04-01',
    effectiveTo: IN_FORCE,
    act: 'KL-MA-1994',
    section: 'Section 254',
    source: 'Kerala Municipality Act 1994 section 254 and the Kerala Municipality (Profession Tax) Rules 2005, by half-yearly pay: below twelve thousand rupees nil, then one hundred and twenty, one hundred and eighty, three hundred, four hundred and fifty, six hundred, seven hundred and fifty, one thousand, and one thousand two hundred and fifty from one lakh twenty-five thousand, paid by 31 August and the end of February (MyCA deducts in August and February); panchayats levy under the Panchayat Raj Act with the same slabs; the half-yearly pay is taken as six times the month\'s full pay; figures as published by payroll and tax sites in 2025-26 and checked against each other on 2026-10-12; the official schedule was not re-read for this record',
    attestations: []
  }
];
