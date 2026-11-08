import { normalizeChat, isNegated, isQuestion } from './intent.mjs';

const DAYS = '(?:net\\s*(\\d{1,3})|(\\d{1,3})\\s*days?|(?:on|upon)\\s+receipt|immediately)';
const ON_INVOICE = /(?<!\s)\s*,?\s*\b(?:net\s*(\d{1,3})|(?:due|payable)\s+(?:in|within)\s+(\d{1,3})\s*days?|(?:due|payable)\s+on\s+receipt)\b/i;

function daysFrom(match, first) {
  const net = match[first];
  const plain = match[first + 1];
  if (net != null) return Number(net);
  if (plain != null) return Number(plain);
  return 0;
}

export function takeInvoiceTerms(text) {
  const raw = String(text || '');
  const found = raw.match(ON_INVOICE);
  if (!found) return { text: raw, days: null };
  const days = found[1] != null ? Number(found[1]) : found[2] != null ? Number(found[2]) : 0;
  return { text: raw.replace(found[0], ' ').replace(/\s+/g, ' ').trim(), days };
}

const SET_PATTERNS = [
  new RegExp(`^(.+?)\\s+(?:pays?|will\\s+pay)\\s+(?:in|within|after)\\s+${DAYS}`, 'i'),
  new RegExp(`\\b(?:set\\s+)?(?:the\\s+)?(?:payment\\s+)?terms?\\s+(?:for|of)\\s+(.+?)\\s*(?:to|as|is|are|:|=)?\\s*${DAYS}`, 'i'),
  new RegExp(`\\bset\\s+(.+?)['’]s?\\s+(?:payment\\s+)?terms?\\s+(?:to|as)\\s+${DAYS}`, 'i'),
  new RegExp(`\\bgive\\s+(.+?)\\s+${DAYS}\\s+(?:to\\s+pay|credit)`, 'i'),
];

export function planTermsFromChat(text) {
  const raw = normalizeChat(text);
  if (!/\b(?:terms?|pays?|will\s+pay|credit)\b/i.test(raw)) return null;
  if (/\b(?:INV|BILL)-\d+/i.test(raw) || /\binvoice\b|\bsold\b|\bbill\b/i.test(raw)) return null;
  if (isQuestion(raw) || isNegated(raw)) return null;
  for (const pattern of SET_PATTERNS) {
    const found = raw.match(pattern);
    if (!found) continue;
    const name = found[1].replace(/^(?:set|for|of)\s+/i, '').replace(/['’]s$/i, '').trim();
    if (!name || name.length > 80) continue;
    const days = daysFrom(found, 2);
    return { kind: 'tool', name: 'set_payment_terms', args: { partyName: name, days } };
  }
  return null;
}
