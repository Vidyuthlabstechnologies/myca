import { localToday } from './dates.mjs';
import { periodSummary } from './period-summary.mjs';
import { outstandingOf } from './credit-notes.mjs';

const KINDS = new Set(['invoice', 'bill', 'expense', 'exception', 'period', 'other']);
const MAX_NOTE = 1000;

function money(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function actorOf(state, args) {
  return {
    userId: String(state?.__actor?.userId || args.actorId || ''),
    role: String(state?.__actor?.role || args.role || ''),
  };
}

function nextId(state) {
  state.caRequestSeq = Number(state.caRequestSeq || 0);
  const taken = new Set((state.caRequests || []).map((item) => item.id));
  let id;
  do {
    state.caRequestSeq += 1;
    id = `ASK-${String(state.caRequestSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

export function contextFor(state, subject = {}) {
  const kind = String(subject.kind || 'other');
  if (!KINDS.has(kind)) return { error: 'UNKNOWN_SUBJECT' };
  const id = String(subject.id || '').trim().toUpperCase();
  if (kind === 'invoice') {
    const inv = (state.invoices || []).find((item) => item.id === id);
    if (!inv) return { error: 'SUBJECT_NOT_FOUND', id };
    return {
      title: `Invoice ${inv.id} to ${inv.partyName}`,
      facts: [
        `Dated ${inv.date}${inv.partyGstin ? `, buyer GSTIN ${inv.partyGstin}` : ''}`,
        `Taxable ${money(inv.taxable)}, CGST ${money(inv.cgst)}, SGST ${money(inv.sgst)}, IGST ${money(inv.igst)}, total ${money(inv.total)}`,
        `Status ${inv.status}; still due ${money(outstandingOf(state, inv))}${inv.dueDate ? `; due date ${inv.dueDate}` : ''}`,
        ...inv.lines.map((line) => `Line: ${line.description || 'item'}${line.hsn ? `, HSN ${line.hsn}` : ''}, GST ${line.gstRate}%, ${money(line.amount)}`),
      ],
      ref: { kind, id: inv.id },
    };
  }
  if (kind === 'bill') {
    const bill = (state.purchases || []).find((item) => item.id === id);
    if (!bill) return { error: 'SUBJECT_NOT_FOUND', id };
    return {
      title: `Bill ${bill.supplierInvoiceNo || bill.id} from ${bill.partyName}`,
      facts: [
        `Dated ${bill.date}${bill.partyGstin ? `, supplier GSTIN ${bill.partyGstin}` : ''}`,
        `Taxable ${money(bill.taxable)}, CGST ${money(bill.cgst)}, SGST ${money(bill.sgst)}, IGST ${money(bill.igst)}, total ${money(bill.total)}`,
      ],
      ref: { kind, id: bill.id },
    };
  }
  if (kind === 'expense') {
    const expense = (state.expenses || []).find((item) => item.id === id);
    if (!expense) return { error: 'SUBJECT_NOT_FOUND', id };
    return {
      title: `Expense ${expense.id}: ${expense.description || expense.headName}`,
      facts: [
        `Dated ${expense.date}, under ${expense.headName}, paid from ${expense.mode}`,
        `${money(expense.amount)}${expense.gstRate ? `, GST ${expense.gstRate}% inside${expense.inputCredit ? ', input credit taken' : ', no input credit taken'}` : ''}`,
      ],
      ref: { kind, id: expense.id },
    };
  }
  if (kind === 'exception') {
    const item = (state.exceptions || []).find((entry) => entry.id === id);
    if (!item) return { error: 'SUBJECT_NOT_FOUND', id };
    return {
      title: item.title,
      facts: [
        item.why ? `Why: ${item.why}` : '',
        item.moneyAtRisk ? `Money at risk ${money(item.moneyAtRisk)}` : '',
        item.source ? `Raised by ${item.source}${item.ruleId ? ` (${item.ruleId})` : ''}` : '',
      ].filter(Boolean),
      ref: { kind, id: item.id },
    };
  }
  if (kind === 'period') {
    const summary = periodSummary(state, subject.period);
    if (!summary.ok) return { error: 'SUBJECT_NOT_FOUND', id: subject.period };
    const d = summary.data;
    return {
      title: `GST for ${d.period}`,
      facts: [
        `${d.salesCount} sales, taxable ${money(d.taxableSales)}; tax on sales ${money(d.outputTax.total)} (IGST ${money(d.outputTax.igst)}, CGST ${money(d.outputTax.cgst)}, SGST ${money(d.outputTax.sgst)})`,
        `${d.purchaseCount} bills; input credit ${money(d.inputCredit.total)}`,
        ...(d.gstr1.held || []).map((held) => `Held out of GSTR-1: ${held.inum} (${held.code})`),
      ],
      ref: { kind, period: d.period },
    };
  }
  return { title: '', facts: [], ref: { kind: 'other' } };
}

export function planAsk(state, args = {}) {
  const note = String(args.note || '').trim();
  if (!note) return { ok: false, error: 'NOTE_REQUIRED' };
  if (note.length > MAX_NOTE) return { ok: false, error: 'NOTE_TOO_LONG' };
  const context = contextFor(state, args.subject || {});
  if (context.error) return { ok: false, ...context };
  const title = String(args.title || '').trim().slice(0, 160) || context.title || note.slice(0, 80);
  return { ok: true, plan: { title, note, context } };
}

export function askCa(state, args = {}) {
  const planned = planAsk(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const actor = actorOf(state, args);
  const request = {
    id: nextId(state),
    title: plan.title,
    subject: plan.context.ref,
    facts: plan.context.facts,
    status: 'open',
    askedBy: actor.userId,
    askedOn: localToday(),
    messages: [{ by: actor.userId, role: actor.role, on: localToday(), text: plan.note }],
  };
  state.caRequests = state.caRequests || [];
  state.caRequests.push(request);
  return { ok: true, request };
}

function findRequest(state, id) {
  return (state.caRequests || []).find((item) => item.id === String(id || '').trim().toUpperCase()) || null;
}

export function planReply(state, args = {}) {
  const request = findRequest(state, args.id);
  if (!request) return { ok: false, error: 'REQUEST_NOT_FOUND', id: args.id };
  if (request.status === 'closed') return { ok: false, error: 'REQUEST_CLOSED', id: request.id };
  const text = String(args.text || '').trim();
  if (!text) return { ok: false, error: 'TEXT_REQUIRED' };
  if (text.length > MAX_NOTE) return { ok: false, error: 'TEXT_TOO_LONG' };
  return { ok: true, request, text };
}

export function replyCa(state, args = {}) {
  const planned = planReply(state, args);
  if (!planned.ok) return planned;
  const actor = actorOf(state, args);
  const { request } = planned;
  request.messages.push({ by: actor.userId, role: actor.role, on: localToday(), text: planned.text });
  request.status = actor.userId && actor.userId !== request.askedBy ? 'answered' : 'open';
  return { ok: true, request };
}

export function closeCa(state, args = {}) {
  const request = findRequest(state, args.id);
  if (!request) return { ok: false, error: 'REQUEST_NOT_FOUND', id: args.id };
  if (request.status === 'closed') return { ok: false, error: 'REQUEST_CLOSED', id: request.id };
  const actor = actorOf(state, args);
  if (actor.role && actor.role !== 'admin' && actor.userId !== request.askedBy) return { ok: false, error: 'NOT_YOURS_TO_CLOSE' };
  request.status = 'closed';
  request.closedOn = localToday();
  request.closedBy = actor.userId;
  return { ok: true, request };
}

export function listCaRequests(state, { status = 'open' } = {}) {
  const rows = (state.caRequests || [])
    .filter((item) => (status === 'all' ? true : status === 'closed' ? item.status === 'closed' : item.status !== 'closed'))
    .map((item) => ({ ...item, lastOn: item.messages.at(-1)?.on || item.askedOn, waitingOnCa: item.status === 'open', text: requestAsText(item, state.company?.name || '') }))
    .sort((a, b) => b.lastOn.localeCompare(a.lastOn) || b.id.localeCompare(a.id));
  return { ok: true, data: { requests: rows, waitingOnCa: rows.filter((r) => r.waitingOnCa).length, answered: rows.filter((r) => r.status === 'answered').length } };
}

export function requestAsText(request, companyName = '') {
  return [
    `${companyName ? `${companyName}: ` : ''}${request.title}`,
    ...request.facts.map((fact) => `- ${fact}`),
    '',
    ...request.messages.map((message) => `${message.on}: ${message.text}`),
  ].join('\n');
}

