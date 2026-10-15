import { localToday, postingDate } from './dates.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { salaryPrivate } from './employees.mjs';

const MAX_ITEMS = 20;
const MAX_EVENTS = 500;
const MAX_HITS = 25;
const PRIVATE_TOOL = /payroll|salary|employee|payslip|withholding/i;
const PRIVATE_INPUT = '(a payroll or salary message; kept out of the log)';

export function isPrivateTool(name) {
  return PRIVATE_TOOL.test(String(name || ''));
}
const DOCUMENT_KINDS = ['bank statement', 'sales register', 'purchase register', 'gstr-2b', 'tds challans', 'payroll register', 'fixed asset list', 'loan statements', 'cash book', 'stock statement', 'form 26as', 'ais', 'other'];

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function actorOf(state, args) {
  return String(state?.__actor?.userId || args.actorId || '');
}

function clientOf(state, raw) {
  const id = String(raw || '').trim().toUpperCase();
  if (!id) return null;
  if (id === 'SELF') return { clientId: 'SELF', name: state.company?.name || 'This business' };
  const found = (state.clients || []).find((client) => String(client.clientId || client.id || '').toUpperCase() === id);
  return found ? { clientId: id, name: found.name || id } : null;
}

function nextDocumentRequestId(state) {
  state.documentRequestSeq = Number(state.documentRequestSeq || 0) + 1;
  return `DRQ-${String(state.documentRequestSeq).padStart(4, '0')}`;
}

function periodWords(period) {
  const [y, m] = period.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[m - 1]} ${y}`;
}

export function planDocumentRequest(state, args = {}) {
  const client = clientOf(state, args.clientId);
  if (!client) return fail('CLIENT_NOT_FOUND', { clientId: args.clientId });
  const period = String(args.period || '').trim();
  if (period && !isReturnPeriod(period)) return fail('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const items = (Array.isArray(args.items) ? args.items : String(args.items || '').split(',')).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  if (!items.length) return fail('ITEMS_REQUIRED', { hint: DOCUMENT_KINDS.join(', ') });
  if (items.length > MAX_ITEMS) return fail('TOO_MANY_ITEMS', { max: MAX_ITEMS });
  const dueOn = args.dueOn ? postingDate(args.dueOn) : '';
  if (args.dueOn && !dueOn) return fail('INVALID_DATE', { dueOn: args.dueOn });
  const note = String(args.note || '').trim().slice(0, 500);
  const firm = state.company?.name || 'your accountant';
  const lines = items.map((item) => `• ${item}`);
  const message = [
    `Dear ${client.name},`,
    '',
    `To complete your work${period ? ` for ${periodWords(period)}` : ''}, please send the following${dueOn ? ` by ${dueOn}` : ''}:`,
    ...lines,
    ...(note ? ['', note] : []),
    '',
    `Thank you,`,
    firm,
  ].join('\n');
  return { ok: true, plan: { client, period, items, dueOn, note, message } };
}

export function requestDocuments(state, args = {}) {
  const planned = planDocumentRequest(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const request = {
    id: nextDocumentRequestId(state),
    clientId: plan.client.clientId,
    clientName: plan.client.name,
    period: plan.period,
    requestedOn: localToday(),
    requestedBy: actorOf(state, args),
    dueOn: plan.dueOn,
    note: plan.note,
    items: plan.items.map((kind) => ({ kind, status: 'requested', receivedOn: '' })),
    message: plan.message,
    status: 'open',
  };
  state.documentRequests = Array.isArray(state.documentRequests) ? state.documentRequests : [];
  state.documentRequests.push(request);
  return { ok: true, request };
}

function findRequest(state, id) {
  return (state.documentRequests || []).find((item) => item.id === String(id || '').trim().toUpperCase()) || null;
}

export function recordDocumentReceived(state, args = {}) {
  const request = findRequest(state, args.id);
  if (!request) return fail('REQUEST_NOT_FOUND', { id: args.id });
  const wanted = String(args.item || '').trim().toLowerCase();
  const on = args.on ? postingDate(args.on) : localToday();
  if (!on) return fail('INVALID_DATE', { on: args.on });
  const targets = wanted ? request.items.filter((item) => item.kind === wanted) : request.items;
  if (!targets.length) return fail('ITEM_NOT_IN_REQUEST', { item: wanted, items: request.items.map((item) => item.kind) });
  for (const item of targets) {
    if (item.status !== 'received') {
      item.status = 'received';
      item.receivedOn = on;
      item.documentSha256 = String(args.documentSha256 || '') || undefined;
    }
  }
  const outstanding = request.items.filter((item) => item.status !== 'received');
  request.status = outstanding.length ? 'open' : 'complete';
  if (!outstanding.length) request.completedOn = on;
  return { ok: true, request, outstanding: outstanding.map((item) => item.kind) };
}

export function documentRequests(state, { clientId, status = 'open' } = {}) {
  const today = localToday();
  const wantedClient = clientId ? String(clientId).trim().toUpperCase() : '';
  const rows = (state.documentRequests || [])
    .filter((request) => !wantedClient || request.clientId === wantedClient)
    .filter((request) => (status === 'all' ? true : status === 'complete' ? request.status === 'complete' : request.status !== 'complete'))
    .map((request) => ({
      ...request,
      outstanding: request.items.filter((item) => item.status !== 'received').map((item) => item.kind),
      overdue: request.status !== 'complete' && Boolean(request.dueOn) && request.dueOn < today,
    }))
    .sort((a, b) => (a.dueOn || '9999').localeCompare(b.dueOn || '9999') || a.id.localeCompare(b.id));
  return {
    ok: true,
    data: {
      today,
      requests: rows,
      open: rows.filter((row) => row.status !== 'complete').length,
      overdue: rows.filter((row) => row.overdue).length,
      kinds: DOCUMENT_KINDS,
    },
  };
}

function nextEvalId(state) {
  state.evalEventSeq = Number(state.evalEventSeq || 0) + 1;
  return `EVL-${String(state.evalEventSeq).padStart(5, '0')}`;
}

export function logEvalEvent(state, { input, toolName = '', outcome = '', viaModel = false, blocked = false, reply = '' } = {}) {
  const raw = String(input || '').trim().slice(0, 300);
  if (!raw) return null;
  const privateTool = isPrivateTool(toolName) || PRIVATE_TOOL.test(raw);
  const text = privateTool ? PRIVATE_INPUT : raw;
  if (privateTool) reply = '';
  state.evalEvents = Array.isArray(state.evalEvents) ? state.evalEvents : [];
  const event = {
    id: nextEvalId(state),
    on: new Date().toISOString(),
    input: text,
    toolName: String(toolName || ''),
    outcome: String(outcome || ''),
    viaModel: Boolean(viaModel),
    blocked: Boolean(blocked),
    reply: String(reply || '').slice(0, 300),
    correction: null,
  };
  state.evalEvents.push(event);
  if (state.evalEvents.length > MAX_EVENTS) state.evalEvents.splice(0, state.evalEvents.length - MAX_EVENTS);
  return event;
}

export function correctEval(state, args = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner or an admin reviews the assistant log.' });
  const event = (state.evalEvents || []).find((item) => item.id === String(args.id || '').trim().toUpperCase());
  if (!event) return fail('EVENT_NOT_FOUND', { id: args.id });
  const note = String(args.note || '').trim().slice(0, 500);
  const correctTool = String(args.correctTool || '').trim();
  if (!note && !correctTool) return fail('CORRECTION_REQUIRED');
  event.correction = { by: actorOf(state, args), on: localToday(), note, correctTool, wasRight: Boolean(args.wasRight) };
  return { ok: true, event };
}

export function evalEvents(state, { status = 'all', limit = 50 } = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner or an admin reviews the assistant log.' });
  const rows = (state.evalEvents || [])
    .filter((event) => (status === 'corrected' ? Boolean(event.correction) : status === 'uncorrected' ? !event.correction : status === 'failed' ? event.blocked || event.outcome === 'failed' : true))
    .slice(-Math.max(1, Math.min(200, Number(limit) || 50)))
    .reverse();
  const all = state.evalEvents || [];
  return {
    ok: true,
    data: {
      events: rows,
      total: all.length,
      viaModel: all.filter((event) => event.viaModel).length,
      blocked: all.filter((event) => event.blocked).length,
      corrected: all.filter((event) => event.correction).length,
    },
  };
}

function excerpt(text, query) {
  const haystack = String(text || '');
  const at = haystack.toLowerCase().indexOf(query);
  if (at < 0) return haystack.slice(0, 120);
  const start = Math.max(0, at - 50);
  return `${start > 0 ? '…' : ''}${haystack.slice(start, Math.min(haystack.length, at + query.length + 70))}${at + query.length + 70 < haystack.length ? '…' : ''}`;
}

export function searchFirmNotes(state, { query } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return fail('QUERY_TOO_SHORT');
  const hits = [];
  const push = (kind, id, title, text, on) => {
    const blob = `${title}\n${text}`;
    if (blob.toLowerCase().includes(q)) hits.push({ kind, id, title: String(title || '').slice(0, 120), excerpt: excerpt(text, q), on: on || '' });
  };
  for (const request of state.caRequests || []) push('ca-request', request.id, request.title, [...(request.facts || []), ...(request.messages || []).map((m) => m.text)].join('\n'), request.askedOn);
  for (const reminder of state.reminders || []) push('reminder', reminder.id, reminder.text, reminder.text, reminder.due);
  for (const request of state.documentRequests || []) push('document-request', request.id, `${request.clientName}: ${request.items.map((item) => item.kind).join(', ')}`, `${request.note}\n${request.message}`, request.requestedOn);
  for (const reminder of state.supplierReminders || []) push('supplier-reminder', reminder.id, `${reminder.supplier} ${reminder.period}`, reminder.message || '', reminder.date);
  for (const doc of state.documents || []) push('document', doc.id || doc.sha256 || '', doc.name || doc.kind || '', `${doc.name || ''} ${doc.kind || ''} ${doc.note || ''}`, doc.uploadedOn || doc.createdOn || '');
  if (!salaryPrivate(state)) for (const event of state.evalEvents || []) if (event.correction) push('correction', event.id, event.input, `${event.correction.note} ${event.correction.correctTool}`, event.correction.on);
  hits.sort((a, b) => String(b.on).localeCompare(String(a.on)));
  return { ok: true, data: { query: q, hits: hits.slice(0, MAX_HITS), total: hits.length } };
}

export const FIRM_DOCUMENT_KINDS = DOCUMENT_KINDS;
