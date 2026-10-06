import { isNegated, isQuestion, normalizeChat, receiptAmount, receiptDate } from './intent.mjs';
import { billOutstanding } from './invoice.mjs';
import { localToday } from './dates.mjs';

const PAID_WORDS = /\b(paid|pay|paying|payment|settled|settle|cleared|clear)\b/i;
const MONEY_IN = /\b(received|receive|receipt|got|collected)\b/i;
const NEW_DOCUMENT = /\b(bought|buy|purchased?|bill\s+from|invoice|gst\s*@?\s*\d)/i;
const EPSILON = 0.005;

function inr(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function key(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function reply(text) {
  return { kind: 'reply', reply: text, tools: [] };
}

function suppliersNamedIn(state, text) {
  const haystack = ` ${key(text)} `;
  const names = new Map();
  for (const bill of state.purchases || []) {
    const name = key(bill.partyName);
    if (name && haystack.includes(` ${name} `)) names.set(name, bill.partyName);
  }
  const found = [...names.keys()];
  const longest = found.filter((name) => !found.some((other) => other !== name && ` ${other} `.includes(` ${name} `)));
  return longest.map((name) => ({ key: name, name: names.get(name) }));
}

function billNamed(state, text) {
  const words = ` ${String(text).toUpperCase()} `;
  return (state.purchases || []).find((bill) => words.includes(` ${bill.id.toUpperCase()} `)
    || (bill.supplierInvoiceNo && new RegExp(`\\bBILL\\s*(?:NO\\.?|NUMBER)?\\s*${bill.supplierInvoiceNo.replace(/[^A-Z0-9]/gi, '')}\\b`, 'i').test(text)));
}

function listOf(unpaid) {
  return unpaid.map((bill) => `${bill.id}${bill.supplierInvoiceNo ? ` (their ${bill.supplierInvoiceNo})` : ''} of ${bill.date}, ${inr(billOutstanding(bill))} owed`).join('; ');
}

function paymentCall(raw, billId, amount) {
  return {
    kind: 'tool',
    name: 'record_payment',
    args: {
      billId,
      mode: /\bcash\b/i.test(raw) ? 'cash' : 'bank',
      date: receiptDate(raw, localToday()),
      ...(amount == null ? {} : { amount }),
    },
  };
}

export function planPaymentFromChat(state, text) {
  const raw = normalizeChat(text);
  if (!PAID_WORDS.test(raw) || MONEY_IN.test(raw)) return null;
  const amount = receiptAmount(raw);
  const named = billNamed(state, raw);
  if (named) {
    if (isQuestion(raw) || isNegated(raw)) {
      const owed = billOutstanding(named);
      return reply(`${owed > EPSILON ? `${inr(owed)} is owed on ${named.id} to ${named.partyName}.` : `${named.id} is paid.`} I have recorded nothing.`);
    }
    return paymentCall(raw, named.id, amount);
  }
  if (NEW_DOCUMENT.test(raw)) return null;
  const suppliers = suppliersNamedIn(state, raw);
  if (suppliers.length === 0) return null;
  if (suppliers.length > 1) return reply(`That could be ${suppliers.map((s) => s.name).join(' or ')}. Say which supplier, or the bill number. I have recorded nothing.`);
  const supplier = suppliers[0];
  if (new RegExp(`^${supplier.key}\\s+(?:has\\s+|have\\s+)?(?:paid|settled|cleared)\\b`).test(key(raw))) return null;
  const unpaid = (state.purchases || []).filter((bill) => key(bill.partyName) === supplier.key && billOutstanding(bill) > EPSILON);
  if (isQuestion(raw) || isNegated(raw)) {
    return reply(unpaid.length
      ? `You owe ${supplier.name} ${inr(unpaid.reduce((sum, bill) => sum + billOutstanding(bill), 0))}: ${listOf(unpaid)}. I have recorded nothing.`
      : `You owe ${supplier.name} nothing on bills in these books. I have recorded nothing.`);
  }
  if (unpaid.length === 0) return reply(`${supplier.name} has no unpaid bill in these books, so I have recorded nothing. If this was a different expense, say what it was for.`);
  const exact = amount == null ? [] : unpaid.filter((bill) => Math.abs(billOutstanding(bill) - amount) <= EPSILON);
  const chosen = unpaid.length === 1 ? unpaid[0] : exact.length === 1 ? exact[0] : null;
  if (!chosen) {
    return reply(`${supplier.name} has ${unpaid.length} unpaid bills: ${listOf(unpaid)}. Say which one, for example "paid ${amount == null ? 'the amount' : amount} against ${unpaid[0].id}". I have recorded nothing.`);
  }
  return paymentCall(raw, chosen.id, amount);
}
