import { localToday, postingDate } from './dates.mjs';

const MAX_TEXT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function daysBetween(fromIso, toIso) {
  return dayNumber(toIso) - dayNumber(fromIso);
}

function nextReminderId(state) {
  state.reminderSeq = Number(state.reminderSeq || 0);
  const taken = new Set((state.reminders || []).map((item) => item.id));
  let id;
  do {
    state.reminderSeq += 1;
    id = `REM-${String(state.reminderSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

function aboutOf(state, args) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  if (invoiceId) {
    const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
    if (!invoice) return { error: 'INVOICE_NOT_FOUND', invoiceId };
    return { about: { kind: 'invoice', id: invoice.id, name: invoice.partyName } };
  }
  const billId = String(args.billId || '').trim().toUpperCase();
  if (billId) {
    const bill = (state.purchases || []).find((item) => item.id === billId);
    if (!bill) return { error: 'BILL_NOT_FOUND', billId };
    return { about: { kind: 'bill', id: bill.id, name: bill.partyName } };
  }
  const party = String(args.party || '').trim();
  if (party) return { about: { kind: 'party', name: party.slice(0, 80) } };
  return { about: null };
}

export function planReminder(state, args = {}) {
  const text = String(args.text || '').trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, error: 'TEXT_REQUIRED' };
  if (text.length > MAX_TEXT) return { ok: false, error: 'TEXT_TOO_LONG' };
  const due = postingDate(args.due);
  if (!due) return { ok: false, error: 'INVALID_DATE', due: args.due };
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(args.today || '')) ? args.today : localToday();
  if (due < today) return { ok: false, error: 'DATE_PASSED', due, today };
  const about = aboutOf(state, args);
  if (about.error) return { ok: false, ...about };
  return { ok: true, plan: { text, due, about: about.about, inDays: daysBetween(today, due) } };
}

function actorId(state, args) {
  return String(state?.__actor?.userId || args.actorId || '');
}

export function addReminder(state, args = {}) {
  const planned = planReminder(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const reminder = {
    id: nextReminderId(state),
    text: plan.text,
    due: plan.due,
    ...(plan.about ? { about: plan.about } : {}),
    createdOn: localToday(),
    createdBy: actorId(state, args),
    done: null,
  };
  state.reminders = state.reminders || [];
  state.reminders.push(reminder);
  return { ok: true, reminder };
}

export function findReminder(state, id) {
  return (state.reminders || []).find((item) => item.id === String(id || '').trim().toUpperCase()) || null;
}

export function completeReminder(state, args = {}) {
  const reminder = findReminder(state, args.id);
  if (!reminder) return { ok: false, error: 'REMINDER_NOT_FOUND', id: args.id };
  if (reminder.done) return { ok: false, error: 'ALREADY_DONE', id: reminder.id };
  reminder.done = { on: localToday(), by: actorId(state, args) };
  return { ok: true, reminder };
}

export function listReminders(state, { status = 'open' } = {}) {
  const today = localToday();
  const rows = (state.reminders || [])
    .filter((item) => (status === 'all' ? true : status === 'done' ? item.done : !item.done))
    .map((item) => {
      const inDays = daysBetween(today, item.due);
      return { ...item, inDays, state: item.done ? 'done' : inDays < 0 ? 'overdue' : inDays === 0 ? 'today' : 'later' };
    })
    .sort((a, b) => a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
  return {
    ok: true,
    data: {
      today,
      reminders: rows,
      due: rows.filter((item) => item.state === 'overdue' || item.state === 'today').length,
    },
  };
}

export function whenWords(inDays, due) {
  if (inDays === 0) return 'today';
  if (inDays === 1) return 'tomorrow';
  if (inDays < 0) return `${-inDays} ${inDays === -1 ? 'day' : 'days'} ago (${due})`;
  return `on ${due}, in ${inDays} days`;
}
