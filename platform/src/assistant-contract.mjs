import { planReceiptWithoutInvoice } from './receipt-intent.mjs';
import { planExpenseFromChat, planRetagFromChat } from './expense-intent.mjs';
import { planPaymentFromChat } from './payment-intent.mjs';
import { planOweQuestion } from './owe-intent.mjs';
import { planFilingFromChat, saidPeriod } from './filing-intent.mjs';
import { planEmployeeFromChat } from './employee-intent.mjs';
import { planBillTdsFromChat, planTdsChat, planTdsFromChat, withoutSettledTds } from './tds-intent.mjs';
import { planGstPayFromChat } from './gst-pay-intent.mjs';
import { planTransportFromChat, planAddressFromChat } from './eway-intent.mjs';
import { planPayrollFromChat } from './payroll-intent.mjs';
import { planUsFromChat } from './us-intent.mjs';
import { countryOf } from './country.mjs';
import { tdsReviewOf } from './tds-review.mjs';
import { parseQuarter } from './tds-return.mjs';
import { reviewOf } from './gst-review.mjs';
import { planReminderFromChat } from './reminder-intent.mjs';
import { planCollectionFromChat } from './collections-intent.mjs';
import { planPaymentRunFromChat } from './payment-run-intent.mjs';
import { planMonthCloseFromChat } from './month-close-intent.mjs';
import { planRestockFromChat } from './restock-intent.mjs';
import { planAdvanceTaxFromChat } from './advance-tax-intent.mjs';
import { planSupplierBankFromChat } from './supplier-bank-intent.mjs';
import { planReportFromChat } from './reports-intent.mjs';
import { planIntegrationFromChat } from './integrations-intent.mjs';
import { planCashFromChat } from './cash-intent.mjs';
import { planTermsFromChat, takeInvoiceTerms } from './terms-intent.mjs';
import { localToday } from './dates.mjs';
import { documentsOf } from './document-store.mjs';
import { normalizeChat, parseDocument, documentProblemReply, saidNonPositiveAmount, receiptAmount, amountsSaid, soleAmountSaid, receiptDate, moneyDate, isPurchaseIntent, isSaleIntent, isQuestion, isNegated, ROUTES } from './intent.mjs';
import { confirmationIntent } from './chat-confirm.mjs';
import { planBankFromChat } from './bank-intent.mjs';
import { salesDocumentKindSaid, MONTH_NAMES } from './chat-words.mjs';
import { IMS_SAID, planImsFromChat } from './ims-intent.mjs';
import { planAuditTrailFromChat } from './audit-trail-intent.mjs';
import { excelPlanWaits, planExcelFromChat } from './excel-intent.mjs';
import { SUPPLIER_DUES_SAID, MSME_STATED, TERMS_TALK_SAID, POSTING_SAID, planSupplierTermsFromChat } from './supplier-terms-intent.mjs';

export { TOOL_ARG_SCHEMAS } from './tool-schemas.mjs';
export { assistantTools, validateAssistantToolCall } from './assistant-tools.mjs';

const PERIOD_TOOLS = new Set(['gst_payable', 'export_tally', 'export_gstr1_json', 'prepare_gstr1', 'filing_pack', 'prepare_gstr3b']);

export function pendingFileContent(state) {
  const pending = state.pendingFile;
  if (!pending) return '';
  if (typeof pending.content === 'string') return pending.content;
  if (!pending.sha256) return '';
  const read = documentsOf(state).read(pending.sha256);
  if (typeof read === 'string') return read;
  return read && read.ok ? String(read.content ?? '') : '';
}

const MAX_CHAT_CHARS = 2000;

function planInvoiceDesignFromChat(text) {
  const t = text.trim();
  if (isNegated(t)) return null;
  if (/^(?:show|what(?:'s| is)|see)\s+(?:the\s+|my\s+)?invoice\s+(?:design|template|look|layout)\??$/i.test(t)) return { kind: 'tool', name: 'invoice_template', args: {} };
  const bank = /^(?:bank|payment)\s+details?\s+(?:on|for)\s+(?:the\s+|my\s+)?invoices?\s*[:\-]?\s*(.+)$/i.exec(t);
  if (bank) {
    const body = bank[1];
    const account = /\b(?:a\/c|account|acct)\.?\s*(?:no\.?|number)?\s*[:#]?\s*([0-9][0-9 ]{5,24})/i.exec(body);
    const ifsc = /\bifsc\s*[:#]?\s*([A-Za-z]{4}0[A-Za-z0-9]{6})\b/i.exec(body);
    const upi = /\bupi\s*(?:id)?\s*[:#]?\s*([a-z0-9][a-z0-9._-]+@[a-z][a-z0-9]+)/i.exec(body);
    const name = /^([A-Za-z][A-Za-z&. ]{1,60}?)\s*(?:,|a\/c|account|acct|ifsc|upi)/i.exec(body);
    if (!account && !upi) return null;
    return { kind: 'tool', name: 'set_invoice_template', args: { bank: { ...(name ? { name: name[1].trim() } : {}), ...(account ? { account: account[1].replace(/\s/g, '') } : {}), ...(ifsc ? { ifsc: ifsc[1].toUpperCase() } : {}), ...(upi ? { upi: upi[1].toLowerCase() } : {}) } } };
  }
  const footer = /^(?:invoice\s+)?footer\s*(?:line|text)?\s*[:\-]\s*(.+)$/i.exec(t);
  if (footer) return { kind: 'tool', name: 'set_invoice_template', args: { footer: footer[1].trim() } };
  const terms = /^(?:invoice\s+)?terms\s*(?:on\s+(?:the\s+)?invoices?)?\s*[:\-]\s*(.+)$/i.exec(t);
  if (terms) return { kind: 'tool', name: 'set_invoice_template', args: { terms: terms[1].trim() } };
  const signed = /^sign\s+(?:the\s+|my\s+)?invoices?\s+(?:as|by)\s+(.+)$/i.exec(t);
  if (signed) return { kind: 'tool', name: 'set_invoice_template', args: { signatory: signed[1].trim() } };
  const colour = /^invoice\s+colou?r\s*[:\-]?\s*(#[0-9a-f]{6}|default)\s*$/i.exec(t);
  if (colour) return { kind: 'tool', name: 'set_invoice_template', args: { accent: colour[1].toLowerCase() } };
  const layout = /^(?:invoice\s+)?layout\s*[:\-]?\s*(classic|minimal)\s*$|^(classic|minimal)\s+invoices?\s*$/i.exec(t);
  if (layout) return { kind: 'tool', name: 'set_invoice_template', args: { layout: (layout[1] || layout[2]).toLowerCase() } };
  const hsn = /^(hide|show)\s+(?:the\s+)?hsn(?:\s+column)?(?:\s+on\s+(?:the\s+)?invoices?)?\s*$/i.exec(t);
  if (hsn) return { kind: 'tool', name: 'set_invoice_template', args: { showHsn: hsn[1].toLowerCase() === 'show' } };
  return null;
}

function otherEditionReply() {
  return { kind: 'reply', reply: 'That is for a different country edition, so nothing was changed.', tools: [] };
}

function repeatSaid(text) {
  const named = /\b(?:repeat(?:ing)?|recurring)\b/i.test(text);
  const found = text.match(/(?<!\s)\s*,?\s*\bevery\s+(week|month|quarter|six\s+months|half[\s-]?year|year)\b|(?<!\s)\s*,?\s*\b(weekly|monthly|quarterly|half[\s-]?yearly|yearly|annually)\b/i);
  if (!named && !found) return null;
  if (!named && !/\binvoice\b/i.test(text)) return null;
  const word = String(found ? found[1] || found[2] : 'month').toLowerCase().replace(/\s+/g, ' ');
  const every = /^week/.test(word) ? 'week' : /^quarter/.test(word) ? 'quarter' : /six|half/.test(word) ? 'half-year' : /^(?:year|annual)/.test(word) ? 'year' : 'month';
  return { every, words: found ? found[0] : /$^/ };
}

function challanReasonSaid(text) {
  if (/\bjob\s*work/i.test(text)) return 'job-work';
  if (/\bapproval\b/i.test(text)) return 'approval';
  if (/\bexhibition\b/i.test(text)) return 'exhibition';
  if (/\bown\s+use\b/i.test(text)) return 'own-use';
  return '';
}

const TDS_WORDING = /\btax\s+(?:deducted|withheld)\s+at\s+source\b/i;

function severalReceiptAmounts(text, invoiceId) {
  const amounts = amountsSaid(text);
  const asked = 'I read more than one amount in that, so I have recorded nothing.';
  if (TDS_WORDING.test(text) && amounts.length === 2) {
    return { kind: 'reply', reply: `${asked} If one of them is TDS your customer withheld, a receipt that carries TDS is two entries: first say "received ${Math.max(...amounts)} against ${invoiceId}", then say "record tds withheld ${Math.min(...amounts)} on ${invoiceId} under 194J" (use the section on the TDS certificate). The TDS then takes the date of the receipt.`, tools: [] };
  }
  return { kind: 'reply', reply: `${asked} Say the one amount you received, for example "received ${amounts[0]} against ${invoiceId}", or leave the amounts out to settle the whole invoice.`, tools: [] };
}

export function planLocalToolCall(state, message) {
  const raw = String(message == null ? '' : message);
  if (raw.length > MAX_CHAT_CHARS) {
    return { kind: 'reply', reply: `That message is ${raw.length} characters; I read up to ${MAX_CHAT_CHARS}. Send the instruction on its own, and attach long data as a file.`, tools: [] };
  }
  const text = normalizeChat(message);
  if (!text) return { kind: 'reply', reply: 'Tell me what to post, import, or file.', tools: [] };

  const decision = confirmationIntent(text);
  if (decision) {
    if (!state.pendingChatAction) return { kind: 'reply', reply: 'There is nothing waiting to be posted.', tools: [] };
    return decision === 'cancel' ? { kind: 'cancel' } : { kind: 'confirm', decision };
  }

  if (/^(help|\?)$/i.test(text) || /^what can you do$/i.test(text)) {
    return {
      kind: 'reply',
      reply: `MyCA posts invoices, bills, payments and expenses to your books, but only after you see a preview and say yes.\n\nYou can say:\n· invoice Kiran Stores 50000 for consulting GST 18%\n· received 20000 from Kiran Stores\n· bill from Fabric Co 10000 GST 5%\n· paid Fabric Co 4000\n· paid 12000 rent\n· who owes me? / how much do I owe Fabric Co?\n· quote Retail Mart 25000 for design GST 18%\n· credit note INV-0001 5000 damaged goods\n· cash forecast · review GST · remind me to call Kiran tomorrow`,
      tools: [],
    };
  }

  const ownAddress = /^(?:(?:my|our)\s+)?(?:business|company|shop|office|firm)(?:'s)?\s+address\s*(?:is\b|:|-)\s*(.{5,200})$/i.exec(text.trim());
  if (ownAddress && !isQuestion(text)) {
    const said = ownAddress[1].trim().replace(/[.\s]+$/, '');
    const pin = /\b([1-9][0-9]{5})\b/.exec(said);
    if (!pin) return { kind: 'reply', reply: 'Say the address with its 6-digit PIN code, for example "business address: Plot 4, MIDC, Pune 411019". I have recorded nothing.', tools: [] };
    const city = said.slice(0, pin.index).split(',').map((part) => part.trim()).filter(Boolean).pop() || '';
    return { kind: 'tool', name: 'set_business_address', args: { address: said, pin: pin[1], ...(city && city !== said ? { city: city.slice(0, 50) } : {}) } };
  }
  const billTds = planBillTdsFromChat(state, text);
  if (billTds) return billTds;

  {
    const saving = /^save\s+gstr-?1\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:to|on)\s+(?:the\s+)?portal(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (saving && !isNegated(text)) return { kind: 'tool', name: 'save_gstr1_portal', args: { period: saving[1], ...(saving[2] ? { gstin: saving[2].toUpperCase() } : {}), ...(saving[3] ? { caApprovalId: saving[3].toUpperCase() } : {}) } };
    const filing = /^file\s+gstr-?1\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:with\s+)?otp\s+(\d{6})(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (filing && !isNegated(text)) return { kind: 'tool', name: 'file_gstr1_portal', args: { period: filing[1], otp: filing[3], ...(filing[2] ? { gstin: filing[2].toUpperCase() } : {}), ...(filing[4] ? { caApprovalId: filing[4].toUpperCase() } : {}) } };
    const saving3b = /^save\s+gstr-?3b\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:to|on)\s+(?:the\s+)?portal(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (saving3b && !isNegated(text)) return { kind: 'tool', name: 'save_gstr3b_portal', args: { period: saving3b[1], ...(saving3b[2] ? { gstin: saving3b[2].toUpperCase() } : {}), ...(saving3b[3] ? { caApprovalId: saving3b[3].toUpperCase() } : {}) } };
    const paying3b = /^(?:pay|set\s*off|offset)\s+(?:the\s+)?gstr-?3b(?:\s+tax)?\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+on\s+(?:the\s+)?portal(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (paying3b && !isNegated(text)) return { kind: 'tool', name: 'offset_gstr3b_portal', args: { period: paying3b[1], ...(paying3b[2] ? { gstin: paying3b[2].toUpperCase() } : {}), ...(paying3b[3] ? { caApprovalId: paying3b[3].toUpperCase() } : {}) } };
    const filing3b = /^file\s+gstr-?3b\s+(?:for\s+)?(\d{4}-\d{2})(?:\s+(?:for|under)\s+([0-9]{2}[A-Z0-9]{13}))?\s+(?:with\s+)?otp\s+(\d{6})(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (filing3b && !isNegated(text)) return { kind: 'tool', name: 'file_gstr3b_portal', args: { period: filing3b[1], otp: filing3b[3], ...(filing3b[2] ? { gstin: filing3b[2].toUpperCase() } : {}), ...(filing3b[4] ? { caApprovalId: filing3b[4].toUpperCase() } : {}) } };
    const fvu = /^(?:generate|make|prepare)\s+(?:the\s+)?fvu\s+(?:for\s+)?(Q[1-4]\s+\d{4}-\d{2})(?:\s+(24Q|26Q|27Q))?(?:\s+(?:with\s+)?approval\s+(APR-\d+))?\s*$/i.exec(text.trim());
    if (fvu && !isNegated(text)) return { kind: 'tool', name: 'generate_tds_fvu', args: { quarter: fvu[1].toUpperCase(), ...(fvu[2] ? { form: fvu[2].toUpperCase() } : {}), ...(fvu[3] ? { caApprovalId: fvu[3].toUpperCase() } : {}) } };
    if (/\bportal\s+(?:status|saves)\b|\bwhat\s+(?:is|was)\s+saved\s+to\s+the\s+portal\b|\bfvu\s+jobs?\b/i.test(text)) return { kind: 'tool', name: 'portal_status', args: {} };
  }
  const integration = planIntegrationFromChat(state, text);
  if (integration) return integration;
  if (/\b(upload|submit|sign|file)\b.*\b(gstn|return|gstr|dsc|otp)\b/i.test(text)) {
    return {
      kind: 'reply',
      reply: 'I can prepare the GST filing pack and export GSTR data, but I cannot upload, submit, sign, or file on GSTN. A practising CA must review and complete filing on the portal.',
      tools: [],
      blocked: true,
    };
  }
  const excel = planExcelFromChat(state, text);
  if (excel && !excelPlanWaits(text)) return excel;
  const imsAudit = IMS_SAID.test(text) ? planAuditTrailFromChat(state, text) : null;
  if (imsAudit) return imsAudit;
  const ims = planImsFromChat(state, text);
  if (ims) return ims;

  const quoteRef = text.match(/\b((?:QT|PI|SO|DC)-\d{4,})\b/i);
  if (quoteRef && !isQuestion(text) && !isNegated(text)) {
    const id = quoteRef[1].toUpperCase();
    if (/\b(?:convert|make|turn|raise)\b.*\binvoice\b|\binvoice\s+(?:it|for|from)?\s*(?:QT|PI|SO|DC)-/i.test(text)) return { kind: 'tool', name: 'convert_quote', args: { id } };
    if (/\baccepted\b|\bapproved\b|\bconfirmed\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'accepted' } };
    if (/\bdeclined\b|\brejected\b|\bnot\s+going\s+ahead\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'declined' } };
    if (/\bcancel(?:led|ed)?\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'cancelled' } };
    if (/\b(?:returned|came\s+back|received\s+back)\b/i.test(text)) return { kind: 'tool', name: 'mark_quote', args: { id, outcome: 'returned' } };
  }
  const stopRepeat = text.match(/\b(?:stop|end|cancel)\b.*\b(RP-\d{4,})\b/i);
  if (stopRepeat && !isQuestion(text)) return { kind: 'tool', name: 'stop_recurring', args: { id: stopRepeat[1].toUpperCase() } };
  const repeatAsk = repeatSaid(text);
  if (repeatAsk && !isNegated(text)) {
    if (!/\d/.test(text)) return { kind: 'tool', name: 'list_recurring', args: {} };
    if (/\binvoice\b/i.test(text) && !isQuestion(text)) {
      const from = text.match(/\s*,?\s*\b(?:from|starting|start(?:ing)?\s+on|beginning)\s+(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\b/i);
      const until = text.match(/\s*,?\s*\b(?:until|till|upto|up\s+to|to\s+end\s+on)\s+(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\b/i);
      let rest = text.replace(repeatAsk.words, ' ');
      for (const part of [from, until]) if (part) rest = rest.replace(part[0], ' ');
      rest = rest.replace(/\b(?:repeat(?:ing)?|recurring|set\s+up(?:\s+a)?)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      const parsed = parseDocument(rest);
      if (parsed && parsed.problem) return documentProblemReply(parsed, countryOf(state));
      if (parsed) {
        if (parsed.lines[0].gstRate == null) return { kind: 'reply', reply: 'I have not set it up, because I will not guess the GST rate. Say it again with the rate, for example "repeat invoice to ABC Ltd 25000 for rent GST 18% every month from 2026-12-01".', tools: [] };
        return { kind: 'tool', name: 'add_recurring', args: { kind: 'invoice', every: repeatAsk.every, partyName: parsed.partyName, ...(parsed.partyGstin ? { partyGstin: parsed.partyGstin } : {}), lines: parsed.lines, ...(from ? { startDate: from[1] } : {}), ...(until ? { endDate: until[1] } : {}) } };
      }
    }
  }
  const bankPlan = planBankFromChat(state, text);
  if (bankPlan) return bankPlan;
  const auditPlan = planAuditTrailFromChat(state, text);
  if (auditPlan) return auditPlan;
  const salesKind = salesDocumentKindSaid(text);
  if (salesKind && !quoteRef && !isQuestion(text) && !isNegated(text)) {
    const validity = text.match(/\s*,?\s*\bvalid\s+(?:for\s+)?(\d{1,3})\s*days?\b/i);
    const reason = salesKind.kind === 'challan' ? challanReasonSaid(text) : '';
    const cleaned = (validity ? text.replace(validity[0], ' ') : text).replace(/\s*,?\s*\bfor\s+(?:job\s*work|approval|exhibition|own\s+use)\b/i, ' ');
    const asInvoice = cleaned.replace(salesKind.words, 'invoice');
    const quoted = parseDocument(asInvoice);
    if (quoted && quoted.problem) return documentProblemReply(quoted, countryOf(state));
    if (quoted) {
      if (quoted.lines[0].gstRate == null) {
        return { kind: 'reply', reply: `I have not made the ${salesKind.label}, because I will not guess the GST rate. Say it again with the rate, for example "${salesKind.example}".`, tools: [] };
      }
      return { kind: 'tool', name: 'create_quote', args: { partyName: quoted.partyName, ...(quoted.partyGstin ? { partyGstin: quoted.partyGstin } : {}), lines: quoted.lines, ...(validity ? { validDays: Number(validity[1]) } : {}), ...(salesKind.kind === 'quote' ? {} : { kind: salesKind.kind }), ...(reason ? { reason } : {}) } };
    }
  }
  const closeYearAsk = text.match(/\bclose\s+(?:the\s+)?(?:year|books?\s+for|financial\s+year|fy)\s*(\d{4}(?:-\d{2})?)?\b/i);
  if (closeYearAsk && !isQuestion(text) && !isNegated(text)) return { kind: 'tool', name: 'close_year', args: closeYearAsk[1] ? { year: closeYearAsk[1] } : {} };
  const tdsChat = planTdsChat(state, text);
  if (tdsChat) return tdsChat;
  const tdsAsk = planTdsFromChat(text);
  if (tdsAsk) return tdsAsk;
  const gstPay = planGstPayFromChat(text);
  if (gstPay) return countryOf(state) === 'IN' ? gstPay : otherEditionReply();
  const transport = planTransportFromChat(text);
  if (transport) return transport;
  const address = planAddressFromChat(state, text);
  if (address) return address;
  const payroll = planPayrollFromChat(state, text);
  if (payroll) return payroll;
  const hired = planEmployeeFromChat(text);
  if (hired) return hired;
  const filed = planFilingFromChat(text);
  if (filed) return filed;
  const owed = planOweQuestion(state, text);
  if (owed) return owed;
  const report = planReportFromChat(state, text);
  if (report) return report;
  const supplierBank = planSupplierBankFromChat(state, text);
  if (supplierBank) return supplierBank;
  const advance = planAdvanceTaxFromChat(state, text);
  if (advance) return advance;
  const stock = planRestockFromChat(state, text);
  if (stock) return stock;
  const closing = planMonthCloseFromChat(state, text);
  if (closing) return closing;
  const run = planPaymentRunFromChat(state, text);
  if (run) return run;
  const agreedTerms = planSupplierTermsFromChat(state, text);
  if (agreedTerms) return agreedTerms;
  const payment = planPaymentFromChat(state, text);
  if (payment) return payment;
  if (countryOf(state) === 'US') {
    const us = planUsFromChat(state, text);
    if (us) return us;
  }
  {
    const exported = /^export\s+(?:invoice|sale)\s+(?:to\s+)?(.+?)\s+(?:([A-Za-z]{3})\s*)?([\d,]+(?:\.\d+)?)\s*([A-Za-z]{3})?\s+(?:at|rate|@)\s*([\d.]+)(?:\s+(under\s+lut|under\s+bond|without\s+(?:tax|igst)|with\s+(?:tax|igst)(?:\s+(\d{1,2})%)?))?\s*$/i.exec(text.trim());
    if (exported && !isNegated(text) && !isQuestion(text)) {
      const currency = (exported[2] || exported[4] || 'USD').toUpperCase();
      const amount = Number(exported[3].replace(/,/g, ''));
      const withTax = /^with\s/i.test(exported[6] || '');
      const gstRate = withTax ? Number(exported[7] || 18) : 0;
      return { kind: 'tool', name: 'create_invoice', args: { partyName: exported[1].trim(), lines: [{ description: 'Export', qty: 1, rate: amount, gstRate }], exportSale: { currency, exchangeRate: Number(exported[5]), withTax } } };
    }
  }
  const saidTerms = takeInvoiceTerms(text);
  const parsed = /\b(?:debit|credit)\s+note\b/i.test(text) ? null : parseDocument(saidTerms.text);
  const doc = parsed && !parsed.problem && parsed.lines[0].gstRate == null && TERMS_TALK_SAID.test(text) && !POSTING_SAID.test(text) ? null : parsed;
  const asking = isQuestion(text) || isNegated(text);
  if (doc && doc.problem && !asking && (isPurchaseIntent(text) || isSaleIntent(text))) return documentProblemReply(doc, countryOf(state));
  if (doc && doc.problem) return { kind: 'tool', name: 'company_profile', args: {}, fallback: true };
  if (doc && !asking && doc.lines[0].gstRate == null && (isPurchaseIntent(text) || isSaleIntent(text))) {
    return {
      kind: 'reply',
      reply: 'I have not posted anything, because I will not guess the GST rate. Say it again with the rate, for example "invoice Retail Mart 8000 GST 18%". Use GST 0% if none applies.',
      tools: [],
    };
  }
  if (doc && !asking && isPurchaseIntent(text)) return { kind: 'tool', name: 'create_purchase', args: doc };
  if (doc && !asking && isSaleIntent(text)) return { kind: 'tool', name: 'create_invoice', args: saidTerms.days == null ? doc : { ...doc, paymentTermsDays: saidTerms.days } };
  if (doc && asking && (isPurchaseIntent(text) || isSaleIntent(text))) {
    return { kind: 'reply', reply: 'That reads like a question, so I have not posted anything. To post it, say it as an instruction, for example "invoice Retail Mart GSTIN 27AAACH7409R1Z1, 10 rolls at 50000, GST 5%".', tools: [] };
  }

  const connectReq = text.match(/\bconnect\s+(REQ-CA-\d{3}|[a-z_]+)\b(?:.*?\bprovider\s+([A-Za-z0-9 .&_-]{2,60}))?/i);
  if (connectReq && /\b(api|integration|connector|requirement|provider)\b/i.test(text)) {
    return {
      kind: 'tool',
      name: 'integration_connect',
      args: {
        requirementId: connectReq[1],
        provider: (connectReq[2] || 'Manual connector').trim(),
      },
    };
  }

  const disconnectReq = text.match(/\b(disconnect|remove)\s+(REQ-CA-\d{3}|[a-z_]+)\b/i);
  if (disconnectReq && /\b(api|integration|connector|requirement)\b/i.test(text)) {
    return {
      kind: 'tool',
      name: 'integration_disconnect',
      args: { requirementId: disconnectReq[2] },
    };
  }

  if (/\b(sandbox\s*(status|ping|health|test|check)|ping\s*sandbox)\b/i.test(text)) {
    return { kind: 'tool', name: 'sandbox_status', args: {} };
  }

  if (/\bconnect\s+(sandbox|quicko)\b/i.test(text)) {
    return { kind: 'tool', name: 'sandbox_connect', args: {} };
  }

  if (/\b(nim\s*(status|ping|health|check)|nvidia\s*nim)\b/i.test(text)) {
    return { kind: 'tool', name: 'nim_status', args: {} };
  }

  const nimAskMatch = text.match(/^(?:ask\s+nim|nim|ask\s+nvidia)\s+(.+)$/i);
  if (nimAskMatch) {
    return { kind: 'tool', name: 'nim_ask', args: { prompt: nimAskMatch[1].trim() } };
  }

  if (/\b(nic\s*mock\s*auth|mock\s*nic\s*auth|mock\s*auth)\b/i.test(text)) {
    return { kind: 'tool', name: 'govt_nic_auth', args: {} };
  }

  const gstinQuery = text.match(/\b(?:validate|verify|check|search|lookup)\s*gstin\s+([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/i);
  if (gstinQuery) {
    return { kind: 'tool', name: 'validate_gstin', args: { gstin: gstinQuery[1].toUpperCase() } };
  }

  const standaloneGstin = text.match(/^gstin\s+([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])$/i)
    || text.match(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])$/i);
  if (standaloneGstin && !doc) {
    return { kind: 'tool', name: 'validate_gstin', args: { gstin: standaloneGstin[1].toUpperCase() } };
  }

  const trackQuery = text.match(/\b(?:track\s+returns?|return\s+status|filing\s+status)\b(?:\s+(?:for\s+)?([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]))?/i);
  if (trackQuery) {
    const gstin = trackQuery[1] ? trackQuery[1].toUpperCase() : undefined;
    return { kind: 'tool', name: 'track_gst_returns', args: gstin ? { gstin } : {} };
  }

  const reminder = planReminderFromChat(text);
  if (reminder) return reminder;
  const cash = planCashFromChat(text);
  if (cash) return cash;
  const terms = planTermsFromChat(text);
  if (terms) return terms;

  if (/\breview\b.*\btds\b|\btds\b.*\breview\b/i.test(text) && !isNegated(text)) {
    return planTdsReview(state, text, /\bsalar(?:y|ies)\b|\b24q\b|\bform\s*138\b/i.test(text) ? 'salary' : 'other');
  }
  if (/\btds\b.*\b(?:return|statement|26q|24q|form\s*1(?:38|40)|quarterly)\b|\b(?:return|statement|26q|24q|quarterly)\b.*\btds\b/i.test(text) && !isNegated(text)) {
    const quarter = quarterSaid(text);
    const form = /\bsalar(?:y|ies)\b|\b24q\b|\bform\s*138\b/i.test(text) ? 'salary' : 'other';
    return { kind: 'tool', name: 'tds_return', args: { ...(quarter ? { quarter } : {}), ...(form === 'salary' ? { form } : {}) } };
  }
  {
    const ask = /^(?:request|ask)\s+(?:documents?\s+)?from\s+([A-Za-z0-9_-]+)\s*:\s*(.+?)(?:\s+for\s+(\d{4}-\d{2}))?(?:\s+by\s+(\d{4}-\d{2}-\d{2}))?\s*$/i.exec(text.trim());
    if (ask && !isNegated(text)) {
      return { kind: 'tool', name: 'request_documents', args: { clientId: ask[1].toUpperCase(), items: ask[2].split(',').map((item) => item.trim()).filter(Boolean), ...(ask[3] ? { period: ask[3] } : {}), ...(ask[4] ? { dueOn: ask[4] } : {}) } };
    }
    const got = /^(?:received|got)\s+(.+?)\s+(?:for|against|on)\s+(DRQ-\d{4,})\s*$/i.exec(text.trim());
    if (got && !isNegated(text)) return { kind: 'tool', name: 'record_document_received', args: { id: got[2].toUpperCase(), ...(/^(?:all|everything)$/i.test(got[1].trim()) ? {} : { item: got[1].trim().toLowerCase() }) } };
    if (/^\s*(?:document\s+requests?|what\s+(?:documents?|files)\s+(?:are|is)\s+(?:still\s+)?(?:outstanding|pending|due)|outstanding\s+documents?)\s*\??\s*$/i.test(text)) return { kind: 'tool', name: 'document_requests', args: {} };
    if (/^\s*(?:eval\s+(?:log|events?)|assistant\s+log|corrections?\s+log)\s*$/i.test(text)) return { kind: 'tool', name: 'eval_events', args: {} };
    const search = /^\s*(?:search|find)\s+(?:firm\s+)?notes?\s+(?:for\s+)?(.+?)\s*$/i.exec(text);
    if (search) return { kind: 'tool', name: 'search_firm_notes', args: { query: search[1] } };
    const asked = /^\s*(?:what\s+do\s+(?:the|our)\s+notes\s+say\s+about|ask\s+(?:the\s+)?notes?|from\s+(?:the|our)\s+notes[,:]?)\s+(.+?)\s*\??\s*$/i.exec(text);
    if (asked) return { kind: 'tool', name: 'ask_knowledge', args: { question: asked[1] } };
    const taxAsked = /^\s*(?:tax\s+(?:question|help|query)|(?:gst|tds|itc|income\s+tax)\s+question|ask\s+(?:the\s+)?tax\s+(?:assistant|guide|modules?))\s*[:,-]?\s+(.{3,500}?)\s*$/i.exec(text);
    if (taxAsked) return { kind: 'tool', name: 'ask_tax', args: { question: taxAsked[1] } };
    if (/^\s*(?:tax\s+(?:modules|topics|guides?|knowledge)|what\s+tax\s+(?:topics|modules)\s+(?:do\s+you|can\s+you)\s+(?:know|cover|answer))\s*\??\s*$/i.test(text)) return { kind: 'tool', name: 'tax_modules', args: {} };
  }
  {
    const design = planInvoiceDesignFromChat(text);
    if (design) return design;
  }
  if (/\b(?:number|numbering|series)\b.*\binvoices?\b.*\b(?:per|by|each|every)\s+(?:financial\s+)?year\b|\binvoices?\s+(?:numbering|numbers?|series)\b.*\b(?:per|by|each|every)\s+(?:financial\s+)?year\b|\byearly\s+invoice\s+(?:numbers?|numbering|series)\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'set_invoice_numbering', args: { mode: 'yearly' } };
  }
  if (/\b(?:continuous|single|one)\s+(?:invoice\s+)?(?:series|numbering|sequence)\b|\bnumber\s+invoices\s+continuously\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'set_invoice_numbering', args: { mode: 'continuous' } };
  }
  if (SUPPLIER_DUES_SAID.test(text) && !MSME_STATED.test(text)) {
    return { kind: 'tool', name: 'supplier_dues', args: {} };
  }
  if (/\b(?:salary|payroll)\b.*\b(?:payout|bank)\b.*\bfile\b|\bpayout\s+file\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'payroll_payout_file', args: { period: monthSaid(text) } };
  }
  if (/\b(?:pf|provident\s+fund|epf)\b.*\b(?:file|ecr|return|challan)\b|\becr\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'pf_ecr', args: { period: monthSaid(text) } };
  }
  if (/\besi(?:c)?\b.*\b(?:file|return|contribution)\b|\bstate\s+insurance\s+(?:file|return)\b/i.test(text) && !isNegated(text) && !isQuestion(text)) {
    return { kind: 'tool', name: 'esi_return', args: { period: monthSaid(text) } };
  }
  if (/\breview\b.*\b(?:gst|gstr|return)\b|\b(?:gst|gstr-?[13]b?|return)\b.*\breview\b/i.test(text) && !isNegated(text)) {
    if (countryOf(state) === 'IN') return planReview(state, text);
    if (/\bgst/i.test(text)) return otherEditionReply();
  }

  const cancelMatch = text.match(/\bcancel\s+(?:invoice\s+)?(INV-\d{4,})\b(?:\s*(?:because|reason|:|-)?\s*(.+))?$/i);
  if (cancelMatch && !isQuestion(text) && !/\b(?:do\s*not|don'?t|never)\b/i.test(text) && !/\b(?:irn|e-?invoice)\b/i.test(text)) {
    const reason = String(cancelMatch[2] || '').trim();
    return { kind: 'tool', name: 'cancel_invoice', args: { invoiceId: cancelMatch[1].toUpperCase(), date: receiptDate(text, localToday()), ...(reason ? { reason: reason.slice(0, 200) } : {}) } };
  }
  const supplierNote = text.match(/\bdebit\s+note\b.*?\b(BILL-\d{4,})\b/i);
  const supplierIssued = supplierNote && /\b(?:supplier'?s?|their|vendor'?s?)\s+debit\s+note\b|\bdebit\s+note\s+from\b|\breceived\s+(?:a\s+)?debit\s+note\b/i.test(text);
  if (supplierIssued && !isQuestion(text) && !isNegated(text)) {
    const amount = receiptAmount(text.replace(/\b(?:no\b\.?|number\b|#)\s*[A-Z0-9/-]+/i, ' '));
    const noteNo = (text.match(/\b(?:note\s+)?(?:no\b\.?|number\b|#)\s*([A-Z0-9][A-Z0-9/-]{0,15})\b/i) || [])[1] || '';
    const cleaned = text.replace(/,?\s*(?:note\s+)?(?:no\b\.?|number\b|#)\s*[A-Z0-9][A-Z0-9/-]*\s*$/i, '');
    const afterBill = cleaned.slice(cleaned.toUpperCase().indexOf(supplierNote[1].toUpperCase()) + supplierNote[1].length);
    const reason = (cleaned.match(/(?:because|reason|:|-)\s*([^0-9₹][^,]*?)\s*$/i) || afterBill.match(/(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s+(?:for\s+)?([A-Za-z][^,]*?)\s*$/i) || [])[1] || '';
    if (amount == null) return { kind: 'reply', reply: `Say the amount, for example "supplier's debit note on ${supplierNote[1].toUpperCase()} 2360 - extra freight, no. FC-7". I have recorded nothing.`, tools: [] };
    if (!reason.trim()) return { kind: 'reply', reply: `Say why, for example "supplier's debit note on ${supplierNote[1].toUpperCase()} 2360 - extra freight". I have recorded nothing.`, tools: [] };
    return { kind: 'tool', name: 'record_supplier_debit_note', args: { billId: supplierNote[1].toUpperCase(), amount, date: receiptDate(text, localToday()), reason: reason.replace(/,?\s*(?:note\s+)?(?:no\b\.?|number\b|#)\s*[A-Z0-9/-]+\s*$/i, '').trim().slice(0, 200), ...(noteNo ? { supplierNoteNo: noteNo.toUpperCase() } : {}) } };
  }
  if (supplierNote && !isQuestion(text) && !isNegated(text)) {
    const amount = receiptAmount(text);
    const afterBill = text.slice(text.toUpperCase().indexOf(supplierNote[1].toUpperCase()) + supplierNote[1].length);
    const reason = (text.match(/(?:because|reason|:|-)\s*([^0-9₹][^,]*?)\s*$/i) || afterBill.match(/(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s+(?:for\s+)?([A-Za-z][^,]*?)\s*$/i) || [])[1] || '';
    if (amount == null) return { kind: 'reply', reply: `Say the amount, for example "debit note for ${supplierNote[1].toUpperCase()} 1000 - goods returned". I have recorded nothing.`, tools: [] };
    if (!reason.trim()) return { kind: 'reply', reply: `Say why, for example "debit note for ${supplierNote[1].toUpperCase()} 1000 - goods returned". I have recorded nothing.`, tools: [] };
    return { kind: 'tool', name: 'create_purchase_note', args: { billId: supplierNote[1].toUpperCase(), amount, date: receiptDate(text, localToday()), reason: reason.trim().slice(0, 200) } };
  }
  const debitMatch = text.match(/\bdebit\s+note\b.*?\b(INV-\d{4,})\b/i);
  if (debitMatch && !isQuestion(text) && !isNegated(text)) {
    const amount = receiptAmount(text);
    const afterInvoice = text.slice(text.toUpperCase().indexOf(debitMatch[1].toUpperCase()) + debitMatch[1].length);
    const reason = (text.match(/(?:because|reason|:|-)\s*([^0-9₹][^,]*?)\s*$/i) || afterInvoice.match(/(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s+(?:for\s+)?([A-Za-z][^,]*?)\s*$/i) || [])[1] || '';
    if (amount == null) return { kind: 'reply', reply: `Say the amount, for example "debit note for ${debitMatch[1].toUpperCase()} 2000 - price revised". I have recorded nothing.`, tools: [] };
    if (!reason.trim()) return { kind: 'reply', reply: `Say why, for example "debit note for ${debitMatch[1].toUpperCase()} 2000 - price revised". I have recorded nothing.`, tools: [] };
    return { kind: 'tool', name: 'create_debit_note', args: { invoiceId: debitMatch[1].toUpperCase(), amount, date: receiptDate(text, localToday()), reason: reason.trim().slice(0, 200) } };
  }
  const creditMatch = text.match(/\bcredit\s+note\b.*?\b(INV-\d{4,})\b/i);
  if (creditMatch && !isQuestion(text) && !isNegated(text)) {
    const amount = receiptAmount(text);
    if (amount == null && saidNonPositiveAmount(text)) return { kind: 'reply', reply: `A credit note has to be a positive amount, for example "credit note for ${creditMatch[1].toUpperCase()} 2000 - goods returned". I have recorded nothing.`, tools: [] };
    const afterInvoice = text.slice(text.toUpperCase().indexOf(creditMatch[1].toUpperCase()) + creditMatch[1].length);
    const reason = (text.match(/(?:because|reason|:|-)\s*([^0-9₹][^,]*?)\s*$/i) || afterInvoice.match(/(?:₹|rs\.?\s*)?\d[\d,]*(?:\.\d+)?\s+(?:for\s+)?([A-Za-z][^,]*?)\s*$/i) || [])[1] || '';
    if (!reason.trim()) {
      return { kind: 'reply', reply: `Say why, for example "credit note for ${creditMatch[1].toUpperCase()} 2000 - goods returned". I have recorded nothing.`, tools: [] };
    }
    return { kind: 'tool', name: 'create_credit_note', args: { invoiceId: creditMatch[1].toUpperCase(), date: receiptDate(text, localToday()), reason: reason.trim().slice(0, 200), ...(amount == null ? {} : { amount }) } };
  }

  const decisionMatch = text.match(/\b(waive|resolve|reopen|assign)\s+(EXC-\d{6})\b(.*)$/i);
  if (decisionMatch) {
    const [, verb, id, tail] = decisionMatch;
    const note = (tail.match(/(?:because|reason|:|-)\s*(.+)$/i) || [])[1] || '';
    const owner = (tail.match(/\bto\s+([A-Za-z][A-Za-z0-9 .'-]{1,40})/i) || [])[1] || '';
    return {
      kind: 'tool',
      name: 'exception_decide',
      args: {
        id: id.toUpperCase(),
        decision: verb.toLowerCase(),
        ...(note.trim() ? { note: note.trim().slice(0, 500) } : {}),
        ...(owner.trim() ? { owner: owner.trim() } : {}),
      },
    };
  }

  const printId = text.match(/\b(INV-\d+|BILL-\d+)\b/i);
  if (printId && /print|show/i.test(text) && !/irn|einvoice|e-invoice/i.test(text)) {
    return { kind: 'tool', name: 'print_invoice', args: { id: printId[1].toUpperCase() } };
  }

  const mockIrnId = text.match(/\b((?:INV|CN|DN)-\d+)\b/i);
  if (mockIrnId && /\bmock\s*(irn|einvoice|e-invoice)\b/i.test(text)) {
    return { kind: 'tool', name: 'govt_nic_mock', args: { invoiceId: mockIrnId[1].toUpperCase() } };
  }

  const irnId = text.match(/\b((?:INV|CN|DN)-\d+)\b/i);
  if (irnId && /\birn\b|e-?invoice/i.test(text)) {
    const invoiceId = irnId[1].toUpperCase();
    if (/\bcancel/i.test(text)) return { kind: 'tool', name: 'govt_nic_cancel_irn', args: { invoiceId } };
    const negated = /\b(do\s*not|don'?t|never|stop|avoid)\b/i.test(text);
    const question = /\?\s*$/.test(text) || /^\s*(what|which|when|where|why|how|is|are|has|have|does|did|do|can|show|status)\b/i.test(text);
    if (negated || question) {
      return { kind: 'reply', reply: `Nothing was generated. To issue an IRN for ${invoiceId}, say "generate irn ${invoiceId}"; it still needs a CA approval before anything reaches the IRP.` };
    }
    return { kind: 'tool', name: 'govt_generate_irn', args: { invoiceId } };
  }

  const paidId = text.match(/\b(INV-\d+)\b/i);
  if (paidId && /\b(paid|receipt|received)\b/i.test(text)) {
    const invoiceId = paidId[1].toUpperCase();
    if (isQuestion(text) || isNegated(text)) {
      const inv = (state.invoices || []).find((i) => i.id === invoiceId);
      const status = inv ? `${invoiceId} is marked ${inv.status}.` : `${invoiceId} is not in these books.`;
      return { kind: 'reply', reply: `${status} I have recorded nothing. To record money received, say "record receipt ${invoiceId}" and confirm the preview.`, tools: [] };
    }
    let amount = soleAmountSaid(text);
    if (amount == null && saidNonPositiveAmount(text)) return { kind: 'reply', reply: `An amount of zero or less cannot be received. Say the amount, for example "received 5000 against ${invoiceId}", or leave it out to settle the whole invoice. I have recorded nothing.`, tools: [] };
    if (amount == null && amountsSaid(text).length > 1 && (state.invoices || []).some((invoice) => invoice.id === invoiceId)) {
      amount = soleAmountSaid(withoutSettledTds(text));
      if (amount == null) return severalReceiptAmounts(text, invoiceId);
    }
    return {
      kind: 'tool',
      name: 'record_receipt',
      args: { invoiceId, mode: /cash/i.test(text) ? 'cash' : 'bank', date: moneyDate(text, localToday()), ...(amount == null ? {} : { amount }) },
    };
  }

  const retag = planRetagFromChat(state, text);
  if (retag) return retag;
  const expense = planExpenseFromChat(state, text);
  if (expense) return expense;
  const chase = planCollectionFromChat(state, text);
  if (chase) return chase;
  const receipt = planReceiptWithoutInvoice(state, text);
  if (receipt) {
    if (receipt.kind !== 'tool' || receipt.name !== 'record_receipt') return receipt;
    if (saidNonPositiveAmount(text)) return { kind: 'reply', reply: 'An amount of zero or less cannot be received. Say the amount, or leave it out to settle the whole invoice. I have recorded nothing.', tools: [] };
    const said = amountsSaid(text);
    const sole = said.length > 1 ? soleAmountSaid(withoutSettledTds(text)) : (said[0] ?? null);
    if (said.length > 1 && sole == null) return severalReceiptAmounts(text, receipt.args.invoiceId);
    const kept = Object.fromEntries(Object.entries(receipt.args).filter(([key]) => key !== 'amount'));
    return { ...receipt, args: { ...kept, date: moneyDate(text, localToday()), ...(sole == null ? {} : { amount: sole }) } };
  }

  if ((isQuestion(text) || isNegated(text)) && /\b(import|attach|upload|reconcile)\b/i.test(text) && /\b(tally|zoho|bank|statement|xml|csv)\b/i.test(text)) {
    return {
      kind: 'reply',
      reply: 'Nothing was imported. Attach the file with the dropdown, then say "import tally", "import zoho", "import bank" or "import tally xml"; I will show you what it would post before anything lands in the books.',
      tools: [],
    };
  }
  if (/\bimport tally xml\b|\btally xml\b/i.test(text)) {
    const xml = pendingFileContent(state) || state.files.tallyXml;
    if (!xml) return { kind: 'reply', reply: 'Attach a Tally XML file first (dropdown: Tally XML).', tools: [] };
    return { kind: 'tool', name: 'import_tally_xml', args: { xml, fileName: state.pendingFile?.name || 'tally.xml' }, clearsPendingFile: true };
  }
  if (/\bimport tally\b|\btally day/i.test(text)) {
    const csv = pendingFileContent(state) || state.files.tally;
    if (!csv) return { kind: 'reply', reply: 'Attach a Tally Day Book CSV first (dropdown: Tally Day Book).', tools: [] };
    return { kind: 'tool', name: 'import_tally', args: { csv, fileName: state.pendingFile?.name || 'tally.csv' }, clearsPendingFile: true };
  }
  {
    const addReg = /^(?:add|register|new)\s+(?:gst\s+)?registration\s+([0-9]{2}[A-Z0-9]{13})(?:\s+(?:as|kind)\s+(apob|warehouse|branch))?(?:\s+(?:called|labelled|label)\s+(.+))?\s*$/i.exec(text.trim());
    if (addReg && !isNegated(text)) return { kind: 'tool', name: 'set_registration', args: { gstin: addReg[1].toUpperCase(), ...(addReg[2] ? { kind: addReg[2].toLowerCase() } : {}), ...(addReg[3] ? { label: addReg[3].trim() } : {}) } };
    const retire = /^(?:retire|surrender|close)\s+(?:gst\s+)?registration\s+([0-9]{2}[A-Z0-9]{13})(?:\s+(?:from|on)\s+(\d{4}-\d{2}-\d{2}))?\s*$/i.exec(text.trim());
    if (retire && !isNegated(text)) return { kind: 'tool', name: 'retire_registration', args: { gstin: retire[1].toUpperCase(), ...(retire[2] ? { effectiveTo: retire[2] } : {}) } };
    if (/^(?:gst\s+)?registrations\??$|\b(?:my|our|list)\s+(?:gst\s+)?registrations\b|\bwhich\s+gstins?\b/i.test(text.trim())) return { kind: 'tool', name: 'registrations', args: {} };
    const move = /^(?:transfer|move)\s+([\d.]+)\s+(?:of\s+)?([A-Za-z0-9][A-Za-z0-9_./-]{0,63})\s+from\s+([0-9]{2}[A-Z0-9]{13})\s+to\s+([0-9]{2}[A-Z0-9]{13})(?:\s+at\s+(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)\s*(?:each|per unit)?)?(?:\s+(?:gst\s+)?(\d{1,2})%)?\s*$/i.exec(text.trim());
    if (move && !isNegated(text)) return { kind: 'tool', name: 'record_stock_transfer', args: { sku: move[2].toUpperCase(), qty: Number(move[1]), fromGstin: move[3].toUpperCase(), toGstin: move[4].toUpperCase(), ...(move[5] ? { unitValue: Number(move[5].replace(/,/g, '')) } : {}), ...(move[6] ? { gstRate: Number(move[6]) } : {}) } };
  }
  if (/\b(?:daily|nightly|day'?s|today'?s)\s+close\b|\bclose\s+(?:status|checklist|the\s+books|of\s+the\s+day)\b|\b(?:are|is)\s+(?:the\s+|my\s+)?books\s+closed\b|\bbooks\s+closed\s*\??$|^closure\s*\??$/i.test(text) && !/\bclose\s+(?:the\s+)?year\b|\byear\s+close\b/i.test(text)) {
    const on = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
    return { kind: 'tool', name: 'daily_close', args: on ? { asOf: on[1] } : {} };
  }
  {
    const cost = /^(?:cost\s+of\s+|set\s+cost\s+(?:of\s+)?)([A-Za-z0-9][A-Za-z0-9_./-]{0,63})\s+(?:is|=|:|to|at)?\s*(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)(?:\s+(?:at|gst)\s+(\d{1,2})%)?\s*$/i.exec(text.trim());
    if (cost && !isNegated(text)) return { kind: 'tool', name: 'set_sku_cost', args: { sku: cost[1].toUpperCase(), cost: Number(cost[2].replace(/,/g, '')), ...(cost[3] ? { gstRate: Number(cost[3]) } : {}) } };
    const stock = /^stock\s+(in|out)\s+([A-Za-z0-9][A-Za-z0-9_./-]{0,63})\s+([\d.]+)(?:\s+(?:at|to|from|in)\s+([A-Za-z0-9][A-Za-z0-9 _-]{0,39}))?\s*$/i.exec(text.trim());
    if (stock && !isNegated(text)) return { kind: 'tool', name: 'record_stock', args: { sku: stock[2].toUpperCase(), qty: stock[1].toLowerCase() === 'in' ? Number(stock[3]) : -Number(stock[3]), ...(stock[4] ? { location: stock[4].trim().toLowerCase() } : {}) } };
    if (/\bimport\s+(?:sku\s+)?costs?\b|\bsku\s+costs?\s+(?:file|csv|sheet)\b/i.test(text) && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      if (!csv) return { kind: 'reply', reply: 'Attach a sheet with sku and cost columns (name and HSN optional), then say "import sku costs".', tools: [] };
      return { kind: 'tool', name: 'import_sku_costs', args: { csv }, clearsPendingFile: true };
    }
    const margins = /\bmargins?\b.*\b(?:sku|channel|product)s?\b|\b(?:sku|product|channel)\s+margins?\b|\bwhich\s+(?:skus?|products?)\s+(?:make|lose|earn)\b|\bmargins?\s+(?:for|in)\s+(\d{4}-\d{2})\b|^margins?\??$/i.exec(text);
    if (margins) {
      const period = /\b(\d{4}-(?:0[1-9]|1[0-2]))\b/.exec(text);
      const channel = /\b(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay)\b/i.exec(text);
      return { kind: 'tool', name: 'sku_margins', args: { ...(period ? { period: period[1] } : {}), ...(channel ? { channel: channel[1].toLowerCase() } : {}) } };
    }
    const valuing = /^value\s+(?:the\s+)?(?:inventory|stock)(?:\s+(?:at|as\s+at|on|as\s+of)\s+(\d{4}-\d{2}-\d{2}))?\s*$/i.exec(text.trim());
    if (valuing && !isNegated(text)) return { kind: 'tool', name: 'value_inventory', args: valuing[1] ? { asOf: valuing[1] } : {} };
    if (/\b(?:inventory|stock)\s+valuations?\b|\bwhat\s+is\s+(?:my\s+)?(?:inventory|stock)\s+worth\b|\bvalue\s+of\s+(?:my\s+)?(?:inventory|stock)\b/i.test(text)) return { kind: 'tool', name: 'inventory_valuations', args: {} };
    const history = /\b(?:stock\s+(?:history|movements?|moves)|movements?\s+of)\s*(?:of\s+|for\s+)?([A-Za-z0-9][A-Za-z0-9_./-]{0,63})?\s*\??$/i.exec(text.trim());
    if (history) return { kind: 'tool', name: 'stock_moves', args: history[1] ? { sku: history[1].toUpperCase() } : {} };
    if (/\bstock\s+(?:on\s+hand|position|level|left|balance)\b|\bhow\s+much\s+stock\b|\bstock\s+(?:at|in)\s+[A-Za-z]/i.test(text)) {
      const location = /\bstock\s+(?:at|in)\s+([A-Za-z0-9][A-Za-z0-9 _-]{0,39}?)\s*\??$/i.exec(text.trim());
      return { kind: 'tool', name: 'stock_position', args: location ? { location: location[1].trim().toLowerCase() } : {} };
    }
  }
  {
    const identity = /^(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay)\s+(?:gstin|tan)\b/i.exec(text.trim());
    if (identity && !isQuestion(text)) {
      const gstin = /\bgstin\s*[:#]?\s*([0-9]{2}[A-Z0-9]{13})\b/i.exec(text);
      const tan = /\btan\s*[:#]?\s*([A-Z]{4}[0-9]{5}[A-Z])\b/i.exec(text);
      return { kind: 'tool', name: 'set_channel_identity', args: { channel: identity[1].toLowerCase(), ...(gstin ? { gstin: gstin[1].toUpperCase() } : {}), ...(tan ? { tan: tan[1].toUpperCase() } : {}) } };
    }
    if (/\bimport\s+(?:the\s+)?tcs\s+(?:credit\s+)?(?:statement|received|credits?)\b|\btds\s+and\s+tcs\s+credit\s+received\b/i.test(text) && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      if (!csv) return { kind: 'reply', reply: 'Attach the "TDS and TCS credit received" statement from the GST portal (operator GSTIN, period, integrated, central and state tax), then say "import tcs statement".', tools: [] };
      return { kind: 'tool', name: 'import_tcs_statement', args: { csv }, clearsPendingFile: true };
    }
    if (/\b(?:import|upload)\s+(?:(?:the|my)\s+)?(?:form\s+)?26\s*as\b|\b26\s*as\s+(?:credits?|194-?o)\b/i.test(text) && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      if (!csv) return { kind: 'reply', reply: 'Attach Form 26AS as a CSV or text table (section, TAN of deductor, tax deducted, date), then say "import 26AS". Every section is read: the 194-O credits marketplaces deposited and the TDS your customers deducted.', tools: [] };
      return { kind: 'tool', name: 'import_26as_credits', args: { csv }, clearsPendingFile: true };
    }
    if (/\b(?:tcs|194-?o|tds\s+194)\b.*\b(?:credits?|claim|status|available|deducted)\b|\b(?:marketplace|amazon|flipkart)\s+(?:tcs|tds)\b|\btcs\s+and\s+tds\b/i.test(text)) {
      return { kind: 'tool', name: 'marketplace_credits', args: {} };
    }
  }
  {
    const orders = /\bimport\s+(?:the\s+)?(?:(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay|quick[\s-]?commerce)\s+)?(?:orders?|mtr|order\s+report|sales\s+report|gst\s+report)\b/i.exec(text);
    if (orders && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      const fetchedOrders = !csv && orders[1] ? state.attachments?.[`channel:${orders[1].toLowerCase()}:orders`] : null;
      if (!csv && fetchedOrders) return { kind: 'tool', name: 'import_marketplace_orders', args: { documentSha256: fetchedOrders.sha256, channel: orders[1].toLowerCase() } };
      if (!csv) return { kind: 'reply', reply: 'Attach the order report first (Amazon MTR, Flipkart GST report, or any sheet with order id, date, delivery state, GST rate and taxable value), then say "import amazon orders". Each day and state becomes one invoice to unregistered buyers after you see the preview; returns become credit notes.', tools: [] };
      const channel = orders[1] ? orders[1].toLowerCase().replace(/\s+/, '-') : undefined;
      return { kind: 'tool', name: 'import_marketplace_orders', args: { csv, ...(channel ? { channel } : {}) }, clearsPendingFile: true };
    }
  }
  {
    const fetching = /^(?:[f]etch|pull|download)\s+(?:the\s+)?(amazon|shopify|razorpay)\s+(settlement|payout|orders?)s?(?:\s+(?:report|file))?(?:\s+(?:from|since)\s+(\d{4}-\d{2}-\d{2}))?(?:\s+(?:to|until)\s+(\d{4}-\d{2}-\d{2}))?\s*$/i.exec(text.trim());
    if (fetching && !isNegated(text)) return { kind: 'tool', name: 'fetch_channel_report', args: { channel: fetching[1].toLowerCase(), kind: /^order/i.test(fetching[2]) ? 'orders' : 'settlement', ...(fetching[3] ? { from: fetching[3] } : {}), ...(fetching[4] ? { to: fetching[4] } : {}) } };
    if (/^(?:sync|[f]etch|pull)\s+(?:all\s+)?(?:channels?|marketplaces?|connectors?)\s*$/i.test(text.trim()) && !isNegated(text)) return { kind: 'tool', name: 'sync_channels', args: {} };
    const zohoPush = /^\s*(?:push|send|sync)\s+(?:the\s+)?(?:invoices\s+)?(?:to\s+)?zoho(?:\s+books)?(?:\s+(?:invoices|for))?\s*(\d{4}-\d{2})?\s*(?:with\s+approval\s+([A-Za-z0-9-]+))?\s*$/i.exec(text);
    if (zohoPush && !isNegated(text)) return { kind: 'tool', name: 'push_zoho_invoices', args: { ...(zohoPush[1] ? { period: zohoPush[1] } : {}), ...(zohoPush[2] ? { caApprovalId: zohoPush[2] } : {}) } };
    if (/\b(?:channel|marketplace)\s+connectors?\b|\bconnected\s+channels\b|\bwhich\s+channels\s+are\s+connected\b/i.test(text)) return { kind: 'tool', name: 'channel_connectors', args: {} };
  }
  {
    const settle = /\bimport\s+(?:the\s+)?(?:(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay|quick[\s-]?commerce)\s+)?(?:settlement|payout)s?\b(?:\s+(?:report|file|csv))?(?:.*?\b(?:bank|received|got|paid)\s+(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?))?/i.exec(text);
    if (settle && !isQuestion(text)) {
      const csv = pendingFileContent(state);
      const fetchedSettlement = !csv && settle[1] ? state.attachments?.[`channel:${settle[1].toLowerCase()}:settlement`] : null;
      if (!csv && fetchedSettlement) return { kind: 'tool', name: 'import_settlement', args: { documentSha256: fetchedSettlement.sha256, channel: settle[1].toLowerCase(), ...(settle[2] ? { bankAmount: Number(settle[2].replace(/,/g, '')) } : {}) } };
      if (!csv) return { kind: 'reply', reply: 'Attach the settlement or payout report first (Amazon settlement CSV, Flipkart settlement sheet, or any sheet with sale, fees and settlement value per order), then say "import settlement". Add "bank received 1,23,456" if the bank credit is not in the books yet.', tools: [] };
      const channel = settle[1] ? settle[1].toLowerCase().replace(/\s+/, '-') : undefined;
      const bankAmount = settle[2] ? Number(settle[2].replace(/,/g, '')) : undefined;
      return { kind: 'tool', name: 'import_settlement', args: { csv, ...(channel ? { channel } : {}), ...(bankAmount != null ? { bankAmount } : {}) }, clearsPendingFile: true };
    }
    const paid = /\b(?:did|has|have)\s+(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay)\s+(?:pay|paid|settle|settled)\b|\b(amazon|flipkart|myntra|nykaa|meesho|shopify|razorpay)\s+(?:payout|payouts|settlement|settlements)\b|\bsettlement\s+status\b|\b(?:marketplace\s+)?payouts?\s+(?:status|so far|this month)\b/i.exec(text);
    if (paid) {
      const channel = (paid[1] || paid[2] || '').toLowerCase();
      return { kind: 'tool', name: 'settlement_status', args: channel ? { channel } : {} };
    }
  }
  if (/\bimport\s+(?:pos|counter|daily)\s*(?:sales)?\b|\b(?:pos|counter)\s+sales\s+(?:csv|file|import)\b/i.test(text)) {
    const csv = pendingFileContent(state);
    if (!csv) return { kind: 'reply', reply: 'Attach the daily sales CSV from your billing counter first (date, GST rate, taxable value, and the GST if it has it), then say "import pos sales". Each day becomes one walk-in invoice by rate after you see the preview.', tools: [] };
    return { kind: 'tool', name: 'import_pos_sales', args: { csv }, clearsPendingFile: true };
  }
  if (/\bimport\s+(?:quickbooks|qbo|xero)\b|\b(?:quickbooks|xero)\s+(?:invoices|export|csv)\b/i.test(text)) {
    const csv = pendingFileContent(state);
    if (!csv) return { kind: 'reply', reply: 'Attach the QuickBooks or Xero invoice CSV first, then say "import xero" or "import quickbooks". I will show what would post before anything lands in the books.', tools: [] };
    const jurisdiction = (text.match(/\b(?:tax|jurisdiction)\s+([A-Z]{2}(?:-[A-Z0-9]{2,20})?)\b/) || [])[1];
    return { kind: 'tool', name: 'import_us_invoices', args: { csv, ...(jurisdiction ? { taxJurisdiction: jurisdiction } : {}) }, clearsPendingFile: true };
  }
  if (/\bimport zoho\b|\bzoho books\b/i.test(text)) {
    const csv = pendingFileContent(state) || state.files.zoho;
    if (!csv) return { kind: 'reply', reply: 'Attach a Zoho Books invoice CSV first.', tools: [] };
    return { kind: 'tool', name: 'import_zoho', args: { csv }, clearsPendingFile: true };
  }
  if (/\bimport bank\b|\bbank statement\b|\bimport\s+(?:account\s+aggregator|aa)\s+(?:data|file|json|statement)\b|\baccount\s+aggregator\s+(?:data|file|json)\b/i.test(text)) {
    const content = pendingFileContent(state) || state.files.bank;
    if (!content) return { kind: 'reply', reply: 'Attach a bank CSV or TXT, or the Account Aggregator FI data JSON, first.', tools: [] };
    const name = state.pendingFile?.name || '';
    return { kind: 'tool', name: 'import_bank', args: { content, type: /\.json$/i.test(name) || /account\s+aggregator|\baa\b/i.test(text) ? 'aa' : /\.txt$/i.test(name) ? 'text' : 'csv' }, clearsPendingFile: true };
  }
  if (excel) return excel;

  for (const route of ROUTES) {
    if (!route.re.test(text)) continue;
    const period = PERIOD_TOOLS.has(route.tool) ? saidPeriod(text) : '';
    return { kind: 'tool', name: route.tool, args: period ? { period } : {} };
  }

  if (doc) {
    return { kind: 'reply', reply: 'Say “invoice …” to sell or “purchase from …” to book a supplier bill, with a rate and GST %.', tools: [] };
  }

  return { kind: 'tool', name: 'company_profile', args: {}, fallback: true };
}

function reviewPeriodSaid(state, text) {
  const iso = text.match(/\b(\d{4}-(?:0[1-9]|1[0-2]))\b/);
  if (iso) return iso[1];
  const lower = text.toLowerCase();
  const index = MONTH_NAMES.findIndex((name) => new RegExp(`\\b${name.slice(0, 3)}(?:${name.slice(3)})?\\b`).test(lower));
  if (index < 0) return undefined;
  const wanted = String(index + 1).padStart(2, '0');
  const known = (reviewOf(state).data?.periods || []).filter((period) => period.endsWith(`-${wanted}`));
  return known.at(-1) || `${localToday().slice(0, 4)}-${wanted}`;
}

function monthSaid(text) {
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const lower = text.toLowerCase();
  const index = MONTH_NAMES.findIndex((name) => new RegExp(`\\b${name.slice(0, 3)}(?:${name.slice(3)})?\\b`).test(lower));
  const today = localToday();
  if (index < 0) return today.slice(0, 7);
  const [y, m] = today.split('-').map(Number);
  const year = index + 1 <= m ? y : y - 1;
  return `${year}-${String(index + 1).padStart(2, '0')}`;
}

function quarterSaid(text) {
  const said = text.match(/\b(?:FY\s*)?(\d{4}-\d{2})\s*[-,]?\s*Q([1-4])\b|\bQ([1-4])\b(?:\s*(?:of\s*|,\s*|FY\s*)?(\d{4}-\d{2}))?/i);
  if (!said) return '';
  const quarter = said[2] || said[3];
  const fy = said[1] || said[4];
  if (fy) return parseQuarter(`Q${quarter} ${fy}`)?.label || '';
  const today = localToday();
  const year = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? year : year - 1;
  return `Q${quarter} ${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function planTdsReview(state, text, form = 'other') {
  const review = tdsReviewOf(state, quarterSaid(text) || undefined, form);
  if (!review.ok) {
    if (review.error === 'NOT_A_DEDUCTOR') return { kind: 'reply', reply: 'This business is not set up to deduct TDS. Say "we deduct TDS, TAN" followed by your TAN to start.', tools: [] };
    if (review.error === 'NO_DEDUCTIONS') return { kind: 'reply', reply: form === 'salary' ? 'No salary TDS has been deducted yet; approve a payroll month first.' : 'No TDS has been deducted yet, so there is no statement to review.', tools: [] };
    return { kind: 'reply', reply: 'I could not read the quarter. Say it like "review TDS for Q2 2026-27".', tools: [] };
  }
  const data = review.data;
  if (data.empty) return { kind: 'reply', reply: `Nothing was deducted in ${data.period}, so there is nothing to review.`, tools: [] };
  if (data.approved) return { kind: 'reply', reply: `You approved the ${data.period} TDS statement on ${data.approval.on}. Nothing has changed since.`, tools: [] };
  const step = data.steps.find((item) => item.id === data.next);
  return {
    kind: 'tool',
    name: 'tds_review_answer',
    args: { period: data.period, ...(form === 'salary' ? { form } : {}), step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: data.draftHash },
  };
}

function planReview(state, text) {
  const review = reviewOf(state, reviewPeriodSaid(state, text));
  if (!review.ok) return { kind: 'reply', reply: 'I could not read the month. Say it like "review GST for September" or "review GST 2026-09".', tools: [] };
  const data = review.data;
  if (data.empty) return { kind: 'reply', reply: `There are no sales, purchases or credit notes dated in ${data.month}, so there is nothing to review.`, tools: [] };
  if (data.approved) return { kind: 'reply', reply: `You approved the ${data.month} figures on ${data.approval.on}. Nothing has changed since. Save the GSTR-1 file from Taxes, or send it to your CA.`, tools: [] };
  const step = data.steps.find((item) => item.id === data.next);
  return {
    kind: 'tool',
    name: 'gst_review_answer',
    args: { period: data.period, step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: data.draftHash },
  };
}
