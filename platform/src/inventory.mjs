import { createAccounts, createTransfers, paise, TRANSFER_FLAGS } from './ledger.mjs';
import { localToday, postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
export const INVENTORY_ACCOUNT = 1300;
export const INVENTORY_CHANGE_ACCOUNT = 5005;
export const INVENTORY_ACCOUNTS = [
  { id: INVENTORY_ACCOUNT, code: '1300', name: 'Inventory', type: 'asset', flags: 0 },
  { id: INVENTORY_CHANGE_ACCOUNT, code: '5005', name: 'Change in inventory', type: 'expense', flags: 0 },
];

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function nextTransferId(state) {
  state.transferSeq = (state.transferSeq || 0) + 1;
  return state.transferSeq;
}

export function lastValuation(state) {
  const rows = Array.isArray(state.inventoryValuations) ? state.inventoryValuations : [];
  return rows.length ? rows[rows.length - 1] : null;
}

export function stockValueAt(state, asOf) {
  const costs = state.skus && typeof state.skus === 'object' ? state.skus : {};
  const qtyBySku = new Map();
  for (const move of state.stockMoves || []) {
    if (String(move.date || '') > asOf) continue;
    qtyBySku.set(move.sku, Math.round(((qtyBySku.get(move.sku) || 0) + Number(move.qty || 0)) * 1000) / 1000);
  }
  const lines = [];
  const uncosted = [];
  let value = 0;
  for (const [sku, qty] of [...qtyBySku.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (qty <= 0) continue;
    const cost = costs[sku]?.cost;
    if (cost == null) { uncosted.push({ sku, qty }); continue; }
    const amount = round2(qty * Number(cost));
    value = round2(value + amount);
    lines.push({ sku, qty, cost: Number(cost), value: amount });
  }
  return { asOf, value, lines, uncosted };
}

export function planInventoryValuation(state, args = {}) {
  const asOf = args.asOf == null || args.asOf === '' ? localToday() : postingDate(args.asOf);
  if (!asOf) return fail('INVALID_DATE', { asOf: args.asOf });
  if (asOf > localToday()) return fail('FUTURE_DATE', { asOf });
  if (isPeriodLocked(state, asOf)) return fail('PERIOD_LOCKED', { asOf, lockThrough: state.lockThrough });
  const previous = lastValuation(state);
  if (previous && previous.asOf >= asOf) return fail('NOT_AFTER_LAST', { asOf, lastAsOf: previous.asOf, hint: 'Each valuation is dated after the one before; the latest stands until the next.' });
  const stock = stockValueAt(state, asOf);
  if (!stock.lines.length && !stock.uncosted.length && !previous) return fail('NO_STOCK', { hint: 'Record stock and SKU costs first; a valuation posts the value of what is on hand.' });
  const before = previous ? previous.value : 0;
  const delta = round2(stock.value - before);
  return { ok: true, plan: { asOf, value: stock.value, before, delta, lines: stock.lines, uncosted: stock.uncosted, previousAsOf: previous ? previous.asOf : '' } };
}

export function valueInventory(state, args = {}) {
  const planned = planInventoryValuation(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  createAccounts(state.ledger, INVENTORY_ACCOUNTS);
  const seqBefore = state.transferSeq;
  const id = `INVVAL-${plan.asOf}`;
  const transferIds = [];
  if (Math.abs(plan.delta) >= 0.005) {
    const spec = plan.delta > 0
      ? { debitAccountId: INVENTORY_ACCOUNT, creditAccountId: INVENTORY_CHANGE_ACCOUNT, code: 'INVENTORY_UP' }
      : { debitAccountId: INVENTORY_CHANGE_ACCOUNT, creditAccountId: INVENTORY_ACCOUNT, code: 'INVENTORY_DOWN' };
    const posted = createTransfers(state.ledger, [{ id: nextTransferId(state), ...spec, amount: paise(Math.abs(plan.delta)), flags: TRANSFER_FLAGS.LINKED, invoiceId: id, userData: plan.asOf }]);
    if (!posted[0]?.ok) {
      state.transferSeq = seqBefore;
      return fail('LEDGER_REJECT', { posted });
    }
    transferIds.push(posted[0].id);
  }
  const record = { id, asOf: plan.asOf, value: plan.value, before: plan.before, delta: plan.delta, skus: plan.lines.length, uncosted: plan.uncosted.map((row) => row.sku), transferIds, recordedOn: localToday() };
  state.inventoryValuations = Array.isArray(state.inventoryValuations) ? state.inventoryValuations : [];
  state.inventoryValuations.push(record);
  return { ok: true, valuation: record, lines: plan.lines, uncosted: plan.uncosted };
}

export function listInventoryValuations(state) {
  const rows = Array.isArray(state.inventoryValuations) ? state.inventoryValuations : [];
  const latest = rows[rows.length - 1] || null;
  const now = stockValueAt(state, localToday());
  return { ok: true, data: { valuations: rows.slice(-24), latest, onHandNow: now.value, uncostedNow: now.uncosted.map((row) => row.sku), unposted: latest ? round2(now.value - latest.value) : now.value } };
}

export function valuationWords(result, money) {
  const v = result.valuation;
  const lines = [`Inventory at ${v.asOf}: ${money(v.value)} across ${v.skus === 1 ? '1 SKU' : `${v.skus} SKUs`} at recorded cost${v.before ? `, ${money(v.before)} before` : ''}. ${v.delta > 0 ? `Posted ${money(v.delta)} to Inventory against Change in inventory, so cost of goods this period falls by that much.` : v.delta < 0 ? `Posted ${money(-v.delta)} out of Inventory, so cost of goods this period rises by that much.` : 'No change to post.'}`];
  if (result.uncosted.length) lines.push(`Left out, no cost set: ${result.uncosted.map((row) => `${row.sku} (${row.qty})`).join(', ')}.`);
  return lines.join('\n');
}

export function valuationsWords(data, money) {
  if (!data.latest) return `No inventory valuation yet. Stock on hand is worth ${money(data.onHandNow)} at recorded cost${data.uncostedNow.length ? ` (${data.uncostedNow.length} ${data.uncostedNow.length === 1 ? 'SKU has' : 'SKUs have'} no cost)` : ''}; say "value inventory" to post it to the books.`;
  return `Inventory last valued ${data.latest.asOf} at ${money(data.latest.value)}; on hand now ${money(data.onHandNow)}${Math.abs(data.unposted) >= 0.005 ? `, ${money(Math.abs(data.unposted))} ${data.unposted > 0 ? 'more' : 'less'} than posted` : ', unchanged'}.${data.uncostedNow.length ? ` ${data.uncostedNow.length === 1 ? '1 SKU has' : `${data.uncostedNow.length} SKUs have`} no cost: ${data.uncostedNow.slice(0, 6).join(', ')}.` : ''}`;
}
