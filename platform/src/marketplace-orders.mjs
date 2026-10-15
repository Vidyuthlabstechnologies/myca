import { createInvoice } from './invoice.mjs';
import { createCreditNote, outstandingOf } from './credit-notes.mjs';
import { createAccounts, createTransfers, paise, TRANSFER_FLAGS } from './ledger.mjs';
import { gstin as gstinRules } from './sprint-load.mjs';
import { isoDate, postingDate, localToday } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { CHANNELS } from './settlements.mjs';
import { recordOrderStockMoves } from './sku-margins.mjs';
import { registrationByState, principalOf } from './registrations.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
export const MARKETPLACE_ACCOUNTS = [
  { id: 1150, code: '1150', name: 'TDS receivable (194-O)', type: 'asset', flags: 0 },
  { id: 1210, code: '1210', name: 'GST TCS receivable', type: 'asset', flags: 0 },
  { id: 5210, code: '5210', name: 'Marketplace fees', type: 'expense', flags: 0 },
];
const ORDER_CAP = 5000;

const ALIASES = {
  orderId: ['order id', 'order-id', 'order_id', 'order item id', 'order no', 'order number', 'amazon-order-id', 'merchant-order-id'],
  date: ['shipment date', 'order date', 'invoice date', 'dispatch date', 'date', 'transaction date', 'shipped date'],
  type: ['transaction type', 'transaction-type', 'event type', 'type', 'event sub type', 'order status'],
  state: ['ship to state', 'ship-to-state', "customer's delivery state", 'customer delivery state', 'delivery state', 'buyer state', 'state', 'ship to state code', 'place of supply', 'pos'],
  sku: ['sku', 'seller sku', 'fsn', 'seller-sku', 'msku'],
  qty: ['quantity', 'qty', 'item quantity', 'quantity-purchased'],
  taxable: ['tax exclusive gross', 'taxable value', 'taxable amount', 'item value', 'principal', 'net amount', 'sale value'],
  tax: ['total tax amount', 'tax amount', 'gst amount', 'gst', 'tax'],
  total: ['invoice amount', 'total invoice value', 'total amount', 'gross amount', 'final invoice amount', 'order item value'],
  gstRate: ['tax rate', 'gst rate', 'igst rate', 'rate', 'tax %', 'gst %'],
  hsn: ['hsn', 'hsn code', 'hsn/sac', 'hsn_code'],
  description: ['item description', 'product name', 'title', 'description', 'product'],
  shipFrom: ['ship from state', 'ship-from state', 'fulfillment center state', 'fulfilment centre state', 'fc state', 'seller state', 'warehouse state', 'dispatch state', 'ship from', 'ship-from-state', 'seller warehouse state'],
};

function split(text) {
  return String(text).replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const out = [];
    let cur = '';
    let q = false;
    const sep = line.includes('\t') && !line.includes(',') ? '\t' : ',';
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

function money(cell) {
  const raw = String(cell == null ? '' : cell).replace(/[₹,\s%]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (raw === '' || raw === '-') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function columnsOf(header) {
  const lower = header.map((h) => String(h || '').trim().toLowerCase().replace(/^﻿/, ''));
  const idx = {};
  for (const [canon, names] of Object.entries(ALIASES)) {
    const i = lower.findIndex((h) => names.includes(h));
    if (i >= 0) idx[canon] = i;
  }
  return idx;
}

const STATE_BY_NAME = (() => {
  const out = {};
  for (const [code, name] of Object.entries(gstinRules.STATE_CODES || {})) out[String(name).toLowerCase().replace(/[^a-z]/g, '')] = code;
  out.jammukashmir = out.jammuandkashmir || out.jammukashmir;
  out.andamannicobar = out.andamanandnicobarislands || out.andamannicobar;
  out.dadranagarhavelidamandiu = out.dadraandnagarhaveliandamananddiu || out.dadranagarhavelidamandiu;
  out.orissa = out.odisha;
  out.pondicherry = out.puducherry;
  out.bengaluru = out.karnataka;
  out.newdelhi = out.delhi;
  out.telengana = out.telangana;
  return out;
})();

export function stateCodeFromName(value) {
  const raw = String(value == null ? '' : value).trim();
  if (/^\d{1,2}$/.test(raw)) {
    const code = raw.padStart(2, '0');
    return gstinRules.STATE_CODES?.[code] ? code : '';
  }
  const m = /^(\d{2})\s*[-–]/.exec(raw);
  if (m && gstinRules.STATE_CODES?.[m[1]]) return m[1];
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return '';
  if (STATE_BY_NAME[key]) return STATE_BY_NAME[key];
  const hit = Object.keys(STATE_BY_NAME).find((name) => name.startsWith(key) || key.startsWith(name));
  return hit ? STATE_BY_NAME[hit] : '';
}

function inferChannel(header, hint) {
  const wanted = String(hint || '').trim().toLowerCase();
  if (CHANNELS.includes(wanted)) return wanted;
  const lower = header.map((h) => String(h || '').trim().toLowerCase());
  if (lower.includes('ship to state') || lower.includes('tax exclusive gross') || lower.includes('amazon-order-id')) return 'amazon';
  if (lower.includes('fsn') || lower.includes("customer's delivery state") || lower.includes('order item id')) return 'flipkart';
  return 'marketplace';
}

function isReturn(type, taxable) {
  if (/refund|return|cancel|rto|reversal/i.test(String(type || ''))) return true;
  return taxable != null && taxable < 0;
}

export function parseOrdersCsv(text, { channel } = {}) {
  const rows = split(text);
  if (!rows.length) return { ok: false, error: 'EMPTY' };
  const header = rows[0];
  const idx = columnsOf(header);
  if (idx.orderId == null || idx.date == null || idx.state == null || (idx.taxable == null && idx.total == null) || idx.gstRate == null) {
    return { ok: false, error: 'NO_HEADER', header, need: 'order id, date, delivery state, GST rate and a taxable value or invoice amount per row' };
  }
  const sales = [];
  const returns = [];
  const held = [];
  for (const [n, cells] of rows.slice(1).entries()) {
    const rowNo = n + 2;
    if (cells.every((c) => !String(c || '').trim())) continue;
    const orderId = String(cells[idx.orderId] || '').trim();
    const date = isoDate(cells[idx.date]) || '';
    const state = stateCodeFromName(cells[idx.state]);
    const gstRate = money(cells[idx.gstRate]);
    let taxable = idx.taxable == null ? null : money(cells[idx.taxable]);
    const total = idx.total == null ? null : money(cells[idx.total]);
    const tax = idx.tax == null ? null : money(cells[idx.tax]);
    if (taxable == null && total != null && gstRate != null) taxable = round2(total / (1 + gstRate / 100));
    if (!orderId) { held.push({ row: rowNo, reason: 'ORDER_ID_REQUIRED' }); continue; }
    if (!date) { held.push({ row: rowNo, reason: 'INVALID_DATE', orderId }); continue; }
    if (!state) { held.push({ row: rowNo, reason: 'STATE_UNKNOWN', orderId, value: String(cells[idx.state] || '').trim() }); continue; }
    if (gstRate == null || gstRate < 0 || gstRate > 28) { held.push({ row: rowNo, reason: 'RATE_REQUIRED', orderId }); continue; }
    if (taxable == null) { held.push({ row: rowNo, reason: 'BAD_AMOUNT', orderId }); continue; }
    if (taxable === 0) continue;
    const qty = idx.qty == null ? 1 : Math.abs(Number(cells[idx.qty]) || 1);
    const sku = idx.sku == null ? '' : String(cells[idx.sku] || '').trim();
    const hsn = idx.hsn == null ? '' : String(cells[idx.hsn] || '').trim();
    const description = idx.description == null ? '' : String(cells[idx.description] || '').trim();
    const shipFrom = idx.shipFrom == null ? '' : stateCodeFromName(cells[idx.shipFrom]);
    const line = { row: rowNo, orderId, date, state, shipFrom, gstRate, taxable: Math.abs(taxable), tax: tax == null ? null : Math.abs(tax), qty, sku, hsn, description };
    if (isReturn(idx.type == null ? '' : cells[idx.type], taxable)) returns.push(line);
    else sales.push(line);
  }
  if (!sales.length && !returns.length) return { ok: false, error: 'NO_ROWS', held };
  return { ok: true, channel: inferChannel(header, channel), sales, returns, held };
}

function channelName(channel) {
  return channel === 'marketplace' ? 'Marketplace' : channel[0].toUpperCase() + channel.slice(1);
}

function knownOrders(state) {
  const seen = new Map();
  for (const inv of state.invoices || []) {
    if (inv.source !== 'marketplace') continue;
    for (const order of inv.orders || []) seen.set(`${inv.channel}:${order.orderId}`, inv);
  }
  return seen;
}

function returnedOrders(state) {
  const seen = new Set();
  for (const note of state.creditNotes || []) if (note.marketplaceOrderId) seen.add(`${note.channel}:${note.marketplaceOrderId}`);
  return seen;
}

export function planOrderImport(state, args = {}) {
  const parsed = parseOrdersCsv(args.csv || '', { channel: args.channel });
  if (!parsed.ok) return { ok: false, error: parsed.error, parsed };
  const company = state.company || {};
  const channel = parsed.channel;
  const known = knownOrders(state);
  const alreadyReturned = returnedOrders(state);
  const skipped = parsed.held.map((row) => ({ id: `row ${row.row}`, reason: row.reason, orderId: row.orderId || row.value || '' }));
  const days = new Map();
  let orderCount = 0;
  const seenInFile = new Set();
  for (const line of parsed.sales) {
    const key = `${channel}:${line.orderId}`;
    if (known.has(key)) { skipped.push({ id: line.orderId, reason: 'exists' }); continue; }
    if (orderCount >= ORDER_CAP) { skipped.push({ id: line.orderId, reason: 'TOO_MANY_ROWS' }); continue; }
    if (isPeriodLocked(state, line.date)) { skipped.push({ id: line.orderId, reason: 'PERIOD_LOCKED' }); continue; }
    if (!seenInFile.has(key)) { seenInFile.add(key); orderCount += 1; }
    const registration = (line.shipFrom && registrationByState(state, line.shipFrom)) || principalOf(state);
    const dayKey = `${line.date}|${line.state}|${registration.gstin}`;
    const day = days.get(dayKey) || { date: line.date, state: line.state, registration, lines: new Map(), orders: [], fileTax: 0, hasFileTax: false };
    const rateLine = day.lines.get(line.gstRate) || { description: `${channelName(channel)} orders at ${line.gstRate}% GST`, hsn: line.hsn, gstRate: line.gstRate, taxable: 0, qty: 0 };
    rateLine.taxable = round2(rateLine.taxable + line.taxable);
    rateLine.qty += line.qty;
    if (!rateLine.hsn && line.hsn) rateLine.hsn = line.hsn;
    day.lines.set(line.gstRate, rateLine);
    day.orders.push({ orderId: line.orderId, sku: line.sku, qty: line.qty, taxable: line.taxable, gstRate: line.gstRate });
    if (line.tax != null) { day.fileTax = round2(day.fileTax + line.tax); day.hasFileTax = true; }
    days.set(dayKey, day);
  }
  const ready = [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.state.localeCompare(b.state)).map((day) => {
    const lines = [...day.lines.values()].sort((a, b) => a.gstRate - b.gstRate).map((line) => ({ description: line.description, hsn: line.hsn, qty: 1, rate: line.taxable, gstRate: line.gstRate }));
    const taxable = round2(lines.reduce((sum, line) => sum + line.rate, 0));
    return {
      date: day.date,
      state: day.state,
      orders: day.orders,
      registration: day.registration.gstin,
      input: { partyName: `${channelName(channel)} customers`, partyGstin: '', partyState: day.state, date: day.date, lines, ...(day.registration.kind === 'principal' ? {} : { registrationGstin: day.registration.gstin }) },
      taxable,
      fileTax: day.hasFileTax ? day.fileTax : null,
    };
  });
  const returns = [];
  for (const line of parsed.returns) {
    const key = `${channel}:${line.orderId}`;
    if (alreadyReturned.has(key)) { skipped.push({ id: line.orderId, reason: 'return_exists' }); continue; }
    const invoice = known.get(key);
    const inFile = !invoice && seenInFile.has(key);
    if (!invoice && !inFile) { skipped.push({ id: line.orderId, reason: 'ORDER_NOT_FOUND' }); continue; }
    if (isPeriodLocked(state, line.date)) { skipped.push({ id: line.orderId, reason: 'PERIOD_LOCKED' }); continue; }
    const tax = line.tax != null ? line.tax : round2(line.taxable * line.gstRate / 100);
    returns.push({ orderId: line.orderId, date: line.date, amount: round2(line.taxable + tax), taxable: line.taxable, gstRate: line.gstRate, hsn: line.hsn, invoiceId: invoice ? invoice.id : '', fromThisFile: inFile });
  }
  return {
    ok: true,
    channel,
    parsed: { rows: parsed.sales.length + parsed.returns.length, orders: orderCount, days: ready.length, returns: returns.length, held: parsed.held.length, company: company.state },
    ready,
    returns,
    skipped,
  };
}

export function importMarketplaceOrders(state, args = {}) {
  const planned = planOrderImport(state, args);
  if (!planned.ok) return planned;
  const created = [];
  const credited = [];
  const skipped = [...planned.skipped];
  const byOrder = new Map();
  for (const item of planned.ready) {
    const result = createInvoice(state, item.input);
    if (!result.ok) { skipped.push({ id: `${item.date} ${item.state}`, reason: result.error }); continue; }
    result.invoice.source = 'marketplace';
    result.invoice.channel = planned.channel;
    result.invoice.orders = item.orders;
    recordOrderStockMoves(state, { channel: planned.channel, invoiceId: result.invoice.id, date: item.date, orders: item.orders, direction: 'out' });
    created.push({ id: result.invoice.id, date: item.date, state: item.state, orders: item.orders.length, taxable: result.invoice.taxable, total: result.invoice.total });
    for (const order of item.orders) byOrder.set(order.orderId, result.invoice);
  }
  for (const ret of planned.returns) {
    const invoice = ret.invoiceId ? (state.invoices || []).find((inv) => inv.id === ret.invoiceId) : byOrder.get(ret.orderId);
    if (!invoice) { skipped.push({ id: ret.orderId, reason: 'ORDER_NOT_FOUND' }); continue; }
    const room = round2(outstandingOf(state, invoice));
    if (room <= 0) { skipped.push({ id: ret.orderId, reason: 'FULLY_CREDITED' }); continue; }
    const note = createCreditNote(state, { invoiceId: invoice.id, date: ret.date < invoice.date ? invoice.date : ret.date, reason: `Return of ${planned.channel} order ${ret.orderId}`, lines: [{ description: `Return of order ${ret.orderId}`, hsn: ret.hsn, qty: 1, rate: ret.taxable, gstRate: ret.gstRate }] });
    if (!note.ok) { skipped.push({ id: ret.orderId, reason: note.error }); continue; }
    note.creditNote.marketplaceOrderId = ret.orderId;
    note.creditNote.channel = planned.channel;
    const returned = (invoice.orders || []).find((order) => order.orderId === ret.orderId);
    if (returned) recordOrderStockMoves(state, { channel: planned.channel, invoiceId: note.creditNote.id, date: note.creditNote.date, orders: [{ ...returned, qty: 1 }], direction: 'in' });
    credited.push({ id: note.creditNote.id, invoiceId: invoice.id, orderId: ret.orderId, total: note.creditNote.total });
  }
  return { ok: true, channel: planned.channel, parsed: planned.parsed, created, credited, skipped };
}

export function ensureMarketplaceAccounts(ledger) {
  createAccounts(ledger, MARKETPLACE_ACCOUNTS);
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 0) + 1;
  return state.transferSeq;
}

export function settlementInvoices(state, settlement) {
  const wanted = new Set((settlement.lines || []).filter((line) => line.orderId).map((line) => line.orderId));
  const hits = [];
  for (const inv of state.invoices || []) {
    if (inv.source !== 'marketplace' || inv.channel !== settlement.channel || inv.status === 'cancelled') continue;
    if ((inv.orders || []).some((order) => wanted.has(order.orderId))) hits.push(inv);
  }
  return hits.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function postSettlement(state, settlement) {
  const invoices = settlementInvoices(state, settlement);
  if (!invoices.length) return { ok: true, posted: false, reason: 'NO_ORDERS_IN_BOOKS' };
  const party = (state.parties || []).find((p) => p.accountId === invoices[0].partyAccountId || p.name === invoices[0].partyName);
  if (!party) return { ok: false, error: 'PARTY_NOT_FOUND' };
  const date = postingDate(settlement.to) || localToday();
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  const t = settlement.totals;
  const paid = settlement.paid == null ? 0 : round2(settlement.paid);
  const fees = round2(-(t.fee || 0) - (t.penalty || 0) - (t.adjustment < 0 ? t.adjustment : 0));
  const reimbursement = round2((t.reimbursement || 0) + (t.adjustment > 0 ? t.adjustment : 0));
  const tds = round2(-(t.tds || 0));
  const tcs = round2(-(t.tcs || 0));
  const settled = round2(paid + fees + tds + tcs - reimbursement);
  const open = round2(invoices.reduce((sum, inv) => sum + Math.max(0, outstandingOf(state, inv)), 0));
  if (settled <= 0) return { ok: true, posted: false, reason: 'NOTHING_TO_SETTLE' };
  if (settled > open + 0.01) return { ok: false, error: 'EXCEEDS_RECEIVABLE', settled, open };
  ensureMarketplaceAccounts(state.ledger);
  const linked = TRANSFER_FLAGS.LINKED;
  const seqBefore = state.transferSeq;
  const bundle = [];
  const add = (debitAccountId, creditAccountId, amount, code) => {
    if (amount > 0) bundle.push({ id: nextTransferId(state), debitAccountId, creditAccountId, amount: paise(amount), flags: linked, invoiceId: settlement.id, code, userData: date });
  };
  add(1002, party.accountId, paid, 'SETTLEMENT');
  add(5210, party.accountId, fees, 'MARKETPLACE_FEES');
  add(1150, party.accountId, tds, 'TDS_194O');
  add(1210, party.accountId, tcs, 'GST_TCS');
  add(party.accountId, 5210, reimbursement, 'REIMBURSEMENT');
  if (!bundle.length) return { ok: true, posted: false, reason: 'NOTHING_TO_SETTLE' };
  const posted = createTransfers(state.ledger, bundle);
  if (posted.some((result) => !result.ok)) {
    state.transferSeq = seqBefore;
    return { ok: false, error: 'LEDGER_REJECT', posted };
  }
  let left = settled;
  const receipts = [];
  for (const inv of invoices) {
    if (left <= 0.005) break;
    const due = round2(outstandingOf(state, inv));
    if (due <= 0.005) continue;
    const amount = round2(Math.min(due, left));
    inv.receipts = inv.receipts || [];
    inv.receipts.push({ amount, date, mode: 'settlement', settlementId: settlement.id });
    const received = inv.receipts.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    inv.status = received + (inv.total - due - (inv.receipts.slice(0, -1).reduce((sum, r) => sum + Number(r.amount || 0), 0))) >= inv.total - 0.01 ? 'paid' : 'partial';
    inv.status = round2(outstandingOf(state, inv)) <= 0.005 ? 'paid' : 'partial';
    receipts.push({ invoiceId: inv.id, amount });
    left = round2(left - amount);
  }
  settlement.posting = { date, paid, fees, reimbursement, tds, tcs, settled, receipts, transferIds: posted.map((result) => result.id), leftOpen: round2(open - settled) };
  return { ok: true, posted: true, posting: settlement.posting };
}

export function orderImportWords(result, money) {
  const name = channelName(result.channel);
  const reasons = {};
  for (const row of result.skipped) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  const words = { exists: 'already in the books', return_exists: 'returns already recorded', ORDER_NOT_FOUND: 'returns for orders not in the books', STATE_UNKNOWN: 'rows with a delivery state I cannot place', RATE_REQUIRED: 'rows with no GST rate', INVALID_DATE: 'rows with a date I cannot read', BAD_AMOUNT: 'rows with an amount I cannot read', PERIOD_LOCKED: 'in a locked period', ORDER_ID_REQUIRED: 'rows with no order id', FULLY_CREDITED: 'returns against orders already credited', TOO_MANY_ROWS: 'rows beyond the 5,000 an import takes' };
  const held = Object.entries(reasons).map(([reason, count]) => `${count} ${words[reason] || reason}`);
  const total = result.created.reduce((sum, inv) => sum + inv.total, 0);
  const orders = result.created.reduce((sum, inv) => sum + inv.orders, 0);
  const lines = [`${name}: ${orders === 1 ? '1 order' : `${orders} orders`} posted as ${result.created.length === 1 ? '1 invoice' : `${result.created.length} invoices`} (one per day and delivery state) totalling ${money(total)}${result.credited.length ? `; ${result.credited.length === 1 ? '1 return' : `${result.credited.length} returns`} as credit notes totalling ${money(result.credited.reduce((sum, note) => sum + note.total, 0))}` : ''}.`];
  if (held.length) lines.push(`Held back: ${held.join('; ')}.`);
  lines.push('They land in GSTR-1 under B2CS by state and rate. The next settlement from this channel settles them.');
  return lines.join('\n');
}
