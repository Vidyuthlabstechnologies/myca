import { countryOf } from './country.mjs';
import { localToday } from './dates.mjs';
import { inWords } from './words.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { isQuestion, isNegated } from './intent.mjs';
import { nameKey, CHAT_MONTH_WORDS, chatMonthKey, REMINDER_WORDS } from './chat-words.mjs';

export const IMS_SAID = /\bims\b|\binvoice\s+management\b/i;
const IMS_DECISION_SAID = /\b(accept|reject|pending)(?:ed)?\b/gi;
const IMS_SELECT_SAID = /\b(?:(?:all|every)\s+(?:the\s+)?(matched|suggested|undecided|not\s+decided)|(matched))\b/i;
const IMS_UNMATCHED_SAID = /\b(?:not|non|no|[a-z]+n['\u2019]t|isnt|arent|wasnt|werent|didnt|doesnt)\b[\s-]*(?:[a-z]+\s+){0,2}match|\bunmatched\b|\bmismatch/i;
const IMS_PERIOD_FIGURES = new RegExp([
  '\\b(?:gstr-?)?2b\\b',
  '\\b20\\d{2}(?:-\\d{1,2}(?:-\\d{1,2})?)?\\b',
  '\\b(?:fy\\.?|f\\.\\s?y\\.?|financial\\s+year)\\s*[-:\'\\u2019]?\\s*(?:20)?\\d{2}(?:\\s*[-/]\\s*(?:20)?\\d{2})?\\b',
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${CHAT_MONTH_WORDS})\\b`,
  `\\b(?:${CHAT_MONTH_WORDS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`,
  '\\b[qh][1-4]\\b',
  '\\b\\d{1,2}\\s+(?:months?|quarters?|years?)\\b',
].join('|'), 'gi');
const IMS_PERIOD_UNREAD = new RegExp([
  '\\b(?:fy|f\\.\\s?y)(?![a-z])',
  '\\b(?:years?|quarters?|months|weeks?|fortnights?|ago)\\b',
  '\\b[qh][1-4]\\b',
  '\\b(?:first|second)\\s+half\\b',
  '\\bbefore\\s+last\\b',
  '\\b(?:every|each|all|any)\\s+(?:the\\s+)?(?:month|periods?)\\b',
  '\\b(?:next|coming|following)\\s+month\\b',
  '\\bpast\\s+month\\b',
  '\\bmonth\\s+(?:back|earlier)\\b',
  '\\b(?:annual(?:ly)?|biannual(?:ly)?|monthly|bimonthly|quarterly|yearly|weekly|daily|fortnightly)\\b',
  '\\b(?:yesterday|ytd|mtd|qtd)\\b',
  '\\bso\\s+far\\b',
  '\\bmonth\\s*-?\\s*to\\s*-?\\s*date\\b',
  `\\b(?:since|until|till|before|after|upto|up\\s+to|onwards?)\\s+(?:the\\s+)?(?:(?:${CHAT_MONTH_WORDS})\\b|20\\d{2}-\\d{2}\\b(?!-\\d)|(?:last|this|previous|prior|next)\\s+month\\b)`,
].join('|'), 'i');
const IMS_PERIOD_NUMBERS = new RegExp([
  '(?<![\\w/.-])\\d{1,2}\\s*[/.-]\\s*20\\d{2}(?![\\w/-]|\\.\\d)',
  '(?<![\\w/.-])20\\d{2}\\s*[/.]\\s*\\d{1,2}(?![\\w/-]|\\.\\d)',
  `\\b(?:${CHAT_MONTH_WORDS})\\.?\\s*[-'\\u2019/]\\s*\\d{2}\\b`,
  '\\b\\d{1,2}(?:st|nd|rd|th)\\s+(?:quarter|half|year)\\b',
].join('|'), 'gi');
const IMS_ISO_MONTH = /\b(20\d{2})-(\d{1,2})\b/g;
const IMS_THIS_MONTH = /\b(?:this|current)\s+month\b/gi;
const IMS_LAST_MONTH = /\b(?:last|previous|prior|preceding)\s+month\b/gi;
const IMS_NAMED_MONTH = new RegExp(`\\b(${CHAT_MONTH_WORDS})\\b\\.?(?:(?:\\s+|\\s*,\\s*|\\s+of\\s+|\\s*\\(\\s*)(20\\d{2})\\b\\)?)?`, 'gi');
const IMS_BARE_YEAR = /(?<![\w-])20\d{2}(?![\w-])/;
const IMS_MODAL_MAY = /\b(?:i|we|you|he|she|they|it)\s+may\b|(?<!\b(?:for|in|of|during|from|to|till|until|through|thru|and|or|between|by|since|upto|on|at|the|this|last|next|previous|prior|month)\s+)(?<![-\u2013/&]\s*)\bmay\s+(?:i|we|you|he|she|they|it|there|someone|anyone|see|have|get|show|check|look|be|not|need|want|know|ask)\b/gi;
const IMS_DECISION_VERB = { accept: /\baccept\b/i, reject: /\breject\b/i, pending: /\b(?:mark|put|set|make|move|keep|leave)\b/i };
const IMS_INFORMATIONAL = new RegExp([
  '\\b(?:what|who|whom|how|why|whether|should|shall)\\b',
  '\\bwhich\\s+(?:invoices?|bills?|rows?|entries|entry|ones|items?|notes?|documents?|records?|of|to)\\b',
  '\\b(?:see|tell|explain|summary|summaries|summari[sz]e|overview|posted|updated|informed)\\b',
  '\\ba\\s+lists?\\b|\\blists?\\s+(?:of|all|the|every|out)\\b',
  '\\b(?:invoices?|bills?|rows?|entries|entry|ones|items?|notes?|documents?|records?|steps?|ways?|things?|stuff|those|these)\\s+(?:that\\s+)?(?:(?:i|we)\\s+)?(?:(?:should|shall|must|can|could|may|might|need\\s+to|have\\s+to)\\s+|to\\s+)(?:accept|reject)\\b',
].join('|'), 'i');
const IMS_PENDING_NOUN = /\bpending\s+(?:invoices?|bills?|rows?|entries|entry|items?|ones|documents?|notes?|records?)\b/i;
const IMS_ONE_AT_A_TIME = 'IMS takes one decision at a time. Say, for example, "accept all matched invoices in IMS" first, then "reject all undecided invoices in IMS".';
const IMS_BULK_ONLY = 'I have changed nothing in IMS. A bulk decision applies to every row of that set, so I will not run it for one supplier, for only some of the rows or with an exception left out. Say it for the whole set, for example "accept all matched invoices in IMS", or pick single rows in the IMS screen.';
const IMS_NARROWED = /\b(?:except(?:ing)?|exclud(?:e|es|ed|ing)|other\s+than|apart\s+from|aside\s+from|besides|but\s+not|not\s+including|leav(?:e|es|ing)\s+out|skip(?:s|ping)?|where|whose)\b|\bonly\b(?!\s+(?:the\s+)?(?:matched|suggested|undecided|not\s+decided)\b)(?!\s*(?:$|[.!?]|(?:in|on|for|at|within)\b))|(?<!\bevery\s)(?<!\beach\s)(?<!\bany\s)\b(?:supplier|vendor|seller)\b(?!\s+(?:invoices?|bills?|documents?|notes?|rows?|entries|records?|credit|debit)\b)/i;
const IMS_REFERENCE = '(?:in|on|at|within|inside|via|through|thru|using)\\s+(?:the\\s+)?(?:gst\\s+)?(?:ims|invoice\\s+management(?:\\s+system)?)\\b(?:\\s+(?:screen|page|tab|dashboard|list|view))?';
const IMS_TAIL_PERIOD = `(?:for|in)\\s+(?:the\\s+)?(?:month\\s+of\\s+)?(?:(?:this|last|previous|prior)\\s+month|(?:${CHAT_MONTH_WORDS})(?:\\s+20\\d{2})?|20\\d{2}-(?:0[1-9]|1[0-2]))\\b`;
const IMS_TAIL_WORDS = '(?:and|then|also|just|please|pls|kindly|thanks|thank\\s+you|thx|ok|okay|confirm|approve|proceed|continue|submit|apply|post|save|yes|say\\s+yes|sure|go\\s+ahead|do\\s+it|let\\s+me\\s+know)\\b';
const IMS_TAIL_PIECE = `[,;:.!?)]|${IMS_REFERENCE}|${IMS_TAIL_PERIOD}|${IMS_TAIL_WORDS}`;
const IMS_FROM_CLOSING = `(?=(?:\\s*(?:${IMS_TAIL_PIECE}))*\\s*$)`;
const IMS_FROM_SOURCE = '(?:(?:gst|gstn|government|govt)\\s+)?portal\\b|gstn\\b|(?:gstr[\\s-]?)?2b\\b';
const IMS_FROM_PLACE = '(?:gst\\s+)?ims\\b(?:\\s+(?:screen|page|tab|dashboard|list|view))?|dashboard\\b|here\\b|now\\b|(?:(?:all|every|each|any)\\b(?:\\s+of)?(?:\\s+(?:the|my|our))?\\s+(?:(?:registered|known|gst)\\s+)?(?:suppliers?|vendors?)\\b)|(?:(?:registered|known)\\s+)?(?:suppliers|vendors)\\b';
const IMS_FROM_PERIOD = new RegExp(`\\bfrom\\s+(?:(?:the|my|our)\\s+)?(?:(?:${IMS_FROM_SOURCE}|${IMS_FROM_PLACE})${IMS_FROM_CLOSING}|(?:this|last|previous|prior)\\s+(?:month|quarter)\\b|(?:${CHAT_MONTH_WORDS})(?:\\s+(?:in|for|on|to|ims|20\\d{2})\\b|\\s*[,.]|\\s*$)|fy\\b|financial\\s+year\\b|(?!2b\\b)\\d)`, 'gi');
const IMS_COUNT_WORDS = '(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|top|next|single|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|some|few|couple|several|both|half|most|other|another|either|latest|newest|oldest|earliest|biggest|largest|smallest|highest|lowest|recent)';
const IMS_PART_OF_SET = new RegExp(`(?<!\\b(?:every|each)\\s)\\b${IMS_COUNT_WORDS}\\b(?:\\s+(?:${IMS_COUNT_WORDS}|of|a|an|the|these|those|my|our))*\\s+(?:matched|suggested|undecided|not\\s+decided)\\b`, 'i');
const IMS_RELATIVE_PERIOD = /\b(?:this|last|previous|prior|next)\s+(?:month|quarter|year|week)\b|\b(?:first|second|third|fourth)\s+quarter\b/gi;
const IMS_SET_WORDS = '(?:matched|suggested|undecided|not\\s+decided)';
const IMS_DAY_DATE = `(?:\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${CHAT_MONTH_WORDS})\\b|(?:${CHAT_MONTH_WORDS})\\.?\\s+\\d{1,2}(?!\\d)|20\\d{2}-\\d{2}-\\d{2}\\b)`;
const IMS_DATE_FILTER = new RegExp(`\\b(?:dated|on|from|since|until|till|before|after|between|upto|up\\s+to)\\s+(?:the\\s+)?${IMS_DAY_DATE}`, 'i');
const IMS_SINGLE_ROW = new RegExp(`(?<!\\b(?:every|each|any|all)\\s)\\b(?:the|this|that|a|an)\\s+${IMS_SET_WORDS}\\s+(?:invoice|bill|note|row|entry|record|document|one)\\b`, 'i');
const IMS_ROW_TYPE = new RegExp(`\\b${IMS_SET_WORDS}\\s+(?:credit|debit)\\s+notes?\\b|\\b(?:credit|debit)\\s+notes?\\s+(?:(?:(?:that|which)\\s+)?(?:are|is)\\s+)?${IMS_SET_WORDS}\\b`, 'i');
const IMS_COMMAND_WORDS = new Set(['accept', 'accepted', 'reject', 'rejected', 'pending', 'all', 'every', 'each', 'any', 'the', 'matched', 'suggested', 'undecided', 'not', 'decided', 'invoice', 'invoices', 'bill', 'bills', 'row', 'rows', 'entry', 'entries', 'ims', 'management', 'gst', 'gstn', 'gstr', 'portal', 'mark', 'make', 'put', 'please', 'pls', 'kindly', 'can', 'could', 'would', 'will', 'you', 'let', 'lets', 'want', 'need', 'like', 'and', 'then', 'now', 'also', 'just', 'this', 'that', 'these', 'those', 'them', 'for', 'from', 'with', 'month', 'quarter', 'year', 'last', 'previous', 'prior', 'current', 'financial', 'period', 'list', 'screen', 'dashboard', 'statement', 'return', 'okay', 'yes', 'hey', 'hello', 'thanks', 'sure', 'one', 'whole', 'only', 'ones', 'supplier', 'suppliers', 'vendor', 'vendors', 'ahead', 'done', 'right', 'today', 'tomorrow', 'yesterday', 'here', 'there', 'once', 'again', 'together', 'everything']);
const IMS_MONTH_WORD = new RegExp(`^(?:${CHAT_MONTH_WORDS})$`, 'i');

export function latestTwobMonth(state) {
  const stored = state.gstr2b && typeof state.gstr2b === 'object' ? Object.keys(state.gstr2b) : [];
  return stored.filter((key) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key)).sort().pop() || '';
}

export function hasTwobFor(state, month) {
  return Boolean(state.gstr2b && typeof state.gstr2b === 'object' && Object.hasOwn(state.gstr2b, month) && state.gstr2b[month]);
}

function chatMonthBefore(today) {
  const [year, month] = today.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function imsPeriodReading(sentence, today = localToday()) {
  const text = sentence.replace(IMS_MODAL_MAY, ' ');
  const months = new Set();
  let unread = IMS_PERIOD_UNREAD.test(text) || text.search(IMS_PERIOD_NUMBERS) >= 0;
  const left = text
    .replace(IMS_ISO_MONTH, (_, year, month) => {
      if (isReturnPeriod(`${year}-${month}`)) months.add(`${year}-${month}`);
      else unread = true;
      return ' ';
    })
    .replace(IMS_THIS_MONTH, () => {
      months.add(today.slice(0, 7));
      return ' ';
    })
    .replace(IMS_LAST_MONTH, () => {
      months.add(chatMonthBefore(today));
      return ' ';
    })
    .replace(IMS_NAMED_MONTH, (_, word, year) => {
      months.add(chatMonthKey(word, year, today));
      return ' ';
    });
  if (unread || months.size > 1 || IMS_BARE_YEAR.test(left)) return { unread: true };
  return months.size ? { period: [...months][0] } : {};
}

export function imsMonthUnread(state, ask = 'accept all matched invoices in IMS for') {
  const example = latestTwobMonth(state) || chatMonthBefore(localToday());
  return { kind: 'reply', reply: inWords(`I could not read that period as one month, so I have changed nothing in IMS. Say the month, for example "${ask} ${example}".`), tools: [] };
}

export function namesAnImsParty(state, text) {
  const haystack = ` ${nameKey(text)} `;
  return [...(state.parties || []), ...(state.vendors || [])].some((party) => {
    const name = nameKey(party?.name);
    return name && IMS_SAID.test(name) && haystack.includes(` ${name} `);
  });
}

function imsNamesSupplier(state, period, text) {
  const padded = ` ${nameKey(text)} `;
  const rows = state.gstr2b && typeof state.gstr2b === 'object' && state.gstr2b[period] ? state.gstr2b[period].rows : [];
  const names = [
    ...(Array.isArray(rows) ? rows : []).map((row) => row?.supplierName),
    ...(state.purchases || []).map((bill) => bill?.partyName),
    ...(state.vendors || []).map((vendor) => vendor?.name),
    ...(state.parties || []).map((party) => party?.name),
  ].map(nameKey);
  return names.some((name) => name && padded.includes(` ${name} `));
}

function imsNamesSupplierWord(state, period, text) {
  const rows = state.gstr2b && typeof state.gstr2b === 'object' && state.gstr2b[period] ? state.gstr2b[period].rows : [];
  const leads = new Set([
    ...(Array.isArray(rows) ? rows : []).map((row) => row?.supplierName),
    ...(state.purchases || []).map((bill) => bill?.partyName),
    ...(state.vendors || []).map((vendor) => vendor?.name),
    ...(state.parties || []).map((party) => party?.name),
  ].map((name) => nameKey(name).split(' ')[0]).filter((word) => word.length >= 3 && !IMS_COMMAND_WORDS.has(word) && !IMS_MONTH_WORD.test(word)));
  return nameKey(text).split(' ').some((word) => leads.has(word));
}

function imsSelectionQualified(state, period, text) {
  const kept = text.replace(IMS_FROM_PERIOD, ' ');
  const counted = kept.replace(IMS_RELATIVE_PERIOD, ' ');
  return /\bfrom\b/i.test(kept) || IMS_NARROWED.test(kept) || IMS_DATE_FILTER.test(text) || IMS_SINGLE_ROW.test(counted) || IMS_ROW_TYPE.test(counted) || IMS_PART_OF_SET.test(counted) || imsNamesSupplier(state, period, kept) || imsNamesSupplierWord(state, period, counted);
}

export function planImsFromChat(state, text) {
  if (countryOf(state) !== 'IN' || !IMS_SAID.test(text) || isNegated(text) || REMINDER_WORDS.test(text) || namesAnImsParty(state, text)) return null;
  const hits = [...text.matchAll(IMS_DECISION_SAID)];
  const said = new Set(hits.map((hit) => hit[1].toLowerCase()));
  const bulkOnly = { kind: 'reply', reply: IMS_BULK_ONLY, tools: [] };
  const verbed = said.size === 1 && IMS_DECISION_VERB[[...said][0]].test(text);
  const marker = IMS_INFORMATIONAL.exec(text);
  const informational = Boolean(marker) && (!hits.length || marker.index < hits[0].index || hits.some((hit) => hit.index >= marker.index && hit.index < marker.index + marker[0].length));
  const commanded = verbed && !informational && !(said.has('pending') && IMS_PENDING_NOUN.test(text));
  if (/\d/.test(text.replace(IMS_PERIOD_NUMBERS, ' ').replace(IMS_PERIOD_FIGURES, ' '))) return verbed && !isQuestion(text) ? bulkOnly : null;
  const reading = imsPeriodReading(text);
  const period = reading.period || latestTwobMonth(state);
  const review = reading.unread ? imsMonthUnread(state, said.size && !isQuestion(text) && !informational ? undefined : 'show IMS for') : { kind: 'tool', name: 'ims_review', args: period ? { period } : {} };
  if (isQuestion(text) || informational) return review;
  if (said.size > 1) return { kind: 'reply', reply: IMS_ONE_AT_A_TIME, tools: [] };
  const pick = IMS_SELECT_SAID.exec(text);
  if (said.size === 1 && (pick || !said.has('pending')) && imsSelectionQualified(state, period, text)) return bulkOnly;
  if (commanded && (!pick || IMS_UNMATCHED_SAID.test(text))) return bulkOnly;
  if (said.size !== 1 || !pick || IMS_UNMATCHED_SAID.test(text) || reading.unread) return review;
  const word = (pick[1] || pick[2]).toLowerCase().replace(/\s+/g, ' ');
  return { kind: 'tool', name: 'ims_decide', args: { period: period || localToday().slice(0, 7), select: word === 'not decided' ? 'undecided' : word, decision: [...said][0] } };
}
