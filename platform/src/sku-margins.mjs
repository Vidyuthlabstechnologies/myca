import { isoDate, localToday, postingDate } from './dates.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { uqcOf } from './gstr1-tables.mjs';
import { batchKey, costingMethod, costLedger, costOfMovesBy, expiryDate, knownBatch, stockWarnings, batchesOf } from './inventory-costing.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const MAX_SKU = 64;
const MAX_ROWS = 5000;

const COST_ALIASES = {
  sku: ['sku', 'seller sku', 'fsn', 'seller-sku', 'msku', 'item code', 'product code'],
  name: ['name', 'product name', 'title', 'description', 'item', 'product'],
  hsn: ['hsn', 'hsn code', 'hsn/sac'],
  cost: ['cost', 'unit cost', 'cost price', 'landed cost', 'purchase price', 'cogs', 'cost per unit'],
  unit: ['unit', 'uqc', 'uom'],
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
  const raw = String(cell == null ? '' : cell).replace(/[₹,\s]/g, '');
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function skuKey(value) {
  return String(value == null ? '' : value).trim().toUpperCase().slice(0, MAX_SKU);
}

function skus(state) {
  return state.skus && typeof state.skus === 'object' ? state.skus : {};
}

export function unitCode(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return { ok: true, unit: '' };
  const code = uqcOf(text);
  if (code === 'OTH' && text.toUpperCase() !== 'OTH') return { ok: false, error: 'BAD_UNIT', unit: text, hint: 'Use a GST unit (UQC) such as NOS, PCS, KGS, GMS, LTR, MLT, MTR, BOX, PAC, BTL, DOZ or SET, or a word like kg, litre or piece.' };
  return { ok: true, unit: code };
}

function level(value, before) {
  if (value === undefined) return { ok: true, value: before ?? null };
  if (value === null || value === '') return { ok: true, value: null };
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? { ok: true, value: Math.round(n * 1000) / 1000 } : { ok: false };
}

export function planSkuCost(state, args = {}) {
  const sku = skuKey(args.sku);
  if (!sku) return { ok: false, error: 'SKU_REQUIRED' };
  const cost = args.cost == null || args.cost === '' ? null : round2(args.cost);
  if (cost != null && !(Number.isFinite(cost) && cost >= 0)) return { ok: false, error: 'BAD_AMOUNT' };
  const before = skus(state)[sku] || null;
  const name = args.name != null ? String(args.name).trim().slice(0, 120) : before?.name || '';
  const hsn = args.hsn != null ? String(args.hsn).trim().slice(0, 8) : before?.hsn || '';
  const gstRate = args.gstRate == null || args.gstRate === '' ? before?.gstRate ?? null : Number(args.gstRate);
  if (gstRate != null && !(Number.isFinite(gstRate) && gstRate >= 0 && gstRate <= 28)) return { ok: false, error: 'BAD_RATE' };
  const barcode = args.barcode != null ? String(args.barcode).replace(/\s/g, '').slice(0, 32) : before?.barcode || '';
  if (barcode && !/^[0-9A-Za-z-]{4,32}$/.test(barcode)) return { ok: false, error: 'BAD_BARCODE' };
  const price = args.price == null || args.price === '' ? before?.price ?? null : round2(args.price);
  if (price != null && !(Number.isFinite(price) && price >= 0)) return { ok: false, error: 'BAD_AMOUNT' };
  if (barcode && Object.entries(skus(state)).some(([other, item]) => other !== sku && item?.barcode === barcode)) return { ok: false, error: 'BARCODE_IN_USE', barcode };
  const unit = args.unit == null ? { ok: true, unit: before?.unit || '' } : unitCode(args.unit);
  if (!unit.ok) return unit;
  const reorderLevel = level(args.reorderLevel, before?.reorderLevel);
  const reorderQty = level(args.reorderQty, before?.reorderQty);
  if (!reorderLevel.ok || !reorderQty.ok) return { ok: false, error: 'BAD_QTY', hint: 'A reorder level or quantity is zero or more.' };
  if (cost == null && !name && !hsn && args.gstRate == null && args.barcode == null && args.price == null && args.unit == null && args.reorderLevel === undefined && args.reorderQty === undefined) return { ok: false, error: 'NOTHING_TO_CHANGE' };
  const on = args.on ? postingDate(args.on) : localToday();
  if (args.on && !on) return { ok: false, error: 'INVALID_DATE', on: args.on };
  const kept = before && typeof before === 'object' ? Object.fromEntries(Object.entries(before).filter(([key]) => !['name', 'hsn', 'gstRate', 'cost', 'costOn', 'barcode', 'price', 'unit', 'reorderLevel', 'reorderQty'].includes(key))) : {};
  return { ok: true, plan: { sku, next: { ...kept, name, hsn, gstRate, cost: cost == null ? before?.cost ?? null : cost, costOn: cost == null ? before?.costOn || '' : on, ...(barcode ? { barcode } : {}), ...(price == null ? {} : { price }), ...(unit.unit ? { unit: unit.unit } : {}), ...(reorderLevel.value == null ? {} : { reorderLevel: reorderLevel.value }), ...(reorderQty.value == null ? {} : { reorderQty: reorderQty.value }) }, before } };
}

export function setSkuCost(state, args = {}) {
  const planned = planSkuCost(state, args);
  if (!planned.ok) return planned;
  state.skus = skus(state);
  state.skus[planned.plan.sku] = planned.plan.next;
  return { ok: true, sku: planned.plan.sku, ...planned.plan.next, before: planned.plan.before };
}

export function parseSkuCostsCsv(text) {
  const rows = split(text);
  if (!rows.length) return { ok: false, error: 'EMPTY' };
  const lower = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const idx = {};
  for (const [canon, names] of Object.entries(COST_ALIASES)) {
    const i = lower.findIndex((h) => names.includes(h));
    if (i >= 0) idx[canon] = i;
  }
  if (idx.sku == null || idx.cost == null) return { ok: false, error: 'NO_HEADER', header: rows[0], need: 'sku and cost columns' };
  const lines = [];
  const held = [];
  for (const [n, cells] of rows.slice(1).entries()) {
    if (cells.every((c) => !String(c || '').trim())) continue;
    const sku = skuKey(cells[idx.sku]);
    const cost = money(cells[idx.cost]);
    if (!sku) { held.push({ row: n + 2, reason: 'SKU_REQUIRED' }); continue; }
    if (cost == null || cost < 0) { held.push({ row: n + 2, reason: 'BAD_AMOUNT', sku }); continue; }
    if (lines.length >= MAX_ROWS) { held.push({ row: n + 2, reason: 'TOO_MANY_ROWS', sku }); continue; }
    const unit = idx.unit == null ? { ok: true, unit: '' } : unitCode(cells[idx.unit]);
    if (!unit.ok) { held.push({ row: n + 2, reason: 'BAD_UNIT', sku }); continue; }
    lines.push({ sku, cost: round2(cost), name: idx.name == null ? '' : String(cells[idx.name] || '').trim().slice(0, 120), hsn: idx.hsn == null ? '' : String(cells[idx.hsn] || '').trim().slice(0, 8), ...(unit.unit ? { unit: unit.unit } : {}) });
  }
  if (!lines.length) return { ok: false, error: 'NO_ROWS', held };
  return { ok: true, lines, held };
}

export function importSkuCosts(state, args = {}) {
  const parsed = parseSkuCostsCsv(args.csv || '');
  if (!parsed.ok) return parsed;
  state.skus = skus(state);
  const on = localToday();
  let updated = 0;
  for (const line of parsed.lines) {
    const before = state.skus[line.sku] || {};
    state.skus[line.sku] = { ...before, name: line.name || before.name || '', hsn: line.hsn || before.hsn || '', cost: line.cost, costOn: on, ...(line.unit ? { unit: line.unit } : {}) };
    updated += 1;
  }
  return { ok: true, updated, held: parsed.held };
}

export function planStock(state, args = {}) {
  const sku = skuKey(args.sku);
  if (!sku) return { ok: false, error: 'SKU_REQUIRED' };
  const qty = Number(args.qty);
  if (!Number.isFinite(qty) || qty === 0) return { ok: false, error: 'BAD_QTY', hint: 'A positive quantity adds stock; a negative one removes it.' };
  const date = postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  const location = String(args.location || 'own').trim().toLowerCase().slice(0, 40) || 'own';
  const toLocation = String(args.toLocation || '').trim().toLowerCase().slice(0, 40);
  if (toLocation && (qty <= 0 || toLocation === location)) return { ok: false, error: 'BAD_MOVE', hint: 'Moving stock between locations takes a positive quantity and two different locations.' };
  const unitCost = args.unitCost == null || args.unitCost === '' ? null : Number(args.unitCost);
  if (unitCost != null && !(Number.isFinite(unitCost) && unitCost >= 0)) return { ok: false, error: 'BAD_AMOUNT', hint: 'The cost per unit is zero or more.' };
  if (unitCost != null && qty < 0) return { ok: false, error: 'COST_ON_STOCK_IN', hint: 'A cost goes with stock coming in; stock going out is costed by the inventory method.' };
  const batch = batchKey(args.batch);
  const expiry = expiryDate(args.expiry);
  if (!expiry.ok) return { ok: false, error: 'INVALID_EXPIRY', expiry: args.expiry, hint: 'Give the expiry as YYYY-MM-DD, YYYY-MM or MM/YYYY.' };
  if (expiry.expiry && qty < 0) return { ok: false, error: 'EXPIRY_ON_STOCK_IN', hint: 'The expiry is recorded when the batch comes in; to sell from it, name the batch.' };
  if (expiry.expiry && !batch) return { ok: false, error: 'BATCH_REQUIRED', hint: 'An expiry belongs to a batch; give the batch number printed on the pack.' };
  if (batch && qty < 0 && !knownBatch(state, sku, batch)) return { ok: false, error: 'UNKNOWN_BATCH', sku, batch, hint: 'No stock of that batch has come in.' };
  const warnings = toLocation ? [] : stockWarnings(state, { sku, qty, batch: batch || null, date });
  return { ok: true, plan: { sku, qty: Math.round(qty * 1000) / 1000, date, location, toLocation, unitCost: unitCost == null ? null : Math.round(unitCost * 10000) / 10000, batch, expiry: expiry.expiry, warnings } };
}

export function recordStock(state, args = {}) {
  const planned = planStock(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const note = String(args.note || '').trim().slice(0, 200);
  const ref = String(args.ref || '').slice(0, 60);
  state.stockMoves = Array.isArray(state.stockMoves) ? state.stockMoves : [];
  const extra = { ...(plan.unitCost != null ? { unitCost: plan.unitCost } : {}), ...(plan.batch ? { batch: plan.batch } : {}), ...(plan.expiry ? { expiry: plan.expiry } : {}), ...(args.internal ? { internal: true } : {}) };
  if (plan.toLocation) {
    const pair = { internal: true, ...(plan.batch ? { batch: plan.batch } : {}) };
    state.stockMoves.push({ date: plan.date, sku: plan.sku, qty: -plan.qty, location: plan.location, kind: 'out', ref, note: note || `Moved to ${plan.toLocation}`, ...pair });
    const move = { date: plan.date, sku: plan.sku, qty: plan.qty, location: plan.toLocation, kind: 'in', ref, note: note || `Moved from ${plan.location}`, ...pair };
    state.stockMoves.push(move);
    return { ok: true, move, from: plan.location, warnings: [], onHand: stockPosition(state, { sku: plan.sku }).data.rows.find((row) => row.location === plan.toLocation)?.qty ?? 0 };
  }
  const move = { date: plan.date, sku: plan.sku, qty: plan.qty, location: plan.location, kind: args.kind === 'adjust' ? 'adjust' : plan.qty > 0 ? 'in' : 'out', ref, note, ...extra };
  state.stockMoves.push(move);
  return { ok: true, move, warnings: plan.warnings, onHand: stockPosition(state, { sku: plan.sku }).data.rows.find((row) => row.sku === plan.sku && row.location === plan.location)?.qty ?? 0 };
}

export function recordOrderStockMoves(state, { channel, invoiceId, date, orders, direction = 'out' }) {
  state.stockMoves = Array.isArray(state.stockMoves) ? state.stockMoves : [];
  let count = 0;
  for (const order of orders || []) {
    const sku = skuKey(order.sku);
    if (!sku || !(Number(order.qty) > 0)) continue;
    const qty = Number(order.qty);
    state.stockMoves.push({ date, sku, qty: direction === 'out' ? -qty : qty, location: channel, kind: direction, ref: invoiceId, note: `${direction === 'out' ? 'Sold' : 'Returned'} on ${channel}, order ${order.orderId}` });
    count += 1;
  }
  return count;
}

export function stockPosition(state, { sku, location } = {}) {
  const wantedSku = skuKey(sku);
  const wantedLocation = String(location || '').trim().toLowerCase();
  const byKey = new Map();
  for (const move of state.stockMoves || []) {
    if (wantedSku && move.sku !== wantedSku) continue;
    if (wantedLocation && move.location !== wantedLocation) continue;
    const key = `${move.sku}|${move.location}`;
    const row = byKey.get(key) || { sku: move.sku, location: move.location, qty: 0, lastMove: '' };
    row.qty = Math.round((row.qty + move.qty) * 1000) / 1000;
    if (move.date > row.lastMove) row.lastMove = move.date;
    byKey.set(key, row);
  }
  const method = costingMethod(state);
  const pooled = method ? costLedger(state).bySku : null;
  const unitOf = (sku) => {
    if (!pooled) return skus(state)[sku]?.cost ?? null;
    const row = pooled.get(sku);
    return row && row.unitCost != null ? row.unitCost : skus(state)[sku]?.cost ?? null;
  };
  const rows = [...byKey.values()].map((row) => {
    const cost = unitOf(row.sku);
    return { ...row, name: skus(state)[row.sku]?.name || '', unit: skus(state)[row.sku]?.unit || '', cost, value: cost == null ? null : round2(row.qty * cost) };
  }).sort((a, b) => a.sku.localeCompare(b.sku) || a.location.localeCompare(b.location));
  return { ok: true, data: { method, rows, negative: rows.filter((row) => row.qty < 0).map((row) => ({ sku: row.sku, location: row.location, qty: row.qty })), value: round2(rows.reduce((sum, row) => sum + (row.value || 0), 0)) } };
}

export function stockMoves(state, { sku, location, limit = 50 } = {}) {
  const wantedSku = skuKey(sku);
  const wantedLocation = String(location || '').trim().toLowerCase();
  const rows = (state.stockMoves || [])
    .filter((move) => (!wantedSku || move.sku === wantedSku) && (!wantedLocation || move.location === wantedLocation))
    .map((move, index) => ({ ...move, index }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.index - a.index)
    .slice(0, Math.max(1, Math.min(500, Number(limit) || 50)));
  const onHand = stockPosition(state, { sku: wantedSku, location: wantedLocation }).data.rows.reduce((sum, row) => sum + row.qty, 0);
  return { ok: true, data: { sku: wantedSku, location: wantedLocation, onHand: Math.round(onHand * 1000) / 1000, moves: rows.map(({ index, ...move }) => move), total: (state.stockMoves || []).length } };
}

export function stockMovesWords(data) {
  if (!data.moves.length) return `No stock movement recorded${data.sku ? ` for ${data.sku}` : ''}${data.location ? ` at ${data.location}` : ''}.`;
  const lines = [`${data.sku || 'All SKUs'}${data.location ? ` at ${data.location}` : ''}: ${data.onHand} on hand after ${data.moves.length === 1 ? '1 movement' : `${data.moves.length} movements`}.`];
  for (const move of data.moves.slice(0, 12)) lines.push(`· ${move.date}: ${move.qty > 0 ? `+${move.qty}` : move.qty} ${move.sku} at ${move.location}${move.note ? `, ${move.note}` : ''}${move.ref ? ` (${move.ref})` : ''}`);
  return lines.join('\n');
}

function feesByOrder(state, channel, period) {
  const out = new Map();
  for (const settlement of state.settlements || []) {
    if (channel && settlement.channel !== channel) continue;
    if (period && String(settlement.to || '').slice(0, 7) !== period) continue;
    const lines = settlement.lines || [];
    const orderIds = new Set(lines.filter((line) => line.orderId && line.kind === 'sale').map((line) => line.orderId));
    const saleByOrder = new Map();
    for (const line of lines) if (line.orderId && (line.kind === 'sale' || line.kind === 'tax')) saleByOrder.set(line.orderId, round2((saleByOrder.get(line.orderId) || 0) + line.amount));
    const saleTotal = round2([...saleByOrder.values()].reduce((sum, v) => sum + v, 0));
    const charge = (orderId, amount) => out.set(orderId, round2((out.get(orderId) || 0) + amount));
    for (const line of lines) {
      if (!['fee', 'penalty'].includes(line.kind)) continue;
      const amount = Math.abs(line.amount);
      if (line.orderId && orderIds.has(line.orderId)) charge(line.orderId, amount);
      else if (saleTotal > 0) for (const [orderId, sale] of saleByOrder) charge(orderId, round2(amount * sale / saleTotal));
    }
    for (const line of lines) if (line.kind === 'reimbursement' && line.orderId && orderIds.has(line.orderId)) charge(line.orderId, -Math.abs(line.amount));
  }
  return out;
}

export function skuMargins(state, { period, channel } = {}) {
  const wanted = String(period || '').trim();
  if (wanted && !isReturnPeriod(wanted)) return { ok: false, error: 'INVALID_PERIOD', hint: 'Use YYYY-MM, for example 2026-09.' };
  const wantedChannel = String(channel || '').trim().toLowerCase();
  const costs = skus(state);
  const rows = new Map();
  const rowFor = (sku, ch) => {
    const key = `${sku}|${ch}`;
    if (!rows.has(key)) rows.set(key, { sku, channel: ch, name: costs[sku]?.name || '', units: 0, returnedUnits: 0, sales: 0, returns: 0, fees: 0, cogs: 0, cost: costs[sku]?.cost ?? null, costMissing: costs[sku]?.cost == null });
    return rows.get(key);
  };
  const fees = feesByOrder(state, wantedChannel, wanted);
  const method = costingMethod(state);
  const spentCache = new Map();
  const unitCostFor = (ref, sku) => {
    if (!method) return costs[sku]?.cost ?? null;
    const key = `${ref}|${sku}`;
    if (!spentCache.has(key)) spentCache.set(key, costOfMovesBy(state, ref, sku));
    const spent = spentCache.get(key);
    if (spent && spent.qty > spent.uncosted) return spent.cost / (spent.qty - spent.uncosted);
    return costs[sku]?.cost ?? null;
  };
  const orderSku = new Map();
  for (const inv of state.invoices || []) {
    if (inv.source !== 'marketplace' || inv.status === 'cancelled') continue;
    if (wantedChannel && inv.channel !== wantedChannel) continue;
    if (wanted && inv.date.slice(0, 7) !== wanted) continue;
    for (const order of inv.orders || []) {
      const sku = skuKey(order.sku) || '(no sku)';
      orderSku.set(`${inv.channel}:${order.orderId}`, sku);
      const row = rowFor(sku, inv.channel);
      row.units += Number(order.qty || 0);
      row.sales = round2(row.sales + Number(order.taxable || 0));
      const unitCost = unitCostFor(inv.id, sku);
      if (unitCost != null) row.costMissing = false;
      row.cogs = round2(row.cogs + (unitCost == null ? 0 : Number(order.qty || 0) * unitCost));
      row.fees = round2(row.fees + (fees.get(order.orderId) || 0));
    }
  }
  for (const note of state.creditNotes || []) {
    if (!note.marketplaceOrderId) continue;
    if (wantedChannel && note.channel !== wantedChannel) continue;
    if (wanted && String(note.date || '').slice(0, 7) !== wanted) continue;
    const sku = orderSku.get(`${note.channel}:${note.marketplaceOrderId}`);
    if (!sku) continue;
    const row = rowFor(sku, note.channel);
    row.returnedUnits += 1;
    row.returns = round2(row.returns + Number(note.taxable || 0));
    const returnCost = unitCostFor(note.id, sku);
    if (returnCost != null) row.cogs = round2(row.cogs - returnCost);
  }
  const list = [...rows.values()].map((row) => {
    const net = round2(row.sales - row.returns);
    const margin = round2(net - row.fees - row.cogs);
    return { ...row, net, margin, marginPercent: net > 0 ? round2(margin / net * 100) : null, feesPercent: net > 0 ? round2(row.fees / net * 100) : null };
  }).sort((a, b) => a.margin - b.margin);
  const byChannel = {};
  for (const row of list) {
    const bucket = byChannel[row.channel] || (byChannel[row.channel] = { units: 0, net: 0, fees: 0, cogs: 0, margin: 0 });
    bucket.units += row.units - row.returnedUnits;
    bucket.net = round2(bucket.net + row.net);
    bucket.fees = round2(bucket.fees + row.fees);
    bucket.cogs = round2(bucket.cogs + row.cogs);
    bucket.margin = round2(bucket.margin + row.margin);
  }
  for (const bucket of Object.values(byChannel)) bucket.marginPercent = bucket.net > 0 ? round2(bucket.margin / bucket.net * 100) : null;
  return {
    ok: true,
    data: {
      period: wanted,
      channel: wantedChannel,
      rows: list,
      byChannel,
      negative: list.filter((row) => row.margin < 0 && !row.costMissing),
      costMissing: [...new Set(list.filter((row) => row.costMissing && row.sku !== '(no sku)').map((row) => row.sku))],
      totals: { net: round2(list.reduce((s, r) => s + r.net, 0)), fees: round2(list.reduce((s, r) => s + r.fees, 0)), cogs: round2(list.reduce((s, r) => s + r.cogs, 0)), margin: round2(list.reduce((s, r) => s + r.margin, 0)) },
    },
  };
}

export function marginsWords(data, money) {
  if (!data.rows.length) return `No marketplace orders${data.period ? ` in ${data.period}` : ''}${data.channel ? ` on ${data.channel}` : ''} yet. Import the order report, set SKU costs ("cost of SKU-A is 450"), and margins appear here.`;
  const lines = [`Margins${data.period ? ` for ${data.period}` : ''}${data.channel ? ` on ${data.channel}` : ''}: net sales ${money(data.totals.net)}, fees ${money(data.totals.fees)}, cost of goods ${money(data.totals.cogs)}, margin ${money(data.totals.margin)}${data.totals.net > 0 ? ` (${round2(data.totals.margin / data.totals.net * 100)}%)` : ''}.`];
  for (const [channel, b] of Object.entries(data.byChannel)) lines.push(`· ${channel}: net ${money(b.net)}, fees ${money(b.fees)}, margin ${money(b.margin)}${b.marginPercent != null ? ` (${b.marginPercent}%)` : ''}`);
  const worst = data.rows.slice(0, 5);
  const best = data.rows.slice(-3).reverse();
  if (worst.length) lines.push(`Lowest: ${worst.map((row) => `${row.sku}${row.costMissing ? ' (no cost set)' : ''} ${money(row.margin)}${row.marginPercent != null ? ` (${row.marginPercent}%)` : ''}`).join('; ')}.`);
  if (best.length && data.rows.length > 5) lines.push(`Highest: ${best.map((row) => `${row.sku} ${money(row.margin)}${row.marginPercent != null ? ` (${row.marginPercent}%)` : ''}`).join('; ')}.`);
  if (data.costMissing.length) lines.push(`${data.costMissing.length === 1 ? '1 SKU has' : `${data.costMissing.length} SKUs have`} no cost yet, so its margin is before cost of goods: ${data.costMissing.slice(0, 8).join(', ')}.`);
  return lines.join('\n');
}

export function stockWords(data, money) {
  if (!data.rows.length) return 'No stock movement is recorded yet. Marketplace orders move stock out of the channel\'s location as they are imported; record what you hold with "stock in SKU-A 120 at warehouse".';
  const lines = [`Stock on hand: ${data.rows.length === 1 ? '1 line' : `${data.rows.length} lines`}${data.value ? `, valued at cost ${money(data.value)}` : ''}.`];
  for (const row of data.rows.slice(0, 12)) lines.push(`· ${row.sku}${row.name ? ` ${row.name}` : ''} at ${row.location}: ${row.qty}${row.value != null ? ` (${money(row.value)})` : ''}`);
  if (data.negative.length) lines.push(`Negative at ${data.negative.length === 1 ? '1 location' : `${data.negative.length} locations`}: ${data.negative.map((row) => `${row.sku} at ${row.location} ${row.qty}`).join('; ')}. Record the stock you sent there.`);
  return lines.join('\n');
}

export function findItem(state, args = {}) {
  const code = String(args.code == null ? '' : args.code).replace(/\s/g, '');
  if (!code) return { ok: false, error: 'CODE_REQUIRED', hint: 'Scan or type the barcode or SKU.' };
  const all = skus(state);
  const key = skuKey(code);
  const sku = Object.hasOwn(all, key) ? key : Object.keys(all).find((name) => all[name]?.barcode === code) || null;
  if (!sku) return { ok: true, data: { found: false, code, hint: 'No item has this barcode or SKU yet. Save it once with its name, price and GST rate, and later scans fill the bill.' } };
  const item = all[sku];
  const onHand = stockPosition(state, { sku }).data.rows.reduce((sum, row) => sum + row.qty, 0);
  const today = localToday();
  const batches = (batchesOf(state).get(sku) || []).filter((row) => row.qty > 0 && row.batch).map((row) => ({ batch: row.batch, expiry: row.expiry, qty: row.qty, expired: Boolean(row.expiry && row.expiry < today) }));
  const held = Math.round(onHand * 1000) / 1000;
  return { ok: true, data: { found: true, code, sku, name: item.name || sku, barcode: item.barcode || '', hsn: item.hsn || '', gstRate: item.gstRate ?? null, price: item.price ?? null, cost: item.cost ?? null, unit: item.unit || '', reorderLevel: item.reorderLevel ?? null, onHand: held, lowStock: item.reorderLevel != null && held <= item.reorderLevel, batches, tracked: (state.stockMoves || []).some((move) => move.sku === sku) } };
}
