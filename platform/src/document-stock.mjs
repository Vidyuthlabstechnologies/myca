import { planStock, recordStock } from './sku-margins.mjs';
import { costOfMovesBy, warningWords } from './inventory-costing.mjs';

const round4 = (value) => Math.round(Number(value || 0) * 10000) / 10000;

function skuOf(line) {
  return String(line?.sku == null ? '' : line.sku).trim().toUpperCase().slice(0, 64);
}

function catalogue(state) {
  return state.skus && typeof state.skus === 'object' ? state.skus : {};
}

export function withItemUnits(state, args) {
  if (!args || !Array.isArray(args.lines) || !args.lines.some((line) => skuOf(line))) return args;
  const items = catalogue(state);
  return { ...args, lines: args.lines.map((line) => {
    const sku = skuOf(line);
    const unit = sku && items[sku]?.unit;
    return unit && !String(line.unit ?? '').trim() ? { ...line, unit } : line;
  }) };
}

function tracked(state, sku) {
  return (state.stockMoves || []).some((move) => move.sku === sku);
}

function stockLines(state, args, kind) {
  return (Array.isArray(args?.lines) ? args.lines : []).map((line, index) => ({ line, index, sku: skuOf(line) })).filter((row) => row.sku && Number(row.line.qty) > 0 && (kind !== 'sale' || tracked(state, row.sku)));
}

export function documentStockPlan(state, args, kind) {
  const sale = kind === 'sale';
  const items = catalogue(state);
  const effects = [];
  const blockers = [];
  for (const { line, sku } of stockLines(state, args, kind)) {
    const qty = Number(line.qty);
    const planned = planStock(state, { sku, qty: sale ? -qty : qty, date: args.date, batch: line.batch, expiry: sale ? undefined : line.expiry, unitCost: sale ? undefined : Number(line.rate) });
    if (!planned.ok) {
      blockers.push(`${sku}: ${planned.hint || planned.error}`);
      continue;
    }
    const unit = String(line.unit || items[sku]?.unit || '').trim();
    effects.push(`${sale ? 'Stock out' : 'Stock in'}: ${qty}${unit ? ` ${unit}` : ''} of ${sku}${planned.plan.batch ? `, batch ${planned.plan.batch}` : ''}${planned.plan.expiry ? `, expiry ${planned.plan.expiry}` : ''}.`);
    for (const warning of planned.plan.warnings) effects.push(warningWords(warning));
  }
  return { blockers, effects };
}

export function moveDocumentStock(state, doc, args, kind) {
  const sale = kind === 'sale';
  const warnings = [];
  if (!doc || !Array.isArray(doc.lines)) return warnings;
  (Array.isArray(args?.lines) ? args.lines : []).forEach((line, index) => {
    const sku = skuOf(line);
    if (sku && doc.lines[index]) doc.lines[index].sku = sku;
  });
  for (const { line, index, sku } of stockLines(state, args, kind)) {
    const stored = doc.lines[index];
    if (!stored) continue;
    const qty = Number(line.qty);
    const unitCost = sale ? undefined : round4(Number(stored.taxable || 0) / qty);
    const moved = recordStock(state, { sku, qty: sale ? -qty : qty, date: doc.date, ref: doc.id, note: sale ? `Sold on ${doc.id}` : `Bought on ${doc.id}`, batch: line.batch, expiry: sale ? undefined : line.expiry, unitCost });
    if (!moved.ok) {
      warnings.push({ code: moved.error, sku });
      continue;
    }
    if (moved.move.batch) stored.batch = moved.move.batch;
    if (moved.move.expiry) stored.expiry = moved.move.expiry;
    warnings.push(...(moved.warnings || []));
  }
  return warnings;
}

export function returnDocumentStock(state, invoiceId, date, ref) {
  const outs = (state.stockMoves || []).filter((move) => move.ref === invoiceId && Number(move.qty) < 0 && /^Sold on /.test(String(move.note || '')));
  const back = [];
  for (const sku of [...new Set(outs.map((move) => move.sku))]) {
    const spent = costOfMovesBy(state, invoiceId, sku);
    for (const move of outs.filter((row) => row.sku === sku)) {
      const unitCost = spent && spent.qty > spent.uncosted ? round4(spent.cost / (spent.qty - spent.uncosted)) : undefined;
      const expiry = move.batch ? (state.stockMoves || []).find((row) => row.sku === sku && row.batch === move.batch && row.expiry && Number(row.qty) > 0)?.expiry : '';
      const moved = recordStock(state, { sku, qty: -Number(move.qty), date, location: move.location, ref, note: `Returned on cancelling ${invoiceId}`, ...(move.batch ? { batch: move.batch } : {}), ...(expiry ? { expiry } : {}), ...(unitCost != null ? { unitCost } : {}) });
      if (moved.ok) back.push(moved.move);
    }
  }
  return back;
}
