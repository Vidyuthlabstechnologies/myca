import { normalizeChat, isNegated } from './intent.mjs';
import { localToday } from './dates.mjs';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const AMOUNT = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|cr|crores?)?\b/i;

function value(digits, unit = '') {
  const base = Number(String(digits).replace(/,/g, ''));
  const u = String(unit || '').toLowerCase();
  if (u === 'k') return base * 1e3;
  if (/^(l|lakh|lakhs|lac|lacs)$/.test(u)) return base * 1e5;
  if (/^(cr|crore|crores)$/.test(u)) return base * 1e7;
  return base;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function whenSaid(text, today) {
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  if (/\btoday\b|\bnow\b|\baaj\b/i.test(text)) return today;
  if (/\btomorrow\b|\bkal\b/i.test(text)) return addDays(today, 1);
  if (/\bnext\s+week\b/i.test(text)) return addDays(today, 7);
  if (/\bnext\s+month\b/i.test(text)) {
    const [y, m] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  }
  const named = text.toLowerCase().match(/\b(?:in|by|for|during|this|next)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3)) + 1;
    const year = Number(today.slice(0, 4));
    const thisYear = `${year}-${String(month).padStart(2, '0')}-01`;
    if (thisYear.slice(0, 7) === today.slice(0, 7)) return today;
    return thisYear > today ? thisYear : `${year + 1}-${String(month).padStart(2, '0')}-01`;
  }
  return today;
}

export function planCashFromChat(text, today = localToday()) {
  const raw = normalizeChat(text);
  if (/\bcan\s+i\s+afford\b|\bafford\b/i.test(raw)) {
    const found = raw.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').match(AMOUNT);
    if (!found) return { kind: 'reply', reply: 'How much? Say it like "can I afford 4 lakh of stock in November".', tools: [] };
    return { kind: 'tool', name: 'can_afford', args: { amount: value(found[1], found[2]), on: whenSaid(raw, today) } };
  }
  if (/\bcash\s*(?:flow\s*)?forecast\b|\bhow\s+much\s+(?:cash|money)\s+will\s+i\s+have\b|\bcash\s+position\b/i.test(raw)) {
    const span = raw.match(/\b(\d{1,3})\s*days?\b/i) || raw.match(/\b(\d{1,2})\s*months?\b/i);
    const days = span ? (/month/i.test(span[0]) ? Number(span[1]) * 30 : Number(span[1])) : null;
    return { kind: 'tool', name: 'cash_forecast', args: days ? { days: Math.max(1, Math.min(180, days)) } : {} };
  }
  const balance = raw.match(/\b(bank|cash(?:\s+in\s+hand)?)\s+balance\s+(?:is|=|:)?\s*(?:now\s+)?(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|cr|crores?)?\b|\b(cash\s+in\s+hand)\s+(?:is|=|:)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|cr|crores?)?\b/i);
  if (balance && !isNegated(raw)) {
    const which = (balance[1] || balance[4]).toLowerCase().startsWith('bank') ? 'bank' : 'cash';
    const amount = value(balance[2] || balance[5], balance[3] || balance[6]);
    return { kind: 'tool', name: 'set_cash_balance', args: { [which]: amount } };
  }
  return null;
}
