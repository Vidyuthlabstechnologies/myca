import { csvRows } from './text-safe.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { salaryPrivate } from './employees.mjs';

const rupee = (p) => Math.round(Number(p || 0) / 100);
const toRupees = (p) => Number(p || 0) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function approvedRun(state, period) {
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-10.' });
  const run = state.payrollRuns && typeof state.payrollRuns === 'object' && Object.hasOwn(state.payrollRuns, period) ? state.payrollRuns[period] : null;
  if (!run || run.status !== 'approved') return fail('NOT_APPROVED', { period });
  return { ok: true, run };
}

function employeeOf(state, id) {
  return (state.employees || []).find((item) => item.id === id) || {};
}

export function pfEcr(state, requested) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const period = String(requested || '').trim();
  const found = approvedRun(state, period);
  if (!found.ok) return found;
  const { run } = found;
  const rows = [];
  const missing = [];
  for (const row of run.rows) {
    if (!row.pfWagesPaise) continue;
    const employee = employeeOf(state, row.employeeId);
    if (!employee.uan) missing.push(row.name);
    rows.push({
      uan: employee.uan || '',
      name: row.name,
      grossWages: rupee(row.grossPaise),
      epfWages: rupee(row.pfWagesPaise),
      epsWages: rupee(row.pfWagesPaise),
      edliWages: rupee(row.pfWagesPaise),
      epfContribution: rupee(row.pfEmployeePaise),
      epsContribution: rupee(row.epsPaise),
      epfEpsDifference: rupee(row.pfEmployerPaise + row.epsPaise) - rupee(row.epsPaise),
      ncpDays: row.daysInMonth - row.daysWorked,
      refundOfAdvances: 0,
    });
  }
  if (!rows.length) return fail('NO_PF_MEMBERS', { period });
  const text = rows.map((r) => [r.uan, r.name.toUpperCase(), r.grossWages, r.epfWages, r.epsWages, r.edliWages, r.epfContribution, r.epsContribution, r.epfEpsDifference, r.ncpDays, r.refundOfAdvances].join('#~#')).join('\n') + '\n';
  const sum = (key) => rows.reduce((total, r) => total + r[key], 0);
  const gstin = String(state.company?.gstin || '').trim();
  return {
    ok: true,
    data: {
      period,
      month: run.month,
      members: rows.length,
      rows,
      totals: { epfWages: sum('epfWages'), employeeShare: sum('epfContribution'), pensionShare: sum('epsContribution'), employerEpfShare: sum('epfEpsDifference'), edli: rupee(run.totals.edliPaise), adminCharge: rupee(run.totals.pfAdminPaise), remittance: sum('epfContribution') + sum('epsContribution') + sum('epfEpsDifference') + rupee(run.totals.edliPaise) + rupee(run.totals.pfAdminPaise) },
      missingUan: missing,
      fileName: `ECR_${gstin || 'books'}_${period}.txt`,
      text,
      caveat: 'ECR 2.0 layout: UAN, member name, gross wages, EPF wages, EPS wages, EDLI wages, EPF contribution, EPS contribution, EPF-EPS difference, NCP days, refund of advances, separated by #~#. Amounts are whole rupees as the portal expects; the books keep paise. A member without a UAN cannot be uploaded; add it on the employee.',
    },
  };
}

export function payrollPayoutFile(state, requested) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const period = String(requested || '').trim();
  const found = approvedRun(state, period);
  if (!found.ok) return found;
  const { run } = found;
  const rows = [];
  const missing = [];
  for (const row of run.rows) {
    const net = Number(row.netPaise ?? row.netCents ?? 0);
    if (net <= 0) continue;
    const employee = employeeOf(state, row.employeeId);
    if (!employee.bankAccount || !employee.ifsc) missing.push(row.name);
    rows.push({ employeeId: row.employeeId, name: row.name, account: employee.bankAccount || '', ifsc: employee.ifsc || '', amount: toRupees(net), narration: `SAL-${period}` });
  }
  if (!rows.length) return fail('NOTHING_TO_PAY', { period });
  const header = ['Beneficiary Name', 'Account Number', 'IFSC', 'Amount', 'Narration'];
  const csv = csvRows([header, ...rows.map((r) => [r.name, r.account, r.ifsc, r.amount.toFixed(2), r.narration])]);
  return {
    ok: true,
    data: {
      period,
      month: run.month,
      employees: rows.length,
      total: toRupees(rows.reduce((sum, r) => sum + Math.round(r.amount * 100), 0)),
      paidOn: run.paidOn || '',
      missingBank: missing,
      rows,
      fileName: `salary-payout-${period}.csv`,
      csv,
      note: missing.length ? 'Rows without an account cannot be uploaded; add bank details on the employee first.' : "Upload on the bank's bulk payment page, then record the salary payment here once it goes through.",
    },
  };
}

export function esiReturn(state, requested) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const period = String(requested || '').trim();
  const found = approvedRun(state, period);
  if (!found.ok) return found;
  const { run } = found;
  const rows = [];
  const missing = [];
  for (const row of run.rows) {
    if (!row.esiEmployerPaise && !row.esiEmployeePaise) continue;
    const employee = employeeOf(state, row.employeeId);
    if (!employee.esiNumber) missing.push(row.name);
    rows.push({
      ipNumber: employee.esiNumber || '',
      name: row.name,
      daysWorked: row.daysWorked,
      wages: rupee(row.grossPaise),
      employeeContribution: toRupees(row.esiEmployeePaise),
      employerContribution: toRupees(row.esiEmployerPaise),
      reasonCode: row.daysWorked === 0 ? '0' : '',
      lastWorkingDay: employee.leftOn && employee.leftOn.startsWith(period) ? employee.leftOn : '',
    });
  }
  if (!rows.length) return fail('NO_ESI_MEMBERS', { period });
  const header = ['IP Number', 'IP Name', 'No of Days', 'Total Monthly Wages', 'Reason Code for Zero workings days', 'Last Working Day'];
  const csv = csvRows([header, ...rows.map((r) => [r.ipNumber, r.name, r.daysWorked, r.wages, r.reasonCode, r.lastWorkingDay])]);
  const gstin = String(state.company?.gstin || '').trim();
  return {
    ok: true,
    data: {
      period,
      month: run.month,
      members: rows.length,
      rows,
      totals: { wages: rows.reduce((t, r) => t + r.wages, 0), employeeContribution: toRupees(run.totals.esiEmployeePaise), employerContribution: toRupees(run.totals.esiEmployerPaise), remittance: toRupees(run.totals.esiPayablePaise) },
      missingIp: missing,
      fileName: `ESI_${gstin || 'books'}_${period}.csv`,
      csv,
      caveat: 'The columns of the ESIC monthly contribution upload (IP number, name, days, wages, reason code, last working day); the portal works the contributions out from the wages. Save it as the Excel template before uploading. A member without an insurance number cannot be uploaded; add it on the employee.',
    },
  };
}
