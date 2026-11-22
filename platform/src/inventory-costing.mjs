import { appendAuditEvent } from './ca-api.mjs';
import { isoDate, localToday } from './dates.mjs';
import { daysBetween } from './reminders.mjs';

export const COSTING_METHODS = Object.freeze(['fifo', 'average']);
export const COSTING_BASIS = 'AS 2 (Revised) Valuation of Inventories, paragraph 16, and Ind AS 2, paragraph 25: the cost of interchangeable items is assigned by the first-in, first-out (FIFO) or the weighted average cost formula; LIFO is not one of them.';
export const COSTING_WORDS = Object.freeze({ fifo: 'FIFO', average: 'weighted average', '': 'recorded cost' });

const EXPIRING_DAYS = 30;
const QTY_EPSILON = 0.0005;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const round3 = (value) => Math.round(Number(value || 0) * 1000) / 1000;
const round4 = (value) => Math.round(Number(value || 0) * 10000) / 10000;

function items(state) {
  return state.skus && typeof state.skus === 'object' ? state.skus : {};
}

export function costingMethod(state) {
  const method = state.inventoryCosting && state.inventoryCosting.method;
  return COSTING_METHODS.includes(method) ? method : '';
}

export function isInternalMove(move) {
  return Boolean(move.internal) || /^(Transferred to|Received from) /.test(String(move.note || ''));
}

export function expiryDate(value) {
  if (value == null || value === '') return { ok: true, expiry: '' };
  const text = String(value).trim();
  const isoMonth = /^(\d{4})-(\d{2})$/.exec(text);
  const printedMonth = /^(\d{2})\/(\d{4})$/.exec(text);
  if (isoMonth || printedMonth) {
    const year = Number(isoMonth ? isoMonth[1] : printedMonth[2]);
    const mon = Number(isoMonth ? isoMonth[2] : printedMonth[1]);
    if (mon < 1 || mon > 12) return { ok: false, error: 'INVALID_EXPIRY' };
    const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    return { ok: true, expiry: `${year}-${String(mon).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, error: 'INVALID_EXPIRY' };
  const iso = isoDate(text);
  return iso === text ? { ok: true, expiry: iso } : { ok: false, error: 'INVALID_EXPIRY' };
}

export function batchKey(value) {
  return String(value == null ? '' : value).trim().toUpperCase().replace(/\s+/g, '').slice(0, 20);
}

function orderedMoves(state, asOf) {
  return (state.stockMoves || [])
    .map((move, index) => ({ move, index }))
    .filter(({ move }) => !asOf || String(move.date || '') <= asOf)
    .sort((a, b) => String(a.move.date).localeCompare(String(b.move.date)) || a.index - b.index);
}

function newPool() {
  return { lots: [], qty: 0, value: 0, uncosted: 0, short: 0, lastUnit: null };
}

function fallbackCost(pool, item, method) {
  if (item?.cost != null) return Number(item.cost);
  if (method === 'average' && pool.qty > QTY_EPSILON) return pool.value / pool.qty;
  return pool.lastUnit;
}

function receive(pool, move, unitCost, method) {
  let qty = Number(move.qty);
  const filled = Math.min(pool.short, qty);
  pool.short = round3(pool.short - filled);
  qty = round3(qty - filled);
  if (qty <= QTY_EPSILON) return;
  if (method === 'fifo') {
    pool.lots.push({ date: move.date, qty, unitCost, ref: move.ref || '', ...(move.batch ? { batch: move.batch } : {}), ...(move.expiry ? { expiry: move.expiry } : {}) });
    return;
  }
  if (unitCost == null) pool.uncosted = round3(pool.uncosted + qty);
  else {
    pool.qty = round3(pool.qty + qty);
    pool.value = round4(pool.value + qty * unitCost);
  }
}

function issue(pool, qty, fallback, method) {
  let left = qty;
  let cost = 0;
  let uncosted = 0;
  if (method === 'fifo') {
    while (left > QTY_EPSILON && pool.lots.length) {
      const lot = pool.lots[0];
      const take = Math.min(lot.qty, left);
      if (lot.unitCost == null) uncosted += take;
      else {
        cost += take * lot.unitCost;
        pool.lastUnit = lot.unitCost;
      }
      lot.qty = round3(lot.qty - take);
      left = round3(left - take);
      if (lot.qty <= QTY_EPSILON) pool.lots.shift();
    }
  } else {
    const fromCosted = Math.min(pool.qty, left);
    if (fromCosted > QTY_EPSILON) {
      const unit = pool.value / pool.qty;
      const part = round4(fromCosted * unit);
      cost += part;
      pool.lastUnit = unit;
      pool.qty = round3(pool.qty - fromCosted);
      pool.value = pool.qty <= QTY_EPSILON ? 0 : round4(pool.value - part);
      left = round3(left - fromCosted);
    }
    const fromUncosted = Math.min(pool.uncosted, left);
    if (fromUncosted > QTY_EPSILON) {
      uncosted += fromUncosted;
      pool.uncosted = round3(pool.uncosted - fromUncosted);
      left = round3(left - fromUncosted);
    }
  }
  if (left > QTY_EPSILON) {
    pool.short = round3(pool.short + left);
    if (fallback == null) uncosted += left;
    else cost += left * fallback;
  }
  return { cost: round2(cost), uncosted: round3(uncosted) };
}

function poolSummary(sku, pool, item, method) {
  const lots = method === 'fifo' ? pool.lots.filter((lot) => lot.qty > QTY_EPSILON) : [];
  const costedQty = method === 'fifo' ? round3(lots.filter((lot) => lot.unitCost != null).reduce((sum, lot) => sum + lot.qty, 0)) : pool.qty;
  const uncostedQty = method === 'fifo' ? round3(lots.filter((lot) => lot.unitCost == null).reduce((sum, lot) => sum + lot.qty, 0)) : pool.uncosted;
  const value = method === 'fifo' ? round2(lots.reduce((sum, lot) => sum + (lot.unitCost == null ? 0 : lot.qty * lot.unitCost), 0)) : round2(pool.value);
  return {
    sku,
    name: item?.name || '',
    unit: item?.unit || '',
    qty: round3(costedQty + uncostedQty - pool.short),
    costedQty,
    uncostedQty,
    short: pool.short,
    value,
    unitCost: costedQty > QTY_EPSILON ? round4(value / costedQty) : null,
    lots: method === 'fifo' ? lots.map((lot) => ({ ...lot })) : costedQty > QTY_EPSILON ? [{ qty: costedQty, unitCost: round4(value / costedQty) }] : [],
  };
}

export function costLedger(state, { asOf = '', method = costingMethod(state) } = {}) {
  const catalogue = items(state);
  const pools = new Map();
  const moveCosts = new Map();
  if (!method) return { method, bySku: new Map(), moveCosts };
  for (const { move, index } of orderedMoves(state, asOf)) {
    if (isInternalMove(move)) continue;
    const qty = Number(move.qty);
    if (!Number.isFinite(qty) || qty === 0) continue;
    if (!pools.has(move.sku)) pools.set(move.sku, newPool());
    const pool = pools.get(move.sku);
    const item = catalogue[move.sku];
    if (qty > 0) {
      const unitCost = move.unitCost != null ? Number(move.unitCost) : fallbackCost(pool, item, method);
      receive(pool, move, unitCost == null ? null : unitCost, method);
      moveCosts.set(index, { qty, cost: unitCost == null ? null : round2(qty * unitCost), unitCost: unitCost == null ? null : round4(unitCost), uncosted: unitCost == null ? qty : 0 });
    } else {
      const out = issue(pool, -qty, fallbackCost(pool, item, method), method);
      const costed = round3(-qty - out.uncosted);
      moveCosts.set(index, { qty, cost: out.cost, unitCost: costed > QTY_EPSILON ? round4(out.cost / costed) : null, uncosted: out.uncosted });
    }
  }
  const bySku = new Map([...pools.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([sku, pool]) => [sku, poolSummary(sku, pool, catalogue[sku], method)]));
  return { method, bySku, moveCosts };
}

export function costOfMovesBy(state, ref, sku) {
  const ledger = costLedger(state);
  if (!ledger.method) return null;
  let qty = 0;
  let cost = 0;
  let uncosted = 0;
  (state.stockMoves || []).forEach((move, index) => {
    if (move.ref !== ref || move.sku !== sku) return;
    const row = ledger.moveCosts.get(index);
    if (!row) return;
    qty += Math.abs(row.qty);
    cost += row.cost || 0;
    uncosted += row.uncosted || 0;
  });
  return qty > 0 ? { qty: round3(qty), cost: round2(cost), uncosted: round3(uncosted) } : null;
}

export function unitCostOf(state, sku) {
  const method = costingMethod(state);
  const item = items(state)[sku];
  if (!method) return item?.cost == null ? null : Number(item.cost);
  const row = costLedger(state).bySku.get(sku);
  return row && row.unitCost != null ? row.unitCost : item?.cost == null ? null : Number(item.cost);
}

export function cogsBetween(state, { from, to } = {}) {
  const ledger = costLedger(state);
  const rows = new Map();
  if (!ledger.method) {
    for (const move of state.stockMoves || []) {
      if (isInternalMove(move) || !(Number(move.qty) < 0)) continue;
      if ((from && move.date < from) || (to && move.date > to)) continue;
      const cost = items(state)[move.sku]?.cost;
      const row = rows.get(move.sku) || { sku: move.sku, qty: 0, cost: 0, uncosted: 0 };
      row.qty = round3(row.qty - move.qty);
      if (cost == null) row.uncosted = round3(row.uncosted - move.qty);
      else row.cost = round2(row.cost - move.qty * cost);
      rows.set(move.sku, row);
    }
  } else {
    (state.stockMoves || []).forEach((move, index) => {
      if (isInternalMove(move) || !(Number(move.qty) < 0)) return;
      if ((from && move.date < from) || (to && move.date > to)) return;
      const spent = ledger.moveCosts.get(index);
      if (!spent) return;
      const row = rows.get(move.sku) || { sku: move.sku, qty: 0, cost: 0, uncosted: 0 };
      row.qty = round3(row.qty - move.qty);
      row.cost = round2(row.cost + spent.cost);
      row.uncosted = round3(row.uncosted + spent.uncosted);
      rows.set(move.sku, row);
    });
  }
  const list = [...rows.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  return { from: from || '', to: to || '', rows: list, total: round2(list.reduce((sum, row) => sum + row.cost, 0)), uncosted: list.filter((row) => row.uncosted > 0).map((row) => row.sku) };
}

export function planCostingMethod(state, args = {}) {
  const method = String(args.method || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const wanted = method === 'weightedaverage' || method === 'avg' || method === 'wac' ? 'average' : method;
  if (!wanted) return { ok: false, error: 'METHOD_REQUIRED', allowed: COSTING_METHODS };
  if (!COSTING_METHODS.includes(wanted)) return { ok: false, error: 'METHOD_NOT_ALLOWED', method: wanted, allowed: COSTING_METHODS, basis: COSTING_BASIS };
  const previous = costingMethod(state);
  if (previous === wanted) return { ok: false, error: 'ALREADY_SET', method: wanted };
  const reason = String(args.reason || '').trim().slice(0, 300);
  if (previous && !reason) return { ok: false, error: 'REASON_REQUIRED', previous, method: wanted, hint: 'A change of costing method is a change of accounting policy; say why, and agree it with your CA first.' };
  const lastValuation = (state.inventoryValuations || []).at(-1) || null;
  return { ok: true, plan: { method: wanted, previous, reason, on: localToday(), lastValuationAsOf: lastValuation ? lastValuation.asOf : '' } };
}

export function setCostingMethod(state, args = {}) {
  const planned = planCostingMethod(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const actorId = String(state.__actor?.userId || args.actorId || 'owner').slice(0, 80);
  const before = state.inventoryCosting && typeof state.inventoryCosting === 'object' ? state.inventoryCosting : { method: '', history: [] };
  const history = Array.isArray(before.history) ? before.history.slice() : [];
  history.push({ method: plan.method, previous: plan.previous, on: plan.on, by: actorId, reason: plan.reason });
  state.inventoryCosting = { method: plan.method, since: plan.on, history };
  appendAuditEvent(state, { actorId, action: 'inventory.costing_method', metadata: { method: plan.method, previous: plan.previous, reason: plan.reason, on: plan.on } });
  return { ok: true, method: plan.method, previous: plan.previous, since: plan.on, reason: plan.reason, basis: COSTING_BASIS, lastValuationAsOf: plan.lastValuationAsOf };
}

export function costingMethodWords(result) {
  const name = COSTING_WORDS[result.method];
  return `Inventory is costed by ${name} from ${result.since}${result.previous ? `, in place of ${COSTING_WORDS[result.previous]} (${result.reason})` : ''}. Stock already on hand stays at its recorded cost as the opening lot; each stock-in from now carries its own cost, and stock out, stock values, margins and valuations use ${name}.${result.previous && result.lastValuationAsOf ? ` The valuation of ${result.lastValuationAsOf} stays as posted; the next valuation carries the effect of the change.` : ''}`;
}

export function inventoryCosting(state, args = {}) {
  const method = costingMethod(state);
  const asOf = isoDate(args.asOf) || localToday();
  const ledger = costLedger(state, { asOf });
  const catalogue = items(state);
  const skusMoved = [...new Set((state.stockMoves || []).map((move) => move.sku))].sort();
  const list = method
    ? [...ledger.bySku.values()]
    : skusMoved.map((sku) => {
      const qty = round3((state.stockMoves || []).filter((move) => move.sku === sku && move.date <= asOf).reduce((sum, move) => sum + Number(move.qty || 0), 0));
      const cost = catalogue[sku]?.cost;
      return { sku, name: catalogue[sku]?.name || '', unit: catalogue[sku]?.unit || '', qty, value: cost == null ? null : round2(qty * cost), unitCost: cost == null ? null : Number(cost), lots: [] };
    });
  const from = isoDate(args.from) || `${asOf.slice(0, 7)}-01`;
  const to = isoDate(args.to) || asOf;
  const history = Array.isArray(state.inventoryCosting?.history) ? state.inventoryCosting.history : [];
  return {
    ok: true,
    data: {
      method,
      methodWords: COSTING_WORDS[method],
      since: state.inventoryCosting?.since || '',
      history,
      basis: COSTING_BASIS,
      asOf,
      items: list,
      value: round2(list.reduce((sum, row) => sum + (row.value || 0), 0)),
      cogs: cogsBetween(state, { from, to }),
      ...(method ? {} : { hint: 'No costing method is chosen, so stock is valued at the recorded SKU cost. Choose FIFO or weighted average ("cost inventory by FIFO"); AS 2 allows those two.' }),
    },
  };
}

export function inventoryCostingWords(data, money) {
  const lines = [`Inventory costing: ${data.methodWords}${data.since ? ` since ${data.since}` : ''}. On hand at ${data.asOf}: ${money(data.value)}. Cost of goods out ${data.cogs.from} to ${data.cogs.to}: ${money(data.cogs.total)}.`];
  for (const row of data.items.slice(0, 10)) lines.push(`· ${row.sku}${row.name ? ` ${row.name}` : ''}: ${row.qty}${row.unit ? ` ${row.unit}` : ''}${row.value != null ? ` at ${money(row.value)}${row.unitCost != null ? ` (${money(row.unitCost)} each)` : ''}` : ', no cost'}`);
  if (data.hint) lines.push(data.hint);
  return lines.join('\n');
}

export function batchesOf(state, { asOf = '' } = {}) {
  const bySku = new Map();
  const bucketsOf = (sku) => {
    if (!bySku.has(sku)) bySku.set(sku, []);
    return bySku.get(sku);
  };
  for (const { move } of orderedMoves(state, asOf)) {
    if (isInternalMove(move)) continue;
    const qty = Number(move.qty);
    if (!Number.isFinite(qty) || qty === 0) continue;
    const buckets = bucketsOf(move.sku);
    if (qty > 0) {
      const key = move.batch || '';
      const found = buckets.find((row) => row.batch === key && (row.expiry || '') === (move.expiry || ''));
      if (found) found.qty = round3(found.qty + qty);
      else buckets.push({ batch: key, expiry: move.expiry || '', qty, received: move.date });
      continue;
    }
    issueBatches(buckets, -qty, move.batch || null, move.date);
  }
  return bySku;
}

function fefo(buckets, day = '') {
  const expired = (row) => (day && row.expiry && row.expiry < day ? 1 : 0);
  return buckets.filter((row) => row.qty > QTY_EPSILON).sort((a, b) => expired(a) - expired(b) || (a.expiry ? 0 : 1) - (b.expiry ? 0 : 1) || String(a.expiry).localeCompare(String(b.expiry)) || String(a.received).localeCompare(String(b.received)));
}

function issueBatches(buckets, qty, batch, day = '') {
  const taken = [];
  let left = qty;
  const order = batch != null ? buckets.filter((row) => row.batch === batch) : fefo(buckets, day);
  for (const row of order) {
    if (left <= QTY_EPSILON) break;
    const take = batch != null ? left : Math.min(row.qty, left);
    if (take <= QTY_EPSILON) continue;
    row.qty = round3(row.qty - take);
    left = round3(left - take);
    taken.push({ batch: row.batch, expiry: row.expiry, qty: take });
  }
  if (left > QTY_EPSILON) {
    const spill = buckets.find((row) => row.batch === '' && !row.expiry) || (() => {
      const row = { batch: '', expiry: '', qty: 0, received: '' };
      buckets.push(row);
      return row;
    })();
    spill.qty = round3(spill.qty - left);
    taken.push({ batch: '', expiry: '', qty: left });
  }
  return taken;
}

export function batchesTaken(state, sku, qty, batch, date) {
  const buckets = (batchesOf(state, { asOf: date }).get(sku) || []).map((row) => ({ ...row }));
  return issueBatches(buckets, qty, batch, date);
}

export function knownBatch(state, sku, batch) {
  return (state.stockMoves || []).some((move) => move.sku === sku && move.batch === batch && Number(move.qty) > 0);
}

export function stockWarnings(state, { sku, qty, batch = null, date }) {
  const warnings = [];
  if (!(qty < 0)) return warnings;
  const day = date || localToday();
  for (const part of batchesTaken(state, sku, -qty, batch, day)) {
    if (part.batch && part.expiry && part.expiry < day) warnings.push({ code: 'EXPIRED_BATCH', sku, batch: part.batch, expiry: part.expiry, qty: part.qty });
  }
  const item = items(state)[sku];
  if (item?.reorderLevel != null) {
    const onHand = round3((state.stockMoves || []).filter((move) => move.sku === sku).reduce((sum, move) => sum + Number(move.qty || 0), 0) + qty);
    if (onHand <= Number(item.reorderLevel)) warnings.push({ code: 'LOW_STOCK', sku, onHand, reorderLevel: Number(item.reorderLevel) });
  }
  return warnings;
}

export function warningWords(warning) {
  if (warning.code === 'EXPIRED_BATCH') return `Warning: ${warning.sku} batch ${warning.batch} expired on ${warning.expiry}. This only takes it out of stock, for example to write it off; an expired batch cannot be sold on a bill.`;
  if (warning.code === 'LOW_STOCK') return `${warning.sku} falls to ${warning.onHand}, at or below its reorder level of ${warning.reorderLevel}.`;
  return warning.code;
}

export function stockAlerts(state, args = {}) {
  const asOf = isoDate(args.asOf) || localToday();
  const days = Number.isInteger(Number(args.days)) && Number(args.days) > 0 && Number(args.days) <= 365 ? Number(args.days) : EXPIRING_DAYS;
  const catalogue = items(state);
  const expiring = [];
  const expired = [];
  for (const [sku, buckets] of batchesOf(state, { asOf })) {
    for (const row of buckets) {
      if (!(row.qty > QTY_EPSILON) || !row.expiry) continue;
      const left = daysBetween(asOf, row.expiry);
      const entry = { sku, name: catalogue[sku]?.name || '', unit: catalogue[sku]?.unit || '', batch: row.batch, expiry: row.expiry, qty: row.qty, daysLeft: left };
      if (left < 0) expired.push(entry);
      else if (left <= days) expiring.push(entry);
    }
  }
  const onHand = new Map();
  for (const move of state.stockMoves || []) if (move.date <= asOf) onHand.set(move.sku, round3((onHand.get(move.sku) || 0) + Number(move.qty || 0)));
  const onOrder = new Map();
  for (const order of state.purchaseOrders || []) if (order.status === 'open') for (const line of order.lines || []) onOrder.set(line.sku, (onOrder.get(line.sku) || 0) + line.qty);
  const lowStock = Object.entries(catalogue)
    .filter(([, item]) => item && item.reorderLevel != null)
    .map(([sku, item]) => ({ sku, name: item.name || '', unit: item.unit || '', onHand: onHand.get(sku) || 0, reorderLevel: Number(item.reorderLevel), onOrder: onOrder.get(sku) || 0 }))
    .filter((row) => row.onHand <= row.reorderLevel)
    .sort((a, b) => (a.onHand - a.reorderLevel) - (b.onHand - b.reorderLevel) || a.sku.localeCompare(b.sku));
  const byExpiry = (a, b) => a.expiry.localeCompare(b.expiry) || a.sku.localeCompare(b.sku);
  return { ok: true, data: { asOf, days, expiring: expiring.sort(byExpiry), expired: expired.sort(byExpiry), lowStock } };
}

export function stockAlertsWords(data) {
  if (!data.expiring.length && !data.expired.length && !data.lowStock.length) return `Nothing expires in the next ${data.days} days and nothing is below its reorder level.`;
  const lines = [];
  const unit = (row) => (row.unit ? ` ${row.unit}` : '');
  if (data.expired.length) lines.push(`Expired, still on hand: ${data.expired.map((row) => `${row.sku} batch ${row.batch} ${row.qty}${unit(row)} (expired ${row.expiry})`).join('; ')}.`);
  if (data.expiring.length) lines.push(`Expiring in ${data.days} days: ${data.expiring.map((row) => `${row.sku} batch ${row.batch} ${row.qty}${unit(row)} on ${row.expiry}`).join('; ')}.`);
  if (data.lowStock.length) lines.push(`Low stock: ${data.lowStock.map((row) => `${row.sku} ${row.onHand}${unit(row)} (reorder at ${row.reorderLevel})`).join('; ')}.`);
  return lines.join('\n');
}
