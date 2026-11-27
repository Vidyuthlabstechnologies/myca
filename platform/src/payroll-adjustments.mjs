import { isReturnPeriod } from './return-period.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { salaryPrivate } from './employees.mjs';
import { daysWorked, lastDay } from './payroll-days.mjs';

const MAX_AMOUNT = 10000000;
const FIELDS = ['lopDays', 'overtime', 'bonus', 'arrears'];

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function store(state) {
  return state.payrollAdjustments && typeof state.payrollAdjustments === 'object' ? state.payrollAdjustments : {};
}

export function adjustmentOf(state, period, employeeId) {
  const month = store(state)[period];
  const found = month && Object.hasOwn(month, employeeId) ? month[employeeId] : null;
  return found ? { lopDays: Number(found.lopDays) || 0, overtime: Number(found.overtime) || 0, bonus: Number(found.bonus) || 0, arrears: Number(found.arrears) || 0, note: String(found.note || '') } : { lopDays: 0, overtime: 0, bonus: 0, arrears: 0, note: '' };
}

export function adjustmentsFor(state, period) {
  const month = store(state)[period] || {};
  return Object.keys(month).map((employeeId) => ({ employeeId, ...adjustmentOf(state, period, employeeId) }));
}

function amountOf(value, name) {
  if (value === undefined || value === null || value === '') return { ok: true, value: 0 };
  const text = String(value).replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return fail('BAD_AMOUNT', { name, hint: `${name} is an amount in rupees, 0 or more, with at most two decimals.` });
  const amount = Number(text);
  if (amount > MAX_AMOUNT) return fail('BAD_AMOUNT', { name, hint: `${name} is too large.` });
  return { ok: true, value: amount };
}

export function planAdjustment(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const period = String(args.period || '').trim();
  if (!isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-10.' });
  const id = String(args.id || '').trim().toUpperCase();
  const employee = (state.employees || []).find((item) => item.id === id);
  if (!employee) return fail('EMPLOYEE_NOT_FOUND', { id: args.id });
  if (state.payrollRuns && Object.hasOwn(state.payrollRuns, period)) return fail('ALREADY_APPROVED', { period, hint: 'This month is already approved, so its pay can no longer change.' });
  if (isPeriodLocked(state, lastDay(period))) return fail('PERIOD_LOCKED', { date: lastDay(period), lockThrough: state.lockThrough });
  const worked = daysWorked(employee, period);
  if (worked <= 0) return fail('NOT_EMPLOYED', { period, hint: `${employee.name} was not employed in this month.` });
  if (!FIELDS.some((field) => args[field] !== undefined && args[field] !== null && args[field] !== '') && args.note === undefined) return fail('NOTHING_TO_CHANGE', { hint: 'Give loss-of-pay days, overtime, a bonus or arrears.' });
  const lopRaw = args.lopDays === undefined || args.lopDays === null || args.lopDays === '' ? 0 : Number(args.lopDays);
  if (!Number.isFinite(lopRaw) || lopRaw < 0 || Math.round(lopRaw * 2) !== lopRaw * 2) return fail('BAD_LOP_DAYS', { hint: 'Loss-of-pay days are whole or half days, 0 or more.' });
  if (lopRaw > worked) return fail('LOP_EXCEEDS_DAYS', { lopDays: lopRaw, daysWorked: worked, hint: `${employee.name} was employed ${worked} days this month, so up to ${worked} can be loss of pay.` });
  const overtime = amountOf(args.overtime, 'Overtime');
  if (!overtime.ok) return overtime;
  const bonus = amountOf(args.bonus, 'Bonus');
  if (!bonus.ok) return bonus;
  const arrears = amountOf(args.arrears, 'Arrears');
  if (!arrears.ok) return arrears;
  const note = String(args.note || '').trim().slice(0, 80);
  const next = { lopDays: lopRaw, overtime: overtime.value, bonus: bonus.value, arrears: arrears.value, note };
  return { ok: true, employee, period, daysWorked: worked, before: adjustmentOf(state, period, id), next };
}

export function setAdjustment(state, args = {}) {
  const plan = planAdjustment(state, args);
  if (!plan.ok) return plan;
  const all = state.payrollAdjustments && typeof state.payrollAdjustments === 'object' ? state.payrollAdjustments : (state.payrollAdjustments = {});
  const month = all[plan.period] || (all[plan.period] = {});
  const empty = !plan.next.lopDays && !plan.next.overtime && !plan.next.bonus && !plan.next.arrears;
  if (empty) delete month[plan.employee.id];
  else month[plan.employee.id] = plan.next;
  if (!Object.keys(month).length) delete all[plan.period];
  return { ok: true, employee: { id: plan.employee.id, name: plan.employee.name }, period: plan.period, adjustment: plan.next, before: plan.before, cleared: empty };
}
