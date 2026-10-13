const IN_FORCE = null;
const NOT_REREAD = 'figure as stated in the state agency guidance read on 2026-10-13; the statute text not re-read for this record; prepayment, accelerated and holiday-shifted schedules are not encoded';

export const RULES = [
  {
    id: 'us.salestax.due.TX',
    value: { dayOfMonthAfter: 20 },
    basis: 'sales_and_use_tax_return_and_payment_due_on_this_day_of_the_month_after_the_reporting_period_for_monthly_quarterly_and_annual_filers',
    effectiveFrom: '2020-01-01',
    effectiveTo: IN_FORCE,
    act: 'Tex. Tax Code',
    section: '151.401(a); 151.402(a)',
    source: `Texas Tax Code section 151.401(a): monthly, quarterly and yearly taxpayers report and pay on or before the 20th day of the month following the end of the reporting period (${NOT_REREAD}). Registry coverage starts 1 January 2020; the day was in force long before`,
    attestations: []
  },
  {
    id: 'us.salestax.due.CA',
    value: { lastDayOfMonthAfter: true },
    basis: 'sales_and_use_tax_return_and_payment_due_on_the_last_day_of_the_month_after_the_reporting_period_for_monthly_quarterly_and_annual_filers',
    effectiveFrom: '2020-01-01',
    effectiveTo: IN_FORCE,
    act: 'Cal. Rev. & Tax. Code',
    section: '6451; 6452',
    source: `California Revenue and Taxation Code sections 6451 and 6452: returns and payments are due on or before the last day of the month following each reporting period, as administered by the California Department of Tax and Fee Administration (${NOT_REREAD}). Registry coverage starts 1 January 2020`,
    attestations: []
  }
];
