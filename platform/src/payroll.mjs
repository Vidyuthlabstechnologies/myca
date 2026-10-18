import { createHash } from 'node:crypto';
import { rules, incomeTax } from './sprint-load.mjs';
import { createAccounts, createTransfers, listAccounts, TRANSFER_FLAGS } from './ledger.mjs';
import { localToday, postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { salaryOn, salaryPrivate } from './employees.mjs';
import { recordTdsEntry, tdsPayableAccountId } from './tds-deduction.mjs';

const { computeIncomeTax } = incomeTax;

export const PAYROLL_ACCOUNTS = [
  { id: 2300, code: '2300', name: 'Salaries payable', type: 'liability' },
  { id: 2310, code: '2310', name: 'Provident fund payable', type: 'liability' },
  { id: 2320, code: '2320', name: 'State insurance payable', type: 'liability' },
  { id: 2330, code: '2330', name: 'Professional tax payable', type: 'liability' },
  { id: 5120, code: '5120', name: 'Salaries and wages', type: 'expense' },
  { id: 5125, code: '5125', name: 'Employer contributions (PF, ESI)', type: 'expense' },
];

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const toRupees = (p) => p / 100;
const paise = (rupees) => Math.round(Number(rupees || 0) * 100);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function ensurePayrollAccounts(ledger) {
  createAccounts(ledger, PAYROLL_ACCOUNTS.map((account) => ({ ...account, flags: 0 })));
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

function pfWagesOf(components) {
  const base = components.filter((item) => /\bbasic\b|\bda\b|dearness/i.test(item.name));
  if (!base.length) return { paise: components.reduce((sum, item) => sum + item.paise, 0), assumed: true };
  return { paise: base.reduce((sum, item) => sum + item.paise, 0), assumed: false };
}

function professionalTax(rule, employee, fullMonthGrossPaise, period) {
  const value = rule.value;
  const pay = value.basis === 'annual' ? fullMonthGrossPaise * 12 : value.basis === 'half-yearly' ? fullMonthGrossPaise * 6 : fullMonthGrossPaise;
  const slabs = value.slabs.all || (employee.sex === 'female' ? value.slabs.women : value.slabs.men) || [];
  const slab = slabs.find((item) => item.payUpToPaise === null || pay <= item.payUpToPaise);
  if (!slab) return 0;
  const month = Number(period.slice(5, 7));
  if (value.basis === 'half-yearly') return (value.deductedInMonths || []).includes(month) ? slab.paise : 0;
  if (month === 2 && slab.februaryPaise != null) return slab.februaryPaise;
  if (month === 3 && slab.lastMonthPaise != null) return slab.lastMonthPaise;
  return slab.paise;
}

function fyOf(period) {
  return rules.fyOf(`${period}-01`);
}

function fyMonths(fy) {
  const start = Number(fy.slice(0, 4));
  const months = [];
  for (let i = 0; i < 12; i += 1) {
    const m = ((3 + i) % 12) + 1;
    const y = m >= 4 ? start : start + 1;
    months.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

function approvedRuns(state) {
  return Object.values(state.payrollRuns || {}).filter((run) => run && run.status === 'approved');
}

function salaryTds(state, employee, period, grossPaise, used, unreviewed, notes) {
  const fy = fyOf(period);
  const months = fyMonths(fy);
  const index = months.indexOf(period);
  const earlier = approvedRuns(state).filter((run) => months.includes(run.period) && run.period < period);
  const runFor = (month) => earlier.find((run) => run.period === month);
  const employedIn = (month) => employee.joinedOn <= lastDay(month) && (!employee.leftOn || employee.leftOn >= `${month}-01`);
  const paidSoFar = months.slice(0, index).reduce((sum, month) => {
    const run = runFor(month);
    if (run) return sum + ((run.rows.find((row) => row.employeeId === employee.id)?.grossPaise) || 0);
    return sum + (employedIn(month) ? grossPaise : 0);
  }, 0);
  const tdsSoFar = earlier.reduce((sum, run) => sum + ((run.rows.find((row) => row.employeeId === employee.id)?.tdsPaise) || 0), 0);
  const remaining = months.length - index;
  const lastDayOfMonth = lastDay(period);
  const monthsLeftAfter = months.slice(index + 1).filter(employedIn).length;
  const projected = paidSoFar + grossPaise + grossPaise * monthsLeftAfter;
  if (months.slice(0, index).some((month) => !runFor(month) && employedIn(month))) notes.add(`${employee.name}: earlier months of this year were not run in MyCA, so they are taken at this month's pay when estimating the year's salary for TDS.`);
  const regime = employee.taxRegime === 'old' ? 'old' : 'new';
  if (!employee.taxRegime) notes.add(`${employee.name}: no tax regime recorded, so the new regime (the default in law) is used for salary TDS.`);
  const tax = computeIncomeTax({ fy, regime, salaryPaise: projected, residentIndividual: true });
  if (tax.error) return { error: tax.error, ruleId: tax.ruleId };
  used.push(`income-tax.${regime}-regime@${fy}`);
  const annual = tax.taxPayablePaise;
  let monthly = Math.max(0, Math.round((annual - tdsSoFar) / Math.max(1, remaining - 0)));
  monthly = Math.min(monthly, grossPaise);
  let noPan = false;
  if (annual > 0 && !employee.pan) {
    const floor = ruleOn('tds.no-pan.rate', lastDayOfMonth, used, unreviewed);
    if (floor.error) return floor;
    monthly = Math.max(monthly, Math.round((grossPaise * floor.value.basisPoints) / 10000));
    noPan = true;
  }
  monthly = Math.round(monthly / 100) * 100;
  return { paise: monthly, annualTaxPaise: annual, projectedSalaryPaise: projected, regime, noPan, monthsLeft: monthsLeftAfter };
}

function previousPeriodOf(period) {
  const [y, m] = period.split('-').map(Number);
  return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
}

function payrollFlags(state, period, rows, totals) {
  const previous = runRecord(state, previousPeriodOf(period));
  if (!previous) return [];
  const flags = [];
  const money = (paise) => `₹${(Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const before = new Map(previous.rows.map((row) => [row.employeeId, row]));
  const now = new Map(rows.map((row) => [row.employeeId, row]));
  for (const row of rows) {
    const was = before.get(row.employeeId);
    if (!was) {
      flags.push({ kind: 'new', employeeId: row.employeeId, text: `${row.name} is on the payroll for the first time this month${row.daysWorked < row.daysInMonth ? ` (${row.daysWorked} of ${row.daysInMonth} days)` : ''}.` });
      continue;
    }
    const fullNow = row.daysWorked === row.daysInMonth;
    const fullThen = was.daysWorked === was.daysInMonth;
    if (fullNow && fullThen && row.grossPaise !== was.grossPaise) {
      const employee = (state.employees || []).find((e) => e.id === row.employeeId);
      const changed = (employee?.salaries || []).map((s) => s.from || s.effectiveFrom || '').filter(Boolean).sort().at(-1);
      flags.push({ kind: 'changed', employeeId: row.employeeId, text: `${row.name}'s pay is ${money(row.grossPaise)} this month against ${money(was.grossPaise)} last month${changed ? ` (changed ${changed})` : ''}.` });
    }
    if (!fullNow && fullThen) flags.push({ kind: 'partial', employeeId: row.employeeId, text: `${row.name} is paid for ${row.daysWorked} of ${row.daysInMonth} days; last month was the full month.` });
  }
  for (const was of previous.rows) {
    if (now.has(was.employeeId)) continue;
    const employee = (state.employees || []).find((e) => e.id === was.employeeId);
    if (employee && !employee.leftOn) flags.push({ kind: 'absent', employeeId: was.employeeId, text: `${was.name} was paid last month and is not in this run, with no leaving date recorded.` });
  }
  const wasGross = Number(previous.totals?.grossPaise || 0);
  if (wasGross > 0 && totals.grossPaise > 0) {
    const move = ((totals.grossPaise - wasGross) / wasGross) * 100;
    if (Math.abs(move) > 10) flags.push({ kind: 'moved', text: `Gross pay is ${move > 0 ? 'up' : 'down'} ${Math.round(Math.abs(move))}% on last month (${money(totals.grossPaise)} against ${money(wasGross)}).` });
  }
  return flags;
}

export function computePayroll(state, requested) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const period = String(requested || '').trim() || localToday().slice(0, 7);
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-10.' });
  const asOf = lastDay(period);
  const used = [];
  const unreviewed = new Set();
  const notes = new Set();
  const rows = [];
  const days = daysIn(period);
  for (const employee of state.employees || []) {
    const worked = daysWorked(employee, period);
    if (worked <= 0) continue;
    const structure = salaryOn(employee, asOf) || salaryOn(employee, employee.joinedOn);
    if (!structure) continue;
    const fraction = worked / days;
    const components = structure.components.map((item) => ({ name: item.name, paise: Math.round(paise(item.amount) * fraction) }));
    const grossPaise = components.reduce((sum, item) => sum + item.paise, 0);
    const row = { employeeId: employee.id, name: employee.name, designation: employee.designation || '', daysWorked: worked, daysInMonth: days, components, grossPaise, pfEmployeePaise: 0, pfEmployerPaise: 0, epsPaise: 0, edliPaise: 0, esiEmployeePaise: 0, esiEmployerPaise: 0, ptPaise: 0, tdsPaise: 0, notes: [] };
    if (employee.pfMember) {
      const ceiling = ruleOn('payroll.epf.wage-ceiling', asOf, used, unreviewed);
      const employeeRate = ruleOn('payroll.epf.employee-rate', asOf, used, unreviewed);
      const employerRate = ruleOn('payroll.epf.employer-rate', asOf, used, unreviewed);
      const edli = ruleOn('payroll.edli.employer-rate', asOf, used, unreviewed);
      const missing = [ceiling, employeeRate, employerRate, edli].find((item) => item.error);
      if (missing) return fail(missing.error, { ruleId: missing.ruleId });
      const wages = pfWagesOf(components);
      if (wages.assumed) row.notes.push('No Basic or DA part in the salary, so the whole pay is taken as provident fund wages.');
      const pfWages = Math.min(wages.paise, ceiling.value.monthlyWagesPaise);
      row.pfWagesPaise = pfWages;
      row.pfEmployeePaise = Math.round((pfWages * employeeRate.value.basisPoints) / 10000);
      row.epsPaise = Math.round((pfWages * employerRate.value.pensionBasisPoints) / 10000);
      row.pfEmployerPaise = Math.round((pfWages * employerRate.value.basisPoints) / 10000) - row.epsPaise;
      row.edliPaise = Math.round((pfWages * edli.value.basisPoints) / 10000);
    }
    if (employee.esiMember) {
      const ceiling = ruleOn('payroll.esi.wage-ceiling', asOf, used, unreviewed);
      const rates = ruleOn('payroll.esi.rates', asOf, used, unreviewed);
      const missing = [ceiling, rates].find((item) => item.error);
      if (missing) return fail(missing.error, { ruleId: missing.ruleId });
      const fullMonthGross = structure.components.reduce((sum, item) => sum + paise(item.amount), 0);
      if (fullMonthGross <= ceiling.value.monthlyWagesPaise) {
        row.esiEmployerPaise = Math.round((grossPaise * rates.value.employerBasisPoints) / 10000);
        const dailyWages = Math.round(fullMonthGross / days);
        if (dailyWages <= rates.value.employeeExemptDailyWagesUpToPaise) row.notes.push('Average daily wages are within the limit, so no employee state insurance is deducted; the employer share is still due.');
        else row.esiEmployeePaise = Math.round((grossPaise * rates.value.employeeBasisPoints) / 10000);
      } else {
        row.notes.push('Monthly pay is above the state insurance wage limit, so nothing is deducted for it.');
      }
    }
    if (employee.ptState) {
      const pt = rules.rule(`payroll.pt.${employee.ptState}`, asOf);
      if (!pt.ok) {
        row.notes.push(`Professional tax for state ${employee.ptState} is not in MyCA's rules yet, so none is deducted.`);
      } else {
        const key = `${pt.record.id}@${pt.record.effectiveFrom}`;
        if (!used.includes(key)) used.push(key);
        if (!(pt.record.attestations || []).length) unreviewed.add(key);
        const fullMonthGross = structure.components.reduce((sum, item) => sum + paise(item.amount), 0);
        row.ptPaise = professionalTax(pt.record, employee, fullMonthGross, period);
        row.ptState = pt.record.value.state;
        if (!employee.sex && !pt.record.value.slabs.all) row.notes.push('No sex recorded, so the professional tax slab for men is used.');
        if (pt.record.value.basis === 'half-yearly') row.notes.push(`Professional tax in ${pt.record.value.state} is half-yearly; it is deducted in the months the rule names.`);
      }
    }
    const tds = salaryTds(state, employee, period, grossPaise, used, unreviewed, notes);
    if (tds.error) return fail(tds.error, { ruleId: tds.ruleId });
    row.tdsPaise = tds.paise;
    row.tdsBasis = { annualTaxPaise: tds.annualTaxPaise, projectedSalaryPaise: tds.projectedSalaryPaise, regime: tds.regime, noPan: tds.noPan };
    if (tds.noPan) row.notes.push('No PAN recorded, so TDS is at the higher rate the law sets for a payee without PAN.');
    row.deductionsPaise = row.pfEmployeePaise + row.esiEmployeePaise + row.ptPaise + row.tdsPaise;
    row.netPaise = grossPaise - row.deductionsPaise;
    row.employerCostPaise = grossPaise + row.pfEmployerPaise + row.epsPaise + row.edliPaise + row.esiEmployerPaise;
    rows.push(row);
  }
  let adminPaise = 0;
  if (rows.some((row) => row.pfWagesPaise)) {
    const admin = ruleOn('payroll.epf.admin-charge', asOf, used, unreviewed);
    if (admin.error) return fail(admin.error, { ruleId: admin.ruleId });
    const pfWagesTotal = rows.reduce((sum, row) => sum + (row.pfWagesPaise || 0), 0);
    adminPaise = Math.max(Math.round((pfWagesTotal * admin.value.basisPoints) / 10000), admin.value.minimumPerMonthPaise);
  }
  const sum = (key) => rows.reduce((total, row) => total + (row[key] || 0), 0);
  const totals = {
    grossPaise: sum('grossPaise'),
    pfEmployeePaise: sum('pfEmployeePaise'),
    pfEmployerPaise: sum('pfEmployerPaise'),
    epsPaise: sum('epsPaise'),
    edliPaise: sum('edliPaise'),
    pfAdminPaise: adminPaise,
    esiEmployeePaise: sum('esiEmployeePaise'),
    esiEmployerPaise: sum('esiEmployerPaise'),
    ptPaise: sum('ptPaise'),
    tdsPaise: sum('tdsPaise'),
    deductionsPaise: sum('deductionsPaise'),
    netPaise: sum('netPaise'),
  };
  totals.employerContributionsPaise = totals.pfEmployerPaise + totals.epsPaise + totals.edliPaise + totals.pfAdminPaise + totals.esiEmployerPaise;
  totals.employerCostPaise = totals.grossPaise + totals.employerContributionsPaise;
  totals.pfPayablePaise = totals.pfEmployeePaise + totals.pfEmployerPaise + totals.epsPaise + totals.edliPaise + totals.pfAdminPaise;
  totals.esiPayablePaise = totals.esiEmployeePaise + totals.esiEmployerPaise;
  if (unreviewed.size) notes.add('The contribution rates, limits and slabs come from MyCA\'s dated rules, which your CA has not reviewed yet.');
  const flags = payrollFlags(state, period, rows, totals);
  const draftHash = createHash('sha256').update(JSON.stringify({ period, rows: rows.map((row) => [row.employeeId, row.grossPaise, row.deductionsPaise, row.netPaise]), totals })).digest('hex');
  return {
    ok: true,
    data: {
      period,
      month: monthName(period),
      rows: rows.map(inRupees),
      totals: totalsInRupees(totals),
      employees: rows.length,
      rulesUsed: used,
      unreviewed: unreviewed.size > 0,
      notes: [...notes],
      flags,
      draftHash,
      _paise: { rows, totals },
    },
  };
}

function inRupees(row) {
  const out = { ...row, components: row.components.map((item) => ({ name: item.name, amount: toRupees(item.paise) })) };
  for (const key of Object.keys(row)) {
    if (key.endsWith('Paise')) {
      out[key.slice(0, -5)] = toRupees(row[key]);
      delete out[key];
    }
  }
  if (row.tdsBasis) out.tdsBasis = { ...row.tdsBasis, annualTax: toRupees(row.tdsBasis.annualTaxPaise), projectedSalary: toRupees(row.tdsBasis.projectedSalaryPaise) };
  delete out.tdsBasis?.annualTaxPaise;
  delete out.tdsBasis?.projectedSalaryPaise;
  return out;
}

function totalsInRupees(totals) {
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key.endsWith('Paise') ? key.slice(0, -5) : key, toRupees(value)]));
}

function runRecord(state, period) {
  const all = state.payrollRuns && typeof state.payrollRuns === 'object' ? state.payrollRuns : {};
  return Object.hasOwn(all, period) ? all[period] : null;
}

export function payrollFor(state, requested) {
  const period = String(requested || '').trim() || localToday().slice(0, 7);
  const existing = isReturnPeriod(period) ? runRecord(state, period) : null;
  if (existing) {
    if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
    const { _paise, ...stored } = existing;
    return { ok: true, data: { ...stored, rows: existing.rows.map(inRupees), totals: totalsInRupees(existing.totals), frozen: true } };
  }
  const computed = computePayroll(state, period);
  if (!computed.ok) return computed;
  const { _paise, ...data } = computed.data;
  return { ok: true, data: { ...data, status: 'draft', frozen: false } };
}

export function planApproval(state, args = {}) {
  const computed = computePayroll(state, args.period);
  if (!computed.ok) return computed;
  const data = computed.data;
  if (runRecord(state, data.period)) return fail('ALREADY_APPROVED', { period: data.period });
  if (!data.rows.length) return fail('NO_EMPLOYEES', { period: data.period });
  if (isPeriodLocked(state, lastDay(data.period))) return fail('PERIOD_LOCKED', { date: lastDay(data.period), lockThrough: state.lockThrough });
  if (args.draftHash && args.draftHash !== data.draftHash) return fail('DRAFT_CHANGED', { period: data.period });
  return { ok: true, data };
}

export function approvePayroll(state, args = {}) {
  const planned = planApproval(state, args);
  if (!planned.ok) return planned;
  const { data } = planned;
  const { rows, totals } = data._paise;
  ensurePayrollAccounts(state.ledger);
  const date = lastDay(data.period);
  const linked = TRANSFER_FLAGS.LINKED;
  const id = `PAY-${data.period}`;
  const seqBefore = state.transferSeq;
  const bundle = [];
  const post = (debit, credit, amount, code) => { if (amount > 0) bundle.push({ id: nextTransferId(state), debitAccountId: debit, creditAccountId: credit, amount: BigInt(amount), flags: linked, invoiceId: id, code, userData: date }); };
  post(5120, 2300, totals.netPaise, 'SALARY-NET');
  post(5120, 2310, totals.pfEmployeePaise, 'SALARY-PF');
  post(5120, 2320, totals.esiEmployeePaise, 'SALARY-ESI');
  post(5120, 2330, totals.ptPaise, 'SALARY-PT');
  post(5120, tdsPayableAccountId(), totals.tdsPaise, 'TDS-192');
  post(5125, 2310, totals.pfEmployerPaise + totals.epsPaise + totals.edliPaise + totals.pfAdminPaise, 'EMPLOYER-PF');
  post(5125, 2320, totals.esiEmployerPaise, 'EMPLOYER-ESI');
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const actor = state.__actor;
  const fy = fyOf(data.period);
  for (const row of rows) {
    if (row.tdsPaise > 0) {
      const employee = (state.employees || []).find((item) => item.id === row.employeeId);
      recordTdsEntry(state, { section: '192', category: '', asset: '', pan: employee?.pan || '', payee: row.name, fy, date, basis: toRupees(row.grossPaise), beforeGst: false, tds: toRupees(row.tdsPaise), shortfall: 0, rate: round2((row.tdsPaise / row.grossPaise) * 100), threshold: null, crossed: true, kind: 'salary', rulesUsed: data.rulesUsed, unreviewed: data.unreviewed, noPan: !employee?.pan }, id);
    }
  }
  const record = {
    period: data.period,
    month: data.month,
    status: 'approved',
    approvedBy: String(actor?.userId || args.actorId || ''),
    approvedOn: localToday(),
    draftHash: data.draftHash,
    rows,
    totals,
    employees: rows.length,
    rulesUsed: data.rulesUsed,
    unreviewed: data.unreviewed,
    notes: data.notes,
    transferIds: posted.map((result) => result.id),
    paidOn: '',
  };
  state.payrollRuns = state.payrollRuns && typeof state.payrollRuns === 'object' ? state.payrollRuns : {};
  state.payrollRuns[data.period] = record;
  if (rows.some((row) => row.pfWagesPaise) && !state.company?.pf) state.company = { ...state.company, pf: true };
  if (rows.some((row) => row.esiEmployerPaise > 0) && !state.company?.esi) state.company = { ...state.company, esi: true };
  return { ok: true, run: payrollFor(state, data.period).data, posted };
}

export function planSalaryPayment(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const period = String(args.period || '').trim();
  const run = isReturnPeriod(period) ? runRecord(state, period) : null;
  if (!run) return fail('NOT_APPROVED', { period });
  if (run.paidOn) return fail('ALREADY_PAID', { period, paidOn: run.paidOn });
  const date = args.date == null || args.date === '' ? localToday() : postingDate(args.date);
  if (!date) return fail('INVALID_DATE', { date: args.date });
  if (date > localToday()) return fail('FUTURE_DATE', { date });
  if (date < lastDay(period).slice(0, 8) + '01') return fail('BEFORE_PERIOD', { date, period });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  const mode = args.mode === 'cash' ? 'cash' : 'bank';
  if (mode === 'cash') {
    const cash = listAccounts(state.ledger).find((account) => account.code === '1001');
    const inHand = cash ? round2(cash.debitsPosted - cash.creditsPosted) : 0;
    if (inHand + 0.005 < toRupees(run.totals.netPaise ?? run.totals.netCents)) return fail('INSUFFICIENT_CASH', { inHand, amount: toRupees(run.totals.netPaise ?? run.totals.netCents) });
  }
  return { ok: true, run, date, mode, amount: toRupees(run.totals.netPaise ?? run.totals.netCents) };
}

export function recordSalaryPayment(state, args = {}) {
  const plan = planSalaryPayment(state, args);
  if (!plan.ok) return plan;
  ensurePayrollAccounts(state.ledger);
  const posted = createTransfers(state.ledger, [
    { id: nextTransferId(state), debitAccountId: 2300, creditAccountId: plan.mode === 'cash' ? 1001 : 1002, amount: BigInt(plan.run.totals.netPaise ?? plan.run.totals.netCents), code: 'SALARY-PAID', userData: plan.date, invoiceId: `PAY-${plan.run.period}` },
  ]);
  if (posted.some((result) => !result.ok)) return fail('LEDGER_REJECT', { posted });
  plan.run.paidOn = plan.date;
  plan.run.paidBy = plan.mode;
  plan.run.paymentTransferIds = posted.map((result) => result.id);
  return { ok: true, period: plan.run.period, paidOn: plan.date, mode: plan.mode, amount: plan.amount };
}

export function listPayroll(state) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const runs = Object.values(state.payrollRuns || {}).sort((a, b) => a.period.localeCompare(b.period));
  return {
    ok: true,
    data: {
      runs: runs.map((run) => ({ period: run.period, month: run.month, employees: run.employees, gross: toRupees(run.totals.grossPaise), net: toRupees(run.totals.netPaise), employerCost: toRupees(run.totals.employerCostPaise), approvedOn: run.approvedOn, paidOn: run.paidOn || '' })),
    },
  };
}

export function payslip(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const period = String(args.period || '').trim();
  const run = isReturnPeriod(period) ? runRecord(state, period) : null;
  if (!run) return fail('NOT_APPROVED', { period });
  const employeeId = String(args.employeeId || '').trim().toUpperCase();
  const row = run.rows.find((item) => item.employeeId === employeeId);
  if (!row) return fail('EMPLOYEE_NOT_IN_RUN', { employeeId, period });
  const employee = (state.employees || []).find((item) => item.id === employeeId) || {};
  const company = state.company || {};
  const r = inRupees(row);
  return {
    ok: true,
    data: {
      period,
      month: run.month,
      employer: { name: company.name || '', address: company.address || '', tan: company.tan || '' },
      employee: { id: employeeId, name: row.name, designation: row.designation, pan: employee.pan || '', uan: employee.uan || '', joinedOn: employee.joinedOn || '' },
      daysWorked: row.daysWorked,
      daysInMonth: row.daysInMonth,
      earnings: r.components,
      gross: r.gross,
      deductions: [
        { name: 'Provident fund', amount: r.pfEmployee },
        { name: 'State insurance', amount: r.esiEmployee },
        { name: 'Professional tax', amount: r.pt },
        { name: 'Income tax (TDS)', amount: r.tds },
      ].filter((item) => item.amount > 0),
      totalDeductions: r.deductions,
      net: r.net,
      employerContributions: [
        { name: 'Provident fund', amount: round2(r.pfEmployer + r.eps) },
        { name: 'Insurance (EDLI)', amount: r.edli },
        { name: 'State insurance', amount: r.esiEmployer },
      ].filter((item) => item.amount > 0),
      paidOn: run.paidOn || '',
      notes: row.notes,
      unreviewed: run.unreviewed,
    },
  };
}

export function payrollWords(data, money) {
  const t = data.totals;
  const lines = [`Payroll for ${data.month}: ${data.employees === 1 ? '1 employee' : `${data.employees} employees`}, gross ${money(t.gross)}, deductions ${money(t.deductions)} (PF ${money(t.pfEmployee)}, ESI ${money(t.esiEmployee)}, professional tax ${money(t.pt)}, TDS ${money(t.tds)}), net to pay ${money(t.net)}.`];
  if (t.employerContributions > 0) lines.push(`Employer contributions ${money(t.employerContributions)}; total cost ${money(t.employerCost)}.`);
  for (const row of data.rows) lines.push(`· ${row.name}: gross ${money(row.gross)}, net ${money(row.net)}${row.daysWorked < row.daysInMonth ? ` (${row.daysWorked} of ${row.daysInMonth} days)` : ''}`);
  if (data.status === 'approved') lines.push(`Approved on ${data.approvedOn}.${data.paidOn ? ` Paid on ${data.paidOn}.` : ' Say "paid salaries" once the salaries are paid.'}`);
  else lines.push('Nothing is posted until you approve it.');
  for (const flag of data.flags || []) lines.push(`Check: ${flag.text}`);
  for (const note of data.notes || []) lines.push(note);
  return lines.join('\n');
}
