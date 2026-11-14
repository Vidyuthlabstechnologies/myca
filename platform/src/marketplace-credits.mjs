import { isoDate, localToday, reportDate } from './dates.mjs';
import { CHANNELS } from './settlements.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const TAN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const SECTION = /^[0-9]{3}[A-Z]{0,3}$/;

const TCS_ALIASES = {
  gstin: ['gstin of e-commerce operator', 'gstin of ecommerce operator', 'e-commerce operator gstin', 'operator gstin', 'gstin of deductor/operator', 'gstin', 'deductor gstin'],
  name: ['name of e-commerce operator', 'operator name', 'name of deductor', 'name', 'trade name', 'legal name'],
  period: ['period', 'tax period', 'month', 'return period', 'financial period'],
  taxable: ['taxable value', 'gross value', 'net value', 'amount received', 'net amount liable for tcs', 'net value of supplies'],
  igst: ['integrated tax', 'igst', 'integrated tax amount', 'tcs igst'],
  cgst: ['central tax', 'cgst', 'central tax amount', 'tcs cgst'],
  sgst: ['state/ut tax', 'state tax', 'sgst', 'state/ut tax amount', 'utgst', 'tcs sgst'],
  total: ['tcs', 'total tax', 'amount of tax', 'total tcs', 'tax amount'],
  ourGstin: ['gstin of registered person', 'gstin of taxpayer', 'your gstin', 'recipient gstin', 'gstin of supplier', 'supplier gstin'],
};

const TDS_ALIASES = {
  section: ['section', 'section code', 'section of the act', 'sec'],
  tan: ['tan', 'tan of deductor', 'tan of the deductor'],
  name: ['name of deductor', 'deductor', 'name of the deductor', 'deductor name'],
  amountPaid: ['amount paid/credited', 'amount paid', 'amount credited', 'amount paid / credited', 'total amount paid/credited'],
  taxDeducted: ['tax deducted', 'tds', 'total tds deposited', 'tds deposited', 'tax deducted (rs.)', 'total tax deducted'],
  date: ['date of booking', 'date', 'transaction date', 'date of payment/credit', 'date of payment', 'date of transaction'],
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
  const raw = String(cell == null ? '' : cell).replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (raw === '' || raw === '-') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function columnsOf(header, aliases) {
  const lower = header.map((h) => String(h || '').trim().toLowerCase().replace(/^﻿/, '').replace(/\s+/g, ' '));
  const idx = {};
  for (const [canon, names] of Object.entries(aliases)) {
    const i = lower.findIndex((h) => names.includes(h));
    if (i >= 0) idx[canon] = i;
  }
  return idx;
}

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

export function periodOf(value) {
  const raw = String(value == null ? '' : value).trim();
  if (PERIOD.test(raw)) return raw;
  let m = /^(0?[1-9]|1[0-2])[\/-](\d{4})$/.exec(raw);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})(0[1-9]|1[0-2])$/.exec(raw);
  if (m) return `${m[1]}-${m[2]}`;
  m = /^([A-Za-z]{3})[A-Za-z]*[\s,'-]*(\d{2,4})$/.exec(raw);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${MONTHS[m[1].toLowerCase()]}`;
  const iso = isoDate(raw);
  return iso ? iso.slice(0, 7) : '';
}

export function quarterOfDate(iso) {
  const [y, m] = String(iso).split('-').map(Number);
  if (!y || !m) return '';
  const fyStart = m >= 4 ? y : y - 1;
  const q = Math.floor(((m + 8) % 12) / 3) + 1;
  return `Q${q} ${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
}

export function fyOfPeriod(period) {
  const [y, m] = String(period).split('-').map(Number);
  const fyStart = m >= 4 ? y : y - 1;
  return `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
}

function channels(state) {
  return state.channels && typeof state.channels === 'object' ? state.channels : {};
}

function channelByGstin(state, gstin) {
  const wanted = String(gstin || '').toUpperCase();
  if (!wanted) return '';
  return Object.entries(channels(state)).find(([, id]) => String(id.gstin || '').toUpperCase() === wanted)?.[0] || '';
}

function channelByTan(state, tan) {
  const wanted = String(tan || '').toUpperCase();
  if (!wanted) return '';
  return Object.entries(channels(state)).find(([, id]) => String(id.tan || '').toUpperCase() === wanted)?.[0] || '';
}

function channelByName(name) {
  const words = String(name || '').toLowerCase();
  return CHANNELS.find((channel) => channel !== 'marketplace' && words.includes(channel.replace('-', ' '))) || CHANNELS.find((channel) => channel !== 'marketplace' && words.includes(channel)) || '';
}

export function channelOfDeductor(state, { tan, name } = {}) {
  return channelByTan(state, tan) || channelByName(name);
}

export function normalSection(value) {
  const raw = String(value == null ? '' : value).toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^SECTION|^SEC(?=[0-9])/, '');
  return SECTION.test(raw) ? raw : '';
}

export function planChannelIdentity(state, args = {}) {
  const channel = String(args.channel || '').trim().toLowerCase();
  if (!CHANNELS.includes(channel) || channel === 'marketplace') return { ok: false, error: 'BAD_CHANNEL', hint: CHANNELS.filter((c) => c !== 'marketplace').join(', ') };
  const gstin = String(args.gstin || '').replace(/\s+/g, '').toUpperCase();
  if (gstin && !GSTIN.test(gstin)) return { ok: false, error: 'BAD_GSTIN', gstin };
  const tan = String(args.tan || '').replace(/\s+/g, '').toUpperCase();
  if (tan && !TAN.test(tan)) return { ok: false, error: 'BAD_TAN', tan };
  const name = String(args.name || '').trim().slice(0, 120);
  if (!gstin && !tan && !name) return { ok: false, error: 'NOTHING_TO_CHANGE' };
  const before = channels(state)[channel] || {};
  return { ok: true, plan: { channel, next: { ...before, ...(args.gstin != null ? { gstin } : {}), ...(args.tan != null ? { tan } : {}), ...(args.name != null ? { name } : {}) }, before } };
}

export function setChannelIdentity(state, args = {}) {
  const planned = planChannelIdentity(state, args);
  if (!planned.ok) return planned;
  state.channels = channels(state);
  state.channels[planned.plan.channel] = planned.plan.next;
  return { ok: true, channel: planned.plan.channel, identity: planned.plan.next };
}

export function parseTcsStatement(text) {
  const rows = split(text);
  if (!rows.length) return { ok: false, error: 'EMPTY' };
  const idx = columnsOf(rows[0], TCS_ALIASES);
  if (idx.gstin == null || idx.period == null || (idx.total == null && idx.igst == null && idx.cgst == null && idx.sgst == null)) {
    return { ok: false, error: 'NO_HEADER', header: rows[0], need: 'the operator GSTIN, the period, and the tax (integrated, central and state, or a total)' };
  }
  const lines = [];
  const held = [];
  for (const [n, cells] of rows.slice(1).entries()) {
    if (cells.every((c) => !String(c || '').trim())) continue;
    const gstin = String(cells[idx.gstin] || '').replace(/\s+/g, '').toUpperCase();
    const period = periodOf(cells[idx.period]);
    if (!GSTIN.test(gstin)) { held.push({ row: n + 2, reason: 'BAD_GSTIN', value: gstin }); continue; }
    if (!period) { held.push({ row: n + 2, reason: 'INVALID_PERIOD', value: String(cells[idx.period] || '') }); continue; }
    const igst = idx.igst == null ? 0 : Math.abs(money(cells[idx.igst]) || 0);
    const cgst = idx.cgst == null ? 0 : Math.abs(money(cells[idx.cgst]) || 0);
    const sgst = idx.sgst == null ? 0 : Math.abs(money(cells[idx.sgst]) || 0);
    const heads = round2(igst + cgst + sgst);
    const stated = idx.total == null ? null : Math.abs(money(cells[idx.total]) || 0);
    const total = heads > 0 ? heads : stated || 0;
    if (!(total > 0)) { held.push({ row: n + 2, reason: 'BAD_AMOUNT', gstin, period }); continue; }
    lines.push({ row: n + 2, gstin, ourGstin: idx.ourGstin == null ? '' : String(cells[idx.ourGstin] || '').replace(/\s+/g, '').toUpperCase(), name: idx.name == null ? '' : String(cells[idx.name] || '').trim(), period, taxable: idx.taxable == null ? null : Math.abs(money(cells[idx.taxable]) || 0), igst, cgst, sgst, total: round2(total) });
  }
  if (!lines.length) return { ok: false, error: 'NO_ROWS', held };
  return { ok: true, lines, held };
}

export function planTcsStatement(state, args = {}) {
  const parsed = parseTcsStatement(args.csv || '');
  if (!parsed.ok) return { ok: false, error: parsed.error, parsed };
  const existing = new Set((state.tcsStatements || []).map((row) => `${row.gstin}|${row.ourGstin || ''}|${row.period}`));
  const ready = [];
  const skipped = parsed.held.map((row) => ({ id: `row ${row.row}`, reason: row.reason }));
  for (const line of parsed.lines) {
    const key = `${line.gstin}|${line.ourGstin || ''}|${line.period}`;
    if (existing.has(key)) { skipped.push({ id: key, reason: 'exists' }); continue; }
    existing.add(key);
    const channel = channelByGstin(state, line.gstin) || channelByName(line.name);
    ready.push({ ...line, channel: channel || 'marketplace', unknownOperator: !channel });
  }
  return { ok: true, ready, skipped, total: round2(ready.reduce((sum, line) => sum + line.total, 0)) };
}

export function importTcsStatement(state, args = {}) {
  const planned = planTcsStatement(state, args);
  if (!planned.ok) return planned;
  state.tcsStatements = Array.isArray(state.tcsStatements) ? state.tcsStatements : [];
  const importedOn = localToday();
  for (const line of planned.ready) state.tcsStatements.push({ gstin: line.gstin, ourGstin: line.ourGstin || '', name: line.name, period: line.period, channel: line.channel, taxable: line.taxable, igst: line.igst, cgst: line.cgst, sgst: line.sgst, total: line.total, importedOn });
  return { ok: true, imported: planned.ready.length, total: planned.total, skipped: planned.skipped, unknownOperators: planned.ready.filter((line) => line.unknownOperator).map((line) => line.gstin) };
}

export function parse26asCredits(text) {
  const rows = split(text);
  if (!rows.length) return { ok: false, error: 'EMPTY' };
  const idx = columnsOf(rows[0], TDS_ALIASES);
  if (idx.section == null || idx.tan == null || idx.taxDeducted == null) return { ok: false, error: 'NO_HEADER', header: rows[0], need: 'section, TAN of deductor, tax deducted and a date' };
  const lines = [];
  const held = [];
  let otherSections = 0;
  for (const [n, cells] of rows.slice(1).entries()) {
    if (cells.every((c) => !String(c || '').trim())) continue;
    const section = normalSection(cells[idx.section]);
    if (!section) { otherSections += 1; continue; }
    const tan = String(cells[idx.tan] || '').replace(/\s+/g, '').toUpperCase();
    const date = idx.date == null ? '' : reportDate(cells[idx.date]) || '';
    const taxDeducted = Math.abs(money(cells[idx.taxDeducted]) || 0);
    if (!TAN.test(tan)) { held.push({ row: n + 2, reason: 'BAD_TAN', value: tan }); continue; }
    if (!date) { held.push({ row: n + 2, reason: 'INVALID_DATE', tan }); continue; }
    if (!(taxDeducted > 0)) { held.push({ row: n + 2, reason: 'BAD_AMOUNT', tan }); continue; }
    lines.push({ row: n + 2, section, tan, name: idx.name == null ? '' : String(cells[idx.name] || '').trim(), date, quarter: quarterOfDate(date), amountPaid: idx.amountPaid == null ? null : Math.abs(money(cells[idx.amountPaid]) || 0), taxDeducted: round2(taxDeducted) });
  }
  if (!lines.length) return { ok: false, error: 'NO_ROWS', held, otherSections };
  return { ok: true, lines, held, otherSections };
}

const statementKey = (row) => `${row.section || '194O'}|${row.tan}|${row.date}|${row.taxDeducted}|${row.amountPaid}`;

function sectionTotals(lines) {
  const by = new Map();
  for (const line of lines) {
    const item = by.get(line.section) || { section: line.section, rows: 0, total: 0 };
    item.rows += 1;
    item.total = round2(item.total + line.taxDeducted);
    by.set(line.section, item);
  }
  return [...by.values()].sort((a, b) => a.section.localeCompare(b.section));
}

export function sectionWords(bySection) {
  return (bySection || []).map((row) => `${row.section} ${row.rows}`).join(', ');
}

export function plan26asCredits(state, args = {}) {
  const parsed = parse26asCredits(args.csv || '');
  if (!parsed.ok) return { ok: false, error: parsed.error, parsed };
  const stored = new Map();
  for (const row of state.tdsCreditStatements || []) {
    const key = statementKey(row);
    stored.set(key, (stored.get(key) || 0) + 1);
  }
  const seen = new Map();
  const ready = [];
  const skipped = parsed.held.map((row) => ({ id: `row ${row.row}`, reason: row.reason }));
  for (const line of parsed.lines) {
    const key = statementKey(line);
    const nth = (seen.get(key) || 0) + 1;
    seen.set(key, nth);
    if (nth <= (stored.get(key) || 0)) { skipped.push({ id: `${line.tan} ${line.date}`, reason: 'exists' }); continue; }
    if (line.section !== '194O') { ready.push({ ...line, channel: '', unknownDeductor: false }); continue; }
    const channel = channelOfDeductor(state, line);
    ready.push({ ...line, channel: channel || 'marketplace', unknownDeductor: !channel });
  }
  return { ok: true, ready, skipped, total: round2(ready.reduce((sum, line) => sum + line.taxDeducted, 0)), otherSections: parsed.otherSections, bySection: sectionTotals(ready) };
}

export function import26asCredits(state, args = {}) {
  const planned = plan26asCredits(state, args);
  if (!planned.ok) return planned;
  state.tdsCreditStatements = Array.isArray(state.tdsCreditStatements) ? state.tdsCreditStatements : [];
  const importedOn = localToday();
  for (const line of planned.ready) state.tdsCreditStatements.push({ section: line.section, tan: line.tan, name: line.name, date: line.date, quarter: line.quarter, channel: line.channel, amountPaid: line.amountPaid, taxDeducted: line.taxDeducted, importedOn });
  return { ok: true, imported: planned.ready.length, total: planned.total, skipped: planned.skipped, otherSections: planned.otherSections, bySection: planned.bySection, unknownDeductors: planned.ready.filter((line) => line.unknownDeductor).map((line) => line.tan) };
}

function recordedFromSettlements(state) {
  const tcs = {};
  const tds = {};
  for (const item of state.settlements || []) {
    const period = String(item.to || item.importedOn || '').slice(0, 7);
    if (!PERIOD.test(period)) continue;
    const tcsAmount = round2(Math.abs(item.totals?.tcs || 0));
    const tdsAmount = round2(Math.abs(item.totals?.tds || 0));
    if (tcsAmount) {
      const key = `${item.channel}|${period}`;
      tcs[key] = tcs[key] || { channel: item.channel, period, recorded: 0, settlements: [] };
      tcs[key].recorded = round2(tcs[key].recorded + tcsAmount);
      tcs[key].settlements.push(item.id);
    }
    if (tdsAmount) {
      const quarter = quarterOfDate(item.to || item.importedOn);
      const key = `${item.channel}|${quarter}`;
      tds[key] = tds[key] || { channel: item.channel, quarter, recorded: 0, settlements: [] };
      tds[key].recorded = round2(tds[key].recorded + tdsAmount);
      tds[key].settlements.push(item.id);
    }
  }
  return { tcs, tds };
}

export function marketplaceCredits(state, { fy } = {}) {
  const recorded = recordedFromSettlements(state);
  const tcsRows = { ...recorded.tcs };
  const reportedPeriods = new Set((state.tcsStatements || []).map((row) => row.period));
  for (const row of state.tcsStatements || []) {
    const key = `${row.channel}|${row.period}`;
    tcsRows[key] = tcsRows[key] || { channel: row.channel, period: row.period, recorded: 0, settlements: [] };
    tcsRows[key].reported = round2((tcsRows[key].reported || 0) + row.total);
    tcsRows[key].operatorGstin = row.gstin;
  }
  const tcs = Object.values(tcsRows).map((row) => {
    const reported = round2(row.reported || 0);
    const gap = round2(row.recorded - reported);
    const statementSeen = reportedPeriods.has(row.period);
    return { ...row, reported, gap, status: !statementSeen ? 'awaiting statement' : gap > 1 ? 'short in statement' : gap < -1 ? 'more in statement' : 'matched' };
  }).filter((row) => !fy || fyOfPeriod(row.period) === fy).sort((a, b) => a.period.localeCompare(b.period) || a.channel.localeCompare(b.channel));
  const tdsRows = { ...recorded.tds };
  const marketplaceStatements = (state.tdsCreditStatements || []).filter((row) => (row.section || '194O') === '194O');
  const seenQuarters = new Set(marketplaceStatements.map((row) => row.quarter));
  for (const row of marketplaceStatements) {
    const key = `${row.channel}|${row.quarter}`;
    tdsRows[key] = tdsRows[key] || { channel: row.channel, quarter: row.quarter, recorded: 0, settlements: [] };
    tdsRows[key].in26as = round2((tdsRows[key].in26as || 0) + row.taxDeducted);
    tdsRows[key].tan = row.tan;
  }
  const tds = Object.values(tdsRows).map((row) => {
    const in26as = round2(row.in26as || 0);
    const gap = round2(row.recorded - in26as);
    const seen = seenQuarters.has(row.quarter);
    return { ...row, in26as, gap, status: !seen ? 'awaiting 26AS' : gap > 1 ? 'short in 26AS' : gap < -1 ? 'more in 26AS' : 'matched' };
  }).filter((row) => !fy || row.quarter.endsWith(fy)).sort((a, b) => a.quarter.localeCompare(b.quarter) || a.channel.localeCompare(b.channel));
  const used = Object.values(state.gstPayments || {}).reduce((sum, p) => sum + round2(p.tcsUsed?.total || 0), 0);
  const tcsReported = round2(tcs.reduce((sum, row) => sum + row.reported, 0));
  return {
    ok: true,
    data: {
      fy: fy || '',
      tcs,
      tds,
      totals: {
        tcsRecorded: round2(tcs.reduce((sum, row) => sum + row.recorded, 0)),
        tcsReported,
        tcsUsedInGst: round2(used),
        tcsAvailable: round2(tcsReported - used),
        tdsRecorded: round2(tds.reduce((sum, row) => sum + row.recorded, 0)),
        tdsIn26as: round2(tds.reduce((sum, row) => sum + row.in26as, 0)),
      },
      channels: channels(state),
    },
  };
}

export function tcsAvailableFor(state, period, { excludePeriod = '', gstin } = {}) {
  const heads = { igst: 0, cgst: 0, sgst: 0, total: 0 };
  const principal = String(state.company?.gstin || '').toUpperCase();
  const wanted = String(gstin || principal).toUpperCase();
  const ours = (row) => !row.ourGstin || row.ourGstin === wanted || (!gstin && row.ourGstin === principal);
  for (const row of state.tcsStatements || []) {
    if (row.period > period || !ours(row)) continue;
    heads.igst = round2(heads.igst + (row.igst || 0));
    heads.cgst = round2(heads.cgst + (row.cgst || 0));
    heads.sgst = round2(heads.sgst + (row.sgst || 0));
    heads.total = round2(heads.total + (row.total || 0));
  }
  for (const [p, payment] of Object.entries(state.gstPayments || {})) {
    const [pPeriod, pGstin = principal] = String(p).split('@');
    if (pPeriod > period || pPeriod === excludePeriod || !payment.tcsUsed || pGstin !== wanted) continue;
    heads.igst = round2(heads.igst - (payment.tcsUsed.igst || 0));
    heads.cgst = round2(heads.cgst - (payment.tcsUsed.cgst || 0));
    heads.sgst = round2(heads.sgst - (payment.tcsUsed.sgst || 0));
    heads.total = round2(heads.total - (payment.tcsUsed.total || 0));
  }
  for (const head of ['igst', 'cgst', 'sgst', 'total']) heads[head] = Math.max(0, heads[head]);
  return heads;
}

export function creditsWords(data, money) {
  const lines = [];
  if (!data.tcs.length && !data.tds.length) return 'No TCS or TDS 194-O credit is recorded yet. They come from imported settlements; the portal\'s "TDS and TCS credit received" statement and Form 26AS confirm them.';
  lines.push(`GST TCS: ${money(data.totals.tcsRecorded)} deducted by marketplaces in settlements, ${money(data.totals.tcsReported)} confirmed by the portal statement, ${money(data.totals.tcsUsedInGst)} used against GST, ${money(data.totals.tcsAvailable)} available.`);
  for (const row of data.tcs.slice(-6)) lines.push(`· ${row.period} ${row.channel}: ${money(row.recorded)} in settlements, ${money(row.reported)} in the statement (${row.status})`);
  lines.push(`TDS 194-O: ${money(data.totals.tdsRecorded)} deducted in settlements, ${money(data.totals.tdsIn26as)} in Form 26AS.`);
  for (const row of data.tds.slice(-6)) lines.push(`· ${row.quarter} ${row.channel}: ${money(row.recorded)} in settlements, ${money(row.in26as)} in 26AS (${row.status})`);
  const unnamed = Object.keys(data.channels).length ? '' : ' Tell MyCA each marketplace\'s GSTIN and TAN ("amazon GSTIN ... TAN ...") so statements match by number, not by name.';
  return lines.join('\n') + unnamed;
}
