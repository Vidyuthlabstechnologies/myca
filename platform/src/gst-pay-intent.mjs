import { isNegated, normalizeChat } from './intent.mjs';
import { localToday } from './dates.mjs';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = new RegExp(`\\b(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join('|')})\\b(?:\\s+(20\\d{2}))?`, 'i');
const HEAD = (name) => new RegExp(`\\b${name}\\b\\s*[:=]?\\s*(?:rs\\.?|₹)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i');
const AMOUNT = /\b(?:rs\.?|₹)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i;

function periodOf(raw, today) {
  const iso = raw.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b(?!-\d)/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = raw.match(MONTH);
  if (!named) return '';
  const month = MONTHS.findIndex((m) => m.startsWith(named[1].toLowerCase().slice(0, 3))) + 1;
  const [y, m] = today.split('-').map(Number);
  const year = named[2] ? Number(named[2]) : (month <= m ? y : y - 1);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function amountOf(raw, head) {
  const found = raw.match(HEAD(head));
  return found ? Number(found[1].replace(/,/g, '')) : null;
}

export function planGstPayFromChat(text) {
  const raw = normalizeChat(text);
  if (!/\bgst\b/i.test(raw) || isNegated(raw)) return null;
  const today = localToday();
  if (/\bcredit\s+(?:ledger\s+)?balance\b|\bopening\s+(?:itc|credit)\b|\bitc\s+balance\b|\bcredit\s+(?:brought|carried)\s+forward\b/i.test(raw)) {
    const period = periodOf(raw, today);
    if (!period) return { kind: 'reply', reply: 'Say which month the balance is at the start of, for example "GST credit balance at start of September: IGST 0, CGST 1200, SGST 1200". I have recorded nothing.', tools: [] };
    const igst = amountOf(raw, 'igst');
    const cgst = amountOf(raw, 'cgst');
    const sgst = amountOf(raw, 'sgst');
    if (igst == null && cgst == null && sgst == null) {
      const whole = raw.replace(MONTH, ' ').replace(/\b20\d{2}-\d{2}\b/, ' ').match(AMOUNT);
      if (!whole) return { kind: 'reply', reply: 'Say the balance by head, for example "GST credit balance at start of September: IGST 0, CGST 1200, SGST 1200". I have recorded nothing.', tools: [] };
      return { kind: 'reply', reply: `Say the ${whole[1]} by head so MyCA knows which tax it belongs to, for example "IGST 0, CGST ${whole[1]}, SGST 0". I have recorded nothing.`, tools: [] };
    }
    return { kind: 'tool', name: 'set_gst_credit_opening', args: { period, igst: igst || 0, cgst: cgst || 0, sgst: sgst || 0 } };
  }
  if (/\b(?:gst|tax)\s+(?:to\s+pay|payable|liability|due)\b|\bhow\s+much\s+gst\b|\bpay\s+(?:in|for)\s+gst\b|\bgst\s+(?:in\s+)?cash\b|\bset[\s-]?off\b/i.test(raw)) {
    const period = periodOf(raw, today);
    return { kind: 'tool', name: 'gst_payable', args: period ? { period } : {} };
  }
  return null;
}
