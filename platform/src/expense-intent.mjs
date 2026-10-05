import { isNegated, isQuestion, normalizeChat, receiptDate } from './intent.mjs';
import { localToday } from './dates.mjs';

const STARTS_AS_EXPENSE = /^(?:i\s+)?(?:paid|spent|expense|expenses|bought)\b/i;
const EXPENSE_WORDS = /\b(?:paid|spent|expense|expenses)\b/i;
const MONEY_IN = /\b(?:received|receipt|collected|got|from\s+(?!bank\b|cash\b|upi\b|account\b))/i;
const GSTIN = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/i;
const RATE = /\b(?:with|incl(?:uding|usive)?(?:\s+of)?|at|@|gst|plus)?\s*(\d{1,2}(?:\.\d+)?)\s*%\s*(?:gst)?/i;
const RATE_WORD = /\bgst\s*(?:@|at|of|rate|is)?\s*(\d{1,2}(?:\.\d+)?)(?![\d,])\s*(?:%|percent)?/i;
const AMOUNT = /(?:₹|rs\.?|inr)?\s*(?<![\w.,-])(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|cr|crores?)?(?![\w%])/gi;
const NOT_AMOUNTS = /\b[a-z]{2,6}-\d+\b|\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b/gi;
const PAYEE = /\bto\s+([A-Za-z][A-Za-z0-9 .&'-]{1,40}?)(?=\s+(?:for|on|towards|by|via|from|in|₹|rs\b|inr\b|\d)|\s*,|\s*$)/i;
const MODE = /\b(?:by|from|via|through|in)\s+(cash|bank|upi|card|neft|imps|rtgs|cheque|account)\b|\b(cash)\b/i;
const FILLER = /\b(?:i|we|paid|spent|expense|expenses|bought|for|on|towards|of|the|a|an|today|yesterday|rs|inr|and|gstin)\b/gi;

function amountValue(digits, multiplier = '') {
  const base = Number(String(digits).replace(/,/g, ''));
  const unit = String(multiplier || '').toLowerCase();
  if (unit === 'k') return base * 1e3;
  if (/^(lakh|lakhs|lac|lacs)$/.test(unit)) return base * 1e5;
  if (/^(cr|crore|crores)$/.test(unit)) return base * 1e7;
  return base;
}

function reply(text) {
  return { kind: 'reply', reply: text, tools: [] };
}

function knownCustomerIn(state, text) {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const invoice of state.invoices || []) {
    const name = String(invoice.partyName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (name && name !== 'walk in' && haystack.includes(` ${name} `)) return invoice.partyName;
  }
  return '';
}

export function isExpenseIntent(text) {
  const raw = normalizeChat(text);
  return STARTS_AS_EXPENSE.test(raw) || (EXPENSE_WORDS.test(raw) && !MONEY_IN.test(raw));
}

export function parseExpense(text, today = localToday()) {
  let rest = normalizeChat(text);
  const gstinMatch = rest.match(GSTIN);
  const supplierGstin = gstinMatch ? gstinMatch[1].toUpperCase() : '';
  if (gstinMatch) rest = rest.replace(gstinMatch[0], ' ');
  let gstRate = null;
  const rateWord = rest.match(RATE_WORD) || rest.match(RATE);
  if (rateWord) {
    gstRate = Number(rateWord[1]);
    rest = rest.replace(rateWord[0], ' ');
  }
  const date = receiptDate(rest, today);
  rest = rest.replace(NOT_AMOUNTS, ' ');
  const amounts = [...rest.matchAll(AMOUNT)].map((m) => ({ text: m[0], value: amountValue(m[1], m[2]) })).filter((m) => m.value > 0);
  if (amounts.length !== 1) return { ok: false, error: amounts.length ? 'MANY_AMOUNTS' : 'NO_AMOUNT' };
  rest = rest.replace(amounts[0].text, ' ');
  let mode = 'bank';
  const modeMatch = rest.match(MODE);
  if (modeMatch) {
    mode = (modeMatch[1] || modeMatch[2]).toLowerCase() === 'cash' ? 'cash' : 'bank';
    rest = rest.replace(modeMatch[0], ' ');
  }
  let payee = '';
  const payeeMatch = rest.match(PAYEE);
  if (payeeMatch) {
    payee = payeeMatch[1].trim();
    rest = rest.replace(payeeMatch[0], ' ');
  }
  const narration = rest.replace(/[₹,]/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  return { ok: true, args: { narration: narration || payee || 'Expense', amount: amounts[0].value, gstRate: gstRate == null ? 0 : gstRate, date, mode, ...(payee ? { payee } : {}), ...(supplierGstin ? { supplierGstin } : {}) }, ratedSaid: gstRate != null };
}

export function planExpenseFromChat(state, text, today = localToday()) {
  const raw = normalizeChat(text);
  if (!isExpenseIntent(raw) || /\bINV-\d+\b/i.test(raw)) return null;
  if (isQuestion(raw) || isNegated(raw)) return null;
  const customer = knownCustomerIn(state, raw);
  if (customer && !STARTS_AS_EXPENSE.test(raw)) return null;
  if (customer) return reply(`${customer} is a customer. If this is money you returned to them, say so and I will show the invoice; I have recorded nothing.`);
  const parsed = parseExpense(raw, today);
  if (!parsed.ok) {
    return reply(parsed.error === 'MANY_AMOUNTS'
      ? 'I read more than one amount there, so I have recorded nothing. Say one expense at a time, for example "paid 12000 rent".'
      : 'I could not find the amount, so I have recorded nothing. Say it like "paid 12000 rent" or "spent 450 on petrol by cash".');
  }
  return { kind: 'tool', name: 'post_expense', args: parsed.args, ratedSaid: parsed.ratedSaid };
}
