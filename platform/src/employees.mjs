import { localToday, postingDate } from './dates.mjs';

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const UAN = /^[0-9]{12}$/;
const STATE = /^[0-9]{2}$/;
const MAX_COMPONENTS = 10;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function salaryPrivate(state) {
  const actor = state?.__actor;
  return Boolean(actor && actor.userId && actor.role !== 'admin');
}

function nextId(state) {
  const taken = new Set((state.employees || []).map((item) => item.id));
  let id;
  do {
    state.employeeSeq = Number(state.employeeSeq || 0) + 1;
    id = `EMP-${String(state.employeeSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

function componentsOf(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) return fail('SALARY_REQUIRED');
  if (list.length > MAX_COMPONENTS) return fail('TOO_MANY_COMPONENTS', { max: MAX_COMPONENTS });
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const name = String(item?.name || '').trim().replace(/\s+/g, ' ');
    const amount = Number(item?.amount);
    if (!name || name.length > 40) return fail('BAD_COMPONENT', { name });
    if (seen.has(name.toLowerCase())) return fail('DUPLICATE_COMPONENT', { name });
    if (!Number.isFinite(amount) || amount < 0) return fail('BAD_AMOUNT', { name });
    seen.add(name.toLowerCase());
    out.push({ name, amount: round2(amount) });
  }
  const monthly = round2(out.reduce((sum, item) => sum + item.amount, 0));
  if (monthly <= 0) return fail('ZERO_SALARY');
  return { ok: true, components: out, monthly };
}

function detailsOf(args, existing = {}) {
  const pick = (key) => (args[key] === undefined ? existing[key] : args[key]);
  const pan = String(pick('pan') || '').trim().toUpperCase();
  if (pan && !PAN.test(pan)) return fail('BAD_PAN', { pan });
  const uan = String(pick('uan') || '').replace(/\s+/g, '');
  if (uan && !UAN.test(uan)) return fail('BAD_UAN');
  const ptState = String(pick('ptState') || '').trim();
  if (ptState && !STATE.test(ptState)) return fail('BAD_STATE', { ptState });
  const taxRegime = String(pick('taxRegime') || '');
  if (taxRegime && !['new', 'old'].includes(taxRegime)) return fail('BAD_REGIME', { taxRegime });
  const sex = String(pick('sex') || '').toLowerCase();
  if (sex && !['male', 'female'].includes(sex)) return fail('BAD_SEX', { sex });
  return {
    ok: true,
    details: {
      designation: String(pick('designation') || '').trim().slice(0, 60),
      pan,
      uan,
      pfMember: Boolean(pick('pfMember')),
      esiMember: Boolean(pick('esiMember')),
      ptState,
      taxRegime,
      sex,
    },
  };
}

export function salaryOn(employee, date) {
  const rows = (employee.salary || []).filter((row) => row.from <= date);
  return rows.length ? rows[rows.length - 1] : null;
}

function view(employee, today) {
  const current = salaryOn(employee, today) || employee.salary[0];
  const active = !employee.leftOn || employee.leftOn >= today;
  return { ...employee, monthly: current.monthly, components: current.components, active };
}

export function planEmployee(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const name = String(args.name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80) return fail('NAME_REQUIRED');
  const joinedOn = postingDate(args.joinedOn);
  if (!joinedOn) return fail('INVALID_DATE', { date: args.joinedOn });
  const pay = componentsOf(args.components);
  if (!pay.ok) return pay;
  const more = detailsOf(args);
  if (!more.ok) return more;
  const same = (state.employees || []).find((item) => item.name.toLowerCase() === name.toLowerCase() && !item.leftOn);
  if (same) return fail('ALREADY_EMPLOYED', { id: same.id, name: same.name });
  return { ok: true, employee: { name, joinedOn, ...more.details, salary: [{ from: joinedOn, components: pay.components, monthly: pay.monthly }] } };
}

export function addEmployee(state, args = {}) {
  const plan = planEmployee(state, args);
  if (!plan.ok) return plan;
  const employee = { id: nextId(state), ...plan.employee };
  state.employees = state.employees || [];
  state.employees.push(employee);
  return { ok: true, employee };
}

function findEmployee(state, id) {
  return (state.employees || []).find((item) => item.id === String(id || '').trim().toUpperCase()) || null;
}

export function planSalaryChange(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const employee = findEmployee(state, args.id);
  if (!employee) return fail('EMPLOYEE_NOT_FOUND', { id: args.id });
  const from = postingDate(args.effectiveFrom);
  if (!from) return fail('INVALID_DATE', { date: args.effectiveFrom });
  if (from < employee.joinedOn) return fail('BEFORE_JOINING', { joinedOn: employee.joinedOn });
  if (employee.leftOn && from > employee.leftOn) return fail('AFTER_LEAVING', { leftOn: employee.leftOn });
  const pay = componentsOf(args.components);
  if (!pay.ok) return pay;
  const before = salaryOn(employee, from);
  return { ok: true, employee, row: { from, components: pay.components, monthly: pay.monthly }, before };
}

export function changeSalary(state, args = {}) {
  const plan = planSalaryChange(state, args);
  if (!plan.ok) return plan;
  const rows = plan.employee.salary.filter((row) => row.from !== plan.row.from);
  rows.push(plan.row);
  rows.sort((a, b) => a.from.localeCompare(b.from));
  plan.employee.salary = rows;
  return { ok: true, employee: plan.employee, salary: plan.row, before: plan.before };
}

export function planLeaving(state, args = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const employee = findEmployee(state, args.id);
  if (!employee) return fail('EMPLOYEE_NOT_FOUND', { id: args.id });
  if (employee.leftOn) return fail('ALREADY_LEFT', { leftOn: employee.leftOn });
  const leftOn = postingDate(args.leftOn);
  if (!leftOn) return fail('INVALID_DATE', { date: args.leftOn });
  if (leftOn < employee.joinedOn) return fail('BEFORE_JOINING', { joinedOn: employee.joinedOn });
  return { ok: true, employee, leftOn };
}

export function endEmployment(state, args = {}) {
  const plan = planLeaving(state, args);
  if (!plan.ok) return plan;
  plan.employee.leftOn = plan.leftOn;
  return { ok: true, employee: plan.employee };
}

export function listEmployees(state, { today, include = 'current' } = {}) {
  if (salaryPrivate(state)) return fail('SALARIES_PRIVATE');
  const day = postingDate(today) || localToday();
  const all = (state.employees || []).map((item) => view(item, day));
  const rows = include === 'all' ? all : all.filter((item) => item.active);
  return {
    ok: true,
    data: {
      employees: rows,
      monthlyTotal: round2(rows.filter((item) => item.active).reduce((sum, item) => sum + item.monthly, 0)),
      note: 'Monthly pay before any deduction. Provident fund, state insurance, professional tax and TDS are not worked out yet.',
    },
  };
}
