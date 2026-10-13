import { createHash } from 'node:crypto';
import { rules } from './sprint-load.mjs';
import { createAccounts, createTransfers, TRANSFER_FLAGS } from './ledger.mjs';
import { localToday } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { salaryOn, salaryPrivate } from './employees.mjs';
import { ensurePayrollAccounts } from './payroll.mjs';

export const US_PAYROLL_ACCOUNTS = [
  { id: 2340, code: '2340', name: 'Federal payroll taxes payable', type: 'liability' },
  { id: 2350, code: '2350', name: 'Federal unemployment tax payable', type: 'liability' },
  { id: 2360, code: '2360', name: 'State withholding payable', type: 'liability' },
];

export const NO_INCOME_TAX_STATES = ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const toDollars = (cents) => cents / 100;
const cents = (dollars) => Math.round(Number(dollars || 0) * 100);

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function ensureUsPayrollAccounts(ledger) {
  ensurePayrollAccounts(ledger);
  createAccounts(ledger, US_PAYROLL_ACCOUNTS.map((account) => ({ ...account, flags: 0 })));
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 100000) + 1;
  return BigInt(state.transferSeq);
}

function monthName(period) {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function daysIn(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function lastDay(period) {
  return `${period}-${String(daysIn(period)).padStart(2, '0')}`;
}

function ruleOn(id, date, used, unreviewed) {
  const found = rules.rule(id, date);
  if (!found.ok) return { error: 'PAYROLL_RULE_MISSING', ruleId: id };
  const key = `${found.record.id}@${found.record.effectiveFrom}`;
  if (!used.includes(key)) used.push(key);
  if (!(found.record.attestations || []).length) unreviewed.add(key);
  return { value: found.record.value };
}

function daysWorked(employee, period) {
  const start = `${period}-01`;
  const end = lastDay(period);
  const from = employee.joinedOn > start ? employee.joinedOn : start;
  const to = employee.leftOn && employee.leftOn < end ? employee.leftOn : end;
  if (to < from) return 0;
  return Number(to.slice(8, 10)) - Number(from.slice(8, 10)) + 1;
}

function runRecord(state, period) {
  const all = state.payrollRuns && typeof state.payrollRuns === 'object' ? state.payrollRuns : {};
  return Object.hasOwn(all, period) ? all[period] : null;
}

function approvedRunsOfYear(state, year, beforePeriod) {
  return Object.values(state.payrollRuns || {}).filter((run) => run.country === 'US' && run.period.startsWith(year) && (!beforePeriod || run.period < beforePeriod));
}

function ytdFor(state, employeeId, year, beforePeriod) {
  let wages = 0;
  for (const run of approvedRunsOfYear(state, year, beforePeriod)) {
    for (const row of run.rows) if (row.employeeId === employeeId) wages += row.grossCents;
  }
  return wages;
}

export function computeUsPayroll(state, requested) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const period = String(requested || '').trim() || localToday().slice(0, 7);
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-10.' });
  const asOf = lastDay(period);
  const year = period.slice(0, 4);
  const used = [];
  const unreviewed = new Set();
  const notes = new Set();
  const rows = [];
  const days = daysIn(period);
  const ss = ruleOn('us.federal.fica.social-security', asOf, used, unreviewed);
  const medicare = ruleOn('us.federal.fica.medicare', asOf, used, unreviewed);
  const futa = ruleOn('us.federal.futa', asOf, used, unreviewed);
  const missing = [ss, medicare, futa].find((item) => item.error);
  if (missing) return fail(missing.error, { ruleId: missing.ruleId });
  for (const employee of state.employees || []) {
    const worked = daysWorked(employee, period);
    if (worked <= 0) continue;
    const structure = salaryOn(employee, asOf) || salaryOn(employee, employee.joinedOn);
    if (!structure) continue;
    const fraction = worked / days;
    const components = structure.components.map((item) => ({ name: item.name, cents: Math.round(cents(item.amount) * fraction) }));
    const grossCents = components.reduce((sum, item) => sum + item.cents, 0);
    const ytd = ytdFor(state, employee.id, year, period);
    const ssWages = Math.max(0, Math.min(grossCents, ss.value.wageBaseCents - ytd));
    const futaWages = Math.max(0, Math.min(grossCents, futa.value.wageBaseCents - ytd));
    const additionalWages = Math.max(0, Math.min(grossCents, ytd + grossCents - medicare.value.additionalAboveCents));
    const row = {
      employeeId: employee.id,
      name: employee.name,
      designation: employee.designation || '',
      workState: employee.workState || '',
      daysWorked: worked,
      daysInMonth: days,
      components,
      grossCents,
      ytdWagesCents: ytd,
      socialSecurityWagesCents: ssWages,
      socialSecurityEmployeeCents: Math.round((ssWages * ss.value.employeeBasisPoints) / 10000),
      socialSecurityEmployerCents: Math.round((ssWages * ss.value.employerBasisPoints) / 10000),
      medicareEmployeeCents: Math.round((grossCents * medicare.value.employeeBasisPoints) / 10000),
      medicareEmployerCents: Math.round((grossCents * medicare.value.employerBasisPoints) / 10000),
      additionalMedicareCents: Math.round((additionalWages * medicare.value.additionalEmployeeBasisPoints) / 10000),
      federalWithholdingCents: Math.min(grossCents, Math.round(cents(employee.federalWithholding) * fraction)),
      stateWithholdingCents: Math.min(grossCents, Math.round(cents(employee.stateWithholding) * fraction)),
      futaWagesCents: futaWages,
      futaCents: Math.round((futaWages * (futa.value.basisPoints - futa.value.creditBasisPoints)) / 10000),
      notes: [],
    };
    if (ssWages < grossCents) row.notes.push(`Social Security wages are capped at the ${year} wage base; ${toDollars(ssWages) === 0 ? 'nothing' : `$${toDollars(ssWages)}`} of this month counts.`);
    if (additionalWages > 0) row.notes.push('Wages for the year are above the Additional Medicare threshold, so the extra employee rate applies to the part above it.');
    if (!(employee.federalWithholding > 0)) row.notes.push('No federal withholding amount is recorded for this employee; MyCA does not work it out from the W-4. Enter the amount from the IRS Tax Withholding Estimator or Publication 15-T.');
    if (employee.workState && !NO_INCOME_TAX_STATES.includes(employee.workState) && !(employee.stateWithholding > 0)) row.notes.push(`${employee.workState} has an income tax; no state withholding amount is recorded, so none is deducted.`);
    row.deductionsCents = row.socialSecurityEmployeeCents + row.medicareEmployeeCents + row.additionalMedicareCents + row.federalWithholdingCents + row.stateWithholdingCents;
    row.netCents = grossCents - row.deductionsCents;
    row.employerTaxesCents = row.socialSecurityEmployerCents + row.medicareEmployerCents + row.futaCents;
    row.employerCostCents = grossCents + row.employerTaxesCents;
    rows.push(row);
  }
  const sum = (key) => rows.reduce((total, row) => total + (row[key] || 0), 0);
  const totals = {
    grossCents: sum('grossCents'),
    socialSecurityEmployeeCents: sum('socialSecurityEmployeeCents'),
    socialSecurityEmployerCents: sum('socialSecurityEmployerCents'),
    medicareEmployeeCents: sum('medicareEmployeeCents'),
    medicareEmployerCents: sum('medicareEmployerCents'),
    additionalMedicareCents: sum('additionalMedicareCents'),
    federalWithholdingCents: sum('federalWithholdingCents'),
    stateWithholdingCents: sum('stateWithholdingCents'),
    futaCents: sum('futaCents'),
    deductionsCents: sum('deductionsCents'),
    netCents: sum('netCents'),
    employerTaxesCents: sum('employerTaxesCents'),
    employerCostCents: sum('employerCostCents'),
  };
  totals.employerContributionsCents = totals.employerTaxesCents;
  totals.federalPayableCents = totals.socialSecurityEmployeeCents + totals.socialSecurityEmployerCents + totals.medicareEmployeeCents + totals.medicareEmployerCents + totals.additionalMedicareCents + totals.federalWithholdingCents;
  notes.add('Federal and state income tax withholding are the amounts recorded per employee; MyCA does not compute them from a W-4.');
  notes.add('FUTA is shown at the net rate after the full state credit; a credit reduction state owes more.');
  if (unreviewed.size) notes.add('The FICA and FUTA rates and wage bases come from MyCA\'s dated rules, which a US CPA has not reviewed yet.');
  const draftHash = createHash('sha256').update(JSON.stringify({ period, rows: rows.map((row) => [row.employeeId, row.grossCents, row.deductionsCents, row.netCents]), totals })).digest('hex');
  return {
    ok: true,
    data: {
      country: 'US',
      period,
      month: monthName(period),
      rows: rows.map(inDollars),
      totals: totalsInDollars(totals),
      employees: rows.length,
      rulesUsed: used,
      unreviewed: unreviewed.size > 0,
      notes: [...notes],
      draftHash,
      _cents: { rows, totals },
    },
  };
}

function inDollars(row) {
  const out = { ...row, components: row.components.map((item) => ({ name: item.name, amount: toDollars(item.cents) })) };
  for (const key of Object.keys(row)) {
    if (key.endsWith('Cents')) {
      out[key.slice(0, -5)] = toDollars(row[key]);
      delete out[key];
    }
  }
  return out;
}

function totalsInDollars(totals) {
  const out = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key.endsWith('Cents') ? key.slice(0, -5) : key, toDollars(value)]));
  out.lines = [
    { name: 'Social Security (employees)', amount: out.socialSecurityEmployee },
    { name: 'Medicare (employees)', amount: round2(out.medicareEmployee + out.additionalMedicare) },
    { name: 'Federal income tax withheld', amount: out.federalWithholding },
    { name: 'State income tax withheld', amount: out.stateWithholding },
  ].filter((line) => line.amount > 0);
  out.employerLines = [
    { name: 'Social Security (employer)', amount: out.socialSecurityEmployer },
    { name: 'Medicare (employer)', amount: out.medicareEmployer },
    { name: 'Federal unemployment (FUTA)', amount: out.futa },
  ].filter((line) => line.amount > 0);
  return out;
}

export function usPayrollFor(state, requested) {
  const period = String(requested || '').trim() || localToday().slice(0, 7);
  const existing = isReturnPeriod(period) ? runRecord(state, period) : null;
  if (existing) {
    if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
    const { _cents, ...stored } = existing;
    return { ok: true, data: { ...stored, rows: existing.rows.map(inDollars), totals: totalsInDollars(existing.totals), frozen: true } };
  }
  const computed = computeUsPayroll(state, period);
  if (!computed.ok) return computed;
  const { _cents, ...data } = computed.data;
  return { ok: true, data: { ...data, status: 'draft', frozen: false } };
}

export function planUsApproval(state, args = {}) {
  const computed = computeUsPayroll(state, args.period);
  if (!computed.ok) return computed;
  const data = computed.data;
  if (runRecord(state, data.period)) return fail('ALREADY_APPROVED', { period: data.period });
  if (!data.rows.length) return fail('NO_EMPLOYEES', { period: data.period });
  if (isPeriodLocked(state, lastDay(data.period))) return fail('PERIOD_LOCKED', { date: lastDay(data.period), lockThrough: state.lockThrough });
  if (args.draftHash && args.draftHash !== data.draftHash) return fail('DRAFT_CHANGED', { period: data.period });
  return { ok: true, data };
}

export function approveUsPayroll(state, args = {}) {
  const planned = planUsApproval(state, args);
  if (!planned.ok) return planned;
  const { data } = planned;
  const { rows, totals } = data._cents;
  ensureUsPayrollAccounts(state.ledger);
  const date = lastDay(data.period);
  const linked = TRANSFER_FLAGS.LINKED;
  const id = `PAY-${data.period}`;
  const seqBefore = state.transferSeq;
  const bundle = [];
  const post = (debit, credit, amount, code) => { if (amount > 0) bundle.push({ id: nextTransferId(state), debitAccountId: debit, creditAccountId: credit, amount: BigInt(amount), flags: linked, invoiceId: id, code, userData: date }); };
  post(5120, 2300, totals.netCents, 'SALARY-NET');
  post(5120, 2340, totals.socialSecurityEmployeeCents + totals.medicareEmployeeCents + totals.additionalMedicareCents + totals.federalWithholdingCents, 'SALARY-FEDERAL');
  post(5120, 2360, totals.stateWithholdingCents, 'SALARY-STATE');
  post(5125, 2340, totals.socialSecurityEmployerCents + totals.medicareEmployerCents, 'EMPLOYER-FICA');
  post(5125, 2350, totals.futaCents, 'EMPLOYER-FUTA');
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const actor = state.__actor;
  const record = {
    country: 'US',
    period: data.period,
    month: data.month,
    status: 'approved',
    approvedBy: String(actor?.userId || args.actorId || ''),
    approvedOn: localToday(),
    draftHash: data.draftHash,
    rows,
    totals: { ...totals, netPaise: totals.netCents },
    employees: rows.length,
    rulesUsed: data.rulesUsed,
    unreviewed: data.unreviewed,
    notes: data.notes,
    transferIds: posted.map((result) => result.id),
    paidOn: '',
  };
  state.payrollRuns = state.payrollRuns && typeof state.payrollRuns === 'object' ? state.payrollRuns : {};
  state.payrollRuns[data.period] = record;
  return { ok: true, run: usPayrollFor(state, data.period).data, posted };
}

export function listUsPayroll(state) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const runs = Object.values(state.payrollRuns || {}).filter((run) => run.country === 'US').sort((a, b) => a.period.localeCompare(b.period));
  return {
    ok: true,
    data: {
      runs: runs.map((run) => ({ period: run.period, month: run.month, employees: run.employees, gross: toDollars(run.totals.grossCents), net: toDollars(run.totals.netCents), employerCost: toDollars(run.totals.employerCostCents), approvedOn: run.approvedOn, paidOn: run.paidOn || '' })),
    },
  };
}

export function usPayslip(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const period = String(args.period || '').trim();
  const run = isReturnPeriod(period) ? runRecord(state, period) : null;
  if (!run) return fail('NOT_APPROVED', { period });
  const employeeId = String(args.employeeId || '').trim().toUpperCase();
  const row = run.rows.find((item) => item.employeeId === employeeId);
  if (!row) return fail('EMPLOYEE_NOT_IN_RUN', { employeeId, period });
  const employee = (state.employees || []).find((item) => item.id === employeeId) || {};
  const company = state.company || {};
  const r = inDollars(row);
  return {
    ok: true,
    data: {
      country: 'US',
      period,
      month: run.month,
      employer: { name: company.name || '', address: company.address || '', ein: company.ein || '' },
      employee: { id: employeeId, name: row.name, designation: row.designation, workState: row.workState, joinedOn: employee.joinedOn || '' },
      daysWorked: row.daysWorked,
      daysInMonth: row.daysInMonth,
      earnings: r.components,
      gross: r.gross,
      deductions: [
        { name: 'Social Security', amount: r.socialSecurityEmployee },
        { name: 'Medicare', amount: round2(r.medicareEmployee + r.additionalMedicare) },
        { name: 'Federal income tax', amount: r.federalWithholding },
        { name: 'State income tax', amount: r.stateWithholding },
      ].filter((item) => item.amount > 0),
      totalDeductions: r.deductions,
      net: r.net,
      employerContributions: [
        { name: 'Social Security', amount: r.socialSecurityEmployer },
        { name: 'Medicare', amount: r.medicareEmployer },
        { name: 'Federal unemployment', amount: r.futa },
      ].filter((item) => item.amount > 0),
      yearToDate: { wages: round2(r.ytdWages + r.gross) },
      paidOn: run.paidOn || '',
      notes: row.notes,
      unreviewed: run.unreviewed,
    },
  };
}

function quarterOf(period) {
  return Math.floor((Number(period.slice(5, 7)) - 1) / 3) + 1;
}

export function usPayrollFilings(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const year = String(args.year || localToday().slice(0, 4)).trim();
  if (!/^\d{4}$/.test(year)) return fail('BAD_YEAR', { year });
  const runs = approvedRunsOfYear(state, year);
  const quarters = [1, 2, 3, 4].map((q) => {
    const inQuarter = runs.filter((run) => quarterOf(run.period) === q);
    const t = (key) => toDollars(inQuarter.reduce((sum, run) => sum + (run.totals[key] || 0), 0));
    const rowSum = (key) => toDollars(inQuarter.reduce((sum, run) => sum + run.rows.reduce((inner, row) => inner + (row[key] || 0), 0), 0));
    const endMonth = q * 3;
    const due = rules.rule('us.federal.form941.due', `${year}-${String(endMonth).padStart(2, '0')}-01`);
    const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
    const nextYear = endMonth === 12 ? Number(year) + 1 : Number(year);
    const dueDate = due.ok && due.record.value.lastDayOfMonthAfterQuarter ? `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()).padStart(2, '0')}` : '';
    return {
      quarter: `${year}-Q${q}`,
      months: inQuarter.length,
      wages: t('grossCents'),
      federalWithholding: t('federalWithholdingCents'),
      socialSecurityWages: rowSum('socialSecurityWagesCents'),
      socialSecurityTax: round2(t('socialSecurityEmployeeCents') + t('socialSecurityEmployerCents')),
      medicareWages: t('grossCents'),
      medicareTax: round2(t('medicareEmployeeCents') + t('medicareEmployerCents')),
      additionalMedicareTax: t('additionalMedicareCents'),
      totalTaxes: round2(t('federalWithholdingCents') + t('socialSecurityEmployeeCents') + t('socialSecurityEmployerCents') + t('medicareEmployeeCents') + t('medicareEmployerCents') + t('additionalMedicareCents')),
      dueDate,
      filed: (state.filings || []).find((item) => item.returnType === 'FORM_941' && item.period === `${year}-Q${q}`) || null,
    };
  });
  const byEmployee = new Map();
  for (const run of runs) {
    for (const row of run.rows) {
      const w = byEmployee.get(row.employeeId) || { employeeId: row.employeeId, name: row.name, wages: 0, federalWithheld: 0, socialSecurityWages: 0, socialSecurityWithheld: 0, medicareWages: 0, medicareWithheld: 0, stateWithheld: 0 };
      w.wages += row.grossCents;
      w.federalWithheld += row.federalWithholdingCents;
      w.socialSecurityWages += row.socialSecurityWagesCents;
      w.socialSecurityWithheld += row.socialSecurityEmployeeCents;
      w.medicareWages += row.grossCents;
      w.medicareWithheld += row.medicareEmployeeCents + row.additionalMedicareCents;
      w.stateWithheld += row.stateWithholdingCents;
      byEmployee.set(row.employeeId, w);
    }
  }
  const w2 = [...byEmployee.values()].map((w) => Object.fromEntries(Object.entries(w).map(([key, value]) => [key, typeof value === 'number' ? toDollars(value) : value])));
  const w2Due = rules.rule('us.federal.w2.due', `${year}-12-31`);
  const futaTotal = toDollars(runs.reduce((sum, run) => sum + (run.totals.futaCents || 0), 0));
  const unreviewed = runs.some((run) => run.unreviewed) || !(due941Attested(year));
  return {
    ok: true,
    data: {
      year,
      quarters,
      w2,
      w2DueDate: w2Due.ok ? `${Number(year) + 1}-${String(w2Due.record.value.month).padStart(2, '0')}-${String(w2Due.record.value.day).padStart(2, '0')}` : '',
      futa: { total: futaTotal, note: 'Form 940 is annual; the figure is at the net rate after the full state credit.' },
      notes: [
        'Figures are drafts from approved payroll months. MyCA files nothing; file on the IRS portal or through your payroll provider and record the confirmation.',
        ...(unreviewed ? ['The rates, wage bases and due dates come from dated rules a US CPA has not reviewed yet.'] : []),
      ],
    },
  };
}

function due941Attested(year) {
  const found = rules.rule('us.federal.form941.due', `${year}-01-01`);
  return found.ok && (found.record.attestations || []).length > 0;
}

export function planWithholding(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const employee = (state.employees || []).find((item) => item.id === String(args.id || '').trim().toUpperCase());
  if (!employee) return fail('EMPLOYEE_NOT_FOUND', { id: args.id });
  const federal = args.federalWithholding == null || args.federalWithholding === '' ? employee.federalWithholding || 0 : Number(args.federalWithholding);
  const stateAmount = args.stateWithholding == null || args.stateWithholding === '' ? employee.stateWithholding || 0 : Number(args.stateWithholding);
  if (!Number.isFinite(federal) || federal < 0) return fail('BAD_AMOUNT', { field: 'federalWithholding' });
  if (!Number.isFinite(stateAmount) || stateAmount < 0) return fail('BAD_AMOUNT', { field: 'stateWithholding' });
  const workState = args.workState == null || args.workState === '' ? employee.workState || '' : String(args.workState).trim().toUpperCase();
  if (workState && !/^[A-Z]{2}$/.test(workState)) return fail('BAD_STATE', { workState });
  return { ok: true, employee, withholding: { federalWithholding: round2(federal), stateWithholding: round2(stateAmount), workState } };
}

export function setWithholding(state, args = {}) {
  const planned = planWithholding(state, args);
  if (!planned.ok) return planned;
  Object.assign(planned.employee, planned.withholding);
  return { ok: true, employee: { id: planned.employee.id, name: planned.employee.name, ...planned.withholding } };
}

export function usPayrollWords(data, money) {
  const t = data.totals;
  const lines = [`Payroll for ${data.month}: ${data.employees === 1 ? '1 employee' : `${data.employees} employees`}, gross ${money(t.gross)}, withheld ${money(t.deductions)} (Social Security ${money(t.socialSecurityEmployee)}, Medicare ${money(round2(t.medicareEmployee + t.additionalMedicare))}, federal income tax ${money(t.federalWithholding)}${t.stateWithholding > 0 ? `, state income tax ${money(t.stateWithholding)}` : ''}), net to pay ${money(t.net)}.`];
  lines.push(`Employer taxes ${money(t.employerTaxes)} (Social Security ${money(t.socialSecurityEmployer)}, Medicare ${money(t.medicareEmployer)}, FUTA ${money(t.futa)}); total cost ${money(t.employerCost)}.`);
  for (const row of data.rows) lines.push(`· ${row.name}: gross ${money(row.gross)}, net ${money(row.net)}${row.daysWorked < row.daysInMonth ? ` (${row.daysWorked} of ${row.daysInMonth} days)` : ''}`);
  if (data.status === 'approved') lines.push(`Approved on ${data.approvedOn}.${data.paidOn ? ` Paid on ${data.paidOn}.` : ' Say "paid salaries" once the wages are paid.'}`);
  else lines.push('A draft. Say "approve payroll" to post it.');
  if (data.notes.length) lines.push(data.notes.join(' '));
  return lines.join('\n');
}
