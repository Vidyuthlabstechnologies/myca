import { TOOLS, runTool } from './tools.mjs';
import { templateWords } from './invoice-template.mjs';
import { settlementWords, settlementStatusWords } from './settlements.mjs';
import { orderImportWords } from './marketplace-orders.mjs';
import { creditsWords } from './marketplace-credits.mjs';
import { marginsWords, stockWords, stockMovesWords } from './sku-margins.mjs';
import { valuationWords, valuationsWords } from './inventory.mjs';
import { connectorsWords, fetchWords } from './channel-connectors.mjs';
import { portalWords } from './portal-filing.mjs';
import { knowledgeWords } from './knowledge.mjs';
import { zohoPushWords } from './zoho-push.mjs';
import { closeWords } from './daily-close.mjs';
import { registrationsWords } from './registrations.mjs';
import { stockTransferWords } from './stock-transfers.mjs';
import { planLocalToolCall, validateAssistantToolCall } from './assistant-contract.mjs';
import { needsConfirmation, previewOf, openPending, takePending, clearPending, previewReply, blockedReply } from './chat-confirm.mjs';
import { liveCallsEnabled, mockModeEnabled } from './runtime-config.mjs';
import { referenceImportContent, resolveImportContent } from './import-documents.mjs';
import { spoken } from './words.mjs';
import { planEntryWithTds } from './tds-intent.mjs';
import { paymentWords } from './gst-payment.mjs';
import { transportWords } from './eway-bill.mjs';
import { payrollWords } from './payroll.mjs';
import { setCurrentCountry, formatMoneyCurrent } from './country.mjs';
import { rulesStatusWords } from './rules-status.mjs';
import { automationWords } from './automation.mjs';
import { readDocumentWords } from './document-reader.mjs';
import { amendmentWords } from './invoice-amendments.mjs';
import { scheduleSeWords } from './us-se-tax.mjs';
import { cpaPackWords } from './us-cpa-pack.mjs';
import { payrollFileWords } from './us-payroll-files.mjs';
import { chooseTool, modelConfigured } from './model-adapter.mjs';
import { rememberTurn, recentTurns } from './chat-memory.mjs';
import { logEvalEvent } from './practice.mjs';
import { assistantTools } from './assistant-contract.mjs';
import { usPayrollWords } from './us-payroll.mjs';
import { ownerTaxWords } from './us-owner-tax.mjs';
import { usImportWords } from './import-us-books.mjs';
import { gstr9Words } from './gstr9.mjs';
import { weekAheadWords } from './week-ahead.mjs';
import { annexureWords } from './salary-annexure.mjs';
import { certificateWords } from './tds-certificates.mjs';
import { posImportWords } from './import-pos.mjs';
import { file1099Words } from './us-1099.mjs';
import { inWords as monthWords } from './words.mjs';
import { collectionsInWords } from './collections.mjs';
import { paymentRunInWords } from './payment-run.mjs';
import { weeklyBriefWords } from './weekly-brief.mjs';
import { monthCloseWords } from './month-close.mjs';
import { restockWords } from './restock.mjs';
import { advanceTaxWords } from './advance-tax.mjs';
import { supplierPayoutWords } from './supplier-bank.mjs';
import { reportWords } from './reports.mjs';
import { auditTrailWords } from './audit-trail.mjs';
import { tallyPushWords } from './tally-push.mjs';
import { throughLanguage } from './chat-language.mjs';
import { tagExpense } from './expenses.mjs';
import { dscWords } from './dsc.mjs';
import { track1099Words } from './track1099.mjs';
import { payrollImportWords } from './us-payroll-import.mjs';
import { suggestExpenseHead } from './expense-head-model.mjs';
import { kindTitle } from './quotes.mjs';
import { everyWords, recurringWords, runRecurringWords } from './recurring.mjs';
import { reconciliationWords, matchWords, unmatchWords, chargesWords, accountWords, accountsWords, transferWords } from './bank-recon.mjs';
import { addRuleWords, rulesWords, runRulesWords, removeRuleWords } from './bank-rules.mjs';


const GSTR1_HELD_REASONS = {
  INVALID_HSN: 'no HSN code (4 to 8 digits)',
  INVALID_GSTIN: 'a buyer GSTIN that does not check out',
  STATE_MISMATCH: 'a buyer state that does not match its GSTIN',
  RATE_UNKNOWN: 'a GST rate that is not in force on its date',
  TAX_MISMATCH: 'tax that does not match the rate',
  NEGATIVE_VALUE: 'a negative value',
};

function gstr1HeldWords(errors) {
  const byInvoice = new Map();
  for (const e of errors || []) {
    if (!e.invoiceNo) continue;
    const list = byInvoice.get(e.invoiceNo) || [];
    list.push(GSTR1_HELD_REASONS[e.code] || e.message || e.code);
    byInvoice.set(e.invoiceNo, list);
  }
  if (!byInvoice.size) return '';
  const rows = [...byInvoice].map(([id, why]) => `· ${id}: ${why.join('; ')}`);
  return `\nLeft out of these tables until fixed (amend the invoice):\n${rows.join('\n')}`;
}

function money(n) {
  return formatMoneyCurrent(Number(n) || 0);
}

const FAILURES = {
  LIVE_CALLS_DISABLED: (r) => r.hint || 'Nothing was sent: government and provider calls are switched off here.',
  TEST_MODE_HELD: (r) => r.hint || 'Test mode: this action has no sandbox, so nothing was sent.',
  INVOICES_HELD: (r) => `${(r.held || []).length === 1 ? '1 invoice is' : `${(r.held || []).length} invoices are`} held back (${(r.held || []).slice(0, 5).join(', ')}); fix them before saving to the portal.`,
  NOT_SAVED: () => 'Save the GSTR-1 to the portal first, then file it.',
  DRAFT_CHANGED: () => 'The invoices changed since the save; save to the portal again, then file.',
  REVIEW_NOT_APPROVED: () => 'Approve the GST review for that month first; filing cannot be undone.',
  OTP_REQUIRED: () => 'Give the six-digit EVC OTP the portal sent.',
  PAN_REQUIRED: () => 'Set the company PAN first.',
  TAN_REQUIRED: () => 'Set the deductor TAN first.',
  CA_APPROVAL_REQUIRED: () => 'This operation needs a CA approval: request one (approval_request) and have the CA approve it, then say it again with the approval id.',
  NOT_A_DEDUCTOR: () => 'This business is not set up to deduct TDS. Say "we deduct TDS, TAN" followed by your TAN first.',
  NOTHING_TO_REVIEW: (r) => `There are no sales, purchases or credit notes dated in ${r.period || 'that month'}, so there is nothing to review.`,
  STEP_NOT_READY: (r) => `Confirm the ${r.waitingFor || 'earlier'} step first; the review goes in order.`,
  CONNECTOR_NOT_CONFIGURED: (r) => `${r.channel} is not connected; save its credentials first (${(r.fields || []).join(', ')}).`,
  CONNECTOR_DISABLED: (r) => `${r.channel} is paused; enable it to pull reports.`,
  UNKNOWN_CONNECTOR: (r) => `${r.channel || 'That channel'} has no API connector${r.fileOnly ? `: ${r.fileOnly}` : ''}.`,
  KIND_NOT_SUPPORTED: (r) => `${r.channel} gives ${(r.kinds || []).join(' and ')} reports, not ${r.kind}.`,
  OPEN_DOCUMENTS: (r) => `${r.gstin} still has ${r.count === 1 ? '1 open document' : `${r.count} open documents`} (${[...r.invoices, ...r.purchases].slice(0, 6).join(', ')}); settle or cancel them before retiring it.`,
  UNKNOWN_REGISTRATION: (r) => `${r.gstin} is not a registration of this business${r.known?.length ? ` (known: ${r.known.join(', ')})` : ''}.`,
  DIFFERENT_PAN: () => 'That GSTIN carries a different PAN, so it is not a registration of this business.',
  STATE_TAKEN: (r) => `There is already an active registration in state ${r.stateCode} (${r.by}); retire it first.`,
  IS_PRINCIPAL: () => 'That is the principal GSTIN; change it on the company.',
  COST_REQUIRED: () => 'Set the SKU cost first ("cost of SKU-A is 450 at 12%"), or give a unit value; transfers go at cost by default.',
  SAME_REGISTRATION: () => 'Both ends are the same registration; record the stock at its new location instead.',
  PERIOD_LOCKED: (r) => `That date is in a period that is closed${r.lockThrough ? ` (up to ${r.lockThrough})` : ''}, so nothing was changed.`,
  INVALID_DATE: () => 'That is not a date I can read, so nothing was changed.',
  DUPLICATE_ID: (r) => `${r.id || 'That number'} is already used in these books, so nothing was changed.`,
  INVOICE_NOT_FOUND: () => 'That invoice is not in these books, so nothing was changed.',
  BILL_NOT_FOUND: () => 'That bill is not in these books, so nothing was changed.',
  BAD_AMOUNT: () => 'That amount does not work here, so nothing was changed.',
  OVERPAYMENT: (r) => `That is more than is owed${r.due != null ? ` (${money(r.due)})` : ''}, so nothing was changed.`,
  RATE_REQUIRED: () => 'A GST rate is needed for each item; MyCA does not assume one. Nothing was changed.',
  NO_LINES: () => 'There is nothing to put on it, so nothing was changed.',
  ZERO_AMOUNT: () => 'It comes to nothing, so nothing was changed.',
  SETUP_REQUIRED: () => 'Set up the business first: its name and GSTIN, or its state if it is not registered. Nothing was changed.',
  TALLY_UNREACHABLE: (r) => `Tally did not answer at ${r.url}. ${r.hint || ''}`.trim(),
  TALLY_TIMEOUT: (r) => `Tally at ${r.url} took too long to answer; try again with the company loaded.`,
  TALLY_REJECTED: (r) => `Tally rejected ${r.errors} ${r.errors === 1 ? 'entry' : 'entries'}${r.lineErrors?.length ? `: ${r.lineErrors.join('; ')}` : ''}. Nothing is recorded as sent.`,
  ALREADY_PUSHED: (r) => `${r.period} was already sent to Tally on ${r.pushedOn}. ${r.hint || ''}`.trim(),
  NOTHING_TO_PUSH: (r) => `Nothing in ${r.period} to send to Tally.`,
  TALLY_NOT_LOCAL: () => 'Tally is reached on this machine only, for example http://127.0.0.1:9000.',
  DSC_WINDOWS_ONLY: () => 'A DSC token is read through the Windows certificate store; sign from the Windows desktop.',
  DSC_CERT_NOT_FOUND: (r) => `No certificate with thumbprint ${r.thumbprint} has a private key on this machine; plug in the token and list the certificates again.`,
  DSC_TOOL_FAILED: (r) => `Signing failed: ${r.detail || 'the signing tool did not answer'}.`,
  BAD_THUMBPRINT: () => 'A certificate thumbprint is forty hexadecimal characters; say "dsc certificates" to list them.',
  PAYLOAD_REQUIRED: () => 'Attach the document to sign first.',
  REPORT_NOT_FOUND: (r) => `There is no saved report called ${r.name || 'that'}${(r.known || []).length ? `; you have ${r.known.join(', ')}` : ''}.`,
  NAME_REQUIRED: () => 'Give the report a name.',
  BAD_METRIC: (r) => `The report can be of ${r.hint}.`,
  BAD_GROUP: (r) => `Group it by ${r.hint}.`,
  BAD_PERIOD: (r) => `The period is ${r.hint}, or a month like 2026-09.`,
  MONTH_REQUIRED: () => 'That report covers one month at a time; say which month, for example 2026-10.',
  UNKNOWN_REPORT: (r) => `That is not a report I can put in Excel. Choose one of ${(r.known || []).join(', ')}.`,
  HASH_MISMATCH: () => 'An entry in the audit log was changed after it was written, so the log cannot be trusted from there.',
  LINK_BROKEN: () => 'An entry in the audit log is missing or out of order, so the log cannot be trusted from there.',
  ENTRY_NOT_FOUND: (r) => `There is no entry ${r.id || 'by that id'}.`,
  DOCUMENT_NOT_FOUND: () => 'That document is not in these books; upload it first.',
  BANK_DETAILS_REQUIRED: () => 'Give an account number with its IFSC, or a UPI id.',
  BAD_ACCOUNT: () => 'An account number is 6 to 20 digits.',
  BAD_IFSC: () => 'An IFSC is four letters, a zero and six characters, for example HDFC0001234.',
  BAD_UPI: () => 'A UPI id looks like name@bank.',
  NOT_AN_INDIVIDUAL: (r) => `MyCA works out advance tax for an individual or a proprietor; this business is a ${r.entityType || 'company or firm'}, which pays at a flat rate. Ask your CA for the figure.`,
  RULE_MISSING: () => 'MyCA has no advance tax schedule in force for this year, so it will not guess.',
  SKU_REQUIRED: () => 'Say which SKU.',
  SUPPLIER_REQUIRED: () => 'Say which supplier.',
  BAD_UDYAM: () => 'A Udyam number looks like UDYAM-XX-00-0000000.',
  BAD_TERMS: () => 'Agreed days must be a whole number from 0 to 365.',
  BAD_CATEGORY: () => 'The category is micro, small or medium.',
  TERMS_EXCEED_MSMED: (r) => `An MSME supplier must be paid within ${r.max || 45} days, so the agreed days cannot be more than ${r.max || 45}.`,
  LINES_REQUIRED: () => 'Say what to order: a SKU and a quantity.',
  MONTH_NOT_OVER: (r) => `${r.period || 'That month'} is not over yet; close it from ${r.lastDay || 'the first of next month'} onwards.`,
  ALREADY_CLOSED: (r) => `${r.period || 'That month'} was closed on ${r.closedOn || 'an earlier day'}.`,
  NOTE_REQUIRED: (r) => `${(r.needsYou || []).length} checks still need you; add a note saying why you are closing anyway.`,
  NO_EMPLOYEES: () => 'There are no employees on the books, so there is no payroll to make.',
  NO_PAYROLL_IN_VIEW: () => 'No salary day falls in the next sixty days: approve a payroll month first.',
  NOTHING_TO_PAY: () => 'Nothing needs paying right now.',
  BILLS_NOT_PAYABLE: (r) => `Some bills cannot be paid: ${(r.problems || []).map((x) => `${x.billId} (${String(x.reason || x.error || '').toLowerCase().replace(/_/g, ' ')})`).join('; ')}. Nothing was paid.`,
  PAYMENT_FAILED: (r) => `Paying ${r.billId} failed (${String(r.cause || '').toLowerCase().replace(/_/g, ' ')}); ${(r.posted || []).length} earlier ${(r.posted || []).length === 1 ? 'payment was' : 'payments were'} posted.`,
  CUSTOMER_NOT_FOUND: (r) => `There is no customer called ${r.customer || 'that'} in these books.`,
  NOTHING_OVERDUE: (r) => `${r.customer || 'That customer'} has nothing overdue.`,
  POSSIBLY_PAID: (r) => `${r.customer || 'That customer'} paid something in the last two weeks; match your bank statement before chasing.`,
  INVALID_GSTIN: (r) => `${r.gstin || 'That GSTIN'} is not a valid GSTIN, so nothing was changed. Check it with the other party.`,
  NO_ENTRIES: () => 'There is nothing in the books to audit yet.',
  NOT_FOR_COUNTRY: () => 'That is for a different country edition, so nothing was changed.',
  NOT_APPROVED: () => 'That month\'s payroll is not approved yet; approve it first.',
  NOT_FOUND: () => 'I could not find that in these books, so nothing was changed.',
  CLIENT_NOT_FOUND: () => 'There is no client by that id.',
  REQUEST_NOT_FOUND: () => 'There is no document request by that id.',
  MISSING_SANDBOX_CREDENTIALS: () => 'The provider credentials are not saved yet; set them up first.',
  UNKNOWN_REQUIREMENT: () => 'That is not an integration I know; say "integration readiness" for the list.',
  amount_must_be_positive: () => 'The amount has to be more than zero, so nothing was changed.',
  INSUFFICIENT_CASH: (r) => `There is not that much cash in hand${r.inHand != null ? ` (${money(r.inHand)})` : ''}. Nothing was changed.`,
  LINE_NOT_FOUND: (r) => `There is no statement line ${r.lineId || 'by that id'} in these books.`,
  LINE_NOT_OPEN: (r) => `${r.lineId || 'That line'} is already ${r.status || 'settled'}; open it again first if that is wrong.`,
  LINE_NOT_LINKED: (r) => `${r.lineId || 'That line'} is not matched to anything yet.`,
  BOOKED_LINE: (r) => `${r.lineId || 'That line'} was booked (${(r.ids || []).join(', ') || 'entries posted'}); the entries stay in the books, so reverse them first.`,
  TRANSFER_NOT_FOUND: (r) => r.hint || 'No entry in the books matches that, so nothing was changed.',
  SIDE_MISMATCH: (r) => `That reads as money ${r.side === 'in' ? 'coming in' : 'going out'}, which does not fit this line.`,
  AMOUNT_MISMATCH: (r) => `The line is ${money(r.lineAmount)} but the entry is ${money(r.bookAmount)}; they do not match.`,
  RECEIPT_UNALLOCATED: (r) => `${r.partyName || 'That customer'} has ${money(r.remainder)} less open on invoices than this line, so nothing was posted. Raise the invoice first, or record the receipt by hand.`,
  PAYMENT_UNALLOCATED: (r) => `${r.partyName || 'That supplier'} has ${money(r.remainder)} less open on bills than this line, so nothing was posted. Enter the bill first, or record the payment by hand.`,
  HEAD_REQUIRED: (r) => `Say which expense head${r.suggested ? ` (${r.suggested} was the nearest guess)` : ''}; nothing is guessed.`,
  OTHER_ACCOUNT_REQUIRED: () => 'Say which of your own accounts the other side is.',
  ACCOUNT_NOT_FOUND: (r) => `${r.account ? `"${r.account}"` : 'That'} is not one of your own accounts. Add it first.`,
  SAME_ACCOUNT: () => 'Both sides are the same account, so there is nothing to move.',
  NOT_A_CHARGE: () => 'That line does not read as a bank charge or interest.',
  PARTY_NOT_FOUND: (r) => `I do not know a customer or supplier${r.partyName ? ` called ${r.partyName}` : ' by that name'}.`,
  RULE_NOT_FOUND: (r) => `There is no bank rule ${r.id || 'by that id'}.`,
  MATCH_REQUIRED: () => 'Say what the narration must contain for the rule to apply.',
  BAD_PATTERN: () => 'That pattern is not a regular expression I can run.',
  LABEL_TAKEN: (r) => `An account called ${r.label || 'that'} already exists (${r.id}).`,
  BUILT_IN_ACCOUNT: () => 'Cash (1001) and Bank (1002) are built in and cannot be changed.',
  KIND_FIXED: (r) => `That account stays a ${r.kind} account; add a new one for a different kind.`,
  NO_FREE_ACCOUNT: () => 'All own-account ids from 1003 to 1099 are taken.',
};

function notAccepted(error) {
  const text = String(error || '');
  if (/gstRate is required/.test(text)) return 'A GST rate is needed for each item; MyCA does not assume one. Nothing was changed.';
  if (/partyName/.test(text)) return 'Say who it is with. Nothing was changed.';
  if (/amount|rate|qty/.test(text) && /minimum|exclusiveMinimum|number/.test(text)) return 'One of the amounts is not a usable number. Nothing was changed.';
  return 'Some of the details were missing or not in the right form, so nothing was changed.';
}

function failedInWords(code, result = {}) {
  const plain = FAILURES[code];
  if (plain) return plain(result || {});
  const words = String(code || '').toLowerCase().replace(/_/g, ' ').trim();
  return `That did not go through${words ? ` (${words})` : ''}, so nothing was changed.`;
}

function humanKey(key) {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

function plainValue(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : money(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

function outline(d, depth = 0) {
  if (d == null || typeof d !== 'object') return plainValue(d);
  const pad = '  '.repeat(depth);
  const lines = [];
  if (Array.isArray(d)) {
    for (const item of d.slice(0, 12)) {
      if (item && typeof item === 'object') {
        const pairs = Object.entries(item).filter(([, v]) => v != null && v !== '' && typeof v !== 'object').map(([k, v]) => `${humanKey(k)} ${plainValue(v)}`);
        lines.push(`${pad}· ${pairs.join(', ')}`);
      } else lines.push(`${pad}· ${plainValue(item)}`);
    }
    if (d.length > 12) lines.push(`${pad}… and ${d.length - 12} more.`);
    return lines.join('\n');
  }
  for (const [key, value] of Object.entries(d)) {
    if (value == null || value === '' || key === 'ok' || (Array.isArray(value) && !value.length)) continue;
    if (typeof value === 'object') {
      if (depth >= 2) continue;
      lines.push(`${pad}${humanKey(key)}:`);
      lines.push(outline(value, depth + 1));
    } else lines.push(`${pad}${humanKey(key)}: ${plainValue(value)}`);
  }
  return lines.join('\n');
}

const SIMULATED_NOTE = 'Simulated in sandbox: nothing was sent to the government portal or any provider.';

function fmtToolResult(name, result) {
  const text = fmtToolResultCore(name, result);
  if (!result?.mock || /simulated|mock/i.test(text)) return text;
  return `${text}\n[${SIMULATED_NOTE}]`;
}

function bankLinesWords(lines) {
  if (!lines) return '';
  const parts = [];
  if (lines.matched) parts.push(`${lines.matched} ${lines.matched === 1 ? 'line was' : 'lines were'} already in the books and ${lines.matched === 1 ? 'is' : 'are'} linked`);
  if (lines.byRules) parts.push(`${lines.byRules} booked by your rules`);
  if (lines.transfersGuessed) parts.push(`${lines.transfersGuessed} ${lines.transfersGuessed === 1 ? 'looks' : 'look'} like a move between your own accounts but went to a guessed head`);
  if (lines.unmatched) parts.push(`${lines.unmatched} ${lines.unmatched === 1 ? 'waits' : 'wait'} for you to match`);
  if (lines.existing) parts.push(`${lines.existing} seen before and skipped`);
  if (!parts.length) return '';
  const first = parts[0][0].toUpperCase() + parts[0].slice(1);
  return ` ${[first, ...parts.slice(1)].join(', ')}.${lines.unmatched ? ' Say "match bank" to go through them.' : ''}`;
}

function fmtToolResultCore(name, result) {
  if (result?.error === 'SALARIES_PRIVATE') return 'Only the owner can see or change employees and salaries.';
  if (result?.error === 'OWNER_ONLY') return result.hint || 'Only the owner can do that.';
  if (!result || result.ok === false) return failedInWords(result?.error, result);
  const d = result.data ?? result.invoice ?? result;
  if (name === 'create_invoice' && result.invoice?.export) {
    const inv = result.invoice;
    const e = inv.export;
    return `Export invoice ${inv.id} to ${inv.partyName}: ${e.currency === 'INR' ? '' : `${e.currency} ${e.foreignTotal} at ${e.exchangeRate}, `}${money(inv.total)} in rupees${e.withTax ? `, IGST ${money(inv.igst)} charged (refund claimable)` : ', zero-rated without IGST under LUT or bond'}. Place of supply 96; it goes to GSTR-1 table 6A (${e.withTax ? 'WPAY' : 'WOPAY'}).${e.shippingBillNo ? '' : ' Add the shipping bill number, date and port code when you have them.'}`;
  }
  if (name === 'create_invoice' && result.invoice) {
    const i = result.invoice;
    if (i.country === 'US') {
      return `Posted ${i.id} to ${i.partyName} on ${i.date} for ${money(i.total)} (${money(i.subtotal)}${i.taxExempt ? `, exempt from sales tax: ${i.exemptionReason}` : ` plus ${money(i.salesTax)} sales tax`}).`;
    }
    return `Posted ${i.id} to ${i.partyName} on ${i.date} for ${money(i.total)} (${money(i.taxable)} plus ${money(i.cgst + i.sgst + i.igst)} GST).`;
  }
  if (name === 'can_make_payroll' && result.data) {
    const d = result.data;
    const head = { covered: 'Yes.', tight: 'Yes, but it is tight.', short: `No, short by ${money(d.gap)}.` }[d.verdict];
    const lines = [`${head} ${d.label}${d.estimated ? ' (not run yet; taken as last month)' : ''}: ${money(d.net)} net${d.statutory ? ` plus ${money(d.statutory)} of PF, ESI and TDS around it` : ''} on ${d.payday}. Cash that day before paying: about ${money(d.balanceBefore)}; after: ${money(d.left)}.`];
    if (d.helpers.length) lines.push(`Money that usually lands before payday if you chase it: ${d.helpers.map((h) => `${h.customer} ${money(h.amount)} on ${h.invoice}${h.usuallyPaysIn != null ? ` (pays in about ${h.usuallyPaysIn} days)` : ''}`).join('; ')}. Say "send reminder to ${d.helpers[0].customer}".`);
    else if (d.gap > 0) lines.push('No customer usually pays before that date; the gap needs a receipt, a delay on a supplier bill, or money in from you.');
    if (d.start.source !== 'reading') lines.push('· There is no bank balance from you; say "bank balance is ..." for a true picture.');
    return lines.join('\n');
  }
  if (name === 'can_afford' && result.data) {
    const d = result.data;
    const head = { yes: 'Yes.', tight: 'Yes, but it is tight.', no: 'Not on these figures.' }[d.verdict];
    const covered = d.monthsCovered == null ? '' : ` That is about ${d.monthsCovered} ${d.monthsCovered === 1 ? 'month' : 'months'} of your usual outgoings.`;
    const lines = [
      `${head} You would have about ${money(d.balanceThen)} on ${d.on}. After spending ${money(d.amount)}, the lowest point in the month after is ${money(d.left)}.${covered}`,
      d.verdict === 'yes' ? '' : `To keep a month of outgoings in hand, spend up to ${money(d.safeToSpend)} then.`,
      ...d.notes.map((note) => `· ${note}`),
    ];
    return lines.filter(Boolean).join('\n');
  }
  if (name === 'cash_forecast' && result.data) {
    const d = result.data;
    return [
      `Bank and cash now: ${money(d.start.amount)}. In ${d.days} days: about ${money(d.end)}.`,
      `Coming in: ${money(d.coming.total)}. Going out: ${money(d.going.total)}. Lowest point: ${money(d.lowest.amount)} on ${d.lowest.date}.`,
      ...(d.windows || []).map((w) => `${w.from} to ${w.to}: in ${money(w.in.expected)} (between ${money(w.in.low)} and ${money(w.in.high)} by timing), out ${money(w.out)}, ending about ${money(w.end.expected)}.`),
      ...(d.risks || []).map((r) => `Risk: ${r.text}`),
      d.overdue.total > 0 ? `Overdue and not counted: ${money(d.overdue.total)}.` : '',
      ...d.notes.map((note) => `· ${note}`),
    ].filter(Boolean).join('\n');
  }
  if (name === 'create_quote' && result.quote) {
    const kind = result.quote.kind || 'quote';
    const until = kind === 'quote' || kind === 'proforma' ? `, valid until ${result.quote.validUntil}` : '';
    return `${kindTitle(result.quote)} ${result.quote.id} to ${result.quote.partyName} for ${money(result.quote.total)}${until}. Nothing was posted to your books.`;
  }
  if (name === 'add_recurring' && result.schedule) {
    const s = result.schedule;
    return `${s.id}: ${s.kind === 'invoice' ? `invoice to ${s.party}` : s.kind === 'bill' ? `bill from ${s.party}` : `expense ${s.party}`.trim()} for ${money(s.amount)} ${everyWords(s.every)} from ${s.startDate}${s.endDate ? ` until ${s.endDate}` : ''}. Next: ${result.next.join(', ')}. The daily run posts each one on its date.`;
  }
  if (name === 'stop_recurring' && result.schedule) return `Stopped ${result.schedule.id}. Entries already posted stay.`;
  if (name === 'list_recurring' && result.data) return recurringWords(result.data, money);
  if (name === 'run_recurring' && result.data) return runRecurringWords(result.data, money);
  if (name === 'bank_reconciliation' && result.data) return reconciliationWords(result.data, money);
  if (name === 'match_bank_line' && result.line) return matchWords(result, money);
  if (name === 'unmatch_bank_line' && result.line) return unmatchWords(result);
  if (name === 'book_bank_charges' && result.booked) return chargesWords(result, money);
  if (name === 'add_bank_rule' && result.rule) return addRuleWords(result, money);
  if (name === 'remove_bank_rule' && result.rule) return removeRuleWords(result);
  if (name === 'list_bank_rules' && result.data) return rulesWords(result.data, money);
  if (name === 'run_bank_rules' && result.made) return runRulesWords(result);
  if (name === 'set_bank_account' && result.account) return accountWords(result);
  if (name === 'list_bank_accounts' && result.data) return accountsWords(result.data, money);
  if (name === 'record_transfer' && result.transfer) return transferWords(result, money);
  if (name === 'mark_quote' && result.quote) {
    return `${result.quote.id} marked ${result.quote.status}.`;
  }
  if (name === 'convert_quote' && result.invoice) {
    return `Posted ${result.invoice.id} to ${result.invoice.partyName} for ${money(result.invoice.total)} from ${kindTitle(result.quote).toLowerCase()} ${result.quote.id}.`;
  }
  if (name === 'ask_ca' && result.request) {
    return `Sent to your CA in MyCA (${result.request.id}). You will see the reply under Your CA.`;
  }
  if (name === 'reply_ca' && result.request) {
    return `Replied on ${result.request.title}.`;
  }
  if (name === 'close_ca' && result.request) {
    return `Closed: ${result.request.title}.`;
  }
  if (name === 'set_payment_terms' && result.ok) {
    return `Noted. ${result.customer}: ${result.label}. New invoices to them will show a due date.`;
  }
  if (name === 'set_cash_balance' && result.reading) {
    return `Noted. On ${result.reading.on}: bank ${money(result.reading.bank)}, cash in hand ${money(result.reading.cash)}. The forecast starts from here.`;
  }
  if (name === 'add_reminder' && result.reminder) {
    return `Set. On ${result.reminder.due}: ${result.reminder.text}.`;
  }
  if (name === 'complete_reminder' && result.reminder) {
    return `Done: ${result.reminder.text}.`;
  }
  if (name === 'list_reminders' && result.data) {
    const rows = result.data.reminders;
    if (!rows.length) return 'You have no open reminders.';
    const when = { overdue: 'Overdue', today: 'Today', later: 'On' };
    return rows.map((item) => `· ${item.state === 'later' ? `${when.later} ${item.due}` : when[item.state]}: ${item.text} (${item.id})`).join('\n');
  }
  if (name === 'books_check' && result.data) {
    const mark = { act: 'Needs you', check: 'Check', ok: 'Fine' };
    const lines = result.data.findings.map((item) => `· ${mark[item.severity]}: ${item.title}. ${item.detail}`);
    return [result.data.headline + '.', ...lines].join('\n');
  }
  if (name === 'gst_review_answer' && result.review) {
    const review = result.review;
    if (result.approved) return `Approved the ${review.month} figures. Nothing has been filed. Save the GSTR-1 file from Taxes, or send it to your CA.`;
    if (result.answer === 'wrong') return `Noted that it is not right. Fix the entries; the review starts again from that step when the figures change.`;
    const next = review.steps.find((step) => step.id === review.next);
    return next ? `Confirmed. Next: ${next.title}. Say "review GST" to see it.` : 'Confirmed.';
  }
  if (name === 'record_receipt' && result.invoice) {
    const i = result.invoice;
    const last = (i.receipts || []).at(-1) || {};
    const received = (i.receipts || []).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
    return `Recorded ${money(last.amount)} received from ${i.partyName} by ${last.mode || 'bank'} on ${last.date} against ${i.id}. ${i.status === 'paid' ? `${i.id} is paid in full.` : `${money(received)} of ${money(i.total)} received so far.`}`;
  }
  if (name === 'post_expense' && result.expense) {
    const e = result.expense;
    return `Posted ${e.id}: ${money(e.amount)} ${e.description ? `for ${e.description} ` : ''}from ${e.mode === 'cash' ? 'cash' : 'the bank'} on ${e.date}, under ${e.headName}.${e.inputCredit ? ` Input credit ${money((e.cgst || 0) + (e.sgst || 0) + (e.igst || 0))}.` : ''}${e.tds?.amount ? ` ${money(e.tds.amount)} TDS under ${e.tds.section} held back; ${money(e.amount - e.tds.amount)} paid.` : ''}`;
  }
  if (name === 'set_expense_head' && result.expense) {
    const e = result.expense;
    return result.unchanged ? `${e.id} is already under ${e.headName}.` : `Moved ${e.id} to ${e.headName}.`;
  }
  if (name === 'create_debit_note' && result.debitNote) {
    const n = result.debitNote;
    return `Debit note ${n.id} for ${money(n.total)} against ${n.invoiceId} (${n.partyName}, ${n.date}). ${n.partyName} now owes ${money(result.outstanding)}.`;
  }
  if (name === 'record_supplier_debit_note' && result.supplierNote) {
    const n = result.supplierNote;
    return `Recorded ${n.partyName}'s debit note${n.supplierInvoiceNo ? ` ${n.supplierInvoiceNo}` : ''} as ${n.id} against ${n.noteOf}: ${money(n.total)} more owed (${money(n.taxable)} plus ${money(n.cgst + n.sgst + n.igst)} GST).`;
  }
  if (name === 'create_purchase_note' && result.purchaseNote) {
    const n = result.purchaseNote;
    return `Debit note ${n.id} to ${n.partyName} for ${money(n.total)} against ${n.billId} (${n.date}).${result.refundDue > 0 ? ` ${money(result.refundDue)} was already paid and is now due back to you.` : ` You owe ${money(result.outstanding)} on it now.`}`;
  }
  if ((name === 'create_credit_note' || name === 'cancel_invoice') && result.creditNote) {
    const n = result.creditNote;
    const head = n.cancels ? `Cancelled ${n.invoiceId} with credit note ${n.id}` : `Credit note ${n.id} for ${money(n.total)} against ${n.invoiceId}`;
    return `${head} (${n.partyName}, ${n.date}).${result.refundDue > 0 ? ` ${money(result.refundDue)} was already received and is now due back to ${n.partyName}.` : ''}`;
  }
  if (name === 'gst_payable' && result.data) {
    return paymentWords(result.data, money, monthWords);
  }
  if (name === 'set_gst_credit_opening' && result.opening) {
    const o = result.opening;
    return `Recorded the GST credit balance at the start of ${monthWords(o.period)}: IGST ${money(o.igst)}, CGST ${money(o.cgst)}, SGST ${money(o.sgst)}. Set-off from that month on counts it.`;
  }
  if (name === 'tds_review_answer' && result.review) {
    const review = result.review;
    if (result.approved) return `Approved the ${review.period}${review.kind === 'salary' ? ' salary' : ''} TDS statement. Nothing has been filed. ${review.shortfall > 0 ? `${money(review.shortfall)} is still to deposit before it can be filed.` : 'File it on the TRACES or income-tax portal, or send it to your CA, and record the acknowledgement.'}`;
    if (result.answer === 'wrong') return 'Noted that it is not right. Fix the entries; the review starts again from that step when the figures change.';
    const next = review.steps.find((step) => step.id === review.next);
    return next ? `Confirmed. Next: ${next.title}. Say "review ${review.kind === 'salary' ? 'salary ' : ''}TDS" to see it.` : 'Confirmed.';
  }
  if (name === 'pf_ecr' && result.data) {
    const d = result.data;
    return `PF file for ${d.month}: ${d.members === 1 ? '1 member' : `${d.members} members`}, remittance ${money(d.totals.remittance)} (employee share ${money(d.totals.employeeShare)}, pension ${money(d.totals.pensionShare)}, employer PF ${money(d.totals.employerEpfShare)}, EDLI ${money(d.totals.edli)}, administrative charge ${money(d.totals.adminCharge)}). Saved as ${d.fileName} from the payroll screen.${d.missingUan.length ? ` No UAN for ${d.missingUan.join(', ')}; add it before uploading.` : ''}`;
  }
  if (name === 'request_documents' && result.ok !== false) {
    const r = result.request;
    return `${r.id}: asked ${r.clientName} for ${r.items.map((item) => item.kind).join(', ')}${r.period ? ` for ${r.period}` : ''}${r.dueOn ? `, by ${r.dueOn}` : ''}. The message is ready to copy; say "received <item> for ${r.id}" as each arrives.\n\n${r.message}`;
  }
  if (name === 'record_document_received' && result.ok !== false) {
    return result.outstanding.length ? `Noted. Still waiting on ${result.outstanding.join(', ')} for ${result.request.id}.` : `${result.request.id} is complete; everything asked for has arrived.`;
  }
  if (name === 'document_requests' && result.data) {
    const d = result.data;
    if (!d.requests.length) return 'No document requests are open. Say "request from CL-001: bank statement, sales register for 2026-09" to ask a client.';
    const lines = d.requests.slice(0, 10).map((r) => `· ${r.id} ${r.clientName}: ${r.outstanding.length ? `waiting on ${r.outstanding.join(', ')}` : 'complete'}${r.dueOn ? ` (by ${r.dueOn}${r.overdue ? ', overdue' : ''})` : ''}`).join('\n');
    return `${d.open === 1 ? '1 request open' : `${d.open} requests open`}${d.overdue ? `, ${d.overdue} overdue` : ''}:\n${lines}`;
  }
  if (name === 'eval_events' && result.data) {
    const d = result.data;
    if (!d.events.length) return 'Nothing logged yet.';
    const lines = d.events.slice(0, 10).map((e) => `· ${e.id} "${e.input.slice(0, 60)}" → ${e.toolName || 'reply'} (${e.outcome}${e.viaModel ? ', model' : ''})${e.correction ? ` corrected: ${e.correction.correctTool || e.correction.note}` : ''}`).join('\n');
    return `${d.total} messages logged, ${d.viaModel} routed by the model, ${d.blocked} blocked, ${d.corrected} corrected:\n${lines}`;
  }
  if (name === 'correct_eval' && result.ok !== false) return `Correction recorded on ${result.event.id}.`;
  if (name === 'search_firm_notes' && result.data) {
    const d = result.data;
    if (!d.hits.length) return `Nothing in the firm's notes mentions "${d.query}".`;
    return `${d.total === 1 ? '1 note mentions' : `${d.total} notes mention`} "${d.query}":\n${d.hits.slice(0, 8).map((h) => `· ${h.kind} ${h.id}: ${h.excerpt}`).join('\n')}`;
  }
  if (name === 'set_invoice_template' && result.ok !== false) {
    return `Invoice design updated (${result.changed.join(', ')}). It applies to every invoice and quote PDF from now, including ones already raised.\n${templateWords(result.template)}`;
  }
  if (name === 'invoice_template' && result.data) {
    return `${result.data.isDefault ? 'The invoice uses the standard design.\n' : ''}${templateWords(result.data)}\nChange it with "invoice colour #1d4ed8", "layout minimal", "bank details on invoices: HDFC Bank, account 50100123456789, IFSC HDFC0001234, UPI asha@okhdfc", "terms: ...", "footer: ...", "sign invoices as ...", or "hide HSN".`;
  }
  if (name === 'set_invoice_numbering' && result.ok !== false) {
    const mode = result.mode;
    return mode === 'yearly' ? 'New invoices are numbered per financial year, as INV-<year><number> (for example INV-26270001 for the first of 2026-27). Existing invoices keep their numbers.' : 'New invoices continue one series, INV-0001 onwards.';
  }
  if (name === 'set_supplier_terms' && result.ok !== false) {
    const d = result;
    return `${d.supplier}${d.msme ? ` is recorded as an MSME${d.category ? ` (${d.category})` : ''}${d.udyam ? `, ${d.udyam}` : ''}` : ' is not an MSME'}${d.days != null ? `; agreed terms ${d.days === 0 ? 'on receipt' : `${d.days} days`}` : ''}. New bills from them carry the pay-by date${d.msme ? ' from the MSMED Act' : ''}; old bills keep theirs.`;
  }
  if (name === 'supplier_dues' && result.data) {
    const d = result.data;
    if (!d.bills.length) return d.msme.count ? 'Nothing is owed to suppliers with a pay-by date.' : d.note;
    const lines = d.bills.slice(0, 8).map((b) => `· ${b.supplier} ${money(b.outstanding)} on ${b.billId}: ${b.overdue ? `${-b.daysLeft} days past` : b.daysLeft === 0 ? 'due today' : `due in ${b.daysLeft} days`} (${b.payBy})${b.msme ? ', MSME' : ''}`).join('\n');
    const msme = d.msme.count ? ` MSME suppliers are owed ${money(d.msme.outstanding)}${d.msme.overdue ? `, of which ${money(d.msme.overdueOutstanding)} is past the MSMED limit and not deductible until paid (${d.msme.rule})` : ', none past the MSMED limit'}.` : '';
    return `${d.bills.length === 1 ? '1 bill' : `${d.bills.length} bills`} with a pay-by date:\n${lines}${d.bills.length > 8 ? `\n· and ${d.bills.length - 8} more` : ''}.${msme}`;
  }
  if (name === 'payroll_payout_file' && result.data) {
    const d = result.data;
    return `Salary payout for ${d.month}: ${d.employees === 1 ? '1 employee' : `${d.employees} employees`}, ${money(d.total)}. Saved as ${d.fileName} from the payroll screen.${d.missingBank.length ? ` No bank account for ${d.missingBank.join(', ')}; add it before uploading.` : ''}${d.paidOn ? ` Already recorded as paid on ${d.paidOn}.` : ''}`;
  }
  if (name === 'esi_return' && result.data) {
    const d = result.data;
    return `ESI file for ${d.month}: ${d.members === 1 ? '1 member' : `${d.members} members`}, wages ${money(d.totals.wages)}, remittance ${money(d.totals.remittance)} (employees ${money(d.totals.employeeContribution)}, employer ${money(d.totals.employerContribution)}). Saved as ${d.fileName} from the payroll screen.${d.missingIp.length ? ` No insurance number for ${d.missingIp.join(', ')}; add it before uploading.` : ''}`;
  }
  if (name === 'tds_return' && result.data) {
    const d = result.data;
    if (d.empty) return `Nothing was deducted in ${d.quarter}${d.kind === 'salary' ? ' on salaries' : ''}.`;
    const rows = d.sections.map((s) => `· ${s.section}: ${s.deductees === 1 ? '1 deductee' : `${s.deductees} deductees`}, ${money(s.tds)}`).join('\n');
    return `TDS statement for ${d.kindLabel} for ${d.quarter}${d.form ? ` (Form ${d.form})` : ''}: deducted ${money(d.deducted)}, deposited ${money(d.deposited)}${d.shortfall > 0 ? `, still to deposit ${money(d.shortfall)}` : ''}.${d.filed ? ` Recorded as filed on ${d.filed.filedOn}, ARN ${d.filed.arn}.` : d.dueDate ? ` Due by ${d.dueDate}.` : ''}\n${rows}\nSay "review TDS" to check it step by step.`;
  }
  if (name === 'export_tally' && result.data) {
    const d = result.data;
    return `Tally file for ${d.period} is ready: ${d.count === 1 ? '1 voucher' : `${d.count} vouchers`} and ${d.ledgers} ledgers, saved as ${d.fileName} from Taxes. ${d.caveat}`;
  }
  if (name === 'set_sales_tax_rate' && result.rate) {
    return `Recorded sales tax for ${result.rate.name}: ${result.rate.ratePercent}% from ${result.rate.from}.`;
  }
  if (name === 'list_sales_tax_rates' && result.data) {
    const rows = result.data.rates;
    return rows.length ? `Sales tax rates:\n${rows.map((r) => `· ${r.name} (${r.code}): ${r.ratePercent}% from ${r.from}`).join('\n')}` : 'No sales tax rate is recorded yet. Say, for example, "sales tax rate TX 6.25%".';
  }
  if (name === 'set_contractor' && result.vendor) {
    return `${result.vendor.name} is ${result.vendor.contractor ? 'now a contractor; payments count towards a 1099-NEC' : 'no longer a contractor'}.`;
  }
  if (name === 'contractor_payments' && result.data) {
    const d = result.data;
    if (!d.contractors.length) return `No supplier is marked as a contractor. Say "<name> is a contractor" to start counting towards 1099s for ${d.year}.`;
    return `Contractor payments in ${d.year} (1099-NEC at or above ${money(d.threshold)}):\n${d.contractors.map((c) => `· ${c.name}: ${money(c.total)}${c.needs1099 ? ' — needs a 1099-NEC' : ''}${c.needs1099 && !c.w9Received ? ', W-9 missing' : ''}`).join('\n')}${d.notes.length ? `\n${d.notes.join(' ')}` : ''}`;
  }
  if (name === 'rules_status' && result.data) return rulesStatusWords(result.data);
  if (name === 'automation_status' && result.data) return automationWords(result.data);
  if (name === 'read_document' && result.data) return readDocumentWords(result.data);
  if (name === 'amend_invoice' && result.amendment) return amendmentWords(result, money);
  if (name === 'list_amendments' && result.data) return result.data.count ? `Amendments:\n${result.data.amendments.map((a) => `· ${a.id} ${a.date}: ${a.invoiceId} (${a.originalPeriod}) ${money(a.before)} → ${money(a.after)}, in GSTR-1 ${a.period}, ${a.reason}`).join('\n')}` : 'No invoice has been amended.';
  if (name === 'schedule_se' && result.data) return scheduleSeWords(result.data, money);
  if (name === 'schedule_c_document' && result.data) return `Schedule C ${result.data.year}: net profit ${money(result.data.netProfit)}${result.data.selfEmploymentTax != null ? `, self-employment tax ${money(result.data.selfEmploymentTax)}` : ''}. Saved as ${result.data.fileName} from the Federal and owner taxes screen.`;
  if (name === 'cpa_pack' && result.data) return cpaPackWords(result.data, money);
  if ((name === 'payroll_941_file' || name === 'payroll_w2_file') && result.data) return payrollFileWords(name, result.data, money);
  if (name === 'run_automation' && result.data) return result.data.skipped ? `The daily checks already ran today (${result.data.ranOn}).` : automationWords({ lastRun: result.data.ranOn, last: result.data.run });
  if (name === 'record_gst_payment' && result.payment) {
    const p = result.payment;
    return `Recorded the GST payment for ${p.period}: ${money(p.cash.total)} in cash${p.interest > 0 ? `, interest ${money(p.interest)}` : ''}${p.lateFee > 0 ? `, late fee ${money(p.lateFee)}` : ''}, with ${money(p.creditUsed)} of input credit set off${p.cpin ? ` (CPIN ${p.cpin})` : ''}. Record the GSTR-3B filing with its ARN once filed.`;
  }
  if (name === 'list_gst_payments' && result.data) {
    const rows = result.data.payments;
    return rows.length ? `GST payments recorded:\n${rows.map((r) => `· ${r.period}: ${money(r.cashTotal)} on ${r.date}${r.cpin ? `, CPIN ${r.cpin}` : ''}${r.late ? ' (after the due date)' : ''}`).join('\n')}` : 'No GST payment is recorded yet. Say "paid GST for September, CPIN 12345678901234".';
  }
  if (name === 'gstr9_draft' && result.data) return gstr9Words(result.data, money);
  if (name === 'week_ahead' && result.data) return weekAheadWords(result.data, money);
  if (name === 'close_year' && result.closing) {
    const c = result.closing;
    return `Closed ${c.year}: income ${money(c.income)}, expenses ${money(c.expenses)}, ${c.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(c.profit))} moved to capital. The books are locked through ${c.to}.`;
  }
  if (name === 'list_year_closings' && result.data) {
    const rows = result.data.closings;
    return rows.length ? `Closed years:\n${rows.map((c) => `· ${c.year}: income ${money(c.income)}, expenses ${money(c.expenses)}, ${c.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(c.profit))}, closed on ${c.closedOn}`).join('\n')}` : `No year is closed yet. Say "close the year ${result.data.nextYear}" once your CA has signed off that year.`;
  }
  if (name === 'export_gstr1_quarter' && result.data) return `Quarterly GSTR-1 for ${result.data.quarter}: ${result.data.invoices === 1 ? '1 invoice' : `${result.data.invoices} invoices`} over ${result.data.months.join(', ')}; B2B ${result.data.b2b.length}, B2CL ${result.data.b2cl.length}, B2CS ${result.data.b2cs.length}${result.data.held?.length ? `, ${result.data.held.length} held back` : ''}. Saved as ${result.data.fileName} from the Taxes screen. ${result.data.note}`;
  if (name === 'export_iff' && result.data) return `IFF for ${result.data.period}: ${result.data.invoices === 1 ? '1 B2B invoice' : `${result.data.invoices} B2B invoices`}${result.data.held?.length ? `, ${result.data.held.length} held back` : ''}. Saved as ${result.data.fileName} from the Taxes screen. ${result.data.note}`;
  if (name === 'salary_annexure' && result.data) return annexureWords(result.data, money);
  if (name === 'tds_certificates' && result.data) return certificateWords(result.data, money);
  if (name === 'import_pos_sales' && result.data?.created) return posImportWords(result.data, money);
  if (name === 'import_settlement' && result.data?.settlement) return `Recorded ${result.data.settlement.id}. ${settlementWords(result.data.settlement, money)}${result.data.posting?.posted ? ` Settled ${result.data.posting.posting.receipts.length === 1 ? '1 invoice' : `${result.data.posting.posting.receipts.length} invoices`}: ${money(result.data.posting.posting.paid)} to the bank, fees ${money(result.data.posting.posting.fees)}, TDS ${money(result.data.posting.posting.tds)} and TCS ${money(result.data.posting.posting.tcs)} to claim${result.data.posting.posting.leftOpen > 0 ? `, ${money(result.data.posting.posting.leftOpen)} still outstanding` : ''}.` : result.data.posting?.error ? ` Not settled against the books: ${result.data.posting.error}.` : ''}`;
  if (name === 'import_marketplace_orders' && result.data?.created) return orderImportWords(result.data, money);
  if (name === 'set_channel_identity' && result.identity) return `${result.channel[0].toUpperCase()}${result.channel.slice(1)}: ${[result.identity.gstin ? `GSTIN ${result.identity.gstin}` : '', result.identity.tan ? `TAN ${result.identity.tan}` : '', result.identity.name || ''].filter(Boolean).join(', ')}. Statements now match this channel by number.`;
  if (name === 'import_tcs_statement' && result.data) return `Recorded ${result.data.imported === 1 ? '1 operator-month' : `${result.data.imported} operator-months`} of TCS totalling ${money(result.data.total)}.${result.data.unknownOperators.length ? ` ${result.data.unknownOperators.length === 1 ? 'One operator GSTIN is' : `${result.data.unknownOperators.length} operator GSTINs are`} not tied to a channel yet: ${result.data.unknownOperators.join(', ')}.` : ''} The next GST payment uses the confirmed TCS before new cash.`;
  if (name === 'import_26as_credits' && result.data) return `Recorded ${result.data.imported === 1 ? '1 entry' : `${result.data.imported} entries`} of TDS under 194-O totalling ${money(result.data.total)}${result.data.otherSections ? ` (${result.data.otherSections} rows under other sections ignored)` : ''}.`;
  if (name === 'marketplace_credits' && result.data) return creditsWords(result.data, money);
  if (name === 'set_sku_cost' && result.sku) return `${result.sku}${result.name ? ` (${result.name})` : ''}: cost ${money(result.cost)} per unit${result.before?.cost != null && result.before.cost !== result.cost ? ` (was ${money(result.before.cost)})` : ''}. Margins use it from now.`;
  if (name === 'import_sku_costs' && result.data) return `Recorded costs for ${result.data.updated === 1 ? '1 SKU' : `${result.data.updated} SKUs`}${result.data.held.length ? `; ${result.data.held.length} rows held back` : ''}.`;
  if (name === 'record_stock' && result.move) return `${result.move.qty > 0 ? `Added ${result.move.qty}` : `Removed ${-result.move.qty}`} of ${result.move.sku} at ${result.move.location}; now ${result.onHand} there.`;
  if (name === 'stock_position' && result.data) return stockWords(result.data, money);
  if (name === 'stock_moves' && result.data) return stockMovesWords(result.data);
  if (name === 'value_inventory' && result.valuation) return valuationWords(result, money);
  if (name === 'channel_connectors' && result.data) return connectorsWords(result.data);
  if (['save_gstr1_portal', 'file_gstr1_portal', 'generate_tds_fvu'].includes(name) && result.data) return portalWords(name, result.data);
  if (name === 'portal_status' && result.data) return portalWords(name, result);
  if (name === 'ask_knowledge') return knowledgeWords(result);
  if (name === 'fetch_channel_report' && result.data?.channel) return fetchWords(result.data);
  if (name === 'push_zoho_invoices' && result.data?.period) return zohoPushWords(result.data);
  if (name === 'sync_channels' && result.data) return result.data.results.length ? `Fetched ${result.data.fetched} ${result.data.fetched === 1 ? 'report' : 'reports'}: ${result.data.results.map((r) => `${r.channel} ${r.kind} ${r.ok ? (r.empty ? 'empty' : `${r.rows} rows`) : r.error}`).join('; ')}.` : 'No channel is connected yet. Say "channel connectors" to see which can be.';
  if (name === 'set_channel_connector' && result.data?.channel) return `${result.data.title}: ${result.data.configured ? 'connected' : 'saved, but a field is still missing'}${result.data.enabled === false ? ', paused' : ''}. Fetching runs when live calls are on; until then "pull amazon settlement" is a dry run.`;
  if (name === 'inventory_valuations' && result.data) return valuationsWords(result.data, money);
  if (name === 'sku_margins' && result.data) return marginsWords(result.data, money);
  if (name === 'daily_close' && result.data) return closeWords(result.data, money);
  if (name === 'registrations' && result.data) return registrationsWords(result.data);
  if (name === 'set_registration' && result.registration) return `${result.updated ? 'Updated' : 'Added'} ${result.registration.label} ${result.registration.gstin} (${result.registration.kind}, state ${result.registration.state}) from ${result.registration.effectiveFrom}. Invoices and bills can name it with registrationGstin; returns and filings take gstin.`;
  if (name === 'retire_registration' && result.registration) return `Retired ${result.registration.label} ${result.registration.gstin} from ${result.registration.effectiveTo}. Its past documents and returns stay.`;
  if (name === 'record_stock_transfer' && result.invoice) return stockTransferWords(result, money);
  if (name === 'settlement_status' && result.data) return settlementStatusWords(result.data, money);
  if (name === 'contractor_1099_file' && result.data) return file1099Words(result.data, money);
  if (name === 'export_trial_balance' && result.data) return `Trial balance as of ${result.data.asOf}: ${result.data.accounts === 1 ? '1 account' : `${result.data.accounts} accounts`}, debits ${money(result.data.debit)}, credits ${money(result.data.credit)}${result.data.balanced ? ', ties' : ', does not tie'}. Saved as ${result.data.fileName} from the Taxes screen.`;
  if (name === 'export_xlsx' && result.data) return `Saved ${result.data.fileName} with ${result.data.rows === 1 ? '1 row' : `${result.data.rows} rows`}${result.data.sheets.length > 1 ? ` on ${result.data.sheets.length} sheets` : ''}. Open it in Excel or send it to your CA.`;
  if (name === 'audit_trail' && result.data) return auditTrailWords(result.data);
  if (name === 'import_us_invoices' && result.data?.created) return usImportWords(result.data, money);
  if ((name === 'schedule_c_summary' || name === 'estimated_tax_dates') && result.data) return ownerTaxWords(name, result.data, money);
  if (name === 'set_suta_rate' && result.rate) {
    const r = result.rate;
    return `Recorded state unemployment for ${r.state}: ${r.ratePercent}% on the first ${money(r.wageBase)} of wages from ${r.from}.`;
  }
  if (name === 'list_suta_rates' && result.data) {
    const rows = result.data.rates;
    return rows.length ? `State unemployment rates:\n${rows.map((r) => `· ${r.state}: ${r.ratePercent}% up to ${money(r.wageBase)} from ${r.from}`).join('\n')}` : 'No state unemployment rate is recorded. Say, for example, "SUTA rate TX 2.7% up to 9000".';
  }
  if (name === 'set_withholding' && result.employee) {
    const e = result.employee;
    return `Recorded for ${e.name}: federal withholding ${money(e.federalWithholding)} a month${e.stateWithholding > 0 ? `, state ${money(e.stateWithholding)}` : ''}${e.workState ? `, works in ${e.workState}` : ''}.`;
  }
  if (name === 'us_payroll_filings' && result.data) {
    const d = result.data;
    const rows = d.quarters.filter((q) => q.months > 0).map((q) => `· ${q.quarter}: wages ${money(q.wages)}, federal withholding ${money(q.federalWithholding)}, Social Security tax ${money(q.socialSecurityTax)}, Medicare tax ${money(q.medicareTax)}, total ${money(q.totalTaxes)}${q.dueDate ? `, Form 941 due ${q.dueDate}` : ''}${q.filed ? ' (filed)' : ''}`);
    return [`Payroll filings for ${d.year}:`, ...(rows.length ? rows : ['· No approved payroll month yet.']), `· W-2s for ${d.w2.length === 1 ? '1 employee' : `${d.w2.length} employees`}${d.w2DueDate ? `, due ${d.w2DueDate}` : ''}; FUTA for the year ${money(d.futa.total)}.`, d.notes.join(' ')].join('\n');
  }
  if (name === 'set_sales_tax_nexus' && result.nexus) {
    return `Recorded: you collect sales tax in ${result.nexus.state} and file ${result.nexus.frequency} from ${result.nexus.from}. Say "sales tax return ${result.nexus.state}" to see a period.`;
  }
  if (name === 'list_sales_tax_nexus' && result.data) {
    const rows = result.data.states;
    return rows.length ? `You collect sales tax in:\n${rows.map((r) => `· ${r.state}, filed ${r.frequency} from ${r.from}${r.permitNo ? `, permit ${r.permitNo}` : ''}`).join('\n')}` : 'No state is recorded yet. Say, for example, "I collect sales tax in TX, quarterly".';
  }
  if ((name === 'sales_tax_return' || name === 'sales_tax_overview') && result.data && name === 'sales_tax_return') {
    const d = result.data;
    const head = `Sales tax return ${d.state} for ${d.period} (${d.from} to ${d.to})${d.dueDate ? `, due ${d.dueDate}` : ''}:`;
    const lines = [
      `· Gross sales ${money(d.grossSales)} on ${d.invoices === 1 ? '1 invoice' : `${d.invoices} invoices`}`,
      ...(d.exemptSales > 0 ? [`· Exempt ${money(d.exemptSales)}`] : []),
      ...(d.nonTaxableSales > 0 ? [`· Non-taxable ${money(d.nonTaxableSales)}`] : []),
      `· Taxable ${money(d.taxableSales)}`,
      ...d.byJurisdiction.map((r) => `· ${r.name} (${r.code}) at ${r.ratePercent}%: ${money(r.tax)}`),
      `· Tax collected ${money(d.taxCollected)}${d.paid > 0 ? `, paid ${money(d.paid)}` : ''}, to pay ${money(d.toPay)}`,
      d.filed ? `· Filed on ${d.filed.filedOn}, confirmation ${d.filed.confirmation}` : d.approved ? '· Approved, not yet recorded as filed' : '· Not yet reviewed; say "review sales tax ${d.state}"',
    ];
    return [head, ...lines, ...(d.notes.length ? [d.notes.join(' ')] : [])].join('\n');
  }
  if (name === 'sales_tax_overview' && result.data) {
    const rows = result.data.states;
    if (!rows.length) return 'No state is recorded yet. Say, for example, "I collect sales tax in TX, quarterly".';
    return rows.map((r) => `${r.state} (${r.frequency}): ${r.lastPeriod ? `${r.lastPeriod.period} collected ${money(r.lastPeriod.taxCollected)}, to pay ${money(r.lastPeriod.toPay)}${r.lastPeriod.dueDate ? `, due ${r.lastPeriod.dueDate}` : ''}${r.lastPeriod.filed ? ', filed' : r.lastPeriod.approved ? ', approved' : ''}` : 'no period yet'}${r.overdue ? ' — overdue' : ''}`).join('\n');
  }
  if (name === 'sales_tax_review_answer' && result.review) {
    const review = result.review;
    if (result.approved) return `Approved the ${review.month} sales tax return. Nothing has been filed. ${review.toPay > 0 ? `${money(review.toPay)} is to pay with it.` : ''}File it on the state portal, or send it to your CPA, and record the confirmation.`;
    if (result.answer === 'wrong') return 'Noted that it is not right. Fix the entries; the review starts again from that step when the figures change.';
    const next = review.steps.find((step) => step.id === review.next);
    return next ? `Confirmed. Next: ${next.title}. Say "review sales tax ${review.state}" to see it.` : 'Confirmed.';
  }
  if (name === 'record_sales_tax_payment' && result.payment) {
    const p = result.payment;
    return `Recorded ${money(p.amount)} of sales tax paid to ${p.state} for ${p.period} on ${p.date}.${result.left > 0.005 ? ` ${money(result.left)} is still to pay.` : ' Nothing is left to pay for that period.'}`;
  }
  if (name === 'record_sales_tax_filing' && result.filing) {
    const f = result.filing;
    return `Recorded the ${f.label} for ${f.period} as filed on ${f.filedOn}, confirmation ${f.arn}.${f.late ? ` It was due by ${f.dueDate}.` : ''}`;
  }
  if (name === 'set_transport' && result.transport) {
    return `Recorded transport for ${result.invoiceId}: ${transportWords(result.transport)}.${result.need?.needed ? ` ${result.need.why}` : ''}`;
  }
  if (name === 'set_party_address' && result.data?.party) {
    return `Recorded the address of ${result.data.party.name}: ${result.data.party.address}. It prints on their invoices from now on.`;
  }
  if (name === 'eway_bill_status' && result.data) {
    const s = result.data;
    return s.ewbNo ? `E-way bill ${s.ewbNo}${s.ewbValidity ? `, valid till ${s.ewbValidity}` : ''}.` : `${s.why}${s.needed && s.transport ? ` Transport: ${transportWords(s.transport)}.` : ''}${s.needed && !s.transport ? ' Say the transport details, for example "transport for INV-0001: vehicle MH12AB1234, 120 km, transporter ABC Logistics".' : ''}`;
  }
  if (name === 'set_tds_deductor' && result.tan) {
    return `Done. This business deducts TDS under TAN ${result.tan}.`;
  }
  if (name === 'record_tds_deposit' && result.deposit) {
    const d = result.deposit;
    return `Recorded the TDS deposit of ${money(d.amount)} on ${d.date}, challan ${d.challan}.${result.left > 0.005 ? ` ${money(result.left)} is still to deposit.` : ' Nothing is left to deposit.'}`;
  }
  if (name === 'tds_summary' && result.data) {
    const d = result.data;
    if (!d.deductor) return 'This business is not set up to deduct TDS. Say "we deduct TDS, TAN" followed by your TAN to start.';
    const months = d.months.map((m) => `· ${m.month}: deducted ${money(m.deducted)}${m.depositBy ? `, deposit by ${m.depositBy}` : ''}`).join('\n');
    return `TDS deducted ${money(d.deducted)}, deposited ${money(d.deposited)}, still to deposit ${money(d.due)}.${months ? `\n${months}` : ''}`;
  }
  if (name === 'payroll_run' && result.data) {
    if (result.data.country === 'US') return usPayrollWords(result.data, money);
    return payrollWords(result.data, money);
  }
  if (name === 'approve_payroll' && result.run) {
    const r = result.run;
    return `Approved payroll for ${r.month}: ${money(r.totals.gross)} gross, ${money(r.totals.net)} net to pay. Nothing is paid yet; say "paid salaries for ${r.period}" once they are.`;
  }
  if (name === 'record_salary_payment' && result.paidOn) {
    return `Recorded ${money(result.amount)} of salaries for ${result.period} paid from ${result.mode === 'cash' ? 'cash' : 'the bank'} on ${result.paidOn}.`;
  }
  if (name === 'list_payroll' && result.data) {
    const rows = result.data.runs;
    return rows.length
      ? `Payroll months:\n${rows.map((r) => `· ${r.month}: ${r.employees === 1 ? '1 employee' : `${r.employees} employees`}, gross ${money(r.gross)}, net ${money(r.net)}${r.paidOn ? `, paid ${r.paidOn}` : ', not yet paid'}`).join('\n')}`
      : 'No payroll has been approved yet. Say "run payroll" to see this month.';
  }
  if (name === 'payslip' && result.data) {
    const p = result.data;
    return `Payslip for ${p.employee.name}, ${p.month}: gross ${money(p.gross)}, deductions ${money(p.totalDeductions)}, net ${money(p.net)}${p.paidOn ? `, paid on ${p.paidOn}` : ''}.`;
  }
  if (name === 'add_employee' && result.employee) {
    const e = result.employee;
    return `Added ${e.name} as ${e.id}, at ${money(e.salary[0].monthly)} a month from ${e.joinedOn}. No payroll has been run.`;
  }
  if (name === 'change_salary' && result.salary) {
    return `${result.employee.name} is at ${money(result.salary.monthly)} a month from ${result.salary.from}.`;
  }
  if (name === 'end_employment' && result.employee) {
    return `Recorded that ${result.employee.name} left on ${result.employee.leftOn}.`;
  }
  if (name === 'list_employees' && result.data) {
    const rows = result.data.employees;
    return rows.length
      ? `${rows.length === 1 ? '1 employee' : `${rows.length} employees`}, ${money(result.data.monthlyTotal)} a month before deductions:\n${rows.map((e) => `· ${e.id} ${e.name}${e.designation ? `, ${e.designation}` : ''}: ${money(e.monthly)}`).join('\n')}`
      : 'No employees yet. Say, for example, "add employee Ravi Kumar joined 2026-09-01 salary 25000".';
  }
  if (name === 'record_supplier_reminder' && result.reminder) {
    const r = result.reminder;
    return `Reminder ${r.id} to ${r.supplier} for ${r.period} is ready to send from your phone. Nothing has gone from MyCA.`;
  }
  if (name === 'collection_drafts' && result.data) return collectionsInWords(result.data);
  if (name === 'payment_run' && result.data) return paymentRunInWords(result.data, money);
  if (name === 'weekly_brief' && result.data) return weeklyBriefWords(result.data, money);
  if (name === 'month_close' && result.data) return monthCloseWords(result.data, money);
  if (name === 'restock_plan' && result.data) return restockWords(result.data, money);
  if (name === 'advance_tax' && result.data) return advanceTaxWords(result.data, money);
  if (name === 'supplier_payout_file' && result.data) return supplierPayoutWords(result.data, money);
  if (name === 'push_tally' && result.push) return tallyPushWords(result, money);
  if (name === 'import_payroll_summary' && result.data) return payrollImportWords(result, money);
  if (name.startsWith('track1099_') && result.data && track1099Words(name, result, money)) return track1099Words(name, result, money);
  if ((name === 'dsc_certificates' || name === 'dsc_sign') && dscWords(name, result)) return dscWords(name, result);
  if (name === 'suggest_expense_head' && result.headName) return `${result.why} Say "record the expense" with the amount to post it.`;
  if (name === 'attach_document' && result.id) return `The document is kept with ${result.kind} ${result.id}${result.replaced ? ', replacing the earlier one' : ''}. Nothing was posted.`;
  if (name === 'save_report' && result.report) return `Saved "${result.report.name}"${result.replaced ? ' (replacing the earlier one)' : ''}. Say "run report ${result.report.name}" any time.\n${reportWords('', result.result, money)}`;
  if (name === 'run_report' && result.result) return reportWords(result.name, result.result, money);
  if (name === 'list_reports' && result.reports) return result.reports.length ? `Saved reports:\n${result.reports.map((r) => `· ${r.name}: ${r.metric}${r.groupBy !== 'none' ? ` by ${r.groupBy}` : ''}, ${r.period}${r.compare ? ', compared with the period before' : ''}`).join('\n')}\nSay "run report <name>".` : 'No saved reports yet. Say "save report Top customers: sales by customer this month vs last month".';
  if (name === 'delete_report' && result.name) return `Deleted the saved report "${result.name}".`;
  if (name === 'set_supplier_bank' && result.bank) return `${result.supplier} is paid to ${[result.bank.account ? `account ${result.bank.account} at ${result.bank.ifsc}` : '', result.bank.upi ? `UPI ${result.bank.upi}` : ''].filter(Boolean).join(', ')}${result.changed ? ' (changed from the earlier details)' : ''}. Confirm it on the phone number you have on file before the first payment.`;
  if (name === 'record_advance_tax' && result.payment) return `Recorded advance tax ${result.payment.id}: ${money(result.payment.amount)} for ${result.payment.fy} on ${result.payment.date}${result.payment.challan ? `, challan ${result.payment.challan}` : ''}.`;
  if (name === 'set_sku_supply' && result.supply) return `${result.sku}: ${result.supply.supplier || 'no supplier named'}, lead time ${result.supply.leadDays} days, pack of ${result.supply.pack}, minimum order ${result.supply.moq}.`;
  if (name === 'record_purchase_order' && result.order) return `Recorded ${result.order.id} to ${result.order.supplier}: ${result.order.lines.map((l) => `${l.sku} x ${l.qty}`).join(', ')}${result.order.total != null ? ` for ${money(result.order.total)}` : ''}, expected ${result.order.expectedOn}. Nothing is posted to the ledger.`;
  if (name === 'month_close_approve' && result.period) return `${result.month} is closed as of ${result.on}; the books are locked through ${result.lockThrough}.${result.openItems.length ? ` Open items kept with the close: ${result.openItems.join(', ')}.` : ''}`;
  if (name === 'record_payment_run' && result.posted) return `Paid ${money(result.total)} across ${result.posted.length === 1 ? '1 bill' : `${result.posted.length} bills`} from ${result.mode === 'cash' ? 'cash' : 'the bank'} on ${result.date}: ${result.posted.map((p) => `${p.supplier} ${money(p.amount)} (${p.billId})`).join('; ')}. Bank and cash now ${money(result.after)}.`;
  if (name === 'record_collection_reminder' && result.reminder) return `Recorded the ${result.reminder.tone} reminder to ${result.reminder.customer} for ${money(result.reminder.total)} on ${result.reminder.date}. Send it from your phone now; I will remind you to check for the payment in a week.`;
  if (name === 'supplier_reminder_draft' && result.data) {
    return result.data.message;
  }
  if (name === 'list_filings' && result.data) {
    return result.data.length
      ? `Recorded as filed:\n${result.data.slice(0, 12).map((f) => `· ${f.label} for ${f.period}: ${f.filedOn}, ARN ${f.arn}${f.late ? ' (after the due date)' : ''}`).join('\n')}`
      : 'No filing is recorded yet. When a return is filed, say so with its ARN, for example "filed GSTR-1 for September, ARN AA2909261234567".';
  }
  if (name === 'record_filing' && result.filing) {
    const f = result.filing;
    return `Recorded ${f.label} for ${f.period} as filed on ${f.filedOn}, ARN ${f.arn}.${f.late ? ` That was after its due date of ${f.dueDate}.` : ''} MyCA did not file anything.`;
  }
  if (name === 'record_payment' && result.bill) {
    const b = result.bill;
    return `Paid ${b.partyName} ${money(result.payment.amount)} against ${b.id} by ${result.payment.mode} on ${result.payment.date}. ${result.remaining > 0.005 ? `${money(result.remaining)} is still owed on it.` : `${b.id} is paid in full.`}`;
  }
  if (name === 'create_purchase' && result.invoice) {
    const i = result.invoice;
    return `Booked ${i.id} from ${i.partyName} for ${money(i.total)}${i.itcEligible === false ? '. The GST on it cannot be claimed, so it is part of the cost.' : `, with ${money(i.cgst + i.sgst + i.igst)} of GST counted as input credit.`}${i.tds?.amount ? ` ${money(i.tds.amount)} TDS under ${i.tds.section} is held back, so ${money(i.total - i.tds.amount)} is owed to ${i.partyName}.` : ''}`;
  }
  if (name === 'filing_pack') {
    return `Filing pack ${d.period || ''} for ${d.gstin}. GSTR-1 taxable ${money(d.gstr1?.totalTaxable)}. GST payable ${money(d.payable)}. ${d.caveat}`;
  }
  if (name === 'trial_balance') {
    const rows = (d.rows || []).map((r) => `${r.code}  ${String(r.name).padEnd(28)}  Dr ${money(r.debitsPosted)}  Cr ${money(r.creditsPosted)}`).join('\n');
    return `Trial balance ${d.balanced ? 'ties' : 'DOES NOT TIE'}.\nDr ${money(d.debit)}   Cr ${money(d.credit)}\n\n${rows}`;
  }
  if (name === 'gst_payable') {
    return `GST output ${money(d.output)} − input ${money(d.input)} = payable ${money(d.payable)}.`;
  }
  if (name === 'list_invoices') {
    const list = (Array.isArray(d) ? d : []).map((i) => `${i.id}  ${i.date}  ${i.partyName}  ${money(i.total)}  ${i.status}`).join('\n');
    return list || 'No invoices yet.';
  }
  if (name === 'export_gstr1_json') {
    return `GSTR-1 JSON gstin ${d.gstin} fp ${d.fp}. B2B ${d.b2b?.length || 0} parties, B2CS ${d.b2cs?.length || 0} rows. ${d.caveat}`;
  }
  if (name === 'import_tally_xml') {
    return `Tally XML: ${d.converted?.count ?? 0} vouchers → ${d.ledger?.posted ?? 0} ledger posts.`;
  }
  if (name === 'prepare_gstr1') {
    const g = d.gstr1;
    if (!g) return JSON.stringify(d);
    const held = gstr1HeldWords(g.errors);
    return `GSTR-1 ${g.period || ''} taxable ${money(g.totalTaxable)}. B2B ${g.tables.b2b.length}, B2CL ${g.tables.b2cl.length}, B2CS ${g.tables.b2cs.length}. E-invoice issues: ${g.errors.length}.${held}`;
  }
  if (name === 'deadlines') {
    const next = (d.deadlines || []).slice().sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).slice(0, 8);
    return next.map((x) => `${x.returnType} ${x.period} due ${x.dueDate} (${x.level || x.escalation || ''})`).join('\n') || 'No deadlines.';
  }
  if (name === 'audit_books') {
    if (!d.summary) return result.error || JSON.stringify(d);
    const s = d.summary;
    const top = (d.flags || []).slice(0, 6).map((f) => `· ${f.date} ${f.party || ''} ${money(f.amount)}: ${f.why}`).join('\n');
    return `Audited ${s.population} entries from ${d.source || 'the ledger'}: ${s.flags === 0 ? 'nothing flagged' : `${s.flags} ${s.flags === 1 ? 'flag' : 'flags'} (high ${s.high}, medium ${s.medium}, low ${s.low})`}.${top ? `\n${top}` : ''}${(d.flags || []).length > 6 ? `\n… and ${d.flags.length - 6} more.` : ''}`;
  }
  if (name === 'prepare_gstr3b' && d.outward) {
    const o = d.outward;
    const t = o.totals || {};
    const itc = d.itc || {};
    const lines = (o.rows3a || []).map((r) => `· ${r.rate}% ${r.interState ? 'inter-state' : 'within the state'}: taxable ${money(r.taxable)}, ${r.interState ? `IGST ${money(r.igst)}` : `CGST ${money(r.cgst)} + SGST ${money(r.sgst)}`}`);
    const notes = o.creditNotes?.count ? `\nCredit notes netted: ${o.creditNotes.count} for ${money(o.creditNotes.taxable)} taxable.` : '';
    return `GSTR-3B ${d.period}${d.gstin ? ` (${d.gstin})` : ''}\nOutward (3.1): taxable ${money((t.interTaxable || 0) + (t.intraTaxable || 0))}; IGST ${money(t.interIgst)}, CGST ${money(t.intraCgst)}, SGST ${money(t.intraSgst)}.${lines.length ? `\n${lines.join('\n')}` : ''}${notes}\nITC (4A): IGST ${money(itc.available?.igst)}, CGST ${money(itc.available?.cgst)}, SGST ${money(itc.available?.sgst)}; ineligible ${money((itc.ineligible?.igst || 0) + (itc.ineligible?.cgst || 0) + (itc.ineligible?.sgst || 0))}; net ${money(itc.netItc)}.\nSay "gst payable for ${d.periods?.[0] || ''}" for the cash and credit split.${(d.missingHsn || []).length ? `\n${d.missingHsn.join(', ')} ${d.missingHsn.length === 1 ? 'has' : 'have'} no HSN code: the tax is counted here, but GSTR-1 leaves ${d.missingHsn.length === 1 ? 'it' : 'them'} out until the code is added.` : ''}`;
  }
  if (name === 'monitor_tds') {
    const rows = Array.isArray(d) ? d : d.flags || d.rows || [];
    if (!rows.length) return 'No payments file is attached, and nothing crossed a TDS threshold in it. TDS on the bills and expenses you post here is deducted at posting (say "tds statement" for the quarter); attach a payments CSV as "payments" to scan an outside list.';
    return `${rows.length} ${rows.length === 1 ? 'payment' : 'payments'} crossed a TDS threshold:\n${rows.slice(0, 10).map((r) => `· ${r.party || r.vendor || ''} ${r.section || ''} ${money(r.amount || r.total || 0)}${r.why ? `: ${r.why}` : ''}`).join('\n')}`;
  }
  if (name === 'import_bank' && d.aa) {
    const accounts = (d.aa.accounts || []).map((a) => `${a.maskedAccNumber || 'account'}${a.fipId ? ` at ${a.fipId}` : ''}`).join(', ');
    return `Account Aggregator data brought in${accounts ? ` for ${accounts}` : ''}: ${d.rows?.length ?? 0} ${(d.rows?.length ?? 0) === 1 ? 'transaction' : 'transactions'} read, ${d.ledger?.posted ?? 0} posted to your books${d.aa.skipped ? `, ${d.aa.skipped} without a date or amount skipped` : ''}.`;
  }
  if (name === 'import_tally' || name === 'import_bank') {
    return `${name === 'import_bank' ? 'Bank statement' : name === 'import_tally' ? 'Tally data' : 'File'} brought in: ${d.rows?.length ?? 0} ${(d.rows?.length ?? 0) === 1 ? 'row' : 'rows'} read, ${d.ledger?.posted ?? 0} posted to your books.${name === 'import_bank' ? bankLinesWords(d.lines) : ''}`;
  }
  if (name === 'govt_probe') {
    if (d.ok === false) return `Govt probe not run: ${d.error}${d.hint ? `
${d.hint}` : ''}`;
    return `Reached ${d.live}/${d.total} government hosts.\n${(d.hits || []).map((h) => `${h.id}  HTTP ${h.status || h.error}  ${h.ms}ms`).join('\n')}\n\n${d.note}`;
  }
  if (name === 'govt_nic_auth') {
    return d.ok ? `NIC auth OK (${d.env}).` : `NIC auth not complete: ${d.error || d.hint}\n${d.hint || ''}`;
  }
  if (name === 'govt_nic_mock') {
    if (!d.ok) return `Mock NIC failed: ${d.error}`;
    return `NIC Sandbox Mock: IRN generated for Doc ${d.payload?.DocDtls?.No}.\nIRN: ${d.irn}\nAck No: ${d.ackNo} (${d.ackDate})\nQR Code generated (${d.signedQrCode.slice(0, 32)}…).\n[Simulated NIC Session — No live NIC certificate required]`;
  }
  if (name === 'govt_generate_irn') {
    if (d.mock) {
      return `NIC Sandbox Mock: IRN generated for Doc ${d.payload?.DocDtls?.No}.\nIRN: ${d.irn}\nAck No: ${d.ackNo} (${d.ackDate})\n[Simulated NIC Session]`;
    }
    return d.ok ? `IRN issued for payload Doc ${d.payload?.DocDtls?.No}.` : `IRN not issued: ${d.error || JSON.stringify(d.nic || d.auth).slice(0, 500)}`;
  }
  if (name === 'integration_readiness') {
    const topMissing = (d.rows || []).filter((row) => row.status === 'missing').slice(0, 6).map((row) => row.title).join(', ');
    const ids = (d.missingRequirementIds || []).slice(0, 6).join(', ');
    return `API readiness: ${d.available}/${d.total} connected. Must-have missing: ${d.mustHaveMissing.length}. ${d.next}${ids ? `\nMissing IDs: ${ids}.` : ''}${topMissing ? `\nMissing next: ${topMissing}.` : ''}`;
  }
  if (name === 'integration_connect') {
    return `Connected ${d.connection.requirementId} (${d.connection.id}) via ${d.connection.provider}. API readiness is now ${d.readiness.available}/${d.readiness.total}.`;
  }
  if (name === 'integration_disconnect') {
    return `Disconnected ${d.requirementId}. API readiness is now ${d.readiness.available}/${d.readiness.total}.`;
  }
  if (name === 'provider_catalog') {
    const rows = (d.requirements || []).map((req) => {
      const owners = (req.existingOwners || []).slice(0, 3).join(', ');
      return `${req.requirementId}: ${req.capability}\n  owners: ${owners}`;
    }).join('\n');
    return `${d.name} provider map (${d.posture}).\nDocs: ${d.docsUrl}\n${rows}\n\nAdapters must wrap these existing owners; they must not duplicate filing or reconciliation logic.`;
  }
  if (name === 'sandbox_adapter_plan') {
    const rows = (d.operations || []).map((operation) => {
      const gate = operation.caApprovalRequired ? 'CA approval required' : 'read/prepare allowed';
      const tools = operation.mapsToTools?.length ? operation.mapsToTools.join(', ') : 'provider session/audit only';
      return `${operation.operationId} (${operation.requirementId}): ${operation.title}\n  ${gate}; tools: ${tools}; owners: ${operation.ownerModules.join(', ')}`;
    }).join('\n');
    return `Sandbox adapter plan: ${d.operations.length} operation(s). No external API call was made.\n${rows}`;
  }
  if (name === 'sandbox_operation') {
    if (!d.ok) return `Sandbox ${d.operationId || 'operation'} not run: ${d.error}${d.hint ? ` ${d.hint}` : ''}`;
    return `Sandbox ${d.operationId} (${d.requirementId}) completed.\n${JSON.stringify(d.data).slice(0, 500)}`;
  }
  if (name === 'approval_request') {
    return `Approval ${d.approval.approvalId} opened for ${d.approval.operationId} (pending). A reviewer must approve it before it can authorise a live operation.`;
  }
  if (name === 'approval_decide') {
    return `Approval ${d.approval.approvalId} ${d.approval.status} by ${d.approval.decidedBy}.`;
  }
  if (name === 'approval_list') {
    const rows = (d.approvals || []).map((a) => `${a.approvalId}  ${a.operationId}  ${a.status}`).join('\n');
    return rows || 'No approval requests.';
  }
  if (name === 'provider_doctor') {
    const rows = (d.providers || []).map((p) => {
      const state = p.configured ? 'configured' : 'missing';
      const reach = p.reachability?.status === 'ok' ? `reachable ${p.reachability.ms}ms` : (p.reachability?.status || '');
      const miss = p.missing?.length ? ` · missing: ${p.missing.join(', ')}` : '';
      return `${p.id} (${(p.requirements || []).join('/')}): ${state}${p.environment ? ` [${p.environment}]` : ''} ${reach}${miss}`;
    }).join('\n');
    return `Integration doctor — ${d.summary.configured}/${d.summary.providers} configured, ${d.summary.reachable} reachable. Live calls ${d.liveCallsEnabled ? 'ON' : 'off'}.\n${rows}`;
  }
  if (name === 'govt_set_public_key') {
    return d.ok ? `NIC public key loaded (${d.bits || '?'}-bit RSA).` : `Public key rejected: ${d.error}`;
  }
  if (name === 'test_notification') {
    return `Test ${d.message?.channel || 'notification'} → ${d.message?.status || 'queued'}${d.error ? ` (${d.error})` : ''}.`;
  }
  if (name === 'sandbox_status') {
    if (!d.configured) {
      return `Quicko Sandbox is NOT configured. Configure MYCA_GSP_API_KEY and MYCA_GSP_API_SECRET in platform/.env.`;
    }
    if (d.error === 'LIVE_CALLS_DISABLED') {
      return `Quicko Sandbox is configured (${d.baseUrl}) but live outbound calls are disabled. ${d.hint}`;
    }
    if (d.ok) {
      const env = d.environment === 'live' ? 'LIVE' : 'TEST';
      const warn = d.environment === 'live'
        ? ''
        : '\nNote: Sandbox TEST environment — responses are provider fixtures, not real taxpayer data.';
      return `Quicko Sandbox API connected — ${env} (${d.baseUrl}) in ${d.ms}ms via ${d.keySource}.${warn}`;
    }
    return `Quicko Sandbox connection failed: ${d.error || 'Unknown error'} (${d.ms}ms).`;
  }
  if (name === 'sandbox_connect') {
    return `Connected Quicko Sandbox for ${d.connected.join(', ')}. API readiness is now ${d.readiness.available}/${d.readiness.total}.`;
  }
  if (name === 'nim_status') {
    if (!d.configured) {
      return `NVIDIA NIM: Not configured. Model target is ${d.model}. ${d.hint}`;
    }
    if (d.error === 'LIVE_CALLS_DISABLED') {
      return `NVIDIA NIM is configured (${d.model}) but live outbound calls are disabled. ${d.hint}`;
    }
    if (d.ok) {
      return `NVIDIA NIM connected (${d.model}) in ${d.ms}ms. Ready for free inference.`;
    }
    return `NVIDIA NIM connection check failed: ${d.error || 'Unknown error'}`;
  }
  if (name === 'nim_ask') {
    if (!d.ok) {
      return `NVIDIA NIM request failed: ${d.error}.\n${d.hint || ''}`;
    }
    return `[NVIDIA NIM · ${d.model}]\n${d.reply}`;
  }
  if (name === 'validate_gstin' || name === 'search_gstin') {
    if (!d.ok) {
      const errList = (d.errors || []).map((e) => (typeof e === 'object' ? (e.message || e.code || JSON.stringify(e)) : String(e))).join(', ');
      return `GSTIN ${d.gstin || ''} is INVALID: ${errList || 'checksum or format invalid'}.`;
    }
    const lines = [
      `GSTIN: ${d.gstin} (${d.stateName || d.stateCode}) — Check digit valid, PAN ${d.pan}.`,
    ];
    if (d.liveVerified) {
      lines.push(`Legal Name: ${d.legalName || 'N/A'}`);
      if (d.tradeName && d.tradeName !== d.legalName) lines.push(`Trade Name: ${d.tradeName}`);
      lines.push(`Status: ${d.status} | Type: ${d.taxpayerType || 'Regular'} | E-Invoice: ${d.eInvoiceStatus || 'N/A'}`);
      if (d.natureOfBusiness?.length) lines.push(`Nature of Business: ${d.natureOfBusiness.join(', ')}`);
      lines.push(`[Verified live via Quicko Sandbox]`);
    } else if (d.liveError) {
      lines.push(`[Offline check passed; live lookup: ${d.liveError}]`);
    } else if (d.liveReason) {
      lines.push(`[Offline check passed; ${d.liveReason}]`);
    }
    return lines.join('\n');
  }
  if (name === 'track_gst_returns') {
    if (!d.ok) return `Track GST returns failed: ${d.error || 'Unknown error'}${d.hint ? ` (${d.hint})` : ''}`;
    const rows = (d.returns || []).map((r) => `${String(r.rtntype || '').padEnd(8)} ${String(r.ret_prd || '').padEnd(8)} ${String(r.dof || '').padEnd(12)} ${String(r.arn || '').padEnd(18)} ${r.status || 'Filed'}`).join('\n');
    return `GST return track for ${d.gstin} (${d.financialYear || ''}) — ${d.count} filed return(s):\n${rows || 'No filed returns found.'}${d.mock ? '\n[Mock Data — Simulated Portal Session]' : ''}`;
  }
  if (name === 'govt_save_credentials') {
    return `Saved NIC credentials for ${d.gstin || '(no GSTIN)'} (${d.env}). Secrets are stored encrypted in the ${d.vault || 'local'} vault on this PC.`;
  }
  if (name === 'exceptions') {
    const s = d.summary || { count: 0, bySeverity: {}, moneyAtRisk: 0 };
    if (!s.count) return `Nothing needs attention in ${d.scope === 'firm' ? 'the firm' : d.clientId || 'these books'} as of ${d.asOfDate}.`;
    const counts = ['critical', 'high', 'medium', 'low'].filter((k) => s.bySeverity[k]).map((k) => `${s.bySeverity[k]} ${k}`).join(', ');
    const rows = (d.exceptions || []).slice(0, 12).map((e) => {
      const worth = e.moneyAtRisk ? `  ${money(e.moneyAtRisk)}` : '';
      return `${e.id}  ${String(e.severity).padEnd(8)}${e.clientId === 'SELF' ? '' : `${e.clientId}  `}${e.title}${worth}\n    ${e.why}`;
    }).join('\n');
    const more = (d.exceptions || []).length > 12 ? `\n… and ${d.exceptions.length - 12} more.` : '';
    return `${s.count} open (${counts}), ${money(s.moneyAtRisk)} at risk as of ${d.asOfDate}${d.reconciled ? ', including GSTR-2B findings' : ''}.\n\n${rows}${more}`;
  }
  if (name === 'exception_decide') {
    const e = d.exception;
    return `${e.id} is now ${e.status}${e.owner ? ` with ${e.owner}` : ''}. ${e.note || ''}`.trim();
  }
  if (name === 'company_profile') {
    return `${d.company.name}  GSTIN ${d.company.gstin}  FY ${d.company.fy}\nInvoices ${d.invoices} · purchases ${d.purchases ?? 0} · checksum ${d.chain.ok ? 'intact' : 'BROKEN'}.`;
  }
  if (name === 'journal') {
    const rows = (d.rows || []).map((r) => `${r.invoiceId || r.code || r.id}  Dr ${r.debitAccount}  Cr ${r.creditAccount}  ${money(r.amount)}${r.voided ? ' (voided)' : r.pending ? ' (pending)' : ''}`).join('\n');
    return `${d.count} ${d.count === 1 ? 'entry' : 'entries'} in the journal${d.rows?.length < d.count ? `, last ${d.rows.length}` : ''}:\n${rows || 'Nothing posted yet.'}`;
  }
  const text = outline(d);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…truncated` : text || 'Done.';
}

async function runPlanned(state, name, args, clearsPendingFile) {
  const runArgs = name === 'sandbox_operation' ? { ...args, actorId: 'assistant' } : args;
  const result = await runTool(state, name, runArgs);
  if (clearsPendingFile) state.pendingFile = null;
  return result;
}

function unreadableFile(error) {
  return { reply: `I could not read that file (${error}), so nothing was posted.`, tools: [], posted: false, blocked: true, error };
}

function holdForConfirmation(state, plan) {
  const resolved = resolveImportContent(state, plan.name, plan.args);
  if (!resolved.ok) return unreadableFile(resolved.error);
  const schemaCheck = validateAssistantToolCall(plan.name, resolved.args);
  if (!schemaCheck.ok) return { reply: notAccepted(schemaCheck.error), tools: [], blocked: true };
  const preview = previewOf(state, plan.name, resolved.args);
  if (preview.blockers.length) {
    clearPending(state);
    return { reply: blockedReply(preview), tools: [], posted: false, blocked: true, preview };
  }
  const pending = openPending(state, { ...plan, args: referenceImportContent(state, plan.name, plan.args) }, preview);
  return {
    reply: previewReply(preview, pending),
    tools: [],
    posted: false,
    awaitingConfirmation: true,
    preview: { token: pending.token, tool: pending.name, summary: preview.summary, effects: preview.effects, figures: preview.figures },
  };
}

// A form on the phone already knows the tool and its arguments, so it skips the
// text parser but not the preview: the same token must come back before anything posts.
function proposeCore(state, name, args = {}) {
  if (!needsConfirmation(name)) {
    return { reply: `${String(name)} is not an action that is previewed.`, tools: [], posted: false, blocked: true, error: 'NOT_PROPOSABLE' };
  }
  return holdForConfirmation(state, { name, args: args && typeof args === 'object' ? args : {} });
}

const NOTHING_PENDING = 'There is nothing waiting to be posted.';
const CONFIRM_TOKEN = /^[0-9a-f]{12}$/;

async function runConfirmation(state, decision) {
  const taken = takePending(state, decision);
  if (!taken.ok) {
    const why = taken.error === 'EXPIRED'
      ? 'That preview is more than ten minutes old, so I discarded it. Say it again if you still want it.'
      : taken.error === 'TOKEN_MISMATCH'
        ? 'That confirmation code does not match the preview I am holding, so I discarded it.'
        : NOTHING_PENDING;
    return { reply: why, tools: [], posted: false, error: taken.error };
  }
  const { pending } = taken;
  const resolved = resolveImportContent(state, pending.name, pending.args);
  if (!resolved.ok) return unreadableFile(resolved.error);
  const recheck = validateAssistantToolCall(pending.name, resolved.args);
  if (!recheck.ok) return { reply: notAccepted(recheck.error), tools: [], blocked: true };
  const result = await runPlanned(state, pending.name, resolved.args, pending.clearsPendingFile);
  const out = { reply: fmtToolResult(pending.name, result), tools: [{ name: pending.name, result }], posted: result.ok !== false, confirmed: true };
  state.lastConfirmation = { token: pending.token, tool: pending.name, reply: out.reply, posted: out.posted };
  return out;
}

// A phone on a poor connection will send the same confirmation twice. The second
// one must report what the first one did, not post again and not look like a failure.
async function confirmCore(state, token) {
  const code = String(token == null ? '' : token).trim().toLowerCase();
  if (!CONFIRM_TOKEN.test(code)) {
    return { reply: 'A confirmation needs the code from its preview.', tools: [], posted: false, error: 'TOKEN_REQUIRED' };
  }
  const last = state.lastConfirmation;
  if (last && last.token === code && state.pendingChatAction?.token !== code) {
    return { reply: last.reply, tools: [], posted: last.posted, confirmed: true, replayed: true };
  }
  return runConfirmation(state, { token: code });
}

function discardCore(state) {
  const pending = state.pendingChatAction;
  if (!pending) return { reply: NOTHING_PENDING, tools: [], posted: false };
  clearPending(state);
  return { reply: `Not posted: ${pending.summary || 'nothing was waiting'}`, tools: [], posted: false };
}

async function chatCore(state, message) {
  const plan = planEntryWithTds((text) => planLocalToolCall(state, text), message);
  if (plan.kind === 'reply') return { reply: plan.reply, tools: plan.tools || [], blocked: plan.blocked || false };

  if (plan.kind === 'cancel') return discardCore(state);

  if (plan.kind === 'confirm') return runConfirmation(state, plan.decision);

  if (plan.name === 'post_expense' && (plan.args.head == null || plan.args.head === '') && modelConfigured() && tagExpense(state, { description: plan.args.narration || plan.args.description, payee: plan.args.payee }).source === 'default') {
    const suggested = await suggestExpenseHead({ description: plan.args.narration || plan.args.description, payee: plan.args.payee });
    if (suggested.ok) plan.args = { ...plan.args, head: suggested.head, headSource: 'model', headWhy: suggested.why };
  }

  if (needsConfirmation(plan.name)) return holdForConfirmation(state, plan);

  const valid = validateAssistantToolCall(plan.name, plan.args);
  if (!valid.ok) return { reply: notAccepted(valid.error), tools: [], blocked: true };

  const runArgs = plan.name === 'sandbox_operation' ? { ...plan.args, actorId: 'assistant' } : plan.args;
  const result = await runTool(state, plan.name, runArgs);
  if (plan.clearsPendingFile) state.pendingFile = null;
  if (plan.name === 'print_invoice') {
    return {
      reply: result.ok ? `Printable ${result.invoice.id} for ${result.invoice.partyName}, total ${money(result.invoice.total)}.` : fmtToolResult(plan.name, result),
      tools: [{ name: plan.name, result }],
    };
  }
  if (plan.fallback) {
    if (modelConfigured()) {
      const chosen = await chooseTool({ message, tools: assistantTools(TOOLS).filter((tool) => tool.risk !== 'external_government_api' && !['run_automation', 'read_document', 'sandbox_operation', 'nim_ask'].includes(tool.name)), country: state.company?.country || 'IN', history: recentTurns(state) });
      if (chosen.ok) {
        const modelPlan = { kind: 'tool', name: chosen.name, args: chosen.args, viaModel: true };
        if (needsConfirmation(modelPlan.name)) return holdForConfirmation(state, modelPlan);
        const checked = validateAssistantToolCall(modelPlan.name, modelPlan.args);
        if (!checked.ok) return { reply: notAccepted(checked.error), tools: [], blocked: true };
        const chosenResult = await runTool(state, modelPlan.name, { ...modelPlan.args, actorId: 'assistant' });
        return { reply: fmtToolResult(modelPlan.name, chosenResult), tools: [{ name: modelPlan.name, result: chosenResult }], viaModel: true };
      }
      if (chosen.error === 'MODEL_NO_MATCH') {
        return { reply: `I did not match that to anything I can do${chosen.reason ? ` (${chosen.reason})` : ''}, so nothing was recorded. Try "invoice Kiran Stores 50000 GST 18%", "paid 12000 rent", "who owes me?", or say "help" for more.`, tools: [{ name: plan.name, result }], viaModel: true };
      }
    }
    if (liveCallsEnabled() && !mockModeEnabled()) {
      const ask = await runTool(state, 'nim_ask', { prompt: message });
      if (ask.ok && ask.data?.reply) {
        return {
          reply: ask.data.reply,
          tools: [{ name: 'nim_ask', result: ask }],
        };
      }
    }
    return {
      reply: 'I did not match that to anything I can do, so nothing was recorded. Try "invoice Kiran Stores 50000 GST 18%", "paid 12000 rent", "who owes me?", or say "help" for more.',
      tools: [{ name: plan.name, result }],
    };
  }
  return { reply: fmtToolResult(plan.name, result), tools: [{ name: plan.name, result }] };
}

export function propose(state, name, args = {}) {
  setCurrentCountry(state);
  return spoken(proposeCore(state, name, args));
}

export async function confirmPending(state, token) {
  setCurrentCountry(state);
  return spoken(await confirmCore(state, token));
}

export function discardPending(state) {
  return spoken(discardCore(state));
}

export async function chat(state, message) {
  setCurrentCountry(state);
  const out = await throughLanguage(message, async (english) => spoken(await chatCore(state, english)));
  rememberTurn(state, message, out.reply);
  logEvalEvent(state, { input: message, toolName: out.tools?.[0]?.name || out.preview?.tool || out.pending?.name || out.pending?.tool || '', outcome: out.blocked ? 'blocked' : out.awaitingConfirmation || out.pending ? 'held' : out.tools?.length ? 'ran' : 'answered', viaModel: Boolean(out.viaModel), blocked: Boolean(out.blocked), reply: out.reply });
  return out;
}

export { fmtToolResult, TOOLS };
