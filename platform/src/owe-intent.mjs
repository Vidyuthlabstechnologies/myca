import { normalizeChat } from './intent.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { billOutstanding } from './invoice.mjs';

const EPSILON = 0.005;
const OWE = /\b(?:owe|owes|owed|owing|outstanding|dues)\b/i;
const I_OWE = /\b(?:i|we)\s+(?:still\s+)?(?:owe|have\s+to\s+pay|need\s+to\s+pay)\b|\bowed\s+by\s+(?:me|us)\b|\b(?:do|did)\s+(?:i|we)\s+owe\b/i;
const OWES_ME = /\bowes?\s+(?:me|us)\b|\bowed\s+to\s+(?:me|us)\b|\bwho\s+owes\b|\bowe\s+me\b/i;

function inr(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function key(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function reply(text) {
  return { kind: 'reply', reply: text, tools: [] };
}

function named(documents, text) {
  const haystack = ` ${key(text)} `;
  const names = new Map();
  for (const doc of documents) {
    const name = key(doc.partyName);
    if (name && haystack.includes(` ${name} `)) names.set(name, doc.partyName);
  }
  const found = [...names.keys()];
  return found.filter((name) => !found.some((other) => other !== name && ` ${other} `.includes(` ${name} `))).map((name) => ({ key: name, name: names.get(name) }));
}

function grouped(rows) {
  const by = new Map();
  for (const row of rows) {
    const k = key(row.name);
    const entry = by.get(k) || { name: row.name, due: 0, count: 0 };
    entry.due = Math.round((entry.due + row.due) * 100) / 100;
    entry.count += 1;
    by.set(k, entry);
  }
  return [...by.values()].sort((a, b) => b.due - a.due);
}

function customerRows(state) {
  return (state.invoices || [])
    .filter((invoice) => invoice.status !== 'cancelled')
    .map((invoice) => ({ id: invoice.id, date: invoice.date, name: invoice.partyName, due: outstandingOf(state, invoice) }))
    .filter((row) => row.due > EPSILON);
}

function supplierRows(state) {
  return (state.purchases || [])
    .map((bill) => ({ id: bill.supplierInvoiceNo ? `${bill.id} (their ${bill.supplierInvoiceNo})` : bill.id, date: bill.date, name: bill.partyName, due: billOutstanding(bill) }))
    .filter((row) => row.due > EPSILON);
}

function detail(rows) {
  return rows.map((row) => `${row.id} of ${row.date}, ${inr(row.due)}`).join('; ');
}

function summary(rows, empty, lead) {
  if (!rows.length) return reply(empty);
  const people = grouped(rows);
  const total = people.reduce((sum, person) => sum + person.due, 0);
  const top = people.slice(0, 5).map((person) => `${person.name} ${inr(person.due)}`).join(', ');
  return reply(`${lead} ${inr(total)} in all: ${top}${people.length > 5 ? `, and ${people.length - 5} more` : ''}. Nothing was recorded.`);
}

export function planOweQuestion(state, text) {
  const raw = normalizeChat(text);
  if (!OWE.test(raw)) return null;
  const asking = /\?\s*$/.test(raw) || /^(?:how\s+much|what|who|whom|does|do|is|are|show|tell|list)\b/i.test(raw);
  if (!asking) return null;
  const toSuppliers = I_OWE.test(raw) || /\bwho\s+do\s+(?:i|we)\s+owe\b/i.test(raw) || /\b(?:suppliers?|vendors?|bills?)\b/i.test(raw);
  if (toSuppliers) {
    const rows = supplierRows(state);
    const [supplier] = named(state.purchases || [], raw);
    if (supplier) {
      const theirs = rows.filter((row) => key(row.name) === supplier.key);
      const total = theirs.reduce((sum, row) => sum + row.due, 0);
      return reply(theirs.length
        ? `You owe ${supplier.name} ${inr(total)}: ${detail(theirs)}. Nothing was recorded.`
        : `You owe ${supplier.name} nothing on bills in these books. Nothing was recorded.`);
    }
    return summary(rows, 'You owe suppliers nothing on bills in these books. Nothing was recorded.', 'You owe suppliers');
  }
  const [customer] = named(state.invoices || [], raw);
  if (!customer && !OWES_ME.test(raw) && !/\bcustomers?\b/i.test(raw)) return null;
  const rows = customerRows(state);
  if (customer) {
    const theirs = rows.filter((row) => key(row.name) === customer.key);
    const total = theirs.reduce((sum, row) => sum + row.due, 0);
    return reply(theirs.length
      ? `${customer.name} owes you ${inr(total)}: ${detail(theirs)}. Nothing was recorded.`
      : `${customer.name} owes you nothing. Nothing was recorded.`);
  }
  return summary(rows, 'No customer owes you anything in these books. Nothing was recorded.', 'Customers owe you');
}
