const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/i;

export function normalizeChat(text) {
  const capped = String(text || '').slice(0, 4096).replace(/[\u2013\u2014]/g, '-');
  return (capped.includes(' - ')
    ? capped.replace(/\s+-\s+(books|itc|ap|gst input|follow).*$/i, '')
    : capped
  ).trim();
}

const PARTY_KEYWORDS = /^(at|rate|for|from|to|gstin|gst|invoice|purchase|bill|sale|sales)$/i;

function cleanPartyName(candidate) {
  if (!candidate) return '';
  const name = String(candidate).trim().replace(/[.,]$/, '');
  if (!name || PARTY_KEYWORDS.test(name)) return '';
  return name;
}

const QUESTION_OPENERS = /^\s*(?:what|which|when|where|why|who|whose|whom|how|is|are|was|were|am|has|have|had|does|did|do|can|could|should|would|will|may|might|shall|show|list|tell|explain|status|any|anything)\b/i;
const NEGATIONS = /\b(?:do\s*not|don'?t|never|stop|avoid|cancel|without|no\s+need)\b/i;

// A question about the books must never change the books.
export function isQuestion(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return false;
  if (/\?\s*$/.test(raw)) return true;
  return QUESTION_OPENERS.test(raw);
}

export function isNegated(text) {
  return NEGATIONS.test(String(text == null ? '' : text));
}

const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)';
const MULTIPLIER = '(k|lakhs?|lacs?|cr|crores?)';
const CURRENCY = '(?:₹|rs\\.?|inr)';
const UNIT_WORDS = 'rolls?|pcs|pieces|units?|kgs?|nos?|boxes|bags|items?|bundles?|metres?|meters?|litres?|liters?|dozens?';

const GST_RATE_PATTERNS = [
  /\bgst\s*(?:@|at|of|rate|is)?\s*(\d{1,2}(?:\.\d+)?)(?![\d,])\s*(?:%|percent|pct)?/i,
  /(?<![\d,.])(\d{1,2}(?:\.\d+)?)\s*(?:%|percent|pct)\s*(?:gst|tax)?/i,
];
const PER_UNIT = new RegExp(`(?:${NUM}\\s*([a-z]{1,15})?\\s+)?(?:\\bat\\b|@|\\brate\\b|\\beach\\s+at\\b|\\beach\\b)\\s*${CURRENCY}?\\s*${NUM}\\s*${MULTIPLIER}?(?![\\d%])`, 'i');
const QTY_WITH_UNIT = new RegExp(`${NUM}\\s*(${UNIT_WORDS})\\b`, 'i');
const QTY_LABEL = new RegExp(`\\b(?:qty|quantity)\\s*:?\\s*${NUM}`, 'i');
const AMOUNT = new RegExp(`${CURRENCY}?\\s*(?<![\\w.,-])${NUM}\\s*${MULTIPLIER}?(?![\\w%])`, 'gi');
const NOT_AMOUNTS = /\b[a-z]{2,6}-\d+\b|\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b/gi;
const DOCUMENT_VERBS = 'purchase|purchased|invoice|bill|sale|sales|sold|sell|bought';

function amountValue(digits, multiplier = '') {
  const base = Number(String(digits).replace(/,/g, ''));
  const unit = String(multiplier || '').toLowerCase();
  if (unit === 'k') return base * 1e3;
  if (/^(lakh|lakhs|lac|lacs)$/.test(unit)) return base * 1e5;
  if (/^(cr|crore|crores)$/.test(unit)) return base * 1e7;
  return base;
}

// The rate is taken out of the sentence before anything else is read, so "8000 at 18%"
// can never be read as a price of 18.
function takeGstRate(text) {
  for (const pattern of GST_RATE_PATTERNS) {
    const found = text.match(pattern);
    if (found) return { gstRate: Number(found[1]), rest: text.replace(found[0], ' ') };
  }
  return { gstRate: null, rest: text };
}

function takeQuantity(text) {
  const found = text.match(QTY_WITH_UNIT) || text.match(QTY_LABEL);
  if (!found) return { qty: null, unit: '', rest: text };
  return { qty: amountValue(found[1]), unit: String(found[2] || 'units').toLowerCase(), rest: text.replace(found[0], ' ') };
}

function loneAmount(text) {
  const amounts = [...text.replace(NOT_AMOUNTS, ' ').matchAll(AMOUNT)].map((m) => amountValue(m[1], m[2])).filter((n) => n > 0);
  return amounts.length === 1 ? amounts[0] : null;
}

function partyOf(text) {
  const stop = `(?=\\s*,|\\s+(?:gstin|at|@|rate|gst|qty|each|for|${CURRENCY}|\\d)|\\s*$)`;
  const name = "([A-Za-z][A-Za-z0-9 .&'-]{1,50}?)";
  const found = text.match(new RegExp(`\\b(?:${DOCUMENT_VERBS})\\s+(?:from|for|to)\\s+${name}${stop}`, 'i'))
    || text.match(new RegExp(`\\bfrom\\s+${name}${stop}`, 'i'))
    || text.match(new RegExp(`\\b(?:${DOCUMENT_VERBS})\\s+${name}${stop}`, 'i'));
  return cleanPartyName(found ? found[1] : '') || 'Walk-in';
}

// Returns the document a sentence describes, or null. The GST rate is null when the
// sentence does not state one: a rate is never assumed.
//   "10 rolls at 500"  -> ten at 500 each
//   "2 units 8000"     -> one line of 8000, the quantity kept in the description
export function parseDocument(text) {
  const raw = normalizeChat(text);
  const gstinMatch = raw.match(GSTIN_RE);
  const gstin = gstinMatch ? gstinMatch[1].toUpperCase() : '';
  const withoutGstin = gstin ? raw.replace(gstinMatch[0], ' ') : raw;
  const { gstRate, rest } = takeGstRate(withoutGstin);

  let line = null;
  const perUnit = rest.match(PER_UNIT);
  if (perUnit) {
    const labelled = perUnit[1] ? null : takeQuantity(rest.replace(perUnit[0], ' '));
    line = {
      description: 'Supply',
      qty: perUnit[1] ? amountValue(perUnit[1]) : (labelled && labelled.qty) || 1,
      rate: amountValue(perUnit[3], perUnit[4]),
    };
  } else if (isPurchaseIntent(raw) || isSaleIntent(raw)) {
    const quantity = takeQuantity(rest);
    const total = loneAmount(quantity.rest);
    if (total != null) {
      line = { description: quantity.qty ? `Supply (${quantity.qty} ${quantity.unit})` : 'Supply', qty: 1, rate: total };
    }
  }
  if (!line || !(line.rate > 0) || !(line.qty > 0)) return null;
  if (gstRate != null) line.gstRate = gstRate;
  return {
    partyName: partyOf(withoutGstin),
    partyGstin: gstin,
    partyState: gstin.slice(0, 2),
    lines: [line],
  };
}

export function receiptAmount(text) {
  return loneAmount(normalizeChat(text));
}

const SAID_DATE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/;

// Money received is dated the day it is recorded unless the sentence gives a date.
// Without this a receipt would silently take the date of the invoice it settles.
export function receiptDate(text, today) {
  const said = normalizeChat(text).match(SAID_DATE);
  return said ? said[1] : today;
}

export function isPurchaseIntent(text) {
  const t = normalizeChat(text).toLowerCase();
  if (/\b(purchase|purchases|vendor|supplier|itc)\b/.test(t)) return true;
  if (/\bbill from\b|\bbuy from\b|\bbought\b/.test(t)) return true;
  return false;
}

export function isSaleIntent(text) {
  const t = normalizeChat(text).toLowerCase();
  if (isPurchaseIntent(t)) return false;
  return /\b(invoice|raise bill|create bill|tax invoice|sell|sold|sales? to)\b/.test(t);
}

export const ROUTES = [
  { re: /\b(?:my|open|show|list|what are my)\s+reminders\b|^\s*reminders\s*$/i, tool: 'list_reminders' },
  { re: /\b(?:my|show|list|all)\s+employees\b|^\s*employees\s*$/i, tool: 'list_employees' },
  { re: /\b(?:my|show|list|which)\s+(?:filings|filed\s+returns|returns\s+(?:are\s+|were\s+)?filed)\b|^\s*filings\s*$/i, tool: 'list_filings' },
  { re: /\bcheck\s+(?:my\s+|the\s+)?books\b|\bbooks?\s+(?:check|health)\b|\bhealth\s*check\b/i, tool: 'books_check' },
  { re: /\btrial\s*balance\b|\bdoes (the )?books? tie\b/i, tool: 'trial_balance' },
  { re: /\bchart of accounts\b|\bcoa\b/i, tool: 'chart_of_accounts' },
  { re: /\bjournal\b|\bday book\b/i, tool: 'journal' },
  { re: /\blist invoices\b|\bshow invoices\b/i, tool: 'list_invoices' },
  { re: /\bgst payable\b|\bgst liability\b|\bhow much gst\b/i, tool: 'gst_payable' },
  { re: /\bgstr-?1\s*json\b|\bexport gstr/i, tool: 'export_gstr1_json' },
  { re: /\bgstr-?1\b|\bprepare gstr 1\b/i, tool: 'prepare_gstr1' },
  { re: /\bprobe govt\b|\bconnect gst\b|\bgovt status\b|\bnic sandbox\b/i, tool: 'govt_probe' },
  { re: /\bnic auth\b|\be-?invoice auth\b/i, tool: 'govt_nic_auth' },
  { re: /\bfiling pack\b|\bfile gst\b/i, tool: 'filing_pack' },
  { re: /\bsandbox\b.*\b(adapter|operation|handoff|plan)\b|\badapter\b.*\bsandbox\b/i, tool: 'sandbox_adapter_plan' },
  { re: /\b(sandbox|quicko|provider catalog|provider map|provider coverage|api provider)\b/i, tool: 'provider_catalog' },
  { re: /\b(api|integration|connector|requirements?|prd).*(readiness|needed|needs|status|ids?)|\bwhat apis\b/i, tool: 'integration_readiness' },
  { re: /\bgstr-?3b\b/i, tool: 'prepare_gstr3b' },
  { re: /\bitr\b|\bregime compare\b/i, tool: 'prepare_itr' },
  { re: /\btds\b/i, tool: 'monitor_tds' },
  { re: /\bdeadline|\bdue date\b/i, tool: 'deadlines' },
  { re: /\breconcil|\bgstr-?2b\b|\brule 37/i, tool: 'gst_reconcile' },
  { re: /\baudit\b|\bworking paper\b|\bcaro\b|\b3cd\b/i, tool: 'audit_books' },
  { re: /\bexceptions?\b|\bneeds? (my )?attention\b|\bwork ?queue\b|\bwhat needs (doing|fixing|attention)\b/i, tool: 'exceptions' },
  { re: /\bapprovals?\b|\bpending approvals?\b/i, tool: 'approval_list' },
  { re: /\bcompany\b|\bour gstin\b/i, tool: 'company_profile' },
];
