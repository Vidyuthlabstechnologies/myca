/**
 * Nothing a chat message says reaches the books until the user confirms it.
 *
 * A planned tool that writes books, or talks to a government API, is turned into
 * a preview: the figures the engines computed, the accounts that will move, and
 * anything that would stop the posting. The preview is held against a one-use
 * token until the next message confirms or discards it.
 */
import { filePreview, signPreview } from './us-efile.mjs';
import { importPayrollTaxFormsPreview } from './us-connectors.mjs';
import { randomBytes } from 'node:crypto';
import { setCurrentCountry } from './country.mjs';
import { removeUsTaxFormPreview, usInterviewPreview, usTaxFormPreview, usTaxpayerPreview } from './us-return.mjs';
import { ENGINE_WRITE_TOOLS } from './countries/manifests.mjs';
import { enginePreview } from './countries/engines.mjs';
import { addRulePreview, bankPreview, chargesPreview, matchPreview, removeRulePreview, runRulesPreview, setAccountPreview, transferPreview, unmatchPreview } from './chat-confirm/bank.mjs';
import { billTdsPreview, creditOpeningPreview, credits26asPreview, deductorPreview, exceptionPreview, filingPreview, gstPaymentPreview, gstr2bPreview, imsPreview, registrationPreview, retireRegistrationPreview, reviewAnswerPreview, tcsStatementPreview, tdsDepositPreview, tdsReviewAnswerPreview, tdsWithheldPreview, yearClosePreview } from './chat-confirm/gst-tds.mjs';
import { channelIdentityPreview, inventoryValuationPreview, ordersPreview, posImportPreview, settlementPreview, skuCostPreview, skuCostsImportPreview, stockPreview, stockTransferPreview, tallyPreview, xmlPreview, zohoPreview } from './chat-confirm/imports.mjs';
import { addressPreview, advanceTaxPreview, askPreview, attachDocumentPreview, businessAddressPreview, cashReadingPreview, closePreview, collectionReminderPreview, completeReminderPreview, expensePreview, monthClosePreview, paymentRunPreview, purchaseOrderPreview, reminderPreview, replyPreview, skuSupplyPreview, supplierBankPreview, supplierReminderPreview, supplierTermsPreview, tallyPushPreview } from './chat-confirm/payables.mjs';
import { employeePreview, leavingPreview, payrollApprovalPreview, salaryChangePreview, salaryPaymentPreview } from './chat-confirm/payroll.mjs';
import { amendmentPreview, convertPreview, creditNotePreview, debitNotePreview, documentPreview, invoiceNumberingPreview, invoiceTemplatePreview, irnPreview, markQuotePreview, paymentPreview, purchaseNotePreview, quotePreview, receiptPreview, recurringPreview, stopRecurringPreview, supplierNotePreview, termsPreview, transportPreview } from './chat-confirm/sales.mjs';
import { contractorPreview, nexusPreview, payrollImportPreview, salesTaxFilingPreview, salesTaxPaymentPreview, salesTaxRatePreview, salesTaxReviewAnswerPreview, sutaRatePreview, usImportPreview, withholdingPreview } from './chat-confirm/us.mjs';
export { TDS_REASONS } from './chat-confirm/shared.mjs';
export { rowsCounted } from './chat-confirm/gst-tds.mjs';

export const CONFIRM_TOOLS = new Set([
  'sign_us_return', 'file_us_return', 'import_payroll_tax_forms',
  'create_invoice', 'create_purchase', 'record_receipt', 'record_payment', 'record_filing', 'record_supplier_reminder', 'record_collection_reminder', 'record_payment_run', 'month_close_approve', 'set_sku_supply', 'record_purchase_order', 'record_advance_tax', 'set_supplier_bank', 'attach_document', 'push_tally', 'import_payroll_summary', 'add_employee', 'change_salary', 'end_employment', 'approve_payroll', 'record_salary_payment', 'set_tds_deductor', 'record_tds_deposit', 'tds_review_answer', 'set_gst_credit_opening', 'record_gst_payment', 'close_year', 'post_expense', 'set_expense_head', 'create_credit_note', 'create_debit_note', 'create_purchase_note', 'record_supplier_debit_note', 'cancel_invoice', 'gst_review_answer', 'import_gstr2b', 'ims_decide', 'add_reminder', 'complete_reminder', 'set_cash_balance', 'set_payment_terms', 'set_party_address', 'set_business_address', 'set_transport', 'set_sales_tax_rate', 'set_contractor', 'set_sales_tax_nexus', 'sales_tax_review_answer', 'record_sales_tax_payment', 'record_sales_tax_filing', 'set_withholding', 'set_suta_rate', 'import_us_invoices', 'import_pos_sales', 'import_settlement', 'import_marketplace_orders', 'import_tcs_statement', 'import_26as_credits', 'record_tds_withheld', 'add_bill_tds', 'record_stock', 'record_stock_transfer', 'set_sku_cost', 'import_sku_costs', 'value_inventory', 'set_registration', 'retire_registration', 'set_channel_identity', 'ask_ca', 'reply_ca', 'close_ca', 'create_quote', 'mark_quote', 'convert_quote', 'add_recurring', 'stop_recurring', 'amend_invoice', 'match_bank_line', 'unmatch_bank_line', 'book_bank_charges', 'add_bank_rule', 'remove_bank_rule', 'run_bank_rules', 'set_bank_account', 'record_transfer',
  'set_invoice_template', 'set_invoice_numbering', 'set_supplier_terms',
  'set_us_taxpayer', 'add_us_tax_form', 'remove_us_tax_form', 'answer_us_interview',
  'import_tally', 'import_tally_xml', 'import_zoho', 'import_bank',
  'govt_generate_irn', 'govt_nic_cancel_irn',
  'exception_decide',
  ...ENGINE_WRITE_TOOLS,
]);

const PENDING_TTL_MS = 10 * 60 * 1000;

const CONFIRM_RE = /^\s*(y|yes|yeah|yep|ok|okay|confirm|confirmed|post it|post|go ahead|do it|proceed|haan|ha|sahi)\b[\s!.]*$/i;

const CANCEL_RE = /^\s*(n|no|nope|cancel|discard|stop|don'?t|do not|abort|nahi|nahin)\b[\s!.]*$/i;

const PREVIEWERS = {
  sign_us_return: signPreview,
  file_us_return: filePreview,
  import_payroll_tax_forms: importPayrollTaxFormsPreview,
  create_invoice: (state, args) => documentPreview(state, args, 'sale'),
  create_purchase: (state, args) => documentPreview(state, args, 'purchase'),
  record_receipt: receiptPreview,
  record_payment: paymentPreview,
  record_filing: filingPreview,
  record_supplier_reminder: supplierReminderPreview,
  record_collection_reminder: collectionReminderPreview,
  record_payment_run: paymentRunPreview,
  month_close_approve: monthClosePreview,
  set_sku_supply: skuSupplyPreview,
  record_advance_tax: advanceTaxPreview,
  set_supplier_bank: supplierBankPreview,
  attach_document: attachDocumentPreview,
  push_tally: tallyPushPreview,
  import_payroll_summary: payrollImportPreview,
  record_purchase_order: purchaseOrderPreview,
  add_employee: employeePreview,
  approve_payroll: payrollApprovalPreview,
  record_salary_payment: salaryPaymentPreview,
  set_tds_deductor: deductorPreview,
  set_gst_credit_opening: creditOpeningPreview,
  record_gst_payment: gstPaymentPreview,
  close_year: yearClosePreview,
  amend_invoice: amendmentPreview,
  record_tds_deposit: tdsDepositPreview,
  change_salary: salaryChangePreview,
  end_employment: leavingPreview,
  post_expense: expensePreview,
  create_credit_note: creditNotePreview,
  create_debit_note: debitNotePreview,
  create_purchase_note: purchaseNotePreview,
  record_supplier_debit_note: supplierNotePreview,
  cancel_invoice: (state, args) => creditNotePreview(state, args, true),
  gst_review_answer: reviewAnswerPreview,
  tds_review_answer: tdsReviewAnswerPreview,
  import_gstr2b: gstr2bPreview,
  ims_decide: imsPreview,
  add_reminder: reminderPreview,
  complete_reminder: completeReminderPreview,
  set_cash_balance: cashReadingPreview,
  set_invoice_template: invoiceTemplatePreview,
  set_invoice_numbering: invoiceNumberingPreview,
  set_payment_terms: termsPreview,
  set_supplier_terms: supplierTermsPreview,
  set_party_address: addressPreview,
  set_business_address: businessAddressPreview,
  set_sales_tax_rate: salesTaxRatePreview,
  set_contractor: contractorPreview,
  set_sales_tax_nexus: nexusPreview,
  set_withholding: withholdingPreview,
  set_us_taxpayer: usTaxpayerPreview,
  add_us_tax_form: usTaxFormPreview,
  remove_us_tax_form: removeUsTaxFormPreview,
  answer_us_interview: usInterviewPreview,
  set_suta_rate: sutaRatePreview,
  sales_tax_review_answer: salesTaxReviewAnswerPreview,
  record_sales_tax_payment: salesTaxPaymentPreview,
  record_sales_tax_filing: salesTaxFilingPreview,
  set_transport: transportPreview,
  ask_ca: askPreview,
  create_quote: quotePreview,
  mark_quote: markQuotePreview,
  convert_quote: convertPreview,
  add_recurring: recurringPreview,
  match_bank_line: matchPreview,
  unmatch_bank_line: unmatchPreview,
  book_bank_charges: chargesPreview,
  add_bank_rule: addRulePreview,
  remove_bank_rule: removeRulePreview,
  run_bank_rules: runRulesPreview,
  set_bank_account: setAccountPreview,
  record_transfer: transferPreview,
  stop_recurring: stopRecurringPreview,
  reply_ca: replyPreview,
  close_ca: closePreview,
  import_tally: (state, args) => tallyPreview(state, args, args.csv, args.fileName || 'Tally Day Book'),
  import_tally_xml: xmlPreview,
  import_zoho: zohoPreview,
  import_us_invoices: usImportPreview,
  import_pos_sales: posImportPreview,
  import_settlement: settlementPreview,
  import_marketplace_orders: ordersPreview,
  import_tcs_statement: tcsStatementPreview,
  record_stock: stockPreview,
  record_stock_transfer: stockTransferPreview,
  set_sku_cost: skuCostPreview,
  value_inventory: inventoryValuationPreview,
  import_sku_costs: skuCostsImportPreview,
  set_registration: registrationPreview,
  retire_registration: retireRegistrationPreview,
  set_channel_identity: channelIdentityPreview,
  import_26as_credits: credits26asPreview,
  record_tds_withheld: tdsWithheldPreview,
  add_bill_tds: billTdsPreview,
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
  setCurrentCountry(state);
  const build = PREVIEWERS[name] || enginePreview(name);
  if (!build) return { blockers: [], summary: `Run ${name}.`, effects: [], figures: {} };
  try {
    return build(state, args);
  } catch (err) {
    const faults = [TypeError, ReferenceError, RangeError, SyntaxError, EvalError, URIError];
    const said = faults.some((kind) => err instanceof kind) ? '' : String((err && err.message) || err || '');
    return { blockers: [said ? `I could not work out what this would do: ${said}` : 'I could not work out what this would do, so nothing was posted.'], summary: `Run ${name}.`, effects: [], figures: {} };
  }
}

export function openPending(state, plan, preview, now = Date.now()) {
  const pending = {
    token: randomBytes(6).toString('hex'),
    name: plan.name,
    args: preview.pinned || plan.args,
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
