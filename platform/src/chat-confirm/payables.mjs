import { planExpense } from '../expenses.mjs';
import { planCollectionReminder } from '../collections.mjs';
import { planPaymentRun } from '../payment-run.mjs';
import { planMonthClose } from '../month-close.mjs';
import { planPurchaseOrder, planSkuSupply } from '../restock.mjs';
import { planAdvanceTaxPayment } from '../advance-tax.mjs';
import { planSupplierBank } from '../supplier-bank.mjs';
import { planAttachDocument } from '../receipt-match.mjs';
import { planTallyPush } from '../tally-push.mjs';
import { findReminder, planReminder, whenWords } from '../reminders.mjs';
import { planCashReading } from '../cash-forecast.mjs';
import { msmeDays, planSupplierTerms } from '../supplier-dues.mjs';
import { planAsk, planReply } from '../ca-requests.mjs';
import { localToday } from '../dates.mjs';
import { planSupplierReminder } from '../supplier-reminders.mjs';
import { tdsWords } from '../tds-deduction.mjs';
import { countryOf } from '../country.mjs';
import { PAYMENT_REASONS, TDS_REASONS, money } from './shared.mjs';

const SUPPLIER_REMINDER_REASONS = {
  INVALID_PERIOD: () => 'That is not a month I can read.',
  NO_STATEMENT: (p) => `No GSTR-2B has been added for ${p.period}, so MyCA cannot tell what the supplier reported. Add the 2B first.`,
  NOTHING_TO_ASK: () => 'Nothing from this supplier is at risk for that month.',
  OWN_GAPS_ONLY: (p) => `The bills from ${p.supplier} that are at risk are missing their supplier bill number in your books (${p.billIds.join(', ')}). Add the numbers; there is nothing to ask the supplier yet.`,
  EMPTY_MESSAGE: () => 'The message is empty.',
  MESSAGE_TOO_LONG: (p) => `The message is longer than ${p.max} characters.`,
};

const COLLECTION_REASONS = {
  CUSTOMER_REQUIRED: () => 'Say which customer.',
  CUSTOMER_NOT_FOUND: (p) => `There is no customer called ${p.customer} in these books.`,
  NOTHING_OVERDUE: (p) => `${p.customer} has nothing overdue.`,
  POSSIBLY_PAID: (p) => `${p.customer} paid something in the last two weeks, so the ${money(p.total)} may already be on its way. Match your bank statement first.`,
  EMPTY_MESSAGE: () => 'The message is empty.',
  MESSAGE_TOO_LONG: (p) => `The message is longer than ${p.max} characters.`,
};

const PAYMENT_RUN_REASONS = {
  NOTHING_TO_PAY: () => 'Nothing needs paying right now.',
  TOO_MANY_BILLS: (p) => `A run pays at most ${p.max} bills at a time.`,
  INVALID_DATE: (p) => `${p.date} is not a date I can read.`,
  BILLS_NOT_PAYABLE: (p) => `Some bills cannot be paid: ${p.problems.map((x) => `${x.billId} (${x.error === 'HELD' ? x.reason : PAYMENT_REASONS[x.error] || x.error})`).join('; ')}.`,
};

export function paymentRunPreview(state, args) {
  const plan = planPaymentRun(state, args);
  if (!plan.ok) {
    const reason = PAYMENT_RUN_REASONS[plan.error];
    return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
  }
  const lines = plan.payments.map((p) => `${p.supplier} ${money(p.amount)} on ${p.billId}${p.supplierInvoiceNo ? ` (their ${p.supplierInvoiceNo})` : ''}`);
  const cash = plan.verdict === 'no' ? ' That takes the balance below zero before the month is out.' : plan.verdict === 'tight' ? ' That is tight against the month\'s usual outgoings.' : plan.verdict === 'yes' ? ' Payroll and GST still clear.' : '';
  return {
    blockers: plan.verdict === 'no' ? ['The balance would go below zero before the month is out. Pay fewer bills, or give a fresh bank balance first.'] : [],
    summary: `Pay ${money(plan.total)} to ${new Set(plan.payments.map((p) => p.supplier)).size === 1 ? plan.payments[0].supplier : `${new Set(plan.payments.map((p) => p.supplier)).size} suppliers`} across ${plan.payments.length === 1 ? '1 bill' : `${plan.payments.length} bills`} from ${plan.mode === 'cash' ? 'cash' : 'the bank'} on ${plan.date}: ${lines.join('; ')}. Bank and cash ${money(plan.balance)} before, ${money(plan.after)} after.${cash}`,
    effects: [`${money(plan.total)} goes out of your ${plan.mode === 'cash' ? 'cash' : 'bank'}, one payment per bill.`, 'Each bill becomes paid; MSMED and Rule 37 clocks stop for them.'],
    figures: { total: plan.total, bills: plan.payments.length, balance: plan.balance, after: plan.after, date: plan.date, billIds: plan.payments.map((p) => p.billId) },
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

const SUPPLIER_BANK_REASONS = { OWNER_ONLY: 'Only the owner can record where a supplier is paid.', SUPPLIER_REQUIRED: 'Say which supplier.', BANK_DETAILS_REQUIRED: 'Give an account number with its IFSC, or a UPI id.', BAD_ACCOUNT: 'An account number is 6 to 20 digits.', BAD_IFSC: 'An IFSC is four letters, a zero and six characters, for example HDFC0001234.', BAD_UPI: 'A UPI id looks like name@bank.' };

export function supplierBankPreview(state, args) {
  const planned = planSupplierBank(state, args);
  if (!planned.ok) return { blockers: [SUPPLIER_BANK_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const p = planned.plan;
  const words = (b) => [b.account ? `account ${b.account}${b.ifsc ? ` at ${b.ifsc}` : ''}` : '', b.upi ? `UPI ${b.upi}` : ''].filter(Boolean).join(', ');
  const change = p.changed ? ` This replaces ${words(p.before)}.` : '';
  return {
    blockers: [],
    summary: `${p.name}${p.known ? '' : ' (no bills from them yet)'} is paid to ${words(p.bank)}${p.bank.holder ? ` in the name of ${p.bank.holder}` : ''}.${change}`,
    effects: [p.changed ? 'A changed bank detail is the commonest invoice fraud: confirm it by calling the number you already have for them, not one on the bill or the email.' : 'Confirm the details by calling the number you already have for them, not one on the bill or the email.', 'Used only in the supplier payout file; MyCA moves no money.'],
    figures: { supplier: p.name, changed: p.changed },
  };
}

const ADVANCE_REASONS = { BAD_AMOUNT: 'The amount has to be more than zero.', INVALID_DATE: 'That is not a date I can read.', FUTURE_DATE: 'A payment cannot be dated in the future.', PERIOD_LOCKED: 'That date is inside the locked period.' };

export function advanceTaxPreview(state, args) {
  const planned = planAdvanceTaxPayment(state, args);
  if (!planned.ok) return { blockers: [ADVANCE_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const p = planned.plan;
  const e = p.estimate;
  const against = e ? ` The year's estimate is ${money(e.tax)} less ${money(e.credits.credits)} credit, ${money(e.paid)} already paid${e.next ? `; the next instalment is ${money(e.next.dueNow)} by ${e.next.dueDate}` : ''}.` : '';
  return {
    blockers: [],
    summary: `Record advance tax of ${money(p.amount)} for ${p.fy} paid from ${p.mode === 'cash' ? 'cash' : 'the bank'} on ${p.date}${p.challan ? `, challan ${p.challan}` : ''}.${against}`,
    effects: [`${money(p.amount)} goes out of your ${p.mode === 'cash' ? 'cash' : 'bank'} into advance tax paid, an asset until the return is assessed.`],
    figures: { amount: p.amount, date: p.date, fy: p.fy, challan: p.challan },
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

const PO_REASONS = { SUPPLIER_REQUIRED: 'Say which supplier.', LINES_REQUIRED: 'Say what to order: SKU and quantity.', BAD_LINE: 'Each line needs a SKU and a whole positive quantity.', BAD_RATE: 'A rate is a number, zero or more.', INVALID_DATE: 'That is not a date I can read.' };

export function purchaseOrderPreview(state, args) {
  const planned = planPurchaseOrder(state, args);
  if (!planned.ok) return { blockers: [PO_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const p = planned.plan;
  const lines = p.lines.map((l) => `${l.sku} x ${l.qty}${l.rate != null ? ` at ${money(l.rate)} = ${money(l.amount)}` : ' (no rate known)'}`).join('; ');
  return {
    blockers: [],
    summary: `Purchase order to ${p.supplier} dated ${p.date}: ${lines}${p.total != null ? `; total ${money(p.total)}` : ''}. Expected ${p.expectedOn}.`,
    effects: ['Nothing posts to the ledger; the quantities count as on order in the restock plan until the bill is booked.'],
    figures: { supplier: p.supplier, total: p.total, expectedOn: p.expectedOn, lines: p.lines.length },
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

export function collectionReminderPreview(state, args) {
  const plan = planCollectionReminder(state, args);
  if (!plan.ok) {
    const reason = COLLECTION_REASONS[plan.error];
    return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
  }
  const d = plan.draft;
  return {
    blockers: [],
    summary: `Send a ${d.tone} payment reminder to ${d.customer} for ${money(d.total)} across ${d.invoices.length === 1 ? '1 invoice' : `${d.invoices.length} invoices`} (oldest ${d.oldestDaysLate} days late). ${d.customer} ${d.scoreWords}.${d.timesSent ? ` You last reminded them on ${d.lastSent}.` : ''}${plan.edited ? ' You edited the draft.' : ''}`,
    effects: ['It goes from your own phone: WhatsApp, email or another app you pick. MyCA sends nothing itself.', 'The message and the day are kept with the books, and a reminder to check for the payment is set for seven days from now.'],
    figures: { customer: d.customer, total: d.total, invoices: d.invoices.length, tone: d.tone, score: d.score, timesSent: d.timesSent },
  };
}

export function supplierReminderPreview(state, args) {
  const plan = planSupplierReminder(state, args);
  if (!plan.ok) {
    const reason = SUPPLIER_REMINDER_REASONS[plan.error];
    return { blockers: [reason ? reason(plan) : plan.error], summary: '', effects: [], figures: {} };
  }
  const d = plan.draft;
  return {
    blockers: [],
    summary: `Send a reminder to ${d.supplier} about ${d.bills.length === 1 ? '1 bill' : `${d.bills.length} bills`} for ${d.period}, with ${money(d.credit)} of your input credit waiting on them.${d.timesSent ? ` You last reminded them on ${d.lastSent}.` : ''}`,
    effects: ['It goes from your own phone: your WhatsApp, email or another app you pick. MyCA sends nothing itself.', 'The message and the day are kept with the books.'],
    figures: { supplier: d.supplier, period: d.period, bills: d.bills.length, credit: d.credit, edited: plan.edited, timesSent: d.timesSent },
  };
}

export function expensePreview(state, args) {
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
    }[planned.error] || (TDS_REASONS[planned.error] ? TDS_REASONS[planned.error](planned) : planned.error);
    return { blockers: [reason], summary: '', effects: [], figures: {} };
  }
  const { plan } = planned;
  const what = plan.description || plan.payee || 'Expense';
  return {
    blockers: [],
    summary: `${plan.tag.headName}: ${what} ${money(plan.amount)} paid from ${plan.mode} on ${plan.date}. ${plan.creditNote}`,
    effects: [plan.tag.why, `${money(plan.amount - (plan.tds?.tds || 0))} goes out of your ${plan.mode === 'cash' ? 'cash' : 'bank'}${plan.inputCredit ? ', with the GST in it counted as input credit' : ''}.`, ...(plan.tds ? [tdsWords(plan.tds, plan.amount - plan.tds.tds, `pay ${plan.payee || 'them'}`)] : [])],
    figures: { date: plan.date, head: plan.tag.head, headName: plan.tag.headName, tagSource: plan.tag.source, taxable: plan.taxable, gstRate: plan.gstRate, inputCredit: plan.inputCredit, amount: plan.amount, mode: plan.mode, ...(plan.tds ? { tds: plan.tds.tds, tdsSection: plan.tds.section, tdsRate: plan.tds.rate } : {}) },
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

export function reminderPreview(state, args) {
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

export function completeReminderPreview(state, args) {
  const reminder = findReminder(state, args.id);
  if (!reminder) return { blockers: [`${args.id} is not a reminder here.`], summary: '', effects: [], figures: {} };
  if (reminder.done) return { blockers: [`${reminder.id} is already done.`], summary: '', effects: [], figures: {} };
  return { blockers: [], summary: `Mark done: ${reminder.text}.`, effects: [], figures: { id: reminder.id } };
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

export function businessAddressPreview(state, args) {
  const address = String(args.address || '').trim();
  const pin = String(args.pin || '').trim();
  if (!address) return { blockers: ['Say the address.'], summary: '', effects: [], figures: {} };
  if (!/^[1-9][0-9]{5}$/.test(pin)) return { blockers: ['Say the 6-digit PIN code.'], summary: '', effects: [], figures: {} };
  const was = String(state.company?.address || '').trim();
  return {
    blockers: [],
    summary: `Your business address: ${address}${args.city ? `, ${args.city}` : ''}, PIN ${pin}${was ? ` (was ${was})` : ''}.`,
    effects: ['It prints on invoices from now on and goes into e-invoices and e-way bills. Invoices already made are not changed.'],
    figures: { address, pin },
  };
}

export function addressPreview(state, args) {
  const name = String(args.partyName || '').trim();
  const address = String(args.address || '').trim();
  if (!name) return { blockers: ['Say which customer.'], summary: '', effects: [], figures: {} };
  if (!address) return { blockers: ['Say the address.'], summary: '', effects: [], figures: {} };
  const known = (state.parties || []).find((p) => p.name.toLowerCase() === name.toLowerCase());
  return {
    blockers: [],
    summary: `${name}: address ${address}${known?.address ? ` (was ${known.address})` : ''}.`,
    effects: ['It prints on their invoices from now on. Invoices already made are not changed.'],
    figures: { partyName: name, address },
  };
}

const SUPPLIER_TERMS_REASONS = {
  SUPPLIER_REQUIRED: 'Say which supplier.',
  BAD_UDYAM: 'A Udyam number looks like UDYAM-XX-00-0000000.',
  BAD_TERMS: 'Agreed days must be a whole number from 0 to 365.',
  BAD_CATEGORY: 'The category is micro, small or medium.',
  TERMS_EXCEED_MSMED: 'An MSME supplier must be paid within 45 days, so the agreed days cannot be more than 45.',
  OWNER_ONLY: 'Only the owner can mark a supplier as an MSME.',
};

const BOOKED_BILLS_CHECKED = 'Bills already booked from them are checked against the new terms too.';

const MEDIUM_NOT_COVERED = 'The 45-day rule covers micro and small suppliers only, so a medium supplier gets no MSME limit or reminder.';

export function supplierTermsPreview(state, args) {
  const planned = planSupplierTerms(state, args);
  if (!planned.ok) return { blockers: [SUPPLIER_TERMS_REASONS[planned.error] || planned.error], summary: '', effects: [], figures: {} };
  const { plan } = planned;
  const limit = plan.covered ? msmeDays(localToday(), { agreedDays: plan.days }) : null;
  const days = limit ? limit.days : plan.days;
  const inDays = days === 1 ? '1 day' : `${days} days`;
  if (plan.covered) {
    return {
      blockers: [],
      summary: `Mark ${plan.name} as an MSME supplier (${plan.category || 'category not given'}, Udyam ${plan.udyam || 'not given'}) to be paid within ${inDays}`,
      effects: [`New bills from them get a pay-by date ${inDays} from the bill date${countryOf(state) === 'IN' ? '; MyCA reminds you a week before it' : ''}. Nothing is posted.`, BOOKED_BILLS_CHECKED],
      figures: { days },
    };
  }
  if (plan.msme) {
    return {
      blockers: [],
      summary: `Mark ${plan.name} as an MSME supplier (${plan.category}, Udyam ${plan.udyam || 'not given'})${days == null ? '' : ` to be paid within ${inDays}`}`,
      effects: [days == null ? 'No pay-by date is set until you give the agreed days. Nothing is posted.' : `New bills from them get a pay-by date ${inDays} from the bill date. Nothing is posted.`, MEDIUM_NOT_COVERED, BOOKED_BILLS_CHECKED],
      figures: { days },
    };
  }
  if (plan.before?.msme) {
    return {
      blockers: [],
      summary: `${plan.name} is no longer marked MSME`,
      effects: [days == null ? 'New bills from them get no MSME pay-by date and no reminder. Nothing is posted.' : `New bills from them get a pay-by date ${inDays} from the bill date, without the MSME limit or its reminder. Nothing is posted.`, BOOKED_BILLS_CHECKED],
      figures: { days },
    };
  }
  if (days == null) return { blockers: ['Give the agreed days, or mark the supplier as MSME.'], summary: '', effects: [], figures: {} };
  return {
    blockers: [],
    summary: `Set ${plan.name}'s terms to ${inDays}`,
    effects: [`New bills from them get a pay-by date ${inDays} from the bill date. Nothing is posted.`, BOOKED_BILLS_CHECKED],
    figures: { days },
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
