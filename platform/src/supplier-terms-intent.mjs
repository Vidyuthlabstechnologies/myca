import { isQuestion, isNegated } from './intent.mjs';
import { nameKey } from './chat-words.mjs';

export const SUPPLIER_DUES_SAID = /\b(?:msme|udyam|micro|small\s+enterprise)\b.*\b(?:dues?|owe|owed|payable|bills?|pay)\b|\b(?:supplier|vendor)\s+dues\b|\bwhat\s+do\s+i\s+owe\s+(?:my\s+)?(?:msme|suppliers)\b/i;
export const MSME_STATED = /\bis\s+(?:an?\s+)?msme\b/i;
const MSME_KEYWORD = '(?:msme|micro\\s+enterprise|small\\s+enterprise|medium\\s+enterprise)';
const MSME_ARTICLE = '(?:(?:an?|the)\\s+|a\\s+registered\\s+)?';
const MSME_MARKED = new RegExp(`^(?:please\\s+)?mark\\s+(.+?)\\s+as\\s+${MSME_ARTICLE}(${MSME_KEYWORD})\\b(.*)$`, 'i');
const MSME_IS = new RegExp(`^(.+?)\\s+is\\s+${MSME_ARTICLE}(${MSME_KEYWORD})\\b(.*)$`, 'i');
const MSME_WORD = new RegExp(`\\b${MSME_KEYWORD}`, 'i');
const MSME_CATEGORY = /\b(micro|small|medium)\s+(?:category|enterprise|unit)\b|\bcategory\s*[:=-]?\s*(micro|small|medium)\b/i;
const MSME_CATEGORY_BARE = /(?<![\w-])(micro|small|medium)(?![\w-])(?=\s*(?:$|[,;.)]|\d))/i;
const SUPPLIER_DAYS_NUMBER = '\\d+(?:[.,]\\d+)*';
const SUPPLIER_DAYS_PATTERN = `\\bnet\\s*(${SUPPLIER_DAYS_NUMBER})\\b|(?<!\\d)(?<!\\d[.,])(${SUPPLIER_DAYS_NUMBER})\\s*-?\\s*days?\\b`;
const SUPPLIER_DAYS = new RegExp(SUPPLIER_DAYS_PATTERN, 'i');
const SUPPLIER_DAYS_SAID = new RegExp(SUPPLIER_DAYS_PATTERN, 'gi');
const SUPPLIER_DAYS_FORM = 'Agreed days must be a whole number from 0 to 365.';
const SUPPLIER_TERMS_FOR = /^(?:please\s+)?(?:(?:set|update|change|record|save)\s+)?(?:the\s+)?(?:supplier|vendor)\s+terms\s+(?:for|of|with)\s+(.+)$/i;
const PAYMENT_TERMS_FOR = /^(?:please\s+)?(?:(?:set|update|change|record|save|put)\s+)?(?:the\s+)?payment\s+terms\s+(?:for|of|with)\s+(.+)$/i;
const PAYMENT_TERMS_OF = /^(?:please\s+)?(?:(?:set|update|change|record|save|put)\s+)?(?:the\s+)?(.+?)(?:['’]s)?\s+payment\s+terms\b(.*)$/i;
const TERMS_DETAILS_START = /\s*[:,;]\s*|\s+(?:to|are|is|as|at|net)\b|\s+(?=\d)/i;
const TERMS_NEXT = /^(?:\s*[:,;]|\s+(?:\d|(?:to|are|is|as|at|net|msme|micro|small|medium|udyam|payable|pay|in|within|after)\b)|\s*$)/i;
const TERMS_TRAILING = /\b(?:msme|micro|small|medium|enterprise|udyam|payable|pay|paid|in|within|after|of|for|on)\s*$/i;
const NOT_SAID = /\b(?:not|non|no|never)\b|n['’]t\b/i;
const NOT_A_NAME = /[%₹]|\b(?:gst|gstin|rs|inr)\b|\d{4,}/i;
const UDYAM_NUMBER_SAID = /(?:\b(?:with|having|under|on)\s+)?(?:\budyam\s*(?:registration\s*)?(?:no\.?|number)?\s*(?:is\s*)?[:#]?\s*)?\b(UDYAM-[A-Z]{2}-\d{2}-\d{7})\b/i;
const UDYAM_MALFORMED = /\budyam\b\s*(?:registration\s*)?(?:no\.?|number)?\s*(?:is\s*)?[:#]?\s*(?:UDYAM\b|[A-Za-z0-9-]*\d)/i;
const UDYAM_ONLY = /^(.+?)(?:['’]s|\s+(?:has|have|had|holds?|got))?\s+udyam\s*(?:registration\s*)?(?:no\.?|number)?\s*(?:is\s*)?[:#]?\s*(UDYAM-[A-Z]{2}-\d{2}-\d{7})\b(.*)/i;
const UDYAM_ONLY_MALFORMED = /^(.+?)(?:['’]s)?\s+udyam\s*(?:registration\s*)?(?:(?:no\.?|number)\s*(?:is\s*)?[:#]?\s*\S*\d|(?:is\s*)?[:#]?\s*(?:UDYAM\b|[A-Za-z]{2}-\d{2}-\d))/i;
const UDYAM_OF = /^(?:the\s+)?udyam\s*(?:registration\s*)?(?:no\.?|number)?\s+(?:of|for)\s+(.+?)\s*(?:\b(?:is|are)\b\s*)?[:=]?\s*(UDYAM-[A-Z]{2}-\d{2}-\d{7})\b(.*)$/i;
const UDYAM_OF_MALFORMED = /^(?:the\s+)?udyam\s*(?:registration\s*)?(?:no\.?|number)?\s+(?:of|for)\s+.+?\s*(?:\b(?:is|are)\b\s*)?[:=]?\s*(?:UDYAM\b|[A-Za-z]{2}-\d{2}-\d)/i;
const UDYAM_ANOTHER = /UDYAM-[A-Z]{2}-\d{2}-\d{7}/i;
const UDYAM_FORM = 'A Udyam number looks like UDYAM-XX-00-0000000.';
const PAYS_WITHIN_DAYS = /^(?:(?:please|pls|kindly)\s+)?(?:(?:we|i)(?:['’](?:ll|d))?\s+(?:(?:will|shall|usually|normally|always|should|must|can|could|would|need\s+to|have\s+to|agreed?\s+to|have\s+agreed\s+to|are\s+to|plan\s+to|want\s+to)\s+)*)?pay\s+(.+?)\s+(?:(?:in|within|after)\s+(\d+(?:[.,]\d+)*)\s*-?\s*days?|net\s*(\d+(?:[.,]\d+)*))\b(.*)$/i;
const SUPPLIER_NAME_NOISE = new Set(['my', 'our', 'the', 'a', 'an', 'supplier', 'vendor', 'suppliers', 'vendors', 'please', 'pls', 'kindly', 'mark', 'that', 's', 'since', 'as', 'because', 'so', 'also', 'but', 'note', 'now', 'today', 'hey', 'hi', 'hello', 'oh', 'just', 'well', 'btw', 'fyi', 'actually', 'remember', 'confirm', 'once', 'after', 'maybe', 'all', 'every', 'each', 'both', 'set', 'add', 'save', 'record', 'update', 'register', 'tag', 'msme', 'too', 'called', 'named', 'yes', 'ok', 'okay', 'again']);
const SUPPLIER_LEAD_PHRASE = '(?:by\\s+the\\s+way|for\\s+the\\s+record|just\\s+so\\s+you\\s+know|for\\s+your\\s+information|note\\s+to\\s+self|(?:(?:please|pls|kindly)\\s+)?note\\s+(?:that|down)|(?:please|pls|kindly)\\s+note|remember\\s+that|confirm\\s+that)';
const SUPPLIER_LEAD_SURE = '(?:since|as|because|so|also|but|please|pls|kindly|that|hey|btw|fyi|actually|remember|maybe)';
const SUPPLIER_LEAD_MAYBE = '(?:note|now|today|confirm|once|after|just|well|hi|hello|oh|okay|ok)';
const SUPPLIER_LEAD_SOFT = '(?:\\s*[:,;]\\s*|\\s+-\\s+|\\s+)';
const SUPPLIER_LEAD_HARD = '(?:\\s*[:,;]\\s*|\\s+-\\s+)';
const SUPPLIER_LEAD_IN = new RegExp(`^(?:(?:${SUPPLIER_LEAD_PHRASE}|${SUPPLIER_LEAD_SURE})${SUPPLIER_LEAD_SOFT}|${SUPPLIER_LEAD_MAYBE}${SUPPLIER_LEAD_HARD})+`, 'i');
const SUPPLIER_ASIDE = /\b(?:by the way|for the record|just so you know|for your information|note to self|note down|note that|remember that|confirm that)\b/g;
const SUPPLIER_CONDITIONAL = /^(?:(?:ok(?:ay)?|so|well|and|but|then|hey|btw|fyi|also|please)[\s,]+)*(?:(?:even|only|as|what|not\s+sure|unsure|wonder(?:ing)?|check(?:ing)?|see(?:ing)?|ask(?:ing)?|know(?:ing)?|find\s+out)\s+)?(?:if|when|whenever|whether|suppose|supposing|assuming|unless|in\s+case|provided)\b/i;
const NAME_LIST_SAID = /[,;&+/]|\b(?:and|or|nor|plus|both|either|neither)\b/i;
const NAME_PRONOUNS = new Set(['i', 'me', 'we', 'us', 'you', 'he', 'him', 'she', 'her', 'it', 'they', 'them', 'who', 'whom', 'whoever', 'which', 'what', 'this', 'that', 'these', 'those', 'one', 'ones', 'everyone', 'everybody', 'everything', 'anyone', 'anybody', 'anything', 'someone', 'somebody', 'something', 'nobody', 'nothing', 'none', 'his', 'hers', 'their', 'theirs', 'its', 'your', 'yours', 'mine', 'ours', 'last', 'same', 'other', 'others', 'another']);
const MSME_ALSO = /\band\b.+\b(?:as|is|are)\s+(?:(?:an?|the)\s+)?(?:msme|micro|small|medium)\b/i;
export const TERMS_TALK_SAID = /\b(?:msme|udyam|(?:supplier|vendor)\s+terms)\b/i;
export const POSTING_SAID = /\b(?:invoice|bill\s+from|buy\s+from|bought|purchased?|sold|sell|raise\s+bill|create\s+bill|sales?\s+to)\b/i;

function knownSupplierNames(state, { suppliersOnly = false } = {}) {
  const names = new Map();
  const add = (name) => {
    const key = nameKey(name);
    if (key && !names.has(key)) names.set(key, String(name).trim());
  };
  for (const bill of state.purchases || []) add(bill?.partyName);
  for (const vendor of state.vendors || []) add(vendor?.name);
  if (!suppliersOnly) for (const party of state.parties || []) add(party?.name);
  return names;
}

function knownSupplierIn(names, part) {
  const padded = ` ${nameKey(part)} `;
  const hits = [...names.entries()].filter(([key]) => padded.includes(` ${key} `)).sort((a, b) => b[0].length - a[0].length);
  for (const [key, display] of hits) {
    const left = padded.replace(` ${key} `, ' ').replace(SUPPLIER_ASIDE, ' ').trim().split(/\s+/).filter((word) => word && !SUPPLIER_NAME_NOISE.has(word));
    if (!left.length) return display;
  }
  return '';
}

function supplierNamesIn(names, part) {
  const padded = ` ${nameKey(part)} `;
  const hits = [...names.keys()].filter((key) => padded.includes(` ${key} `));
  return hits.filter((key) => !hits.some((other) => other !== key && ` ${other} `.includes(` ${key} `)));
}

function supplierNameSaid(state, part, loose) {
  const names = knownSupplierNames(state);
  const known = knownSupplierIn(names, part);
  if (known) return known;
  const lead = loose ? /^(?:please\s+)?(?:(?:my|our|the)\s+)?(?:supplier|vendor)\s+/i : /^(?:please\s+)?(?:my|our|the)\s+(?:supplier|vendor)\s+/i;
  const name = String(part || '').trim().replace(SUPPLIER_LEAD_IN, '').replace(lead, '').replace(/\s+(?:supplier|vendor|msme)$/i, '').trim();
  if (!name || name.toLowerCase().split(/\s+/).every((word) => SUPPLIER_NAME_NOISE.has(word)) || NOT_A_NAME.test(name) || !/[a-z]/i.test(name)) return '';
  if (NAME_LIST_SAID.test(name.replace(/\bm\/s\b\.?/gi, ' ')) || supplierNamesIn(names, name).length > 1) return '';
  return nameKey(name).split(' ').some((word) => NAME_PRONOUNS.has(word)) ? '' : name;
}

function supplierOnlyNamed(state, part) {
  const supplier = knownSupplierIn(knownSupplierNames(state, { suppliersOnly: true }), part);
  if (!supplier) return '';
  const key = nameKey(supplier);
  const customers = [...(state.parties || []).map((party) => party?.name), ...(state.invoices || []).map((invoice) => invoice?.partyName)];
  return customers.some((name) => nameKey(name) === key) ? '' : supplier;
}

function supplierTermsTail(state, tail) {
  const known = [...knownSupplierNames(state).values()]
    .sort((a, b) => b.length - a.length)
    .find((name) => tail.slice(0, name.length).toLowerCase() === name.toLowerCase() && TERMS_NEXT.test(tail.slice(name.length)));
  if (known) return { part: known, rest: tail.slice(known.length), known: true };
  const cut = TERMS_DETAILS_START.exec(tail);
  return { part: cut ? tail.slice(0, cut.index) : tail, rest: cut ? tail.slice(cut.index) : '', known: false };
}

function supplierConditional(part) {
  const body = String(part || '').trim();
  return SUPPLIER_CONDITIONAL.test(body) || SUPPLIER_CONDITIONAL.test(body.replace(SUPPLIER_LEAD_IN, ''));
}

function supplierTermsDeclined() {
  return { kind: 'tool', name: 'company_profile', args: {}, fallback: true };
}

function supplierTermsDetails(udyam, keyword, rest, msme) {
  const days = SUPPLIER_DAYS.exec(rest);
  const worded = /^(micro|small|medium)\b/i.exec(keyword) || MSME_CATEGORY.exec(rest) || (msme ? MSME_CATEGORY_BARE.exec(rest) : null);
  const category = worded ? (worded[1] || worded[2]).toLowerCase() : '';
  return { ...(udyam ? { udyam } : {}), ...(category ? { category } : {}), ...(days ? { days: Number(days[1] || days[2]) } : {}) };
}

function supplierDaysBad(token) {
  return /[.,]/.test(token) || Number(token) > 365;
}

function supplierDaysOutOfRange(text) {
  for (const hit of text.matchAll(SUPPLIER_DAYS_SAID)) if (supplierDaysBad(hit[1] || hit[2])) return true;
  return false;
}

function supplierDaysRefused() {
  return { kind: 'reply', reply: SUPPLIER_DAYS_FORM, tools: [], blocked: true };
}

function supplierPayingDays(state, body) {
  const paying = PAYS_WITHIN_DAYS.exec(body);
  if (!paying || /\d/.test(`${paying[1]} ${paying[4]}`)) return null;
  const supplier = knownSupplierIn(knownSupplierNames(state, { suppliersOnly: true }), paying[1]);
  if (!supplier) return null;
  const days = paying[2] || paying[3];
  return supplierDaysBad(days) ? supplierDaysRefused() : { kind: 'tool', name: 'set_supplier_terms', args: { partyName: supplier, days: Number(days) } };
}

function supplierPaymentTerms(state, body) {
  const termsFor = PAYMENT_TERMS_FOR.exec(body);
  const termsOf = termsFor ? null : PAYMENT_TERMS_OF.exec(body);
  const tail = termsFor ? supplierTermsTail(state, termsFor[1]) : null;
  const part = tail ? tail.part : termsOf ? termsOf[1] : '';
  const rest = tail ? tail.rest : termsOf ? termsOf[2] : '';
  const supplier = part ? supplierOnlyNamed(state, part) : '';
  if (!supplier || NOT_SAID.test(rest)) return null;
  if (supplierDaysOutOfRange(rest)) return supplierDaysRefused();
  const details = supplierTermsDetails('', '', rest, MSME_WORD.test(rest));
  if (details.days == null) return null;
  return { kind: 'tool', name: 'set_supplier_terms', args: { partyName: supplier, ...(MSME_WORD.test(rest) ? { msme: true } : {}), ...details } };
}

function udyamTermsPlan(state, name, udyam, rest) {
  if (UDYAM_ANOTHER.test(rest)) return null;
  if (supplierConditional(name)) return supplierTermsDeclined();
  const partyName = supplierNameSaid(state, name, true);
  if (!partyName) return null;
  if (supplierDaysOutOfRange(rest)) return supplierDaysRefused();
  return { kind: 'tool', name: 'set_supplier_terms', args: { partyName, msme: true, ...supplierTermsDetails(udyam.toUpperCase(), '', rest, true) } };
}

export function planSupplierTermsFromChat(state, text) {
  const body = text.replace(/\s+/g, ' ').trim();
  if (isNegated(body) || isQuestion(body)) return null;
  if (POSTING_SAID.test(body)) return supplierPayingDays(state, body) || supplierPaymentTerms(state, body);
  const udyamFound = UDYAM_NUMBER_SAID.exec(body);
  const udyam = udyamFound ? udyamFound[1].toUpperCase() : '';
  const bare = udyamFound ? body.replace(udyamFound[0], ' ').replace(/\s+/g, ' ').trim() : body;
  const marked = MSME_MARKED.exec(bare);
  const stated = marked || MSME_IS.exec(bare);
  const termsFor = stated ? null : SUPPLIER_TERMS_FOR.exec(bare);
  if (stated || termsFor) {
    const tail = termsFor ? supplierTermsTail(state, termsFor[1]) : null;
    const part = stated ? stated[1] : tail.part;
    const rest = stated ? stated[3] : tail.rest;
    if (UDYAM_MALFORMED.test(`${part} ${rest}`)) return { kind: 'reply', reply: UDYAM_FORM, tools: [] };
    if (tail && (NOT_SAID.test(rest) || (!tail.known && (NOT_SAID.test(part) || TERMS_TRAILING.test(part))))) return supplierTermsDeclined();
    if (MSME_ALSO.test(rest) || UDYAM_NUMBER_SAID.test(bare)) return null;
    if (stated && supplierConditional(part)) return supplierTermsDeclined();
    const partyName = tail?.known ? part : supplierNameSaid(state, part, Boolean(marked || termsFor));
    if (!partyName) return termsFor ? supplierTermsDeclined() : null;
    if (supplierDaysOutOfRange(rest)) return supplierDaysRefused();
    const msme = Boolean(stated) || MSME_WORD.test(rest);
    const details = supplierTermsDetails(udyam, stated ? stated[2] : '', rest, msme);
    if (termsFor && !msme && !Object.keys(details).length) return supplierTermsDeclined();
    return { kind: 'tool', name: 'set_supplier_terms', args: { partyName, ...(msme ? { msme: true } : {}), ...details } };
  }
  const udyamOf = UDYAM_OF.exec(body);
  if (udyamOf) return udyamTermsPlan(state, udyamOf[1], udyamOf[2], udyamOf[3]);
  const udyamOnly = UDYAM_ONLY.exec(body);
  if (udyamOnly) return udyamTermsPlan(state, udyamOnly[1], udyamOnly[2], udyamOnly[3]);
  if (UDYAM_OF_MALFORMED.test(body) || UDYAM_ONLY_MALFORMED.test(body)) return { kind: 'reply', reply: UDYAM_FORM, tools: [] };
  return supplierPayingDays(state, body) || supplierPaymentTerms(state, body);
}
