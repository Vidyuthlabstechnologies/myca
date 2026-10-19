import { isNegated, isQuestion, normalizeChat, receiptAmount, receiptDate } from './intent.mjs';
import { localToday } from './dates.mjs';

const ASK = /\badvance\s+tax\b|\bhow\s+much\s+tax\s+(?:to|should\s+i)\s+(?:set\s+aside|keep|save)\b|\btax\s+kitna\s+(?:bachana|rakhna)\s+hai\b|\b15\s+(?:june|september|december|march)\s+instal?lment\b/i;
const PAID = /^(?:paid|deposited|i\s+paid)\s+advance\s+tax\b/i;
const CHALLAN = /\b(?:challan|cin)\s*(?:no\.?|number|#)?\s*:?\s*([A-Za-z0-9-]{6,30})\b/i;

export function planAdvanceTaxFromChat(state, text) {
  const raw = normalizeChat(text).trim();
  if (isNegated(raw)) return null;
  if (PAID.test(raw) && !isQuestion(raw)) {
    const amount = receiptAmount(raw.replace(CHALLAN, ' '));
    if (amount == null) return { kind: 'reply', reply: 'Say the amount, for example "paid advance tax 48000 challan 0510001234567". I have recorded nothing.', tools: [] };
    const challan = (raw.match(CHALLAN) || [])[1] || '';
    return { kind: 'tool', name: 'record_advance_tax', args: { amount, date: receiptDate(raw, localToday()), ...(challan ? { challan } : {}), mode: /\bcash\b/i.test(raw) ? 'cash' : 'bank' } };
  }
  if (!ASK.test(raw)) return null;
  const args = {};
  if (/\bold\s+regime\b/i.test(raw)) args.regime = 'old';
  if (/\bpresumptive\b|\b44ad\b|\bsection\s+58\b/i.test(raw)) args.presumptive = true;
  return { kind: 'tool', name: 'advance_tax', args };
}
