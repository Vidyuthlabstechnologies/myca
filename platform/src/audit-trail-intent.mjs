import { planReceiptWithoutInvoice } from './receipt-intent.mjs';
import { planExpenseFromChat } from './expense-intent.mjs';
import { planPaymentFromChat } from './payment-intent.mjs';
import { takeInvoiceTerms } from './terms-intent.mjs';
import { isoDate, localToday } from './dates.mjs';
import { parseDocument, amountsSaid, isQuestion, isNegated } from './intent.mjs';
import { salesDocumentKindSaid, EXCEL_PERIOD_WORDS, AUDIT_TRAIL_PHRASES, nameKey, CHAT_MONTH_WORDS, financialYearSaid, CHAT_MONTH_PREFIXES, chatMonthKey, REMINDER_WORDS, MONTH_NAMES } from './chat-words.mjs';

const AUDIT_TRAIL_ASKED = new RegExp(AUDIT_TRAIL_PHRASES, 'i');
const AUDIT_TRAIL_EVERYTHING = /\b(?:everything|all events|including reads)\b/i;
const AUDIT_TRAIL_EVERY = new RegExp(AUDIT_TRAIL_PHRASES, 'gi');

export const AUDIT_RANGE_UNREAD = 'I could not read that date range, so I have not looked anything up. Say it like "audit trail from 2026-10-01 to 2026-10-31", "audit trail for October" or "audit trail for FY 2025-26".';
const AUDIT_NUMERIC_DAY = /(?<![\w./-])(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})(?![\w/-])/g;
const AUDIT_WORDED_DAY = new RegExp(`(?<![\\w.,-])(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${CHAT_MONTH_WORDS})\\.?,?\\s+(\\d{4})|(${CHAT_MONTH_WORDS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4}))(?![\\w-])`, 'gi');
const AUDIT_YEARLESS_DAY = new RegExp(`(?<![\\w.,-])\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${CHAT_MONTH_WORDS})\\b(?!\\.?,?\\s*\\d{4})|\\b(?:${CHAT_MONTH_WORDS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*\\d{4})`, 'i');
const AUDIT_THIS_WEEK = /\bthis\s+week\b/i;
const AUDIT_LAST_WEEK = /\b(?:last|previous|prior|preceding)\s+week\b/i;
const AUDIT_LAST_QUARTER = /\b(?:last|previous|prior|preceding)\s+quarter\b/i;
const AUDIT_LAST_DAYS = /\b(?:last|past|previous)\s+(\d{1,4})\s+days?\b/i;
const AUDIT_RELATIVE_PERIOD = /\b(current|previous|prior|preceding)\s+(month|quarter|year)\b/i;
const AUDIT_MODAL_MAY = /\b(?:i|we|you|he|she|they|it)\s+may\b|\bmay\s+(?:i|we|you|he|she|they|it|there|someone|anyone|see|have|get|show|check|look|be|not|need|want|know|ask)\b/gi;
const AUDIT_ISO_MONTH = /\b20\d{2}-(?:0[1-9]|1[0-2])\b(?!-\d)/;
const AUDIT_NAMED_MONTH = new RegExp(`\\b(?:${CHAT_MONTH_WORDS})\\b(?:\\s+20\\d{2})?`, 'i');

const CHAT_MONTH_NAMED = new RegExp(`\\b(${CHAT_MONTH_WORDS})\\b(?:\\s+(20\\d{2}))?`, 'i');
const AUDIT_RANGE_WORDS = /\b(?:last|past|previous|next)\s+(?:week|quarter|\d+\s+(?:days?|weeks?|months?|years?))\b|\bnext\s+month\b|\b\d+\s+(?:days?|weeks?|months?)\s+ago\b|\b(?:fy\.?|f\.\s?y\.?|financial\s+year)\s*\d|\bq[1-4]\b|\b(?:first|second|third|fourth)\s+quarter\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|(?<![\w/.-])(?:20\d{2}|\d{4}\s*-\s*\d{2,4})(?![\w/-])/i;
const AUDIT_UNREADABLE = new RegExp([
  '(?<![\\w/.-])\\d{1,2}(?:st|nd|rd|th)(?!\\w)',
  '\\bweeks?\\s+(?:of|ending|ended|starting|commencing|beginning|from|to|ago|before|after)\\b',
  '\\b(?:last|past|previous|prior|preceding|next|coming|following)\\s+(?:the\\s+)?(?:\\w+\\s+){0,2}?(?:hours?|days?|weeks?|fortnights?|months?|quarters?|years?)\\b',
  '\\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|sixty|ninety|few|couple(?:\\s+of)?|several)\\s+(?:hours?|days?|weeks?|fortnights?|months?|quarters?|years?)\\b',
  '\\b(?:between|from|to|till|until|through)\\s+\\d{1,2}(?![\\w.:/-])',
  '\\b(?:ytd|mtd|qtd)\\b',
  '\\b(?:year|month|quarter)\\s*-?\\s*to\\s*-?\\s*date\\b',
  '\\bh[12]\\b',
  '\\b(?:first|second)\\s+half\\b',
  '\\bhalf[\\s-]?year(?:ly)?\\b',
  '\\bfortnight(?:ly)?\\b',
  '\\bsemester\\b',
  '\\b(?:tomorrow|tonight|midnight|overnight)\\b',
  '\\bago\\b',
  '\\b(?:before|after)\\s+(?:last|next)\\b',
  '\\bthis\\s+(?:morning|afternoon|evening)\\b',
  '(?<![\\w/.-])\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2}(?![\\w/-])',
  '(?<![\\w/.-])\\d{1,2}[-/.]\\d{4}(?![\\w/-])',
  '(?<![\\w/.-])\\d{1,2}/\\d{1,2}(?![\\w/.-])',
].join('|'), 'i');
const AUDIT_YEAR_LABEL = /\b(?:(?:financial|fiscal|assessment|calendar)\s+year|fy|f\.\s?y\.?|ay|a\.\s?y\.?)(?![\w-])/i;
const AUDIT_NEGATED = /\b(?:not|never|except|excluding|exclude|without|besides|other\s+than|apart\s+from|instead\s+of)\b|n['’]t\b/i;
const AUDIT_DIRECTED_PERIOD = new RegExp(`\\b(?:since|from|until|till|before|after|through|upto|up\\s+to|starting|beginning|ending|between|onwards?)\\s+(?:the\\s+)?(?:(?:last|this|past|previous|next)\\s+(?:month|quarter|year|week)|(?:${CHAT_MONTH_WORDS})\\b|20\\d{2}-(?:0[1-9]|1[0-2])\\b)`, 'i');
const AUDIT_MONTH_WORD = new RegExp(`\\b(?:${CHAT_MONTH_WORDS})\\b`, 'gi');
const AUDIT_OPENING_WORDS = new Set(['please', 'pls', 'kindly', 'can', 'could', 'would', 'will', 'you', 'i', 'we', 'let', 'lets', 'us', 'me', 'my', 'our', 'the', 'a', 'an', 'show', 'give', 'get', 'open', 'view', 'see', 'list', 'display', 'pull', 'up', 'need', 'want', 'like', 'to', 'also', 'and', 'then', 'now', 'ok', 'okay', 'hey', 'hi', 'hello', 'just', 'tell', 'check', 'look', 'at', 'd', 'll']);

function shiftIsoDay(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function mondayOfWeek(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return shiftIsoDay(iso, -((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7));
}

function quarterBefore(iso) {
  const [year, month] = iso.split('-').map(Number);
  const start = Math.floor((month - 1) / 3) * 3 + 1;
  const from = start > 3 ? `${year}-${String(start - 3).padStart(2, '0')}-01` : `${year - 1}-10-01`;
  return { from, to: shiftIsoDay(`${year}-${String(start).padStart(2, '0')}-01`, -1) };
}

function chatMonthSaid(text, today = localToday()) {
  const iso = AUDIT_ISO_MONTH.exec(text);
  if (iso) return iso[0];
  const named = CHAT_MONTH_NAMED.exec(text);
  return named ? chatMonthKey(named[1], named[2], today) : '';
}

function auditDaysSaid(text, today) {
  const days = [];
  for (const hit of text.matchAll(AUDIT_NUMERIC_DAY)) days.push({ at: hit.index, end: hit.index + hit[0].length, iso: isoDate(hit[0]) });
  for (const hit of text.matchAll(AUDIT_WORDED_DAY)) {
    const [day, month, year] = hit[1] ? [hit[1], hit[2], hit[3]] : [hit[5], hit[4], hit[6]];
    const number = MONTH_NAMES.findIndex((name) => name.startsWith(month.slice(0, 3).toLowerCase())) + 1;
    days.push({ at: hit.index, end: hit.index + hit[0].length, iso: isoDate(`${year}-${number}-${day}`) });
  }
  for (const hit of text.matchAll(/\b(today|yesterday)\b/gi)) days.push({ at: hit.index, end: hit.index + hit[0].length, iso: hit[1].toLowerCase() === 'today' ? today : shiftIsoDay(today, -1) });
  return days.sort((a, b) => a.at - b.at);
}

function auditDaysRange(text, days) {
  const [first, second] = days;
  if (second) return first.iso <= second.iso ? { from: first.iso, to: second.iso } : null;
  const before = text.slice(0, first.at);
  if (/\b(?:since|from|starting(?:\s+(?:from|on))?|beginning(?:\s+(?:from|on))?|on\s+or\s+after)\s*$/i.test(before)) return { from: first.iso };
  if (/\bafter\s*$/i.test(before)) return { from: shiftIsoDay(first.iso, 1) };
  if (/\b(?:until|till|upto|up\s+to|through|to|ending(?:\s+on)?|on\s+or\s+before)\s*$/i.test(before)) return { to: first.iso };
  if (/\bbefore\s*$/i.test(before)) return { to: shiftIsoDay(first.iso, -1) };
  return { from: first.iso, to: first.iso };
}

export function auditRangeSaid(text) {
  const today = localToday();
  const spaced = text.replace(/\s+/g, ' ').replace(AUDIT_MODAL_MAY, ' ');
  const days = auditDaysSaid(spaced, today);
  if (days.length > 2 || days.some((day) => !day.iso)) return null;
  let left = days.reduceRight((rest, day) => `${rest.slice(0, day.at)} ${rest.slice(day.end)}`, spaced);
  const readings = [];
  if (days.length) {
    const range = auditDaysRange(spaced, days);
    if (!range) return null;
    readings.push(range);
  }
  if (AUDIT_DIRECTED_PERIOD.test(left)) return null;
  const week = AUDIT_THIS_WEEK.exec(left);
  if (week) {
    readings.push({ from: mondayOfWeek(today), to: today });
    left = left.replace(week[0], ' ');
  }
  const lastWeek = AUDIT_LAST_WEEK.exec(left);
  if (lastWeek) {
    const monday = mondayOfWeek(today);
    readings.push({ from: shiftIsoDay(monday, -7), to: shiftIsoDay(monday, -1) });
    left = left.replace(lastWeek[0], ' ');
  }
  const lastQuarter = AUDIT_LAST_QUARTER.exec(left);
  if (lastQuarter) {
    readings.push(quarterBefore(today));
    left = left.replace(lastQuarter[0], ' ');
  }
  const lastDays = AUDIT_LAST_DAYS.exec(left);
  if (lastDays) {
    if (Number(lastDays[1]) < 1) return null;
    readings.push({ from: shiftIsoDay(today, -Number(lastDays[1])), to: today });
    left = left.replace(lastDays[0], ' ');
  }
  const year = financialYearSaid(left, today);
  if (year) {
    if (year.unreadable) return null;
    readings.push({ from: year.from, to: year.to });
    left = left.replace(year.text, ' ');
  }
  const yearless = AUDIT_YEARLESS_DAY.test(left);
  const monthWords = new Set([...left.matchAll(AUDIT_MONTH_WORD)].map((hit) => hit[0].slice(0, 3).toLowerCase()));
  const named = EXCEL_PERIOD_WORDS.exec(left);
  const relative = named ? null : AUDIT_RELATIVE_PERIOD.exec(left);
  let period = '';
  if (named || relative) {
    period = named ? named[1].toLowerCase().replace(/\s+/g, '-') : `${/^current$/i.test(relative[1]) ? 'this' : 'last'}-${relative[2].toLowerCase()}`;
    left = left.replace((named || relative)[0], ' ');
  } else {
    period = chatMonthSaid(left, today);
    const phrase = period ? AUDIT_ISO_MONTH.exec(left) || AUDIT_NAMED_MONTH.exec(left) : null;
    if (phrase) left = left.replace(phrase[0], ' ');
  }
  if (period === 'last-quarter' || EXCEL_PERIOD_WORDS.test(left) || AUDIT_RELATIVE_PERIOD.test(left) || (!year && AUDIT_YEAR_LABEL.test(left))) return null;
  if (period) readings.push({ period });
  if (readings.length > 1 || monthWords.size > 1 || yearless || left.search(AUDIT_MONTH_WORD) >= 0) return null;
  if (AUDIT_UNREADABLE.test(left) || AUDIT_RANGE_WORDS.test(left)) return null;
  if (readings.length && AUDIT_NEGATED.test(left)) return null;
  return readings[0] || {};
}

function auditAskedFirst(text) {
  const first = text.search(AUDIT_TRAIL_ASKED);
  return first >= 0 && nameKey(text.slice(0, first)).split(' ').filter(Boolean).every((word) => AUDIT_OPENING_WORDS.has(word));
}

function auditKnownNames(state) {
  const known = new Map();
  for (const name of [
    ...(state.parties || []).map((party) => party?.name),
    ...(state.vendors || []).map((vendor) => vendor?.name),
    ...(state.invoices || []).map((invoice) => invoice?.partyName),
    ...(state.purchases || []).map((bill) => bill?.partyName),
    ...(state.expenses || []).map((expense) => expense?.payee),
  ]) {
    const key = nameKey(name);
    if (key && !known.has(key)) known.set(key, String(name).trim());
  }
  return known;
}

function auditWithoutName(padded, key) {
  const needle = ` ${key} `;
  let left = padded;
  while (left.includes(needle)) left = left.split(needle).join(' ');
  return left;
}

function auditWordsAreNames(state, text, known) {
  const left = [...known.keys()].filter((name) => AUDIT_TRAIL_ASKED.test(name)).reduce(auditWithoutName, ` ${nameKey(text)} `);
  const phrases = [...left.matchAll(AUDIT_TRAIL_EVERY)].map((hit) => nameKey(hit[0]));
  if (!phrases.length) return true;
  const kind = salesDocumentKindSaid(text);
  const doc = /\b(?:debit|credit)\s+note\b/i.test(text) ? null : parseDocument(takeInvoiceTerms(kind ? text.replace(kind.words, 'invoice') : text).text);
  const posted = [planExpenseFromChat(state, text), planPaymentFromChat(state, text), planReceiptWithoutInvoice(state, text)]
    .filter(Boolean)
    .map((plan) => (plan.kind === 'tool' ? JSON.stringify(plan.args) : plan.reply));
  if (doc && !doc.problem) posted.push(doc.partyName);
  if (phrases.every((phrase) => posted.some((value) => ` ${nameKey(value)} `.includes(` ${phrase} `)))) return true;
  return posted.length > 0 && !isQuestion(text) && !auditAskedFirst(text);
}

const AUDIT_MAKING_WORDS = '(?:record(?:ed)?|add|enter|book|make|made|create|created|raise|issue|generate|prepare|post)\\s+(?:an?\\s+|the\\s+|new\\s+)?';
const AUDIT_RECEIPT_MADE = new RegExp(`\\b(?:paid|received|${AUDIT_MAKING_WORDS}receipt)\\b`, 'i');
const AUDIT_NOTE_MADE = new RegExp(`\\b${AUDIT_MAKING_WORDS}(?:credit|debit)\\s+note\\b`, 'i');
const AUDIT_INVOICE_ID = /\bINV-\d+\b/i;
const AUDIT_DOCUMENT_ID = /\b(?:INV|BILL)-\d+\b/i;
const AUDIT_NOTE_WORDS = /\b(?:credit|debit)\s+notes?\b/i;
const AUDIT_ACTOR_STOP = new Set(['the', 'a', 'an', 'this', 'last', 'past', 'previous', 'prior', 'for', 'from', 'since', 'until', 'till', 'in', 'on', 'at', 'to', 'today', 'yesterday', 'tomorrow', 'limit', 'everything', 'including', 'all', 'and', 'or', 'as', 'between', 'during', 'over', 'after', 'before', 'each', 'per', 'with', 'please', 'pls', 'thanks', 'now', 'only', 'just', 'also', 'then', 'week', 'month', 'quarter', 'year', 'fy', 'date', 'day', 'time', 'user', 'users', 'person', 'people', 'actor', 'actors', 'name', 'action', 'type', 'kind', 'excel', 'xlsx', 'spreadsheet', 'invoice', 'invoices', 'bill', 'bills', 'party', 'parties', 'customer', 'customers', 'supplier', 'suppliers', 'client', 'clients', 'tool', 'tools', 'account', 'accounts', 'entry', 'entries', 'change', 'changes', 'event', 'events', 'role', 'roles', 'hand', 'ims', 'gst', 'tds', 'newest', 'oldest', 'latest', 'earliest', 'recent', 'recently', 'first', 'category', 'categories', 'hour', 'hours', 'minute', 'minutes', 'who', 'whom', 'whose', 'which', 'what', 'order', 'sorted', 'sort', 'size', 'amount', 'value', 'number', 'id', 'status', 'source', 'group', 'section', 'module', 'reason', 'field', 'ledger', 'record', 'records', 'result', 'results', 'chat', 'app', 'phone', 'email', 'voice', 'default', 'mistake', 'accident', 'most', 'least', 'top', 'bottom', 'highest', 'lowest', 'biggest', 'smallest', 'largest', 'reverse', 'ascending', 'descending', 'asc', 'desc', 'alphabetical', 'alphabetically', 'chronological', 'chronologically', 'timestamp', 'timestamps', 'days', 'weeks', 'months', 'years', 'when', 'where', 'how', 'why', 'weekday', 'priority', 'severity', 'risk', 'importance', 'relevance', 'any', 'that', 'whatever', 'whichever']);
const AUDIT_ACTOR_LABEL = /^(?:(?:the|a)\s+)?(?:user|actor|person|staff|member|employee|accountant|partner)\s+(?:(?:called|named)\s+)?(?=[a-z])/i;
const AUDIT_ACTOR_ANYONE = new Set(['everyone', 'everybody', 'anyone', 'anybody']);
const AUDIT_ACTOR_UNKNOWN = new Set(['me', 'myself', 'i', 'my', 'us', 'we', 'you', 'someone', 'somebody', 'our', 'your', 'his', 'her', 'their', 'him', 'them', 'he', 'she', 'they', 'it', 'its']);
const AUDIT_ACTOR_UNREAD = 'I cannot tell who you mean, so I have not looked anything up. Say whose changes to show by name, for example "audit trail by Priya".';
const AUDIT_LIMIT_UNREAD = 'I show between 1 and 2000 changes at a time, so I have not looked anything up. Say it like "audit trail limit 50".';
const AUDIT_LIMIT_LIST = '(?:changes?|events?|entries|edits?|actions?|records?|items?|rows?|lines?)';
const AUDIT_LIMIT_FORMS = [
  /\blimit(?:ed)?(?:\s+(?:to|of))?\s*[:=]?\s*(\d+)(?!\d)/i,
  new RegExp(`\\b(?:last|latest|recent|most\\s+recent|top)\\s+(\\d+)(?!\\d)\\s+${AUDIT_LIMIT_LIST}\\b`, 'i'),
  new RegExp(`\\b(\\d+)(?!\\d)\\s+(?:latest|recent|most\\s+recent)\\s+${AUDIT_LIMIT_LIST}\\b`, 'i'),
  /\b(?:last|latest|recent|most\s+recent|top)\s+(\d+)(?!\d)(?!\s*(?:-\s*)?(?:hours?|hrs?|days?|weeks?|fortnights?|months?|quarters?|years?|st|nd|rd|th)\b)/i,
];
const AUDIT_MONTH_ONLY = new RegExp(`^(?:${CHAT_MONTH_WORDS})$`, 'i');
const AUDIT_NARROWING_IDS = /\b(?:INV|BILL|CN|DN|PDN)-\d+\b/gi;
const AUDIT_REQUEST_WORDS = new Set([...AUDIT_ACTOR_STOP, ...AUDIT_OPENING_WORDS, 'audit', 'trail', 'trails', 'log', 'logs', 'edit', 'changed', 'books', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', ...CHAT_MONTH_PREFIXES, 'sept']);

function auditActorSaid(text) {
  const by = /\bby\s+(?=[a-z])/i.exec(text);
  if (!by) return { rest: text };
  const label = AUDIT_ACTOR_LABEL.exec(text.slice(by.index + by[0].length));
  const from = by.index + by[0].length + (label ? label[0].length : 0);
  const taken = [];
  let end = from;
  for (const hit of text.slice(from).matchAll(/\S+/g)) {
    const bare = hit[0].replace(/[,;:!?)]+$/, '');
    if (!bare || /\d/.test(bare) || AUDIT_ACTOR_STOP.has(bare.replace(/\.$/, '').toLowerCase()) || taken.length === 3) break;
    taken.push(bare);
    end = from + hit.index + bare.length;
    if (bare !== hit[0]) break;
  }
  if (!taken.length) return { rest: text };
  const first = taken[0].replace(/\.$/, '').toLowerCase();
  if (AUDIT_MONTH_ONLY.test(first) || /^[a-z]{3,}ing$/.test(first)) return { rest: text };
  const rest = `${text.slice(0, by.index)} ${text.slice(end)}`.replace(/\s+/g, ' ');
  if (AUDIT_ACTOR_ANYONE.has(first)) return { rest };
  if (AUDIT_ACTOR_UNKNOWN.has(first)) return { unreadable: true, rest };
  return { name: taken.join(' ').replace(/\.+$/, '').slice(0, 80), rest };
}

function auditLimitSaid(text) {
  for (const form of AUDIT_LIMIT_FORMS) {
    const hit = form.exec(text);
    if (!hit) continue;
    const count = Number(hit[1]);
    const rest = text.replace(hit[0], ' ').replace(/\s+/g, ' ');
    return count >= 1 && count <= 2000 ? { count, rest } : { unreadable: true, rest };
  }
  return { rest: text };
}

export function auditExportNarrowing(text) {
  const actor = auditActorSaid(text);
  const limit = auditLimitSaid(actor.rest);
  const args = { ...(actor.name ? { actor: actor.name } : {}), ...(limit.count ? { limit: limit.count } : {}) };
  const unread = [];
  if (actor.unreadable) unread.push('the person you named');
  if (limit.unreadable) unread.push('the count you gave');
  if (!unread.length) return { args };
  return { args, note: `I could not read ${unread.join(' or ')}, so the Excel file is not narrowed by ${unread.length > 1 ? 'them' : 'it'}.` };
}

function auditNarrowing(known, text) {
  const ids = [...new Set((text.match(AUDIT_NARROWING_IDS) || []).map((id) => id.toUpperCase()))];
  let rest = ` ${nameKey(text.replace(AUDIT_NARROWING_IDS, ' '))} `;
  const parties = [];
  for (const [key, display] of [...known].sort((a, b) => b[0].length - a[0].length)) {
    if (!rest.includes(` ${key} `) || key.split(' ').every((word) => AUDIT_REQUEST_WORDS.has(word))) continue;
    parties.push(display);
    rest = auditWithoutName(rest, key);
  }
  return [...ids, ...parties];
}

function auditNarrowingNote(names, narrowed) {
  const list = names.length > 5 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `${narrowed ? '' : 'This lists every change in the period. '}It is not narrowed to ${list}, because I cannot narrow the audit trail to one document or party yet.`;
}

function auditPhraseFollowsPosting(text) {
  const before = text.slice(0, text.search(AUDIT_TRAIL_ASKED));
  if (REMINDER_WORDS.test(before)) return true;
  if (isQuestion(text) || auditAskedFirst(text)) return false;
  if (AUDIT_RECEIPT_MADE.test(before) && AUDIT_INVOICE_ID.test(before)) return true;
  if (AUDIT_NOTE_MADE.test(before) && AUDIT_DOCUMENT_ID.test(before)) return true;
  if (amountsSaid(before.replace(AUDIT_LAST_DAYS, ' ')).length > 0) return true;
  return AUDIT_NOTE_WORDS.test(before) && AUDIT_DOCUMENT_ID.test(text) && amountsSaid(text.replace(AUDIT_LAST_DAYS, ' ')).length > 0;
}

export function planAuditTrailFromChat(state, text) {
  const spaced = text.replace(/\s+/g, ' ');
  if (!AUDIT_TRAIL_ASKED.test(spaced) || isNegated(spaced)) return null;
  const actor = auditActorSaid(spaced);
  const limit = auditLimitSaid(actor.rest);
  const known = auditKnownNames(state);
  if (auditWordsAreNames(state, limit.rest, known) || auditPhraseFollowsPosting(limit.rest)) return null;
  if (actor.unreadable) return { kind: 'reply', reply: AUDIT_ACTOR_UNREAD, tools: [] };
  if (limit.unreadable) return { kind: 'reply', reply: AUDIT_LIMIT_UNREAD, tools: [] };
  const range = auditRangeSaid(limit.rest);
  if (!range) return { kind: 'reply', reply: AUDIT_RANGE_UNREAD, tools: [] };
  const narrowing = auditNarrowing(known, limit.rest);
  return {
    kind: 'tool',
    name: 'audit_trail',
    args: { ...range, ...(actor.name ? { actor: actor.name } : {}), ...(limit.count ? { limit: limit.count } : {}), ...(AUDIT_TRAIL_EVERYTHING.test(spaced) ? { view: 'all' } : {}) },
    ...(narrowing.length ? { note: auditNarrowingNote(narrowing, Boolean(actor.name || limit.count)) } : {}),
  };
}
