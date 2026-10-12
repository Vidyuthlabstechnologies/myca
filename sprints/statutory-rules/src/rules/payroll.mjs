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
      monthlySlabs: {
        men: [{ monthlyPayUpToPaise: 7500 * RUPEE, paise: 0 }, { monthlyPayUpToPaise: 10000 * RUPEE, paise: 175 * RUPEE }, { monthlyPayUpToPaise: null, paise: 200 * RUPEE }],
        women: [{ monthlyPayUpToPaise: 25000 * RUPEE, paise: 0 }, { monthlyPayUpToPaise: null, paise: 200 * RUPEE }]
      },
      februaryPaiseWhereMonthlyIs200: 300 * RUPEE,
      yearlyMaximumPaise: 2500 * RUPEE
    },
    basis: 'monthly_professional_tax_by_pay_slab_and_sex',
    effectiveFrom: '2023-04-01',
    effectiveTo: IN_FORCE,
    act: 'MH-PT-1975',
    section: 'Schedule I entry 1',
    source: 'Maharashtra State Tax on Professions, Trades, Callings and Employments Act 1975, Schedule I entry 1 as amended from 01.04.2023: men earning up to seven thousand five hundred rupees a month nil, above that and up to ten thousand one hundred and seventy-five rupees a month, above ten thousand two hundred rupees a month and three hundred rupees for February (two thousand five hundred a year); women earning up to twenty-five thousand rupees a month nil, above that two hundred a month and three hundred for February; senior citizens and persons with disability exempt (not encoded; MyCA treats an employee with no sex recorded as a man, the higher charge)',
    attestations: []
  }
];
