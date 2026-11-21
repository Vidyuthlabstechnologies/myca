import { createHash } from 'node:crypto';
import { appendAuditEvent } from './ca-api.mjs';
import { salaryPrivate } from './employees.mjs';
import { createQuote, planQuote } from './quotes.mjs';
import { countryOf } from './country.mjs';
import { localToday } from './dates.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;
export const RESERVED_SLUGS = new Set(['admin', 'administrator', 'api', 'app', 'apps', 'assets', 'auth', 'billing', 'blog', 'cart', 'checkout', 'dashboard', 'docs', 'download', 'help', 'home', 'index', 'login', 'logout', 'myca', 'new', 'null', 'official', 'orders', 'privacy', 'root', 'security', 'settings', 'shop', 'signin', 'signup', 'static', 'status', 'store', 'support', 'system', 'terms', 'test', 'undefined', 'v1', 'v2', 'www']);
export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QTY = 999;
export const MAX_OPEN_ORDERS = 200;
export const MAX_ITEMS_PER_CALL = 200;
export const ORDER_STATUSES = ['new', 'accepted', 'declined', 'fulfilled'];
const ORDER_ACTIONS = { accept: 'accepted', decline: 'declined', fulfil: 'fulfilled' };
const LIMITS = { storeName: 80, description: 300, address: 200, city: 60, itemDescription: 200, category: 40, buyerName: 80, note: 300 };
const SETTING_FLAGS = ['enabled', 'showPrices', 'showStock', 'showGstin'];
const SETTING_TEXTS = ['storeName', 'description', 'address', 'city'];
const ORDER_KEYS = new Set(['buyerName', 'buyerPhone', 'note', 'lines']);
const LINE_KEYS = new Set(['id', 'qty']);

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function inIndia(state) {
  return countryOf(state) === 'IN';
}

function skusOf(state) {
  return state.skus && typeof state.skus === 'object' ? state.skus : {};
}

function catalogueOf(state) {
  const found = state.catalogue && typeof state.catalogue === 'object' ? state.catalogue : {};
  return {
    settings: { enabled: false, storeName: '', description: '', whatsapp: '', address: '', city: '', showPrices: true, showStock: false, showGstin: false, slug: '', ...(found.settings || {}) },
    items: found.items && typeof found.items === 'object' ? found.items : {},
    orders: Array.isArray(found.orders) ? found.orders : [],
    orderSeq: Number(found.orderSeq || 0),
    link: found.link && typeof found.link === 'object' ? found.link : { slug: '' },
  };
}

function ensureCatalogue(state) {
  const current = catalogueOf(state);
  state.catalogue = { ...(state.catalogue || {}), ...current };
  return state.catalogue;
}

function actorOf(state) {
  return state.__actor?.userId || 'owner';
}

function audit(state, action, metadata) {
  appendAuditEvent(state, { actorId: actorOf(state), action, clientId: String(state.activeClientId || 'SELF'), metadata });
}

export function normalizeSlug(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

export function slugProblem(value) {
  const slug = normalizeSlug(value);
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.includes('--')) return 'BAD_SLUG';
  if (RESERVED_SLUGS.has(slug)) return 'SLUG_RESERVED';
  return null;
}

export function slugFromName(name) {
  let slug = String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SLUG_MAX).replace(/-+$/g, '');
  if (slug.length < SLUG_MIN) slug = slug ? `${slug}-shop` : 'my-shop';
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-shop`;
  return slug;
}

export function desiredSlug(state) {
  const { settings } = catalogueOf(state);
  return settings.slug || slugFromName(settings.storeName || state.company?.name || '');
}

export function indianMobile(value) {
  let digits = String(value == null ? '' : value).replace(/[\s()-]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9][0-9]{9}$/.test(digits) ? digits : '';
}

export function itemId(sku) {
  return createHash('sha256').update(`myca-store-item:${sku}`).digest('hex').slice(0, 16);
}

export function planCatalogueSettings(state, args = {}) {
  if (!inIndia(state)) return fail('INDIA_ONLY');
  const { settings: before } = catalogueOf(state);
  const next = { ...before };
  const changed = [];
  for (const key of SETTING_FLAGS) {
    if (args[key] == null) continue;
    if (typeof args[key] !== 'boolean') return fail('BAD_FLAG', { field: key });
    if (next[key] !== args[key]) changed.push(key);
    next[key] = args[key];
  }
  for (const key of SETTING_TEXTS) {
    if (args[key] == null) continue;
    const value = cleanText(args[key], LIMITS[key]);
    if (next[key] !== value) changed.push(key);
    next[key] = value;
  }
  if (args.whatsapp != null) {
    const given = String(args.whatsapp).trim();
    const phone = given ? indianMobile(given) : '';
    if (given && !phone) return fail('BAD_WHATSAPP');
    if (next.whatsapp !== phone) changed.push('whatsapp');
    next.whatsapp = phone;
  }
  if (args.slug != null) {
    const slug = normalizeSlug(args.slug);
    const problem = slug ? slugProblem(slug) : null;
    if (problem) return fail(problem, { slug });
    if (next.slug !== slug) changed.push('slug');
    next.slug = slug;
  }
  if (!next.storeName) next.storeName = cleanText(state.company?.name, LIMITS.storeName);
  if (next.enabled && !next.storeName) return fail('STORE_NAME_REQUIRED');
  if (next.enabled && !next.whatsapp) return fail('WHATSAPP_REQUIRED');
  if (!changed.length) return fail('NOTHING_TO_CHANGE');
  return { ok: true, plan: { before, next, changed, slug: next.slug || slugFromName(next.storeName) } };
}

export function setCatalogueSettings(state, args = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner can change the online store.' });
  const planned = planCatalogueSettings(state, args);
  if (!planned.ok) return planned;
  const catalogue = ensureCatalogue(state);
  catalogue.settings = planned.plan.next;
  audit(state, 'catalogue.settings_changed', { changed: planned.plan.changed, enabled: planned.plan.next.enabled });
  return { ok: true, settings: planned.plan.next, changed: planned.plan.changed, slug: planned.plan.slug };
}

export function planCatalogueItems(state, args = {}) {
  if (!inIndia(state)) return fail('INDIA_ONLY');
  const rows = Array.isArray(args.items) ? args.items : [];
  if (!rows.length) return fail('NO_ITEMS');
  if (rows.length > MAX_ITEMS_PER_CALL) return fail('TOO_MANY_ITEMS', { max: MAX_ITEMS_PER_CALL });
  const all = skusOf(state);
  const { items } = catalogueOf(state);
  const changes = [];
  const seen = new Set();
  for (const row of rows) {
    const sku = String(row?.sku == null ? '' : row.sku).trim().toUpperCase().slice(0, 64);
    if (!sku) return fail('SKU_REQUIRED');
    if (!Object.hasOwn(all, sku)) return fail('SKU_NOT_FOUND', { sku });
    if (seen.has(sku)) return fail('DUPLICATE_SKU', { sku });
    seen.add(sku);
    const before = Object.hasOwn(items, sku) ? items[sku] : { published: false, description: '', category: '' };
    const next = {
      published: row.published == null ? Boolean(before.published) : row.published === true,
      description: row.description == null ? before.description || '' : cleanText(row.description, LIMITS.itemDescription),
      category: row.category == null ? before.category || '' : cleanText(row.category, LIMITS.category),
    };
    changes.push({ sku, name: all[sku]?.name || sku, before, next });
  }
  return { ok: true, plan: { changes, published: changes.filter((c) => c.next.published).length, hidden: changes.filter((c) => !c.next.published).length } };
}

export function setCatalogueItems(state, args = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner can change the online store.' });
  const planned = planCatalogueItems(state, args);
  if (!planned.ok) return planned;
  const catalogue = ensureCatalogue(state);
  const items = { ...catalogue.items };
  for (const change of planned.plan.changes) items[change.sku] = change.next;
  catalogue.items = items;
  audit(state, 'catalogue.items_changed', { skus: planned.plan.changes.map((c) => c.sku), published: planned.plan.published, hidden: planned.plan.hidden });
  return { ok: true, changed: planned.plan.changes.length, published: planned.plan.published, hidden: planned.plan.hidden };
}

function stockBySku(state) {
  const onHand = new Map();
  for (const move of state.stockMoves || []) onHand.set(move.sku, Math.round(((onHand.get(move.sku) || 0) + Number(move.qty || 0)) * 1000) / 1000);
  return onHand;
}

function rupeeWords(amount) {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function inclusivePrice(price, gstRate) {
  if (price == null || gstRate == null || !Number.isFinite(Number(price)) || !Number.isFinite(Number(gstRate))) return null;
  return round2((Number(price) * (100 + Number(gstRate))) / 100);
}

export function publicCatalogue(state) {
  if (!inIndia(state)) return { enabled: false };
  const { settings, items } = catalogueOf(state);
  if (!settings.enabled) return { enabled: false };
  const all = skusOf(state);
  const stock = settings.showStock ? stockBySku(state) : null;
  const listed = [];
  for (const sku of Object.keys(items).sort()) {
    const entry = items[sku];
    if (!entry?.published || !Object.hasOwn(all, sku)) continue;
    const item = all[sku] || {};
    const row = { id: itemId(sku), name: cleanText(item.name || sku, 120), category: entry.category || '', description: entry.description || '' };
    if (settings.showPrices) {
      const price = inclusivePrice(item.price, item.gstRate);
      row.price = price;
      row.priceWords = price == null ? 'Price on request' : `${rupeeWords(price)} incl. GST`;
    }
    if (stock && stock.has(sku)) row.inStock = stock.get(sku) > 0;
    listed.push(row);
  }
  listed.sort((a, b) => Number(!a.category) - Number(!b.category) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const company = state.company || {};
  const store = { name: settings.storeName || cleanText(company.name, LIMITS.storeName), description: settings.description, city: settings.city, address: settings.address, whatsapp: settings.whatsapp ? `91${settings.whatsapp}` : '' };
  if (settings.showGstin && company.gstin) store.gstin = String(company.gstin).toUpperCase();
  return {
    enabled: true,
    store,
    showPrices: Boolean(settings.showPrices),
    showStock: Boolean(settings.showStock),
    currency: 'INR',
    priceNote: settings.showPrices ? 'Prices include GST. The shop confirms the final bill.' : 'Ask the shop for prices.',
    categories: [...new Set(listed.map((row) => row.category).filter(Boolean))],
    items: listed,
  };
}

export function catalogueView(state) {
  if (!inIndia(state)) return fail('INDIA_ONLY');
  const { settings, items, orders, link } = catalogueOf(state);
  const all = skusOf(state);
  const stock = stockBySku(state);
  const rows = Object.keys(all).sort().map((sku) => {
    const item = all[sku] || {};
    const entry = Object.hasOwn(items, sku) ? items[sku] : {};
    return { sku, name: item.name || sku, price: item.price ?? null, gstRate: item.gstRate ?? null, priceWithGst: inclusivePrice(item.price, item.gstRate), published: Boolean(entry.published), category: entry.category || '', description: entry.description || '', ...(stock.has(sku) ? { inStock: stock.get(sku) > 0 } : {}) };
  });
  const snapshot = publicCatalogue(state);
  const problems = rows.filter((row) => row.published && row.priceWithGst == null).map((row) => ({ sku: row.sku, problem: 'NO_PRICE', hint: 'Set the selling price and GST rate so buyers see a price.' }));
  return {
    ok: true,
    data: {
      settings,
      link: { slug: link.slug || '', desired: desiredSlug(state), live: Boolean(link.slug) && settings.enabled, path: link.slug ? `/s/${link.slug}` : '' },
      items: rows,
      published: rows.filter((row) => row.published).length,
      newOrders: orders.filter((order) => order.status === 'new').length,
      public: snapshot,
      problems,
    },
  };
}

export function recordStoreLink(state, slug) {
  const catalogue = ensureCatalogue(state);
  const before = catalogue.link?.slug || '';
  if (before === slug) return { ok: true, changed: false, slug };
  catalogue.link = { slug };
  audit(state, 'catalogue.link_set', { slug, before });
  return { ok: true, changed: true, slug };
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function priceStoreOrder(snapshot, request) {
  if (!snapshot?.enabled) return fail('STORE_CLOSED');
  if (!plainObject(request)) return fail('BAD_ORDER');
  if (Object.keys(request).some((key) => !ORDER_KEYS.has(key))) return fail('BAD_ORDER', { hint: 'Send buyerName, buyerPhone, lines and an optional note only.' });
  if (typeof request.buyerName !== 'string' || typeof request.buyerPhone !== 'string' || (request.note != null && typeof request.note !== 'string')) return fail('BAD_ORDER');
  const buyerName = cleanText(request.buyerName, LIMITS.buyerName);
  if (!buyerName || request.buyerName.length > 200) return fail('NAME_REQUIRED');
  const buyerPhone = indianMobile(request.buyerPhone.slice(0, 20));
  if (!buyerPhone) return fail('BAD_PHONE', { hint: 'Give a 10-digit Indian mobile number.' });
  if (request.note != null && request.note.length > 1000) return fail('NOTE_TOO_LONG');
  const note = cleanText(request.note, LIMITS.note);
  if (!Array.isArray(request.lines) || !request.lines.length) return fail('NO_LINES');
  if (request.lines.length > MAX_ORDER_LINES) return fail('TOO_MANY_LINES', { max: MAX_ORDER_LINES });
  const byId = new Map((snapshot.items || []).map((item) => [item.id, item]));
  const seen = new Set();
  const lines = [];
  for (const line of request.lines) {
    if (!plainObject(line) || Object.keys(line).some((key) => !LINE_KEYS.has(key))) return fail('BAD_LINE');
    if (typeof line.id !== 'string' || !/^[a-f0-9]{16}$/.test(line.id)) return fail('BAD_LINE');
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_LINE_QTY) return fail('BAD_QUANTITY', { max: MAX_LINE_QTY });
    if (seen.has(line.id)) return fail('DUPLICATE_LINE');
    seen.add(line.id);
    const item = byId.get(line.id);
    if (!item) return fail('ITEM_UNAVAILABLE');
    if (item.inStock === false) return fail('ITEM_OUT_OF_STOCK', { name: item.name });
    const price = snapshot.showPrices && typeof item.price === 'number' ? item.price : null;
    lines.push({ id: item.id, name: item.name, qty: line.qty, price, amount: price == null ? null : round2(price * line.qty) });
  }
  const priced = lines.every((line) => line.amount != null);
  const total = round2(lines.reduce((sum, line) => sum + (line.amount || 0), 0));
  return { ok: true, order: { buyerName, buyerPhone, note, lines, total, priced } };
}

export function orderText(storeName, order) {
  const lines = order.lines.map((line) => `${line.qty} x ${line.name}${line.amount == null ? '' : ` = ${rupeeWords(line.amount)}`}`);
  return [`Order for ${storeName}`, ...lines, order.priced ? `Total ${rupeeWords(order.total)} incl. GST` : `Total so far ${rupeeWords(order.total)} incl. GST; some prices to be confirmed`, `From ${order.buyerName}, ${order.buyerPhone}`, order.note ? `Note: ${order.note}` : ''].filter(Boolean).join('\n');
}

export function receiveStoreOrder(state, priced, { ref = '', receivedAt = '' } = {}) {
  if (!inIndia(state)) return fail('STORE_CLOSED');
  const snapshot = publicCatalogue(state);
  if (!snapshot.enabled) return fail('STORE_CLOSED');
  const catalogue = ensureCatalogue(state);
  if (catalogue.orders.filter((order) => order.status === 'new').length >= MAX_OPEN_ORDERS) return fail('STORE_INBOX_FULL');
  const skuById = new Map(Object.keys(catalogue.items).filter((sku) => catalogue.items[sku]?.published).map((sku) => [itemId(sku), sku]));
  const lines = [];
  for (const line of priced.lines || []) {
    const sku = skuById.get(line.id);
    if (!sku) return fail('ITEM_UNAVAILABLE');
    lines.push({ sku, name: line.name, qty: line.qty, price: line.price, amount: line.amount });
  }
  catalogue.orderSeq = Number(catalogue.orderSeq || 0) + 1;
  const order = { id: `ORD-${String(catalogue.orderSeq).padStart(4, '0')}`, ref: String(ref).slice(0, 64), receivedAt: String(receivedAt).slice(0, 40), buyerName: priced.buyerName, buyerPhone: priced.buyerPhone, note: priced.note || '', lines, total: priced.total, priced: priced.priced, status: 'new', quoteId: '', decidedAt: '' };
  catalogue.orders = [...catalogue.orders, order];
  appendAuditEvent(state, { actorId: 'store-buyer', action: 'store.order_received', clientId: String(state.activeClientId || 'SELF'), metadata: { orderId: order.id, ref: order.ref, lines: lines.length, total: order.total } });
  return { ok: true, order };
}

export function storeOrders(state, args = {}) {
  if (!inIndia(state)) return fail('INDIA_ONLY');
  const status = String(args.status || 'all');
  if (status !== 'all' && !ORDER_STATUSES.includes(status)) return fail('BAD_STATUS', { statuses: ORDER_STATUSES });
  const { orders } = catalogueOf(state);
  const rows = orders.filter((order) => status === 'all' || order.status === status).slice().reverse();
  return { ok: true, data: { orders: rows, counts: Object.fromEntries(ORDER_STATUSES.map((s) => [s, orders.filter((order) => order.status === s).length])) } };
}

function findOrder(state, id) {
  const wanted = String(id || '').trim().toUpperCase();
  return catalogueOf(state).orders.find((order) => order.id === wanted) || null;
}

function quoteArgsFor(state, order) {
  const all = skusOf(state);
  const lines = [];
  for (const line of order.lines) {
    const item = all[line.sku];
    if (!item || item.price == null || item.gstRate == null) return fail('PRICE_REQUIRED', { sku: line.sku, hint: `Set the selling price and GST rate of ${line.name} first.` });
    lines.push({ description: item.name || line.name, hsn: item.hsn || '', qty: line.qty, rate: item.price, gstRate: item.gstRate });
  }
  return { ok: true, args: { partyName: order.buyerName, lines } };
}

export function planStoreOrderAction(state, args = {}) {
  if (!inIndia(state)) return fail('INDIA_ONLY');
  const order = findOrder(state, args.id);
  if (!order) return fail('ORDER_NOT_FOUND');
  const action = String(args.action || '');
  if (!Object.hasOwn(ORDER_ACTIONS, action)) return fail('BAD_ACTION', { actions: Object.keys(ORDER_ACTIONS) });
  if (order.status === 'declined' || order.status === 'fulfilled') return fail('ORDER_CLOSED', { status: order.status });
  if (action !== 'fulfil' && order.status !== 'new') return fail('ORDER_ALREADY_ANSWERED', { status: order.status });
  if (action !== 'accept') return { ok: true, plan: { order, action, status: ORDER_ACTIONS[action] } };
  const built = quoteArgsFor(state, order);
  if (!built.ok) return built;
  const quote = planQuote(state, built.args);
  if (!quote.ok) return quote;
  return { ok: true, plan: { order, action, status: 'accepted', quoteArgs: built.args, quote: quote.plan } };
}

export function storeOrderAction(state, args = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner can answer store orders.' });
  const planned = planStoreOrderAction(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  let quoteId = plan.order.quoteId || '';
  if (plan.action === 'accept') {
    const made = createQuote(state, plan.quoteArgs);
    if (!made.ok) return made;
    quoteId = made.quote.id;
  }
  const catalogue = ensureCatalogue(state);
  const decidedAt = localToday();
  catalogue.orders = catalogue.orders.map((order) => (order.id === plan.order.id ? { ...order, status: plan.status, quoteId, decidedAt } : order));
  audit(state, 'store.order_answered', { orderId: plan.order.id, action: plan.action, status: plan.status, quoteId });
  return { ok: true, orderId: plan.order.id, status: plan.status, quoteId };
}
