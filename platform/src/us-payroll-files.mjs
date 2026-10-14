import { csvRows } from './text-safe.mjs';
import { usPayrollFilings } from './us-payroll.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

export function form941File(state, args = {}) {
  const quarter = String(args.quarter || '').trim().toUpperCase();
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) return { ok: false, error: 'BAD_QUARTER', hint: 'Use the quarter as 2026-Q3.' };
  const filings = usPayrollFilings(state, { year: match[1] });
  if (!filings.ok) return filings;
  const q = filings.data.quarters.find((row) => row.quarter === quarter);
  if (!q || q.months === 0) return { ok: false, error: 'NO_PAYROLL', quarter };
  const lines = [
    ['line', 'description', 'amount'],
    ['2', 'Wages, tips, and other compensation', q.wages],
    ['3', 'Federal income tax withheld', q.federalWithholding],
    ['5a', 'Taxable social security wages', q.socialSecurityWages],
    ['5a_tax', 'Social security tax (both halves)', q.socialSecurityTax],
    ['5c', 'Taxable Medicare wages and tips', q.medicareWages],
    ['5c_tax', 'Medicare tax (both halves)', q.medicareTax],
    ['5d_tax', 'Additional Medicare tax withheld', q.additionalMedicareTax],
    ['6', 'Total taxes before adjustments', q.totalTaxes],
  ];
  return {
    ok: true,
    data: {
      quarter,
      form: 'Form 941, Employer\'s Quarterly Federal Tax Return (draft lines)',
      business: { name: state.company?.name || '', ein: state.company?.ein || '' },
      months: q.months,
      dueDate: q.dueDate,
      filed: q.filed,
      lines: lines.slice(1).map(([line, description, amount]) => ({ line, description, amount })),
      fileName: `form_941_${quarter}.csv`,
      csv: csvRows(lines),
      unreviewed: filings.data.unreviewed,
      notes: ['Draft lines from approved payroll months; deposits made, adjustments and Schedule B are not in these books.', ...(filings.data.unreviewed ? ['The due date comes from a dated rule a CPA has not reviewed yet.'] : [])],
    },
  };
}

export function w2File(state, args = {}) {
  const year = String(args.year || '').trim();
  if (!/^\d{4}$/.test(year)) return { ok: false, error: 'BAD_YEAR', year };
  const filings = usPayrollFilings(state, { year });
  if (!filings.ok) return filings;
  const employees = (state.employees || []);
  const rows = filings.data.w2.map((w) => {
    const employee = employees.find((item) => item.id === w.employeeId) || {};
    return { ...w, address: employee.address || '', tinLast4: String(employee.ssnLast4 || employee.tinLast4 || '') };
  });
  if (!rows.length) return { ok: false, error: 'NO_PAYROLL', year };
  const totals = rows.reduce((sum, w) => ({
    wages: round2(sum.wages + w.wages),
    federalWithheld: round2(sum.federalWithheld + w.federalWithheld),
    socialSecurityWages: round2(sum.socialSecurityWages + w.socialSecurityWages),
    socialSecurityWithheld: round2(sum.socialSecurityWithheld + w.socialSecurityWithheld),
    medicareWages: round2(sum.medicareWages + w.medicareWages),
    medicareWithheld: round2(sum.medicareWithheld + w.medicareWithheld),
    stateWithheld: round2(sum.stateWithheld + w.stateWithheld),
  }), { wages: 0, federalWithheld: 0, socialSecurityWages: 0, socialSecurityWithheld: 0, medicareWages: 0, medicareWithheld: 0, stateWithheld: 0 });
  const header = ['form', 'employee', 'tin_last4', 'box1_wages', 'box2_federal_withheld', 'box3_social_security_wages', 'box4_social_security_withheld', 'box5_medicare_wages', 'box6_medicare_withheld', 'box17_state_withheld'];
  const csv = csvRows([
    header,
    ...rows.map((w) => ['W-2', w.name, w.tinLast4, w.wages, w.federalWithheld, w.socialSecurityWages, w.socialSecurityWithheld, w.medicareWages, w.medicareWithheld, w.stateWithheld]),
    ['W-3', 'Totals', '', totals.wages, totals.federalWithheld, totals.socialSecurityWages, totals.socialSecurityWithheld, totals.medicareWages, totals.medicareWithheld, totals.stateWithheld],
  ]);
  return {
    ok: true,
    data: {
      year,
      form: 'Forms W-2 and W-3 (draft boxes)',
      business: { name: state.company?.name || '', ein: state.company?.ein || '' },
      employees: rows,
      w3: totals,
      dueDate: filings.data.w2DueDate,
      fileName: `forms_w2_w3_${year}.csv`,
      csv,
      unreviewed: filings.data.unreviewed,
      notes: ['Box figures from approved payroll months. Only the last four digits of a Social Security number are ever kept; your CPA completes the forms with the full numbers from the employee records you hold.', ...(filings.data.unreviewed ? ['The due date comes from a dated rule a CPA has not reviewed yet.'] : [])],
    },
  };
}

export function payrollFileWords(name, data, money) {
  if (name === 'payroll_941_file') return `Form 941 for ${data.quarter}: wages ${money(data.lines[0].amount)}, total taxes ${money(data.lines[7].amount)}${data.dueDate ? `, due ${data.dueDate}` : ''}. Saved as ${data.fileName}.`;
  return `W-2 drafts for ${data.year}: ${data.employees.length} employee${data.employees.length === 1 ? '' : 's'}, wages ${money(data.w3.wages)}, federal withheld ${money(data.w3.federalWithheld)}${data.dueDate ? `, due ${data.dueDate}` : ''}. Saved as ${data.fileName}.`;
}
