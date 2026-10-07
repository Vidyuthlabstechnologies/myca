import { isNegated, isQuestion, normalizeChat, receiptAmount, receiptDate } from './intent.mjs';
import { localToday } from './dates.mjs';

const ADD = /\b(?:add|new)\s+(?:an?\s+)?employee\b|\bhired\b/i;
const NAME = /\b(?:add\s+(?:an?\s+)?employee|new\s+employee|hired)\s*:?\s+([A-Za-z][A-Za-z .'-]{0,79}?)(?=\s*(?:,|$)|\s+(?:joined|joining|from|on|at|with|salary|pay|as|₹|rs\.?|\d))/i;
const ROLE = /\bas\s+(?:an?\s+)?([A-Za-z][A-Za-z .'-]{1,59}?)(?=\s*(?:,|$)|\s+(?:joined|joining|from|on|at|with|salary|pay|₹|rs\.?|\d))/i;

export function planEmployeeFromChat(text) {
  const raw = normalizeChat(text);
  if (!ADD.test(raw) || isQuestion(raw) || isNegated(raw)) return null;
  const name = (raw.match(NAME) || [])[1];
  const amount = receiptAmount(raw.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' '));
  if (!name || amount == null) {
    return {
      kind: 'reply',
      reply: 'To add an employee, say their name, the day they joined and the monthly salary, for example "add employee Ravi Kumar, joined 2026-09-01, salary 25000". I have recorded nothing.',
      tools: [],
    };
  }
  const designation = (raw.match(ROLE) || [])[1];
  return {
    kind: 'tool',
    name: 'add_employee',
    args: {
      name: name.trim(),
      joinedOn: receiptDate(raw, localToday()),
      components: [{ name: 'Salary', amount }],
      ...(designation ? { designation: designation.trim() } : {}),
    },
  };
}
