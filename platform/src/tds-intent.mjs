import { isNegated, isQuestion, normalizeChat, receiptAmount, receiptDate } from './intent.mjs';
import { isoDate, localToday } from './dates.mjs';
import { countryOf, formatMoney, toolServesCountry } from './country.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { tdsCreditCheck, tdsCreditWords } from './tds-credits.mjs';

const SECTION = /\b(?:u\/s|under|section|sec\.?)?\s*(194\s*-?\s*[ACIJ])\b/i;
const PAN = /\bPAN\s*[:#-]?\s*([A-Z]{5}\s?[0-9]{4}\s?[A-Z])\b/i;
const TAN = /\bTAN\s*[:#-]?\s*([A-Z]{4}\s?[0-9]{5}\s?[A-Z])\b/i;
const CHALLAN = /\b(?:challan|cin)\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9 /-]{4,40}?)(?=\s*(?:,|$|\bon\b|\bfor\b|\bdated\b))/i;

const OWN_PLANS = new WeakSet();

function mine(plan) {
  OWN_PLANS.add(plan);
  return plan;
}

function say(reply) {
  return mine({ kind: 'reply', reply, tools: [] });
}

function cut(text, at, length) {
  return `${text.slice(0, at)} ${text.slice(at + length)}`;
}

const MONTH_WORDS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const MONTH_ORDER = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NUMERIC_DATE = /(?<![\w.,/-])(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})(?![\w/-]|\.\d)/g;
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH_WORDS})\\b\\.?(?:,?\\s+((?:19|20)\\d{2})\\b)?`, 'gi');
const MONTH_FIRST = new RegExp(`\\b(${MONTH_WORDS})\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+((?:19|20)\\d{2})\\b)?`, 'gi');
const RELATIVE_DAY = /\b(?:yesterday|tomorrow|day\s+before\s+yesterday|last\s+(?:week|month|mon|tue|wed|thu|fri|sat|sun)\w*|this\s+(?:week|month)|next\s+(?:week|month)|\d+\s+days?\s+ago)\b/i;
const TODAY_WORD = /\b(?:today|now|aaj)\b/i;

const SECTION_ATTACHED = /(?:\b(?:u\/s|under|section|sec\.?)\s*)?(?<![\w.,-])(19[2-9]|206)-?([A-Za-z]{1,2})(?![A-Za-z0-9])(?:\([0-9A-Za-z]{1,3}\))?/gi;
const SECTION_SPACED = /\b(?:u\/s|under|section|sec\.?)\s*(19[2-9]|206)\s+([A-Za-z])(?![A-Za-z0-9])(?:\([0-9A-Za-z]{1,3}\))?/gi;
const SECTION_NUMBER = /\b(?:u\/s|under|section|sec\.?)\s*(19[2-9]|206)(?![A-Za-z0-9])(?!\s+[A-Za-z](?![A-Za-z0-9]))(?:\([0-9A-Za-z]{1,3}\))?/gi;
const SECTION_WORD_FIRST = /^(?:u\/s|under|section|sec)/i;

const SHORT_INVOICE_ALL = /\bINV-\d{1,3}\b|\binvoice(?:\s+(?:no\.?|num(?:ber)?\.?)|\s*#)?[\s:#-]*\d{1,4}\b(?![-/.,]\d)/gi;
const SHORT_INVOICE = /\bINV-\d{1,3}\b|\b(?:on|against|for|from|of|towards)\s+(?:(?:the|that|this|an?)\s+)?invoice(?:\s+(?:no\.?|num(?:ber)?\.?)|\s*#)?[\s:#-]*\d{1,4}\b(?![-/.,]\d)|\binvoice(?:\s+(?:no\.?|num(?:ber)?\.?)|\s*#)[\s:#-]*\d{1,4}\b(?![-/.,]\d)/i;
const INVOICE_AFTER_PREPOSITION = /\b(?:on|against|for|from|of|towards)\s+(?:(?:the|that|this|an?)\s+)?invoice\b/i;

const FY_WORDS = /\b(?:fy|f\.y\.?|financial\s+year|ay|a\.y\.?|assessment\s+year)[\s:]*(?:19|20)?\d{2}\s*[-/]\s*(?:19|20)?\d{2}(?![\d/-])/gi;
const FY_BARE = /(?<![\d/-])(?:19|20)\d{2}\s*-\s*(?:19|20)?\d{2}(?![\d/-])/g;
const YEAR_PHRASE = /\b(?:in|during|fy|f\.y\.?|financial\s+year|year)[\s:]*(?:19|20)\d{2}\b(?![-/])/gi;
const PERCENT = /%|\bper\s?cent\b|\bpercent\b|\bpct\b/i;
const GST_SAID = /\b(?:gst|igst|cgst|sgst)\b/i;

const WITHHELD_WORDS = '(?:withheld|deducted|cut)';
const TDS_WITHHELD = new RegExp(`\\b${WITHHELD_WORDS}\\b[^.?!;]{0,60}\\btds\\b|\\btds\\b[^.?!;]{0,60}\\b${WITHHELD_WORDS}\\b`, 'i');

const ASK_INVOICE = 'Say the invoice number, like INV-0001. I have recorded nothing.';
const ASK_ONE_INVOICE = 'Say one invoice at a time, for example "record tds withheld 2000 on INV-0001 under 194J". I have recorded nothing.';
const ASK_AMOUNT = 'Say how much TDS was withheld, for example "record tds withheld 2000 on INV-0001 under 194J". I have recorded nothing.';
const ASK_DATE = 'Say the date as YYYY-MM-DD, for example "record tds withheld 2000 on INV-0001 under 194J dated 2026-10-15". I have recorded nothing.';
const ASK_YEAR = 'Say the financial year as two years in a row, like FY 2025-26. I have checked nothing.';
const UNDO_REPLY = 'A TDS entry cannot be reversed from chat yet, so nothing was changed; your CA can correct it.';

const UNDO_WORDS = /\b(?:undo|undone|undoing|reverse|reversed|reversing|reversal|revert|reverted|reverting|remove|removed|removing|delete|deleted|deleting|erase|erased|wrong|wrongly|mistake|mistaken|mistakenly|incorrect|incorrectly|cancel|cancelled|canceled|cancelling|canceling|rollback|roll\s+back|take\s+back|taken\s+back)\b/i;
const INVOICE_ACTION = /\b(?:cancel(?:l?ed|l?ing)?|delete|remove|void)\s+(?:the\s+|this\s+|that\s+)?(?:invoice\s+)?INV-\d+\b(?!['\u2019]?s?[\s,:-]*(?:(?:the|its|their|a)\s+)?tds\b)/gi;
const REVERSE_CHARGE = /\b(?:reverse[\s-]+charge|rcm)\b/gi;
const UNDO_NEAR_TDS = /\b(?:undo|undoing|reverse|reversing|revert|reverting|remove|removing|delete|deleting|erase|erasing|cancel|cancelling|canceling|rollback|roll\s+back|take\s+back)\b(?:\s+(?:the|my|our|that|this|those|these|last|latest|previous|recent|customer|customers|entry|entries|of|a|an|any|all|for|from|on|to)){0,4}\s+tds\b/i;
const FAULT_NEAR_TDS = /\b(?:wrong|wrongly|mistake|mistaken|mistakenly|incorrect|incorrectly)\b[^.?!;]{0,25}\btds\b|\btds\b[^.?!;]{0,25}\b(?:wrong|wrongly|mistake|mistaken|mistakenly|incorrect|incorrectly)\b/i;
const TDS_ENTRY = /\btds\s+(?:withheld|deducted|cut|entry|entries|receipt|record|recorded)\b|\b(?:withheld|deducted|cut|recorded|posted|booked|entered)\s+(?:the\s+|a\s+|an\s+|some\s+)?(?:\S+\s+){0,2}?tds\b|\btds\b[^.?!;]{0,40}\bINV-\d+\b|\bINV-\d+\b[^.?!;]{0,40}\btds\b/i;

const MONEY = '(?:₹|rs\\.?|inr)?\\s*\\d[\\d,]*(?:\\.\\d+)?(?:\\s*(?:k|lakhs?|lacs?|crores?|cr)\\b)?';
const TDS_AMOUNT_BEFORE = new RegExp(`(${MONEY})\\s*tds\\b`, 'i');
const TDS_AMOUNT_AFTER = new RegExp(`\\btds\\b\\s*(?:(?:of|was|is|worth|at|amounting\\s+to|withheld|deducted|cut|taken|being|=|:)\\s*)*(${MONEY})`, 'i');
const TDS_AMOUNT_AS = new RegExp(`(${MONEY})\\s+as\\s+tds\\b`, 'i');
const TDS_NET_OF = /\b(?:after|net\s+of|less|minus|post|excluding|ex|of\s+which)\s+(?:the\s+|any\s+|some\s+|a\s+)?(?:(?:customer|client|their|its|our|party|tax)\s+)?tds\b/i;
const TDS_HAPPENED = /\btds\s+(?:cut|deducted|withheld|deduction|adjusted)\b|\b(?:cut|deducted|withheld|deducting|cutting|withholding)\s+(?:the\s+)?tds\b/i;
const NO_TDS = /\b(?:no|nil|zero|without|never)\s+(?:(?:any|customer|client|their|the)\s+)?tds\b|\btds\s+(?:[\d,.₹]+\s+)?(?:(?:was|were|is|has|have|had)\s+)?(?:free|nil|zero|(?:not|never)\s+(?:applicable|deducted|cut|withheld|been\s+(?:deducted|cut|withheld))|(?:wasn|isn|hasn|haven|hadn)'?t\s+(?:been\s+)?(?:deducted|cut|withheld))\b|\b(?:did\s+not|didn'?t|not)\s+(?:cut|deduct|withhold)\s+(?:any\s+)?tds\b/gi;
const TDS_PAPERWORK = /\b(?:certificates?|form\s*16a|26\s*as|statements?|refunds?|returns?|challans?|deposit(?:ed)?|summary|due|payable|credit\s+check)\b/i;
const RECEIPT_VERBS = /\b(?:received|receive|receipt|got|collected|recd|rcvd)\b/i;
const PAID_VERBS = /\b(?:paid|pays|payment)\b/i;
const PAID_OUT = /\b(?:paid|pay|payment|sent|gave)\s+(?:\S+\s+){0,3}?to\b/i;

const AS_26 = /\b26\s*as\b/i;
const TDS_CREDITS = /\btds\s+credits?\b/i;
const CREDIT_ISSUE = /\btds\s+credits?\s+(?:check|mismatch(?:es)?|difference|differences|discrepanc(?:y|ies)|gap|gaps|reconciliation|reconcile|missing|unmatched|not\s+matching|(?:do|does)(?:\s+not|n['\u2019]?t)\s+match)\b/i;
const CHECK_VERB = /\b(?:check|compare|verify|reconcil\w*|cross[\s-]?check|validate|match)\b/i;
const CHECK_NOUN = /\b(?:vs|versus|against|agrees?|matches|matching|tallies|tally|mismatch(?:es)?|differ(?:s|ence|ences)?|says?|shows?|showing|missing|captur(?:e|es|ed)|reflect(?:s|ed)?|not\s+in)\b/i;
const MARKETPLACE = /\b(?:amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay|marketplace|tcs|194\s*-?\s*o|e-?commerce|operator)\b/i;
const IMPORT_FILLER = /^(?:please|pls|kindly|now|ok|okay|then|so|and|just|(?:can|could|would|will)\s+you|i\s+(?:want|need|would\s+like)\s+to|let'?s|lets|go\s+ahead\s+and|you\s+(?:can|should|may))\b[\s,]*/i;
const MISMATCH_STATEMENT = /\b(?:do|does|did)(?:\s+not|n['\u2019]?t)\s+(?:match|agree|tally|show|reflect|capture)\b/gi;
const FY_BY_WORD = /(?:\bfy|\bf\.y\.?|\bfinancial\s+year)[\s:]*((?:19|20)\d{2}|\d{2})\s*[-/]\s*((?:19|20)\d{2}|\d{2})(?![\d/-])/i;
const FY_BARE_SAID = /(?<![\d/-])((?:19|20)\d{2})\s*-\s*((?:19|20)?\d{2})(?![\d/-])/;
const AY_BY_WORD = /(?:\bay|\ba\.y\.?|\bassessment\s+year)[\s:]*((?:19|20)\d{2}|\d{2})\s*[-/]\s*((?:19|20)\d{2}|\d{2})(?![\d/-])/i;
const FY_LAST = /\b(?:last|previous|prior|preceding)\s+(?:financial\s+year|fy|f\.y\.?|year)\b/i;

function sectionOf(text) {
  const found = text.match(SECTION);
  return found ? found[1].replace(/[\s-]/g, '').toUpperCase() : '';
}

const ENTRY_TOOLS = ['create_purchase', 'post_expense'];

export function withoutTds(text) {
  return String(text || '')
    .replace(/\bPAN\s*[:#-]?\s*[A-Z]{5}\s?[0-9]{4}\s?[A-Z]\b/gi, ' ')
    .replace(/\b(?:u\/s|under|section|sec\.?)?\s*194\s*-?\s*[ACIJ]\b/gi, ' ')
    .replace(/\b(?:with|deduct|less)?\s*tds\b/gi, ' ')
    .replace(/\s*,\s*(?=,|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function planEntryWithTds(planText, text) {
  const first = planText(text);
  if (OWN_PLANS.has(first)) return first;
  if (!/\btds\b/i.test(String(text || ''))) return first;
  const cleaned = withoutTds(text);
  const again = cleaned && cleaned !== text ? planText(cleaned) : first;
  const entry = again && again.kind === 'tool' && ENTRY_TOOLS.includes(again.name) ? again : first;
  return withTdsFromText(entry, text);
}

export function withTdsFromText(plan, text) {
  const raw = normalizeChat(text);
  if (!plan || plan.kind !== 'tool' || !ENTRY_TOOLS.includes(plan.name)) return plan;
  if (!/\btds\b/i.test(raw) || /\b(?:no|without)\s+tds\b/i.test(raw)) return plan;
  const section = sectionOf(raw);
  const pan = (raw.match(PAN) || [])[1];
  if (!section) {
    return { kind: 'reply', reply: 'Say which TDS section applies: 194C for a contractor, 194J for professional or technical fees, 194I for rent, or 194A for interest. I have recorded nothing.', tools: [] };
  }
  const args = { ...plan.args, tdsSection: section };
  if (pan) args.payeePan = pan.replace(/\s+/g, '').toUpperCase();
  if (section === '194J') {
    const category = /\btechnical\b|\broyalt/i.test(raw) ? 'technical' : /\bdirector\b/i.test(raw) ? 'director' : /\bprofessional\b|\bprofession\b|\bconsult|\blegal\b|\baudit\b/i.test(raw) ? 'professional' : '';
    if (category) args.tdsCategory = category;
  }
  if (section === '194I') {
    const asset = /\bplant\b|\bmachine|\bequipment\b/i.test(raw) ? 'plant' : /\bbuilding\b|\boffice\b|\bshop\b|\bland\b|\bfurniture\b|\bgodown\b|\bwarehouse\b|\bpremises\b/i.test(raw) ? 'building' : '';
    if (asset) args.tdsAsset = asset;
  }
  return { ...plan, args };
}

export function planTdsFromChat(text) {
  const raw = normalizeChat(text);
  if (!/\btds\b/i.test(raw) || isNegated(raw)) return null;
  if (/\b(?:tds\s+(?:withheld|deducted)|(?:withheld|deducted)\s+(?:the\s+)?tds)\b[\s\S]*\bINV-\d{4,}\b|\btds\s+credit\s+check\b/i.test(raw)) return null;
  if (/\b(?:we|i)\s+(?:also\s+)?deduct\s+tds\b|\btds\s+deductor\b|\bour\s+tan\b|\btan\s+is\b/i.test(raw)) {
    const tan = (raw.match(TAN) || [])[1];
    if (!tan) return { kind: 'reply', reply: 'Say the TAN as well, for example "we deduct TDS, TAN MUMA12345B". I have recorded nothing.', tools: [] };
    return { kind: 'tool', name: 'set_tds_deductor', args: { tan: tan.replace(/\s+/g, '').toUpperCase() } };
  }
  if (/\bdeposit(?:ed)?\b.*\btds\b|\btds\b.*\bdeposit(?:ed)?\b|\bpaid\s+(?:the\s+)?tds\b|\btds\s+paid\b|\btds\b.*\bchallan\b/i.test(raw) && !SECTION.test(raw) && !isQuestion(raw)) {
    const challan = (raw.match(CHALLAN) || [])[1];
    if (!challan) return { kind: 'reply', reply: 'Say the challan reference as well, for example "deposited TDS 12000, challan 0510308 05112026 12345". I have recorded nothing.', tools: [] };
    const amount = receiptAmount(raw.replace(CHALLAN, ' '));
    return {
      kind: 'tool',
      name: 'record_tds_deposit',
      args: {
        challan: challan.replace(/[\s/-]+/g, '').toUpperCase(),
        date: receiptDate(raw.replace(CHALLAN, ' '), localToday()),
        ...(amount == null ? {} : { amount }),
        ...(/\bcash\b/i.test(raw) ? { mode: 'cash' } : {}),
      },
    };
  }
  if (/\b(?:return|statement|review|quarter(?:ly)?|26q|24q|form)\b/i.test(raw)) return null;
  if (/^(?:my\s+|show\s+(?:my\s+)?|how\s+much\s+)?tds\b|\btds\s+(?:due|payable|to\s+deposit|summary)\b/i.test(raw)) {
    return { kind: 'tool', name: 'tds_summary', args: {} };
  }
  return null;
}

function namedDate(day, monthWord, yearSaid, today) {
  const month = MONTH_ORDER.indexOf(monthWord.slice(0, 3).toLowerCase()) + 1;
  const [thisYear, thisMonth, thisDay] = today.split('-').map(Number);
  const year = yearSaid ? Number(yearSaid) : (month > thisMonth || (month === thisMonth && Number(day) > thisDay) ? thisYear - 1 : thisYear);
  return isoDate(`${year}-${month}-${Number(day)}`) || '';
}

function takeDates(text, today) {
  const dates = [];
  let rest = text.replace(NUMERIC_DATE, (_hit, said) => {
    dates.push(isoDate(said) || '');
    return ' ';
  });
  rest = rest.replace(DAY_FIRST, (_hit, day, month, year) => {
    dates.push(namedDate(day, month, year, today));
    return ' ';
  });
  rest = rest.replace(MONTH_FIRST, (_hit, month, day, year) => {
    dates.push(namedDate(day, month, year, today));
    return ' ';
  });
  if (!dates.length) {
    if (RELATIVE_DAY.test(rest)) dates.push('');
    else if (TODAY_WORD.test(rest)) dates.push(today);
  }
  return { dates, rest };
}

function takeSection(text) {
  const hits = [];
  for (const found of text.matchAll(SECTION_ATTACHED)) {
    if (SECTION_WORD_FIRST.test(found[0]) || !/^(?:k|cr)$/i.test(found[2])) {
      hits.push({ at: found.index, length: found[0].length, code: `${found[1]}${found[2].toUpperCase()}` });
      break;
    }
  }
  for (const found of text.matchAll(SECTION_SPACED)) {
    if (found[2] === found[2].toUpperCase()) {
      hits.push({ at: found.index, length: found[0].length, code: `${found[1]}${found[2]}` });
      break;
    }
  }
  for (const found of text.matchAll(SECTION_NUMBER)) {
    hits.push({ at: found.index, length: found[0].length, code: found[1] });
    break;
  }
  if (!hits.length) return { code: '', rest: text };
  const first = hits.sort((a, b) => a.at - b.at)[0];
  return { code: first.code, rest: cut(text, first.at, first.length) };
}

function readEntry(raw, today) {
  const ids = [];
  let body = raw.replace(/\bINV-(\d{4,})\b/gi, (_hit, digits) => {
    if (!ids.includes(`INV-${digits}`)) ids.push(`INV-${digits}`);
    return ' ';
  });
  const shortId = SHORT_INVOICE.test(body);
  body = body.replace(SHORT_INVOICE_ALL, ' ');
  const tan = TAN.exec(body);
  if (tan) body = cut(body, tan.index, tan[0].length);
  const pan = PAN.exec(body);
  if (pan) body = cut(body, pan.index, pan[0].length);
  const section = takeSection(body);
  const dated = takeDates(section.rest, today);
  body = dated.rest.replace(FY_WORDS, ' ').replace(FY_BARE, ' ').replace(YEAR_PHRASE, ' ');
  return { ids, shortId, tan: tan ? tan[1].replace(/\s+/g, '').toUpperCase() : '', section: section.code, dates: dated.dates, body };
}

function plain(raw) {
  return raw.replace(NO_TDS, ' ').replace(/\b(rs|inr)\.\s*/gi, '$1 ');
}

export function planTdsUndoFromChat(text) {
  const raw = normalizeChat(text);
  if (!/\btds\b/i.test(raw)) return null;
  const rest = raw.replace(INVOICE_ACTION, ' ').replace(REVERSE_CHARGE, ' ');
  const undoing = UNDO_NEAR_TDS.test(rest) || FAULT_NEAR_TDS.test(rest) || (UNDO_WORDS.test(rest) && (TDS_ENTRY.test(rest) || TDS_WITHHELD.test(rest)));
  return undoing ? say(UNDO_REPLY) : null;
}

export function planCustomerTdsFromChat(text) {
  const raw = normalizeChat(text);
  const said = plain(raw);
  if (!TDS_WITHHELD.test(said) || isQuestion(raw) || isNegated(raw)) return null;
  const entry = readEntry(said, localToday());
  const amount = PERCENT.test(entry.body) ? null : receiptAmount(entry.body);
  if (entry.ids.length > 1) return say(ASK_ONE_INVOICE);
  if (!entry.ids.length) {
    if (GST_SAID.test(said)) return null;
    if (entry.shortId || (amount != null && INVOICE_AFTER_PREPOSITION.test(said))) return say(ASK_INVOICE);
    return null;
  }
  if (entry.dates.length > 1 || (entry.dates.length === 1 && !entry.dates[0])) return say(ASK_DATE);
  if (amount == null) return say(ASK_AMOUNT);
  return mine({
    kind: 'tool',
    name: 'record_tds_withheld',
    args: {
      invoiceId: entry.ids[0],
      amount,
      ...(entry.section ? { section: entry.section } : {}),
      ...(entry.dates[0] ? { date: entry.dates[0] } : {}),
      ...(entry.tan ? { tan: entry.tan } : {}),
    },
  });
}

const keyOf = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function customersIn(state, text) {
  const hay = ` ${keyOf(text)} `;
  const names = new Set();
  for (const invoice of state.invoices || []) {
    const name = keyOf(invoice.partyName);
    if (name && hay.includes(` ${name} `)) names.add(name);
  }
  const found = [...names];
  return found.filter((name) => !found.some((other) => other !== name && ` ${other} `.includes(` ${name} `)));
}

function receiptSaid(state, text) {
  if (RECEIPT_VERBS.test(text)) return true;
  if (!PAID_VERBS.test(text)) return false;
  if (/\bINV-\d+\b/i.test(text)) return true;
  if (PAID_OUT.test(text)) return false;
  const hay = ` ${keyOf(text)} `;
  const paidAt = hay.search(/ (?:paid|pays|payment) /);
  return customersIn(state, text).some((name) => {
    const at = hay.indexOf(` ${name} `);
    return at >= 0 && at < paidAt;
  });
}

function splitTds(body) {
  for (const pattern of [TDS_AMOUNT_BEFORE, TDS_AMOUNT_AFTER, TDS_AMOUNT_AS]) {
    const hit = pattern.exec(body);
    if (!hit) continue;
    const tds = receiptAmount(hit[1]);
    if (tds != null) return { tds, cash: receiptAmount(cut(body, hit.index, hit[0].length)) };
  }
  return { tds: null, cash: receiptAmount(body.replace(/\btds\b/gi, ' ')) };
}

function exampleInvoice(state, raw, ids) {
  if (ids.length) return ids[0];
  const open = (state.invoices || []).filter((invoice) => invoice.status !== 'cancelled' && outstandingOf(state, invoice) > 0.005);
  const named = customersIn(state, raw);
  const theirs = named.length === 1 ? open.filter((invoice) => keyOf(invoice.partyName) === named[0]) : [];
  return (theirs[0] || open[0])?.id || 'INV-0001';
}

function listed(parts) {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

function twoSteps({ tds, cash, section, invoiceId, named }) {
  const hint = listed([...(named ? [] : ['the invoice it belongs to']), ...(tds == null ? ['the TDS amount'] : []), 'the section on the TDS certificate']);
  return `I have recorded nothing, because a receipt that carries TDS is two entries: first say "received ${cash == null ? 98000 : cash} against ${invoiceId}", then say "record tds withheld ${tds == null ? 2000 : tds} on ${invoiceId} under ${section || '194J'}" (use ${hint}). The TDS then takes the date of the receipt.`;
}

export function planReceiptWithTds(state, text) {
  const raw = normalizeChat(text);
  if (!/\btds\b/i.test(raw) || isQuestion(raw) || isNegated(raw)) return null;
  const said = plain(raw);
  if (!/\btds\b/i.test(said) || TDS_PAPERWORK.test(said) || !receiptSaid(state, said)) return null;
  const entry = readEntry(said, localToday());
  const split = splitTds(entry.body);
  if (!TDS_NET_OF.test(entry.body) && !(split.cash != null && (split.tds != null || TDS_HAPPENED.test(entry.body)))) return null;
  return say(twoSteps({ tds: split.tds, cash: split.cash, section: entry.section, invoiceId: exampleInvoice(state, said, entry.ids), named: entry.ids.length > 0 }));
}

function startsWithImport(raw) {
  let rest = raw.trim();
  for (let i = 0; i < 6; i += 1) {
    const next = rest.replace(IMPORT_FILLER, '');
    if (next === rest) break;
    rest = next;
  }
  return /^(?:import|importing|upload|uploading)\b/i.test(rest);
}

function financialYearOf(first, second) {
  const start = first.length === 2 ? 2000 + Number(first) : Number(first);
  const end = Number(second.slice(-2));
  if (end !== (start + 1) % 100) return '';
  if (second.length === 4 && Number(second) !== start + 1) return '';
  return `${start}-${String(end).padStart(2, '0')}`;
}

function financialYearSaid(raw, today) {
  const assessed = AY_BY_WORD.exec(raw);
  if (assessed) {
    const fy = financialYearOf(assessed[1], assessed[2]);
    if (!fy) return { unreadable: true };
    const start = Number(fy.slice(0, 4)) - 1;
    return { fy: `${start}-${String((start + 1) % 100).padStart(2, '0')}` };
  }
  const worded = FY_BY_WORD.exec(raw);
  if (worded) {
    const fy = financialYearOf(worded[1], worded[2]);
    return fy ? { fy } : { unreadable: true };
  }
  const bare = FY_BARE_SAID.exec(raw);
  const bareFy = bare ? financialYearOf(bare[1], bare[2]) : '';
  if (bareFy) return { fy: bareFy };
  if (FY_LAST.test(raw)) {
    const [year, month] = today.split('-').map(Number);
    const start = (month >= 4 ? year : year - 1) - 1;
    return { fy: `${start}-${String((start + 1) % 100).padStart(2, '0')}` };
  }
  return {};
}

function pending26as(state) {
  const file = state.pendingFile;
  if (!file || !/^(?:form)?26as$/i.test(String(file.kind || ''))) return '';
  return String(file.name || '26AS file').slice(0, 80);
}

export function plan26asCheckFromChat(state, text) {
  const raw = normalizeChat(text);
  const has26 = AS_26.test(raw);
  const asked = has26
    ? CHECK_VERB.test(raw) || CHECK_NOUN.test(raw) || TDS_CREDITS.test(raw)
    : CREDIT_ISSUE.test(raw) || (CHECK_VERB.test(raw) && TDS_CREDITS.test(raw));
  if (!asked || isNegated(raw.replace(MISMATCH_STATEMENT, ' ')) || startsWithImport(raw)) return null;
  if (!has26 && MARKETPLACE.test(raw)) return null;
  const year = financialYearSaid(raw, localToday());
  if (year.unreadable) return say(ASK_YEAR);
  const args = year.fy ? { fy: year.fy } : {};
  const waiting = pending26as(state);
  if (!waiting || !toolServesCountry('tds_credit_check', countryOf(state))) return mine({ kind: 'tool', name: 'tds_credit_check', args });
  const result = tdsCreditCheck(state, args);
  result.data.pendingFile = waiting;
  return mine({ kind: 'reply', reply: tdsCreditWords(result.data, (amount) => formatMoney(state, amount)), tools: [{ name: 'tds_credit_check', result }] });
}

export function planTdsChat(state, text) {
  const raw = normalizeChat(text);
  if (!/\btds\b|\b26\s*as\b/i.test(raw)) return null;
  return plan26asCheckFromChat(state, raw)
    || planTdsUndoFromChat(raw)
    || planReceiptWithTds(state, raw)
    || planCustomerTdsFromChat(raw);
}
