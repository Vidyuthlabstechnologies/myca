import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encryptSecret, decryptSecret, vaultBackend } from './credential-vault.mjs';
import { mycaDir } from './nic-config.mjs';
import { localToday, isoDate } from './dates.mjs';
import { csvRows } from './text-safe.mjs';
import { performExternalAction } from './action-gate.mjs';
import { documentsOf } from './document-store.mjs';
import { addReminder } from './reminders.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
export const CONNECTOR_CHANNELS = {
  amazon: { title: 'Amazon Seller Central (SP-API)', fields: ['clientId', 'clientSecret', 'refreshToken', 'marketplaceId', 'region'], secrets: ['clientSecret', 'refreshToken'], kinds: ['settlement', 'orders'] },
  shopify: { title: 'Shopify Admin API', fields: ['shopDomain', 'accessToken'], secrets: ['accessToken'], kinds: ['settlement', 'orders'] },
  razorpay: { title: 'Razorpay', fields: ['keyId', 'keySecret'], secrets: ['keySecret'], kinds: ['settlement'] },
  zoho: { title: 'Zoho Books', fields: ['orgId', 'dc', 'clientId', 'clientSecret', 'refreshToken'], secrets: ['clientSecret', 'refreshToken'], kinds: [], pushes: ['invoices'] },
};
export const FILE_ONLY_CHANNELS = { flipkart: 'Flipkart publishes settlement and GST reports from Seller Hub as files; import them.', unicommerce: 'Unicommerce exports orders as files; import them.', myntra: 'Myntra, Nykaa and Meesho publish payout files; import them.' };

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function configPath() {
  return join(mycaDir(), 'channels.json');
}

function readFile() {
  const p = configPath();
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

export function loadChannelConfig(channel) {
  const spec = CONNECTOR_CHANNELS[channel];
  if (!spec) return null;
  const raw = readFile()[channel];
  if (!raw) return null;
  const out = {};
  for (const field of spec.fields) {
    if (spec.secrets.includes(field)) out[field] = raw.secrets?.[field] ? decryptSecret(raw.secrets[field]) : '';
    else out[field] = String(raw[field] || '');
  }
  out.enabled = raw.enabled !== false;
  out.lastFetchedTo = String(raw.lastFetchedTo || '');
  return out;
}

export function publicChannelConfig(channel) {
  const spec = CONNECTOR_CHANNELS[channel];
  const cfg = loadChannelConfig(channel);
  if (!spec) return null;
  if (!cfg) return { channel, title: spec.title, configured: false, kinds: spec.kinds, pushes: spec.pushes || [], fields: spec.fields, secrets: spec.secrets };
  const shown = {};
  for (const field of spec.fields) shown[field] = spec.secrets.includes(field) ? (cfg[field] ? 'set' : '') : cfg[field];
  return { channel, title: spec.title, configured: spec.fields.every((field) => Boolean(cfg[field]) || field === 'region' || field === 'dc'), enabled: cfg.enabled, lastFetchedTo: cfg.lastFetchedTo, kinds: spec.kinds, pushes: spec.pushes || [], fields: spec.fields, secrets: spec.secrets, ...shown };
}

export function saveChannelConfig(channel, patch = {}) {
  const spec = CONNECTOR_CHANNELS[channel];
  if (!spec) return fail('UNKNOWN_CONNECTOR', { channel, known: Object.keys(CONNECTOR_CHANNELS), fileOnly: FILE_ONLY_CHANNELS });
  const all = readFile();
  const before = all[channel] || { secrets: {} };
  const next = { ...before, secrets: { ...(before.secrets || {}) }, vault: vaultBackend() };
  for (const field of spec.fields) {
    if (patch[field] == null) continue;
    const value = String(patch[field]).trim();
    if (spec.secrets.includes(field)) {
      if (value) next.secrets[field] = encryptSecret(value);
      else delete next.secrets[field];
    } else next[field] = value;
  }
  if (patch.enabled != null) next.enabled = Boolean(patch.enabled);
  all[channel] = next;
  mkdirSync(mycaDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(all, null, 2), { mode: 0o600 });
  return { ok: true, ...publicChannelConfig(channel) };
}

function markFetched(channel, to) {
  const all = readFile();
  if (!all[channel]) return;
  all[channel].lastFetchedTo = to;
  writeFileSync(configPath(), JSON.stringify(all, null, 2), { mode: 0o600 });
}

export function listConnectors() {
  return { ok: true, data: { connectors: Object.keys(CONNECTOR_CHANNELS).map((channel) => publicChannelConfig(channel)), fileOnly: FILE_ONLY_CHANNELS } };
}

const SHOPIFY_FEE_TYPES = new Set(['charge', 'refund', 'adjustment', 'dispute', 'payout_failure']);

export function shopifyOrdersToCsv(pages) {
  const rows = [['Order Id', 'Order Date', 'Transaction Type', 'Ship To State', 'Sku', 'Quantity', 'Taxable Value', 'Tax Amount', 'GST Rate', 'Total Amount']];
  for (const page of pages) {
    for (const order of page.orders || []) {
      if (order.cancelled_at) continue;
      const state = order.shipping_address?.province || order.billing_address?.province || '';
      const date = isoDate(String(order.created_at || '').slice(0, 10)) || '';
      for (const line of order.line_items || []) {
        const gross = round2(Number(line.price || 0) * Number(line.quantity || 0) - Number(line.total_discount || 0));
        const tax = round2((line.tax_lines || []).reduce((sum, t) => sum + Number(t.price || 0), 0));
        const rate = (line.tax_lines || []).reduce((sum, t) => sum + Number(t.rate || 0), 0) * 100;
        const taxable = order.taxes_included ? round2(gross - tax) : gross;
        rows.push([order.name || order.id, date, 'Shipment', state, line.sku || '', line.quantity, taxable, tax, round2(rate), round2(taxable + tax)]);
      }
      for (const refund of order.refunds || []) {
        for (const item of refund.refund_line_items || []) {
          const line = item.line_item || {};
          const tax = round2((line.tax_lines || []).reduce((sum, t) => sum + Number(t.price || 0), 0) * (Number(item.quantity || 0) / Math.max(1, Number(line.quantity || 1))));
          const rate = (line.tax_lines || []).reduce((sum, t) => sum + Number(t.rate || 0), 0) * 100;
          const taxable = round2(Number(item.subtotal || 0) - (order.taxes_included ? tax : 0));
          rows.push([order.name || order.id, isoDate(String(refund.created_at || '').slice(0, 10)) || date, 'Refund', state, line.sku || '', -Number(item.quantity || 0), -taxable, -tax, round2(rate), -round2(taxable + tax)]);
        }
      }
    }
  }
  return csvRows(rows);
}

export function shopifyPayoutsToCsv(pages, { from, to }) {
  const rows = [['settlement-id', 'transaction-type', 'order-id', 'amount-type', 'amount-description', 'amount', 'posted-date']];
  for (const page of pages) {
    for (const t of page.transactions || []) {
      if (!SHOPIFY_FEE_TYPES.has(t.type)) continue;
      const date = isoDate(String(t.processed_at || '').slice(0, 10)) || to;
      const settlementId = t.payout_id ? `shopify-${t.payout_id}` : `shopify-${from}-${to}`;
      const order = t.source_order_id ? String(t.source_order_id) : '';
      if (t.type === 'charge') {
        rows.push([settlementId, 'Order', order, 'ItemPrice', 'Principal', round2(t.amount), date]);
        if (Number(t.fee || 0)) rows.push([settlementId, 'Order', order, 'ItemFees', 'Payment processing fee', -round2(t.fee), date]);
      } else if (t.type === 'refund') {
        rows.push([settlementId, 'Refund', order, 'ItemPrice', 'Principal', round2(t.amount), date]);
      } else {
        rows.push([settlementId, 'other-transaction', order, '', t.type === 'dispute' ? 'Chargeback' : `Adjustment ${t.type}`, round2(t.net ?? t.amount), date]);
      }
    }
  }
  return csvRows(rows);
}

export function razorpayReconToCsv(rows, { from, to }) {
  const out = [['settlement-id', 'transaction-type', 'order-id', 'amount-type', 'amount-description', 'amount', 'posted-date']];
  for (const item of rows) {
    const settlementId = item.settlement_id ? `razorpay-${item.settlement_id}` : `razorpay-${from}-${to}`;
    const date = item.settled_at ? isoDate(new Date(Number(item.settled_at) * 1000).toISOString().slice(0, 10)) : (item.created_at ? isoDate(new Date(Number(item.created_at) * 1000).toISOString().slice(0, 10)) : to);
    const order = String(item.order_id || item.entity_id || '');
    const amount = round2(Number(item.amount || 0) / 100);
    const fee = round2(Number(item.fee || 0) / 100);
    const tax = round2(Number(item.tax || 0) / 100);
    if (item.type === 'refund') {
      out.push([settlementId, 'Refund', order, 'ItemPrice', 'Principal', -amount, date]);
    } else if (item.type === 'payment') {
      out.push([settlementId, 'Order', order, 'ItemPrice', 'Principal', amount, date]);
      if (fee) out.push([settlementId, 'Order', order, 'ItemFees', 'Payment gateway fee', -fee, date]);
      if (tax) out.push([settlementId, 'Order', order, 'ItemFees', 'GST on gateway fee', -tax, date]);
    } else if (item.type === 'adjustment') {
      out.push([settlementId, 'other-transaction', order, '', `Adjustment ${item.description || ''}`.trim(), amount, date]);
    }
  }
  return csvRows(out);
}

function mockReport(channel, kind, from, to) {
  if (kind === 'orders') {
    return csvRows([
      ['Order Id', 'Order Date', 'Transaction Type', 'Ship To State', 'Sku', 'Quantity', 'Taxable Value', 'Tax Amount', 'GST Rate', 'Total Amount'],
      [`MOCK-${channel}-1`, from, 'Shipment', 'Karnataka', 'SKU-A', 1, 1000, 180, 18, 1180],
    ]);
  }
  return csvRows([
    ['settlement-id', 'transaction-type', 'order-id', 'amount-type', 'amount-description', 'amount', 'posted-date'],
    [`mock-${channel}-${to}`, 'Order', `MOCK-${channel}-1`, 'ItemPrice', 'Principal', 1000, to],
    [`mock-${channel}-${to}`, 'Order', `MOCK-${channel}-1`, 'ItemPrice', 'Tax', 180, to],
    [`mock-${channel}-${to}`, 'Order', `MOCK-${channel}-1`, 'ItemFees', 'Commission', -150, to],
  ]);
}

export async function fetchChannelReport(state, args = {}, { actor } = {}) {
  const channel = String(args.channel || '').trim().toLowerCase();
  const spec = CONNECTOR_CHANNELS[channel];
  if (!spec) return fail('UNKNOWN_CONNECTOR', { channel, known: Object.keys(CONNECTOR_CHANNELS), fileOnly: FILE_ONLY_CHANNELS[channel] || '' });
  const kind = String(args.kind || 'settlement').trim().toLowerCase();
  if (!spec.kinds.includes(kind)) return fail('KIND_NOT_SUPPORTED', { channel, kind, kinds: spec.kinds });
  const to = args.to ? isoDate(args.to) : localToday();
  const from = args.from ? isoDate(args.from) : (() => { const d = new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 14); return d.toISOString().slice(0, 10); })();
  if (!from || !to || from > to) return fail('INVALID_RANGE', { from: args.from, to: args.to });
  const config = loadChannelConfig(channel);
  const result = await performExternalAction(state, {
    actionId: 'channel_fetch_report',
    clientId: String(state.activeClientId || 'SELF'),
    params: { channel, kind, from, to },
    actor: actor || { userId: 'owner' },
    metadata: { channel, kind, from, to },
    payload: { channel, kind, from, to },
    fixture: () => ({ ok: true, mock: true, simulated: true, data: { text: mockReport(channel, kind, from, to), source: `${channel}:${kind}:mock` } }),
    preflight: () => {
      if (!config || !spec.fields.every((field) => Boolean(config[field]) || field === 'region')) return fail('CONNECTOR_NOT_CONFIGURED', { channel, fields: spec.fields, hint: `Save the ${spec.title} credentials first (set_channel_connector).` });
      if (config.enabled === false) return fail('CONNECTOR_DISABLED', { channel });
      return null;
    },
  }, async (transports) => {
    const fetched = await transports.channel.pull({ channel, kind, from, to, config });
    if (!fetched.ok) return fetched;
    let text = '';
    if (channel === 'amazon') text = fetched.text;
    else if (channel === 'shopify') text = kind === 'orders' ? shopifyOrdersToCsv(fetched.pages) : shopifyPayoutsToCsv(fetched.pages, { from, to });
    else if (channel === 'razorpay') text = razorpayReconToCsv(fetched.rows, { from, to });
    return { ok: true, data: { text, source: `${channel}:${kind}` } };
  });
  if (!result.ok) return result;
  const text = String(result.data?.text || '');
  if (!text.trim() || text.split(/\r?\n/).filter((line) => line.trim()).length < 2) return { ok: true, empty: true, channel, kind, from, to, mock: Boolean(result.mock), note: 'The channel returned no rows for the range.' };
  const stored = documentsOf(state).put(text);
  const name = `${channel}-${kind}-${from}-to-${to}.csv`;
  const tool = kind === 'orders' ? 'import_marketplace_orders' : 'import_settlement';
  state.attachments = state.attachments && typeof state.attachments === 'object' ? state.attachments : {};
  state.attachments[`channel:${channel}:${kind}`] = { sha256: stored.sha256, name, bytes: stored.bytes, at: new Date().toISOString(), channel, reportKind: kind, from, to, mock: Boolean(result.mock) };
  const reminder = addReminder(state, { text: `${spec.title.split(' (')[0]} ${kind === 'orders' ? 'orders' : 'settlement'} report for ${from} to ${to} is in: ${name}. Import it to post.`, due: localToday(), documentSha256: stored.sha256, documentName: name, actorId: 'automation', today: localToday() });
  if (!result.mock) markFetched(channel, to);
  return { ok: true, channel, kind, from, to, documentSha256: stored.sha256, name, bytes: stored.bytes, rows: text.split(/\r?\n/).filter((line) => line.trim()).length - 1, importTool: tool, reminderId: reminder.ok ? reminder.reminder.id : '', mock: Boolean(result.mock), dryRun: Boolean(result.dryRun) };
}

export async function syncChannels(state, args = {}, { actor } = {}) {
  const today = localToday();
  const results = [];
  for (const channel of Object.keys(CONNECTOR_CHANNELS)) {
    const cfg = publicChannelConfig(channel);
    if (!cfg || !cfg.configured || cfg.enabled === false) continue;
    const from = cfg.lastFetchedTo || undefined;
    for (const kind of CONNECTOR_CHANNELS[channel].kinds) {
      const out = await fetchChannelReport(state, { channel, kind, from, to: args.to || today }, { actor });
      results.push({ channel, kind, ok: out.ok !== false, error: out.error || '', empty: Boolean(out.empty), rows: out.rows || 0, documentSha256: out.documentSha256 || '', mock: Boolean(out.mock) });
    }
  }
  return { ok: true, data: { ranOn: today, fetched: results.filter((r) => r.ok && !r.empty).length, results } };
}

export function connectorsWords(data) {
  const lines = [];
  for (const c of data.connectors) lines.push(`· ${c.title}: ${c.configured ? `connected${c.enabled === false ? ', paused' : ''}${c.lastFetchedTo ? `, fetched to ${c.lastFetchedTo}` : ''}` : 'not connected'} (${[...c.kinds, ...(c.pushes || []).map((p) => `push ${p}`)].join(', ')})`);
  for (const [channel, note] of Object.entries(data.fileOnly)) lines.push(`· ${channel}: ${note}`);
  lines.push('Fetching runs through the action gate: nothing is pulled until live calls are on, and every report lands as a file you import after a preview.');
  return lines.join('\n');
}

export function fetchWords(result) {
  if (result.empty) return `${result.channel} returned no ${result.kind} rows for ${result.from} to ${result.to}.`;
  return `${result.mock ? 'Simulated: ' : ''}${result.channel} ${result.kind} report for ${result.from} to ${result.to} fetched: ${result.rows} rows stored as ${result.name}. Say "import ${result.kind === 'orders' ? `${result.channel} orders` : `${result.channel} settlement`}" or open it from the reminder to post it.`;
}
