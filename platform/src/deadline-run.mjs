import { deadlines } from './sprint-load.mjs';
import { csvRows } from './text-safe.mjs';
import { getBook, normalizeClientId } from './books.mjs';
import { localToday } from './dates.mjs';
import { monthsBack, withFilings } from './filings.mjs';

const { complianceRun } = deadlines;
const DEADLINE_COLUMNS = ['clientId', 'name', 'entity', 'turnover', 'gst', 'qrmp', 'tdsDeductor', 'pf', 'advanceTax', 'tp', 'state', 'profession', 'gstTds', 'presumptive'];
const NO_DOCS = 'clientId,period,returnType,docType,status,receivedDate,source\n';

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

export function deadlineRun(state, { asOfDate, months, holidaysText = '' } = {}) {
  const root = state.__root || state;
  const clientsText = csvRows([DEADLINE_COLUMNS, ...deadlineProfiles(root).map((p) => DEADLINE_COLUMNS.map((key) => p[key]))]);
  const run = complianceRun({ clientsText, docsText: NO_DOCS, holidaysText }, { months, asOfDate });
  const bookOf = (clientId) => (clientId === 'SELF' ? root : getBook(root, clientId));
  return { ...run, deadlines: withFilings(run.deadlines || [], bookOf) };
}

export function filingRows(state, filedOn) {
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(filedOn || '')) ? filedOn : localToday();
  const clientId = normalizeClientId(state.activeClientId);
  return (deadlineRun(state, { asOfDate, months: monthsBack(asOfDate) }).deadlines || []).filter((row) => row.clientId === clientId);
}
