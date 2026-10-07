import { creditAtRisk } from './gstr2b-check.mjs';
import { localToday } from './dates.mjs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ASK = {
  NOT_IN_2B: 'not in our GSTR-2B yet',
  ITC_NOT_AVAILABLE: 'shown in our GSTR-2B with the credit marked not available',
  AMOUNT_DIFFERS: 'shown in our GSTR-2B with a different amount',
  TAX_TYPE_DIFFERS: 'shown in our GSTR-2B with a different tax type (IGST instead of CGST and SGST, or the other way)',
  DATE_DIFFERS: 'shown in our GSTR-2B with a different date',
};
const MAX_MESSAGE = 2000;

function rupees(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function longDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function monthName(period) {
  const [y, m] = period.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function sameSupplier(risk, supplier) {
  const want = String(supplier || '').trim().toUpperCase();
  return (risk.gstin && risk.gstin.toUpperCase() === want) || String(risk.supplier || '').trim().toUpperCase() === want;
}

function nextId(state) {
  state.supplierReminderSeq = Number(state.supplierReminderSeq || 0) + 1;
  return `SRM-${String(state.supplierReminderSeq).padStart(4, '0')}`;
}

export function remindersSentTo(state, gstin, period) {
  return (state.supplierReminders || []).filter((item) => item.gstin === gstin && item.period === period);
}

export function draftSupplierReminder(state, { supplier, period } = {}) {
  const check = creditAtRisk(state, { period });
  if (!check.ok) return check;
  const { data } = check;
  if (!data.statement) return { ok: false, error: 'NO_STATEMENT', period: data.period };
  const mine = data.risks.filter((risk) => sameSupplier(risk, supplier));
  if (!mine.length) return { ok: false, error: 'NOTHING_TO_ASK', supplier, period: data.period };
  const askable = mine.filter((risk) => ASK[risk.reason]);
  const ownGaps = mine.filter((risk) => !ASK[risk.reason]);
  if (!askable.length) return { ok: false, error: 'OWN_GAPS_ONLY', supplier: mine[0].supplier, billIds: ownGaps.map((risk) => risk.billId) };
  const bills = askable.map((risk) => {
    const bill = (state.purchases || []).find((item) => item.id === risk.billId) || {};
    return { billId: risk.billId, supplierInvoiceNo: risk.supplierInvoiceNo, date: risk.date, total: Number(bill.total || 0), reason: risk.reason };
  });
  const name = mine[0].supplier;
  const gstin = mine[0].gstin;
  const company = state.company?.name || 'us';
  const lines = bills.map((bill) => `• Bill ${bill.supplierInvoiceNo} dated ${longDate(bill.date)}, ${rupees(bill.total)}: ${ASK[bill.reason]}`);
  const message = [
    `Hello ${name},`,
    '',
    `This is ${company}${state.company?.gstin ? ` (GSTIN ${state.company.gstin})` : ''}. For ${monthName(data.period)}, ${bills.length === 1 ? 'this bill from you is' : 'these bills from you are'} not showing correctly for us:`,
    ...lines,
    '',
    'Please report or correct them in your GSTR-1 so that we can take the input credit. Thank you.',
  ].join('\n');
  const sent = remindersSentTo(state, gstin, data.period);
  return {
    ok: true,
    data: {
      supplier: name,
      gstin,
      period: data.period,
      bills,
      credit: Math.round(askable.reduce((sum, risk) => sum + risk.credit, 0) * 100) / 100,
      leftOut: ownGaps.map((risk) => risk.billId),
      message,
      lastSent: sent.length ? sent[sent.length - 1].date : '',
      timesSent: sent.length,
    },
  };
}

export function planSupplierReminder(state, args = {}) {
  const draft = draftSupplierReminder(state, args);
  if (!draft.ok) return draft;
  const message = String(args.message ?? draft.data.message).trim();
  if (!message) return { ok: false, error: 'EMPTY_MESSAGE' };
  if (message.length > MAX_MESSAGE) return { ok: false, error: 'MESSAGE_TOO_LONG', max: MAX_MESSAGE };
  const channel = ['whatsapp', 'email', 'other'].includes(args.channel) ? args.channel : 'other';
  return { ok: true, draft: draft.data, message, channel, edited: message !== draft.data.message };
}

export function recordSupplierReminder(state, args = {}) {
  const plan = planSupplierReminder(state, args);
  if (!plan.ok) return plan;
  const reminder = {
    id: nextId(state),
    date: localToday(),
    supplier: plan.draft.supplier,
    gstin: plan.draft.gstin,
    period: plan.draft.period,
    billIds: plan.draft.bills.map((bill) => bill.billId),
    credit: plan.draft.credit,
    channel: plan.channel,
    message: plan.message,
    edited: plan.edited,
    sentBy: String(state?.__actor?.userId || args.actorId || '').slice(0, 80),
  };
  state.supplierReminders = state.supplierReminders || [];
  state.supplierReminders.push(reminder);
  return { ok: true, reminder, message: plan.message };
}
