import { saidPeriod } from './filing-intent.mjs';
import { countryOf } from './country.mjs';
import { localToday } from './dates.mjs';
import { inWords } from './words.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { isNegated } from './intent.mjs';
import { EXCEL_PERIOD_WORDS, AUDIT_TRAIL_PHRASES, nameKey, financialYearSaid } from './chat-words.mjs';
import { latestTwobMonth, hasTwobFor, imsPeriodReading, imsMonthUnread, namesAnImsParty } from './ims-intent.mjs';
import { AUDIT_RANGE_UNREAD, auditRangeSaid, auditExportNarrowing } from './audit-trail-intent.mjs';

const EXCEL_SAID = /\b(?:excel|xlsx|spreadsheet)\b/i;
const EXCEL_THEN_WORD = /\b(?:excel|xlsx|spreadsheet)\s+([a-z0-9&.'-]+)/gi;
const EXCEL_VERBS = /\b(?:export|save|download|prepare|generate|make|send|give|get|want|need|put|print)\b/i;
const EXCEL_AFTER_PREPOSITION = /\b(?:to|as|in|into)\s+(?:an?\s+|the\s+)?(?:excel|xlsx|spreadsheet)\b/i;
const EXCEL_OF = /\b(?:excel|xlsx|spreadsheet)\s+(?:file\s+|sheet\s+|workbook\s+)?(?:of|with)\b/i;
const NOT_AN_EXPORT = /\b(?:import|upload|attach|bring\s+in|read)\b/i;
const POSTING_VERBS = /\b(?:sold|sell|selling|invoice|invoiced|billed|bought|buy|purchased|received|receipt|collected|paid|pay|spent|spend|expense)\b/i;
const SAVED_REPORT_TO_EXCEL = /\breport\s+(?:called\s+|named\s+)?["“]?([^"”]+?)["”]?\s+(?:to|as|in|into)\s+(?:an?\s+|the\s+)?(?:excel|xlsx|spreadsheet)\b/i;

const EXCEL_REPORTS = [
  { key: 'audit_trail', words: new RegExp(AUDIT_TRAIL_PHRASES, 'i') },
  { key: 'trial_balance', words: /\btrial\s*balance\b/i },
  { key: 'tds_credit_check', words: /\b26\s*as\b|\btds\s+(?:credits?|receivables?)\b/i },
  { key: 'ims_review', words: /\bims\b|\binvoice\s+management\b/i },
  { key: 'bank_reconciliation', words: /\bbank\b|^(?![\s\S]*\b(?:gst\w*|2b|tds|26\s*as|itc)\b)[\s\S]*\breconcil/i },
  { key: 'day_book', words: /\bday\s*book\b|\bjournal\b|\bledger\b/i },
  { key: 'entries', words: /\bentries\b|\bvouchers?\b/i },
  { key: 'credit_notes', words: /\bcredit\s*notes?\b/i },
  { key: 'debit_notes', words: /\bdebit\s*notes?\b/i },
  { key: 'credit_at_risk', words: /\bcredit\s+at\s+risk\b|\bgstr-?2b\b|\b2b\b/i },
  { key: 'supplier_dues', words: /\b(?:supplier|vendor|creditor)s?\b.*\b(?:dues?|owe|owed|owing|outstanding|unpaid|bills?)\b|\bpayables?\b|\b(?:i|we)\s+owe\b/i },
  { key: 'customer_dues', words: /\bdues?\b|\bowed?\b|\bowes\b|\breceivables?\b|\bdebtors?\b|\boutstanding\b|\bunpaid\b|\boverdue\b/i },
  { key: 'saved_report', words: /\bsaved\s+report\b/i },
  { key: 'cash_forecast', words: /\bcash\s*forecast\b|\bforecast\b|\bcash\s*flow\b/i },
  { key: 'tds_summary', words: /\btds\b/i },
  { key: 'sku_margins', words: /\bmargins?\b/i },
  { key: 'stock_position', words: /\bstock\b|\binventory\b/i },
  { key: 'gst_period_summary', words: /\bgst\b|\bgstr/i },
  { key: 'business_summary', words: /\bbusiness\s+summary\b|\bat\s+a\s+glance\b|\bsummary\b/i },
  { key: 'sales', words: /\bsales?\b|\binvoices?\b|\bsold\b/i },
  { key: 'purchases', words: /\bpurchases?\b|\bbills?\b|\bbought\b/i },
  { key: 'expenses', words: /\bexpenses?\b|\bspending\b/i },
];

function excelPartyNames(state) {
  const names = new Set();
  const add = (name) => {
    if (name && EXCEL_SAID.test(name)) names.add(nameKey(name));
  };
  for (const party of state.parties || []) add(party?.name);
  for (const inv of state.invoices || []) add(inv?.partyName);
  for (const bill of state.purchases || []) add(bill?.partyName);
  for (const expense of state.expenses || []) add(expense?.payee);
  return [...names].filter(Boolean);
}

function namesAnExcelParty(text, partyNames) {
  const haystack = ` ${nameKey(text)} `;
  if (partyNames.some((name) => haystack.includes(` ${name} `))) return true;
  const partyWords = new Set(partyNames.flatMap((name) => name.split(' ')).filter((word) => word.length >= 3 && !EXCEL_SAID.test(word)));
  for (const found of text.matchAll(EXCEL_THEN_WORD)) if (partyWords.has(nameKey(found[1]))) return true;
  return false;
}

export function excelPlanWaits(text) {
  if (EXCEL_VERBS.test(text)) return false;
  return POSTING_VERBS.test(text.slice(0, text.search(EXCEL_SAID)));
}

const FINANCIAL_YEAR_UNREAD = 'I could not read that financial year. Say it like "FY 2025-26", which runs from 1 April 2025 to 31 March 2026.';

export function planExcelFromChat(state, text) {
  if (!EXCEL_SAID.test(text) || isNegated(text) || NOT_AN_EXPORT.test(text)) return null;
  if (namesAnExcelParty(text, excelPartyNames(state))) return null;
  if (!EXCEL_VERBS.test(text) && !EXCEL_AFTER_PREPOSITION.test(text) && !EXCEL_OF.test(text)) return null;
  const saved = SAVED_REPORT_TO_EXCEL.exec(text);
  if (saved) return { kind: 'tool', name: 'export_xlsx', args: { report: 'saved_report', name: saved[1].trim() } };
  const imsParty = namesAnImsParty(state, text);
  const found = EXCEL_REPORTS.find((entry) => !(imsParty && entry.key === 'ims_review') && entry.words.test(text));
  const report = found ? found.key : 'trial_balance';
  if (report === 'audit_trail') {
    const range = auditRangeSaid(text);
    if (!range) return { kind: 'reply', reply: AUDIT_RANGE_UNREAD, tools: [] };
    const narrowed = auditExportNarrowing(text);
    return { kind: 'tool', name: 'export_xlsx', args: { report, ...range, ...narrowed.args }, ...(narrowed.note ? { note: narrowed.note } : {}) };
  }
  const named = EXCEL_PERIOD_WORDS.exec(text);
  const period = named ? named[1].toLowerCase().replace(/\s+/g, '-') : saidPeriod(text);
  if (report === 'ims_review' && countryOf(state) === 'IN') return planImsSheetFromChat(state, text, period);
  const from = /\b(?:from|since|starting)\s+(\d{4}-\d{2}-\d{2})\b/i.exec(text);
  const to = /\b(?:to|till|until|up\s+to)\s+(\d{4}-\d{2}-\d{2})\b/i.exec(text);
  if (from || to) return { kind: 'tool', name: 'export_xlsx', args: { report, ...(from ? { from: from[1] } : {}), ...(to ? { to: to[1] } : {}) } };
  if (report === 'tds_credit_check') {
    const year = financialYearSaid(text);
    if (year && year.unreadable) return { kind: 'reply', reply: FINANCIAL_YEAR_UNREAD, tools: [] };
    if (year) return { kind: 'tool', name: 'export_xlsx', args: { report, from: year.from, to: year.to } };
  }
  return { kind: 'tool', name: 'export_xlsx', args: { report, ...(period ? { period } : {}) } };
}

function planImsSheetFromChat(state, text, period) {
  const asMonth = !period || isReturnPeriod(period) || period === 'this-month' || period === 'last-month';
  if (!asMonth) return { kind: 'tool', name: 'export_xlsx', args: { report: 'ims_review', period } };
  const reading = imsPeriodReading(text);
  if (reading.unread) return imsMonthUnread(state, 'ims review in excel for');
  const month = reading.period || latestTwobMonth(state) || localToday().slice(0, 7);
  if (!hasTwobFor(state, month)) return { kind: 'reply', reply: inWords(`Add the GSTR-2B for ${month} first.`), tools: [] };
  return { kind: 'tool', name: 'export_xlsx', args: { report: 'ims_review', period: month } };
}
