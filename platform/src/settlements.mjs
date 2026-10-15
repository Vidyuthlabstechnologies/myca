import { isoDate, localToday } from './dates.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
export const SETTLEMENT_KINDS = ['sale', 'tax', 'refund', 'fee', 'penalty', 'reimbursement', 'tcs', 'tds', 'adjustment'];
export const CHANNELS = ['amazon', 'flipkart', 'myntra', 'nykaa', 'meesho', 'shopify', 'razorpay', 'quick-commerce', 'marketplace'];
const BANK_ACCOUNT = 1002n;
const BANK_WINDOW_BEFORE = 2;
const BANK_WINDOW_AFTER = 12;
const KEEP_LINES = 400;

const LONG = {
  settlementId: ['settlement-id', 'settlement id', 'settlement ref', 'payout id', 'settlement_id'],
  type: ['transaction-type', 'transaction type', 'type', 'txn type'],
  orderId: ['order-id', 'order id', 'order item id', 'order_id', 'order no', 'order number', 'merchant-order-id'],
  amountType: ['amount-type', 'amount type'],
  description: ['amount-description', 'amount description', 'description', 'particulars', 'fee type', 'head', 'narration'],
  amount: ['amount', 'value', 'net amount', 'amount (inr)'],
  date: ['posted-date', 'posted date', 'date', 'settlement date', 'transaction date', 'posted-date-time'],
  sku: ['sku', 'seller sku', 'fsn', 'seller-sku'],
  qty: ['quantity-purchased', 'quantity', 'qty'],
};

const WIDE = {
  settlementId: LONG.settlementId,
  orderId: LONG.orderId,
  date: ['settlement date', 'date', 'order date', 'dispatch date', 'payout date'],
  sku: LONG.sku,
  qty: LONG.qty,
  sale: ['sale amount', 'item value', 'order item value', 'principal', 'gross sale', 'gross sales', 'sale value', 'selling price'],
  tax: ['gst', 'tax', 'gst amount', 'tax collected'],
  refund: ['refund', 'return amount', 'refund amount', 'returns'],
  fee: ['marketplace fee', 'total fees', 'commission', 'fees', 'shipping fee', 'collection fee', 'fixed fee', 'total fee', 'marketplace fees', 'commission fee', 'reverse shipping fee'],
  penalty: ['penalty', 'sla penalty', 'chargeback', 'penalties'],
  tcs: ['tcs', 'gst tcs', 'tcs amount'],
  tds: ['tds', 'tds 194-o', 'tds 194o', 'income tax tds', 'tds amount'],
  reimbursement: ['reimbursement', 'compensation', 'protection fund', 'spf', 'claims'],
  settlementValue: ['settlement value', 'net settlement', 'payout', 'net payable', 'net amount', 'bank settlement value'],
};

const MULTI = new Set(['fee', 'penalty']);

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
  const raw = String(cell == null ? '' : cell).replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (raw === '' || raw === '-') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function columnsOf(header, aliases) {
  const lower = header.map((h) => String(h || '').trim().toLowerCase().replace(/^﻿/, ''));
  const idx = {};
  for (const [canon, names] of Object.entries(aliases)) {
    const hits = lower.map((h, i) => (names.includes(h) ? i : -1)).filter((i) => i >= 0);
    if (!hits.length) continue;
    idx[canon] = MULTI.has(canon) ? hits : hits[0];
  }
  return idx;
}

function classify(type, amountType, description) {
  const words = `${type} ${amountType} ${description}`.toLowerCase();
  if (/\btcs\b/.test(words)) return 'tcs';
  if (/\btds\b|194-?o/.test(words)) return 'tds';
  if (/refund|return/.test(words)) return 'refund';
  if (/reimburs|compensat|claim|protection/.test(words)) return 'reimbursement';
  if (/penalt|chargeback|\bsla\b/.test(words)) return 'penalty';
  if (/fee|commission|shipping|closing|storage|advert|promotion|subscription|charge/.test(words)) return 'fee';
  if (/\btax\b|gst|cgst|sgst|igst/.test(words)) return 'tax';
  if (/principal|item price|item-price|sale|product|order/.test(words)) return 'sale';
  return 'adjustment';
}

function inferChannel(header, hint) {
  const wanted = String(hint || '').trim().toLowerCase();
  if (CHANNELS.includes(wanted)) return wanted;
  const lower = header.map((h) => String(h || '').trim().toLowerCase());
  if (lower.includes('settlement-id') || lower.includes('amount-description')) return 'amazon';
  if (lower.includes('order item id') || lower.includes('fsn')) return 'flipkart';
  return 'marketplace';
}

function emptyTotals() {
  return Object.fromEntries(SETTLEMENT_KINDS.map((kind) => [kind, 0]));
}

export function parseSettlementCsv(text, { channel } = {}) {
  const rows = split(text);
  if (!rows.length) return { ok: false, error: 'EMPTY' };
  const header = rows[0];
  const long = columnsOf(header, LONG);
  const wide = columnsOf(header, WIDE);
  const held = [];
  const lines = [];
  const isLong = long.amount != null && (long.description != null || long.amountType != null || long.type != null);
  const isWide = !isLong && (wide.sale != null || wide.settlementValue != null);
  if (!isLong && !isWide) return { ok: false, error: 'NO_HEADER', header, need: 'either amount with a description per row (an Amazon-style settlement), or sale, fees and settlement value columns per order (a Flipkart-style settlement)' };
  const idx = isLong ? long : wide;
  let settlementId = '';
  let fileValue = 0;
  let hasFileValue = false;
  for (const [n, cells] of rows.slice(1).entries()) {
    const rowNo = n + 2;
    const date = idx.date == null ? '' : isoDate(cells[idx.date]) || '';
    const orderId = idx.orderId == null ? '' : String(cells[idx.orderId] || '').trim();
    const sku = idx.sku == null ? '' : String(cells[idx.sku] || '').trim();
    if (idx.settlementId != null && !settlementId) settlementId = String(cells[idx.settlementId] || '').trim();
    if (isLong) {
      const amount = money(cells[idx.amount]);
      if (amount == null) {
        if (cells.every((c) => !String(c || '').trim())) continue;
        held.push({ row: rowNo, reason: 'BAD_AMOUNT' });
        continue;
      }
      if (amount === 0) continue;
      const kind = classify(idx.type == null ? '' : cells[idx.type], idx.amountType == null ? '' : cells[idx.amountType], idx.description == null ? '' : cells[idx.description]);
      lines.push({ row: rowNo, date, orderId, sku, kind, description: String((idx.description != null && cells[idx.description]) || (idx.amountType != null && cells[idx.amountType]) || (idx.type != null && cells[idx.type]) || '').trim(), amount: round2(amount) });
      continue;
    }
    const take = (key, sign) => {
      if (idx[key] == null) return 0;
      const cols = Array.isArray(idx[key]) ? idx[key] : [idx[key]];
      let sum = 0;
      for (const col of cols) sum += Math.abs(money(cells[col]) || 0);
      return round2(sum * sign);
    };
    const sale = take('sale', 1);
    const tax = take('tax', 1);
    const refund = take('refund', -1);
    const fee = take('fee', -1);
    const penalty = take('penalty', -1);
    const tcs = take('tcs', -1);
    const tds = take('tds', -1);
    const reimbursement = take('reimbursement', 1);
    if (![sale, tax, refund, fee, penalty, tcs, tds, reimbursement].some((v) => v !== 0)) {
      if (cells.every((c) => !String(c || '').trim())) continue;
      held.push({ row: rowNo, reason: 'BAD_AMOUNT' });
      continue;
    }
    for (const [kind, amount] of Object.entries({ sale, tax, refund, fee, penalty, tcs, tds, reimbursement })) {
      if (amount !== 0) lines.push({ row: rowNo, date, orderId, sku, kind, description: kind, amount });
    }
    if (idx.settlementValue != null) {
      const value = money(cells[idx.settlementValue]);
      if (value != null) { fileValue = round2(fileValue + value); hasFileValue = true; }
    }
  }
  if (!lines.length) return { ok: false, error: 'NO_ROWS', held };
  const totals = emptyTotals();
  for (const line of lines) totals[line.kind] = round2(totals[line.kind] + line.amount);
  const expected = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const dates = lines.map((line) => line.date).filter(Boolean).sort();
  const orders = new Set(lines.filter((line) => line.kind === 'sale' && line.orderId).map((line) => line.orderId));
  return {
    ok: true,
    channel: inferChannel(header, channel),
    shape: isLong ? 'long' : 'wide',
    settlementId,
    from: dates[0] || '',
    to: dates.at(-1) || '',
    lines,
    held,
    totals,
    expected,
    orders: orders.size,
    ...(hasFileValue ? { fileValue, fileDiffers: Math.abs(fileValue - expected) > 0.5 } : {}),
  };
}

function dayNumber(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function findBankCredit(state, { amount, around }) {
  const ledger = state.ledger;
  if (!ledger || !Array.isArray(ledger.transfers) || !around) return null;
  const want = BigInt(Math.round(Number(amount) * 100));
  const centre = dayNumber(around);
  let best = null;
  for (const t of ledger.transfers) {
    if (!t.posted || t.voided || t.debitAccountId !== BANK_ACCOUNT) continue;
    const on = typeof t.userData === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.userData) ? t.userData : '';
    if (!on) continue;
    const gap = dayNumber(on) - centre;
    if (gap < -BANK_WINDOW_BEFORE || gap > BANK_WINDOW_AFTER) continue;
    const diff = t.amount > want ? t.amount - want : want - t.amount;
    if (diff > 100n) continue;
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { transferId: t.id.toString(), date: on, amount: Number(t.amount) / 100, gap };
  }
  return best ? { transferId: best.transferId, date: best.date, amount: best.amount } : null;
}

export function planSettlement(state, args = {}) {
  const parsed = parseSettlementCsv(args.csv || '', { channel: args.channel });
  if (!parsed.ok) return { ok: false, error: parsed.error, parsed };
  const settlementId = parsed.settlementId || `${parsed.channel}-${parsed.to || localToday()}`;
  const exists = (state.settlements || []).find((item) => item.channel === parsed.channel && item.settlementId === settlementId);
  if (exists) return { ok: false, error: 'SETTLEMENT_EXISTS', id: exists.id, settlementId };
  const received = args.bankAmount == null || args.bankAmount === '' ? null : round2(args.bankAmount);
  if (args.bankAmount != null && args.bankAmount !== '' && !(Number.isFinite(Number(args.bankAmount)) && Number(args.bankAmount) >= 0)) return { ok: false, error: 'BAD_AMOUNT' };
  const bankCredit = received == null ? findBankCredit(state, { amount: parsed.expected, around: parsed.to }) : null;
  const paid = received != null ? received : bankCredit ? bankCredit.amount : null;
  const shortfall = paid == null ? null : round2(parsed.expected - paid);
  const status = paid == null ? 'unmatched' : Math.abs(shortfall) <= 1 ? 'matched' : shortfall > 0 ? 'short' : 'over';
  const penalties = parsed.lines.filter((line) => line.kind === 'penalty');
  const reimbursements = parsed.lines.filter((line) => line.kind === 'reimbursement');
  return {
    ok: true,
    plan: {
      channel: parsed.channel,
      settlementId,
      shape: parsed.shape,
      from: parsed.from,
      to: parsed.to,
      orders: parsed.orders,
      rows: parsed.lines.length,
      held: parsed.held,
      totals: parsed.totals,
      expected: parsed.expected,
      ...(parsed.fileValue != null ? { fileValue: parsed.fileValue, fileDiffers: parsed.fileDiffers } : {}),
      paid,
      shortfall,
      status,
      bank: bankCredit ? { matched: true, ...bankCredit } : { matched: false, source: received != null ? 'stated' : 'none' },
      penalties: penalties.map((line) => ({ orderId: line.orderId, description: line.description, amount: line.amount, date: line.date })),
      reimbursements: reimbursements.map((line) => ({ orderId: line.orderId, description: line.description, amount: line.amount, date: line.date })),
      lines: parsed.lines.slice(0, KEEP_LINES),
      truncated: parsed.lines.length > KEEP_LINES,
    },
  };
}

function nextSettlementId(state) {
  state.settlementSeq = Number(state.settlementSeq || 0) + 1;
  return `STL-${String(state.settlementSeq).padStart(4, '0')}`;
}

export function importSettlement(state, args = {}) {
  const planned = planSettlement(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const settlement = { id: nextSettlementId(state), importedOn: localToday(), ...plan };
  state.settlements = Array.isArray(state.settlements) ? state.settlements : [];
  state.settlements.push(settlement);
  return { ok: true, settlement };
}

export function settlementStatus(state, { channel, limit = 20 } = {}) {
  const wanted = String(channel || '').trim().toLowerCase();
  const rows = (state.settlements || [])
    .filter((item) => !wanted || item.channel === wanted)
    .map(({ lines, ...item }) => item)
    .sort((a, b) => (b.to || '').localeCompare(a.to || '') || b.id.localeCompare(a.id));
  const byChannel = {};
  for (const item of rows) {
    const bucket = byChannel[item.channel] || (byChannel[item.channel] = { settlements: 0, expected: 0, paid: 0, short: 0, unmatched: 0, penalties: 0, tcs: 0, tds: 0, latest: item.to });
    bucket.settlements += 1;
    bucket.expected = round2(bucket.expected + item.expected);
    bucket.paid = round2(bucket.paid + (item.paid || 0));
    if (item.status === 'short') bucket.short = round2(bucket.short + item.shortfall);
    if (item.status === 'unmatched') bucket.unmatched += 1;
    bucket.penalties = round2(bucket.penalties + Math.abs(item.totals.penalty || 0));
    bucket.tcs = round2(bucket.tcs + Math.abs(item.totals.tcs || 0));
    bucket.tds = round2(bucket.tds + Math.abs(item.totals.tds || 0));
  }
  return { ok: true, data: { settlements: rows.slice(0, Math.max(1, Math.min(200, Number(limit) || 20))), total: rows.length, byChannel, channels: CHANNELS } };
}

export function settlementWords(plan, money) {
  const t = plan.totals;
  const name = plan.channel === 'marketplace' ? 'Marketplace' : plan.channel[0].toUpperCase() + plan.channel.slice(1);
  const parts = [`sales ${money(t.sale + t.tax)}`];
  if (t.refund) parts.push(`refunds ${money(-t.refund)}`);
  if (t.fee) parts.push(`fees ${money(-t.fee)}`);
  if (t.penalty) parts.push(`penalties ${money(-t.penalty)}`);
  if (t.tcs) parts.push(`TCS ${money(-t.tcs)}`);
  if (t.tds) parts.push(`TDS 194-O ${money(-t.tds)}`);
  if (t.reimbursement) parts.push(`reimbursements ${money(t.reimbursement)}`);
  if (t.adjustment) parts.push(`other ${money(t.adjustment)}`);
  const bank = plan.status === 'matched'
    ? `Paid: ${money(plan.paid)}${plan.bank?.date ? ` in the bank on ${plan.bank.date}` : ''}, matches.`
    : plan.status === 'short'
      ? `Paid: ${money(plan.paid)}, short by ${money(plan.shortfall)}.`
      : plan.status === 'over'
        ? `Paid: ${money(plan.paid)}, ${money(-plan.shortfall)} more than expected.`
        : 'Not found in the bank yet.';
  return `${name} settlement ${plan.settlementId}${plan.from ? ` (${plan.from} to ${plan.to})` : ''}: ${plan.orders} orders, ${parts.join(', ')}. Expected payout ${money(plan.expected)}. ${bank}${plan.fileDiffers ? ` The file's own settlement value is ${money(plan.fileValue)}, which does not add up from its rows.` : ''}`;
}

export function settlementStatusWords(data, money) {
  if (!data.total) return 'No settlement has been imported yet. Attach a payout report from Amazon, Flipkart or your gateway and say "import settlement".';
  const lines = [];
  for (const [channel, b] of Object.entries(data.byChannel)) {
    const name = channel[0].toUpperCase() + channel.slice(1);
    lines.push(`${name}: ${b.settlements === 1 ? '1 settlement' : `${b.settlements} settlements`} to ${b.latest}, expected ${money(b.expected)}, paid ${money(b.paid)}${b.short ? `, short ${money(b.short)}` : ''}${b.unmatched ? `, ${b.unmatched} not yet seen in the bank` : ''}${b.penalties ? `, penalties ${money(b.penalties)}` : ''}${b.tcs || b.tds ? ` (TCS ${money(b.tcs)}, TDS ${money(b.tds)} to claim)` : ''}.`);
  }
  for (const item of data.settlements.slice(0, 5)) lines.push(`· ${item.id} ${item.channel} ${item.settlementId}: expected ${money(item.expected)}, ${item.status === 'matched' ? 'paid in full' : item.status === 'short' ? `short ${money(item.shortfall)}` : item.status === 'over' ? 'overpaid' : 'not in the bank yet'}`);
  return lines.join('\n');
}
