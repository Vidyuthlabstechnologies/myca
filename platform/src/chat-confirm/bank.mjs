import { aaBankFeed } from '../aa-import.mjs';
import { bank } from '../sprint-load.mjs';
import { accountFor, amountOf, docWords, findBankLine, linesOf, planBankAccount, planBankCharges, planBankRule, planMatch, planTransfer, previewStatementLines, ruleFromMatch, ruleMatches, rulesOf, sideOf } from '../bank-recon.mjs';
import { ruleWords, runBankRules } from '../bank-rules.mjs';
import { money } from './shared.mjs';

const BANK_REASONS = {
  LINE_NOT_FOUND: 'That statement line is not in these books.',
  LINE_NOT_OPEN: 'That line is already matched, booked or ignored. Open it again first if that is wrong.',
  LINE_NOT_LINKED: 'That line is not matched to anything yet.',
  BOOKED_LINE: 'That line was booked and its entries are in the books; reverse them first.',
  BAD_KIND: 'A line can be matched to the books, booked as a receipt, payment, expense, bank charge, interest or transfer, or ignored.',
  TRANSFER_NOT_FOUND: 'No entry in the books matches that line.',
  SIDE_MISMATCH: 'That does not fit the way the money moved on this line.',
  AMOUNT_MISMATCH: 'The entry in the books is for a different amount.',
  RECEIPT_UNALLOCATED: 'The customer has less open on invoices than this line; raise the invoice first or record the receipt by hand.',
  PAYMENT_UNALLOCATED: 'The supplier has less open on bills than this line; enter the bill first or record the payment by hand.',
  PARTY_NOT_FOUND: 'I do not know a customer or supplier by that name.',
  PARTY_REQUIRED: 'Say who the money is from or to.',
  INVOICE_NOT_FOUND: 'There is no invoice by that id.',
  INVOICE_CANCELLED: 'That invoice is cancelled.',
  BILL_NOT_FOUND: 'There is no bill by that id.',
  BILL_PAID: 'That bill is already paid.',
  BEFORE_BILL: 'The line is dated before the bill.',
  OVERPAYMENT: 'That is more than is owed.',
  HEAD_REQUIRED: 'Say which expense head; nothing is guessed.',
  UNKNOWN_HEAD: 'That is not an expense head I know.',
  OTHER_ACCOUNT_REQUIRED: 'Say which of your own accounts the other side is.',
  ACCOUNT_NOT_FOUND: 'That is not one of your own accounts. Add it first.',
  SAME_ACCOUNT: 'Both sides are the same account.',
  BAD_AMOUNT: 'The amount has to be more than zero.',
  INVALID_DATE: 'That is not a date I can read.',
  PERIOD_LOCKED: 'That date is inside the locked period.',
  INSUFFICIENT_CASH: 'There is not that much cash in hand.',
  RULE_NOT_FOUND: 'There is no bank rule by that id.',
  BAD_SIDE: 'A rule applies to money in, money out or any.',
  MATCH_REQUIRED: 'Say what the narration must contain for the rule to apply.',
  BAD_PATTERN: 'That pattern is not a regular expression I can run.',
  BAD_RANGE: 'The smallest amount is more than the largest.',
  LABEL_REQUIRED: 'Give the account a name.',
  LABEL_TAKEN: 'An account by that name already exists.',
  BUILT_IN_ACCOUNT: 'Cash (1001) and Bank (1002) are built in and cannot be changed.',
  KIND_FIXED: 'An account keeps its kind; add a new one for a different kind.',
  BAD_ACCOUNT_NUMBER: 'An account number is 4 to 18 digits; only the last four are kept.',
  BAD_IFSC: 'An IFSC is four letters, a zero and six characters, for example HDFC0001234.',
  NO_FREE_ACCOUNT: 'All own-account ids from 1003 to 1099 are taken.',
  OWNER_ONLY: 'Only the owner can add or change own accounts.',
  NOT_A_CHARGE: 'That line does not read as a bank charge or interest.',
  LEDGER_REJECT: 'The ledger refused the entry, so nothing was changed.',
};

function bankBlocked(error, hint = '') {
  return { blockers: [[BANK_REASONS[error] || String(error), hint].filter(Boolean).join(' ')], summary: '', effects: [], figures: {} };
}

function lineAmountWords(line) {
  return line.in ? `${money(line.in)} in` : `${money(line.out)} out`;
}

function matchSummary(line, plan) {
  const amount = lineAmountWords(line);
  if (plan.kind === 'ignore') return `Ignore ${line.id} (${amount}); it stays on the statement with no entry in the books.`;
  if (plan.kind === 'books' || (plan.kind === 'transfer' && plan.link)) return `Link ${line.id} (${amount}) to ${docWords(plan.movement).toLowerCase()} of ${money(plan.movement.amount)} dated ${plan.movement.date}; nothing new is posted.`;
  if (plan.kind === 'receipt') return `Book ${line.id}: ${money(amountOf(line))} received from ${plan.partyName} against ${plan.allocations.map((part) => `${part.invoiceId} (${money(part.amount)})`).join(', ')}.`;
  if (plan.kind === 'payment') return `Book ${line.id}: ${money(amountOf(line))} paid to ${plan.partyName} against ${plan.allocations.map((part) => `${part.billId} (${money(part.amount)})`).join(', ')}.`;
  if (plan.kind === 'interest') return `Book ${line.id}: ${money(plan.amount)} as interest income (4100).`;
  if (plan.kind === 'transfer') return `Post a transfer of ${money(plan.transfer.amount)} ${sideOf(line) === 'in' ? `from ${plan.other.label} into this account` : `from this account to ${plan.other.label}`} for ${line.id}.`;
  return `Book ${line.id}: ${money(plan.expense.amount)} as ${plan.headName} (${plan.head}) paid from the bank.`;
}

export function matchPreview(state, args) {
  const line = findBankLine(state, args.lineId);
  if (!line) return bankBlocked('LINE_NOT_FOUND');
  const planned = planMatch(state, line, args);
  if (!planned.ok) return bankBlocked(planned.error, planned.hint);
  const effects = ['The statement line is settled and is not suggested again.'];
  if (args.remember === true) effects.push(ruleFromMatch(line, planned.plan, args).words);
  return { blockers: [], summary: matchSummary(line, planned.plan), effects, figures: { lineId: line.id, amount: amountOf(line), kind: planned.plan.kind } };
}

export function unmatchPreview(state, args) {
  const line = findBankLine(state, args.lineId);
  if (!line) return bankBlocked('LINE_NOT_FOUND');
  if (line.status === 'unmatched') return bankBlocked('LINE_NOT_LINKED');
  if (line.status === 'booked') return bankBlocked('BOOKED_LINE');
  return { blockers: [], summary: `Open ${line.id} (${lineAmountWords(line)}) again; its link to ${line.match?.id || 'the books'} is removed and nothing in the books changes.`, effects: ['The line goes back to the open list with fresh suggestions.'], figures: { lineId: line.id } };
}

export function chargesPreview(state, args) {
  const planned = planBankCharges(state, args);
  if (!planned.ok) return bankBlocked(planned.error);
  const { items, skipped } = planned.plan;
  if (!items.length) return { blockers: ['No open statement line reads as a bank charge or as interest.'], summary: '', effects: [], figures: { skipped: skipped.length } };
  const charges = items.filter((item) => item.plan.kind === 'charge');
  const interest = items.filter((item) => item.plan.kind === 'interest');
  const sum = (list) => list.reduce((total, item) => total + amountOf(item.line), 0);
  const parts = [];
  if (charges.length) parts.push(`${charges.length} ${charges.length === 1 ? 'line' : 'lines'} of bank charges, ${money(sum(charges))}, to 5180 Bank charges`);
  if (interest.length) parts.push(`${interest.length} ${interest.length === 1 ? 'line' : 'lines'} of interest, ${money(sum(interest))}, to 4100 Interest income`);
  const left = skipped.filter((item) => item.reason === 'NOT_A_CHARGE').length;
  return {
    blockers: [],
    summary: `Book ${parts.join(' and ')}.`,
    effects: ['Each line posts on its own statement date against the bank.', ...(left ? [`${left} other open ${left === 1 ? 'line is' : 'lines are'} left alone because ${left === 1 ? 'it does' : 'they do'} not read as a charge or interest.`] : [])],
    figures: { charges: sum(charges), interest: sum(interest), lines: items.length },
  };
}

export function addRulePreview(state, args) {
  const planned = planBankRule(state, args);
  if (!planned.ok) return bankBlocked(planned.error, planned.hint);
  const rule = { id: 'A new rule', ...planned.plan, hits: 0 };
  const open = linesOf(state).filter((line) => line.status === 'unmatched' && ruleMatches(rule, line));
  const now = args.applyNow === false ? 'It is not applied to open lines now.' : open.length ? `It fits ${open.length} open ${open.length === 1 ? 'line' : 'lines'} now, which will be booked.` : 'No open line fits it now.';
  return { blockers: [], summary: `Save ${ruleWords(rule, money).replace(/^A new rule: /, 'a rule: ')}. ${now}`, effects: ['Every later import applies it before anything is guessed.', 'Rules apply in id order; the first one that fits wins.'], figures: { matches: open.length } };
}

export function removeRulePreview(state, args) {
  const rule = rulesOf(state).find((item) => item.id === String(args.id || '').trim().toUpperCase());
  if (!rule) return bankBlocked('RULE_NOT_FOUND');
  return { blockers: [], summary: `Remove ${ruleWords(rule, money)}. Lines it already booked stay as they are.`, effects: ['Later imports no longer apply it.'], figures: { hits: Number(rule.hits || 0) } };
}

export function runRulesPreview(state, args) {
  if (!rulesOf(state).length) return { blockers: ['There are no bank rules yet.'], summary: '', effects: [], figures: {} };
  const dry = runBankRules(state, { account: args.account, dryRun: true });
  if (!dry.ok) return bankBlocked(dry.error);
  return {
    blockers: [],
    summary: `${dry.made.length} open ${dry.made.length === 1 ? 'line' : 'lines'} will be booked by your rules${dry.failed.length ? `, ${dry.failed.length} cannot be` : ''}, ${dry.left} ${dry.left === 1 ? 'stays' : 'stay'} open.`,
    effects: args.dryRun ? ['Dry run: nothing is booked.'] : ['Each booked line posts on its statement date.'],
    figures: { made: dry.made.length, failed: dry.failed.length, left: dry.left },
  };
}

export function setAccountPreview(state, args) {
  const planned = planBankAccount(state, args);
  if (!planned.ok) return bankBlocked(planned.error);
  const { plan } = planned;
  const extra = [plan.kind, plan.maskedNumber, plan.ifsc].filter(Boolean).join(', ');
  return {
    blockers: [],
    summary: plan.existing ? `Rename ${plan.existing.label} (${plan.id}) to ${plan.label}.` : `Add ${plan.label} (${plan.id}${extra ? `, ${extra}` : ''}).`,
    effects: plan.existing ? ['The balance and every entry stay as they are.'] : ['A ledger account is opened; its statements import with account set to its id or name.'],
    figures: { id: plan.id },
  };
}

export function transferPreview(state, args) {
  const planned = planTransfer(state, args);
  if (!planned.ok) return bankBlocked(planned.error);
  const { plan } = planned;
  return { blockers: [], summary: `Move ${money(plan.amount)} from ${plan.from.label} to ${plan.to.label} on ${plan.date}${plan.reference ? ` (${plan.reference})` : ''}.`, effects: ['One contra entry is posted; statement lines on both sides link to it.'], figures: { amount: plan.amount } };
}

export function bankPreview(state, args) {
  const aa = aaBankFeed(args);
  if (aa && !aa.ok) return { blockers: [`${aa.error}: ${aa.hint || 'the Account Aggregator file could not be read'}`], summary: 'Account Aggregator data could not be read.', effects: [], figures: {} };
  const parsed = bank.ingest(aa ? aa.feed : { type: args.type || 'csv', content: args.content }, { fileLabel: args.fileName || 'bank' });
  const rows = (parsed.rows || []).filter((r) => !r._blocking && r.type !== 'balance-only');
  const account = accountFor(state, args.account);
  const counts = account ? previewStatementLines(state, rows, { account: account.id }) : { existing: 0, toLink: 0, byRules: 0, rest: 0, transfers: 0 };
  const hold = args.post === 'hold';
  const plan = `${counts.toLink} ${counts.toLink === 1 ? 'line is' : 'lines are'} already in the books and will be linked, ${counts.byRules} ${counts.byRules === 1 ? 'is' : 'are'} covered by your rules, ${counts.rest} will ${hold ? 'wait for you to match' : 'be posted to guessed heads'}${counts.existing ? `, ${counts.existing} ${counts.existing === 1 ? 'was' : 'were'} imported before` : ''}.`;
  return {
    blockers: account ? [] : [`There is no own account called "${args.account}". Add it first.`],
    summary: `${aa ? `Account Aggregator data (${aa.accounts.map((a) => a.maskedAccNumber || 'account').join(', ')})` : 'Bank statement'}: ${(parsed.rows || []).length} rows parsed, ${rows.length} postable${parsed.ok === false ? ' (the running balance does not tie — check the statement)' : ''}. ${plan}`,
    effects: [hold ? 'Nothing is posted to a guessed head; every open line waits on the bank reconciliation.' : 'Lines nothing else explains post against bank with the classified account.', 'Rows already imported are recognised and skipped.'],
    figures: { rows: (parsed.rows || []).length, postable: rows.length, tied: parsed.ok !== false, ...counts },
  };
}
