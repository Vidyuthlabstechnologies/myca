import { localToday } from './dates.mjs';
import { daysBetween } from './reminders.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { isTdsReceipt } from './tds-credits.mjs';
import { invoiceTemplateOf, bankWords } from './invoice-template.mjs';
import { addReminder } from './reminders.mjs';

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const MAX_MESSAGE = 2000;
const POSSIBLY_PAID_DAYS = 14;
const DEFAULT_TERMS_DAYS = 30;
const HISTORY_DAYS = 365;
const FOLLOW_UP_DAYS = 7;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function rupees(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function longDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function key(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function gstinKey(value) {
  return String(value || '').trim().toUpperCase();
}

function partyKeyOf(invoice) {
  return invoice.partyAccountId != null && invoice.partyAccountId !== '' ? `account:${invoice.partyAccountId}` : `name:${key(invoice.partyName)}`;
}

function belongsTo(customer) {
  if (customer && typeof customer === 'object') return (inv) => partyKeyOf(inv) === customer.partyKey;
  return (inv) => key(inv.partyName) === key(customer);
}

function dueOf(invoice) {
  return invoice.dueDate || addDays(invoice.date, DEFAULT_TERMS_DAYS);
}

function paymentsOf(invoice) {
  return (invoice.receipts || []).filter((receipt) => !isTdsReceipt(receipt));
}

function lastReceiptDate(invoice) {
  return paymentsOf(invoice).map((r) => r.date).filter(Boolean).sort().at(-1) || '';
}

function nextId(state) {
  state.collectionReminderSeq = Number(state.collectionReminderSeq || 0) + 1;
  return `CRM-${String(state.collectionReminderSeq).padStart(4, '0')}`;
}

export function payingScore(state, customer, today = localToday()) {
  const since = addDays(today, -HISTORY_DAYS);
  const ofCustomer = belongsTo(customer);
  const paid = (state.invoices || []).filter((inv) => ofCustomer(inv) && inv.status !== 'cancelled' && outstandingOf(state, inv) <= 0.005 && lastReceiptDate(inv) >= since);
  if (paid.length < 3) return { score: 'new', paid: paid.length, onTime: 0, late: 0 };
  let onTime = 0;
  for (const inv of paid) if (lastReceiptDate(inv) <= dueOf(inv)) onTime += 1;
  const late = paid.length - onTime;
  const score = onTime / paid.length >= 0.75 ? 'good' : late / paid.length > 0.5 ? 'repeat-late' : 'usual';
  return { score, paid: paid.length, onTime, late };
}

const TONE = { good: 'gentle', new: 'neutral', usual: 'neutral', 'repeat-late': 'firm' };
const SCORE_WORDS = { good: 'usually pays on time', new: 'has not paid enough invoices yet to judge', usual: 'is sometimes late', 'repeat-late': 'is late more often than not' };

export function remindersSentTo(state, customer) {
  if (customer && typeof customer === 'object') {
    return (state.collectionReminders || []).filter((item) => (item.partyKey ? item.partyKey === customer.partyKey : key(item.customer) === key(customer.customer) && (!item.gstin || !customer.gstin || gstinKey(item.gstin) === gstinKey(customer.gstin))));
  }
  return (state.collectionReminders || []).filter((item) => key(item.customer) === key(customer));
}

function possiblyPaidSince(state, customer, today) {
  const since = addDays(today, -POSSIBLY_PAID_DAYS);
  const ofCustomer = belongsTo(customer);
  return (state.invoices || []).some((inv) => ofCustomer(inv) && paymentsOf(inv).some((r) => r.date && r.date >= since));
}

function messageFor(state, customer, rows, total, tone, today) {
  const company = state.company?.name || 'us';
  const bank = bankWords(invoiceTemplateOf(state).bank);
  const lines = rows.map((row) => `• ${row.id} dated ${longDate(row.date)}, ${rupees(row.outstanding)} (${row.daysLate === 1 ? '1 day' : `${row.daysLate} days`} past ${longDate(row.dueDate)})`);
  const opening = tone === 'gentle'
    ? `This is ${company}. A gentle reminder in case it slipped by: ${rows.length === 1 ? 'this invoice is' : 'these invoices are'} still open with us.`
    : tone === 'firm'
      ? `This is ${company}. ${rows.length === 1 ? 'This invoice is' : 'These invoices are'} overdue and still unpaid:`
      : `This is ${company}. ${rows.length === 1 ? 'This invoice is' : 'These invoices are'} past due:`;
  const ask = tone === 'firm'
    ? `Please pay ${rupees(total)} by ${longDate(addDays(today, 3))}, or tell us the date you will pay.`
    : `Please pay ${rupees(total)} at your convenience, or let us know if anything on ${rows.length === 1 ? 'it' : 'them'} needs correcting.`;
  return [
    `Hello ${customer},`,
    '',
    opening,
    ...lines,
    '',
    ask,
    ...(bank ? [`Pay to: ${bank}.`] : []),
    'Thank you.',
  ].join('\n');
}

export function collectionDrafts(state, { customer = '', today: asOf } = {}) {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(asOf || '')) ? asOf : localToday();
  const wanted = key(customer);
  const byCustomer = new Map();
  for (const inv of state.invoices || []) {
    if (inv.status === 'cancelled' || inv.country === 'US') continue;
    if (wanted && key(inv.partyName) !== wanted && gstinKey(inv.partyGstin) !== gstinKey(customer)) continue;
    const outstanding = outstandingOf(state, inv);
    if (outstanding <= 0.005) continue;
    const dueDate = dueOf(inv);
    const daysLate = daysBetween(dueDate, today);
    if (daysLate < 1) continue;
    const k = partyKeyOf(inv);
    const bucket = byCustomer.get(k) || { customer: inv.partyName, gstin: inv.partyGstin || '', partyKey: k, rows: [] };
    bucket.rows.push({ id: inv.id, date: inv.date, dueDate, daysLate, outstanding });
    byCustomer.set(k, bucket);
  }
  const customers = [];
  const possiblyPaid = [];
  for (const bucket of byCustomer.values()) {
    bucket.rows.sort((a, b) => a.date.localeCompare(b.date));
    const total = Math.round(bucket.rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100;
    if (possiblyPaidSince(state, bucket, today)) {
      possiblyPaid.push({ customer: bucket.customer, total, invoices: bucket.rows.map((r) => r.id) });
      continue;
    }
    const history = payingScore(state, bucket, today);
    const tone = TONE[history.score];
    const sent = remindersSentTo(state, bucket);
    customers.push({
      customer: bucket.customer,
      gstin: bucket.gstin,
      partyKey: bucket.partyKey,
      score: history.score,
      scoreWords: SCORE_WORDS[history.score],
      paidInYear: history.paid,
      tone,
      invoices: bucket.rows,
      total,
      oldestDaysLate: Math.max(...bucket.rows.map((r) => r.daysLate)),
      message: messageFor(state, bucket.customer, bucket.rows, total, tone, today),
      lastSent: sent.length ? sent[sent.length - 1].date : '',
      timesSent: sent.length,
    });
  }
  customers.sort((a, b) => b.total - a.total);
  if (wanted && !customers.length) {
    const held = possiblyPaid[0];
    if (held) return { ok: false, error: 'POSSIBLY_PAID', customer: held.customer, total: held.total };
    const known = (state.invoices || []).some((inv) => key(inv.partyName) === wanted || gstinKey(inv.partyGstin) === gstinKey(customer));
    return { ok: false, error: known ? 'NOTHING_OVERDUE' : 'CUSTOMER_NOT_FOUND', customer };
  }
  return { ok: true, data: { asOf: today, customers, possiblyPaid, total: Math.round(customers.reduce((s, c) => s + c.total, 0) * 100) / 100, channel: 'whatsapp' } };
}

export function planCollectionReminder(state, args = {}) {
  const customer = String(args.customer || '').trim();
  if (!customer) return { ok: false, error: 'CUSTOMER_REQUIRED' };
  const drafts = collectionDrafts(state, { customer, today: args.today });
  if (!drafts.ok) return drafts;
  if (drafts.data.customers.length > 1) return { ok: false, error: 'CUSTOMER_AMBIGUOUS', customer, gstins: drafts.data.customers.map((row) => row.gstin), hint: 'More than one customer has this name; give the GSTIN of the one to remind.' };
  const draft = drafts.data.customers[0];
  const message = String(args.message ?? draft.message).trim();
  if (!message) return { ok: false, error: 'EMPTY_MESSAGE' };
  if (message.length > MAX_MESSAGE) return { ok: false, error: 'MESSAGE_TOO_LONG', max: MAX_MESSAGE };
  const channel = ['whatsapp', 'email', 'other'].includes(args.channel) ? args.channel : 'whatsapp';
  return { ok: true, draft, message, channel, edited: message !== draft.message, today: drafts.data.asOf };
}

export function recordCollectionReminder(state, args = {}) {
  const plan = planCollectionReminder(state, args);
  if (!plan.ok) return plan;
  const reminder = {
    id: nextId(state),
    date: plan.today,
    customer: plan.draft.customer,
    gstin: plan.draft.gstin,
    partyKey: plan.draft.partyKey,
    invoiceIds: plan.draft.invoices.map((row) => row.id),
    total: plan.draft.total,
    tone: plan.draft.tone,
    channel: plan.channel,
    message: plan.message,
    edited: plan.edited,
    sentBy: String(state?.__actor?.userId || args.actorId || '').slice(0, 80),
  };
  state.collectionReminders = state.collectionReminders || [];
  state.collectionReminders.push(reminder);
  const followUp = addReminder(state, { text: `Check whether ${reminder.customer} paid ${rupees(reminder.total)} after the reminder of ${longDate(reminder.date)}`, due: addDays(plan.today, FOLLOW_UP_DAYS), today: plan.today, source: 'collections' });
  return { ok: true, reminder, message: plan.message, followUp: followUp.ok ? followUp.reminder?.id || '' : '' };
}

export function collectionsInWords(data) {
  if (!data.customers.length) {
    return data.possiblyPaid.length
      ? `Nobody needs a reminder right now. ${data.possiblyPaid.map((p) => `${p.customer} paid something in the last two weeks, so ${rupees(p.total)} may already be on its way`).join('; ')}.`
      : 'Nobody is overdue. Nothing to chase.';
  }
  const lines = data.customers.map((c) => `· ${c.customer}: ${rupees(c.total)} across ${c.invoices.length === 1 ? '1 invoice' : `${c.invoices.length} invoices`}, oldest ${c.oldestDaysLate} days late; ${c.scoreWords}, so the draft is ${c.tone}${c.timesSent ? `; reminded ${c.timesSent === 1 ? 'once' : `${c.timesSent} times`}, last on ${longDate(c.lastSent)}` : ''}.`);
  const held = data.possiblyPaid.length ? `\nLeft out because they paid something in the last two weeks: ${data.possiblyPaid.map((p) => `${p.customer} (${rupees(p.total)})`).join(', ')}.` : '';
  return `${rupees(data.total)} is overdue from ${data.customers.length === 1 ? '1 customer' : `${data.customers.length} customers`} as of ${longDate(data.asOf)}:\n${lines.join('\n')}${held}\n\nSay "send reminder to ${data.customers[0].customer}" to see the message and record that you sent it from your phone.`;
}
