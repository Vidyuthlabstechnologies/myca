import { normalizeChat, receiptAmount, isQuestion, isNegated } from './intent.mjs';
import { isoDate, localToday } from './dates.mjs';
import { ownAccounts, findOwnAccount, findCustomer, findSupplier } from './bank-recon.mjs';

const LINE_ID = /\b(BL-\d{6,})\b/i;
const RULE_ID = /\b(BR-\d{4,})\b/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const NAMED_DATE = /\b(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:,?\s+((?:19|20)\d{2}))?\b/i;
const SAID_DATE = /\b(?:on\s+)?(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/;
const RECON = /\bmatch(?:ing)?\s+(?:the\s+|my\s+|our\s+)?bank\b|\breconcil\w*\b[\s\S]*\b(?:bank|statement)\b|\b(?:bank|statement)\b[\s\S]*\breconcil\w*|\bbank\s+recon\b|\bunmatched\s+(?:bank\s+)?(?:lines?|entries|items|transactions|statement)\b|\bnot\s+matched\b|\bopen\s+(?:bank\s+)?(?:statement\s+)?lines?\b/i;
const OPEN_WORDS = /\bunmatched\b|\bnot\s+matched\b|\bopen\s+(?:bank\s+)?(?:statement\s+)?lines?\b/i;
const CHARGES = /\b(?:book|post|record)\s+(?:the\s+|all\s+|my\s+|our\s+)?(?:bank\s+charges?(?:\s+and\s+(?:the\s+)?interest)?|(?:bank\s+)?charges?\s+and\s+interest|bank\s+interest|interest\s+and\s+(?:bank\s+)?charges?)\b/i;
const MOVE_VERBS = /\b(?:transferr?ed|transfer|moved|move|shifted|shift|withdrew|withdraw|withdrawn|deposited|deposit)\b/i;
const REMEMBER = /\b(?:always|remember|from\s+now\s+on|every\s+time|in\s+future|going\s+forward)\b/i;
const PARTY_WORDS = /\b(?:supplier|vendor|employee|customer|party|staff|for)\b/i;
const KIND_WORDS = [
  [/\bbank\s+charges?\b|\bcharges?\b|\bfees?\b/i, 'charge'],
  [/\binterest\b/i, 'interest'],
  [/\breceipt\b|\bcollection\b|\breceived\b/i, 'receipt'],
  [/\bpayment\b|\bpaid\b/i, 'payment'],
  [/\btransfer\b|\bcontra\b/i, 'transfer'],
  [/\bexpense\b/i, 'expense'],
  [/\bignored?\b/i, 'ignore'],
];

function tool(name, args) {
  return { kind: 'tool', name, args };
}

function reply(text) {
  return { kind: 'reply', reply: text, tools: [] };
}

function asked(text) {
  return /\?\s*$/.test(text);
}

function cleanName(value) {
  return String(value || '').trim().replace(/^(?:the|a|an|my|our)\s+/i, '').replace(/[.,;:!?]+$/, '').replace(/\s+/g, ' ').trim();
}

function kindSaid(text) {
  const hit = KIND_WORDS.find(([re]) => re.test(text));
  return hit ? hit[1] : '';
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function accountSaid(state, text) {
  const accounts = ownAccounts(state).slice().sort((a, b) => b.label.length - a.label.length);
  return accounts.find((account) => new RegExp(`\\b${escapeRe(account.label)}\\b`, 'i').test(text)) || null;
}

function yearFor(month, day, today) {
  const [y, m, d] = today.split('-').map(Number);
  return month > m || (month === m && day > d) ? y - 1 : y;
}

export function spokenDate(text, today = localToday()) {
  const named = text.match(NAMED_DATE);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    const day = Number(named[1]);
    const year = named[3] ? Number(named[3]) : yearFor(month, day, today);
    return { iso: isoDate(`${year}-${month}-${day}`), words: named[0] };
  }
  const said = text.match(SAID_DATE);
  if (said) return { iso: isoDate(said[1]), words: said[0] };
  return { iso: '', words: '' };
}

function withRemember(args, text) {
  return REMEMBER.test(text) ? { ...args, remember: true } : args;
}

function planLineMatch(state, text) {
  const found = text.match(LINE_ID);
  if (!found) return null;
  const lineId = found[1].toUpperCase();
  if (/\b(?:unmatch|unlink|reopen|undo)\b|\bopen\b[\s\S]*\bagain\b/i.test(text)) return tool('unmatch_bank_line', { lineId });
  if (asked(text)) return null;
  const rest = text.replace(found[0], ' ').replace(/\s+/g, ' ').trim();
  if (/\bignore\b/i.test(rest)) return tool('match_bank_line', { lineId, kind: 'ignore' });
  if (isNegated(rest)) return null;
  const target = rest.match(/\b(?:to|with|against)\s+([A-Z]{1,6}-[A-Z0-9/-]+|\d{5,})\b/i);
  if (target) {
    const id = target[1].toUpperCase();
    if (/^INV-/.test(id) || (state.invoices || []).some((inv) => String(inv.id).toUpperCase() === id)) return tool('match_bank_line', withRemember({ lineId, kind: 'receipt', invoiceId: id }, rest));
    if (/^BILL-/.test(id) || (state.purchases || []).some((bill) => String(bill.id).toUpperCase() === id)) return tool('match_bank_line', withRemember({ lineId, kind: 'payment', billId: id }, rest));
    return tool('match_bank_line', { lineId, kind: 'books', transferId: id });
  }
  const kind = kindSaid(rest);
  if (!kind) return null;
  if (kind === 'transfer') {
    const other = rest.match(/\b(?:to|from|with|between|and)\s+(.+?)\s*\.?$/i);
    const account = other ? findOwnAccount(state, cleanName(other[1])) : null;
    if (!account) return reply(`Say which of your own accounts the other side is, for example "${lineId} is a transfer from HDFC". Say "add bank account" first if it is not set up yet.`);
    return tool('match_bank_line', withRemember({ lineId, kind, otherAccount: account.id }, rest));
  }
  const args = { lineId, kind };
  const party = rest.match(/\b(?:from|to|for)\s+(.+?)\s*\.?$/i);
  if ((kind === 'receipt' || kind === 'payment') && party) args.partyName = cleanName(party[1]);
  if (kind === 'expense') {
    const head = rest.match(/\b(5\d{3})\b/);
    if (head) args.head = head[1];
  }
  return tool('match_bank_line', withRemember(args, rest));
}

function planRule(state, text) {
  if (asked(text) || isNegated(text) || LINE_ID.test(text)) return null;
  const always = text.match(/\b(?:always|every\s+time|from\s+now\s+on|whenever)\b[\s,]*(?:book|treat|post|mark|put|record)\s+(.+?)\s+as\s+(?:an?\s+)?(.+?)\s*\.?$/i);
  const isA = text.match(/^(?:anything|everything|any\s+line|all\s+lines|lines?|entries|neft|imps|rtgs|upi|ach|credits?|debits?)\s+(?:(?:from|to|with|containing|having|that\s+say|saying|like|marked)\s+)?(.+?)\s+(?:is|are)\s+(?:always\s+)?(?:an?\s+)?(.+?)\s*\.?$/i);
  const found = always || isA;
  if (!found) return null;
  const contains = cleanName(found[1]).replace(/^["']|["']$/g, '');
  const what = found[2];
  const kind = kindSaid(what);
  if (!contains || !kind) return null;
  const args = { contains, kind };
  const party = what.match(/\b(?:from|to|for)\s+(.+?)$/i);
  if (kind === 'receipt' || kind === 'payment') args.partyName = cleanName(party ? party[1] : contains);
  if (kind === 'expense') {
    const head = what.match(/\b(5\d{3})\b/);
    if (head) args.head = head[1];
  }
  if (kind === 'transfer') {
    const other = party ? findOwnAccount(state, cleanName(party[1])) : null;
    if (other) args.otherAccount = other.id;
  }
  return tool('add_bank_rule', args);
}

function planCharges(state, text) {
  if (asked(text) || isNegated(text) || !CHARGES.test(text) || LINE_ID.test(text)) return null;
  const account = accountSaid(state, text);
  return tool('book_bank_charges', account && account.id !== '1002' ? { account: account.id } : {});
}

function sidesOf(state, body) {
  const both = body.match(/\bfrom\s+(.+?)\s+(?:to|into)\s+(.+?)\s*\.?$/i);
  if (both) return { from: both[1], to: both[2] };
  const reversed = body.match(/\b(?:to|into)\s+(.+?)\s+from\s+(.+?)\s*\.?$/i);
  if (reversed) return { from: reversed[2], to: reversed[1] };
  if (!accountSaid(state, body)) return null;
  if (/\bwithdr/i.test(body)) {
    const bank = body.match(/\bfrom\s+(.+?)\s*\.?$/i);
    return bank ? { from: bank[1], to: 'Cash' } : null;
  }
  if (/\bdeposit/i.test(body)) {
    const bank = body.match(/\b(?:in|into|to)\s+(.+?)\s*\.?$/i);
    return bank ? { from: 'Cash', to: bank[1] } : null;
  }
  return null;
}

function planTransfer(state, text) {
  if (asked(text) || isNegated(text) || !MOVE_VERBS.test(text) || LINE_ID.test(text)) return null;
  const when = spokenDate(text);
  const body = (when.words ? text.replace(when.words, ' ') : text).replace(/\s+/g, ' ').trim();
  const sides = sidesOf(state, body);
  if (!sides) return null;
  const amount = receiptAmount(body);
  if (!amount) return null;
  const from = findOwnAccount(state, cleanName(sides.from));
  const to = findOwnAccount(state, cleanName(sides.to));
  if (from && to) return tool('record_transfer', { fromAccount: from.id, toAccount: to.id, amount, ...(when.iso ? { date: when.iso } : {}) });
  const unknown = [from ? '' : cleanName(sides.from), to ? '' : cleanName(sides.to)].filter(Boolean);
  if (!unknown.length || unknown.some((name) => findCustomer(state, name) || findSupplier(state, name))) return null;
  return reply(`I do not know an own account called ${unknown.map((name) => `"${name}"`).join(' or ')}. Say "add bank account ${unknown[0]}" (or "add cash box ${unknown[0]}") first, then say this again.`);
}

function planAccount(state, text) {
  if (asked(text) || isNegated(text) || PARTY_WORDS.test(text)) return null;
  const found = text.match(/\b(?:add|create|open|set\s+up|new)\s+(?:a\s+|an\s+|another\s+)?(?:new\s+)?(bank\s+account|current\s+account|savings\s+account|cash\s+box|cash\s+account|petty\s+cash|wallet)\s*[:,-]?\s*(.+?)\s*\.?$/i);
  if (!found) return null;
  const kind = /cash/i.test(found[1]) ? 'cash' : /wallet/i.test(found[1]) ? 'wallet' : 'bank';
  let rest = ` ${found[2]} `;
  const ifsc = rest.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i);
  if (ifsc) rest = rest.replace(ifsc[0], ' ');
  const digits = rest.match(/\b[xX*]*(\d{4,18})\b/);
  if (digits) rest = rest.replace(digits[0], ' ');
  const label = cleanName(rest.replace(/\b(?:called|named|labelled|labeled|ifsc|number|no\.?|a\/c|ending(?:\s+in)?)\b/gi, ' '));
  if (!label) return null;
  return tool('set_bank_account', { label, kind, ...(digits ? { maskedNumber: digits[1] } : {}), ...(ifsc ? { ifsc: ifsc[1].toUpperCase() } : {}) });
}

function planLists(state, text) {
  if (isNegated(text)) return null;
  const rule = text.match(RULE_ID);
  if (rule && /\b(?:remove|delete|drop|forget)\b/i.test(text) && !asked(text)) return tool('remove_bank_rule', { id: rule[1].toUpperCase() });
  if (/\b(?:run|apply|re-?run)\s+(?:the\s+|my\s+|our\s+|all\s+)?(?:bank\s+)?rules\b/i.test(text) && !asked(text)) return tool('run_bank_rules', {});
  if (/\bbank\s+rules\b|\brules\s+for\s+(?:the\s+)?bank\b|\bstatement\s+rules\b/i.test(text)) return tool('list_bank_rules', {});
  if (/\b(?:own|bank|cash\s+and\s+bank)\s+accounts\b/i.test(text) && /\b(?:list|show|which|what|my|our|all)\b/i.test(text) && !PARTY_WORDS.test(text)) return tool('list_bank_accounts', {});
  return null;
}

function planReconciliation(state, text) {
  if (isNegated(text) || !RECON.test(text) || LINE_ID.test(text)) return null;
  if (/\bgst\w*\b|\b2b\b|\btds\b|\b26as\b/i.test(text)) return null;
  const open = OPEN_WORDS.test(text);
  if (!open && (isQuestion(text) || /\b(?:how|why|explain|mean)\b/i.test(text))) return null;
  const account = accountSaid(state, text);
  return tool('bank_reconciliation', { ...(account && account.id !== '1002' ? { account: account.id } : {}), ...(open ? { status: 'unmatched' } : {}) });
}

export function planBankFromChat(state, message) {
  const text = normalizeChat(message);
  if (!text) return null;
  return planLineMatch(state, text)
    || planRule(state, text)
    || planCharges(state, text)
    || planTransfer(state, text)
    || planAccount(state, text)
    || planLists(state, text)
    || planReconciliation(state, text);
}
