import { isoDate, localToday } from './dates.mjs';
const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/i;

export function normalizeChat(text) {
  const capped = String(text || '').slice(0, 4096).replace(/[\u2013\u2014]/g, '-').replace(/\s{3,}/g, (run) => (/[\n\r\u2028\u2029]/.test(run) ? '\n' : ' '));
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
const GLUED_CURRENCY = '(?<=(?<!\\w)(?:rs\\.?|inr))';
const FIGURE_START = `(?:(?<![\\w.,-])|${GLUED_CURRENCY})`;
const UNIT_WORDS = 'rolls?|pcs|pieces|units?|kgs?|nos?|boxes|bags|items?|bundles?|metres?|meters?|litres?|liters?|dozens?';

const HSN_SAID = /\b(?:hsn|sac)(?:\s*code)?\s*[:#-]?\s*(\d{4,8})\b/i;
const GST_RATE_PATTERNS = [
  /\bgst\s*(?:@|at|of|rate|is)?\s*(\d{1,2}(?:\.\d+)?)(?![\d,])\s*(?:%|percent|pct)?/i,
  /(?<![\d,.])(\d{1,2}(?:\.\d+)?)\s*(?:%|percent|pct)\s*(?:gst|tax)?/i,
];
const PER_UNIT = new RegExp(`(?:${NUM}\\s*([a-z]{1,15})?\\s+)?(?:\\bat\\b|@|\\brate\\b|\\beach\\s+at\\b|\\beach\\b)\\s*${CURRENCY}?\\s*${NUM}\\s*${MULTIPLIER}?(?![\\d%])`, 'i');
const QTY_WITH_UNIT = new RegExp(`${NUM}\\s*(${UNIT_WORDS})\\b`, 'i');
const QTY_LABEL = new RegExp(`\\b(?:qty|quantity)\\s*:?\\s*${NUM}`, 'i');
const AMOUNT = new RegExp(`${CURRENCY}?\\s*${FIGURE_START}${NUM}\\s*${MULTIPLIER}?(?![\\w%])`, 'gi');
const NOT_AMOUNTS = /\b[a-z]{2,6}-\d+\b|\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}\b|\b(?:diwali|deepavali|holi|pongal|onam|eid|christmas|navratri|dussehra|fy|year|financial\s+year)\s+(?:19|20)\d{2}\b|\b(?:19|20)\d{2}\s*-\s*(?:19|20)?\d{2}\b/gi;
const NEGATIVE_NUMBER = new RegExp(`${FIGURE_START}-\\s?\\d`, 'i');
const LONE_PLUS = /(?<![\w])\+(?=\d)/g;
const NON_POSITIVE_AMOUNT = new RegExp(`${FIGURE_START}(?:-\\s?\\d[\\d,]*(?:\\.\\d+)?|0+(?:\\.0+)?)(?![\\w%.])`, 'i');
export const MAX_CHAT_AMOUNT = 1e9;
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

function amountList(text) {
  return [...text.replace(NOT_AMOUNTS, ' ').matchAll(AMOUNT)].map((m) => amountValue(m[1], m[2])).filter((n) => n > 0);
}

function loneAmount(text) {
  const amounts = amountList(text);
  return amounts.length === 1 ? amounts[0] : null;
}

const WORDED_MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const MONTH_ORDER = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WORDED_DAY = new RegExp(`(?<![\\w.,-])(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${WORDED_MONTHS})\\b\\.?(?:,?\\s+((?:19|20)\\d{2})\\b)?|(${WORDED_MONTHS})\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+((?:19|20)\\d{2})\\b)?)(?![\\w-])`, 'gi');
const REFERENCE_WORDS = 'cheque|check|chq|cheq|dd|draft|ref|reference|utr|rrn|txn|trn|transaction|voucher|receipt|invoice|inv|bill|challan|order|po|payment|neft|rtgs|imps|upi';
const COUNT_NOUNS = 'invoice|bill|cheque|check|receipt|payment|instal+ment|tranche|part';
const COUNT_PLURALS = 'invoices|bills|cheques|checks|receipts|payments|instal+ments|tranches|parts';
const LABEL_AFTER_NOUN = '[\\s.]{0,3}(?:no\\.?|number|num|#|id)[\\s:#.-]{0,4}[a-z]{0,6}\\d';
const NUMBER_AFTER_NOUN = '\\s{0,3}(?:(?:no\\.?|number|#)\\s{0,3})?(?:of\\s+)?\\d{1,2}(?!\\d|[,.]\\d)';
const NOT_MONEY = new RegExp([
  `\\b(?:${REFERENCE_WORDS})[\\s.]{0,3}(?:no\\.?|number|num|#|id)[\\s:#.-]{0,4}[a-z]{0,6}\\d[\\w-]*`,
  '\\b(?:ref|reference|utr|rrn|txn|trn)[\\s:#.-]{0,4}[a-z]{0,6}\\d[\\w-]*',
  '\\b(?:cheque|chq|cheq)\\s{0,3}0\\d+\\b',
  '#\\s{0,2}[a-z]{0,6}\\d[\\w-]*',
  '\\binstal+ments?\\s{0,3}(?:(?:no\\.?|number|#)\\s{0,3})?(?:of\\s+)?\\d{1,2}(?!\\d|[,.]\\d)(?:\\s{0,3}(?:of|/|out\\s+of)\\s{0,3}\\d{1,2}(?!\\d|[,.]\\d))?',
  '\\b(?:of|out\\s+of)\\s+\\d{1,2}(?!\\d|[,.]\\d)\\s+(?:instal+ments?|parts?|tranches?|payments?)\\b',
  '\\b\\d[\\d,]*(?:\\.\\d+)?\\s*(?:-\\s*)?(?:days?|weeks?|months?)\\b',
  `(?<![\\w.,])(?:1(?!\\d|[,.]\\d)\\s{0,3}(?:${COUNT_NOUNS})|\\d{1,2}(?!\\d|[,.]\\d)\\s{0,3}(?:${COUNT_PLURALS}|(?:${COUNT_NOUNS})(?!${LABEL_AFTER_NOUN}|${NUMBER_AFTER_NOUN})))\\b`,
  '\\bnet\\s*\\d{1,3}(?!\\d|[,.]\\d)',
].join('|'), 'gi');

function wordedIso(day, monthWord, year, today) {
  const month = MONTH_ORDER.indexOf(monthWord.slice(0, 3).toLowerCase()) + 1;
  if (!month) return null;
  if (year) return isoDate(`${year}-${month}-${day}`);
  const thisYear = Number(today.slice(0, 4));
  const here = isoDate(`${thisYear}-${month}-${day}`);
  return here && here <= today ? here : isoDate(`${thisYear - 1}-${month}-${day}`);
}

function takeSaidDays(text, today) {
  const found = [];
  for (const hit of text.matchAll(WORDED_DAY)) {
    const [day, month, year] = hit[1] ? [hit[1], hit[2], hit[3]] : [hit[5], hit[4], hit[6]];
    const iso = wordedIso(Number(day), month, year, today);
    if (iso) found.push({ at: hit.index, end: hit.index + hit[0].length, iso });
  }
  if (found.length !== 1) return { rest: text, days: [] };
  return { rest: `${text.slice(0, found[0].at)} ${text.slice(found[0].end)}`, days: [found[0].iso] };
}

const FIGURE_OR_CHEQUE = new RegExp(`(\\b(?:cheque|chq|cheq)\\s{0,3}\\d{6,}\\b)|${FIGURE_START}\\d|(?:(?<![\\w.,])|${GLUED_CURRENCY})-\\s?\\d`, 'gi');

function takeReferences(text) {
  let seen = false;
  return text.replace(NOT_AMOUNTS, ' ').replace(NOT_MONEY, ' ').replace(FIGURE_OR_CHEQUE, (hit, cheque) => {
    if (!cheque) {
      seen = true;
      return hit;
    }
    return seen ? ' ' : hit;
  });
}

function hasNonPositive(text) {
  return NON_POSITIVE_AMOUNT.test(text.replace(NOT_AMOUNTS, ' '));
}

function moneyReading(text) {
  const { rest } = takeSaidDays(text, localToday());
  const all = amountList(rest);
  const zero = hasNonPositive(rest);
  if (all.length + (zero ? 1 : 0) < 2) return { list: all, nonPositive: zero };
  const firm = takeReferences(rest);
  const list = amountList(firm);
  const nonPositive = hasNonPositive(firm);
  return list.length || nonPositive ? { list, nonPositive } : { list: all, nonPositive };
}

export function amountsSaid(text) {
  return moneyReading(normalizeChat(text)).list;
}

export function soleAmountSaid(text) {
  const { list } = moneyReading(normalizeChat(text));
  return list.length === 1 ? list[0] : null;
}

function partyOf(text) {
  const stop = `(?=\\s*,|\\s+(?:gstin|at|@|rate|gst|qty|each|for|${CURRENCY}|\\d)|\\s*$)`;
  const name = "([A-Za-z][A-Za-z0-9 .&'-]{1,50}?)";
  const found = text.match(new RegExp(`\\b(?:${DOCUMENT_VERBS})\\s+(?:from|for|to)\\s+${name}${stop}`, 'i'))
    || text.match(new RegExp(`\\b(?:sold|sell|selling)\\b[^,]*?\\bto\\s+${name}${stop}`, 'i'))
    || text.match(new RegExp(`\\bfrom\\s+${name}${stop}`, 'i'))
    || text.match(new RegExp(`\\b(?:${DOCUMENT_VERBS})\\s+${name}${stop}`, 'i'));
  return cleanPartyName(found ? found[1] : '') || 'Walk-in';
}

// Returns the document a sentence describes, or null. The GST rate is null when the
// sentence does not state one: a rate is never assumed.
//   "10 rolls at 500"  -> ten at 500 each
//   "2 units 8000"     -> one line of 8000, the quantity kept in the description
const SAID_DATE = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/;

export function parseDocument(text) {
  const raw = normalizeChat(text).replace(LONE_PLUS, ' ');
  const gstinMatch = raw.match(GSTIN_RE);
  const gstin = gstinMatch ? gstinMatch[1].toUpperCase() : '';
  const withGstinOut = gstin ? raw.replace(gstinMatch[0], ' ') : raw;
  const hsnMatch = withGstinOut.match(HSN_SAID);
  const hsn = hsnMatch ? hsnMatch[1] : '';
  const withoutGstin = hsnMatch ? withGstinOut.replace(hsnMatch[0], ' ') : withGstinOut;
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
  if (NEGATIVE_NUMBER.test(raw)) return { problem: 'NEGATIVE_NUMBER' };
  if (line.rate * line.qty > MAX_CHAT_AMOUNT) return { problem: 'AMOUNT_TOO_LARGE' };
  if (gstRate != null) line.gstRate = gstRate;
  if (hsn) line.hsn = hsn;
  const said = withoutGstin.match(SAID_DATE);
  const date = said ? isoDate(said[1]) : '';
  if (said && !date) return { problem: 'INVALID_DATE', said: said[1] };
  return {
    partyName: partyOf(said ? withoutGstin.replace(said[0], ' ').replace(/\b(?:dated|date|on)\s*$/i, '') : withoutGstin),
    partyGstin: gstin,
    partyState: gstin.slice(0, 2),
    lines: [line],
    ...(date ? { date } : {}),
  };
}

export function receiptAmount(text) {
  return loneAmount(normalizeChat(text));
}

export function saidNonPositiveAmount(text) {
  const { list, nonPositive } = moneyReading(normalizeChat(text));
  return nonPositive && list.length !== 1;
}

export function documentProblemReply(doc, country = 'IN') {
  if (!doc || !doc.problem) return null;
  const abroad = country !== 'IN';
  const words = {
    NEGATIVE_NUMBER: 'A negative number cannot be part of an invoice or bill; use a credit note or a debit note for a reduction.',
    AMOUNT_TOO_LARGE: abroad
      ? 'That amount is larger than I will take from a chat message; enter it as a form if it is right.'
      : 'That amount is larger than I will take from a chat message (the limit is ₹100 crore); enter it as a form if it is right.',
    INVALID_DATE: abroad
      ? `${doc.said} is not a date I can read; say it as YYYY-MM-DD, or day first as DD/MM/YYYY, for example 15/03/2026.`
      : `${doc.said} is not a date I can read; say it as 2026-08-15 or 15/08/2026.`,
  }[doc.problem] || 'I could not read that.';
  return { kind: 'reply', reply: `${words} I have recorded nothing.`, tools: [] };
}


// Money received is dated the day it is recorded unless the sentence gives a date.
// Without this a receipt would silently take the date of the invoice it settles.
const RELATIVE_PAST_DAY = /\b(?:(?:the\s+)?day\s+before\s+yesterday|yesterday)\b/i;

function daysBefore(today, count) {
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - count);
  return day.toISOString().slice(0, 10);
}

export function receiptDate(text, today) {
  const raw = normalizeChat(text);
  const said = raw.match(SAID_DATE);
  if (said) return said[1];
  const relative = raw.match(RELATIVE_PAST_DAY);
  if (relative && /^\d{4}-\d{2}-\d{2}$/.test(String(today))) return daysBefore(today, /before/i.test(relative[0]) ? 2 : 1);
  return today;
}

export function moneyDate(text, today) {
  const raw = normalizeChat(text);
  const said = raw.match(SAID_DATE);
  if (said) return said[1];
  const { days } = takeSaidDays(raw, today);
  return days.length === 1 ? days[0] : receiptDate(raw, today);
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
  { re: /\bcan\s+i\s+(?:make|pay|afford|cover)\s+(?:the\s+)?(?:payroll|salaries)\b|\bsalar(?:y|ies)\s+(?:de|nikal)\s+pa(?:u|yu|a)nga\b|\bwill\s+(?:the\s+)?payroll\s+clear\b|\bpayroll\s+clear\b/i, tool: 'can_make_payroll' },
  { re: /\bhow(?:'s| is| are)\s+(?:the\s+|my\s+)?business(?:\s+(?:doing|going))?\b|\bweekly\s+brief\b|\bmonday\s+brief\b|\bfriday\s+recap\b|\bbusiness\s+pulse\b|\bdhanda\s+kaisa\b|\bkaisa\s+chal\s+raha\b|\bstart\s+my\s+week\b/i, tool: 'weekly_brief' },
  { re: /\b(?:this|the|coming|next)\s+week\b|\bweek\s+ahead\b|\bwhat(?:'s| is)\s+due\b|\bdue\s+(?:this|next)\s+week\b/i, tool: 'week_ahead' },
  { re: /\bclosed\s+years\b|\byear[\s-]?end\s+status\b|\bwhich\s+years?\s+(?:are|is)\s+closed\b/i, tool: 'list_year_closings' },
  { re: /\bform\s*16a?\b|\btds\s+certificates?\b/i, tool: 'tds_certificates' },
  { re: /\b1099\s*(?:-|\s)?nec\s+(?:file|data|forms?|csv)\b|\bprepare\s+(?:the\s+)?1099s?\b|\b1099\s+file\b/i, tool: 'contractor_1099_file' },
  { re: /\bannexure\s*(?:ii|2)\b|\bsalary\s+annexure\b|\b24q\s+annexure\b/i, tool: 'salary_annexure' },
  { re: /\bschedule\s*se\b|\bself[\s-]?employment\s+tax\b/i, tool: 'schedule_se' },
  { re: /\bcpa\s+pack\b|\bpack\s+for\s+(?:my\s+)?cpa\b/i, tool: 'cpa_pack' },
  { re: /\bamendments?\b.*\b(?:list|made|this\s+month|for)\b|\blist\s+amendments\b|\bamended\s+invoices\b/i, tool: 'list_amendments' },
  { re: /\bdaily\s+checks?\b|\bautomation\s+status\b|\bwhat\s+(?:did|has)\s+(?:the\s+)?automation\b|\bdid\s+the\s+checks\s+run\b/i, tool: 'automation_status' },
  { re: /\brules?\s+status\b|\bstatutory\s+rules\b|\brules\s+(?:current|up\s*to\s*date|updated)\b|\bare\s+(?:the\s+)?(?:tax\s+)?rules\s+(?:current|up\s*to\s*date)\b/i, tool: 'rules_status' },
  { re: /\b(?:my|open|show|list|what are my)\s+reminders\b|^\s*reminders\s*$/i, tool: 'list_reminders' },
  { re: /\b(?:my|show|list|all)\s+employees\b|^\s*employees\s*$/i, tool: 'list_employees' },
  { re: /\b(?:my|show|list|which)\s+(?:filings|filed\s+returns|returns\s+(?:are\s+|were\s+)?filed)\b|^\s*filings\s*$/i, tool: 'list_filings' },
  { re: /\bcheck\s+(?:my\s+|the\s+)?books\b|\bbooks?\s+(?:check|health)\b|\bhealth\s*check\b/i, tool: 'books_check' },
  { re: /\bprofit\s*(?:and|&|n)\s*loss\b|\bp\s*&\s*l\b|\bincome\s+statement\b|\bhow\s+much\s+profit\b|\bam\s+i\s+(?:in\s+profit|making\s+(?:a\s+)?profit)\b/i, tool: 'profit_and_loss' },
  { re: /\bbalance\s*sheet\b/i, tool: 'balance_sheet' },
  { re: /\bcash\s*flow\s+statement\b|\bstatement\s+of\s+cash\s*flows?\b|\bwhere\s+did\s+(?:my\s+|the\s+)?(?:cash|money)\s+go\b/i, tool: 'cash_flow_statement' },
  { re: /\b(?:export|save|download|send)\b.*\btrial\s*balance\b|\btrial\s*balance\b.*\b(?:for\s+(?:my\s+)?ca|csv|file|export)\b/i, tool: 'export_trial_balance' },
  { re: /\btrial\s*balance\b|\bdoes (the )?books? tie\b/i, tool: 'trial_balance' },
  { re: /\bchart of accounts\b|\bcoa\b/i, tool: 'chart_of_accounts' },
  { re: /\bjournal\b|\bday book\b/i, tool: 'journal' },
  { re: /\blist invoices\b|\bshow invoices\b/i, tool: 'list_invoices' },
  { re: /\bgst payable\b|\bgst liability\b|\bhow much gst\b/i, tool: 'gst_payable' },
  { re: /\btally\s+(?:file|export|xml)\b|\bexport\b.*\btally\b|\bfor\s+tally\b/i, tool: 'export_tally' },
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
  { re: /^(?![\s\S]*\b(?:gst\w*|gstr-?2b|2b|tds|26as)\b)[\s\S]*(?:\breconcil\w*\b[\s\S]*\b(?:bank|statement)\b|\b(?:bank|statement)\b[\s\S]*\breconcil\w*|\bbank\s+recon\b|\bmatch(?:ing)?\s+(?:the\s+|my\s+|our\s+)?bank\b)/i, tool: 'bank_reconciliation' },
  { re: /\bgstr-?2b\b|\b2b\b|\breconcil(?![\s\S]*\b(?:bank|statement)\b)|\brule 37/i, tool: 'gst_reconcile' },
  { re: /\baudit\b|\bworking paper\b|\bcaro\b|\b3cd\b/i, tool: 'audit_books' },
  { re: /\bexceptions?\b|\bneeds? (my )?attention\b|\bwork ?queue\b|\bwhat needs (doing|fixing|attention)\b/i, tool: 'exceptions' },
  { re: /\bapprovals?\b|\bpending approvals?\b/i, tool: 'approval_list' },
  { re: /\bcompany\b|\bour gstin\b/i, tool: 'company_profile' },
];
