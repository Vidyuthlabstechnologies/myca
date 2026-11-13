import { planMonthClose } from './month-close.mjs';
import { planSkuSupply } from './restock.mjs';
import { planAttachDocument } from './receipt-match.mjs';
import { planTallyPush } from './tally-push.mjs';
import { aaBankFeed } from './aa-import.mjs';
import { planCashReading } from './cash-forecast.mjs';
import { planAsk, planReply } from './ca-requests.mjs';
import { formatMoneyCurrent } from './country.mjs';
import { planYearClose } from './year-close.mjs';
import { planPosImport } from './import-pos.mjs';
import { planSettlement, settlementWords } from './settlements.mjs';
import { planOrderImport, settlementInvoices } from './marketplace-orders.mjs';
import { planChannelIdentity } from './marketplace-credits.mjs';
import { planSkuCost, parseSkuCostsCsv } from './sku-margins.mjs';
import { planInventoryValuation } from './inventory.mjs';
import { planStockTransfer } from './stock-transfers.mjs';
import { tally, bank } from './sprint-load.mjs';
import { parseZohoBooksCsv } from './import-zoho.mjs';
import { tallyXmlToDayBookCsv } from './tally-xml.mjs';
import { findBankLine, planMatch, planBankCharges, planBankRule, planBankAccount, planTransfer, previewStatementLines, rulesOf, linesOf, accountFor, amountOf, sideOf, ruleMatches, docWords, ruleFromMatch } from './bank-recon.mjs';
import { runBankRules, ruleWords } from './bank-rules.mjs';
import { money } from './confirm-words.mjs';

export function yearClosePreview(state, args) {
  const plan = planYearClose(state, args);
  if (!plan.ok) {
    const reason = { BAD_YEAR: plan.hint || 'Say the year to close.', YEAR_NOT_ENDED: `${plan.year} has not ended yet (it runs to ${plan.to}).`, ALREADY_CLOSED: `${plan.year} was closed on ${plan.closedOn}.`, NOTHING_TO_CLOSE: `There is no income or expense in ${plan.year} to close.` }[plan.error] || plan.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const p = plan.plan;
  return {
    blockers: [],
    summary: `Close ${p.year} (${p.from} to ${p.to}): income ${formatMoneyCurrent(p.income)}, expenses ${formatMoneyCurrent(p.expenses)}, ${p.profit >= 0 ? 'profit' : 'loss'} ${formatMoneyCurrent(Math.abs(p.profit))} moved to capital across ${p.rows.length === 1 ? '1 account' : `${p.rows.length} accounts`}.`,
    effects: ['The closing entries are new entries dated the last day of the year; nothing already posted changes.', `The books lock through ${p.lockThrough}; nothing can be dated on or before it afterwards.`],
    figures: { year: p.year, income: p.income, expenses: p.expenses, profit: p.profit, lockThrough: p.lockThrough },
  };
}

const TALLY_REASONS = { INVALID_PERIOD: 'Say the month as YYYY-MM.', BAD_TALLY_URL: 'That Tally address is not a URL.', TALLY_NOT_LOCAL: 'Tally is reached on this machine only, for example http://127.0.0.1:9000.', COMPANY_NAME_REQUIRED: 'Tally imports into the company by name; set the business name first.' };
export function tallyPushPreview(state, args) {
  const planned = planTallyPush(state, args);
  if (!planned.ok) {
    const reason = planned.error === 'NOTHING_TO_PUSH' ? `Nothing in ${planned.period} to send.` : planned.error === 'ALREADY_PUSHED' ? `${planned.period} was already sent to Tally on ${planned.pushedOn} (${planned.created} created). Say "push ${planned.period} to Tally again" only after deleting those vouchers in Tally.` : TALLY_REASONS[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const p = planned.plan;
  return {
    blockers: [],
    summary: `Send ${p.period} to Tally at ${p.url}: ${p.vouchers} ${p.vouchers === 1 ? 'voucher' : 'vouchers'} and ${p.ledgers} ledger masters into company "${p.company}".${p.again ? ' This is a second send of the same month.' : ''}`,
    effects: ['Tally creates the ledgers it does not have and the vouchers as new entries; MyCA\'s books do not change.', 'Tally must be open with that company loaded and its HTTP server on.'],
    figures: { period: p.period, vouchers: p.vouchers, ledgers: p.ledgers },
  };
}

const ATTACH_REASONS = { INVALID_SHA256: 'That is not a document MyCA knows.', DOCUMENT_NOT_FOUND: 'That document is not in these books; upload it first.', ENTRY_NOT_FOUND: 'There is no entry by that id.' };
export function attachDocumentPreview(state, args) {
  const planned = planAttachDocument(state, args);
  if (!planned.ok) return { blockers: [ATTACH_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const p = planned.plan;
  const t = p.target;
  return {
    blockers: [],
    summary: `Keep the document with ${p.kind} ${p.id} (${t.partyName || t.payee || t.narration || ''}, ${money(t.total ?? t.amount)} on ${t.date}).${p.replaces ? ' It replaces the document already attached.' : ''}`,
    effects: ['Nothing is posted; the entry keeps its figures and gains its document.'],
    figures: { id: p.id, kind: p.kind },
  };
}

const SUPPLY_REASONS = { SKU_REQUIRED: 'Say which SKU.', BAD_LEAD_DAYS: 'Lead time is whole days, 0 to 365.', BAD_PACK: 'A pack is a whole number of units, at least 1.', BAD_MOQ: 'The minimum order is a whole number.' };
export function skuSupplyPreview(state, args) {
  const planned = planSkuSupply(state, args);
  if (!planned.ok) return { blockers: [SUPPLY_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const p = planned.plan;
  const was = p.before ? ` Before: ${p.before.supplier || 'no supplier'}, ${p.before.leadDays} days, pack ${p.before.pack}, MOQ ${p.before.moq}.` : '';
  return {
    blockers: [],
    summary: `${p.sku}${p.known ? '' : ' (not yet in the SKU list)'}: supplier ${p.supplier || 'not named'}, lead time ${p.leadDays} days, pack of ${p.pack}, minimum order ${p.moq}.${was}`,
    effects: ['The restock plan uses these to time and size orders for this SKU.'],
    figures: { sku: p.sku, leadDays: p.leadDays, pack: p.pack, moq: p.moq },
  };
}

const MONTH_CLOSE_REASONS = {
  INVALID_PERIOD: () => 'Say the month as 2026-09.',
  MONTH_NOT_OVER: (p) => `${p.period} is not over yet; close it from ${p.lastDay} onwards.`,
  DRAFT_CHANGED: () => 'The books changed since that close was drafted; say "close the month" again and approve the fresh one.',
  ALREADY_CLOSED: (p) => `${p.period} was closed on ${p.closedOn}.`,
  NOTE_REQUIRED: (p) => `${p.needsYou.length} ${p.needsYou.length === 1 ? 'check needs' : 'checks need'} you (${p.needsYou.join(', ')}); add a note saying why you are closing anyway, for example "approve the close: the two Mehta bills are different consignments".`,
};
export function monthClosePreview(state, args) {
  const planned = planMonthClose(state, args);
  if (!planned.ok) {
    const reason = MONTH_CLOSE_REASONS[planned.error];
    return { blockers: [reason ? reason(planned) : planned.error], summary: '', effects: [], figures: {} };
  }
  const d = planned.close;
  return {
    blockers: [],
    summary: `Sign off ${d.month}: ${d.checks.length - d.needsYou.length} of ${d.checks.length} checks passed${d.needsYou.length ? `; open: ${d.needsYou.join(', ')}` : ''}.${planned.note ? ` Note: ${planned.note}` : ''} ${d.narrative}`,
    effects: [`The books lock through ${d.lastDay}; nothing dated on or before it can be posted or changed without unlocking.`, 'The close, its open items and the note are kept with the books.'],
    figures: { period: d.period, draftHash: d.draftHash, openItems: d.needsYou, lockThrough: d.lastDay },
  };
}

export function cashReadingPreview(state, args) {
  const planned = planCashReading(state, args);
  if (!planned.ok) {
    const reason = {
      INVALID_DATE: `${args.on} is not a date I can read.`,
      FUTURE_DATE: 'A balance can only be given for today or a day that has passed.',
      BALANCE_REQUIRED: 'Give the bank balance, the cash in hand, or both.',
      BAD_AMOUNT: 'The balance must be a number; cash in hand cannot be negative.',
    }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  return {
    blockers: [],
    summary: `On ${plan.on}: bank ${money(plan.bank)}, cash in hand ${money(plan.cash)}. MyCA had recorded bank ${money(plan.recordedBank)} and cash ${money(plan.recordedCash)}.`,
    effects: ['The cash forecast starts from these figures. Nothing is posted to your books.'],
    figures: { on: plan.on, bank: plan.bank, cash: plan.cash },
  };
}

const CA_REASONS = {
  NOTE_REQUIRED: 'Write what you want to ask.',
  NOTE_TOO_LONG: 'Keep it under 1,000 characters.',
  TEXT_REQUIRED: 'Write a reply.',
  TEXT_TOO_LONG: 'Keep it under 1,000 characters.',
  UNKNOWN_SUBJECT: 'That is not something MyCA can attach.',
  SUBJECT_NOT_FOUND: 'That is not in these books.',
  REQUEST_NOT_FOUND: 'That question is not here.',
  REQUEST_CLOSED: 'That question is closed.',
};

export function askPreview(state, args) {
  const planned = planAsk(state, args);
  if (!planned.ok) return { blockers: [CA_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  return {
    blockers: [],
    summary: `Ask your CA about ${plan.title}: "${plan.note}"`,
    effects: [
      plan.context.facts.length ? `MyCA attaches: ${plan.context.facts.join('; ')}.` : 'Nothing is attached.',
      'Your CA sees it in MyCA once you have invited them. Nothing is sent outside MyCA.',
    ],
    figures: { title: plan.title },
  };
}

export function replyPreview(state, args) {
  const planned = planReply(state, args);
  if (!planned.ok) return { blockers: [CA_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Reply on ${planned.request.title}: "${planned.text}"`, effects: [], figures: {} };
}

export function closePreview(state, args) {
  const request = (state.caRequests || []).find((item) => item.id === String(args.id || '').toUpperCase());
  if (!request) return { blockers: [CA_REASONS.REQUEST_NOT_FOUND], summary: '', effects: [], figures: {} };
  if (request.status === 'closed') return { blockers: [CA_REASONS.REQUEST_CLOSED], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Close the question: ${request.title}.`, effects: [], figures: {} };
}

export function tallyPreview(state, args, csv, label) {
  const parsed = tally.ingest({ type: 'csv', content: csv }, { fileLabel: label });
  const rows = (parsed.rows || []).filter((r) => !r._blocking);
  const already = new Set([...(state.invoices || []), ...(state.purchases || [])].map((d) => d.id));
  const seen = rows.filter((r) => already.has(`TALLY-${r.voucherNo}`) || [...already].some((id) => id.endsWith(`-${r.voucherNo}`))).length;
  return {
    blockers: [],
    summary: `${label}: ${(parsed.rows || []).length} rows parsed, ${rows.length} postable${seen ? `, about ${seen} already in these books and will be skipped` : ''}. Vouchers with no readable GST rate are held back rather than taxed at a guess.`,
    effects: ['Sales and purchase vouchers post as invoices and bills; receipts and payments post to the ledger.', 'Rows already imported are skipped, so importing the same file twice changes nothing.'],
    figures: { rows: (parsed.rows || []).length, postable: rows.length },
  };
}

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

export function zohoPreview(state, args) {
  const parsed = parseZohoBooksCsv(args.csv);
  const existing = new Set((state.invoices || []).map((i) => i.id));
  const dup = parsed.invoices.filter((i) => existing.has(i.id)).length;
  const noRate = parsed.invoices.filter((i) => i.lines.some((l) => l.gstRate == null)).length;
  return {
    blockers: parsed.meta?.error ? [`The file could not be read: ${parsed.meta.error}.`] : [],
    summary: `Zoho Books: ${parsed.invoices.length} invoices parsed${dup ? `, ${dup} already booked` : ''}${noRate ? `, ${noRate} with no tax rate and so held back` : ''}.`,
    effects: ['Each new invoice posts to the ledger and GSTR-1.'],
    figures: { invoices: parsed.invoices.length, duplicates: dup, missingRate: noRate },
  };
}

export function inventoryValuationPreview(state, args) {
  const planned = planInventoryValuation(state, args);
  if (!planned.ok) {
    const reason = { INVALID_DATE: 'That is not a date I can read.', FUTURE_DATE: 'That date has not come yet.', PERIOD_LOCKED: `That date is in a locked period (through ${planned.lockThrough}).`, NOT_AFTER_LAST: `The last valuation is dated ${planned.lastAsOf}; the next must be after it.`, NO_STOCK: 'Record stock and SKU costs first; nothing is on hand to value.' }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  return {
    blockers: [],
    summary: `Inventory at ${plan.asOf}: ${money(plan.value)} across ${plan.lines.length === 1 ? '1 SKU' : `${plan.lines.length} SKUs`} at recorded cost${plan.previousAsOf ? `, ${money(plan.before)} posted on ${plan.previousAsOf}` : ''}; change ${money(plan.delta)}.`,
    effects: [
      plan.delta > 0 ? `${money(plan.delta)} goes into Inventory against Change in inventory, so cost of goods this period falls by that much.` : plan.delta < 0 ? `${money(-plan.delta)} comes out of Inventory, so cost of goods this period rises by that much.` : 'Nothing posts; the value is unchanged.',
      ...(plan.uncosted.length ? [`Left out, no cost set: ${plan.uncosted.map((row) => `${row.sku} (${row.qty})`).join(', ')}. Set their costs and value again for the full figure.`] : []),
    ],
    figures: { value: plan.value, delta: plan.delta },
  };
}

export function skuCostPreview(state, args) {
  const planned = planSkuCost(state, args);
  if (!planned.ok) return { blockers: [{ SKU_REQUIRED: 'Say which SKU.', BAD_AMOUNT: 'The cost is zero or more per unit.', BAD_RATE: 'A GST rate is 0 to 28.', NOTHING_TO_CHANGE: 'Give a cost, a name, an HSN or a GST rate.', INVALID_DATE: 'That is not a date I can read.' }[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  return {
    blockers: [],
    summary: `${plan.sku}${plan.next.name ? ` (${plan.next.name})` : ''}: cost ${plan.next.cost == null ? 'not set' : money(plan.next.cost)} per unit${plan.next.gstRate != null ? `, GST ${plan.next.gstRate}%` : ''}${plan.before?.cost != null && plan.before.cost !== plan.next.cost ? ` (was ${money(plan.before.cost)})` : ''}.`,
    effects: ['Margins and stock values use it from now; nothing posts to the ledger.'],
    figures: { cost: plan.next.cost },
  };
}

export function skuCostsImportPreview(state, args) {
  const parsed = parseSkuCostsCsv(args.csv || '');
  if (!parsed.ok) return { blockers: [parsed.error === 'NO_HEADER' ? `The sheet needs ${parsed.need}.` : 'The sheet has no SKU rows I can read.'], summary: '', effects: [], figures: {} };
  return {
    blockers: [],
    summary: `SKU costs: ${parsed.lines.length === 1 ? '1 SKU' : `${parsed.lines.length} SKUs`} read${parsed.held.length ? `; ${parsed.held.length} rows held back` : ''}.`,
    effects: ['Later rows for the same SKU replace earlier ones; margins and stock values use them from now.'],
    figures: { skus: parsed.lines.length },
  };
}

export function channelIdentityPreview(state, args) {
  const planned = planChannelIdentity(state, args);
  if (!planned.ok) return { blockers: [{ BAD_CHANNEL: 'Say which marketplace.', BAD_GSTIN: 'That is not a valid GSTIN.', BAD_TAN: 'A TAN is four letters, five digits and a letter.', NOTHING_TO_CHANGE: 'Give the GSTIN, the TAN or a name.' }[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  return { blockers: [], summary: `${plan.channel}: ${[plan.next.gstin ? `GSTIN ${plan.next.gstin}` : '', plan.next.tan ? `TAN ${plan.next.tan}` : '', plan.next.name || ''].filter(Boolean).join(', ')}.`, effects: ['The TCS statement and Form 26AS match this channel by number from now.'], figures: {} };
}

export function stockTransferPreview(state, args) {
  const planned = planStockTransfer(state, args);
  if (!planned.ok) {
    const reason = { SKU_REQUIRED: 'Say which SKU.', BAD_QTY: 'A quantity is a number above zero.', UNKNOWN_REGISTRATION: `${planned.gstin} is not a registration of this business.`, SAME_REGISTRATION: 'Both ends are the same registration; record the stock at its new location instead.', REGISTRATION_RETIRED: 'That registration is retired.', INVALID_DATE: 'That is not a date I can read.', COST_REQUIRED: 'Set the SKU cost first, or give a unit value; transfers go at cost by default.', RATE_REQUIRED: 'Say the GST rate of the goods, or set it on the SKU.', BAD_AMOUNT: 'The unit value must be zero or more.' }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const tax = Math.round(plan.taxable * plan.gstRate) / 100;
  return {
    blockers: [],
    summary: `Transfer ${plan.qty} of ${plan.sku} from ${plan.from.label} (${plan.from.gstin}) to ${plan.to.label} (${plan.to.gstin}) on ${plan.date} ${plan.atCost ? 'at cost' : 'at the stated value'}: ${money(plan.taxable)} plus IGST ${money(tax)}.`,
    effects: ['A transfer invoice posts under the sending registration and a bill with input credit under the receiving one; the two are settled by contra, so nothing is owed.', 'The stock moves between the two locations.', 'If the goods are above the e-way bill limit, the invoice will say an e-way bill is needed.'],
    figures: { taxable: plan.taxable, tax, qty: plan.qty },
  };
}

export function stockPreview(state, args) {
  const sku = String(args.sku || '').trim().toUpperCase();
  const qty = Number(args.qty);
  const blockers = [];
  if (!sku) blockers.push('Say which SKU.');
  if (!Number.isFinite(qty) || qty === 0) blockers.push('A quantity is a number other than zero.');
  const location = String(args.location || 'own').trim().toLowerCase();
  return {
    blockers,
    summary: blockers.length ? '' : `${qty > 0 ? `Stock in: ${qty}` : `Stock out: ${-qty}`} of ${sku} at ${location}${args.date ? ` on ${args.date}` : ''}.`,
    effects: ['Only the stock count changes; nothing posts to the ledger.'],
    figures: { qty, sku, location },
  };
}

export function ordersPreview(state, args) {
  const planned = planOrderImport(state, args);
  if (!planned.ok) {
    const reason = planned.error === 'NO_HEADER' ? `The file needs ${planned.parsed.need}.` : planned.error === 'EMPTY' || planned.error === 'NO_ROWS' ? 'The file has no order rows I can read.' : `The file could not be read: ${planned.error}.`;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const reasons = {};
  for (const row of planned.skipped) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  const words = { exists: 'already in the books', return_exists: 'returns already recorded', ORDER_NOT_FOUND: 'returns for orders not in the books', STATE_UNKNOWN: 'rows with a delivery state I cannot place', RATE_REQUIRED: 'rows with no GST rate', INVALID_DATE: 'rows with a date I cannot read', BAD_AMOUNT: 'rows with an amount I cannot read', PERIOD_LOCKED: 'in a locked period', ORDER_ID_REQUIRED: 'rows with no order id', TOO_MANY_ROWS: 'rows beyond the 5,000 an import takes' };
  const held = Object.entries(reasons).map(([reason, count]) => `${count} ${words[reason] || reason}`);
  const taxable = planned.ready.reduce((sum, day) => sum + day.taxable, 0);
  const states = new Set(planned.ready.map((day) => day.state));
  const name = planned.channel === 'marketplace' ? 'Marketplace' : planned.channel[0].toUpperCase() + planned.channel.slice(1);
  const effects = [`Each day and delivery state posts as one invoice to "${name} customers" with a line per GST rate, so GSTR-1 shows them under B2CS by state.`];
  if (planned.returns.length) effects.push(`${planned.returns.length === 1 ? '1 return posts' : `${planned.returns.length} returns post`} as credit notes against the orders they reverse.`);
  effects.push('Nothing is received yet; the next settlement from this channel settles these invoices and books the fees, TCS and TDS.');
  return {
    blockers: planned.ready.length || planned.returns.length ? [] : [`Every row was held back${held.length ? `: ${held.join('; ')}` : ''}; nothing to post.`],
    summary: `${name} orders: ${planned.parsed.orders === 1 ? '1 order' : `${planned.parsed.orders} orders`} over ${planned.ready.length === 1 ? '1 day-and-state invoice' : `${planned.ready.length} day-and-state invoices`} across ${states.size === 1 ? '1 state' : `${states.size} states`}, taxable ${money(taxable)}${planned.returns.length ? `, ${planned.returns.length === 1 ? '1 return' : `${planned.returns.length} returns`}` : ''}${held.length ? `; held back: ${held.join('; ')}` : ''}.`,
    effects,
    figures: { orders: planned.parsed.orders, invoices: planned.ready.length, returns: planned.returns.length, taxable: Math.round(taxable * 100) / 100, heldBack: planned.skipped.length },
  };
}

export function settlementPreview(state, args) {
  const planned = planSettlement(state, args);
  if (!planned.ok) {
    const reason = planned.error === 'NO_HEADER' ? `The file needs ${planned.parsed.need}.` : planned.error === 'SETTLEMENT_EXISTS' ? `This settlement is already in the books as ${planned.id}.` : planned.error === 'EMPTY' || planned.error === 'NO_ROWS' ? 'The file has no settlement rows I can read.' : `The file could not be read: ${planned.error}.`;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const settles = settlementInvoices(state, plan);
  const effects = [settles.length
    ? `It settles ${settles.length === 1 ? '1 marketplace invoice' : `${settles.length} marketplace invoices`} in the books: the payout goes to the bank, fees and penalties to Marketplace fees, TCS and TDS 194-O to receivables to claim; any shortfall stays outstanding on the channel.`
    : 'None of these orders is in the books yet, so nothing posts to the ledger: the settlement is recorded with its figures. Import the order report first to have it settle the sales.'];
  if (plan.status === 'short') effects.push(`The shortfall of ${money(plan.shortfall)} becomes an exception to take up with the marketplace.`);
  if (plan.status === 'unmatched') effects.push('No bank credit of this amount is in the books yet; it stays an exception until the statement with it is imported, or say "import settlement, bank received <amount>".');
  if (plan.penalties.length) effects.push(`${plan.penalties.length === 1 ? '1 penalty' : `${plan.penalties.length} penalties`} totalling ${money(-plan.totals.penalty)} become exceptions with their order ids.`);
  if (plan.totals.tcs || plan.totals.tds) effects.push(`TCS ${money(-plan.totals.tcs)} and TDS 194-O ${money(-plan.totals.tds)} are recorded as credits to claim.`);
  if (plan.held.length) effects.push(`${plan.held.length} rows with an amount I cannot read were skipped.`);
  return {
    blockers: [],
    summary: settlementWords(plan, money),
    effects,
    figures: { expected: plan.expected, paid: plan.paid, shortfall: plan.shortfall, orders: plan.orders, status: plan.status },
  };
}

export function posImportPreview(state, args) {
  const plan = planPosImport(state, args);
  if (!plan.ok) return { blockers: [plan.error === 'NO_HEADER' ? `The file needs ${plan.parsed.need}.` : `The file could not be read: ${plan.error}.`], summary: '', effects: [], figures: {} };
  const reasons = {};
  for (const row of plan.skipped) reasons[row.reason] = (reasons[row.reason] || 0) + 1;
  const words = { exists: 'already imported', tax_differs: 'whose GST in the file differs from the rate', RATE_REQUIRED: 'rows with no GST rate', INVALID_DATE: 'rows with a date I cannot read', BAD_AMOUNT: 'rows with an amount I cannot read', PERIOD_LOCKED: 'in a locked period' };
  const held = Object.entries(reasons).map(([reason, count]) => `${count} ${words[reason] || reason}`);
  const total = plan.ready.reduce((sum, item) => sum + item.taxable + item.tax, 0);
  return {
    blockers: [],
    summary: `Counter sales: ${plan.parsed.count === 1 ? '1 day' : `${plan.parsed.count} days`} read, ${plan.ready.length} ready to post${plan.ready.length ? ` totalling ${money(total)}` : ''}${held.length ? `; held back: ${held.join('; ')}` : ''}.`,
    effects: ['Each day posts as one walk-in invoice with a line per GST rate, so GSTR-1 shows it under B2CS by rate.', 'Nothing is matched to a customer; these are counter sales to unregistered buyers.'],
    figures: { days: plan.parsed.count, ready: plan.ready.length, heldBack: plan.skipped.length },
  };
}

export function xmlPreview(state, args) {
  const converted = tallyXmlToDayBookCsv(args.xml);
  if (!converted.ok) return { blockers: [converted.error], summary: 'The XML could not be read.', effects: [], figures: {} };
  return tallyPreview(state, args, converted.csv, `Tally XML (${converted.count} vouchers)`);
}

const DECISION_WORD = { waive: 'Waive', resolve: 'Resolve', assign: 'Assign', reopen: 'Reopen' };

export function exceptionPreview(state, args) {
  const entry = (state.exceptions || []).find((e) => e.id === args.id);
  if (!entry) return { blockers: [`${args.id} is not in the queue.`], summary: '', effects: [], figures: {} };
  const reason = String(args.note || '').trim();
  const blockers = [];
  if ((args.decision === 'waive' || args.decision === 'resolve') && !reason) {
    blockers.push('Say why, in a note; the reason is part of the audit trail.');
  }
  if (args.decision === 'assign' && !String(args.owner || '').trim()) blockers.push('Name the person it is assigned to.');
  return {
    blockers,
    summary: `${DECISION_WORD[args.decision] || args.decision} ${entry.id}: ${entry.title} (${entry.severity}, ${money(entry.moneyAtRisk)} at risk).`,
    effects: args.decision === 'waive'
      ? ['The exception stays in the books as waived, with your reason and your name against it.', 'It will not come back to the open queue while it is still detected.']
      : ['The queue is updated and the decision is written to the audit trail.'],
    figures: { severity: entry.severity, moneyAtRisk: entry.moneyAtRisk },
  };
}
