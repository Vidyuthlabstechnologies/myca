import { deadlines } from './sprint-load.mjs';
import { csvRows } from './text-safe.mjs';
import { getBook, normalizeClientId } from './books.mjs';
import { localToday } from './dates.mjs';
import { monthsBack, withFilings } from './filings.mjs';

const { complianceRun } = deadlines;
const DEADLINE_COLUMNS = ['clientId', 'name', 'entity', 'turnover', 'gst', 'qrmp', 'tdsDeductor', 'pf', 'esi', 'advanceTax', 'tp', 'state', 'profession', 'gstTds', 'presumptive'];
const NO_DOCS = 'clientId,period,returnType,docType,status,receivedDate,source\n';
const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MAX_DEADLINE_MONTHS = 60;
export const MAX_MONTHS_FROM_TODAY = 120;

function monthIndex(ym) {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + m - 1;
}

export function askedMonths(months, asOfDate) {
  if (!Array.isArray(months)) return { ok: true, months: undefined };
  const at = monthIndex(String(asOfDate).slice(0, 7));
  const asked = [...new Set(months.map(String))];
  if (!asked.length) return { ok: false, error: 'months needs at least one month, written like 2026-04.' };
  if (asked.length > MAX_DEADLINE_MONTHS) return { ok: false, error: `months allows at most ${MAX_DEADLINE_MONTHS} months.` };
  if (asked.some((ym) => !YEAR_MONTH.test(ym))) return { ok: false, error: 'Each month must be written like 2026-04.' };
  if (asked.some((ym) => Math.abs(monthIndex(ym) - at) > MAX_MONTHS_FROM_TODAY)) return { ok: false, error: 'Each month must be within ten years of the date asked for.' };
  return { ok: true, months: asked };
}

function yes(value) {
  return value === true || /^(y|yes|true|1)$/i.test(String(value ?? '').trim());
}

function deadlineProfile(clientId, company, extra, salesInvoices) {
  const gstin = String(company.gstin || '');
  const turnover = Number.isFinite(Number(extra.turnover)) && Number(extra.turnover) > 0
    ? Number(extra.turnover)
    : salesInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  return {
    clientId,
    name: company.name || clientId,
    entity: String(extra.entityType || company.entityType || 'proprietor').toLowerCase(),
    turnover: Math.round(turnover),
    gst: gstin ? 'TRUE' : 'FALSE',
    qrmp: String(extra.gstFrequency || company.gstFrequency || 'monthly').toLowerCase() === 'quarterly' ? 'TRUE' : 'FALSE',
    tdsDeductor: yes(extra.tdsDeductor ?? company.tdsDeductor) ? 'TRUE' : 'FALSE',
    pf: yes(extra.pf ?? company.pf) ? 'TRUE' : 'FALSE',
    esi: yes(extra.esi ?? company.esi) ? 'TRUE' : 'FALSE',
    advanceTax: yes(extra.advanceTax ?? company.advanceTax) ? 'TRUE' : 'FALSE',
    tp: yes(extra.transferPricing ?? company.transferPricing) ? 'TRUE' : 'FALSE',
    state: String(extra.state || company.state || gstin.slice(0, 2) || ''),
    profession: yes(extra.profession ?? company.profession) ? 'TRUE' : 'FALSE',
    gstTds: yes(extra.gstTds ?? company.gstTds) ? 'TRUE' : 'FALSE',
    presumptive: yes(extra.presumptive ?? company.presumptive) ? 'TRUE' : 'FALSE',
  };
}

function deadlineProfiles(root) {
  const profiles = [deadlineProfile('SELF', root.company || {}, {}, root.invoices || [])];
  for (const client of root.clients || []) {
    const book = root.extraBooks?.[client.clientId];
    profiles.push(deadlineProfile(client.clientId, { ...client, ...(book?.company || {}) }, client, book?.invoices || []));
  }
  return profiles;
}

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function withTdsDeposits(rows, bookOf) {
  return rows.map((row) => {
    if (row.returnType !== 'TDS_DEPOSIT' || row.filed) return row;
    const book = bookOf(row.clientId);
    const entries = (book?.tdsEntries || []).filter((entry) => entry.tds > 0);
    const inMonth = round2(entries.filter((entry) => entry.date.slice(0, 7) === row.period).reduce((sum, entry) => sum + entry.tds, 0));
    if (inMonth <= 0) return { ...row, level: 'nothing_due', filed: { arn: '', filedOn: '', late: false, nothingDeducted: true } };
    const owed = round2(entries.filter((entry) => entry.date.slice(0, 7) <= row.period).reduce((sum, entry) => sum + entry.tds, 0));
    let paid = 0;
    for (const deposit of [...(book?.tdsDeposits || [])].sort((a, b) => a.date.localeCompare(b.date))) {
      paid = round2(paid + deposit.amount);
      if (paid + 0.005 >= owed) return { ...row, level: 'filed', filed: { arn: deposit.challan, filedOn: deposit.date, late: deposit.date > row.dueDate } };
    }
    return row;
  });
}

export function deadlineRun(state, { asOfDate, months, holidaysText = '' } = {}) {
  const root = state.__root || state;
  const clientsText = csvRows([DEADLINE_COLUMNS, ...deadlineProfiles(root).map((p) => DEADLINE_COLUMNS.map((key) => p[key]))]);
  const window = askedMonths(months, asOfDate);
  if (!window.ok) throw new Error(window.error);
  const run = complianceRun({ clientsText, docsText: NO_DOCS, holidaysText }, { months: window.months, asOfDate });
  const bookOf = (clientId) => (clientId === 'SELF' ? root : getBook(root, clientId));
  return { ...run, deadlines: withTdsDeposits(withFilings(run.deadlines || [], bookOf), bookOf) };
}

export function filingRows(state, filedOn) {
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(filedOn || '')) ? filedOn : localToday();
  const clientId = normalizeClientId(state.activeClientId);
  return (deadlineRun(state, { asOfDate, months: monthsBack(asOfDate) }).deadlines || []).filter((row) => row.clientId === clientId);
}
