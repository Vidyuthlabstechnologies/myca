import { rule } from '../../sprints/statutory-rules/src/index.mjs';
import { localToday } from './dates.mjs';

const FY_LABEL = /^\d{4}-\d{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

export function fyLabelOf(date) {
  const [y, m] = String(date).split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function isFyLabel(label) {
  const text = String(label || '');
  return FY_LABEL.test(text) && Number(text.slice(5)) === (Number(text.slice(0, 4)) + 1) % 100;
}

export function previousFyLabel(label) {
  const start = Number(String(label).slice(0, 4)) - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function fyBounds(label) {
  const start = Number(label.slice(0, 4));
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

export function booksTurnover(state, fy) {
  const { from, to } = fyBounds(fy);
  const inYear = (doc) => doc && doc.date >= from && doc.date <= to && doc.country !== 'US';
  const sales = (state.invoices || []).filter((doc) => inYear(doc) && doc.kind !== 'purchase' && doc.status !== 'cancelled');
  if (!sales.length) return null;
  const sum = (rows) => rows.reduce((total, doc) => total + Number(doc.taxable || 0), 0);
  const credits = sum((state.creditNotes || []).filter((note) => inYear(note) && !note.cancels));
  const debits = sum((state.debitNotes || []).filter(inYear));
  return round2(Math.max(0, sum(sales) + debits - credits));
}

export function aatoFor(state, onDate) {
  const fy = previousFyLabel(fyLabelOf(ISO_DATE.test(String(onDate || '')) ? onDate : localToday()));
  const company = state?.company || {};
  const entered = company.aatoByFy?.[fy];
  if (entered != null && Number.isFinite(Number(entered))) return { fy, rupees: round2(entered), source: 'entered', estimated: false };
  if (company.aato != null && company.aato !== '' && Number.isFinite(Number(company.aato))) return { fy, rupees: round2(company.aato), source: 'entered-undated', estimated: false };
  if (company.grossTurnoverPrevFy != null && company.grossTurnoverPrevFy !== '' && Number.isFinite(Number(company.grossTurnoverPrevFy))) return { fy, rupees: round2(company.grossTurnoverPrevFy), source: 'entered-undated', estimated: false };
  const books = booksTurnover(state || {}, fy);
  if (books != null) return { fy, rupees: books, source: 'books', estimated: true };
  return { fy, rupees: null, source: 'unknown', estimated: true };
}

export function aatoWords(aato) {
  if (aato.rupees == null) return `aggregate turnover for FY ${aato.fy} is not on file`;
  const amount = `₹${aato.rupees.toLocaleString('en-IN')}`;
  if (aato.source === 'books') return `aggregate turnover for FY ${aato.fy} is estimated at ${amount} from the sales in these books (every GSTIN on the PAN counts; enter the figure if it differs)`;
  return `aggregate turnover for FY ${aato.fy} is ${amount} as entered`;
}

export function hsnDigitsRule(onDate) {
  const found = rule('gst.hsn.digits', onDate);
  return found.ok ? found : null;
}

export function hsnDigitsNeeded(aatoRupees, onDate) {
  const found = hsnDigitsRule(onDate);
  if (!found || aatoRupees == null) return null;
  const aatoPaise = Math.round(Number(aatoRupees) * 100);
  const tier = found.value.tiers.find((item) => item.aatoPaiseUpTo === null || aatoPaise <= item.aatoPaiseUpTo);
  return { digits: tier.digits, b2cMayOmit: aatoPaise <= found.value.unregisteredRecipientMayOmitUpToAatoPaise, record: found.record };
}

function addDays(date, days) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export function irnReportingWindow(state, doc, today) {
  const found = rule('gst.einvoice.reporting-window', today);
  const date = String(doc?.date || '');
  if (!found.ok || !ISO_DATE.test(date)) return { status: 'none' };
  const { aatoPaiseAtLeast, days, documentDateIsDayOne } = found.value;
  const lastDay = addDays(date, documentDateIsDayOne ? days - 1 : days);
  const aato = aatoFor(state, today);
  const thresholdRupees = aatoPaiseAtLeast / 100;
  const base = { lastDay, days, thresholdRupees, aato, ruleId: 'gst.einvoice.reporting-window', source: found.record.source };
  if (today <= lastDay) return { status: 'open', ...base };
  if (aato.rupees != null && aato.rupees >= thresholdRupees) return { status: 'closed', ...base };
  if (aato.rupees != null && !aato.estimated) return { status: 'not-applicable', ...base };
  return { status: 'unknown', ...base };
}

export function aatoForPeriod(state, fp) {
  const text = String(fp || '');
  if (!/^\d{6}$/.test(text)) return aatoFor(state);
  return aatoFor(state, `${text.slice(2)}-${text.slice(0, 2)}-01`);
}

export function booksAatoOpts(state, fp) {
  const aato = aatoForPeriod(state, fp);
  return aato.source === 'books' ? { aato: aato.rupees, aatoEstimated: true } : {};
}
