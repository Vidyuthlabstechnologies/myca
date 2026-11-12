import { localToday } from './dates.mjs';
import { isReturnPeriod } from './return-period.mjs';

const SALES_KIND_WORDS = [
  { kind: 'proforma', words: /\b(?:make\s+(?:a|an)\s+|send\s+(?:a|an)\s+)?(?:pro\s*-?\s*forma(?:\s+invoice)?|pi)\b/i, label: 'proforma invoice', example: 'proforma ABC Ltd 50000 for consulting GST 18%' },
  { kind: 'order', words: /\b(?:make\s+(?:a|an)\s+|book\s+(?:a|an)\s+)?(?:sales\s+order|sale\s+order)\b/i, label: 'sales order', example: 'sales order ABC Ltd 50000 for chairs GST 18%' },
  { kind: 'challan', words: /\b(?:make\s+(?:a|an)\s+|send\s+(?:a|an)\s+)?(?:delivery\s+challan|challan)\b/i, label: 'delivery challan', example: 'delivery challan ABC Ltd 50000 for fabric GST 5% for job work' },
  { kind: 'quote', words: /\b(?:make\s+(?:a|an)\s+|send\s+(?:a|an)\s+)?(?:quotation|quote|estimate)\b/i, label: 'quote', example: 'quote ABC Ltd 50000 for consulting GST 18%' },
];

export function salesDocumentKindSaid(text) {
  if (/\b(?:gst|tds|tax|cpin)\s+challan\b|\bchallan\s+(?:no|number|for\s+(?:gst|tds))\b/i.test(text)) return null;
  return SALES_KIND_WORDS.find((entry) => entry.words.test(text)) || null;
}

export const EXCEL_PERIOD_WORDS = /\b(this\s+month|last\s+month|this\s+quarter|this\s+year|last\s+year)\b/i;
export const AUDIT_TRAIL_PHRASES = '\\baudit[\\s-]*(?:trail|log)s?\\b|\\b(?:edit|change)[\\s-]*logs?\\b|\\bwho\\s+changed\\b|\\bwhat\\s+changed\\s+in\\s+(?:(?:the|my|our|your)\\s+)?books\\b';

export function nameKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export const CHAT_MONTH_WORDS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

const FINANCIAL_YEAR_LABELLED = /\b(?:fy\.?|f\.\s?y\.?|financial\s+year)\s*[:#-]?\s*(\d{2,4})(?:\s*[-/]\s*(\d{2,4}))?(?![\d/-])/gi;
const FINANCIAL_YEAR_ASSESSED = /\b(?:ay|a\.\s?y\.?|assessment\s+year)\s*[:#-]?\s*(\d{2,4})(?:\s*[-/]\s*(\d{2,4}))?(?![\d/-])/gi;
const FINANCIAL_YEAR_RELATIVE = /\b(last|previous|prior|preceding|this|current)\s+(?:financial\s+year|fy|f\.\s?y\.?)(?![\w-])/gi;
const FINANCIAL_YEAR_BARE = /(?<![\w/.-])(20\d{2})\s*-\s*(\d{2}|20\d{2})(?![\w/-])/g;

function financialYearStart(iso) {
  const [year, month] = iso.split('-').map(Number);
  return month >= 4 ? year : year - 1;
}

function financialYearStartOf(startText, endText) {
  const start = startText.length === 2 ? 2000 + Number(startText) : startText.length === 4 ? Number(startText) : 0;
  if (!endText || start < 2000 || start > 2099) return null;
  const consistent = endText.length === 2 ? Number(endText) === (start + 1) % 100 : endText.length === 4 && Number(endText) === start + 1;
  return consistent ? start : null;
}

function financialYearRange(start, text) {
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, text };
}

export function financialYearSaid(text, today = localToday()) {
  const spaced = text.replace(/\s+/g, ' ');
  const current = financialYearStart(today);
  const found = [];
  const take = (pattern, read) => {
    for (const hit of spaced.matchAll(pattern)) {
      const at = hit.index;
      const end = at + hit[0].length;
      if (found.some((other) => at < other.end && end > other.at)) continue;
      const reading = read(hit);
      if (reading) found.push({ at, end, ...reading });
    }
  };
  take(FINANCIAL_YEAR_ASSESSED, (hit) => {
    const start = financialYearStartOf(hit[1], hit[2]);
    return start == null ? { unreadable: true } : financialYearRange(start - 1, hit[0]);
  });
  take(FINANCIAL_YEAR_LABELLED, (hit) => {
    const start = financialYearStartOf(hit[1], hit[2]);
    return start == null ? { unreadable: true } : financialYearRange(start, hit[0]);
  });
  take(FINANCIAL_YEAR_BARE, (hit) => {
    if (isReturnPeriod(`${hit[1]}-${hit[2]}`)) return null;
    const start = financialYearStartOf(hit[1], hit[2]);
    return start == null ? { unreadable: true } : financialYearRange(start, hit[0]);
  });
  take(FINANCIAL_YEAR_RELATIVE, (hit) => financialYearRange(/^(?:this|current)$/i.test(hit[1]) ? current : current - 1, hit[0]));
  if (found.length === 0) return null;
  if (found.length > 1 || found[0].unreadable) return { unreadable: true };
  return { from: found[0].from, to: found[0].to, text: found[0].text };
}

export const CHAT_MONTH_PREFIXES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function chatMonthKey(word, year, today) {
  const [thisYear, thisMonth] = today.split('-').map(Number);
  const number = CHAT_MONTH_PREFIXES.indexOf(word.slice(0, 3).toLowerCase()) + 1;
  return `${year ? Number(year) : number <= thisMonth ? thisYear : thisYear - 1}-${String(number).padStart(2, '0')}`;
}

export const REMINDER_WORDS = /\b(?:remind(?:er|ers|s)?|yaad\s+dila(?:na|o|iye)?)\b/i;

export const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
