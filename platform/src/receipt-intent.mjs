import { isNegated, isQuestion, normalizeChat, receiptAmount, receiptDate } from './intent.mjs';
import { localToday } from './dates.mjs';

const RECEIPT_WORDS = /\b(received|receipt|receive|paid|payment|pays|got|collected)\b/i;
const PAID_OUT = /\b(?:paid|pay|payment|sent|gave)\s+(?:\S+\s+){0,3}?to\b/i;
const NAMED_AFTER_FROM = /\bfrom\s+([A-Za-z][A-Za-z0-9 .&'-]{1,50}?)(?=\s*(?:,|$)|\s+(?:by|in|via|through|cash|bank|upi|on|for|against|₹|rs\.?|inr|\d))/i;
const EPSILON = 0.005;

function inr(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function key(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function outstandingOf(invoice) {
  const received = (invoice.receipts || []).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
  return Math.round((Number(invoice.total || 0) - received) * 100) / 100;
}

function customersNamedIn(state, text) {
  const haystack = ` ${key(text)} `;
  const names = new Map();
  for (const invoice of state.invoices || []) {
    const name = key(invoice.partyName);
    if (name && haystack.includes(` ${name} `)) names.set(name, invoice.partyName);
  }
  const found = [...names.keys()];
  const longest = found.filter((name) => !found.some((other) => other !== name && ` ${other} `.includes(` ${name} `)));
  return longest.map((name) => ({ key: name, name: names.get(name) }));
}

function reply(text) {
  return { kind: 'reply', reply: text, tools: [] };
}

function listOf(unpaid) {
  return unpaid.map((invoice) => `${invoice.id} of ${invoice.date}, ${inr(outstandingOf(invoice))} outstanding`).join('; ');
}

// Money received is recorded against one invoice. When the sentence names the customer
// but not the invoice, it is resolved only when there is exactly one honest answer;
// otherwise the open invoices are listed and nothing is recorded.
export function planReceiptWithoutInvoice(state, text) {
  const raw = normalizeChat(text);
  if (!RECEIPT_WORDS.test(raw) || /\bINV-\d+\b/i.test(raw) || PAID_OUT.test(raw)) return null;
  const customers = customersNamedIn(state, raw);
  if (customers.length === 0) {
    const named = raw.match(NAMED_AFTER_FROM);
    if (!named) return null;
    return reply(`I have no customer called ${named[1].trim()} in these books, so I have recorded nothing. Check the name, or say the invoice number.`);
  }
  if (customers.length > 1) {
    return reply(`That could be ${customers.map((c) => c.name).join(' or ')}. Say which customer, or the invoice number. I have recorded nothing.`);
  }

  const customer = customers[0];
  const unpaid = (state.invoices || []).filter((invoice) => key(invoice.partyName) === customer.key && outstandingOf(invoice) > EPSILON);
  if (isQuestion(raw) || isNegated(raw)) {
    return reply(unpaid.length
      ? `${customer.name} owes ${inr(unpaid.reduce((sum, invoice) => sum + outstandingOf(invoice), 0))}: ${listOf(unpaid)}. I have recorded nothing.`
      : `${customer.name} owes nothing. I have recorded nothing.`);
  }
  if (unpaid.length === 0) return reply(`${customer.name} has no unpaid invoice, so I have recorded nothing.`);

  const amount = receiptAmount(raw);
  const exact = amount == null ? [] : unpaid.filter((invoice) => Math.abs(outstandingOf(invoice) - amount) <= EPSILON);
  const chosen = unpaid.length === 1 ? unpaid[0] : exact.length === 1 ? exact[0] : null;
  if (!chosen) {
    return reply(`${customer.name} has ${unpaid.length} unpaid invoices: ${listOf(unpaid)}. Say which one, for example "received ${amount == null ? 'the amount' : amount} against ${unpaid[0].id}". I have recorded nothing.`);
  }
  return {
    kind: 'tool',
    name: 'record_receipt',
    args: {
      invoiceId: chosen.id,
      mode: /\bcash\b/i.test(raw) ? 'cash' : 'bank',
      date: receiptDate(raw, localToday()),
      ...(amount == null ? {} : { amount }),
    },
  };
}
