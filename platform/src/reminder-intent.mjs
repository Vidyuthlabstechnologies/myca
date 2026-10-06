import { normalizeChat, isNegated, isQuestion } from './intent.mjs';
import { localToday } from './dates.mjs';

const TRIGGER = /^\s*(?:please\s+)?(?:remind\s+me|set\s+(?:a\s+)?reminder|yaad\s+dila(?:na|o|iye)?)\b\s*(?:(?:to|about|that|for|of)\b)?\s*/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_WORD = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

function iso(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function fromIso(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(today, days) {
  const date = fromIso(today);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

function validDay(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? iso(date) : null;
}

function nextOn(today, month, day) {
  const year = Number(today.slice(0, 4));
  const thisYear = validDay(year, month, day);
  if (thisYear && thisYear >= today) return thisYear;
  return validDay(year + 1, month, day);
}

const PATTERNS = [
  { re: /\bday\s+after\s+tomorrow\b/i, due: (today) => addDays(today, 2) },
  { re: /\btomorrow\b|\bkal\b/i, due: (today) => addDays(today, 1) },
  { re: /\btoday\b|\baaj\b|\btonight\b|\bthis\s+evening\b/i, due: (today) => today },
  { re: /\bin\s+(\d{1,3})\s+days?\b/i, due: (today, m) => addDays(today, Number(m[1])) },
  { re: /\bin\s+(\d{1,2})\s+weeks?\b/i, due: (today, m) => addDays(today, 7 * Number(m[1])) },
  { re: /\bnext\s+week\b/i, due: (today) => addDays(today, 7) },
  { re: /\b(?:on\s+)?(\d{4})-(\d{2})-(\d{2})\b/, due: (today, m) => validDay(Number(m[1]), Number(m[2]), Number(m[3])) },
  { re: /\b(?:on\s+)?(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/, due: (today, m) => validDay(Number(m[3]), Number(m[2]), Number(m[1])) },
  { re: new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_WORD}\\b`, 'i'), due: (today, m) => nextOn(today, MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, Number(m[1])) },
  { re: new RegExp(`\\b(?:on\\s+)?${MONTH_WORD}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), due: (today, m) => nextOn(today, MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2])) },
  {
    re: /\b(?:on\s+|next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
    due: (today, m) => {
      const want = WEEKDAYS.indexOf(m[1].toLowerCase());
      const now = fromIso(today).getUTCDay();
      return addDays(today, ((want - now + 7) % 7) || 7);
    },
  },
];

export function isReminderIntent(text) {
  return TRIGGER.test(normalizeChat(text));
}

export function parseReminder(text, today = localToday()) {
  const raw = normalizeChat(text);
  if (!TRIGGER.test(raw)) return { ok: false, error: 'NOT_A_REMINDER' };
  let rest = raw.replace(TRIGGER, ' ');
  let due = null;
  for (const pattern of PATTERNS) {
    const found = rest.match(pattern.re);
    if (!found) continue;
    due = pattern.due(today, found);
    rest = rest.replace(found[0], ' ');
    break;
  }
  const invoice = rest.match(/\b(INV-\d{4,})\b/i);
  const bill = rest.match(/\b(BILL-\d{4,})\b/i);
  const text2 = rest.replace(/\s+/g, ' ').replace(/^\s*(?:to|about|that|for)\s+/i, '').replace(/[\s,.]+$/, '').trim();
  const ref = invoice ? invoice[1].toUpperCase() : bill ? bill[1].toUpperCase() : '';
  const onlyRef = ref && text2.toUpperCase() === ref;
  const words = text2 && !onlyRef ? text2 : ref ? `Follow up ${ref}` : '';
  if (!words) return { ok: false, error: 'NO_TEXT' };
  if (!due) return { ok: false, error: 'NO_DATE', text: words };
  return {
    ok: true,
    args: {
      text: words.charAt(0).toUpperCase() + words.slice(1),
      due,
      ...(invoice ? { invoiceId: invoice[1].toUpperCase() } : {}),
      ...(!invoice && bill ? { billId: bill[1].toUpperCase() } : {}),
    },
  };
}

export function planReminderFromChat(text, today = localToday()) {
  const raw = normalizeChat(text);
  if (!isReminderIntent(raw)) return null;
  if (isQuestion(raw) && !/^\s*(?:please\s+)?remind/i.test(raw)) return null;
  if (isNegated(raw.replace(TRIGGER, ' '))) return null;
  const parsed = parseReminder(raw, today);
  if (parsed.ok) return { kind: 'tool', name: 'add_reminder', args: parsed.args };
  const reply = parsed.error === 'NO_DATE'
    ? `When should I remind you to ${parsed.text.charAt(0).toLowerCase()}${parsed.text.slice(1)}? Say it again with a day, for example "tomorrow", "in 3 days" or "on 15 Oct". I have not set anything.`
    : 'What should I remind you about? For example "remind me to call Rajesh tomorrow". I have not set anything.';
  return { kind: 'reply', reply, tools: [] };
}
