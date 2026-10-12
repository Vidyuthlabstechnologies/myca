import { isNegated, isQuestion, normalizeChat, receiptDate } from './intent.mjs';
import { localToday } from './dates.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = new RegExp(`\\b(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join('|')})\\b(?:\\s+(20\\d{2}))?`, 'i');

function periodSaid(raw, today) {
  const iso = raw.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b(?!-\d)/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = raw.match(MONTH);
  if (!named) return '';
  const month = MONTHS.findIndex((m) => m.startsWith(named[1].toLowerCase().slice(0, 3))) + 1;
  const [y, m] = today.split('-').map(Number);
  const year = named[2] ? Number(named[2]) : (month <= m ? y : y - 1);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function latestApproved(state) {
  const periods = Object.keys(state?.payrollRuns || {}).sort();
  return periods.at(-1) || '';
}

export function planPayrollFromChat(state, text) {
  const raw = normalizeChat(text);
  if (!/\b(?:payroll|salaries|salary\s+run|payslip)\b/i.test(raw) || isNegated(raw)) return null;
  const today = localToday();
  const period = periodSaid(raw, today);
  if (/\bpayslip\b/i.test(raw)) {
    const id = (raw.match(/\b(EMP-\d{4,})\b/i) || [])[1];
    if (!id) return { kind: 'reply', reply: 'Say which employee, for example "payslip for EMP-0001 for October". I have changed nothing.', tools: [] };
    return { kind: 'tool', name: 'payslip', args: { employeeId: id.toUpperCase(), period: period || latestApproved(state) || today.slice(0, 7) } };
  }
  if (/\b(?:paid|disbursed|transferred|released)\b.*\bsalar(?:y|ies)\b|\bsalar(?:y|ies)\b.*\b(?:paid|disbursed|released)\b/i.test(raw) && !isQuestion(raw)) {
    return { kind: 'tool', name: 'record_salary_payment', args: { period: period || latestApproved(state) || today.slice(0, 7), date: receiptDate(raw, today), ...(/\bcash\b/i.test(raw) ? { mode: 'cash' } : {}) } };
  }
  if (/\bapprove\b.*\bpayroll\b|\bpayroll\b.*\bapprove\b/i.test(raw) && !isQuestion(raw)) {
    return { kind: 'tool', name: 'approve_payroll', args: { period: period || today.slice(0, 7) } };
  }
  if (/\b(?:payroll\s+(?:months|history|list)|past\s+payrolls?|approved\s+payrolls?)\b/i.test(raw)) {
    return { kind: 'tool', name: 'list_payroll', args: {} };
  }
  if (/\b(?:run|show|prepare|compute|calculate|this\s+month's|my)\s+payroll\b|^payroll\b|\bpayroll\s+for\b/i.test(raw)) {
    return { kind: 'tool', name: 'payroll_run', args: period ? { period } : {} };
  }
  return null;
}
