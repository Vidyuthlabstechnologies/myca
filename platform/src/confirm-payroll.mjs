import { planEmployee, planSalaryChange, planLeaving } from './employees.mjs';
import { planApproval, planSalaryPayment, payrollWords } from './payroll.mjs';
import { bank } from './sprint-load.mjs';
import { money } from './confirm-words.mjs';

const EMPLOYEE_REASONS = {
  SALARIES_PRIVATE: () => 'Only the owner can see or change employees and salaries.',
  NAME_REQUIRED: () => 'Give the employee\'s name.',
  INVALID_DATE: () => 'That is not a date I can read.',
  SALARY_REQUIRED: () => 'Give the monthly salary, in one amount or in parts.',
  TOO_MANY_COMPONENTS: (p) => `A salary can have at most ${p.max} parts.`,
  BAD_COMPONENT: () => 'Each part of the salary needs a name of up to 40 letters.',
  DUPLICATE_COMPONENT: (p) => `${p.name} is listed twice.`,
  BAD_AMOUNT: (p) => `${p.name} needs an amount of zero or more.`,
  ZERO_SALARY: () => 'The monthly salary comes to nothing.',
  BAD_PAN: () => 'A PAN is five letters, four digits and a letter.',
  BAD_UAN: () => 'A UAN is 12 digits.',
  BAD_STATE: () => 'Give the state as its two-digit GST code.',
  BAD_REGIME: () => 'The tax regime is new or old.',
  ALREADY_EMPLOYED: (p) => `${p.name} is already on the list as ${p.id}.`,
  EMPLOYEE_NOT_FOUND: (p) => `${p.id} is not on the list of employees.`,
  BEFORE_JOINING: (p) => `That is before they joined on ${p.joinedOn}.`,
  AFTER_LEAVING: (p) => `That is after they left on ${p.leftOn}.`,
  ALREADY_LEFT: (p) => `They are already recorded as having left on ${p.leftOn}.`,
};

function employeeBlocked(plan) {
  const reason = EMPLOYEE_REASONS[plan.error];
  return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
}

function partsOf(components) {
  return components.map((item) => `${item.name} ${money(item.amount)}`).join(' + ');
}

const NO_PAYROLL = 'Nothing is posted to the books and no payroll is run. Deductions are not worked out yet.';

const PAYROLL_REASONS = {
  SALARIES_PRIVATE: () => 'Only the owner runs payroll.',
  INVALID_PERIOD: () => 'Say the month as YYYY-MM, for example 2026-10.',
  ALREADY_APPROVED: (p) => `Payroll for ${p.period} is already approved.`,
  NO_EMPLOYEES: (p) => `No employee was employed in ${p.period}.`,
  PERIOD_LOCKED: (p, args, state) => `${p.date} is inside the locked period (through ${state.lockThrough}).`,
  DRAFT_CHANGED: () => 'The payroll changed after you saw it. Look at it again before approving.',
  PAYROLL_RULE_MISSING: (p) => `The rule ${p.ruleId} is not in force for that month, so MyCA will not guess.`,
  NOT_APPROVED: (p) => `Payroll for ${p.period} is not approved yet.`,
  ALREADY_PAID: (p) => `Salaries for ${p.period} were recorded as paid on ${p.paidOn}.`,
  INVALID_DATE: (p) => `${p.date} is not a date I can read.`,
  FUTURE_DATE: () => 'The payment date cannot be in the future.',
  BEFORE_PERIOD: (p) => `Salaries for ${p.period} cannot be paid before that month starts.`,
  INSUFFICIENT_CASH: (p) => `There is not that much cash in hand (${money(p.inHand)}).`,
};

function payrollBlocked(plan, args, state) {
  const reason = PAYROLL_REASONS[plan.error];
  return { blockers: [reason ? reason(plan, args, state) : plan.error], summary: '', effects: [], figures: {} };
}

export function payrollApprovalPreview(state, args) {
  const planned = planApproval(state, args);
  if (!planned.ok) return payrollBlocked(planned, args, state);
  const d = planned.data;
  return {
    blockers: [],
    summary: payrollWords({ ...d, status: 'draft' }, money),
    effects: [`Posts ${money(d.totals.gross)} of salaries, ${money(d.totals.net)} as salaries payable, and each deduction as payable; records ${money(d.totals.tds)} of salary TDS. Pays nothing.`],
    figures: { period: d.period, employees: d.employees, gross: d.totals.gross, net: d.totals.net, employerCost: d.totals.employerCost, draftHash: d.draftHash },
  };
}

export function salaryPaymentPreview(state, args) {
  const planned = planSalaryPayment(state, args);
  if (!planned.ok) return payrollBlocked(planned, args, state);
  return {
    blockers: [],
    summary: `Salaries for ${planned.run.month}: ${money(planned.amount)} paid from ${planned.mode === 'cash' ? 'cash' : 'the bank'} on ${planned.date}.`,
    effects: ['Clears salaries payable. The deductions stay payable until deposited.'],
    figures: { period: planned.run.period, amount: planned.amount, date: planned.date, mode: planned.mode },
  };
}

export function employeePreview(state, args) {
  const plan = planEmployee(state, args);
  if (!plan.ok) return employeeBlocked(plan);
  const e = plan.employee;
  const pay = e.salary[0];
  const flags = [e.pfMember ? 'in provident fund' : '', e.esiMember ? 'in state insurance' : '', e.taxRegime ? `${e.taxRegime} tax regime` : ''].filter(Boolean);
  return {
    blockers: [],
    summary: `Add ${e.name}${e.designation ? `, ${e.designation},` : ''} joined ${e.joinedOn}, at ${money(pay.monthly)} a month${pay.components.length > 1 ? ` (${partsOf(pay.components)})` : ''}.${flags.length ? ` ${flags.join(', ')}.` : ''}`,
    effects: [NO_PAYROLL, 'Only the owner sees salaries.'],
    figures: { monthly: pay.monthly, joinedOn: e.joinedOn },
  };
}

export function salaryChangePreview(state, args) {
  const plan = planSalaryChange(state, args);
  if (!plan.ok) return employeeBlocked(plan);
  return {
    blockers: [],
    summary: `${plan.employee.name}: ${money(plan.row.monthly)} a month from ${plan.row.from}${plan.before ? `, was ${money(plan.before.monthly)}` : ''}.`,
    effects: ['Earlier months keep the salary they had.', NO_PAYROLL],
    figures: { monthly: plan.row.monthly, from: plan.row.from, was: plan.before?.monthly ?? null },
  };
}

export function leavingPreview(state, args) {
  const plan = planLeaving(state, args);
  if (!plan.ok) return employeeBlocked(plan);
  return {
    blockers: [],
    summary: `${plan.employee.name} left; last day ${plan.leftOn}.`,
    effects: ['Their record and salary history are kept.', 'No final settlement is worked out.'],
    figures: { leftOn: plan.leftOn },
  };
}
