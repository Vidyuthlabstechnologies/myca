import { auditEventHash } from './ca-api.mjs';
import { CONFIRM_TOOLS } from './chat-confirm.mjs';
import { verifyChain } from './ledger.mjs';
import { periodRange } from './report-sheets.mjs';
import { localToday } from './dates.mjs';
import { QUICKO_OPERATIONS } from './sandbox-endpoints.mjs';

const IDENTIFIER = new Set(['string', 'number', 'bigint']);
const MAX_IDS = 20;
const MAX_REASON = 500;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 2000;
const SENTENCE_IDS = 20;
const SHEET_TRANSFERS = 300;
const CHANGE_ACTION = /^(?:chat\.confirm|recurring_posted|bank_rule_applied|exceptions\.|file\.|books_ledger\.|documents\.|client\.|user\.|external\.|sandbox\.)/;
const CHANGE_TOOLS = new Set(['lock_period', 'unlock_period', 'set_company', 'set_supplier_terms', 'save_report', 'delete_report', 'set_employee_bank', 'run_automation', 'run_recurring', 'request_documents', 'record_document_received', 'correct_eval']);
const ID_FIELDS = [['invoice', 'id'], ['bill', 'id'], ['expense', 'id'], ['creditNote', 'id'], ['debitNote', 'id'], ['purchaseNote', 'id'], ['note', 'id'], ['amendment', 'id'], ['report', 'name'], ['reminder', 'id'], ['rule', 'id'], ['line', 'id'], ['quote', 'id'], ['schedule', 'id'], ['employee', 'id'], ['settlement', 'id'], ['data', 'id']];
const CONFIRM_FAILURES = {
  NOTHING_PENDING: 'nothing was waiting',
  EXPIRED: 'the preview had expired',
  TOKEN_MISMATCH: 'the code did not match the preview',
  TOKEN_REQUIRED: 'no confirmation code was given',
};
const ACRONYMS = new Map([['ims', 'IMS'], ['tds', 'TDS'], ['gst', 'GST'], ['itc', 'ITC'], ['msme', 'MSME'], ['26as', '26AS'], ['gstr1', 'GSTR-1'], ['gstr2b', 'GSTR-2B'], ['gstr3b', 'GSTR-3B'], ['gstin', 'GSTIN'], ['hsn', 'HSN'], ['tcs', 'TCS']]);
const NOTE = 'Every change made through MyCA is listed with who made it and when. Hashes chain each event to the one before, so an edited or removed event shows as a broken chain. The seal covers who, what and when, but not which client an event is filed under. It cannot show events cut off the end of the log, or a log re-sealed by someone who can write the books.';
const HOSTED_NOTE = ' Reads are kept in the hosted audit log, not here.';
export const NOT_SEALED = 'the client an event is filed under is not sealed';

export const OUTSIDE_SENTENCES = Object.freeze({
  ...Object.fromEntries(QUICKO_OPERATIONS.map((endpoint) => [endpoint.id, endpoint.sentence])),
  gst_taxpayer_generate_otp: 'Ask the GST portal for a sign-in code',
  gst_taxpayer_verify_otp: 'Sign in to the GST portal with a code',
  gst_gstr2b_recon_submit: 'Start a GSTR-2B check at the GST portal',
  gst_return_status: 'Check the status of GST returns at the portal',
  gst_save_gstr1: 'Save GSTR-1 at the GST portal',
  gst_file_gstr1_evc: 'File GSTR-1 at the GST portal',
  gst_gstr1_processing: 'Check how the portal processed a GSTR-1 save',
  gst_save_gstr3b: 'Save GSTR-3B at the GST portal',
  gst_gstr3b_liability: 'Read the GSTR-3B liability from the GST portal',
  gst_gstr3b_offset: 'Pay GSTR-3B tax from the credit and cash ledgers',
  gst_file_gstr3b_evc: 'File GSTR-3B at the GST portal',
  gst_gstr1_proceed: 'Submit GSTR-1 at the GST portal (proceed to file)',
  gst_gstr1_summary: 'Read the GSTR-1 summary from the GST portal',
  gst_evc_otp: 'Ask the GST portal for an EVC OTP',
  einvoice_authenticate: 'Sign in to the e-invoice portal',
  einvoice_generate: 'Generate an e-invoice (IRN)',
  einvoice_cancel: 'Cancel an e-invoice (IRN)',
  gstin_verify: 'Look up a GSTIN',
  income_tax_calculate: 'Work out income tax',
  tds_analytics_job: 'Start a TDS check at the portal',
  tds_fvu_generate: 'Generate a TDS return file (FVU)',
  sandbox_status: 'Check the GST service connection',
  validate_gstin_lookup: 'Look up a GSTIN',
  nic_auth: 'Sign in to the e-invoice portal',
  nic_health: 'Check the e-invoice portal',
  nic_gstin_master: 'Look up a GSTIN at the e-invoice portal',
  nic_irn_generate: 'Generate an e-invoice (IRN)',
  nic_irn_get: 'Fetch an e-invoice by IRN',
  nic_irn_get_by_doc: 'Fetch an e-invoice by document number',
  nic_irn_cancel: 'Cancel an e-invoice (IRN)',
  nic_rejected_irns: 'Fetch rejected e-invoices',
  nic_ewb_generate: 'Generate an e-way bill',
  nic_ewb_get: 'Fetch an e-way bill',
  nic_ewb_cancel: 'Cancel an e-way bill',
  govt_probe: 'Check that the government portals can be reached',
  notification_send: 'Send a message',
  nim_ask: 'Ask the AI assistant',
  knowledge_answer: 'Answer from the firm notes',
  tax_answer: 'Answer a tax question from the tax modules',
  nim_status: 'Check the AI assistant connection',
  dsc_sign: 'Sign with a digital signature (DSC)',
  tally_push: 'Push to Tally',
  provider_doctor_ping: 'Check the connections',
  channel_fetch_report: 'Fetch a sales report from a channel',
  zoho_push_invoices: 'Send invoices to Zoho',
  plaid_link: 'Link a bank through Plaid',
  taxjar_rate: 'Look up a sales tax rate',
  gusto_token: 'Connect to Gusto',
  track1099_read: 'Read 1099 forms from Track1099',
  track1099_import: 'Import 1099 forms from Track1099',
});

export const AUDIT_SHEET_HEADER = ['Event', 'When (UTC)', 'Who', 'Action', 'What changed', 'Records', 'Transfers', 'Books digest before', 'Books digest after', 'Chained'];
export const AUDIT_SHEET_WIDTHS = [12, 26, 20, 26, 60, 28, 24, 40, 40, 10];

function ok(data) {
  return { ok: true, data };
}

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function human(name) {
  const spaced = String(name == null ? '' : name).replace(/[._]+/g, ' ').trim().replace(/\S+/g, (token) => ACRONYMS.get(token.toLowerCase()) || token);
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : '';
}

function tidy(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function placeOf(event, index) {
  return isRecord(event) && event.eventId ? String(event.eventId) : `entry ${index + 1}`;
}

export function verifyAuditChain(state) {
  const events = Array.isArray(state && state.auditEvents) ? state.auditEvents : [];
  let chained = 0;
  let unchained = 0;
  let expected = '';
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const at = placeOf(event, index);
    if (!isRecord(event) || !event.hash) {
      if (chained > 0) return { ok: false, error: 'LINK_BROKEN', at, chained, unchained };
      unchained += 1;
      continue;
    }
    if (event.hash !== auditEventHash(event)) return { ok: false, error: 'HASH_MISMATCH', at, chained, unchained };
    if ((event.prevHash || '') !== expected) return { ok: false, error: 'LINK_BROKEN', at, chained, unchained };
    expected = event.hash;
    chained += 1;
  }
  return { ok: true, chained, unchained, last: expected };
}

export function ledgerVerdict(state) {
  const verdict = state && state.ledger ? verifyChain(state.ledger) : { ok: true, last: 0 };
  if (verdict.ok) return { ok: true, last: verdict.last };
  return { ok: false, error: String(verdict.error || ''), ...(verdict.at != null ? { at: String(verdict.at) } : {}) };
}

export function auditDetails(name, result) {
  const source = isRecord(result) ? result : {};
  const ids = [];
  const add = (value) => {
    if (!IDENTIFIER.has(typeof value) || ids.length >= MAX_IDS) return;
    const text = String(value);
    if (text && !ids.includes(text)) ids.push(text);
  };
  for (const [key, field] of ID_FIELDS) add(isRecord(source[key]) ? source[key][field] : undefined);
  if (Array.isArray(source.posted)) {
    for (const item of source.posted) {
      if (ids.length >= MAX_IDS) break;
      add(isRecord(item) ? item.id : undefined);
    }
  }
  if (name === 'record_share' && source.ok !== false && source.recorded === true) add(source.invoiceId);
  const body = isRecord(source.data) ? source.data : source;
  const text = (value) => (typeof value === 'string' ? value.slice(0, MAX_REASON) : undefined);
  const extra = {};
  if (source.ok !== false && name === 'lock_period') {
    if (text(body.lockThrough) !== undefined) extra.lockThrough = text(body.lockThrough);
    if (text(body.reason) !== undefined) extra.reason = text(body.reason);
  } else if (source.ok !== false && name === 'unlock_period') {
    if (text(body.was) !== undefined) extra.was = text(body.was);
    if (text(body.reason) !== undefined) extra.reason = text(body.reason);
  }
  return { ids, ...extra };
}

function ranDirectly(name) {
  return CHANGE_TOOLS.has(name) && !CONFIRM_TOOLS.has(name);
}

function kindOf(event) {
  const action = String(event.action || '');
  if (event.beforeHash !== event.afterHash || CHANGE_ACTION.test(action)) return 'change';
  const meta = isRecord(event.metadata) ? event.metadata : {};
  if (action === 'chat.run' && (meta.posted === true || (Array.isArray(meta.tools) && meta.tools.some(ranDirectly)))) return 'change';
  if (action.startsWith('tool.')) {
    const name = action.slice(5);
    if (CONFIRM_TOOLS.has(name) || CHANGE_TOOLS.has(name)) return 'change';
    if (name === 'record_share' && idsOf(meta).length > 0) return 'change';
  }
  return action.startsWith('session.') ? 'session' : 'read';
}

function detailList(meta) {
  if (Array.isArray(meta.details)) return meta.details.filter(isRecord);
  return isRecord(meta.details) ? [meta.details] : [];
}

function idsOf(meta) {
  const ids = [];
  for (const detail of detailList(meta)) {
    for (const id of Array.isArray(detail.ids) ? detail.ids : []) {
      if (IDENTIFIER.has(typeof id) && !ids.includes(String(id))) ids.push(String(id));
    }
  }
  return ids;
}

function toolNames(value) {
  return (Array.isArray(value) ? value : []).map(human).filter(Boolean);
}

function withIds(text, ids) {
  return ids.length ? `${text} (${ids.slice(0, SENTENCE_IDS).join(', ')})` : text;
}

function bracket(parts) {
  const kept = parts.filter(Boolean);
  return kept.length ? ` (${kept.join(', ')})` : '';
}

function outsideSentence(id, meta) {
  const phrase = Object.hasOwn(OUTSIDE_SENTENCES, id) ? OUTSIDE_SENTENCES[id] : human(id);
  let sentence = phrase;
  if (meta.outcomeUnknown === true) sentence = `${phrase}: no answer came back, so it may not have gone through`;
  else if (meta.ok === false) sentence = `${phrase} did not go through`;
  return tidy(meta.mock === true ? `${sentence} (simulated)` : sentence);
}

function summarize(event, ids) {
  const action = String(event.action || '');
  const meta = isRecord(event.metadata) ? event.metadata : {};
  const field = (key) => (meta[key] == null || typeof meta[key] === 'object' ? '' : String(meta[key]));
  if (action === 'chat.confirm') {
    if (meta.posted === false) return `Confirmation failed: ${typeof meta.error === 'string' && Object.hasOwn(CONFIRM_FAILURES, meta.error) ? CONFIRM_FAILURES[meta.error] : 'not posted'}`;
    if (meta.replayed === true) return 'Confirmation sent again: nothing new was posted';
    return tidy(withIds(`Posted ${toolNames(meta.tools).join(', ')}`, ids));
  }
  if (action.startsWith('tool.')) {
    const name = action.slice(5);
    const detail = detailList(meta)[0] || {};
    if (meta.ok === false) return `${human(name)} did not go through`;
    if (name === 'lock_period' && typeof detail.lockThrough === 'string') {
      return tidy(`Locked the books through ${detail.lockThrough}${detail.reason ? `: ${detail.reason}` : ''}`);
    }
    if (name === 'unlock_period' && typeof detail.was === 'string') {
      return tidy(`Unlocked the books (${detail.was ? `was locked through ${detail.was}` : 'it was not locked'})${detail.reason ? `: ${detail.reason}` : ''}`);
    }
    return tidy(withIds(human(name), ids));
  }
  if (action === 'chat.propose' && field('tool')) return `Proposed ${human(field('tool'))}`;
  if (action === 'chat.run') return `Chat message (${toolNames(meta.tools).join(', ') || 'no tool'})`;
  if (action === 'recurring_posted') return tidy(`Repeating entry ${field('scheduleId')} posted ${field('documentId')}`);
  if (action === 'bank_rule_applied') return tidy(`Bank rule ${field('ruleId')} booked ${field('lineId')}`);
  if (action.startsWith('exceptions.')) return tidy(`Exception ${field('exceptionId')} ${action.slice('exceptions.'.length)}${field('note') ? `: ${field('note')}` : ''}`);
  if (action === 'file.upload') return tidy(`Uploaded ${field('name')}`);
  if (action === 'file.attach') return tidy(`Attached ${field('name')}`);
  if (action === 'session.login') return 'Signed in';
  if (action === 'session.logout') return 'Signed out';
  if (action === 'session.pin_changed') return 'Changed PIN';
  const outside = /^(?:external|sandbox)\.(.+)$/.exec(action);
  if (outside) return outsideSentence(outside[1], meta);
  if (action === 'chat.discard') return 'Discarded a proposal';
  if (action === 'user.create') return tidy(`Added a user${bracket([field('userId'), field('role')])}`);
  if (action === 'client.create') return tidy(`Added a client${bracket([field('clientId')])}`);
  if (action === 'documents.upload') return tidy(`Uploaded a document${bracket([field('documentId')])}`);
  if (action === 'books_ledger.create_invoice') return tidy(`Posted a sales invoice${bracket([field('voucherId')])}`);
  if (action === 'books_ledger.create_purchase') return tidy(`Posted a purchase bill${bracket([field('voucherId')])}`);
  return tidy(human(action));
}

function readMoment(text) {
  const moment = new Date(text);
  return Number.isNaN(moment.getTime()) ? null : moment;
}

function dayOf(at) {
  const text = String(at || '');
  const moment = readMoment(text);
  return moment ? localToday(moment) : text.slice(0, 10);
}

function whenWords(at) {
  const text = String(at || '');
  const moment = readMoment(text);
  if (!moment) return `${text.slice(0, 10)} ${text.slice(11, 16)}`;
  const two = (value) => String(value).padStart(2, '0');
  return `${localToday(moment)} ${two(moment.getHours())}:${two(moment.getMinutes())}`;
}

function clockValue(value) {
  if (value == null || typeof value === 'object') return null;
  const text = String(value);
  return /^\d+$/.test(text) ? BigInt(text) : null;
}

function stamp(row) {
  return row && typeof row.timestamp === 'bigint' ? row.timestamp : 0n;
}

function transfersOf(state, clock) {
  const rows = state && state.ledger && Array.isArray(state.ledger.transfers) ? state.ledger.transfers : [];
  const before = isRecord(clock) ? clockValue(clock.before) : null;
  const after = isRecord(clock) ? clockValue(clock.after) : null;
  if (before === null || after === null || after <= before || !rows.length) return [];
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (stamp(rows[middle]) <= before) low = middle + 1;
    else high = middle;
  }
  const ids = [];
  for (let index = low; index < rows.length && stamp(rows[index]) <= after; index += 1) ids.push(String(rows[index].id));
  return ids;
}

function shaped(state, event) {
  const meta = isRecord(event.metadata) ? event.metadata : {};
  const ids = idsOf(meta);
  return {
    eventId: String(event.eventId || ''),
    at: String(event.at || ''),
    actorId: String(event.actorId || ''),
    actorName: String(event.actorName || ''),
    action: String(event.action || ''),
    kind: kindOf(event),
    summary: summarize(event, ids),
    ids,
    transfers: transfersOf(state, meta.ledgerClock),
    beforeHash: String(event.beforeHash || ''),
    afterHash: String(event.afterHash || ''),
    chained: Boolean(event.hash),
  };
}

export function auditEventsIn(state, range, { view = 'changes', actor = '', limit = 0 } = {}) {
  const root = state.__root || state;
  const client = String(root.activeClientId || 'SELF');
  const needle = String(actor == null ? '' : actor).trim().toLowerCase();
  const kept = [];
  for (const event of Array.isArray(root.auditEvents) ? root.auditEvents : []) {
    if (!isRecord(event) || String(event.clientId || 'SELF') !== client) continue;
    const day = dayOf(event.at);
    if (day < range.from || day > range.to) continue;
    if (needle && !String(event.actorId || '').toLowerCase().includes(needle) && !String(event.actorName || '').toLowerCase().includes(needle)) continue;
    if (view !== 'all' && kindOf(event) !== 'change') continue;
    kept.push(event);
  }
  const chosen = limit > 0 && kept.length > limit ? kept.slice(kept.length - limit) : kept;
  return { events: chosen.map((event) => shaped(state, event)), total: kept.length };
}

function limitOf(value) {
  const count = Math.floor(Number(value));
  return count >= 1 ? Math.min(count, MAX_LIMIT) : DEFAULT_LIMIT;
}

export function auditTrail(state, args = {}) {
  const range = periodRange(args, localToday());
  if (!range.ok) return range;
  const root = state.__root || state;
  const view = args.view === 'all' ? 'all' : 'changes';
  const found = auditEventsIn(state, range, { view, actor: args.actor, limit: limitOf(args.limit) });
  return ok({
    from: range.from,
    to: range.to,
    label: range.label,
    view,
    events: found.events,
    count: found.events.length,
    total: found.total,
    more: found.total > found.events.length,
    chain: verifyAuditChain(root),
    ledger: ledgerVerdict(state),
    note: `${NOTE}${process.env.MYCA_HOSTED === '1' ? HOSTED_NOTE : ''}`,
  });
}

function plural(count, one, many) {
  return count === 1 ? one : many;
}

export function sealCaveats(chain) {
  const earlier = Number.isFinite(chain.unchained) ? chain.unchained : 0;
  const said = [];
  if (chain.chained > 0) said.push(NOT_SEALED);
  if (earlier > 0) said.push(`${earlier} earlier ${plural(earlier, 'event was', 'events were')} recorded before sealing and ${plural(earlier, 'is', 'are')} not covered`);
  return said.map((text) => `; ${text}`).join('');
}

export function auditTrailWords(data) {
  const events = Array.isArray(data.events) ? data.events : [];
  const count = Number.isFinite(data.count) ? data.count : events.length;
  const total = Math.max(Number.isFinite(data.total) ? data.total : count, count);
  const chain = data.chain || {};
  const head = data.view === 'all' ? `${count} ${plural(count, 'event', 'events')}` : `${count} ${plural(count, 'change', 'changes')} between ${data.from} and ${data.to}`;
  const verdict = chain.ok === false ? `LOG CHAIN BROKEN at ${chain.at}` : `log chain verified (${chain.chained || 0} ${plural(chain.chained, 'event', 'events')}${sealCaveats(chain)})`;
  const lines = [`${head}, ${verdict}`];
  const shown = events.slice().reverse().slice(0, 10);
  for (const event of shown) lines.push(`· ${whenWords(event.at)} ${event.actorName || event.actorId}: ${event.summary}`);
  if (total > shown.length) lines.push(`… and ${total - shown.length} more`);
  return lines.join('\n');
}

function listCell(items) {
  if (items.length <= SHEET_TRANSFERS) return items.join('; ');
  return `${items.slice(0, SHEET_TRANSFERS).join('; ')}; … and ${items.length - SHEET_TRANSFERS} more`;
}

export function auditSheetRows(events) {
  return events.map((event) => [
    event.eventId,
    event.at,
    event.actorName || event.actorId,
    event.action,
    event.summary,
    event.ids.join('; '),
    listCell(event.transfers),
    event.beforeHash,
    event.afterHash,
    event.chained ? 'Yes' : 'No',
  ]);
}
