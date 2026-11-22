import { planInvoice, createInvoice, fyCodeOf, planReceipt, recordReceipt } from './invoice.mjs';
import { cancelInvoice, outstandingOf } from './credit-notes.mjs';
import { setSkuCost, skus } from './sku-margins.mjs';
import { isPeriodLocked, lockThrough } from './period-lock.mjs';
import { localToday, postingDate } from './dates.mjs';
import { rules } from './sprint-load.mjs';
import { formatMoneyCurrent } from './country.mjs';
import { OFFLINE_DEVICE_ID_PATTERN, MAX_OFFLINE_ENTRIES } from './tool-schema-parts.mjs';

export const OFFLINE_TOOLS = Object.freeze(['offline_kit', 'register_offline_device', 'post_offline_sales']);
export const OPEN_INVOICES_IN_KIT = 300;
export { MAX_OFFLINE_ENTRIES };

const KIT_VERSION = 1;
const SERIES_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const FIRST_SERIES_LETTER = SERIES_LETTERS.indexOf('M');
const SERIES_COUNT = (SERIES_LETTERS.length - FIRST_SERIES_LETTER) * SERIES_LETTERS.length;
const DEVICE_ID = new RegExp(OFFLINE_DEVICE_ID_PATTERN);
const FIGURE_KEYS = ['taxable', 'cgst', 'sgst', 'igst', 'total'];
const NOT_OFFLINE_STATES = new Set(['96']);
const UNREGISTERED_HINT = 'This phone is not registered for offline billing. Open the app online once so it gets its own invoice series, then sync again.';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const paiseOf = (value) => Math.round(Number(value || 0) * 100);
const money = (amount) => formatMoneyCurrent(amount);

function seriesList(state) {
  return Array.isArray(state.offlineSeries) ? state.offlineSeries : [];
}

function cleanDeviceId(value) {
  const id = String(value == null ? '' : value).trim();
  return DEVICE_ID.test(id) ? id : '';
}

function cleanDeviceName(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, 60) || 'Phone';
}

export function seriesCodeAt(index) {
  if (!Number.isInteger(index) || index < 0 || index >= SERIES_COUNT) return '';
  return `${SERIES_LETTERS[FIRST_SERIES_LETTER + Math.floor(index / SERIES_LETTERS.length)]}${SERIES_LETTERS[index % SERIES_LETTERS.length]}`;
}

function nextSeriesCode(state) {
  const taken = new Set(seriesList(state).map((series) => series.code));
  for (let index = 0; index < SERIES_COUNT; index += 1) {
    const code = seriesCodeAt(index);
    if (!taken.has(code)) return code;
  }
  return '';
}

function seriesOfDevice(state, deviceId) {
  return seriesList(state).find((series) => series.deviceId === deviceId) || null;
}

function seriesView(series) {
  if (!series) return null;
  return { code: series.code, deviceId: series.deviceId, deviceName: series.deviceName, lastNumberByFy: { ...(series.lastNumberByFy || {}) } };
}

export function offlineInvoicePattern(code, fy) {
  return new RegExp(`^INV-${code}${fy}-([0-9]{4,})$`);
}

function firstNumber(code, date) {
  return `INV-${code}${fyCodeOf(date)}-0001`;
}

export function einvoiceB2b(state) {
  const company = state.company || {};
  if (String(company.country || 'IN').toUpperCase() !== 'IN') return false;
  if (!String(company.gstin || '').trim() || company.composition === true) return false;
  if (company.einvoice === true) return true;
  return (state.invoices || []).some((invoice) => String(invoice.irn || '').trim() && String(invoice.partyGstin || '').trim());
}

function buyerDetailsRule(state, today) {
  const found = rules.rule('gst.invoice.unregistered-buyer-details', today);
  if (!found.ok) return null;
  const company = state.company || {};
  return { taxablePaiseAtLeast: found.value.taxableValuePaiseAtLeast, rule: found.record.id, applies: Boolean(String(company.gstin || '').trim()) && company.composition !== true };
}

function onHandBySku(state) {
  const held = new Map();
  for (const move of state.stockMoves || []) held.set(move.sku, Math.round(((held.get(move.sku) || 0) + Number(move.qty || 0)) * 1000) / 1000);
  return held;
}

function kitItem(sku, item, onHand) {
  return { sku, name: item?.name || sku, barcode: item?.barcode || '', hsn: item?.hsn || '', gstRate: item?.gstRate ?? null, price: item?.price ?? null, unit: item?.unit || '', onHand: onHand ?? 0 };
}

export function offlineKit(state, args = {}) {
  const deviceId = cleanDeviceId(args.deviceId);
  if (!deviceId) return { ok: false, error: 'BAD_DEVICE_ID', hint: 'The phone sends its own device id, 8 to 64 letters, digits, - or _.' };
  const company = state.company || {};
  const today = localToday();
  const held = onHandBySku(state);
  const all = skus(state);
  const items = Object.keys(all).sort().map((sku) => kitItem(sku, all[sku], held.get(sku)));
  const parties = (state.parties || []).map((party) => ({ name: party.name, gstin: party.gstin || '', state: party.state || '', address: party.address || '' }));
  const openInvoices = (state.invoices || [])
    .filter((invoice) => invoice.status !== 'cancelled' && invoice.country !== 'US')
    .map((invoice) => ({ invoice, due: outstandingOf(state, invoice) }))
    .filter((row) => row.due > 0.005)
    .sort((a, b) => String(b.invoice.date).localeCompare(String(a.invoice.date)) || String(b.invoice.id).localeCompare(String(a.invoice.id)))
    .slice(0, OPEN_INVOICES_IN_KIT)
    .map(({ invoice, due }) => ({ id: invoice.id, date: invoice.date, partyName: invoice.partyName, partyGstin: invoice.partyGstin || '', total: invoice.total, due }));
  return {
    ok: true,
    data: {
      version: KIT_VERSION,
      generatedAt: new Date().toISOString(),
      today,
      company: { name: company.name || '', gstin: company.gstin || '', state: company.state || '', composition: company.composition === true, address: company.address || '' },
      lockThrough: lockThrough(state),
      einvoiceB2b: einvoiceB2b(state),
      buyerDetails: buyerDetailsRule(state, today),
      items,
      parties,
      openInvoices,
      series: seriesView(seriesOfDevice(state, deviceId)),
    },
  };
}

export function planOfflineDevice(state, args = {}) {
  const deviceId = cleanDeviceId(args.deviceId);
  if (!deviceId) return { ok: false, error: 'BAD_DEVICE_ID', hint: 'The phone sends its own device id, 8 to 64 letters, digits, - or _.' };
  const existing = seriesOfDevice(state, deviceId);
  if (existing) return { ok: true, existing, series: existing };
  const code = nextSeriesCode(state);
  if (!code) return { ok: false, error: 'SERIES_EXHAUSTED', hint: `All ${SERIES_COUNT} offline series are in use.` };
  return { ok: true, existing: null, series: { code, deviceId, deviceName: cleanDeviceName(args.deviceName), registeredAt: '', lastNumberByFy: {} } };
}

export function registerOfflineDevice(state, args = {}) {
  const planned = planOfflineDevice(state, args);
  if (!planned.ok) return planned;
  if (planned.existing) return { ok: true, series: seriesView(planned.existing), created: false };
  const series = { ...planned.series, registeredAt: new Date().toISOString() };
  state.offlineSeries = [...seriesList(state), series];
  return { ok: true, series: seriesView(series), created: true };
}

function entryCount(args) {
  return ['sales', 'receipts', 'items'].reduce((sum, key) => sum + (Array.isArray(args[key]) ? args[key].length : 0), 0);
}

function batchProblem(state, args) {
  const deviceId = cleanDeviceId(args.deviceId);
  if (!deviceId) return { ok: false, error: 'BAD_DEVICE_ID', hint: 'The phone sends its own device id, 8 to 64 letters, digits, - or _.' };
  const series = seriesOfDevice(state, deviceId);
  if (!series) return { ok: false, error: 'UNKNOWN_DEVICE', deviceId, hint: UNREGISTERED_HINT };
  const count = entryCount(args);
  if (!count) return { ok: false, error: 'NOTHING_TO_SYNC' };
  if (count > MAX_OFFLINE_ENTRIES) return { ok: false, error: 'TOO_MANY_ENTRIES', count, max: MAX_OFFLINE_ENTRIES, hint: `Send at most ${MAX_OFFLINE_ENTRIES} bills, receipts and items in one sync.` };
  return { ok: true, series };
}

function figuresOf(figures) {
  return { taxable: round2(figures.taxable), cgst: round2(figures.cgst), sgst: round2(figures.sgst), igst: round2(figures.igst), total: round2(figures.total) };
}

function engineLines(figures) {
  return figures.lines.map((line) => ({ taxable: line.taxable, cgst: line.cgst, sgst: line.sgst, igst: line.igst, tax: line.tax, amount: line.amount }));
}

function figuresDiffer(engine, printed) {
  if (!printed || typeof printed !== 'object') return true;
  return FIGURE_KEYS.some((key) => !Number.isFinite(Number(printed[key])) || paiseOf(engine[key]) !== paiseOf(printed[key]));
}

function notOfflineHint(state, sale) {
  if (sale.exportSale) return 'An export needs the exchange rate and shipping details that only the server takes. Bill it online.';
  if (String(sale.supplyType || '').trim()) return 'A supply to an SEZ or a deemed export needs the server. Bill it online.';
  if (NOT_OFFLINE_STATES.has(String(sale.partyState || '').trim())) return 'A sale to a buyer outside India needs the server. Bill it online.';
  if ((sale.lines || []).some((line) => Number(line?.cessRate || 0) > 0 || Number(line?.cessPerUnit || 0) > 0)) return 'A line with compensation cess needs the server. Bill it online.';
  if (String(sale.partyGstin || '').trim() && einvoiceB2b(state)) return 'This business issues e-invoices, so a sale to a registered buyer needs an IRN from the server before it is given out. Bill it online.';
  return '';
}

const REJECT_HINTS = {
  INVALID_DATE: 'The bill has a date MyCA cannot read.',
  INVALID_GSTIN: 'The buyer\'s GSTIN is not valid. Correct the GSTIN and sync again.',
  BAD_LINE: 'A line has a quantity, rate or GST rate MyCA cannot use.',
  ZERO_AMOUNT: 'The bill adds up to nothing.',
  NO_LINES: 'The bill has no lines.',
  RATE_REQUIRED: 'A line has no GST rate.',
  SETUP_REQUIRED: 'Finish setting up the business on MyCA first.',
  INVOICE_NOT_FOUND: 'MyCA does not have that bill yet. Sync the bill first, then the receipt.',
  INVOICE_CANCELLED: 'That bill is cancelled, so nothing can be received against it.',
  BEFORE_INVOICE: 'A receipt cannot be dated before its bill.',
  BAD_AMOUNT: 'The amount must be more than zero.',
  BAD_RATE: 'MyCA keeps an item\'s GST rate between 0 and 28.',
  BAD_BARCODE: 'A barcode is 4 to 32 letters, digits or -.',
  BARCODE_IN_USE: 'Another item already has this barcode.',
  CREDIT_NOTE_TIME_BARRED: 'The time to cancel this bill by a credit note has passed. Ask your CA.',
  PARTLY_CREDITED: 'Part of this bill is already credited, so it cannot be cancelled in full. Issue a credit note for the rest on the server.',
};

function lockedHint(state) {
  return `The books are locked through ${lockThrough(state)}. Ask the owner to unlock that period on MyCA, then sync again.`;
}

function failure(state, result, extra = {}) {
  const error = String(result.error || 'NOT_POSTED');
  if (error === 'OVERPAYMENT') return { status: 'conflict', error, due: round2(result.due), hint: `Only ${money(result.due)} is due on this bill.`, ...extra };
  const hint = error === 'PERIOD_LOCKED' ? lockedHint(state) : result.hint || REJECT_HINTS[error] || `MyCA could not post this (${error.toLowerCase().replace(/_/g, ' ')}). Fix it on MyCA and sync again.`;
  return { status: 'rejected', error, hint, ...extra };
}

function bumpSeries(series, id, date) {
  const found = offlineInvoicePattern(series.code, fyCodeOf(date)).exec(id);
  if (!found) return;
  const fy = fyCodeOf(date);
  series.lastNumberByFy = series.lastNumberByFy && typeof series.lastNumberByFy === 'object' ? series.lastNumberByFy : {};
  series.lastNumberByFy[fy] = Math.max(Number(series.lastNumberByFy[fy] || 0), Number(found[1]));
}

function receiptByRef(state, ref) {
  for (const invoice of state.invoices || []) {
    if ((invoice.receipts || []).some((receipt) => receipt.offlineRef === ref)) return invoice;
  }
  return null;
}

function takeReceipt(state, { invoiceId, amount, date, mode, ref, deviceId }) {
  const planned = planReceipt(state, { invoiceId, amount, date, mode });
  if (!planned.ok) return planned;
  const recorded = recordReceipt(state, { invoiceId, amount, date, mode });
  if (!recorded.ok) return recorded;
  const receipts = recorded.invoice.receipts;
  Object.assign(receipts[receipts.length - 1], { offlineRef: ref, source: 'offline', deviceId });
  return { ok: true, invoice: recorded.invoice };
}

function voidDate(sale, invoice) {
  const said = postingDate(String(sale.voided?.at || '').slice(0, 10));
  return said && said >= invoice.date ? said : invoice.date;
}

function applyParts(state, invoice, sale, series, status) {
  const out = { status, id: invoice.id };
  if (sale.voided) {
    if (invoice.status !== 'cancelled') {
      const cancelled = cancelInvoice(state, { invoiceId: invoice.id, date: voidDate(sale, invoice), reason: String(sale.voided.reason || '').trim().slice(0, 200) || 'Voided at the counter' });
      if (!cancelled.ok) return { ...out, ...failure(state, cancelled, { part: 'void' }) };
    }
    const notes = invoice.creditNoteIds || [];
    return { ...out, creditNoteId: notes[notes.length - 1] || '' };
  }
  if (sale.payment && !(invoice.receipts || []).some((receipt) => receipt.offlineRef === sale.ref)) {
    const paid = takeReceipt(state, { invoiceId: invoice.id, amount: sale.payment.amount, date: invoice.date, mode: sale.payment.mode, ref: sale.ref, deviceId: series.deviceId });
    if (!paid.ok) return { ...out, ...failure(state, paid, { part: 'payment' }) };
  }
  return out;
}

function saleInput(sale, id, date) {
  return {
    id,
    date,
    partyName: String(sale.partyName ?? '').trim(),
    partyGstin: String(sale.partyGstin ?? '').trim().toUpperCase(),
    ...(String(sale.partyState ?? '').trim() ? { partyState: String(sale.partyState).trim() } : {}),
    ...(String(sale.partyAddress ?? '').trim() ? { partyAddress: String(sale.partyAddress).trim() } : {}),
    lines: (sale.lines || []).map((line) => ({
      description: String(line.description ?? '').trim() || 'Item',
      ...(line.hsn != null ? { hsn: String(line.hsn) } : {}),
      qty: line.qty,
      ...(line.unit != null ? { unit: String(line.unit) } : {}),
      rate: line.rate,
      gstRate: line.gstRate,
    })),
  };
}

function postSale(state, series, sale, syncedAt) {
  const ref = String(sale.ref || '');
  const base = { ref, kind: 'sale' };
  const known = (state.invoices || []).find((invoice) => invoice.offline?.ref === ref);
  if (known) {
    bumpSeries(series, known.id, known.date);
    return { ...base, ...applyParts(state, known, sale, series, 'already') };
  }
  const id = String(sale.id || '').trim().toUpperCase();
  const date = postingDate(sale.date);
  if (!date) return { ...base, ...failure(state, { error: 'INVALID_DATE' }, { id }) };
  if (!offlineInvoicePattern(series.code, fyCodeOf(date)).test(id) || /-0+$/.test(id)) {
    return { ...base, status: 'rejected', error: 'WRONG_SERIES', id, hint: `This phone numbers its bills dated ${date} as ${firstNumber(series.code, date)} onwards.` };
  }
  const offline = notOfflineHint(state, sale);
  if (offline) return { ...base, status: 'rejected', error: 'NOT_OFFLINE', id, hint: offline };
  if (isPeriodLocked(state, date)) return { ...base, status: 'rejected', error: 'PERIOD_LOCKED', id, hint: lockedHint(state) };
  if ((state.invoices || []).some((invoice) => invoice.id === id)) {
    bumpSeries(series, id, date);
    return { ...base, status: 'conflict', error: 'NUMBER_TAKEN', id, hint: `Another bill is already numbered ${id}. Give this bill the next free number on the phone and sync again.` };
  }
  const input = saleInput(sale, id, date);
  const planned = planInvoice(state, input);
  if (!planned.ok) return { ...base, ...failure(state, planned, { id }) };
  const engine = { ...figuresOf(planned.figures), lines: engineLines(planned.figures) };
  const printed = sale.printed && typeof sale.printed === 'object' ? Object.fromEntries(FIGURE_KEYS.map((key) => [key, sale.printed[key]])) : null;
  if (sale.acceptEngineFigures !== true && figuresDiffer(engine, printed)) {
    return { ...base, status: 'conflict', error: 'FIGURES_DIFFER', id, engine, printed, hint: 'MyCA works out different GST or totals for this bill. Check the bill, then keep MyCA\'s figures to post it.' };
  }
  const created = createInvoice(state, input);
  if (!created.ok) return { ...base, ...failure(state, created, { id }) };
  const invoice = created.invoice;
  invoice.source = 'offline';
  invoice.offline = { ref, deviceId: series.deviceId, createdAt: String(sale.createdAt || '').slice(0, 40), syncedAt };
  (sale.lines || []).forEach((line, index) => {
    const sku = String(line.sku ?? '').trim().toUpperCase().slice(0, 64);
    if (sku && invoice.lines[index]) invoice.lines[index].sku = sku;
  });
  bumpSeries(series, id, date);
  return { ...base, ...applyParts(state, invoice, sale, series, 'posted'), engine };
}

function postReceipt(state, series, receipt) {
  const ref = String(receipt.ref || '');
  const base = { ref, kind: 'receipt' };
  const invoiceId = String(receipt.invoiceId || '').trim().toUpperCase();
  const known = receiptByRef(state, ref);
  if (known) return { ...base, status: 'already', id: known.id, due: outstandingOf(state, known) };
  const taken = takeReceipt(state, { invoiceId, amount: receipt.amount, date: receipt.date, mode: receipt.mode, ref, deviceId: series.deviceId });
  if (!taken.ok) return { ...base, ...failure(state, taken, { id: invoiceId }) };
  return { ...base, status: 'posted', id: invoiceId, due: outstandingOf(state, taken.invoice) };
}

function sameItem(current, item) {
  if (String(current.name || '') !== String(item.name ?? '').trim().slice(0, 120)) return false;
  if (paiseOf(current.price) !== paiseOf(item.price) || current.price == null) return false;
  if (Number(current.gstRate) !== Number(item.gstRate) || current.gstRate == null) return false;
  if (item.hsn != null && String(current.hsn || '') !== String(item.hsn).trim().slice(0, 8)) return false;
  if (item.barcode != null && String(current.barcode || '') !== String(item.barcode).replace(/\s/g, '').slice(0, 32)) return false;
  return true;
}

function postItem(state, series, item, held) {
  const ref = String(item.ref || '');
  const sku = String(item.sku ?? '').trim().toUpperCase().slice(0, 64);
  const base = { ref, kind: 'item', id: sku };
  const all = skus(state);
  const current = sku && Object.hasOwn(all, sku) ? all[sku] : null;
  if (current) {
    if (current.offlineRef === ref || sameItem(current, item)) return { ...base, status: 'already' };
    return { ...base, status: 'conflict', error: 'ITEM_CHANGED', item: kitItem(sku, current, held.get(sku)), hint: `MyCA already has ${sku} with other details; MyCA's are kept. Use them on the phone.` };
  }
  const saved = setSkuCost(state, { sku, name: item.name, price: item.price, gstRate: item.gstRate, ...(item.hsn != null ? { hsn: item.hsn } : {}), ...(item.barcode != null ? { barcode: item.barcode } : {}) });
  if (!saved.ok) return { ...base, ...failure(state, saved) };
  state.skus[saved.sku].offlineRef = ref;
  state.skus[saved.sku].source = 'offline';
  return { ...base, id: saved.sku, status: 'posted' };
}

export function postOfflineSales(state, args = {}) {
  const checked = batchProblem(state, args);
  if (!checked.ok) return checked;
  const { series } = checked;
  const syncedAt = new Date().toISOString();
  const held = onHandBySku(state);
  const results = [];
  for (const item of args.items || []) results.push(postItem(state, series, item, held));
  for (const sale of args.sales || []) results.push(postSale(state, series, sale, syncedAt));
  for (const receipt of args.receipts || []) results.push(postReceipt(state, series, receipt));
  const counts = { posted: 0, already: 0, conflict: 0, rejected: 0 };
  for (const result of results) counts[result.status] += 1;
  return { ok: true, series: seriesView(series), results, counts };
}

function plural(count, one, many) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function offlineDevicePreview(state, args = {}) {
  const planned = planOfflineDevice(state, args);
  if (!planned.ok) return { blockers: [planned.hint], summary: '', effects: [], figures: {} };
  const { series, existing } = planned;
  if (existing) return { blockers: [], summary: `${existing.deviceName} already bills offline as series ${existing.code}; nothing changes.`, effects: [], figures: { code: existing.code } };
  return {
    blockers: [],
    summary: `Give ${series.deviceName} its own invoice series ${series.code}: bills made without a connection are numbered ${firstNumber(series.code, localToday())} onwards.`,
    effects: ['The main invoice series is untouched; each phone has a series of its own, so no two bills share a number.'],
    figures: { code: series.code },
  };
}

export function offlineSalesPreview(state, args = {}) {
  const checked = batchProblem(state, args);
  if (!checked.ok) {
    const words = { UNKNOWN_DEVICE: UNREGISTERED_HINT, NOTHING_TO_SYNC: 'There is nothing to sync.' };
    return { blockers: [words[checked.error] || checked.hint || checked.error], summary: '', effects: [], figures: {} };
  }
  const sales = args.sales || [];
  const receipts = args.receipts || [];
  const items = args.items || [];
  const totalPaise = sales.reduce((sum, sale) => sum + paiseOf(sale.printed?.total), 0);
  const others = [];
  if (receipts.length) others.push(plural(receipts.length, 'receipt', 'receipts'));
  if (items.length) others.push(plural(items.length, 'new item', 'new items'));
  const name = checked.series.deviceName;
  const summary = sales.length
    ? `Sync ${plural(sales.length, 'offline bill', 'offline bills')} from ${name} totalling ${money(totalPaise / 100)}${others.length ? `, and ${others.join(' and ')}` : ''}.`
    : `Sync ${others.join(' and ')} from ${name}.`;
  return {
    blockers: [],
    summary,
    effects: ['Each entry is checked and posted on its own; one already in the books is not posted again.', 'MyCA works out the GST again and posts a bill only when its figures match what was printed.'],
    figures: { sales: sales.length, receipts: receipts.length, items: items.length, total: totalPaise / 100 },
  };
}

export function offlineWords(name, result) {
  if (name === 'offline_kit' && result.data) {
    const kit = result.data;
    return `Offline kit${kit.series ? ` for series ${kit.series.code}` : ''}: ${plural(kit.items.length, 'item', 'items')}, ${plural(kit.parties.length, 'party', 'parties')}, ${plural(kit.openInvoices.length, 'open invoice', 'open invoices')}.`;
  }
  if (name === 'register_offline_device' && result.series) {
    return `${result.series.deviceName} ${result.created ? 'now bills' : 'already bills'} offline as series ${result.series.code}.`;
  }
  if (name === 'post_offline_sales' && result.results) {
    const { counts } = result;
    const needs = result.results.filter((row) => row.status === 'conflict' || row.status === 'rejected');
    const parts = [`${counts.posted} posted`];
    if (counts.already) parts.push(`${counts.already} already in the books`);
    if (needs.length) parts.push(`${needs.length} need${needs.length === 1 ? 's' : ''} you (${needs.slice(0, 5).map((row) => `${row.id || row.ref}: ${row.error}`).join('; ')})`);
    return `Offline sync from ${result.series.deviceName}: ${parts.join(', ')}.`;
  }
  return '';
}
