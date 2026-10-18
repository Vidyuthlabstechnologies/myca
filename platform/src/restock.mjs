import { localToday, postingDate } from './dates.mjs';
import { daysBetween } from './reminders.mjs';

const SHORT_WINDOW = 7;
const LONG_WINDOW = 28;
const SIZING_DAYS = 60;
const OVERSTOCK_DAYS = 120;
const DEFAULT_LEAD_DAYS = 7;
const MAX_SKU = 40;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function skuKey(value) {
  return String(value == null ? '' : value).trim().toUpperCase().slice(0, MAX_SKU);
}

function catalogue(state) {
  return state.skus && typeof state.skus === 'object' ? state.skus : {};
}

export function planSkuSupply(state, args = {}) {
  const sku = skuKey(args.sku);
  if (!sku) return { ok: false, error: 'SKU_REQUIRED' };
  const supplier = String(args.supplier || '').trim().slice(0, 80);
  const leadDays = args.leadDays == null || args.leadDays === '' ? DEFAULT_LEAD_DAYS : Number(args.leadDays);
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 365) return { ok: false, error: 'BAD_LEAD_DAYS', hint: 'Lead time is whole days, 0 to 365.' };
  const pack = args.pack == null || args.pack === '' ? 1 : Number(args.pack);
  if (!Number.isInteger(pack) || pack < 1) return { ok: false, error: 'BAD_PACK', hint: 'A pack is a whole number of units, at least 1.' };
  const moq = args.moq == null || args.moq === '' ? 0 : Number(args.moq);
  if (!Number.isInteger(moq) || moq < 0) return { ok: false, error: 'BAD_MOQ' };
  const before = catalogue(state)[sku]?.supply || null;
  return { ok: true, plan: { sku, supplier, leadDays, pack, moq, before, known: Boolean(catalogue(state)[sku]) } };
}

export function setSkuSupply(state, args = {}) {
  const planned = planSkuSupply(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  state.skus = state.skus && typeof state.skus === 'object' ? state.skus : {};
  state.skus[plan.sku] = { ...(state.skus[plan.sku] || {}), supply: { supplier: plan.supplier, leadDays: plan.leadDays, pack: plan.pack, moq: plan.moq } };
  return { ok: true, sku: plan.sku, supply: state.skus[plan.sku].supply };
}

function nextPoId(state) {
  state.purchaseOrderSeq = Number(state.purchaseOrderSeq || 0) + 1;
  return `PO-${String(state.purchaseOrderSeq).padStart(4, '0')}`;
}

export function planPurchaseOrder(state, args = {}) {
  const supplier = String(args.supplier || '').trim().slice(0, 80);
  if (!supplier) return { ok: false, error: 'SUPPLIER_REQUIRED' };
  const lines = Array.isArray(args.lines) ? args.lines : [];
  if (!lines.length) return { ok: false, error: 'LINES_REQUIRED' };
  const cleaned = [];
  for (const line of lines) {
    const sku = skuKey(line?.sku);
    const qty = Number(line?.qty);
    if (!sku || !Number.isInteger(qty) || qty <= 0) return { ok: false, error: 'BAD_LINE', hint: 'Each line needs a SKU and a whole positive quantity.' };
    const rate = line?.rate == null || line.rate === '' ? (catalogue(state)[sku]?.cost ?? null) : Number(line.rate);
    if (rate != null && !(Number.isFinite(rate) && rate >= 0)) return { ok: false, error: 'BAD_RATE' };
    cleaned.push({ sku, qty, rate, amount: rate == null ? null : round2(qty * rate) });
  }
  const date = args.date == null || args.date === '' ? localToday() : postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  const lead = Math.max(...cleaned.map((l) => catalogue(state)[l.sku]?.supply?.leadDays ?? DEFAULT_LEAD_DAYS));
  const expectedOn = args.expectedOn == null || args.expectedOn === '' ? addDays(date, lead) : postingDate(args.expectedOn);
  if (!expectedOn) return { ok: false, error: 'INVALID_DATE', date: args.expectedOn };
  const total = cleaned.every((l) => l.amount != null) ? round2(cleaned.reduce((s, l) => s + l.amount, 0)) : null;
  return { ok: true, plan: { supplier, lines: cleaned, date, expectedOn, total } };
}

export function recordPurchaseOrder(state, args = {}) {
  const planned = planPurchaseOrder(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  state.purchaseOrders = Array.isArray(state.purchaseOrders) ? state.purchaseOrders : [];
  const order = { id: nextPoId(state), ...plan, status: 'open', by: String(state?.__actor?.userId || args.actorId || '').slice(0, 80) };
  state.purchaseOrders.push(order);
  return { ok: true, order };
}

function onOrderBySku(state) {
  const out = new Map();
  for (const order of state.purchaseOrders || []) {
    if (order.status !== 'open') continue;
    for (const line of order.lines || []) out.set(line.sku, (out.get(line.sku) || 0) + line.qty);
  }
  return out;
}

function demandOf(moves, from, to) {
  let units = 0;
  for (const move of moves) {
    if (move.date < from || move.date > to) continue;
    if (move.kind === 'out') units += -move.qty;
    else if (move.kind === 'in' && /^Returned/.test(String(move.note || ''))) units -= move.qty;
  }
  return Math.max(0, units);
}

function inStockDays(moves, from, to, onHandAtEnd) {
  let position = onHandAtEnd;
  const byDay = new Map();
  for (const move of moves) byDay.set(move.date, (byDay.get(move.date) || 0) + move.qty);
  let days = 0;
  for (let date = to; date >= from; date = addDays(date, -1)) {
    if (position > 0) days += 1;
    position -= byDay.get(date) || 0;
  }
  return days;
}

export function restockPlan(state, args = {}) {
  const today = postingDate(args.asOf) || localToday();
  const moves = (state.stockMoves || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const bySku = new Map();
  for (const move of moves) {
    if (!bySku.has(move.sku)) bySku.set(move.sku, []);
    bySku.get(move.sku).push(move);
  }
  const onOrder = onOrderBySku(state);
  const rows = [];
  for (const [sku, list] of bySku) {
    const onHand = Math.round(list.reduce((s, m) => s + m.qty, 0) * 1000) / 1000;
    const first = list[0].date;
    const historyDays = daysBetween(first, today);
    const item = catalogue(state)[sku] || {};
    const supply = item.supply || {};
    const lead = Number.isInteger(supply.leadDays) ? supply.leadDays : DEFAULT_LEAD_DAYS;
    const pack = supply.pack || 1;
    const moq = supply.moq || 0;
    const ordered = onOrder.get(sku) || 0;
    const row = { sku, name: item.name || '', supplier: supply.supplier || '', cost: item.cost ?? null, onHand, onOrder: ordered, leadDays: lead, pack, moq, historyDays };
    if (historyDays < LONG_WINDOW) {
      rows.push({ ...row, status: 'not enough history', velocity7: null, velocity28: null, coverDays: null, orderQty: 0, why: `${historyDays} days of stock moves; needs ${LONG_WINDOW}.` });
      continue;
    }
    const d7 = inStockDays(list, addDays(today, -(SHORT_WINDOW - 1)), today, onHand);
    const d28 = inStockDays(list, addDays(today, -(LONG_WINDOW - 1)), today, onHand);
    const v7 = d7 > 0 ? demandOf(list, addDays(today, -(SHORT_WINDOW - 1)), today) / d7 : 0;
    const v28 = d28 > 0 ? demandOf(list, addDays(today, -(LONG_WINDOW - 1)), today) / d28 : 0;
    const stockoutV = Math.max(v7, v28);
    const buffer = Math.min(30, Math.max(7, Math.round(lead / 2)));
    if (stockoutV <= 0) {
      rows.push({ ...row, status: 'slow mover', velocity7: 0, velocity28: 0, coverDays: null, orderQty: 0, tiedUp: item.cost != null ? round2(onHand * item.cost) : null, why: `nothing sold in ${LONG_WINDOW} days${item.cost != null ? `; ₹${round2(onHand * item.cost).toLocaleString('en-IN')} tied up` : ''}.` });
      continue;
    }
    const coverDays = Math.round(((onHand + ordered) / stockoutV) * 10) / 10;
    let status;
    if (coverDays <= lead) status = 'too late';
    else if (coverDays <= lead + buffer) status = 'order now';
    else if (coverDays <= lead + buffer + 14) status = 'order soon';
    else if (coverDays > OVERSTOCK_DAYS) status = 'overstock';
    else status = 'fine';
    const wanted = Math.max(0, Math.ceil((SIZING_DAYS + lead) * v28 - onHand - ordered));
    const orderQty = status === 'fine' || status === 'overstock' ? 0 : Math.max(moq, Math.ceil(wanted / pack) * pack);
    const runsOut = addDays(today, Math.floor(coverDays));
    rows.push({
      ...row,
      status,
      velocity7: Math.round(v7 * 100) / 100,
      velocity28: Math.round(v28 * 100) / 100,
      coverDays,
      runsOut,
      orderQty,
      orderAmount: item.cost != null ? round2(orderQty * item.cost) : null,
      why: status === 'too late'
        ? `runs out around ${runsOut}, before an order placed today arrives (${lead} days).`
        : status === 'order now'
          ? `runs out around ${runsOut}; ordering today lands with ${Math.round(coverDays - lead)} days to spare.`
          : status === 'order soon'
            ? `runs out around ${runsOut}; order within ${Math.round(coverDays - lead - buffer)} days.`
            : status === 'overstock'
              ? `${Math.round(coverDays)} days of cover at the current rate.`
              : `${Math.round(coverDays)} days of cover.`,
    });
  }
  const order = { 'too late': 0, 'order now': 1, 'order soon': 2, fine: 3, overstock: 4, 'slow mover': 5, 'not enough history': 6 };
  rows.sort((a, b) => (order[a.status] - order[b.status]) || ((a.coverDays ?? 999) - (b.coverDays ?? 999)) || a.sku.localeCompare(b.sku));
  const toOrder = rows.filter((r) => r.orderQty > 0);
  return {
    ok: true,
    data: {
      asOf: today,
      rows,
      toOrder,
      orderTotal: toOrder.every((r) => r.orderAmount != null) ? round2(toOrder.reduce((s, r) => s + r.orderAmount, 0)) : null,
      seasonNote: moves.length && daysBetween(moves[0].date, today) < 365 ? 'Less than a year of stock moves, so festival peaks are not in the rate; if Diwali or a season is ahead, order more than this.' : '',
    },
  };
}

export function restockWords(d, money) {
  if (!d.rows.length) return 'No stock moves yet. Bring in marketplace orders or say "received 100 units of SKU-A" to start.';
  const lines = [];
  const named = (r) => `${r.sku}${r.name ? ` (${r.name})` : ''}`;
  for (const r of d.rows) {
    if (r.status === 'not enough history' || r.status === 'slow mover') lines.push(`· ${named(r)}: ${r.onHand} on hand, ${r.status}: ${r.why}`);
    else lines.push(`· ${named(r)}: ${r.onHand} on hand${r.onOrder ? ` + ${r.onOrder} on order` : ''}, selling ${r.velocity28} a day (${r.velocity7} this week), ${r.status}: ${r.why}${r.orderQty ? ` Order ${r.orderQty}${r.supplier ? ` from ${r.supplier}` : ''}${r.orderAmount != null ? ` (${money(r.orderAmount)})` : ''}.` : ''}`);
  }
  const head = d.toOrder.length ? `${d.toOrder.length === 1 ? '1 SKU' : `${d.toOrder.length} SKUs`} to order${d.orderTotal != null ? `, about ${money(d.orderTotal)}` : ''}:` : 'Nothing needs ordering.';
  const tail = d.seasonNote ? `\n${d.seasonNote}` : '';
  return `${head}\n${lines.join('\n')}${tail}${d.toOrder.length ? `\nSay "order ${d.toOrder[0].orderQty} of ${d.toOrder[0].sku}${d.toOrder[0].supplier ? ` from ${d.toOrder[0].supplier}` : ''}" to record a purchase order; nothing posts to the ledger until the bill comes.` : ''}`;
}
