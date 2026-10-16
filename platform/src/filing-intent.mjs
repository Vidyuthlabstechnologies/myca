import { isNegated, isQuestion, normalizeChat, receiptDate } from './intent.mjs';
import { localToday } from './dates.mjs';

const RETURN = /\b(GSTR[\s-]?(?:1|3B|4|9C?)|CMP[\s-]?08|ITR)\b/i;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const ARN = /\b(?:ARN|ack(?:nowledge?ment)?(?:\s+(?:no\.?|number))?)\s*[:#-]?\s*([A-Z0-9]{10,20})\b/i;

function returnTypeOf(raw) {
  const found = raw.match(RETURN);
  if (!found) return '';
  const compact = found[1].toUpperCase().replace(/[\s-]/g, '');
  if (compact === 'ITR') return 'ITR';
  if (compact.startsWith('CMP')) return 'CMP-08';
  return `GSTR-${compact.slice(4)}`;
}

export function saidPeriod(text, today = localToday()) {
  return periodOf(normalizeChat(text), today);
}

function periodOf(raw, today) {
  const iso = raw.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b(?!-\d)/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = raw.match(new RegExp(`\\b(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join('|')})\\b(?:\\s+(20\\d{2}))?`, 'i'));
  if (!named) return '';
  const month = MONTHS.findIndex((m) => m.startsWith(named[1].toLowerCase().slice(0, 3))) + 1;
  const [y, m] = today.split('-').map(Number);
  const year = named[2] ? Number(named[2]) : (month < m ? y : y - 1);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function planFilingFromChat(text) {
  const raw = normalizeChat(text);
  if (!/\bfiled\b/i.test(raw) || isQuestion(raw) || isNegated(raw) || /\b(?:not|never|haven'?t|hasn'?t|didn'?t|yet\s+to)\b/i.test(raw)) return null;
  const returnType = returnTypeOf(raw);
  if (!returnType) return null;
  const today = localToday();
  const period = periodOf(raw, today);
  const arn = (raw.match(ARN) || [])[1];
  if (!period || !arn) {
    return {
      kind: 'reply',
      reply: `To record it, say the period and the acknowledgement number (ARN), for example "filed ${returnType} for September, ARN AA2909261234567". I have recorded nothing.`,
      tools: [],
    };
  }
  const by = (raw.match(/\bby\s+(?:my\s+)?(CA|accountant|me|myself)\b/i) || [])[1];
  return {
    kind: 'tool',
    name: 'record_filing',
    args: {
      returnType,
      period,
      arn: arn.toUpperCase(),
      filedOn: receiptDate(raw.replace(/\b20\d{2}-\d{2}\b(?!-\d)/, ' '), today),
      ...(by ? { filedBy: /^(me|myself)$/i.test(by) ? 'the owner' : `the ${by.toUpperCase() === 'CA' ? 'CA' : by.toLowerCase()}` } : {}),
    },
  };
}
