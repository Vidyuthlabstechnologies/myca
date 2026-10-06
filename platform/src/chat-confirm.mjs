/**
 * Nothing a chat message says reaches the books until the user confirms it.
 *
 * A planned tool that writes books, or talks to a government API, is turned into
 * a preview: the figures the engines computed, the accounts that will move, and
 * anything that would stop the posting. The preview is held against a one-use
 * token until the next message confirms or discards it.
 */
import { randomBytes } from 'node:crypto';
import { planExpense } from './expenses.mjs';
import { planCreditNote, creditedAgainst } from './credit-notes.mjs';
import { checkAnswer, reviewOf, stepText } from './gst-review.mjs';
import { parse2bFile } from './gstr2b-check.mjs';
import { planReminder, findReminder, whenWords } from './reminders.mjs';
import { planCashReading } from './cash-forecast.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { gstSplit, partyStateOf } from './chart.mjs';
import { postingDate } from './dates.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { tally, bank } from './sprint-load.mjs';
import { parseZohoBooksCsv } from './import-zoho.mjs';
import { tallyXmlToDayBookCsv } from './tally-xml.mjs';

export const CONFIRM_TOOLS = new Set([
  'create_invoice', 'create_purchase', 'record_receipt', 'post_expense', 'set_expense_head', 'create_credit_note', 'cancel_invoice', 'gst_review_answer', 'import_gstr2b', 'add_reminder', 'complete_reminder', 'set_cash_balance',
  'import_tally', 'import_tally_xml', 'import_zoho', 'import_bank',
  'govt_generate_irn', 'govt_nic_cancel_irn',
  'exception_decide',
]);

const PENDING_TTL_MS = 10 * 60 * 1000;
const CONFIRM_RE = /^\s*(y|yes|yeah|yep|ok|okay|confirm|confirmed|post it|post|go ahead|do it|proceed|haan|ha|sahi)\b[\s!.]*$/i;
const CANCEL_RE = /^\s*(n|no|nope|cancel|discard|stop|don'?t|do not|abort|nahi|nahin)\b[\s!.]*$/i;

function money(n) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function stateCodeOf(value) {
  const s = String(value == null ? '' : value).trim();
  return /^\d{1,2}$/.test(s) ? s.padStart(2, '0') : '';
}

function documentPreview(state, args, kind) {
  const company = state.company || {};
  const date = postingDate(args.date);
  const blockers = [];
  if (!date) blockers.push(`${args.date} is not a date I can read.`);
  else if (isPeriodLocked(state, date)) blockers.push(`${date} is inside the locked period (through ${state.lockThrough}).`);
  const sale = kind === 'sale';
  const list = sale ? state.invoices : state.purchases;
  if (args.id && (list || []).some((d) => d.id === args.id)) blockers.push(`${args.id} already exists in these books.`);

  const pos = sale
    ? (stateCodeOf(args.partyState) || partyStateOf(args.partyGstin) || company.state)
    : company.state;
  const supplier = sale ? company.state : (partyStateOf(args.partyGstin) || stateCodeOf(args.partyState) || company.state);
  const lines = (args.lines || []).map((l) => {
    const qty = Number(l.qty == null || l.qty === '' ? 1 : l.qty);
    const rate = Number(l.rate);
    const gstRate = Number(l.gstRate == null || l.gstRate === '' ? 18 : l.gstRate);
    const taxable = Math.round(qty * rate * 100) / 100;
    return { ...gstSplit({ taxable, rate: gstRate, supplierState: supplier, partyState: pos }), taxable, gstRate, qty, rate };
  });
  const sum = (key) => Math.round(lines.reduce((s, l) => s + (l[key] || 0), 0) * 100) / 100;
  const taxable = sum('taxable');
  const tax = Math.round((sum('cgst') + sum('sgst') + sum('igst')) * 100) / 100;
  const party = args.partyName || (sale ? 'Walk-in' : 'Supplier');
  const heads = sum('igst') > 0 ? `IGST ${money(sum('igst'))}` : `CGST ${money(sum('cgst'))} + SGST ${money(sum('sgst'))}`;
  return {
    blockers,
    summary: sale
      ? `Invoice to ${party}${args.partyGstin ? ` (${args.partyGstin})` : ''} dated ${date || '?'}: taxable ${money(taxable)}, ${heads}, total ${money(taxable + tax)}. Place of supply ${pos || '?'}.`
      : `Purchase bill from ${party}${args.partyGstin ? ` (${args.partyGstin})` : ''} dated ${date || '?'}: taxable ${money(taxable)}, ${heads}, total ${money(taxable + tax)}. Input credit ${args.itcEligible === false ? 'blocked (s.17(5)) and added to cost' : money(tax)}.`,
    effects: sale
      ? ['Debit the customer account, credit sales and the GST output accounts.', 'The invoice becomes a row in GSTR-1 for its period.']
      : ['Debit purchases and the GST input accounts, credit the supplier account.', 'The bill joins the purchase register for 2B matching.'],
    figures: { date, taxable, tax, total: Math.round((taxable + tax) * 100) / 100, placeOfSupply: pos },
  };
}

function receiptPreview(state, args) {
  const inv = (state.invoices || []).find((i) => i.id === args.invoiceId);
  if (!inv) return { blockers: [`${args.invoiceId} is not in these books.`], summary: `No invoice ${args.invoiceId}.`, effects: [], figures: {} };
  const received = (inv.receipts || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const due = Math.round((inv.total - received) * 100) / 100;
  const amount = args.amount == null || args.amount === '' ? due : Number(args.amount);
  const date = args.date == null || args.date === '' ? inv.date : postingDate(args.date);
  const blockers = [];
  if (!date) blockers.push(`${args.date} is not a date I can read.`);
  else if (isPeriodLocked(state, date)) blockers.push(`${date} is inside the locked period (through ${state.lockThrough}).`);
  if (due <= 0.01) blockers.push(`${inv.id} is already fully received (${money(inv.total)}).`);
  else if (amount > due + 0.01) blockers.push(`${money(amount)} is more than the ${money(due)} outstanding on ${inv.id}.`);
  else if (!(amount > 0)) blockers.push('A receipt has to be a positive amount.');
  return {
    blockers,
    summary: `Receipt of ${money(amount)} against ${inv.id} (${inv.partyName}) by ${args.mode === 'cash' ? 'cash' : 'bank'} on ${date || '?'}. Outstanding is ${money(due)} of ${money(inv.total)}.`,
    effects: [`Debit ${args.mode === 'cash' ? 'cash' : 'bank'}, credit ${inv.partyName}.`, `${inv.id} becomes ${amount >= due - 0.01 ? 'paid' : 'partly paid'}.`],
    figures: { amount, due, date },
  };
}

function expensePreview(state, args) {
  const planned = planExpense(state, args);
  if (!planned.ok) {
    const reason = {
      INVALID_DATE: `${args.date} is not a date I can read.`,
      PERIOD_LOCKED: `${planned.date} is inside the locked period (through ${state.lockThrough}).`,
      BAD_AMOUNT: 'The amount must be a positive number.',
      BAD_RATE: 'The GST rate must be between 0 and 28.',
      BAD_MODE: 'Paid from must be bank or cash.',
      INSUFFICIENT_CASH: `Cash in hand is ${money(planned.inHand)} and this is ${money(planned.amount)}. Record where the cash came from first, or pay it from bank.`,
      BAD_GSTIN: 'That supplier GSTIN is not 15 characters.',
      UNKNOWN_HEAD: `${args.head} is not an expense head.`,
    }[planned.error] || planned.error;
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const what = plan.description || plan.payee || 'Expense';
  return {
    blockers: [],
    summary: `${plan.tag.headName}: ${what} ${money(plan.amount)} paid from ${plan.mode} on ${plan.date}. ${plan.creditNote}`,
    effects: [plan.tag.why, `Debit ${plan.tag.headName} ${money(plan.taxable)}${plan.inputCredit ? ' and GST input' : ''}, credit ${plan.mode}.`],
    figures: { date: plan.date, head: plan.tag.head, headName: plan.tag.headName, tagSource: plan.tag.source, taxable: plan.taxable, gstRate: plan.gstRate, inputCredit: plan.inputCredit, amount: plan.amount, mode: plan.mode },
  };
}

const CREDIT_NOTE_REASONS = {
  INVOICE_NOT_FOUND: (p, args) => `${args.invoiceId} is not an invoice in these books.`,
  INVOICE_CANCELLED: (p, args) => `${args.invoiceId} is already cancelled.`,
  INVALID_DATE: (p, args) => `${args.date} is not a date I can read.`,
  BEFORE_INVOICE: (p) => `A credit note cannot be dated before the invoice (${p.invoiceDate}).`,
  PERIOD_LOCKED: (p, args, state) => `${p.date} is inside the locked period (through ${state.lockThrough}).`,
  REASON_REQUIRED: () => 'Say why: goods returned, price reduced, or cancelled.',
  FULLY_CREDITED: (p) => `${p.invoiceId} is already credited in full.`,
  BAD_AMOUNT: () => 'The amount must be a positive number.',
  EXCEEDS_INVOICE: (p) => `Only ${money(p.room)} of ${p.invoiceId} is left to credit.`,
  PARTLY_CREDITED: (p) => `${p.invoiceId} already has a credit note; issue one for the rest instead of cancelling.`,
};

function creditNotePreview(state, args, cancel = false) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  if (cancel && creditedAgainst(state, invoiceId) > 0) {
    return { blockers: [CREDIT_NOTE_REASONS.PARTLY_CREDITED({ invoiceId })], summary: '', effects: [], figures: {} };
  }
  const planned = planCreditNote(state, cancel ? { invoiceId, date: args.date, reason: args.reason || 'Invoice cancelled' } : args);
  if (!planned.ok) {
    const explain = CREDIT_NOTE_REASONS[planned.error];
    return { blockers: [explain ? explain(planned, args, state) : planned.error], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const heads = [plan.cgst > 0 ? `CGST ${money(plan.cgst)}` : '', plan.sgst > 0 ? `SGST ${money(plan.sgst)}` : '', plan.igst > 0 ? `IGST ${money(plan.igst)}` : ''].filter(Boolean).join(' + ');
  const what = cancel ? `Cancel ${plan.invoice.id} (${plan.invoice.partyName}) by a credit note for its full ${money(plan.total)}` : `Credit note of ${money(plan.total)} against ${plan.invoice.id} (${plan.invoice.partyName})${plan.full ? ', the whole invoice' : ''}`;
  const refund = plan.refundDue > 0 ? ` ${plan.invoice.partyName} has paid ${money(plan.received)}, so ${money(plan.refundDue)} becomes due back to them.` : '';
  return {
    blockers: [],
    summary: `${what} dated ${plan.date}: taxable ${money(plan.taxable)}${heads ? `, ${heads}` : ''}. Reason: ${plan.reason}.${refund}`,
    effects: ['Debit sales and the GST output accounts, credit the customer. The invoice stays in the journal; the note is reported in the GSTR-1 of its own month.'],
    figures: { invoiceId: plan.invoice.id, date: plan.date, taxable: plan.taxable, cgst: plan.cgst, sgst: plan.sgst, igst: plan.igst, total: plan.total, refundDue: plan.refundDue, cancels: cancel },
  };
}

const REVIEW_REASONS = {
  DRAFT_CHANGED: 'Your books for this month changed after you saw these figures. Review again to see the current ones.',
  STEP_NOT_READY: 'An earlier step of this review is not confirmed yet.',
  NOTHING_TO_REVIEW: 'There is nothing dated in this month to review.',
  OWNER_APPROVES: 'Only the owner approves the return.',
  ANSWER_DOES_NOT_FIT: 'That answer does not fit this step.',
  UNKNOWN_STEP: 'That is not a step of the review.',
  INVALID_PERIOD: 'That is not a month I can read.',
};

function reviewAnswerPreview(state, args) {
  const checked = checkAnswer(state, args);
  if (!checked.ok) return { blockers: [REVIEW_REASONS[checked.error] || checked.error], summary: '', effects: [], figures: {} };
  const { review, step } = checked;
  const answered = {
    correct: `You are confirming: ${step.title}.`,
    wrong: `You are marking ${step.title.toLowerCase()} as not right${args.note ? `: ${args.note}` : ''}. Fix the entries, then review again.`,
    approve: `You are approving the ${review.month} figures. Nothing is filed.`,
  }[args.answer];
  return {
    blockers: [],
    summary: stepText(review, step.id, money),
    effects: [answered],
    figures: { period: review.period, step: step.id, answer: args.answer, draftHash: review.draftHash },
  };
}

function gstr2bPreview(state, args) {
  if (!isReturnPeriod(args.period)) return { blockers: ['Say which month this 2B is for.'], summary: '', effects: [], figures: {} };
  const { rows, errors } = parse2bFile(args.csv);
  if (!rows.length) return { blockers: ['No GSTR-2B rows could be read from this file. Use the CSV downloaded from the GST portal.'], summary: '', effects: [], figures: {} };
  const suppliers = new Set(rows.map((row) => row.supplierGstin)).size;
  const replaces = state.gstr2b && Object.hasOwn(state.gstr2b, args.period);
  return {
    blockers: [],
    summary: `GSTR-2B for ${args.period}: ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} from ${suppliers} ${suppliers === 1 ? 'supplier' : 'suppliers'}${errors.length ? `; ${errors.length} ${errors.length === 1 ? 'row' : 'rows'} could not be read and will be left out` : ''}.${replaces ? ' This replaces the 2B already added for that month.' : ''}`,
    effects: ['Nothing is posted to your books. Your purchase bills are checked against it.'],
    figures: { period: args.period, rows: rows.length, suppliers, skipped: errors.length },
  };
}

const REMINDER_REASONS = {
  TEXT_REQUIRED: () => 'Say what to remind you about.',
  TEXT_TOO_LONG: () => 'Keep the reminder under 200 characters.',
  INVALID_DATE: (p) => `${p.due} is not a date I can read.`,
  DATE_PASSED: (p) => `${p.due} has already passed.`,
  INVOICE_NOT_FOUND: (p) => `${p.invoiceId} is not an invoice in these books.`,
  BILL_NOT_FOUND: (p) => `${p.billId} is not a bill in these books.`,
};

function reminderPreview(state, args) {
  const planned = planReminder(state, args);
  if (!planned.ok) return { blockers: [(REMINDER_REASONS[planned.error] || (() => planned.error))(planned)], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  const about = plan.about ? ` (${plan.about.id || plan.about.name}${plan.about.kind === 'invoice' || plan.about.kind === 'bill' ? `, ${plan.about.name}` : ''})` : '';
  return {
    blockers: [],
    summary: `Remind you ${whenWords(plan.inDays, plan.due)}: ${plan.text}${about}.`,
    effects: ['It shows on Home on that day. Nothing is sent to anyone.'],
    figures: { due: plan.due, inDays: plan.inDays },
  };
}

function completeReminderPreview(state, args) {
  const reminder = findReminder(state, args.id);
  if (!reminder) return { blockers: [`${args.id} is not a reminder here.`], summary: '', effects: [], figures: {} };
  if (reminder.done) return { blockers: [`${reminder.id} is already done.`], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Mark done: ${reminder.text}.`, effects: [], figures: { id: reminder.id } };
}

function cashReadingPreview(state, args) {
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

function countSkips(skipped = []) {
  const counts = {};
  for (const s of skipped) counts[s.reason] = (counts[s.reason] || 0) + 1;
  return Object.entries(counts).map(([reason, n]) => `${n} ${reason}`).join(', ');
}

function tallyPreview(state, args, csv, label) {
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

function bankPreview(state, args) {
  const parsed = bank.ingest({ type: args.type || 'csv', content: args.content }, { fileLabel: args.fileName || 'bank' });
  const rows = (parsed.rows || []).filter((r) => !r._blocking && r.type !== 'balance-only');
  return {
    blockers: [],
    summary: `Bank statement: ${(parsed.rows || []).length} rows parsed, ${rows.length} postable${parsed.ok === false ? ' (the running balance does not tie — check the statement)' : ''}.`,
    effects: ['Each row posts against bank with the classified account.', 'Rows already imported are recognised and skipped.'],
    figures: { rows: (parsed.rows || []).length, postable: rows.length, tied: parsed.ok !== false },
  };
}

function zohoPreview(state, args) {
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

function xmlPreview(state, args) {
  const converted = tallyXmlToDayBookCsv(args.xml);
  if (!converted.ok) return { blockers: [converted.error], summary: 'The XML could not be read.', effects: [], figures: {} };
  return tallyPreview(state, args, converted.csv, `Tally XML (${converted.count} vouchers)`);
}

function irnPreview(state, args, cancel) {
  const inv = (state.invoices || []).find((i) => i.id === args.invoiceId);
  const what = cancel ? 'Cancel the IRN for' : 'Send';
  return {
    blockers: inv ? [] : [`${args.invoiceId} is not in these books.`],
    summary: `${what} ${args.invoiceId}${inv ? ` (${inv.partyName}, ${money(inv.total)})` : ''} to the e-invoice portal.`,
    effects: [
      'Nothing leaves this machine unless live calls are switched on.',
      'A live call still needs a CA approval bound to this exact payload, made by someone other than the requester.',
    ],
    figures: { invoiceId: args.invoiceId },
  };
}

const DECISION_WORD = { waive: 'Waive', resolve: 'Resolve', assign: 'Assign', reopen: 'Reopen' };

function exceptionPreview(state, args) {
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

const PREVIEWERS = {
  create_invoice: (state, args) => documentPreview(state, args, 'sale'),
  create_purchase: (state, args) => documentPreview(state, args, 'purchase'),
  record_receipt: receiptPreview,
  post_expense: expensePreview,
  create_credit_note: creditNotePreview,
  cancel_invoice: (state, args) => creditNotePreview(state, args, true),
  gst_review_answer: reviewAnswerPreview,
  import_gstr2b: gstr2bPreview,
  add_reminder: reminderPreview,
  complete_reminder: completeReminderPreview,
  set_cash_balance: cashReadingPreview,
  import_tally: (state, args) => tallyPreview(state, args, args.csv, args.fileName || 'Tally Day Book'),
  import_tally_xml: xmlPreview,
  import_zoho: zohoPreview,
  import_bank: bankPreview,
  govt_generate_irn: (state, args) => irnPreview(state, args, false),
  govt_nic_cancel_irn: (state, args) => irnPreview(state, args, true),
  exception_decide: exceptionPreview,
};

const PERSISTED_PENDING_LIMIT = 64 * 1024;

// A preview has to outlive the request that made it, so it is saved with the books.
// One that carries a whole file is too big to keep there and stays in memory only.
export function persistablePending(pending) {
  if (!pending || typeof pending !== 'object') return null;
  return JSON.stringify(pending).length > PERSISTED_PENDING_LIMIT ? null : pending;
}

export function restoredPending(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.token !== 'string' || typeof raw.name !== 'string') return null;
  if (!CONFIRM_TOOLS.has(raw.name)) return null;
  return raw;
}

export function restoredConfirmation(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.token !== 'string') return null;
  return { token: raw.token, tool: String(raw.tool || ''), reply: String(raw.reply || ''), posted: raw.posted === true };
}

export function needsConfirmation(name) {
  return CONFIRM_TOOLS.has(name);
}

export function previewOf(state, name, args = {}) {
  const build = PREVIEWERS[name];
  if (!build) return { blockers: [], summary: `Run ${name}.`, effects: [], figures: {} };
  try {
    return build(state, args);
  } catch (err) {
    return { blockers: [`I could not work out what this would do: ${String(err.message || err)}`], summary: `Run ${name}.`, effects: [], figures: {} };
  }
}

export function openPending(state, plan, preview, now = Date.now()) {
  const pending = {
    token: randomBytes(6).toString('hex'),
    name: plan.name,
    args: plan.args,
    clearsPendingFile: Boolean(plan.clearsPendingFile),
    summary: preview.summary,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PENDING_TTL_MS).toISOString(),
  };
  state.pendingChatAction = pending;
  return pending;
}

export function clearPending(state) {
  state.pendingChatAction = null;
}

export function confirmationIntent(text) {
  const raw = String(text == null ? '' : text).trim();
  if (CONFIRM_RE.test(raw)) return 'confirm';
  if (CANCEL_RE.test(raw)) return 'cancel';
  const token = raw.match(/^\s*(?:confirm|post)\s+([0-9a-f]{12})\s*$/i);
  if (token) return { token: token[1].toLowerCase() };
  return null;
}

// A pending action is single use and expires, so a stray "yes" much later posts nothing.
export function takePending(state, intent, now = Date.now()) {
  const pending = state.pendingChatAction;
  if (!pending) return { ok: false, error: 'NOTHING_PENDING' };
  clearPending(state);
  if (Date.parse(pending.expiresAt) <= now) return { ok: false, error: 'EXPIRED', pending };
  if (typeof intent === 'object' && intent.token && intent.token !== pending.token) return { ok: false, error: 'TOKEN_MISMATCH', pending };
  return { ok: true, pending };
}

export function previewReply(preview, pending) {
  const lines = [preview.summary];
  for (const effect of preview.effects || []) lines.push(`· ${effect}`);
  lines.push('');
  lines.push(`Nothing is posted yet. Reply "yes" to post it, "no" to discard, or "confirm ${pending.token}".`);
  return lines.join('\n');
}

export function blockedReply(preview) {
  return [`I did not post anything, because:`, ...preview.blockers.map((b) => `· ${b}`)].join('\n');
}
