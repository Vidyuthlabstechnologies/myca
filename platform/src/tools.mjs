import { tally, bank, gstin, filing, audit } from './sprint-load.mjs';
import { invoiceTemplate, setInvoiceTemplate } from './invoice-template.mjs';
import { importSettlement, settlementStatus } from './settlements.mjs';
import { importMarketplaceOrders, postSettlement } from './marketplace-orders.mjs';
import { setChannelIdentity, importTcsStatement, import26asCredits, marketplaceCredits } from './marketplace-credits.mjs';
import { recordTdsWithheld, tdsCreditCheck } from './tds-credits.mjs';
import { setSkuCost, importSkuCosts, recordStock, stockPosition, skuMargins, stockMoves } from './sku-margins.mjs';
import { dailyClose } from './daily-close.mjs';
import { regArg, companyAs, forRegistration, setRegistration, retireRegistration, listRegistrations } from './registrations.mjs';
import { recordStockTransfer } from './stock-transfers.mjs';
import { valueInventory, listInventoryValuations } from './inventory.mjs';
import { saveChannelConfig, listConnectors, fetchChannelReport, syncChannels } from './channel-connectors.mjs';
import { saveGstr1ToPortal, fileGstr1OnPortal, generateTdsFvu, portalStatus, filingApprovalSubject } from './portal-filing.mjs';
import { saveGstr3bToPortal, gstr3bPortalLiability, offsetGstr3bOnPortal, fileGstr3bOnPortal } from './gstr3b-portal.mjs';
import { aaBankFeed } from './aa-import.mjs';
import { askKnowledge } from './knowledge.mjs';
import { askTax, reviewIncomeTaxReturn, taxModules, taxPlan } from './tax-assistant.mjs';
import { pushZohoInvoices } from './zoho-push.mjs';
import { booksAuditLedger } from './audit-ledger.mjs';
import { salaryPrivate } from './employees.mjs';
import { collectionDrafts, recordCollectionReminder } from './collections.mjs';
import { paymentRun, recordPaymentRun } from './payment-run.mjs';
import { weeklyBrief } from './weekly-brief.mjs';
import { monthCloseOf, approveMonthClose } from './month-close.mjs';
import { restockPlan, setSkuSupply, recordPurchaseOrder } from './restock.mjs';
import { advanceTax, recordAdvanceTaxPayment } from './advance-tax.mjs';
import { setSupplierBank, supplierPayoutFile } from './supplier-bank.mjs';
import { attachDocument } from './receipt-match.mjs';
import { saveReport, runReport, listReports, deleteReport } from './reports.mjs';
import { pushTally } from './tally-push.mjs';
import { listDscCertificates, signWithDsc } from './dsc.mjs';
import { suggestExpenseHead } from './expense-head-model.mjs';
const ingestTally = tally.ingest;
const ingestBank = bank.ingest;
const { validateGstin } = gstin;
const { filingPrep } = filing;
const { auditRun } = audit;
import { listAccounts, journal, trialBalance, verifyChain, createTransfers, paise } from './ledger.mjs';
import { createInvoice, recordReceipt, recordPayment, invoicesToSalesCsv, createPurchase, purchasesToInwardCsv, printInvoice, addBillTds } from './invoice.mjs';
import { invoiceDocument, quoteDocument } from './invoice-document.mjs';
import { createQuote, markQuote, convertQuote, listQuotes } from './quotes.mjs';
import { addRecurring, stopRecurring, listRecurring, runRecurring } from './recurring.mjs';
import { postExpense, retagExpense, listExpenses, expenseHeads } from './expenses.mjs';
import { businessSummary } from './business-summary.mjs';
import { gstr3bFor, periodSummary } from './period-summary.mjs';
import { createCreditNote, cancelInvoice, creditNotesForPeriod } from './credit-notes.mjs';
import { createDebitNote, createPurchaseNote, debitNotesForPeriod, purchaseNotesForPeriod } from './debit-notes.mjs';
import { reviewOf, answerReview } from './gst-review.mjs';
import { exportEntries } from './entries-export.mjs';
import { exportTallyXml } from './tally-export.mjs';
import { reportSheet } from './report-sheets.mjs';
import { auditTrail } from './audit-trail.mjs';
import { import2b, creditAtRisk, reconcileDocuments } from './gstr2b-check.mjs';
import { imsReview, decideIms } from './ims.mjs';
import { booksCheck } from './books-check.mjs';
import { deadlineRun, filingRows } from './deadline-run.mjs';
import { listFilings, recordFiling } from './filings.mjs';
import { draftSupplierReminder, recordSupplierReminder } from './supplier-reminders.mjs';
import { addEmployee, changeSalary, endEmployment, listEmployees, setEmployeeBank } from './employees.mjs';
import { payrollFor, approvePayroll, recordSalaryPayment, listPayroll, payslip } from './payroll.mjs';
import { pfEcr, esiReturn, payrollPayoutFile } from './payroll-files.mjs';
import { countryOf, isCountry, toolServesCountry } from './country.mjs';
import { createUsInvoice, createUsPurchase, setSalesTaxRate, listSalesTaxRates, setContractor, contractorPayments } from './us-sales.mjs';
import { rulesStatus } from './rules-status.mjs';
import { runDailyAutomation, automationStatus } from './automation.mjs';
import { readDocument } from './document-reader.mjs';
import { amendInvoice, listAmendments } from './invoice-amendments.mjs';
import { scheduleSe } from './us-se-tax.mjs';
import { scheduleCDocument, cpaPack } from './us-cpa-pack.mjs';
import { form941File, w2File } from './us-payroll-files.mjs';
import { usPayrollFor, approveUsPayroll, listUsPayroll, usPayslip, usPayrollFilings, setWithholding, setSutaRate, listSutaRates } from './us-payroll.mjs';
import { scheduleCSummary, estimatedTaxDates } from './us-owner-tax.mjs';
import { importUsInvoices } from './import-us-books.mjs';
import { exportTrialBalance } from './trial-balance-export.mjs';
import { profitAndLoss, balanceSheet, cashFlow, customerStatement } from './statements.mjs';
import { salaryAnnexureII } from './salary-annexure.mjs';
import { recordSupplierNote } from './supplier-notes.mjs';
import { tdsCertificates } from './tds-certificates.mjs';
import { importPosSales } from './import-pos.mjs';
import { contractor1099File } from './us-1099.mjs';
import { usBankMatrix } from './us-bank.mjs';
import { recordGstPayment, listGstPayments } from './gst-pay-record.mjs';
import { gstr9Draft } from './gstr9.mjs';
import { closeYear, listYearClosings } from './year-close.mjs';
import { weekAhead } from './week-ahead.mjs';
import { exportGstr1Quarter, exportIff } from './gstr1-quarter.mjs';
import { setNexus, listNexus, salesTaxReturn, salesTaxReviewOf, answerSalesTaxReview, recordSalesTaxPayment, recordSalesTaxFiling, salesTaxOverview } from './us-sales-tax.mjs';
import { recordTdsDeposit, setDeductor, tdsSummary } from './tds-deduction.mjs';
import { paymentFor, setCreditOpening } from './gst-payment.mjs';
import { tdsReturnDraft } from './tds-return.mjs';
import { setTransport, recordShare, ewayBillStatus, transportPayload } from './eway-bill.mjs';
import { ensureParty } from './invoice.mjs';
import { tdsReviewOf, answerTdsReview } from './tds-review.mjs';
import { addReminder, completeReminder, listReminders } from './reminders.mjs';
import { cashForecast, canAfford, setCashBalance, canMakePayroll } from './cash-forecast.mjs';
import { setPaymentTerms } from './payment-terms.mjs';
import { setSupplierTerms, supplierDues } from './supplier-dues.mjs';
import { requestDocuments, recordDocumentReceived, documentRequests, correctEval, evalEvents, searchFirmNotes } from './practice.mjs';
import { askCa, replyCa, closeCa, listCaRequests } from './ca-requests.mjs';
import { postTallyRows, postBankRows, purchaseRegisterCsv } from './post-import.mjs';
import { recordStatementLines, bankReconciliation, matchBankLine, unmatchBankLine, bookBankCharges, setBankAccount, listBankAccounts, recordTransfer, accountFor } from './bank-recon.mjs';
import { addBankRule, removeBankRule, listBankRules, runBankRules } from './bank-rules.mjs';
import { parseZohoBooksCsv } from './import-zoho.mjs';
import { invoicesToGstr1Json } from './gstr1-json.mjs';
import { tallyXmlToDayBookCsv } from './tally-xml.mjs';
import { saveGovtConfig, publicGovtConfig, saveNicPublicKey } from './nic-config.mjs';
import * as nicActions from './nic-actions.mjs';
import { nicSessionStatus } from './action-gate.mjs';
import { clearIntegrationConnection, integrationReadiness, setIntegrationConnection } from './integration-contract.mjs';
import { listClients, registerClient, setActiveClient, listDocuments, uploadDocument, getDocumentContent } from './ca-api.mjs';
import { lockPeriod, unlockPeriod, isPeriodLocked, lockThrough } from './period-lock.mjs';
import { localToday, postingDate } from './dates.mjs';
import { documentsForPeriod, fpOf, taxByHead } from './return-period.mjs';
import { buildInvoiceShare, shareLink, queueNotification, listOutbox, sendNotification } from './notifications.mjs';
import { providerDoctor } from './provider-doctor.mjs';
import { providerCatalog, providerRequirementMap } from './provider-catalog.mjs';
import { sandboxAdapterPlan } from './sandbox-adapter-contract.mjs';
import { getSandboxClient, resetSandboxClient } from './sandbox-client.mjs';
import { saveSandboxKeys, publicSandboxKeys, clearSandboxKeys } from './sandbox-keys.mjs';
import { plaidLinkSandbox, plaidLinkToken, plaidExchange, taxjarRate, gustoConnectUrl, gustoCallback, usConnectorsStatus } from './us-connectors.mjs';
import { track1099Csv, track1099Issuers, track1099Import, track1099Job } from './track1099.mjs';
import { postPayrollImport, listPayrollImports } from './us-payroll-import.mjs';
import { getNimClient } from './nim-client.mjs';
import { runSandboxOperation } from './sandbox-adapter.mjs';
import { requestApproval, decideApproval, approvalStatus, normalizeActor } from './approvals.mjs';
import { normalizeClientId, getBook } from './books.mjs';
import { refreshExceptions, listExceptions, summarise, decideException } from './exceptions.mjs';
import { appendAuditEvent } from './ca-api.mjs';
import { liveCallsEnabled, mockModeEnabled } from './runtime-config.mjs';
import { seedDemo } from './store.mjs';
import { ENGINE_TOOL_DEFS } from './countries/manifests.mjs';
import { runEngineTool } from './countries/engines.mjs';

function ok(data) {
  return { ok: true, data };
}
function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function resolveToolActor(args = {}, idKey = 'actorId', fallbackUserId = 'ca') {
  return normalizeActor({ userId: args[idKey] || fallbackUserId, role: args.role || '' });
}


const HELD_BACK_REASONS = new Set([
  'gst_rate_unknown', 'gst_rate_unreadable', 'gst_rates_unknown_on_date', 'gst_rate_missing',
  'tax_does_not_match_rate', 'tax_exceeds_amount', 'period_locked', 'blocking', 'INVALID_DATE', 'DUPLICATE_ID',
]);

function heldBackFrom(skipped = []) {
  return skipped
    .filter((s) => HELD_BACK_REASONS.has(String(s.reason)) || String(s.reason).startsWith('rate_not_in_force'))
    .slice(0, 100)
    .map((s) => ({ ref: String(s.voucherNo ?? s.sourceRow ?? s.id ?? '?'), reason: String(s.reason) }));
}

function reconcileFor(state, asOfDate) {
  const purchaseRegister = state.files.purchaseRegister || purchaseRegisterCsv(state.purchases || []);
  const gstr1 = state.files.gstr1 || invoicesToSalesCsv(state.invoices || []);
  if (!state.files.gstr2b || !state.files.gstr3b) return null;
  return reconcileDocuments(
    { purchaseRegisterText: purchaseRegister, gstr2bText: state.files.gstr2b, gstr1Text: gstr1, gstr3bText: state.files.gstr3b },
    { clientGstin: state.company.gstin, asOfDate, supplierFilings: undefined },
  );
}

function activeClientId(state) {
  return normalizeClientId(state.activeClientId);
}

export const TOOLS = [
  {
    name: 'company_profile',
    title: 'Company profile',
    description: 'Show the active business GSTIN, FY and books status.',
    run: (state) => ok({
      company: state.company,
      invoices: (state.invoices || []).length,
      purchases: (state.purchases || []).length,
      parties: (state.parties || []).length,
      chain: verifyChain(state.ledger),
    }),
  },
  {
    name: 'set_company',
    title: 'Set business profile',
    description: 'Set this book\'s own business identity (name, GSTIN, PAN, state, FY, address; country and EIN before anything is posted). Affects future postings only; history is untouched.',
    args: ['name', 'gstin', 'pan', 'state', 'fy', 'address', 'city', 'pin', 'entityType', 'country', 'ein', 'invoiceNumbering'],
    run: (state, args = {}) => {
      const company = state.company;
      const patch = {};
      if (args.country != null) {
        const code = String(args.country).trim().toUpperCase();
        if (!isCountry(code)) return fail('UNKNOWN_COUNTRY', { country: code });
        if (code !== countryOf(state) && (state.ledger?.transfers || []).length) return fail('COUNTRY_FIXED', { country: countryOf(state) });
        patch.country = code;
      }
      if (args.invoiceNumbering != null) {
        const mode = String(args.invoiceNumbering).trim().toLowerCase();
        if (!['continuous', 'yearly'].includes(mode)) return fail('BAD_NUMBERING', { invoiceNumbering: mode, hint: 'continuous or yearly' });
        patch.invoiceNumbering = mode;
      }
      if (args.ein != null) {
        const ein = String(args.ein).trim();
        if (ein && !/^\d{2}-?\d{7}$/.test(ein)) return fail('INVALID_EIN');
        patch.ein = ein;
      }
      if (args.name != null) {
        const name = String(args.name).trim();
        if (!name) return fail('COMPANY_NAME_REQUIRED');
        patch.name = name;
      }
      if (args.gstin != null) {
        const gstinIn = String(args.gstin).trim().toUpperCase();
        if (gstinIn) {
          const v = validateGstin(gstinIn);
          if (!v.ok) return fail('INVALID_GSTIN', { errors: v.errors });
          patch.gstin = gstinIn;
          if (args.state == null) patch.state = gstinIn.slice(0, 2);
          if (args.pan == null && !company.pan) patch.pan = gstinIn.slice(2, 12);
        } else {
          patch.gstin = '';
        }
      }
      if (args.state != null) {
        const st = String(args.state).trim();
        if (st && !/^\d{2}$/.test(st)) return fail('INVALID_STATE_CODE');
        patch.state = st;
      }
      if (args.pan != null) {
        const pan = String(args.pan).trim().toUpperCase();
        if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return fail('INVALID_PAN');
        patch.pan = pan;
      }
      if (args.fy != null) {
        const fy = String(args.fy).trim();
        if (fy && !/^\d{4}-\d{2}$/.test(fy)) return fail('INVALID_FY');
        patch.fy = fy;
      }
      for (const key of ['address', 'city', 'entityType']) {
        if (args[key] != null) patch[key] = String(args[key]).trim();
      }
      if (args.pin != null) {
        const pin = String(args.pin).trim();
        if (pin && !/^\d{6}$/.test(pin)) return fail('INVALID_PIN');
        patch.pin = pin ? Number(pin) : '';
      }
      Object.assign(company, patch);
      if (company.name && company.setupNeeded) delete company.setupNeeded;
      return ok({ company });
    },
  },
  {
    name: 'list_clients',
    title: 'List clients',
    description: 'List registered clients and the currently active book.',
    run: (state) => ok(listClients(state)),
  },
  {
    name: 'add_client',
    title: 'Add client',
    description: 'Register a client with its own isolated book (own ledger, invoices, sequences).',
    args: ['clientId', 'name', 'gstin', 'pan', 'state', 'entityType', 'turnover', 'gstFrequency', 'auditRequired'],
    run: (state, args = {}) => {
      const out = registerClient(state, args);
      return out.ok ? ok(out) : fail(out.error);
    },
  },
  {
    name: 'set_active_client',
    title: 'Switch active client',
    description: 'Switch the app to another client\'s books. Use SELF for the firm\'s own books.',
    args: ['clientId'],
    run: (state, args = {}) => {
      const out = setActiveClient(state, args.clientId);
      return out.ok ? ok(out) : fail(out.error);
    },
  },
  {
    name: 'list_documents',
    title: 'List documents',
    description: 'List documents filed against the active client.',
    run: (state) => {
      const out = listDocuments(state, state.activeClientId || 'SELF');
      return out.ok ? ok(out.data) : fail(out.error);
    },
  },
  {
    name: 'save_document',
    title: 'File a document',
    description: 'File a text document against the active client (metadata in state, bytes content-addressed on disk).',
    args: ['kind', 'fileName', 'contentType', 'content'],
    run: (state, args = {}) => {
      if (args.content == null) return fail('content required');
      const out = uploadDocument(state, state.activeClientId || 'SELF', { ...args, actorId: 'renderer' });
      return out.ok ? ok(out.data) : fail(out.error);
    },
  },
  {
    name: 'get_document',
    title: 'Read a document',
    description: 'Return the stored content of a document for the active client.',
    args: ['documentId'],
    run: (state, args = {}) => {
      if (!args.documentId) return fail('documentId required');
      const out = getDocumentContent(state, state.activeClientId || 'SELF', args.documentId);
      return out.ok ? ok(out.data) : fail(out.error);
    },
  },
  {
    name: 'lock_period',
    title: 'Lock period',
    description: 'Lock the active book through a date so no new posting can be dated on or before it.',
    args: ['through', 'reason'],
    run: (state, args = {}) => {
      const out = lockPeriod(state, args.through, args.reason);
      return out.ok ? ok(out) : fail(out.error);
    },
  },
  {
    name: 'unlock_period',
    title: 'Unlock period',
    description: 'Remove the period lock on the active book (record the reason).',
    args: ['reason'],
    run: (state, args = {}) => {
      const before = lockThrough(state);
      const out = unlockPeriod(state);
      return ok({ ...out, was: before, reason: String(args.reason || '') });
    },
  },
  {
    name: 'period_status',
    title: 'Period lock status',
    description: 'Show the period lock on the active book and on every registered client.',
    run: (state) => {
      const root = state.__root || state;
      const rows = [{ clientId: 'SELF', lockThrough: root.lockThrough || '' }];
      for (const client of root.clients || []) {
        rows.push({ clientId: client.clientId, lockThrough: root.extraBooks?.[client.clientId]?.lockThrough || '' });
      }
      return ok({ activeClientId: String(root.activeClientId || 'SELF'), lockThrough: lockThrough(state), rows });
    },
  },
  {
    name: 'share_invoice',
    title: 'Share invoice',
    description: 'Build an invoice message, queue it in the outbox, and return an email/WhatsApp link to send it from this PC.',
    args: ['invoiceId', 'channel', 'to'],
    run: (state, args = {}) => {
      const root = state.__root || state;
      const built = buildInvoiceShare(state, args.invoiceId, { channel: args.channel, to: args.to });
      if (!built.ok) return fail(built.error);
      const queued = queueNotification(root, built.draft, { createdBy: args.createdBy || 'ca' });
      if (!queued.ok) return fail(queued.error);
      return ok({ message: queued.message, link: shareLink(built.draft), draft: built.draft });
    },
  },
  {
    name: 'record_share',
    title: 'Record that an invoice was shared',
    description: 'Note that the owner handed an invoice or quote to another app to send, or printed it, so the audit log shows who shared what and when. A cancelled share records nothing. MyCA cannot know whether it was delivered.',
    args: ['invoiceId', 'channel', 'outcome', 'to'],
    run: (state, args = {}) => recordShare(state, args),
  },
  {
    name: 'set_party_address',
    title: 'Customer address',
    description: 'Record a customer\'s address so it prints on their invoices (Rule 46 needs it for a registered buyer and for large sales to an unregistered one).',
    args: ['partyName', 'partyGstin', 'address'],
    run: (state, args = {}) => {
      const name = String(args.partyName || '').trim();
      const address = String(args.address || '').trim();
      if (!name) return fail('CUSTOMER_REQUIRED');
      if (!address) return fail('ADDRESS_REQUIRED');
      const party = ensureParty(state, { name, gstin: args.partyGstin, address });
      return ok({ party: { name: party.name, gstin: party.gstin, address: party.address } });
    },
  },
  {
    name: 'set_business_address',
    title: 'Business address',
    description: 'Record this business\'s own address, city and PIN code. They print on invoices and go into e-invoices and e-way bills. Changes no figure.',
    args: ['address', 'city', 'pin'],
    run: (state, args = {}) => {
      const address = String(args.address || '').trim().slice(0, 200);
      const pin = String(args.pin || '').trim();
      const city = String(args.city || '').trim().slice(0, 50);
      if (!address) return fail('ADDRESS_REQUIRED');
      if (!/^[1-9][0-9]{5}$/.test(pin)) return fail('BAD_PIN', { pin });
      state.company = { ...(state.company || {}), address, pin, ...(city ? { city } : {}) };
      return ok({ company: { address, pin, city: state.company.city || '' } });
    },
  },
  {
    name: 'set_transport',
    title: 'Transport details',
    description: 'Record how the goods on an invoice move (vehicle, distance, transporter, mode) for the e-way bill. Changes no figure.',
    args: ['invoiceId', 'vehicleNo', 'distanceKm', 'transporterName', 'transporterId', 'mode', 'docNo'],
    run: (state, args = {}) => setTransport(state, args),
  },
  {
    name: 'eway_bill_status',
    title: 'E-way bill status',
    description: 'Whether an invoice needs an e-way bill under the dated threshold rule, what is still missing (transport details, the IRN), and the number once generated. Read-only.',
    args: ['invoiceId'],
    run: (state, args = {}) => {
      const invoice = (state.invoices || []).find((item) => item.id === String(args.invoiceId || '').trim().toUpperCase());
      if (!invoice) return fail('INVOICE_NOT_FOUND');
      return ok(ewayBillStatus(state, invoice));
    },
  },
  {
    name: 'govt_generate_ewb',
    title: 'Generate e-way bill',
    description: 'Generate the e-way bill for an invoice from its IRN and transport details through the action gate (live switch and a matching approval). Refused without transport details or an IRN.',
    args: ['invoiceId', 'caApprovalId'],
    run: async (state, args = {}) => {
      const invoice = (state.invoices || []).find((item) => item.id === String(args.invoiceId || '').trim().toUpperCase());
      if (!invoice) return fail('INVOICE_NOT_FOUND');
      const status = ewayBillStatus(state, invoice);
      if (status.ewbNo) return fail('ALREADY_GENERATED', { ewbNo: status.ewbNo });
      if (!status.transport) return fail('TRANSPORT_REQUIRED', { hint: status.why });
      if (!invoice.irn) return fail('IRN_REQUIRED', { hint: 'Generate the e-invoice first; MyCA generates the e-way bill from the IRN.' });
      const out = await nicActions.generateEwayBill(state, { irn: invoice.irn, transport: transportPayload(status.transport), caApprovalId: args.caApprovalId }, resolveToolActor(args));
      if (out?.ok && out.data?.EwbNo && !out.mock && !out.dryRunId) {
        invoice.ewbNo = String(out.data.EwbNo);
        invoice.ewbDate = out.data.EwbDt || '';
        invoice.ewbValidity = out.data.Validity || '';
      }
      if (!out?.ok) return fail(out?.error || 'EWB_FAILED', { ...out, invoiceId: invoice.id });
      return ok({ ...out, invoiceId: invoice.id, ewbNo: invoice.ewbNo || '' });
    },
  },
  {
    name: 'list_outbox',
    title: 'List outbox',
    description: 'Show queued and sent client notifications.',
    run: (state) => ok(listOutbox(state.__root || state)),
  },
  {
    name: 'send_notification',
    title: 'Send queued notification',
    description: 'Deliver a queued notification through the configured provider. Requires the live switch.',
    args: ['messageId'],
    run: async (state, args = {}) => {
      if (!args.messageId) return fail('messageId required');
      const out = await sendNotification(state.__root || state, args.messageId);
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'govt_set_public_key',
    title: 'Load NIC public key',
    description: 'Load the NIC/IRP RSA public key used to encrypt e-invoice credentials: give a .cer/.pem file path, a PEM string, or base64 DER.',
    args: ['key'],
    run: (_state, args = {}) => {
      const out = saveNicPublicKey(args.key || args.path || args.pem);
      return out.ok ? ok(out) : fail(out.error);
    },
  },
  {
    name: 'govt_nic_health',
    title: 'NIC IRP health',
    description: 'Ping the e-invoice IRP heartbeat endpoint (no credentials needed).',
    run: async (state, args = {}) => ok(await nicActions.health(state, resolveToolActor(args))),
  },
  {
    name: 'govt_nic_session',
    title: 'NIC session status',
    description: 'Show whether an e-invoice auth token is currently held and when it expires.',
    run: () => ok(nicSessionStatus()),
  },
  {
    name: 'govt_nic_gstin',
    title: 'NIC GSTIN master',
    description: 'Fetch a GSTIN\'s registered details from the IRP master (requires auth).',
    args: ['gstin'],
    run: async (state, args = {}) => {
      if (!args.gstin) return fail('gstin required');
      const out = await nicActions.gstinMaster(state, String(args.gstin).toUpperCase(), resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error || 'GSTIN_LOOKUP_FAILED', out);
    },
  },
  {
    name: 'govt_nic_cancel_irn',
    title: 'Cancel e-invoice IRN',
    description: 'Cancel a generated IRN with reason code 1-4 and an optional remark.',
    args: ['invoiceId', 'irn', 'reason', 'remark'],
    run: async (state, args = {}) => {
      const out = await nicActions.cancelIrn(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error || 'CANCEL_FAILED', out);
    },
  },
  {
    name: 'govt_nic_get_irn',
    title: 'Get e-invoice by IRN',
    description: 'Fetch a previously generated e-invoice by its IRN.',
    args: ['irn'],
    run: async (state, args = {}) => {
      if (!args.irn) return fail('irn required');
      const out = await nicActions.getIrn(state, String(args.irn), resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error || 'LOOKUP_FAILED', out);
    },
  },
  {
    name: 'govt_nic_get_irn_by_doc',
    title: 'Get e-invoice by document',
    description: 'Fetch an e-invoice by document type, number and date (dd/mm/yyyy).',
    args: ['docType', 'docNo', 'docDate'],
    run: async (state, args = {}) => {
      const out = await nicActions.getIrnByDoc(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error || 'LOOKUP_FAILED', out);
    },
  },
  {
    name: 'govt_nic_rejected_irns',
    title: 'List rejected IRNs',
    description: 'List IRNs rejected by the IRP for a date (dd/mm/yyyy).',
    args: ['date'],
    run: async (state, args = {}) => {
      const out = await nicActions.rejectedIrns(state, String(args.date || ''), resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error || 'LOOKUP_FAILED', out);
    },
  },
  {
    name: 'govt_nic_generate_ewb',
    title: 'Generate e-Way Bill',
    description: 'Generate an e-Way Bill against an existing IRN with transport details.',
    args: ['irn', 'transport'],
    run: async (state, args = {}) => {
      if (!args.irn) return fail('irn required');
      const out = await nicActions.generateEwayBill(state, { irn: String(args.irn), transport: args.transport }, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error || 'EWB_FAILED', out);
    },
  },
  {
    name: 'govt_nic_get_ewb',
    title: 'Get e-Way Bill by IRN',
    description: 'Fetch the e-Way Bill generated against an IRN.',
    args: ['irn'],
    run: async (state, args = {}) => {
      if (!args.irn) return fail('irn required');
      const out = await nicActions.getEwayBill(state, String(args.irn), resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error || 'LOOKUP_FAILED', out);
    },
  },
  {
    name: 'test_notification',
    title: 'Send test notification',
    description: 'Queue and attempt delivery of a test message through the configured email or WhatsApp channel. Requires the live switch.',
    args: ['channel', 'to'],
    run: async (state, args = {}) => {
      const root = state.__root || state;
      const channel = String(args.channel || '').toLowerCase();
      if (!['email', 'whatsapp'].includes(channel)) return fail('UNKNOWN_CHANNEL');
      const queued = queueNotification(root, {
        channel,
        to: String(args.to || ''),
        subject: 'MyCA test notification',
        body: 'This is a test message from MyCA.',
      }, { createdBy: 'ca' });
      if (!queued.ok) return fail(queued.error);
      const out = await sendNotification(root, queued.message.id);
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'provider_doctor',
    title: 'Integration doctor',
    description: 'Check every external integration: what is configured, which environment, whether it is reachable, and exactly what is missing.',
    run: async () => ok(await providerDoctor()),
  },
  {
    name: 'trial_balance',
    title: 'Trial balance',
    description: 'TigerBeetle-style posted debit/credit trial balance. Must always balance.',
    run: (state) => ok(trialBalance(state.ledger)),
  },
  {
    name: 'chart_of_accounts',
    title: 'Chart of accounts',
    description: 'List ledger accounts with posted and pending balances.',
    run: (state) => ok(listAccounts(state.ledger)),
  },
  {
    name: 'journal',
    title: 'Journal',
    description: 'Append-only transfer journal with checksum chain.',
    run: (state, args = {}) => {
      const rows = journal(state.ledger);
      const limit = Number(args.limit || 50);
      const names = new Map([...state.ledger.accounts.values()].map((a) => [a.id.toString(), a.name]));
      return ok({ count: rows.length, rows: rows.slice(-limit).map((r) => ({ ...r, debitAccount: names.get(r.debitAccountId) || r.debitAccountId, creditAccount: names.get(r.creditAccountId) || r.creditAccountId })) });
    },
  },
  {
    name: 'list_invoices',
    title: 'Invoices',
    description: 'List tax invoices that are the source of truth for books and GST.',
    run: (state) => ok(state.invoices || []),
  },
  {
    name: 'create_invoice',
    title: 'Create invoice',
    description: 'Create a tax invoice and post double-entry transfers (AR, sales, tax output). In India GST by rate and place of supply; in the US sales tax from the recorded rate of the jurisdiction given, or exempt with a reason. Data entry starts here.',
    args: ['partyName', 'partyGstin', 'lines', 'date', 'paymentTermsDays', 'taxJurisdiction', 'taxExempt', 'exemptionReason', 'partyAddress'],
    run: (state, args) => (countryOf(state) === 'US' ? createUsInvoice(state, args) : createInvoice(state, args)),
  },
  {
    name: 'create_purchase',
    title: 'Record purchase bill',
    description: 'Book a supplier invoice: purchases + AP (with GST input credit in India; in the US any sales tax paid is part of the cost).',
    args: ['partyName', 'partyGstin', 'lines', 'date', 'supplierInvoiceNo', 'salesTaxPaid', 'documentSha256'],
    run: (state, args) => (countryOf(state) === 'US' ? createUsPurchase(state, args) : createPurchase(state, args)),
  },
  {
    name: 'print_invoice',
    title: 'Print tax invoice',
    description: 'Render a printable tax invoice / purchase bill from posted books.',
    args: ['id'],
    run: (state, args) => printInvoice(state, args.id),
  },
  {
    name: 'invoice_document',
    title: 'Invoice to show or send',
    description: 'One posted sales invoice with seller, buyer, place of supply, lines, tax by head, receipts and balance, for display or a PDF. Read-only.',
    args: ['id'],
    run: (state, args = {}) => invoiceDocument(state, args.id),
  },
  {
    name: 'create_credit_note',
    title: 'Credit note',
    description: 'Reduce a posted sales invoice by a credit note (goods returned, price reduced, or the whole invoice) with reversing entries. Never edits the invoice.',
    args: ['invoiceId', 'amount', 'date', 'reason'],
    run: (state, args) => createCreditNote(state, args),
  },
  {
    name: 'cancel_invoice',
    title: 'Cancel invoice',
    description: 'Cancel a posted sales invoice by a credit note for its full value; the invoice stays in the journal and the return of its period.',
    args: ['invoiceId', 'date', 'reason'],
    run: (state, args) => cancelInvoice(state, args),
  },
  {
    name: 'create_debit_note',
    title: 'Debit note',
    description: 'Increase a posted sales invoice by a debit note (price revised upward, extra charge) with entries that add to sales and output tax; the customer owes that much more. Never edits the invoice.',
    args: ['invoiceId', 'amount', 'date', 'reason'],
    run: (state, args) => createDebitNote(state, args),
  },
  {
    name: 'create_purchase_note',
    title: 'Debit note to a supplier',
    description: 'Reduce a posted supplier bill by a debit note (goods returned, price reduced) with entries that reverse the purchase and its input credit; you owe the supplier that much less. Never edits the bill.',
    args: ['billId', 'amount', 'date', 'reason'],
    run: (state, args) => createPurchaseNote(state, args),
  },
  {
    name: 'record_supplier_debit_note',
    title: 'Supplier\'s debit note',
    description: 'Record a debit note the supplier issued that adds to a posted bill (a price increase, extra freight, a short charge): posts the extra purchase and its input credit at the bill\'s rates and you owe the supplier that much more. It is a document of its own with the supplier\'s note number, so it matches GSTR-2B. Never edits the bill.',
    args: ['billId', 'amount', 'date', 'reason', 'supplierNoteNo'],
    run: (state, args = {}) => recordSupplierNote(state, args),
  },
  {
    name: 'list_debit_notes',
    title: 'Debit notes',
    description: 'Debit notes on sales invoices and debit notes to suppliers, optionally for one month (YYYY-MM). Read-only.',
    args: ['period'],
    run: (state, args = {}) => ok({
      sales: args.period ? debitNotesForPeriod(state, String(args.period)) : state.debitNotes || [],
      purchases: args.period ? purchaseNotesForPeriod(state, String(args.period)) : state.purchaseNotes || [],
    }),
  },
  {
    name: 'set_sales_tax_rate',
    title: 'Sales tax rate',
    description: 'Record the sales tax rate for a jurisdiction (a state code such as TX, or state-local such as TX-AUSTIN) from a date. MyCA never guesses a rate; invoices to that jurisdiction use the rate in force on their date. US only.',
    args: ['code', 'name', 'ratePercent', 'from'],
    run: (state, args = {}) => setSalesTaxRate(state, args),
  },
  {
    name: 'list_sales_tax_rates',
    title: 'Sales tax rates',
    description: 'The sales tax jurisdictions recorded and their rate today. US only. Read-only.',
    run: (state) => listSalesTaxRates(state),
  },
  {
    name: 'set_contractor',
    title: 'Contractor',
    description: 'Mark a supplier as a contractor whose payments count towards a 1099-NEC, with the W-9 details kept (name, entity type, last four of the TIN, whether the W-9 was received). US only.',
    args: ['partyName', 'contractor', 'w9Name', 'entityType', 'tinLast4', 'w9Received', 'address', 'email'],
    run: (state, args = {}) => setContractor(state, args),
  },
  {
    name: 'contractor_payments',
    title: 'Contractor payments and 1099s',
    description: 'What was paid to each contractor in a calendar year, who is at or above the 1099-NEC threshold from the dated rule, and whose W-9 is missing. US only. Read-only.',
    args: ['year'],
    run: (state, args = {}) => contractorPayments(state, args),
  },
  {
    name: 'set_withholding',
    title: 'Withholding amounts',
    description: 'Record an employee\'s monthly federal and state income tax withholding as worked out from the W-4 (IRS Tax Withholding Estimator or Publication 15-T) and the work state. MyCA never computes withholding itself. US only. Owner only.',
    args: ['id', 'federalWithholding', 'stateWithholding', 'workState'],
    run: (state, args = {}) => setWithholding(state, args),
  },
  {
    name: 'set_suta_rate',
    title: 'State unemployment rate',
    description: 'Record the state unemployment (SUTA) rate and wage base the state assigned to the business, from a date. Payroll charges it on each employee\'s wages in that work state up to the base. MyCA holds no state rates; this is what the notice says. US only.',
    args: ['state', 'ratePercent', 'wageBase', 'from'],
    run: (state, args = {}) => setSutaRate(state, args),
  },
  {
    name: 'list_suta_rates',
    title: 'State unemployment rates',
    description: 'The SUTA rates and wage bases recorded by state. US only. Read-only.',
    run: (state) => listSutaRates(state),
  },
  {
    name: 'us_payroll_filings',
    title: 'Form 941 and W-2 drafts',
    description: 'For a calendar year: each quarter\'s Form 941 figures (wages, federal withholding, Social Security and Medicare wages and tax) with the due date from the dated rule, W-2 totals per employee, and the FUTA total for Form 940. Drafts from approved payroll months; files nothing. US only. Read-only.',
    args: ['year'],
    run: (state, args = {}) => usPayrollFilings(state, args),
  },
  {
    name: 'schedule_c_summary',
    title: 'Schedule C summary',
    description: 'A calendar year summarised on Schedule C lines for the owner\'s CPA: gross receipts, returns, cost of goods sold, expenses by line with the limits the CPA applies, and the net profit before anything outside the books. US only. Read-only.',
    args: ['year'],
    run: (state, args = {}) => scheduleCSummary(state, args),
  },
  {
    name: 'estimated_tax_dates',
    title: 'Estimated tax dates',
    description: 'The four federal estimated tax instalment dates for a year from the dated rule, which are past, and which are recorded as paid. The amount is the CPA\'s. US only. Read-only.',
    args: ['year'],
    run: (state, args = {}) => estimatedTaxDates(state, args),
  },
  {
    name: 'contractor_1099_file',
    title: '1099-NEC data file',
    description: 'For a calendar year, the payees at or above the 1099-NEC threshold with box 1 nonemployee compensation, entity type, whether a W-9 is on file and the last four of the TIN, as rows and a CSV for the IRS IRIS portal or a filing service, with the due date from the dated rule. US only. Read-only.',
    args: ['year'],
    run: (state, args = {}) => contractor1099File(state, args),
  },
  {
    name: 'rules_status',
    title: 'Statutory rules status',
    description: 'How current the dated statutory rules are for this business\'s country: per family, records in force today, the latest effective date, what is covered until when, rule ids with nothing in force, records ending soon with no successor, how many a CA or CPA has attested, and the official sources to watch. Read-only.',
    args: ['asOf', 'country'],
    run: (state, args = {}) => rulesStatus(state, args),
  },
  {
    name: 'run_automation',
    title: 'Run the daily checks',
    description: 'The daily automation, run once a day when MyCA opens and by the hosted service overnight: adds a reminder for every filing, estimated tax instalment or payroll approval falling due in the next fourteen days (never twice for the same one), verifies the ledger chain, and checks the dated statutory rules for gaps and records ending soon. Safe to repeat; a second run on the same day does nothing unless force is given.',
    args: ['asOf', 'force'],
    run: (state, args = {}) => runDailyAutomation(state, args),
  },
  {
    name: 'read_document',
    title: 'Read an uploaded bill',
    description: 'A model reads an uploaded supplier bill (text, image or PDF sent through /api/upload as a data URL) and returns the supplier, number, date and lines it saw, with a ready create_purchase proposal. MyCA computes nothing from the page; the purchase is previewed and posts only when confirmed. Needs MYCA_MODEL_API_KEY.',
    args: ['documentSha256'],
    run: (state, args = {}) => readDocument(state, args),
  },
  {
    name: 'amend_invoice',
    title: 'Amend a filed invoice',
    description: 'Change the lines or the buyer GSTIN of an invoice whose GSTR-1 month is already recorded as filed. The difference is posted to the books and the amendment goes into the GSTR-1 of the month it is made (B2BA, B2CLA or B2CSA) with the original number and date; the original month\'s return is unchanged. India only.',
    args: ['invoiceId', 'lines', 'partyGstin', 'date', 'reason'],
    run: (state, args = {}) => amendInvoice(state, args),
  },
  {
    name: 'list_amendments',
    title: 'Invoice amendments',
    description: 'Amendments made to filed invoices, optionally for one GSTR-1 month. Read-only.',
    args: ['period'],
    run: (state, args = {}) => listAmendments(state, args),
  },
  {
    name: 'schedule_se',
    title: 'Schedule SE draft',
    description: 'Self-employment tax for the year from the Schedule C net profit: net earnings after the statutory reduction, the Social Security part up to the wage base less any wages earned elsewhere (owner-entered), the Medicare part, the deductible half, and the additional Medicare tax shown separately. Dated rules a CPA has not reviewed. Read-only.',
    args: ['year', 'filingStatus', 'otherSocialSecurityWages'],
    run: (state, args = {}) => scheduleSe(state, args),
  },
  {
    name: 'schedule_c_document',
    title: 'Schedule C document',
    description: 'A printable Schedule C summary for the year with the Schedule SE draft, as one HTML file for the CPA. Read-only.',
    args: ['year', 'filingStatus', 'otherSocialSecurityWages'],
    run: (state, args = {}) => scheduleCDocument(state, args),
  },
  {
    name: 'cpa_pack',
    title: 'CPA pack',
    description: 'Everything the CPA needs for the year in one file: Schedule C and SE drafts, estimated tax dates, Form 941 quarters and W-2 totals, the 1099-NEC list, every sales tax return of the year and the trial balance. Read-only.',
    args: ['year'],
    run: (state, args = {}) => cpaPack(state, args),
  },
  {
    name: 'payroll_941_file',
    title: 'Form 941 file',
    description: 'The Form 941 draft lines for a quarter as a CSV file. Read-only.',
    args: ['quarter'],
    run: (state, args = {}) => form941File(state, args),
  },
  {
    name: 'payroll_w2_file',
    title: 'W-2 and W-3 file',
    description: 'W-2 box figures for every employee and the W-3 totals for the year as one CSV file. Read-only.',
    args: ['year'],
    run: (state, args = {}) => w2File(state, args),
  },
  {
    name: 'daily_close',
    title: 'Daily close',
    description: 'The closure checklist for a day: sales, purchases and expenses posted; whether the bank balance is current; settlements matched; TCS and TDS confirmed; margins positive; nothing high-severity open. With month-to-date figures, the cash position and what customers owe. Computed from the books, run nightly by the daily job. Read-only apart from refreshing the exception queue.',
    args: ['asOf'],
    run: (state, args = {}) => dailyClose(state, { asOf: args.asOf, clientId: normalizeClientId(state.activeClientId) }),
  },
  {
    name: 'automation_status',
    title: 'Daily checks status',
    description: 'When the daily checks last ran, what they added, whether the ledger chain was intact, and any warnings. Read-only.',
    args: [],
    run: (state) => automationStatus(state),
  },
  {
    name: 'set_sales_tax_nexus',
    title: 'Sales tax registration',
    description: 'Record that the business collects sales tax in a state (two-letter code), how often it files there (monthly, quarterly or annual) and from when, with the permit number if wanted. US only.',
    args: ['state', 'frequency', 'from', 'permitNo', 'dueDay'],
    run: (state, args = {}) => setNexus(state, args),
  },
  {
    name: 'list_sales_tax_nexus',
    title: 'Sales tax registrations',
    description: 'The states where the business collects sales tax and how often it files. US only. Read-only.',
    run: (state) => listNexus(state),
  },
  {
    name: 'sales_tax_return',
    title: 'Sales tax return',
    description: 'The sales tax return for one state and period (the latest ended period unless given): gross, exempt, non-taxable and taxable sales, tax collected by jurisdiction, payments made, what is left to pay, the due date from the dated rule where one exists, and whether it is approved or recorded as filed. US only. Read-only.',
    args: ['state', 'period'],
    run: (state, args = {}) => salesTaxReturn(state, args),
  },
  {
    name: 'sales_tax_review',
    title: 'Review the sales tax return',
    description: 'The steps of the review for one state and period: sales, tax collected, then approval, each asking "Is this information correct?". US only. Read-only.',
    args: ['state', 'period'],
    run: (state, args = {}) => salesTaxReviewOf(state, args),
  },
  {
    name: 'sales_tax_review_answer',
    title: 'Answer a sales tax review step',
    description: 'Confirm a step of a state sales tax return, mark it wrong with a note, or approve the return. Bound to the draft the owner saw. Files nothing. US only.',
    args: ['state', 'period', 'step', 'answer', 'draftHash', 'note'],
    run: (state, args = {}) => answerSalesTaxReview(state, args),
  },
  {
    name: 'record_sales_tax_payment',
    title: 'Record a sales tax payment',
    description: 'Record sales tax paid to a state for a period, from the bank or cash, with the reference. Defaults to everything still to pay for that period. US only.',
    args: ['state', 'period', 'amount', 'date', 'mode', 'reference'],
    run: (state, args = {}) => recordSalesTaxPayment(state, args),
  },
  {
    name: 'record_sales_tax_filing',
    title: 'Record a filed sales tax return',
    description: 'Record that a state sales tax return was filed outside MyCA, with its confirmation number and date. Files nothing. US only.',
    args: ['state', 'period', 'confirmation', 'filedOn', 'filedBy'],
    run: (state, args = {}) => recordSalesTaxFiling(state, args),
  },
  {
    name: 'sales_tax_overview',
    title: 'Sales tax overview',
    description: 'Every state the business collects sales tax in, with the latest ended period (tax collected, to pay, due date, approved, filed) and the running period. US only. Read-only.',
    run: (state) => salesTaxOverview(state),
  },
  {
    name: 'list_credit_notes',
    title: 'Credit notes',
    description: 'Credit notes against sales invoices, optionally for one month (YYYY-MM). Read-only.',
    args: ['period'],
    run: (state, args = {}) => ok(args.period ? creditNotesForPeriod(state, String(args.period)) : state.creditNotes || []),
  },
  {
    name: 'business_summary',
    title: 'Business at a glance',
    description: 'This month and last month: sales (gross and net of credit notes), purchases, expenses, and what customers still owe. Read-only; computed from posted documents.',
    args: ['period'],
    run: (state, args = {}) => businessSummary(state, args),
  },
  {
    name: 'record_receipt',
    title: 'Record receipt',
    description: 'Receive payment against an invoice (bank or cash) and post the AR settlement.',
    args: ['invoiceId', 'amount', 'mode', 'date'],
    run: (state, args) => recordReceipt(state, args),
  },
  {
    name: 'record_payment',
    title: 'Pay a supplier',
    description: 'Record a payment to a supplier against a bill (bank or cash) and post the AP settlement. With no amount, the whole outstanding balance is paid.',
    args: ['billId', 'amount', 'mode', 'date'],
    run: (state, args) => recordPayment(state, args),
  },
  {
    name: 'record_gst_payment',
    title: 'Record the GST payment',
    description: 'Record that a month\'s GST was paid on the portal (CPIN challan, from the bank or cash): posts the set-off of input credit against output tax head by head and the cash paid, with any interest and late fee as an expense. Once per month. Pays nothing itself.',
    args: ['period', 'date', 'mode', 'cpin'],
    run: (state, args = {}) => recordGstPayment(state, args),
  },
  {
    name: 'list_gst_payments',
    title: 'GST payments',
    description: 'The months whose GST payment is recorded, with the cash paid by head, interest, late fee and the challan. Read-only.',
    run: (state) => listGstPayments(state),
  },
  {
    name: 'export_gstr1_quarter',
    title: 'Quarterly GSTR-1 (QRMP)',
    description: 'For a business on the quarterly scheme: the GSTN offline-utility JSON for a whole quarter (Q2 2026-27), with the last month as the return period. Does not upload.',
    args: ['quarter', 'grossTurnover', 'currentGrossTurnover'],
    run: (state, args = {}) => exportGstr1Quarter(state, args),
  },
  {
    name: 'export_iff',
    title: 'Invoice furnishing facility (IFF)',
    description: 'For a business on the quarterly scheme: the B2B invoices and their notes of the first or second month of a quarter as GSTN JSON, so buyers see their credit in time. Does not upload.',
    args: ['period'],
    run: (state, args = {}) => exportIff(state, args),
  },
  {
    name: 'close_year',
    title: 'Close the year',
    description: 'Close a financial year (India, 2025-26) or calendar year (US, 2025) that has ended: transfer every income and expense balance of the year to capital and lock the books through its last day. Once per year; the closing entries are new entries, nothing is changed. Owner only.',
    args: ['year'],
    run: (state, args = {}) => closeYear(state, args),
  },
  {
    name: 'list_year_closings',
    title: 'Closed years',
    description: 'The years closed so far with income, expenses and profit, and the next year that can be closed. Read-only.',
    run: (state) => listYearClosings(state),
  },
  {
    name: 'week_ahead',
    title: 'The week ahead',
    description: 'Everything due in the next seven days and anything overdue: filings from the dated rules (India) or state sales tax and estimated tax (US), reminders, invoices past or near their due date, and last month\'s payroll if not approved or paid. Read-only.',
    args: ['asOf'],
    run: (state, args = {}) => weekAhead(state, args),
  },
  {
    name: 'gstr9_draft',
    title: 'GSTR-9 annual return draft',
    description: 'A draft of the annual return for a financial year from the twelve monthly figures: outward supplies and tax by head (table 4 and 5 where known), credit and debit notes, input credit availed by head (table 6), reversals (table 7), GSTR-2B against credit availed (table 8 where 2B was added), tax paid in cash and by credit (table 9), and the HSN summary (table 17). Read-only; files nothing.',
    args: ['fy'],
    run: (state, args = {}) => gstr9Draft(state, args),
  },
  {
    name: 'gst_payable',
    title: 'GST to pay',
    description: 'For one tax period: input credit (and any credit brought forward) set off against tax on sales head by head in the order the law sets, the cash to pay by head, the credit carried forward, and the interest and late fee if paid after the due date. Read-only.',
    args: ['period', 'payOn'],
    run: (state, args = {}) => {
      const regd = regArg(state, args.gstin);
      if (!regd.ok) return fail(regd.error, regd);
      return paymentFor(state, args.period, { payOn: args.payOn, gstin: regd.gstin });
    },
  },
  {
    name: 'set_gst_credit_opening',
    title: 'GST credit balance',
    description: 'Record the electronic credit ledger balance by head at the start of a month, from the GST portal, so set-off counts credit brought forward from earlier months.',
    args: ['period', 'igst', 'cgst', 'sgst'],
    run: (state, args = {}) => setCreditOpening(state, args),
  },
  {
    name: 'prepare_gstr1',
    title: 'Prepare GSTR-1',
    description: 'Build GSTR-1 tables and e-invoice checks from the invoices of one tax period (the latest with documents unless a period is given).',
    args: ['period'],
    run: (state, args = {}) => {
      const regd = regArg(state, args.gstin);
      if (!regd.ok) return fail(regd.error, regd);
      const docs = documentsForPeriod(state, args.period, '', regd.gstin);
      if (!docs.ok) return fail(docs.error, { hint: docs.hint, periods: docs.periods });
      const salesText = invoicesToSalesCsv(docs.invoices);
      const result = filingPrep({ salesText, supplierState: regd.registration.state, fy: state.company.fy });
      return ok({ period: docs.period, periods: docs.periods, gstin: regd.gstin, salesText, gstr1: result.gstr1, eInvoice: result.summary });
    },
  },
  {
    name: 'export_gstr1_json',
    title: 'Export GSTR-1 JSON',
    description: 'GSTN offline-utility JSON from posted invoices (does not upload).',
    run: (state, args = {}) => {
      const regd = regArg(state, args.gstin);
      if (!regd.ok) return fail(regd.error, regd);
      const json = invoicesToGstr1Json(companyAs(state, regd.gstin), forRegistration(state, state.invoices || [], regd.gstin), args.fp, {
        creditNotes: forRegistration(state, state.creditNotes || [], regd.gstin),
        debitNotes: forRegistration(state, state.debitNotes || [], regd.gstin),
        channels: state.channels,
        grossTurnover: args.grossTurnover,
        currentGrossTurnover: args.currentGrossTurnover,
      });
      return json.error ? fail(json.error, { hint: json.hint }) : ok(json);
    },
  },
  {
    name: 'prepare_gstr3b',
    title: 'Prepare GSTR-3B',
    description: 'Draft GSTR-3B outward and ITC from the invoices and bills of one tax period (the latest with documents unless a period is given), plus an optional inward CSV.',
    args: ['period', 'inwardText'],
    run: (state, args = {}) => {
      const regd = regArg(state, args.gstin);
      if (!regd.ok) return fail(regd.error, regd);
      const docs = documentsForPeriod(state, args.period, '', regd.gstin);
      if (!docs.ok) return fail(docs.error, { hint: docs.hint, periods: docs.periods });
      return ok({ ...gstr3bFor(state, docs, args.inwardText || state.files.inward), periods: docs.periods, gstin: regd.gstin });
    },
  },
  {
    name: 'gst_period_summary',
    title: 'GST for one period',
    description: 'For one tax period: tax on sales and input credit by head from the GSTR-3B draft, and what the GSTR-1 file for that period holds. Lists the periods that have documents.',
    args: ['period'],
    run: (state, args = {}) => {
      const regd = regArg(state, args.gstin);
      if (!regd.ok) return fail(regd.error, regd);
      const summary = periodSummary(state, args.period, regd.gstin);
      if (!summary.ok) return summary;
      const payment = paymentFor(state, summary.data.period, { gstin: regd.gstin });
      return ok({ ...summary.data, payment: payment.ok ? payment.data : null, paymentError: payment.ok ? '' : payment.error });
    },
  },
  {
    name: 'cash_forecast',
    title: 'Cash forecast',
    description: 'Bank and cash today and over the next days (30 unless given): invoices expected in by each customer\'s usual paying time, recent bills assumed paid in 30 days, GST due, usual expenses; the lowest point; overdue invoices listed but not counted. Read-only.',
    args: ['days'],
    run: async (state, args = {}) => {
      const due = await TOOL_MAP.deadlines.run(state, {});
      const clientId = String(state.activeClientId || 'SELF');
      return cashForecast(state, { days: args.days, deadlines: (due.data?.deadlines || []).filter((row) => row.clientId === clientId) });
    },
  },
  {
    name: 'can_make_payroll',
    title: 'Can I make payroll',
    description: 'Whether the next salary day clears: the approved (or expected, from the last approved month) net pay plus the PF, ESI and TDS due around it against the cash forecast on that day; covered, tight or short by an amount; when short, the customers whose usual paying time lands before payday, largest first. Read-only.',
    args: [],
    run: async (state) => {
      const due = await TOOL_MAP.deadlines.run(state, {});
      const clientId = String(state.activeClientId || 'SELF');
      return canMakePayroll(state, { deadlines: (due.data?.deadlines || due.deadlines || []).filter((row) => row.clientId === clientId) });
    },
  },
  {
    name: 'can_afford',
    title: 'Can I afford it',
    description: 'Whether spending an amount on a day leaves money in hand, from the cash forecast: the lowest balance after that day less the amount, how many months of usual outgoings that covers, and what can be spent while keeping a month in hand. Read-only.',
    args: ['amount', 'on'],
    run: async (state, args = {}) => {
      const due = await TOOL_MAP.deadlines.run(state, {});
      const clientId = String(state.activeClientId || 'SELF');
      return canAfford(state, { amount: args.amount, on: args.on, deadlines: (due.data?.deadlines || []).filter((row) => row.clientId === clientId) });
    },
  },
  {
    name: 'create_quote',
    title: 'Quote, proforma, sales order or delivery challan',
    description: 'Make a sales document for a customer with GST worked out as on an invoice: a quotation (kind quote, the default, QT-), a proforma invoice (proforma, PI-), a sales order (order, SO-) or a delivery challan for goods moved without a sale (challan, DC-, with the reason: job-work, approval, line-sale, exhibition, own-use or other). Quotes and proformas are valid for a number of days (30 unless given). It posts nothing to the books and is not in any return until it becomes an invoice.',
    args: ['partyName', 'partyGstin', 'lines', 'date', 'validDays', 'taxJurisdiction', 'taxExempt', 'exemptionReason', 'kind', 'reason'],
    run: (state, args = {}) => createQuote(state, args),
  },
  {
    name: 'mark_quote',
    title: 'Quote, order or challan outcome',
    description: 'Record what happened to a sales document: a quote or proforma accepted or declined, a sales order cancelled, a delivery challan returned (goods back from job work or approval) or cancelled.',
    args: ['id', 'outcome'],
    run: (state, args = {}) => markQuote(state, args),
  },
  {
    name: 'convert_quote',
    title: 'Invoice from quote, proforma, order or challan',
    description: 'Raise the tax invoice for a quote, proforma, sales order or delivery challan with the same lines, linked both ways. A declined, cancelled, returned or already-invoiced document is refused, and so is a job-work challan, which is not a sale.',
    args: ['id', 'date'],
    run: (state, args = {}) => convertQuote(state, args),
  },
  {
    name: 'list_quotes',
    title: 'Quotes, proformas, orders and challans',
    description: 'Sales documents with their kind and state (open, accepted, declined, expired, invoiced, cancelled, returned), optionally one kind. Read-only.',
    args: ['status', 'kind'],
    run: (state, args = {}) => listQuotes(state, args),
  },
  {
    name: 'add_recurring',
    title: 'Repeat an invoice, bill or expense',
    description: 'Set an invoice (kind invoice: partyName, partyGstin, lines), a supplier bill (kind bill: partyName, partyGstin, lines) or an expense paid from the bank (kind expense: amount, narration, payee, head, gstRate, supplierGstin) to repeat every week, month, quarter, half-year or year from a start date, optionally until an end date. The daily run posts each one on its date exactly as if it was entered by hand. Owner only.',
    args: ['kind', 'every', 'startDate', 'endDate', 'partyName', 'partyGstin', 'lines', 'paymentTermsDays', 'taxJurisdiction', 'taxExempt', 'exemptionReason', 'narration', 'amount', 'gstRate', 'payee', 'supplierGstin', 'head'],
    run: (state, args = {}) => addRecurring(state, args),
  },
  {
    name: 'stop_recurring',
    title: 'Stop a repeating entry',
    description: 'Stop a repeating invoice, bill or expense (RP-0001). Entries already posted stay.',
    args: ['id'],
    run: (state, args = {}) => stopRecurring(state, args),
  },
  {
    name: 'list_recurring',
    title: 'Repeating invoices, bills and expenses',
    description: 'The repeating entries with what repeats, how often, the next date and the last one made. Read-only.',
    args: ['status'],
    run: (state, args = {}) => listRecurring(state, args),
  },
  {
    name: 'run_recurring',
    title: 'Post repeating entries now',
    description: 'Post every repeating entry that is due on or before today (or asOf). The daily run does this on its own; this is for catching up at once.',
    args: ['asOf'],
    run: (state, args = {}) => runRecurring(state, args),
  },
  {
    name: 'bank_reconciliation',
    title: 'Bank reconciliation',
    description: 'Statement lines of one own account with their state (not matched yet, matched to the books, booked, ignored), a few suggestions for each open line, entries in the books that are not on the statement, and the statement balance against the books. Read-only.',
    args: ['account', 'from', 'to', 'status', 'limit'],
    run: (state, args = {}) => bankReconciliation(state, args),
  },
  {
    name: 'match_bank_line',
    title: 'Match a statement line',
    description: 'Settle one open statement line (BL-000012): link it to an entry already in the books (kind books, transferId), book it as a receipt from a customer (kind receipt, partyName or invoiceId, oldest open invoices first), a payment to a supplier (kind payment, partyName or billId), an expense (kind expense, head), bank charges (kind charge), interest from the bank (kind interest), a move between your own accounts (kind transfer, otherAccount) or ignore it (kind ignore). remember true saves a rule so lines like it book on their own.',
    args: ['lineId', 'kind', 'transferId', 'invoiceId', 'billId', 'partyName', 'head', 'otherAccount', 'note', 'remember'],
    run: (state, args = {}) => matchBankLine(state, args),
  },
  {
    name: 'unmatch_bank_line',
    title: 'Open a statement line again',
    description: 'Remove the link on a matched or ignored statement line so it can be matched again. A booked line cannot be opened this way because its entries are in the books.',
    args: ['lineId'],
    run: (state, args = {}) => unmatchBankLine(state, args),
  },
  {
    name: 'book_bank_charges',
    title: 'Book bank charges and interest',
    description: 'Book every open statement line that reads as a bank charge (to 5180 Bank charges) or as interest credited by the bank (to 4100 Interest income), for one account, a date range or named lines.',
    args: ['account', 'lineIds', 'from', 'to'],
    run: (state, args = {}) => bookBankCharges(state, args),
  },
  {
    name: 'add_bank_rule',
    title: 'Add a bank rule',
    description: 'Save a rule that books statement lines on its own: when the narration contains a text (or matches a pattern), optionally only for money in or out and within an amount range, book the line as a receipt from a customer, a payment to a supplier, an expense under a head, bank charges, interest, a transfer with another own account, or ignore it. It applies to open lines now unless applyNow is false, and to every later import.',
    args: ['side', 'contains', 'pattern', 'minAmount', 'maxAmount', 'kind', 'partyName', 'head', 'otherAccount', 'note', 'applyNow'],
    run: (state, args = {}) => addBankRule(state, args),
  },
  {
    name: 'remove_bank_rule',
    title: 'Remove a bank rule',
    description: 'Remove a bank rule (BR-0001). Lines it already booked stay.',
    args: ['id'],
    run: (state, args = {}) => removeBankRule(state, args),
  },
  {
    name: 'list_bank_rules',
    title: 'Bank rules',
    description: 'The bank rules in the order they apply, with how often each one has been used. Read-only.',
    args: [],
    run: (state) => listBankRules(state),
  },
  {
    name: 'run_bank_rules',
    title: 'Apply bank rules now',
    description: 'Apply the bank rules to every open statement line, or only to those of one account. dryRun true shows what would be booked without booking it.',
    args: ['account', 'dryRun'],
    run: (state, args = {}) => runBankRules(state, args),
  },
  {
    name: 'set_bank_account',
    title: 'Add or rename an own account',
    description: 'Add a bank account, cash box or wallet of your own (label, kind bank, cash or wallet, masked account number, IFSC), or rename one by id. Cash (1001) and Bank (1002) are built in. Owner only.',
    args: ['id', 'label', 'kind', 'maskedNumber', 'ifsc'],
    run: (state, args = {}) => setBankAccount(state, args),
  },
  {
    name: 'list_bank_accounts',
    title: 'Own accounts',
    description: 'Your cash, bank and wallet accounts with their balances in the books. Read-only.',
    args: [],
    run: (state) => listBankAccounts(state),
  },
  {
    name: 'record_transfer',
    title: 'Move money between own accounts',
    description: 'Record a move between two of your own accounts (bank to cash, one bank to another) by id or label, with an amount, a date and a reference. One contra entry is posted and statement lines on both sides link to it.',
    args: ['fromAccount', 'toAccount', 'amount', 'date', 'reference'],
    run: (state, args = {}) => recordTransfer(state, args),
  },
  {
    name: 'quote_document',
    title: 'Quote, proforma, order or challan to show or send',
    description: 'One quote, proforma, sales order or delivery challan laid out like an invoice, for display or a PDF. Read-only.',
    args: ['id'],
    run: (state, args = {}) => quoteDocument(state, args.id),
  },
  {
    name: 'ask_ca',
    title: 'Ask my CA',
    description: 'Send a question to the business\'s CA inside MyCA about an invoice, bill, expense, flagged item or a month\'s GST, with the facts attached by the engine. Nothing leaves MyCA.',
    args: ['subject', 'title', 'note', 'documents'],
    run: (state, args = {}) => askCa(state, args),
  },
  {
    name: 'reply_ca',
    title: 'Reply',
    description: 'Add a reply to a question for the CA; a reply from someone other than the asker marks it answered.',
    args: ['id', 'text'],
    run: (state, args = {}) => replyCa(state, args),
  },
  {
    name: 'close_ca',
    title: 'Close question',
    description: 'Close a question for the CA. Only the person who asked or the owner can close it.',
    args: ['id'],
    run: (state, args = {}) => closeCa(state, args),
  },
  {
    name: 'list_ca_requests',
    title: 'Questions for the CA',
    description: 'Questions for the CA with their attached facts and replies, open unless asked otherwise. Read-only.',
    args: ['status'],
    run: (state, args = {}) => listCaRequests(state, args),
  },
  {
    name: 'set_invoice_numbering',
    title: 'Invoice numbering',
    description: 'Choose how new invoices are numbered: one continuous series (INV-0001 onwards) or one series per financial year (INV-26270001 is the first of 2026-27). Existing invoices keep their numbers. Owner only.',
    args: ['mode'],
    run: (state, args = {}) => {
      if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner can change invoice numbering.' });
      const mode = String(args.mode || '').trim().toLowerCase();
      if (!['continuous', 'yearly'].includes(mode)) return fail('BAD_NUMBERING', { mode, hint: 'continuous or yearly' });
      const before = state.company.invoiceNumbering || 'continuous';
      state.company.invoiceNumbering = mode;
      return { ok: true, mode, before };
    },
  },
  {
    name: 'set_invoice_template',
    title: 'Invoice design',
    description: 'Design the invoice and quote PDF: accent colour, classic or minimal layout, bank details for payment (account with IFSC, or UPI), terms printed under the totals, a footer line, the name of the signatory, whether to show the HSN column. Figures never change. Owner only.',
    args: ['accent', 'layout', 'bank', 'terms', 'footer', 'signatory', 'showHsn'],
    run: (state, args = {}) => setInvoiceTemplate(state, args),
  },
  {
    name: 'invoice_template',
    title: 'Invoice design (read)',
    description: 'The current invoice and quote design: colour, layout, bank details, terms, footer, signatory. Read-only.',
    args: [],
    run: (state) => invoiceTemplate(state),
  },
  {
    name: 'set_supplier_terms',
    title: 'Supplier terms and MSME status',
    description: 'Mark a supplier as a micro or small enterprise (optionally with their Udyam number and category) and the agreed payment days. New bills to them carry the pay-by date from the dated MSMED rule: the agreed days, at most 45, or 15 with no agreement. Owner only.',
    args: ['partyName', 'partyGstin', 'msme', 'udyam', 'category', 'days'],
    run: (state, args = {}) => setSupplierTerms(state, args),
  },
  {
    name: 'supplier_dues',
    title: 'Supplier dues',
    description: 'Unpaid bills with a pay-by date, soonest first, and the MSME position: how much is owed to micro and small enterprises, what is past the MSMED time limit and therefore not deductible until paid (s.43B(h)). Read-only.',
    args: ['asOf'],
    run: (state, args = {}) => supplierDues(state, args),
  },
  {
    name: 'set_payment_terms',
    title: 'Payment terms',
    description: 'Set how many days a customer has to pay (0 means on receipt). New invoices to them get a due date; old invoices keep theirs.',
    args: ['partyName', 'partyGstin', 'days'],
    run: (state, args = {}) => setPaymentTerms(state, args),
  },
  {
    name: 'set_cash_balance',
    title: 'Bank and cash balance',
    description: 'Record what the bank and cash in hand actually are on a day, so the forecast starts from real money. A note for forecasting; posts nothing to the ledger.',
    args: ['bank', 'cash', 'on'],
    run: (state, args = {}) => setCashBalance(state, args),
  },
  {
    name: 'add_reminder',
    title: 'Remind me',
    description: 'Set a reminder for a day, optionally about an invoice, a bill or a party. It appears in the app on that day; nothing is sent to anyone.',
    args: ['text', 'due', 'invoiceId', 'billId', 'party', 'assignedTo'],
    run: (state, args = {}) => addReminder(state, args),
  },
  {
    name: 'complete_reminder',
    title: 'Reminder done',
    description: 'Mark a reminder done.',
    args: ['id'],
    run: (state, args = {}) => completeReminder(state, args),
  },
  {
    name: 'list_reminders',
    title: 'Reminders',
    description: 'Open reminders by date, with which are due today or overdue. Read-only.',
    args: ['status', 'assignedTo'],
    run: (state, args = {}) => listReminders(state, args),
  },
  {
    name: 'books_check',
    title: 'Books check',
    description: 'One look at the books: what came across, whether they tie, sales the GST return cannot carry, input credit against GSTR-2B, due dates that passed, money owed, missing details and other open items, each with what to do. Read-only apart from refreshing the exception queue.',
    run: async (state) => {
      const asOfDate = localToday();
      const clientId = String(state.activeClientId || 'SELF');
      const due = await TOOL_MAP.deadlines.run(state, { asOfDate });
      const open = await TOOL_MAP.exceptions.run(state, { asOfDate });
      const deadlines = (due.data?.deadlines || []).filter((row) => row.clientId === clientId);
      return booksCheck(state, { deadlines, exceptions: open.data?.exceptions || [], asOfDate });
    },
  },
  {
    name: 'import_gstr2b',
    title: 'Add GSTR-2B',
    description: 'Store the GSTR-2B statement for one month (the CSV from the GST portal) so purchase bills can be checked against what suppliers reported. Posts nothing to the ledger; a second file for the same month replaces the first.',
    args: ['csv', 'period', 'fileName'],
    run: (state, args = {}) => import2b(state, args),
  },
  {
    name: 'credit_at_risk',
    title: 'Credit at risk',
    description: 'For one month: the input credit on purchase bills that GSTR-2B does not support (not reported, not available, different amounts or date, or no supplier bill number), by supplier, and 2B entries not in your books. Read-only.',
    args: ['period'],
    run: (state, args = {}) => creditAtRisk(state, args),
  },
  {
    name: 'ims_review',
    title: 'IMS decisions',
    description: 'For one month: every GSTR-2B row with whether your books have the bill, the suggestion (accept or pending) and the decision recorded so far (accept, reject, pending or not decided), with counts and the credit by decision. Read-only.',
    args: ['period'],
    run: (state, args = {}) => imsReview(state, args),
  },
  {
    name: 'ims_decide',
    title: 'Decide IMS invoices',
    description: 'Record the IMS decision (accept, reject, pending, or clear) for chosen GSTR-2B rows of one month, by row key or by a word: matched, suggested, undecided or all. Posts nothing to the ledger and sends nothing to the GST portal; take the same decisions on the portal\'s IMS.',
    args: ['period', 'keys', 'select', 'decision', 'note'],
    run: (state, args = {}) => decideIms(state, args),
  },
  {
    name: 'export_trial_balance',
    title: 'Trial balance for your CA',
    description: 'The posted trial balance as one CSV: every account with debits, credits and the closing balance on each side, and the totals, which always tie. For a CA or another accounting package. Read-only.',
    run: (state) => exportTrialBalance(state),
  },
  {
    name: 'profit_and_loss',
    title: 'Profit and loss',
    description: 'Income and expenses by account for a period (from and to, YYYY-MM-DD; the financial year to date when not given) and the net profit or loss, from posted entries, with a CSV. Read-only.',
    args: ['from', 'to'],
    run: (state, args = {}) => profitAndLoss(state, args),
  },
  {
    name: 'balance_sheet',
    title: 'Balance sheet',
    description: 'Assets, liabilities and equity (with the profit to date) as at a date (asOf, YYYY-MM-DD; today when not given), from posted entries, with a CSV. It always balances. Read-only.',
    args: ['asOf'],
    run: (state, args = {}) => balanceSheet(state, args),
  },
  {
    name: 'cash_flow_statement',
    title: 'Cash flow statement',
    description: 'Cash and bank at the start and end of a period (from and to; the financial year to date when not given) and the money in and out by kind: customers, suppliers, expenses, dues, assets and the owner. Read-only.',
    args: ['from', 'to'],
    run: (state, args = {}) => cashFlow(state, args),
  },
  {
    name: 'customer_statement',
    title: 'Customer statement',
    description: 'Statement of account for one customer (party name or gstin) for a period: opening balance, every invoice, payment and note with a running balance, and what they owe, with a CSV to send. Read-only.',
    args: ['party', 'gstin', 'from', 'to'],
    run: (state, args = {}) => customerStatement(state, args),
  },
  {
    name: 'export_entries',
    title: 'Entries for your CA',
    description: 'One CSV of the month: sales, receipts, credit notes, purchases and expenses with heads and tax by head, for a CA or another accounting package. Read-only.',
    args: ['period'],
    run: (state, args = {}) => exportEntries(state, args),
  },
  {
    name: 'export_tally',
    title: 'Tally file for your CA',
    description: 'One Tally import file (XML) of the month: ledger masters, then every sale, receipt, credit and debit note, purchase, payment, expense and TDS deposit as a voucher. Read-only.',
    args: ['period'],
    run: (state, args = {}) => exportTallyXml(state, args),
  },
  {
    name: 'export_xlsx',
    title: 'Excel file of a report',
    description: 'One Excel workbook (.xlsx) of a report: the trial balance, entries, day book, sales, purchases, expenses, credit or debit notes, customer or supplier dues, cash forecast, credit at risk, TDS, margins, stock, a saved report by name, the business or GST summary, the bank reconciliation, or the audit trail (optionally by one person, actor, and only the latest limit events), for a month, a period (this-month, last-month, this-quarter, this-year, last-year) or from and to dates. Money is numbers, so it adds up in Excel; a saved report is complete, not cut at 20 rows. Read-only.',
    args: ['report', 'period', 'from', 'to', 'name', 'account', 'actor', 'limit'],
    run: (state, args = {}) => reportSheet(state, args.report, args),
  },
  {
    name: 'audit_trail',
    title: 'Audit trail',
    description: 'Who changed what and when: every change made through MyCA in a month, a period or between two dates, with the record ids, the money entries it posted, and a hash chain that flags most edits to who, what and when. Changes by default; view all adds reads, proposals and sign-ins. Read-only.',
    args: ['period', 'from', 'to', 'view', 'actor', 'limit'],
    run: (state, args = {}) => auditTrail(state, args),
  },
  {
    name: 'gst_review',
    title: 'Review the GST return',
    description: 'The steps of the review for one tax period (the latest with documents unless given): held invoices, sales, purchases and credit, approval. Each step shows its figures and whether it is confirmed for the current draft. Read-only.',
    args: ['period'],
    run: (state, args = {}) => reviewOf(state, args.period, args.gstin),
  },
  {
    name: 'gst_review_answer',
    title: 'Answer a review step',
    description: 'Record the answer to one review step for the exact draft the owner saw (its hash). Approval records that the owner checked the figures; it files nothing.',
    args: ['period', 'step', 'answer', 'note', 'draftHash'],
    run: (state, args = {}) => answerReview(state, args),
  },
  {
    name: 'filing_pack',
    title: 'GSTN filing pack',
    description: 'Assemble GSTR-1 + 3B + payable + TB for a CA to file. Does not upload to GSTN.',
    args: ['period'],
    run: (state, args = {}) => {
      const regd = regArg(state, args.gstin);
      if (!regd.ok) return fail(regd.error, regd);
      const docs = documentsForPeriod(state, args.period, '', regd.gstin);
      if (!docs.ok) return fail(docs.error, { hint: docs.hint, periods: docs.periods });
      const salesText = invoicesToSalesCsv(docs.invoices);
      const inwardText = purchasesToInwardCsv(docs.purchases);
      const filed = filingPrep({ salesText, inwardText, supplierState: regd.registration.state, fy: state.company.fy });
      const payment = paymentFor(state, docs.period, { gstin: regd.gstin });
      if (!payment.ok) return fail(payment.error, payment);
      return ok({
        gstin: regd.gstin,
        period: docs.period,
        periods: docs.periods,
        gstr1: filed.gstr1,
        gstr3b: filed.gstr3b,
        payable: payment.data.toPay,
        payment: payment.data,
        payableBasis: 'this return period, after input credit and credit brought forward are set off head by head',
        trialBalance: trialBalance(state.ledger),
        caveat: 'Prepared locally. A practising CA must review and file on GSTN. MyCA does not hold DSC; live GSTR APIs need a GSP.',
      });
    },
  },
  {
    name: 'govt_probe',
    title: 'Probe GSTN / NIC / MCA',
    description: 'HTTP to official government hosts from this PC. Confirms the machine can reach GST, e-invoice, MCA, IT portals.',
    run: async (state, args = {}) => ok(await nicActions.probe(state, resolveToolActor(args))),
  },
  {
    name: 'govt_save_credentials',
    title: 'Save NIC e-invoice credentials',
    description: 'Store sandbox/production client-id, secret, API user, password, GSTIN locally in %APPDATA%\\MyCA\\govt.json.',
    run: (_state, args = {}) => ok(saveGovtConfig(args)),
  },
  {
    name: 'govt_nic_auth',
    title: 'NIC e-invoice authenticate',
    description: 'Authenticate with the NIC IRP through the action gate (live switch and CA approval). The token and session key never leave the NIC client.',
    run: async (state, args = {}) => ok(await nicActions.authenticate(state, resolveToolActor(args))),
  },
  {
    name: 'govt_nic_mock',
    title: 'NIC Sandbox Mock Auth & IRN',
    description: 'High-fidelity simulation of NIC authentication and IRN generation for sandbox testing.',
    args: ['invoiceId'],
    run: async (state, args = {}) => {
      const invId = args.invoiceId || (state.invoices?.[0]?.id);
      if (!invId) return fail('Pass an invoiceId, or create an invoice first to generate a mock IRN.');
      return ok(await nicActions.simulateIrn(state, invId, resolveToolActor(args)));
    },
  },
  {
    name: 'govt_generate_irn',
    title: 'Generate e-invoice IRN',
    description: 'Build NIC Invoice JSON from a posted tax invoice, credit note (CN-) or debit note (DN-) and generate its IRN through the action gate (live switch and a matching CA approval). A note carries the original invoice as PrecDocDtls.',
    args: ['invoiceId', 'provider', 'caApprovalId'],
    run: async (state, args = {}) => {
      if (!args.invoiceId) return fail('invoiceId required, e.g. INV-0001');
      if (args.provider === 'sandbox') {
        const actor = resolveToolActor(args);
        const out = await runSandboxOperation({
          operationId: 'einvoice_generate',
          actorId: actor.userId,
          actor,
          caApprovalId: args.caApprovalId || '',
          params: { invoiceId: String(args.invoiceId) },
          clientId: activeClientId(state),
        }, { state });
        return out.ok ? ok(out) : fail(out.error, out);
      }
      return ok(await nicActions.generateIrn(state, String(args.invoiceId), resolveToolActor(args)));
    },
  },
  {
    name: 'integration_readiness',
    title: 'CA API readiness',
    description: 'Show which external CA-firm APIs MyCA needs and what is still missing.',
    args: ['available'],
    run: (state, args = {}) => {
      const source = (args.available || []).length ? args.available : state.integrationConnections || {};
      return ok(integrationReadiness(source));
    },
  },
  {
    name: 'integration_connect',
    title: 'Connect requirement API',
    description: 'Mark a PRD requirement API as connected with provider metadata. Does not store secrets.',
    args: ['requirementId', 'provider', 'baseUrl', 'notes'],
    run: (state, args = {}) => {
      const out = setIntegrationConnection(state, args);
      return out.ok ? ok(out) : fail(out.error);
    },
  },
  {
    name: 'integration_disconnect',
    title: 'Disconnect requirement API',
    description: 'Mark a PRD requirement API as missing again.',
    args: ['requirementId'],
    run: (state, args = {}) => {
      const out = clearIntegrationConnection(state, args);
      return out.ok ? ok(out) : fail(out.error);
    },
  },
  {
    name: 'provider_catalog',
    title: 'Provider catalog',
    description: 'Show provider coverage for requirement IDs without creating a live connector.',
    args: ['providerId'],
    run: (_state, args = {}) => {
      const providerId = args.providerId || 'sandbox';
      const provider = providerCatalog(providerId);
      if (!provider) return fail('UNKNOWN_PROVIDER');
      return ok({
        providerId: provider.providerId,
        name: provider.name,
        docsUrl: provider.docsUrl,
        posture: provider.posture,
        notes: provider.notes,
        requirements: providerRequirementMap(provider.providerId),
      });
    },
  },
  {
    name: 'sandbox_adapter_plan',
    title: 'Sandbox adapter plan',
    description: 'Show Sandbox operation-level adapter rules, owner modules, and CA approval gates. Does not call Sandbox.',
    args: ['requirementId', 'operationId'],
    run: (_state, args = {}) => {
      const out = sandboxAdapterPlan({
        requirementId: args.requirementId,
        operationId: args.operationId,
      });
      if (!out.operations.length) return fail('SANDBOX_OPERATION_NOT_FOUND');
      return ok(out);
    },
  },
  {
    name: 'sandbox_keys',
    title: 'Sandbox keys on this machine',
    description: 'Whether a Sandbox by Quicko API key and secret are saved on this machine (encrypted), the environment and host they point at, and when they were saved. Never shows the key. Read-only.',
    run: () => ok(publicSandboxKeys()),
  },
  {
    name: 'sandbox_save_keys',
    title: 'Save sandbox keys',
    description: 'Save the Sandbox by Quicko API key and secret from developer.sandbox.co.in on this machine, encrypted in the local vault, with the environment (test or live) and host. Every sandbox call uses them from then on unless MYCA_GSP_* variables are set in .env. Desktop only.',
    args: ['environment', 'apiKey', 'apiSecret', 'baseUrl'],
    run: (_state, args = {}) => {
      const out = saveSandboxKeys(args);
      if (out.ok) resetSandboxClient();
      return out.ok ? ok(out.keys) : fail(out.error, out);
    },
  },
  {
    name: 'sandbox_clear_keys',
    title: 'Forget sandbox keys',
    description: 'Remove the saved Sandbox by Quicko key and secret from this machine.',
    run: () => {
      const out = clearSandboxKeys();
      resetSandboxClient();
      return ok(out.keys);
    },
  },
  {
    name: 'sandbox_status',
    title: 'Sandbox by Quicko status',
    description: 'Ping and verify connection to Quicko Sandbox GSP API using configured credentials.',
    run: async () => {
      const client = getSandboxClient();
      if (mockModeEnabled()) {
        return ok({
          ok: true,
          configured: client.isConfigured(),
          live: false,
          mock: true,
          provider: 'sandbox',
          baseUrl: client.baseUrl,
          ms: 0,
          environment: 'mock',
          hint: 'Mock mode active (MYCA_MOCK_MODE=1) — simulated connection, no credentials needed.',
        });
      }
      if (client.isConfigured() && !liveCallsEnabled()) {
        return ok({
          ok: false,
          configured: true,
          live: false,
          provider: 'sandbox',
          baseUrl: client.baseUrl,
          error: 'LIVE_CALLS_DISABLED',
          hint: 'Credential-led outbound calls are disabled by default. Set MYCA_ENABLE_LIVE_CALLS=1 in platform/.env to allow calls to Quicko Sandbox.',
        });
      }
      return ok(await client.ping());
    },
  },
  {
    name: 'sandbox_connect',
    title: 'Connect Sandbox by Quicko',
    description: 'Register Sandbox for REQ-CA-006 (GSP), REQ-CA-007 (E-Invoice), REQ-CA-008 (GSTIN), REQ-CA-009 (Income Tax), and REQ-CA-010 (TDS).',
    run: (state) => {
      const sandbox = getSandboxClient();
      if (!sandbox.isConfigured()) {
        return fail('MISSING_SANDBOX_CREDENTIALS', { hint: 'Configure MYCA_GSP_API_KEY and MYCA_GSP_API_SECRET in platform/.env' });
      }
      const connections = [
        { requirementId: 'REQ-CA-006', notes: 'GSP return filing and ledger reconciliation' },
        { requirementId: 'REQ-CA-007', notes: 'NIC e-invoice generation and cancel via Sandbox' },
        { requirementId: 'REQ-CA-008', notes: 'Live taxpayer GSTIN validation and status check' },
        { requirementId: 'REQ-CA-009', notes: 'Income-tax calculator and AIS/26AS reconciliation inputs' },
        { requirementId: 'REQ-CA-010', notes: 'TDS analytics, reports, and FVU package generation' },
      ];
      for (const conn of connections) {
        setIntegrationConnection(state, {
          requirementId: conn.requirementId,
          provider: 'Sandbox by Quicko',
          baseUrl: sandbox.baseUrl,
          notes: conn.notes,
        });
      }
      return ok({
        connected: connections.map((c) => c.requirementId),
        readiness: integrationReadiness(state.integrationConnections),
      });
    },
  },
  {
    name: 'sandbox_operation',
    title: 'Run Sandbox provider operation',
    description: 'Execute a catalogued Quicko Sandbox operation through the adapter contract. Read/prepare ops run directly; auth/write/file ops need an approved CA approval id.',
    args: ['operationId', 'params', 'caApprovalId', 'actorId'],
    run: async (state, args = {}) => {
      const clientId = activeClientId(state);
      if (args.clientId && normalizeClientId(args.clientId) !== clientId) return fail('CLIENT_NOT_ACTIVE', { clientId, requested: normalizeClientId(args.clientId) });
      const actor = resolveToolActor(args, 'actorId');
      const out = await runSandboxOperation({
        operationId: args.operationId,
        actorId: actor.userId,
        actor,
        caApprovalId: args.caApprovalId || '',
        params: args.params || {},
        payloadSummary: args.payloadSummary || {},
        clientId,
      }, { state });
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'approval_request',
    title: 'Request CA approval',
    description: 'Open a CA approval request for a gated external action (e.g. e-invoice generate, GST filing). The approval is bound to the client and to the exact action parameters passed as params. Maker-checker enforced.',
    args: ['operationId', 'requirementId', 'requestedBy', 'note', 'clientId', 'params', 'period', 'gstin', 'quarter', 'form', 'tan'],
    run: (state, args = {}) => {
      const forFiling = !args.params && (args.period || args.quarter) ? filingApprovalSubject(state, args.operationId, args) : null;
      if (forFiling && !forFiling.ok) return fail(forFiling.error, forFiling);
      const out = requestApproval(state, {
        operationId: args.operationId,
        requirementId: args.requirementId || '',
        clientId: args.clientId || activeClientId(state),
        params: forFiling ? forFiling.subject : args.params || {},
        actor: resolveToolActor(args, 'requestedBy'),
        payloadSummary: args.payloadSummary || {},
        note: args.note || '',
      });
      return out.ok ? ok(out) : fail(out.error);
    },
  },
  {
    name: 'approval_decide',
    title: 'Approve or reject request',
    description: 'Record a CA decision on an approval request. Requires a reviewer role and a decider other than the requester.',
    args: ['approvalId', 'decision', 'decidedBy', 'role', 'reason'],
    run: (state, args = {}) => {
      const out = decideApproval(state, {
        approvalId: args.approvalId,
        decision: args.decision,
        actor: resolveToolActor(args, 'decidedBy', ''),
        reason: args.reason || '',
      });
      return out.ok ? ok(out) : fail(out.error);
    },
  },
  {
    name: 'approval_list',
    title: 'List approval requests',
    description: 'Show approval requests and their live status (pending, approved, rejected, used, expired).',
    run: (state) => ok({
      approvals: (state.approvals || []).map((a) => ({ ...a, status: approvalStatus(a) })),
    }),
  },
  {
    name: 'nim_status',
    title: 'NVIDIA NIM status',
    description: 'Check NVIDIA NIM AI model connection and configuration (free meta/llama-3.3-70b-instruct).',
    run: async () => {
      const client = getNimClient();
      if (mockModeEnabled()) {
        return ok({
          ok: true,
          configured: client.isConfigured(),
          live: false,
          mock: true,
          provider: 'nvidia_nim',
          model: client.defaultModel,
          hint: 'Mock mode active (MYCA_MOCK_MODE=1) — simulated AI connection.',
        });
      }
      if (client.isConfigured() && !liveCallsEnabled()) {
        return ok({
          ok: false,
          configured: true,
          live: false,
          provider: 'nvidia_nim',
          model: client.defaultModel,
          error: 'LIVE_CALLS_DISABLED',
          hint: 'Credential-led outbound calls are disabled by default. Set MYCA_ENABLE_LIVE_CALLS=1 in platform/.env to allow calls to NVIDIA NIM.',
        });
      }
      return ok(await client.ping());
    },
  },
  {
    name: 'nim_ask',
    title: 'Ask NVIDIA NIM',
    description: 'Query NVIDIA NIM free LLM for statutory tax analysis, client emails, or notice review.',
    args: ['prompt', 'model'],
    run: async (_state, args = {}) => {
      const prompt = args.prompt || '';
      if (!prompt) return fail('prompt required');
      if (mockModeEnabled()) {
        return ok({
          ok: true,
          mock: true,
          model: args.model || 'mock',
          reply: 'Simulated assistant reply (MYCA_MOCK_MODE=1):\n\n1. The GSTR-1 summary exports to the GSTN offline utility JSON via export_gstr1_json.\n2. Reconciliation flags unmatched credit notes under Rule 37A.\n3. E-invoice generation is available in mock mode and tags results mock:true.',
          hint: 'No model was contacted. Enable MYCA_ENABLE_LIVE_CALLS=1 with NVIDIA_NIM_API_KEY for a real answer.',
        });
      }
      if (!liveCallsEnabled()) {
        return fail('LIVE_CALLS_DISABLED', { hint: 'Set MYCA_ENABLE_LIVE_CALLS=1 in platform/.env to allow outbound model calls.' });
      }
      const client = getNimClient();
      const res = await client.complete({ prompt, model: args.model });
      return res.ok ? ok(res) : fail(res.error, { hint: res.hint });
    },
  },
  {
    name: 'prepare_itr',
    title: 'ITR regime compare',
    description: 'AIS/26AS + income → old vs new regime, TDS credit, payable.',
    run: (state, args = {}) => {
      let ais = args.aisText || state.files.ais || '';
      let tds26 = args.tds26Text || state.files.form26as || '';
      let income = args.incomeText || state.files.income || '';
      if (!ais || !tds26 || !income) {
        const docs = listDocuments(state, state.activeClientId || 'SELF');
        if (docs.ok) {
          const list = docs.data?.documents || [];
          if (!ais) {
            const d = list.find((x) => x.kind === 'ais');
            if (d) {
              const res = getDocumentContent(state, state.activeClientId || 'SELF', d.id);
              if (res.ok) ais = res.data.content;
            }
          }
          if (!tds26) {
            const d = list.find((x) => x.kind === 'form26as' || x.kind === '26as');
            if (d) {
              const res = getDocumentContent(state, state.activeClientId || 'SELF', d.id);
              if (res.ok) tds26 = res.data.content;
            }
          }
          if (!income) {
            const d = list.find((x) => x.kind === 'income');
            if (d) {
              const res = getDocumentContent(state, state.activeClientId || 'SELF', d.id);
              if (res.ok) income = res.data.content;
            }
          }
        }
      }
      const result = filingPrep({
        aisText: ais,
        tds26Text: tds26,
        incomeText: income,
        fy: state.company.fy,
      });
      return ok(result.itr);
    },
  },
  {
    name: 'monitor_tds',
    title: 'TDS threshold monitor',
    description: 'Flag vendor payments that crossed 194A/C/I/J thresholds.',
    run: (state, args = {}) => {
      let payments = args.paymentsText || state.files.payments || '';
      if (!payments) {
        const docs = listDocuments(state, state.activeClientId || 'SELF');
        if (docs.ok) {
          const d = (docs.data?.documents || []).find((x) => x.kind === 'payments' || x.kind === 'tds');
          if (d) {
            const res = getDocumentContent(state, state.activeClientId || 'SELF', d.id);
            if (res.ok) payments = res.data.content;
          }
        }
      }
      const result = filingPrep({ paymentsText: payments, fy: state.company.fy });
      return ok(result.tds);
    },
  },
  {
    name: 'import_tally',
    title: 'Import Tally Day Book',
    description: 'Ingest a Tally / TallyPrime Day Book CSV with alias mapping and row isolation.',
    args: ['csv'],
    run: (state, args) => {
      if (!args.csv) return fail('csv required');
      const result = ingestTally({ type: 'csv', content: args.csv }, { asOfDate: args.asOfDate, fileLabel: args.fileName || 'tally.csv' });
      const good = (result.rows || []).filter((r) => !r._blocking);
      const ledger = postTallyRows(state, good);
      state.imports.push({ source: 'tally', at: new Date().toISOString(), ok: result.ok, rows: result.rows.length, posted: ledger.posted, heldBack: heldBackFrom(ledger.skipped) });
      return ok({ ...result, ledger });
    },
  },
  {
    name: 'import_tally_xml',
    title: 'Import Tally XML',
    description: 'Parse a TallyPrime XML envelope into Day Book rows, then post like CSV import.',
    args: ['xml'],
    run: (state, args) => {
      const xml = args.xml || state.files.tallyXml || state.pendingFile?.content;
      if (!xml) return fail('xml required — attach a Tally XML export');
      const converted = tallyXmlToDayBookCsv(xml);
      if (!converted.ok) return fail(converted.error);
      if (!converted.count) return fail('No VOUCHER nodes found');
      const result = ingestTally({ type: 'csv', content: converted.csv }, { asOfDate: args.asOfDate, fileLabel: args.fileName || 'tally.xml' });
      const good = (result.rows || []).filter((r) => !r._blocking);
      const ledger = postTallyRows(state, good);
      state.imports.push({ source: 'tally-xml', at: new Date().toISOString(), ok: result.ok, rows: result.rows.length, posted: ledger.posted, heldBack: heldBackFrom(ledger.skipped) });
      return ok({ ...result, converted, ledger });
    },
  },
  {
    name: 'import_zoho',
    title: 'Import Zoho Books invoices',
    description: 'Parse a Zoho Books invoice export and post each invoice into the ledger.',
    args: ['csv'],
    run: (state, args) => {
      if (!args.csv) return fail('csv required');
      const parsed = parseZohoBooksCsv(args.csv);
      if (parsed.meta?.error) return fail(parsed.meta.error, { parsed: parsed.meta });
      const created = [];
      const skipped = [];
      for (const inv of parsed.invoices) {
        if ((state.invoices || []).some((i) => i.id === inv.id)) {
          skipped.push({ id: inv.id, reason: 'exists' });
          continue;
        }
        const missingRate = inv.lines.some((l) => l.gstRate == null);
        if (missingRate) {
          skipped.push({ id: inv.id, reason: 'gst_rate_missing' });
          continue;
        }
        const result = createInvoice(state, inv);
        if (result.ok) created.push(result);
        else skipped.push({ id: inv.id, reason: result.error });
      }
      state.imports.push({ source: 'zoho', at: new Date().toISOString(), count: created.length, skipped: skipped.length, heldBack: heldBackFrom(skipped.map((s) => ({ voucherNo: s.id, reason: s.reason }))) });
      return ok({ parsed: parsed.meta, created, skipped });
    },
  },
  {
    name: 'import_pos_sales',
    title: 'Import counter sales',
    description: 'Parse a daily sales summary from a billing counter or POS (CSV with date, GST rate and taxable value, optionally CGST, SGST, IGST and bill count) and post one walk-in invoice per day by GST rate, which lands in B2CS of GSTR-1. A day already imported, a row without a rate or date, or a day whose GST in the file differs from the rate is held back by name.',
    args: ['csv'],
    run: (state, args = {}) => {
      if (!args.csv) return fail('csv required');
      const result = importPosSales(state, args);
      if (!result.ok) return fail(result.error, { parsed: result.parsed });
      state.imports.push({ source: 'pos', at: new Date().toISOString(), count: result.created.length, skipped: result.skipped.length, heldBack: heldBackFrom(result.skipped.map((s) => ({ voucherNo: s.id, reason: s.reason }))) });
      return ok(result);
    },
  },
  {
    name: 'import_settlement',
    title: 'Import a marketplace settlement',
    description: 'Read a payout report from Amazon, Flipkart, another marketplace or a gateway (CSV: one amount per row with a description, or one row per order with sale, fees and settlement value). Every line is typed as sale, tax, refund, fee, penalty, reimbursement, TCS or TDS 194-O; the expected payout is their sum; it is matched to a bank credit already in the books, or to the amount you state. A shortfall, a penalty or a payout missing from the bank becomes an exception with the orders behind it. Figures come only from the file and the ledger.',
    args: ['csv', 'channel', 'bankAmount'],
    run: (state, args = {}) => {
      if (!args.csv) return fail('csv required');
      const result = importSettlement(state, args);
      if (!result.ok) return fail(result.error, { parsed: result.parsed, id: result.id, settlementId: result.settlementId });
      state.imports.push({ source: `settlement:${result.settlement.channel}`, at: new Date().toISOString(), count: 1, skipped: result.settlement.held.length, heldBack: heldBackFrom(result.settlement.held.map((h) => ({ voucherNo: `row ${h.row}`, reason: h.reason }))) });
      const posting = postSettlement(state, result.settlement);
      return ok({ settlement: result.settlement, posting });
    },
  },
  {
    name: 'import_marketplace_orders',
    title: 'Import marketplace orders',
    description: 'Read an order report from Amazon (MTR), Flipkart (GST report) or another channel (CSV with order id, date, delivery state, GST rate and taxable value or invoice amount) and post the orders as sales to unregistered buyers, one invoice per day and delivery state with a line per GST rate, so GSTR-1 carries them under B2CS by state. Return and refund rows become credit notes against the order they reverse. An order already in the books, a row without a state or rate, or a return for an order not in the books is held back by name.',
    args: ['csv', 'channel'],
    run: (state, args = {}) => {
      if (!args.csv) return fail('csv required');
      const result = importMarketplaceOrders(state, args);
      if (!result.ok) return fail(result.error, { parsed: result.parsed });
      state.imports.push({ source: `orders:${result.channel}`, at: new Date().toISOString(), count: result.created.length + result.credited.length, skipped: result.skipped.length, heldBack: heldBackFrom(result.skipped.map((s) => ({ voucherNo: s.id, reason: s.reason }))) });
      return ok(result);
    },
  },
  {
    name: 'set_channel_identity',
    title: 'Marketplace GSTIN and TAN',
    description: 'Record a marketplace\'s GSTIN (the e-commerce operator that collects TCS) and TAN (the deductor of TDS under section 194-O), so the portal\'s TCS statement and Form 26AS match the channel by number. Owner only.',
    args: ['channel', 'gstin', 'tan', 'name'],
    run: (state, args = {}) => setChannelIdentity(state, args),
  },
  {
    name: 'import_tcs_statement',
    title: 'Import the TCS credit statement',
    description: 'Read the GST portal\'s "TDS and TCS credit received" statement (CSV: operator GSTIN, period, integrated, central and state tax) and record the TCS each marketplace deposited for you, month by month. A confirmed month is used from the electronic cash ledger in the next GST payment before new cash. Rows already recorded are skipped.',
    args: ['csv'],
    run: (state, args = {}) => {
      if (!args.csv) return fail('csv required');
      const result = importTcsStatement(state, args);
      if (!result.ok) return fail(result.error, { parsed: result.parsed });
      state.imports.push({ source: 'tcs-statement', at: new Date().toISOString(), count: result.imported, skipped: result.skipped.length, heldBack: heldBackFrom(result.skipped.filter((s) => s.reason !== 'exists').map((s) => ({ voucherNo: s.id, reason: s.reason }))) });
      return ok(result);
    },
  },
  {
    name: 'import_26as_credits',
    title: 'Import Form 26AS',
    description: 'Read Form 26AS (CSV or text table: section, TAN of deductor, tax deducted, date) and record every row, whatever its section, against your PAN, quarter by quarter. Rows under section 194-O are the marketplace credits; the rest are what customers deducted, to be compared with the books. Rows already recorded are skipped.',
    args: ['csv'],
    run: (state, args = {}) => {
      if (!args.csv) return fail('csv required');
      const result = import26asCredits(state, args);
      if (!result.ok) return fail(result.error, { parsed: result.parsed });
      state.imports.push({ source: '26as', at: new Date().toISOString(), count: result.imported, skipped: result.skipped.length, heldBack: heldBackFrom(result.skipped.filter((s) => s.reason !== 'exists').map((s) => ({ voucherNo: s.id, reason: s.reason }))) });
      return ok(result);
    },
  },
  {
    name: 'record_tds_withheld',
    title: 'TDS withheld by a customer',
    description: 'Record TDS a customer deducted from an invoice: the invoice settles by that amount and the credit sits in TDS receivable until 26AS confirms it.',
    args: ['invoiceId', 'amount', 'date', 'section', 'tan'],
    run: (state, args = {}) => recordTdsWithheld(state, args),
  },
  {
    name: 'tds_credit_check',
    title: 'Form 26AS check',
    description: 'Compare Form 26AS with the TDS recorded in the books, per deductor and quarter: what 26AS shows, what the books show, the gap, and which side is missing. Read-only.',
    args: ['fy'],
    run: (state, args = {}) => tdsCreditCheck(state, args),
  },
  {
    name: 'marketplace_credits',
    title: 'TCS and TDS 194-O credits',
    description: 'What marketplaces deducted from settlements as GST TCS (by month) and income-tax TDS under 194-O (by quarter), against what the portal statement and Form 26AS confirm; the gaps; how much TCS is available for the next GST payment. Read-only.',
    args: ['fy'],
    run: (state, args = {}) => marketplaceCredits(state, args),
  },
  {
    name: 'set_sku_cost',
    title: 'SKU cost',
    description: 'Record a product\'s unit cost (and name, HSN) so margins by SKU and channel can be computed. The cost is what you paid per unit, landed. Owner only.',
    args: ['sku', 'cost', 'name', 'hsn', 'gstRate', 'on'],
    run: (state, args = {}) => setSkuCost(state, args),
  },
  {
    name: 'import_sku_costs',
    title: 'Import SKU costs',
    description: 'Read a sheet of SKUs with their unit cost (CSV: sku, cost, optionally name and HSN) and record them. Later rows for the same SKU replace earlier ones.',
    args: ['csv'],
    run: (state, args = {}) => {
      if (!args.csv) return fail('csv required');
      const result = importSkuCosts(state, args);
      if (!result.ok) return fail(result.error, { need: result.need });
      return ok(result);
    },
  },
  {
    name: 'record_stock',
    title: 'Stock in or out',
    description: 'Record stock received, sent to a warehouse or counted: a positive quantity adds, a negative removes, at a location (own, amazon, flipkart, a warehouse name). Marketplace orders move stock out of the channel\'s location on import; returns move it back.',
    args: ['sku', 'qty', 'location', 'date', 'note', 'kind'],
    run: (state, args = {}) => recordStock(state, args),
  },
  {
    name: 'stock_position',
    title: 'Stock on hand',
    description: 'Quantity on hand by SKU and location from recorded movements, valued at the recorded cost; locations gone negative are listed. Read-only.',
    args: ['sku', 'location'],
    run: (state, args = {}) => stockPosition(state, args),
  },
  {
    name: 'stock_moves',
    title: 'Stock history',
    description: 'The recorded movements of a SKU or a location, newest first: orders out, returns in, stock recorded or transferred, each with its reference. Read-only.',
    args: ['sku', 'location', 'limit'],
    run: (state, args = {}) => stockMoves(state, args),
  },
  {
    name: 'value_inventory',
    title: 'Value inventory in the books',
    description: 'Post the value of stock on hand at recorded cost as at a date: the change since the last valuation goes to the Inventory asset against Change in inventory, so cost of goods for the period is purchases less the rise in stock (or plus the fall). SKUs without a cost are left out and named. Each valuation is dated after the last. Owner only.',
    args: ['asOf'],
    run: (state, args = {}) => valueInventory(state, args),
  },
  {
    name: 'inventory_valuations',
    title: 'Inventory valuations',
    description: 'The valuations posted so far, the latest, and what stock on hand is worth now against what is posted. Read-only.',
    args: [],
    run: (state) => listInventoryValuations(state),
  },
  {
    name: 'sku_margins',
    title: 'Margins by SKU and channel',
    description: 'For marketplace orders in a month: units, net sales after returns, the channel\'s fees and penalties allocated to each order from its settlements, cost of goods from the recorded SKU cost, and the margin and its percentage, by SKU and by channel. SKUs without a cost are listed. Read-only.',
    args: ['period', 'channel'],
    run: (state, args = {}) => skuMargins(state, args),
  },
  {
    name: 'set_registration',
    title: 'Add a GST registration',
    description: 'Add or update a second registration of this business in another state (an additional place of business in a marketplace warehouse, a warehouse of your own, or a branch) by its GSTIN. It shares the PAN of the principal GSTIN; one active registration per state. Invoices, bills, returns and filings can then name it; without a GSTIN they mean the principal. Owner only.',
    args: ['gstin', 'kind', 'label', 'effectiveFrom'],
    run: (state, args = {}) => setRegistration(state, args),
  },
  {
    name: 'retire_registration',
    title: 'Retire a GST registration',
    description: 'Mark a registration as surrendered from a date. Refused while it has unpaid invoices or bills; settle or cancel them first. Owner only.',
    args: ['gstin', 'effectiveTo'],
    run: (state, args = {}) => retireRegistration(state, args),
  },
  {
    name: 'registrations',
    title: 'GST registrations',
    description: 'The registrations of this business: principal and additional, their states, documents under each, and whether GSTR-1 and GSTR-3B are recorded as filed for the last three months. Read-only.',
    args: [],
    run: (state) => listRegistrations(state),
  },
  {
    name: 'record_stock_transfer',
    title: 'Stock transfer between registrations',
    description: 'Move stock from one registration of the business to another (for example to a marketplace warehouse in another state): raises the transfer invoice under the sending registration at cost (or a stated unit value) with IGST, the matching bill with input credit under the receiving one, settles the two by contra, moves the stock, and says whether an e-way bill is needed.',
    args: ['sku', 'qty', 'fromGstin', 'toGstin', 'date', 'unitValue', 'gstRate', 'hsn'],
    run: (state, args = {}) => recordStockTransfer(state, args),
  },
  {
    name: 'save_gstr1_portal',
    title: 'Save GSTR-1 to the GST portal',
    description: 'Build the GSTR-1 of a month (and registration) from the books and save it to the GST portal through the GSP behind the action gate: live calls on and a CA approval for the operation. Refused while any invoice is held back. Files nothing; filing is a separate step.',
    args: ['period', 'gstin', 'caApprovalId'],
    run: async (state, args = {}) => {
      const out = await saveGstr1ToPortal(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'file_gstr1_portal',
    title: 'File GSTR-1 on the GST portal (EVC)',
    description: 'File the GSTR-1 saved to the portal for a month with the EVC OTP, through the GSP behind the action gate (live calls on, CA approval). Only after the review for the month is approved and only if the invoices have not changed since the save. Records the filing with its acknowledgement. Cannot be undone.',
    args: ['period', 'gstin', 'otp', 'pan', 'caApprovalId'],
    run: async (state, args = {}) => {
      const out = await fileGstr1OnPortal(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'save_gstr3b_portal',
    title: 'Save GSTR-3B to the GST portal',
    description: 'Build the GSTR-3B of a month (and registration) from the books in the GSTN format (outward supplies, zero-rated, nil and non-GST, unregistered inter-state supplies by place of supply, input credit, interest) and save it to the GST portal through the GSP behind the action gate. Pays and files nothing.',
    args: ['period', 'gstin', 'caApprovalId'],
    run: async (state, args = {}) => {
      const out = await saveGstr3bToPortal(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'gstr3b_portal_liability',
    title: 'GSTR-3B liability from the portal',
    description: 'Read the liability the GST portal worked out for a GSTR-3B already saved, and keep its ledger ids for the set-off. Read-only.',
    args: ['period', 'gstin'],
    run: async (state, args = {}) => {
      const out = await gstr3bPortalLiability(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'offset_gstr3b_portal',
    title: 'Pay GSTR-3B tax on the GST portal',
    description: 'Set off the GSTR-3B tax of a month on the GST portal: the input credit in the order the law sets, the rest and any interest and late fee from the cash ledger (paid by challan beforehand). Only after the GST review for the month is approved and only if the books have not changed since the save. Cannot be undone.',
    args: ['period', 'gstin', 'caApprovalId'],
    run: async (state, args = {}) => {
      const out = await offsetGstr3bOnPortal(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'file_gstr3b_portal',
    title: 'File GSTR-3B on the GST portal (EVC)',
    description: 'File the GSTR-3B saved to the portal for a month with the EVC OTP, after the tax was set off, through the GSP behind the action gate. Records the filing with its acknowledgement. Cannot be undone.',
    args: ['period', 'gstin', 'otp', 'pan', 'caApprovalId'],
    run: async (state, args = {}) => {
      const out = await fileGstr3bOnPortal(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'generate_tds_fvu',
    title: 'Generate the TDS FVU through the provider',
    description: 'Submit the quarter\'s TDS statement (24Q salary, 26Q others, 27Q non-residents) to the provider\'s FVU job behind the action gate, and keep the job id and file links. The signed TXT and CSI uploads still happen on the provider\'s links.',
    args: ['quarter', 'form', 'tan', 'filingType', 'caApprovalId'],
    run: async (state, args = {}) => {
      const out = await generateTdsFvu(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'portal_status',
    title: 'Portal saves and FVU jobs',
    description: 'What has been saved to the GST portal, what was filed with its acknowledgement, and the TDS FVU jobs. Read-only.',
    args: [],
    run: (state) => portalStatus(state),
  },
  {
    name: 'set_channel_connector',
    title: 'Connect a sales channel',
    description: 'Save the credentials for Amazon Seller Central (SP-API client id, secret, refresh token, marketplace id), Shopify (shop domain, Admin API access token) or Razorpay (key id, secret) in the local vault, or pause a connector. Secrets never appear in replies. Fetching still needs live calls on. Owner only; not for the assistant.',
    args: ['channel', 'clientId', 'clientSecret', 'refreshToken', 'marketplaceId', 'region', 'shopDomain', 'accessToken', 'keyId', 'keySecret', 'orgId', 'dc', 'secret', 'environment', 'apiToken', 'apiKey', 'testMode', 'redirectUri', 'companyUuid', 'enabled'],
    run: (_state, args = {}) => {
      const { channel, ...patch } = args;
      const out = saveChannelConfig(String(channel || '').toLowerCase(), patch);
      return out.ok === false ? fail(out.error, out) : ok(out);
    },
  },
  {
    name: 'channel_connectors',
    title: 'Sales channel connectors',
    description: 'Which channels are connected for fetching settlement and order reports, when each was last fetched, and which channels stay file imports. Read-only; no secrets.',
    args: [],
    run: () => listConnectors(),
  },
  {
    name: 'push_zoho_invoices',
    title: 'Send invoices to Zoho Books',
    description: "Send the month's invoices that are not yet in Zoho Books to the connected Zoho organisation through the action gate: the customer is found or created, each line carries its HSN and the matching Zoho tax, and the invoice keeps its Zoho id. Live calls must be on and a CA approval named; mock mode simulates and marks nothing. Your books do not change.",
    args: ['period', 'caApprovalId'],
    run: async (state, args = {}) => {
      const out = await pushZohoInvoices(state, args, { actor: resolveToolActor(args) });
      return out.ok === false ? fail(out.error, out) : ok(out);
    },
  },
  {
    name: 'us_connectors',
    title: 'US connectors',
    description: 'Plaid, TaxJar, Gusto and Track1099 on this machine: what is saved (never a secret), whether each is linked, and the Gusto redirect URLs to register. Read-only.',
    run: () => usConnectorsStatus(),
  },
  {
    name: 'plaid_link_sandbox',
    title: 'Link a Plaid sandbox bank',
    description: 'In the Plaid sandbox, create a test bank item without Plaid Link (sandbox public token, then the exchange) and keep the access token in the vault, so fetch_channel_report { channel: "plaid", kind: "bank" } pulls its transactions. Behind the channel pull switch; mock mode simulates it.',
    args: ['institutionId'],
    run: async (state, args = {}) => plaidLinkSandbox(state, args, resolveToolActor(args)),
  },
  {
    name: 'plaid_link_token',
    title: 'Plaid Link token',
    description: 'Create the short-lived Plaid Link token the app opens Plaid Link with, so the owner can choose their real bank; the public token that comes back goes to plaid_exchange. Behind the channel pull switch. Read-only.',
    args: ['userId'],
    run: async (state, args = {}) => plaidLinkToken(state, args, resolveToolActor(args)),
  },
  {
    name: 'plaid_exchange',
    title: 'Finish the Plaid link',
    description: 'Exchange the public token from Plaid Link for the access token and keep it in the vault, so the bank transactions pull from then on. Behind the channel pull switch.',
    args: ['publicToken'],
    run: async (state, args = {}) => plaidExchange(state, args, resolveToolActor(args)),
  },
  {
    name: 'taxjar_rate',
    title: 'Sales tax rate from TaxJar',
    description: 'Look up the combined sales tax rate for a US zip code (with city and state) from TaxJar and record it as the rate for that jurisdiction from today, so invoices there use it. Behind the channel pull switch; mock mode returns a simulated Austin rate.',
    args: ['zip', 'city', 'state', 'code', 'name', 'from', 'record'],
    run: async (state, args = {}) => taxjarRate(state, args, resolveToolActor(args)),
  },
  {
    name: 'gusto_connect_url',
    title: 'Connect Gusto',
    description: 'Build the Gusto OAuth link for the saved client id; opening it and allowing the app sends the browser back to MyCA, which exchanges the code for tokens and keeps them in the vault.',
    args: ['redirectUri', 'port'],
    run: (_state, args = {}) => gustoConnectUrl(args),
  },
  {
    name: 'gusto_callback',
    title: 'Finish the Gusto connection',
    description: 'Exchange the code Gusto sent back for tokens (the state must match the link MyCA built). Called by the browser redirect; behind the channel pull switch.',
    args: ['code', 'state'],
    run: async (state, args = {}) => gustoCallback(state, args, resolveToolActor(args)),
  },
  {
    name: 'import_payroll_summary',
    title: 'Post payrolls run by a provider',
    description: 'Post the payrolls a provider (Gusto) ran, from its summary CSV (check date, gross, net, employee taxes, employer taxes, reimbursements): wages and employer taxes as expenses, the net and taxes as payables, and the bank debits on the check dates unless settle is false. Payrolls already posted are skipped by id. They stay out of MyCA\'s own 941 draft because the provider files it. US only.',
    args: ['csv', 'documentSha256', 'provider', 'settle', 'fileName'],
    run: (state, args = {}) => postPayrollImport(state, args),
  },
  {
    name: 'list_payroll_imports',
    title: 'Payrolls posted from a provider',
    description: 'The payrolls posted from a provider\'s summaries, with their check dates and totals. Read-only. US only.',
    run: (state) => listPayrollImports(state),
  },
  {
    name: 'track1099_csv',
    title: '1099-NEC forms in Track1099\'s template',
    description: 'The year\'s 1099-NEC recipients as the CSV Track1099 imports, column for column (reference id, names, federal id type, address, email, box 1). The TIN column stays blank because MyCA keeps only the last four digits. Read-only.',
    args: ['year'],
    run: (state, args = {}) => track1099Csv(state, args),
  },
  {
    name: 'track1099_issuers',
    title: 'Payers in Track1099',
    description: 'List the payers (issuers) in the Track1099 account, with their ids, so the forms can be imported under the right one. Behind the channel pull switch. Read-only.',
    run: async (state, args = {}) => track1099Issuers(state, args, resolveToolActor(args)),
  },
  {
    name: 'track1099_import',
    title: 'Import the 1099-NEC forms into Track1099',
    description: 'Upload the year\'s 1099-NEC CSV into a Track1099 payer through the action gate (live calls on and a CA approval) and keep the import job. Track1099 e-files only when the forms are scheduled and paid for there; MyCA files nothing.',
    args: ['year', 'issuerId', 'caApprovalId'],
    run: async (state, args = {}) => track1099Import(state, args, resolveToolActor(args)),
  },
  {
    name: 'track1099_job',
    title: 'Track1099 import job status',
    description: 'Check a Track1099 import job: status and how many forms imported, were ok, lacked an email or had errors. Behind the channel pull switch. Read-only.',
    args: ['jobId'],
    run: async (state, args = {}) => track1099Job(state, args, resolveToolActor(args)),
  },
  {
    name: 'fetch_channel_report',
    title: 'Fetch a channel report',
    description: 'Pull a settlement or orders report from a connected channel for a date range through the action gate (live calls must be on; mock mode returns a simulated file). The report is stored as a file with a reminder; nothing posts until it is imported after a preview.',
    args: ['channel', 'kind', 'from', 'to'],
    run: async (state, args = {}) => {
      const out = await fetchChannelReport(state, args, { actor: resolveToolActor(args) });
      return out.ok === false ? fail(out.error, out) : ok(out);
    },
  },
  {
    name: 'sync_channels',
    title: 'Fetch every connected channel',
    description: 'For each connected channel, pull the settlement and orders reports since the last pull (fourteen days the first time), store them and leave a reminder each. Run by the desktop once a day after the daily checks.',
    args: ['to'],
    run: async (state, args = {}) => ok((await syncChannels(state, args, { actor: resolveToolActor(args) })).data),
  },
  {
    name: 'settlement_status',
    title: 'Marketplace settlements',
    description: 'Settlements imported so far by channel: expected against paid, shortfalls, payouts not yet seen in the bank, penalties, and the TCS and TDS 194-O credits to claim. Read-only.',
    args: ['channel', 'limit'],
    run: (state, args = {}) => settlementStatus(state, args),
  },
  {
    name: 'import_us_invoices',
    title: 'Import QuickBooks or Xero invoices',
    description: 'Parse an invoice export from QuickBooks Online or Xero (CSV) and post each invoice with sales tax from the recorded jurisdiction rate. An invoice whose tax in the file differs from the recorded rate, has no jurisdiction, or has no rate recorded is held back by name. US only.',
    args: ['csv', 'taxJurisdiction'],
    run: (state, args = {}) => {
      if (!args.csv) return fail('csv required');
      const result = importUsInvoices(state, args);
      if (!result.ok) return fail(result.error, { parsed: result.parsed });
      state.imports.push({ source: result.parsed.source, at: new Date().toISOString(), count: result.created.length, skipped: result.skipped.length, heldBack: heldBackFrom(result.skipped.map((s) => ({ voucherNo: s.id, reason: s.reason }))) });
      return ok(result);
    },
  },
  {
    name: 'import_bank',
    title: 'Import bank statement',
    description: 'Ingest HDFC-style CSV, fixed-width TXT, or matrix bank statement with running-balance tie-out. Every row becomes a statement line: lines already in the books are linked, your bank rules book what they cover, and the rest is posted to guessed heads (post auto, the default) or waits for you to match (post hold). account names the own account the statement belongs to (default 1002 Bank).',
    args: ['content', 'type', 'fileName', 'asOfDate', 'post', 'account'],
    run: (state, args) => {
      const type = args.type || 'csv';
      let feed = { type, content: args.content };
      let usHeld = [];
      const aa = aaBankFeed(args);
      if (aa && !aa.ok) return fail(aa.error, { hint: aa.hint });
      if (aa) feed = aa.feed;
      if (!aa && countryOf(state) === 'US' && type === 'csv') {
        const shaped = usBankMatrix(args.content || '');
        if (!shaped.ok) return fail(shaped.error, { hint: shaped.need ? `The statement needs ${shaped.need}.` : 'The statement could not be read.' });
        feed = { type: 'matrix', rows: shaped.rows };
        usHeld = shaped.held;
      }
      const result = ingestBank(feed, { asOfDate: args.asOfDate, fileLabel: args.fileName || 'bank' });
      if (usHeld.length) result.usHeld = usHeld;
      const account = accountFor(state, args.account);
      if (!account) return fail('ACCOUNT_NOT_FOUND', { account: args.account });
      const hold = args.post === 'hold';
      const good = (result.rows || []).filter((r) => !r._blocking);
      const taken = recordStatementLines(state, good, { account: account.id, fileLabel: args.fileName || 'bank', issues: result.issues || [] });
      const openIds = taken.newLines.filter((line) => line.status === 'unmatched').map((line) => line.id);
      const ruled = openIds.length ? runBankRules(state, { account: account.id, lineIds: openIds }) : { made: [], failed: [] };
      const open = taken.newLines.filter((line) => line.status === 'unmatched');
      let ledger = { posted: 0, skipped: taken.skipped };
      if (!hold && open.length) {
        const auto = postBankRows(state, open.map((line) => taken.rowByLine.get(line.id)), { account: account.id });
        for (const made of auto.made) {
          const line = open.find((item) => item.fingerprint === made.fingerprint);
          if (line) {
            line.status = 'booked';
            line.match = { kind: 'auto', id: made.fingerprint, transferIds: [String(made.transferId)], ruleId: null, note: 'Posted to a guessed head.' };
          }
        }
        ledger = { posted: auto.posted, skipped: [...taken.skipped, ...auto.skipped] };
      }
      const lines = {
        added: taken.added.length,
        existing: taken.existing.length,
        matched: taken.matched.length,
        byRules: (ruled.made || []).length,
        ruleFailures: ruled.failed || [],
        posted: ledger.posted,
        unmatched: taken.newLines.filter((line) => line.status === 'unmatched').length,
        transfersGuessed: open.filter((line) => line.status === 'booked' && line.category === 'transfer').length,
        account: account.id,
        mode: hold ? 'hold' : 'auto',
      };
      state.imports.push({ source: 'bank', at: new Date().toISOString(), ok: result.ok, rows: result.rows?.length || 0, posted: ledger.posted, heldBack: heldBackFrom(ledger.skipped) });
      const withBalance = good.filter((r) => r.date && r.balance != null && Number.isFinite(Number(r.balance))).sort((a, b) => a.date.localeCompare(b.date) || (a.sourceRow || 0) - (b.sourceRow || 0));
      const last = withBalance.at(-1);
      let bankBalance = null;
      if (last && account.id === '1002') {
        const reading = setCashBalance(state, { on: last.date, bank: Number(last.balance) });
        bankBalance = reading.ok ? { on: last.date, balance: Number(last.balance), source: 'bank statement' } : { on: last.date, balance: Number(last.balance), notRecorded: reading.error };
      }
      return ok({ ...result, ledger, lines, ...(bankBalance ? { bankBalance } : {}), ...(aa ? { aa: { accounts: aa.accounts, skipped: aa.skipped } } : {}) });
    },
  },
  {
    name: 'gst_reconcile',
    title: 'GST reconciliation',
    description: 'Match GSTR-2B vs purchase register, GSTR-1 vs 3B, Rule 37A and IMS.',
    run: (state, args = {}) => {
      const files = { ...state.files, ...args };
      const purchaseRegister = files.purchaseRegister || purchaseRegisterCsv(state.purchases || []);
      const gstr1 = files.gstr1 || invoicesToSalesCsv(state.invoices || []);
      if (!files.gstr2b) {
        const docs = listDocuments(state, state.activeClientId || 'SELF');
        if (docs.ok) {
          const doc = (docs.data?.documents || []).find((d) => d.kind === 'gstr2b' || d.kind === 'gstr_2b');
          if (doc) {
            const content = getDocumentContent(state, state.activeClientId || 'SELF', doc.id);
            if (content.ok) files.gstr2b = content.data.content;
          }
        }
      }
      if (!files.gstr3b) {
        const docs = listDocuments(state, state.activeClientId || 'SELF');
        if (docs.ok) {
          const doc = (docs.data?.documents || []).find((d) => d.kind === 'gstr3b' || d.kind === 'gstr_3b');
          if (doc) {
            const content = getDocumentContent(state, state.activeClientId || 'SELF', doc.id);
            if (content.ok) files.gstr3b = content.data.content;
          }
        }
      }
      if (!files.gstr2b) return fail('Attach a GSTR-2B CSV (dropdown can be unused; attach as gstr2b).');
      if (!files.gstr3b) return fail('Attach GSTR-3B CSV, or ask to prepare GSTR-3B first and export.');
      return ok(reconcileDocuments(
        {
          purchaseRegisterText: purchaseRegister,
          gstr2bText: files.gstr2b,
          gstr1Text: gstr1,
          gstr3bText: files.gstr3b,
        },
        { clientGstin: state.company.gstin, asOfDate: args.asOfDate || localToday(), supplierFilings: args.supplierFilings },
      ));
    },
  },
  {
    name: 'validate_gstin',
    title: 'Validate GSTIN',
    description: 'Mod-36 check digit, state code, PAN structure, and live Quicko Sandbox taxpayer lookup.',
    args: ['gstin'],
    run: async (_state, args) => {
      const raw = String(args?.gstin || '').trim().toUpperCase();
      const local = validateGstin(raw);
      if (!local.ok) return ok(local);
      const sandbox = getSandboxClient();
      if (mockModeEnabled()) {
        return ok({
          ...local,
          liveVerified: true,
          mock: true,
          legalName: 'Nalanda Textiles Private Limited',
          tradeName: 'Nalanda Textiles',
          status: 'Active',
          taxpayerType: 'Regular',
          registrationDate: '01/04/2019',
          eInvoiceStatus: 'Y',
          natureOfBusiness: ['Textiles'],
          hint: 'Simulated lookup (MYCA_MOCK_MODE=1) — no credentials contacted.',
        });
      }
      if (!sandbox.isConfigured() || !liveCallsEnabled()) {
        return ok({
          ...local,
          liveVerified: false,
          liveReason: !sandbox.isConfigured()
            ? 'No Quicko key is set: add one under Connections (or MYCA_GSP_TEST_API_KEY in .env).'
            : 'Provider calls are off here (MYCA_PROVIDER_ENV is off).',
        });
      }
      try {
        const live = await sandbox.searchGstin(raw);
        if (live.ok) {
          return ok({
            ...local,
            liveVerified: true,
            legalName: live.legalName,
            tradeName: live.tradeName,
            status: live.status,
            taxpayerType: live.taxpayerType,
            registrationDate: live.registrationDate,
            eInvoiceStatus: live.eInvoiceStatus,
            natureOfBusiness: live.natureOfBusiness,
            address: live.raw?.pradr?.addr || null,
          });
        }
        return ok({
          ...local,
          liveVerified: false,
          liveError: live.error || 'Live search returned error',
        });
      } catch (err) {
        return ok({
          ...local,
          liveVerified: false,
          liveError: String(err.message || err),
        });
      }
    },
  },
  {
    name: 'search_gstin',
    title: 'Search GSTIN details',
    description: 'Look up taxpayer legal name, trade name, active status, taxpayer type, and address via Quicko Sandbox or NIC.',
    args: ['gstin'],
    run: async (state, args = {}) => {
      const gstinVal = args.gstin || state.company?.gstin;
      if (!gstinVal) return fail('gstin required');
      const target = TOOLS.find((t) => t.name === 'validate_gstin');
      return target.run(state, { gstin: gstinVal });
    },
  },
  {
    name: 'track_gst_returns',
    title: 'Track GST return filings',
    description: 'Check official GST return filing status, dates, and ARNs for any GSTIN from the portal.',
    args: ['gstin', 'financialYear', 'gstr'],
    run: async (state, args = {}) => {
      const gstin = String(args.gstin || state.company?.gstin || '').trim().toUpperCase();
      if (!gstin) return fail('gstin required');
      const fy = String(args.financialYear || state.company?.fy || '2025-2026').trim();
      const gstr = args.gstr ? String(args.gstr).trim().toLowerCase() : undefined;
      if (mockModeEnabled()) {
        const mockReturns = [
          { valid: 'Y', mof: 'ONLINE', dof: '10/08/2026', ret_prd: '072026', rtntype: 'GSTR1', arn: 'AA2707260012345', status: 'Filed' },
          { valid: 'Y', mof: 'ONLINE', dof: '20/08/2026', ret_prd: '072026', rtntype: 'GSTR3B', arn: 'AA2707260054321', status: 'Filed' },
          { valid: 'Y', mof: 'ONLINE', dof: '11/09/2026', ret_prd: '082026', rtntype: 'GSTR1', arn: 'AA2708260098765', status: 'Filed' },
          { valid: 'Y', mof: 'ONLINE', dof: '20/09/2026', ret_prd: '082026', rtntype: 'GSTR3B', arn: 'AA2708260043210', status: 'Filed' },
        ].filter((r) => !gstr || r.rtntype.toLowerCase() === gstr);
        return ok({
          ok: true,
          mock: true,
          gstin,
          financialYear: fy,
          count: mockReturns.length,
          returns: mockReturns,
          hint: 'Simulated return track (MYCA_MOCK_MODE=1) — no live GST portal call made.',
        });
      }
      if (!liveCallsEnabled()) {
        return fail('LIVE_CALLS_DISABLED', { hint: 'Set MYCA_ENABLE_LIVE_CALLS=1 in platform/.env to query live return filing status.' });
      }
      const client = getSandboxClient();
      if (!client.isConfigured()) {
        return fail('MISSING_SANDBOX_CREDENTIALS', { hint: 'Configure MYCA_GSP_API_KEY and MYCA_GSP_API_SECRET in platform/.env' });
      }
      const res = await client.trackGstrs(gstin, fy, gstr);
      if (!res.ok) return fail(res.error || 'TRACK_RETURNS_FAILED', { status: res.status, provider: res.data });
      const list = res.data?.data?.EFiledlist || res.data?.EFiledlist || [];
      return ok({
        ok: true,
        gstin,
        financialYear: fy,
        count: list.length,
        returns: list,
      });
    },
  },
  {
    name: 'deadlines',
    title: 'Compliance deadlines',
    description: 'Statutory due dates for the firm and every registered client (GSTR-1/3B, PMT-06, TDS, PF, advance tax, ITR, GSTR-9) from the dated rules, as of today. Due dates never roll over weekends or holidays.',
    run: (state, args = {}) => {
      const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(args.asOfDate || '')) ? args.asOfDate : localToday();
      const run = deadlineRun(state, { asOfDate, months: args.months, holidaysText: args.holidaysText || '' });
      return ok({ asOfDate, ...run });
    },
  },
  {
    name: 'tds_summary',
    title: 'TDS',
    description: 'TDS deducted on bills and expenses, deposited with the government, and still to deposit, by month with the deposit date. Read-only.',
    run: (state) => tdsSummary(state),
  },
  {
    name: 'set_tds_deductor',
    title: 'We deduct TDS',
    description: 'Record that this business deducts TDS, with its TAN. Bills and expenses can then carry a TDS section.',
    args: ['tan'],
    run: (state, args = {}) => setDeductor(state, args),
  },
  {
    name: 'add_bill_tds',
    title: 'Add TDS to a posted bill',
    description: 'Deduct TDS on a supplier bill that is already posted (BILL- number) and has no TDS yet: the section, and for 194J the category or for 194I the asset, with the supplier PAN if known. The TDS is worked out on the bill value before GST from the dated rules, as of the bill date; the supplier is owed that much less and it sits in TDS payable until deposited.',
    args: ['billId', 'tdsSection', 'tdsCategory', 'tdsAsset', 'payeePan'],
    run: (state, args = {}) => addBillTds(state, args),
  },
  {
    name: 'record_tds_deposit',
    title: 'Record a TDS deposit',
    description: 'Record TDS paid to the government with its challan reference. Defaults to everything still to deposit.',
    args: ['amount', 'date', 'challan', 'mode'],
    run: (state, args = {}) => recordTdsDeposit(state, args),
  },
  {
    name: 'tds_return',
    title: 'Quarterly TDS statement',
    description: 'Draft of the quarterly TDS statement for payments other than salary (form "other", the default) or for salary (form "salary"): deductees by PAN and section, totals by section, the challans that cover the quarter, what is still to deposit, the due date and any recorded filing. The latest quarter with deductions unless one is given as Q2 2026-27. Read-only.',
    args: ['quarter', 'form'],
    run: (state, args = {}) => tdsReturnDraft(state, args.quarter, { form: args.form || 'other' }),
  },
  {
    name: 'tds_review',
    title: 'Review the TDS statement',
    description: 'The quarterly TDS statement (non-salary by default, or form "salary") step by step: deductees, challans, then approval, each asking "Is this information correct?". Read-only.',
    args: ['period', 'form'],
    run: (state, args = {}) => tdsReviewOf(state, args.period, args.form || 'other'),
  },
  {
    name: 'tds_review_answer',
    title: 'Answer a TDS review step',
    description: 'Confirm a step of the quarterly TDS statement, mark it wrong with a note, or approve the statement. Bound to the draft the owner saw. Files nothing.',
    args: ['period', 'form', 'step', 'answer', 'draftHash', 'note'],
    run: (state, args = {}) => answerTdsReview(state, args),
  },
  {
    name: 'salary_annexure',
    title: '24Q Annexure II',
    description: 'The salary annexure for the year\'s last quarterly statement (Form 24Q Annexure II) from the approved payroll months: each employee\'s gross salary, professional tax, standard deduction, provident fund under 80C for the old regime, total income, tax and TDS deducted, with any shortfall or excess, as rows and a CSV. Exemptions and the employee\'s own declarations are not in it. Owner only. Read-only.',
    args: ['fy'],
    run: (state, args = {}) => salaryAnnexureII(state, args),
  },
  {
    name: 'tds_certificates',
    title: 'TDS certificate drafts',
    description: 'Drafts of Form 16A for a quarter (payments other than salary, one per deductee with the payments, TDS and the quarter\'s challans) or Form 16 for a financial year (form "salary": Part A by quarter and Part B from the approved payroll months), as rows and a CSV. The issued certificates come from TRACES after the statement is processed; MyCA files nothing. Read-only.',
    args: ['quarter', 'form', 'fy'],
    run: (state, args = {}) => tdsCertificates(state, args),
  },
  {
    name: 'pf_ecr',
    title: 'PF file (ECR)',
    description: 'The provident fund ECR text file for an approved payroll month, one line per member in the ECR 2.0 layout, with the remittance total. Owner only. Read-only.',
    args: ['period'],
    run: (state, args = {}) => pfEcr(state, args.period),
  },
  {
    name: 'esi_return',
    title: 'ESI file',
    description: 'The state insurance monthly contribution file for an approved payroll month, in the columns of the ESIC upload, with the remittance total. Owner only. Read-only.',
    args: ['period'],
    run: (state, args = {}) => esiReturn(state, args.period),
  },
  {
    name: 'list_employees',
    title: 'Employees',
    description: 'Employees with their monthly pay as it stands today, before any deduction. Owner only. Read-only.',
    args: ['include'],
    run: (state, args = {}) => listEmployees(state, args),
  },
  {
    name: 'payroll_run',
    title: 'Payroll for a month',
    description: 'Each employee\'s pay for a month with the days worked, provident fund, state insurance, professional tax and salary TDS from the dated rules, the net to pay and the employer\'s contributions. A draft until approved; after approval the figures are the ones posted. Owner only. Read-only.',
    args: ['period'],
    run: (state, args = {}) => (countryOf(state) === 'US' ? usPayrollFor(state, args.period) : payrollFor(state, args.period)),
  },
  {
    name: 'approve_payroll',
    title: 'Approve payroll',
    description: 'Approve a month\'s payroll: posts salaries, each deduction payable and net salary payable, and records the salary TDS. Pays nothing. Owner only.',
    args: ['period', 'draftHash'],
    run: (state, args = {}) => (countryOf(state) === 'US' ? approveUsPayroll(state, args) : approvePayroll(state, args)),
  },
  {
    name: 'record_salary_payment',
    title: 'Salaries paid',
    description: 'Record that the net salaries for an approved month were paid from the bank or cash. Owner only.',
    args: ['period', 'date', 'mode'],
    run: (state, args = {}) => recordSalaryPayment(state, args),
  },
  {
    name: 'list_payroll',
    title: 'Payroll months',
    description: 'Approved payroll months with gross, net, employer cost and whether the salaries were paid. Owner only. Read-only.',
    run: (state) => (countryOf(state) === 'US' ? listUsPayroll(state) : listPayroll(state)),
  },
  {
    name: 'payslip',
    title: 'Payslip',
    description: 'One employee\'s payslip for an approved month, laid out for display or a PDF. Owner only. Read-only.',
    args: ['period', 'employeeId'],
    run: (state, args = {}) => (countryOf(state) === 'US' ? usPayslip(state, args) : payslip(state, args)),
  },
  {
    name: 'add_employee',
    title: 'Add an employee',
    description: 'Add an employee with a joining date and a monthly salary in parts (for example Basic, HRA). Records only; no payroll is run and no deduction is worked out. Owner only.',
    args: ['name', 'joinedOn', 'components', 'designation', 'pan', 'uan', 'pfMember', 'esiMember', 'ptState', 'taxRegime', 'sex', 'workState', 'federalWithholding', 'stateWithholding', 'bankAccount', 'ifsc'],
    run: (state, args = {}) => addEmployee(state, args),
  },
  {
    name: 'change_salary',
    title: 'Change a salary',
    description: 'Set an employee\'s monthly salary from a date. Earlier months keep the salary they had. Owner only.',
    args: ['id', 'effectiveFrom', 'components'],
    run: (state, args = {}) => changeSalary(state, args),
  },
  {
    name: 'set_employee_bank',
    title: 'Employee bank account',
    description: 'Record where an employee is paid: account number and IFSC (or a US routing number). Used only for the salary payout file. Owner only.',
    args: ['id', 'bankAccount', 'ifsc'],
    run: (state, args = {}) => setEmployeeBank(state, args),
  },
  {
    name: 'payroll_payout_file',
    title: 'Salary payout file',
    description: 'A bank bulk-payment CSV for an approved payroll month: one row per employee with net pay, account and IFSC, narration SAL-<month>. Lists who has no bank details yet. Owner only. Read-only.',
    args: ['period'],
    run: (state, args = {}) => payrollPayoutFile(state, args.period),
  },
  {
    name: 'end_employment',
    title: 'Employee left',
    description: 'Record the last day of an employee. Their record and salary history are kept. Owner only.',
    args: ['id', 'leftOn'],
    run: (state, args = {}) => endEmployment(state, args),
  },
  {
    name: 'request_documents',
    title: 'Ask a client for documents',
    description: 'Ask a client for the files the firm needs (bank statement, sales register, GSTR-2B, TDS challans, ...) for a period, with a due date; records the request and drafts the message to send. Practice use.',
    args: ['clientId', 'period', 'items', 'dueOn', 'note'],
    run: (state, args = {}) => requestDocuments(state, args),
  },
  {
    name: 'record_document_received',
    title: 'Document received from a client',
    description: 'Mark one item (or all) of a document request as received, optionally with the uploaded file hash; the request completes when nothing is outstanding.',
    args: ['id', 'item', 'on', 'documentSha256'],
    run: (state, args = {}) => recordDocumentReceived(state, args),
  },
  {
    name: 'document_requests',
    title: 'Document requests',
    description: 'Open document requests by client with what is still outstanding and what is overdue. Read-only.',
    args: ['clientId', 'status'],
    run: (state, args = {}) => documentRequests(state, args),
  },
  {
    name: 'eval_events',
    title: 'Assistant eval log',
    description: 'What the assistant did with each message: the tool chosen, whether the model chose it, whether it was blocked, and reviewer corrections. Read-only.',
    args: ['status', 'limit'],
    run: (state, args = {}) => evalEvents(state, args),
  },
  {
    name: 'correct_eval',
    title: 'Correct an assistant decision',
    description: 'Record a reviewer correction against an eval event: the tool that should have run, or a note; used to improve routing.',
    args: ['id', 'correctTool', 'note', 'wasRight'],
    run: (state, args = {}) => correctEval(state, args),
  },
  {
    name: 'search_firm_notes',
    title: 'Search firm notes',
    description: 'Search questions to the CA, reminders, document requests, supplier reminders, document names and reviewer corrections for a phrase. Read-only.',
    args: ['query'],
    run: (state, args = {}) => searchFirmNotes(state, args),
  },
  {
    name: 'ask_knowledge',
    title: 'Answer from the firm notes',
    description: "Answer a question from the firm's own notes: finds the notes that mention the question's words, then asks the model to answer from those notes only, citing them. The model never computes a figure. Read-only.",
    args: ['question'],
    run: (state, args = {}, actor) => askKnowledge(state, args, actor),
  },
  {
    name: 'ask_tax',
    title: 'Ask a tax question',
    description: "Answer an Indian GST, income tax, TDS or presumptive income question from MyCA's tax modules: finds the topics that fit, fills in the rates, limits and due dates from the dated statutory rules for the date asked about, then asks the model to answer from those topics only, citing them. A figure in the model's answer that is not in the topics is refused and the topics are shown instead. Reference only, not tax advice. Read-only.",
    args: ['question', 'asOf', 'module'],
    run: (state, args = {}, actor) => askTax(state, args, actor),
  },
  {
    name: 'tax_modules',
    title: 'Tax knowledge modules',
    description: "List MyCA's tax knowledge modules (Agent Skills format: GST returns, input tax credit, income tax for individuals, TDS on business payments, presumptive income), or show one module with every figure filled in from the dated rules for a date. Read-only.",
    args: ['module', 'asOf'],
    run: (state, args = {}) => taxModules(state, args),
  },
  {
    name: 'tax_plan',
    title: 'Plan income tax: old or new regime',
    description: 'For a resident individual or proprietor: tax for a financial year under both regimes from the dated rules, which is cheaper and by how much, the extra old-regime deductions that would break even, unused 80C and 80D limits, the 87A rebate edge, and presumptive income under 44AD or 44ADA from turnover (6% on digital receipts, 8% on the rest, or 50% for a profession) against actual profit. Amounts in rupees. Headed "for your CA to confirm". Read-only.',
    args: ['fy', 'ageBand', 'salary', 'businessIncome', 'otherIncome', 'section80C', 'health80DSelf', 'health80DParents', 'selfSenior', 'parentsSenior', 'turnover', 'digitalReceipts', 'cashReceipts', 'profession', 'actualProfit', 'asOf'],
    run: (state, args = {}) => taxPlan(state, args),
  },
  {
    name: 'review_income_tax',
    title: 'Review a prepared income tax return',
    description: "Check the figures of an income tax return someone prepared (regime, income, deductions, and the standard deduction, total income, rebate, tax and TDS the return shows) against MyCA's own computation from the dated rules, and list errors, risks and money left on the table with the rule behind each: deductions not allowed or over the limit, a missed 87A rebate or marginal relief, the other regime being cheaper, TDS in the books or Form 26AS not claimed, profit below the presumptive rate, and turnover that does not match the year's GST sales in the books. Amounts in rupees. Read-only.",
    args: ['fy', 'regime', 'ageBand', 'salary', 'businessIncome', 'otherIncome', 'section80C', 'health80DSelf', 'health80DParents', 'selfSenior', 'parentsSenior', 'presumptive', 'turnover', 'digitalReceipts', 'cashReceipts', 'profession', 'nonGstReceipts', 'claimedStandardDeduction', 'claimedDeductions', 'claimedTotalIncome', 'claimedRebate', 'claimedTaxPayable', 'claimedTds', 'asOf'],
    run: (state, args = {}) => reviewIncomeTaxReturn(state, args),
  },
  {
    name: 'supplier_reminder_draft',
    title: 'Draft a reminder to a supplier',
    description: 'Draft a message to one supplier about their bills that are missing or wrong in GSTR-2B for a month, using only their own bill numbers, dates and amounts. Read-only; sends nothing.',
    args: ['supplier', 'period'],
    run: (state, args = {}) => draftSupplierReminder(state, args),
  },
  {
    name: 'collection_drafts',
    title: 'Who to chase for payment',
    description: 'Overdue customers with a paying score from their last twelve months (usually on time, sometimes late, late more often than not), one consolidated reminder draft per customer in a matching tone with the bank details from the invoice design, and the customers left out because they paid something in the last fourteen days. Read-only; sends nothing.',
    args: ['customer'],
    run: (state, args = {}) => collectionDrafts(state, args),
  },
  {
    name: 'record_collection_reminder',
    title: 'Send a payment reminder to a customer',
    description: 'Record that the owner is sending a payment reminder to one customer from their own phone, with the message as sent, and set a reminder to check for the payment in seven days. MyCA does not send it.',
    args: ['customer', 'message', 'channel'],
    run: (state, args = {}) => recordCollectionReminder(state, args),
  },
  {
    name: 'push_tally',
    title: 'Send the month to Tally',
    description: 'Send the month\'s ledger masters and vouchers to Tally running on this machine (its HTTP server, port 9000 by default) in one import; the same file export_tally produces. Refused a second time for the same month unless asked again, because Tally would duplicate the vouchers.',
    args: ['period', 'url', 'again'],
    run: (state, args = {}) => pushTally(state, args, resolveToolActor(args)),
  },
  {
    name: 'dsc_certificates',
    title: 'Signing certificates on this machine',
    description: 'The digital signature certificates with a private key in the Windows certificate store, which is where a DSC USB token appears once its driver is installed. Read-only; Windows desktop only.',
    args: [],
    run: () => listDscCertificates(),
  },
  {
    name: 'dsc_sign',
    title: 'Sign with the DSC',
    description: 'Sign an uploaded document (or text) with a certificate on this machine, producing a detached PKCS#7 signature stored beside the books. Runs through the action gate: live calls on and a CA approval; the token prompts for its PIN on screen. MyCA files nothing with the signature.',
    args: ['documentSha256', 'text', 'thumbprint', 'purpose', 'caApprovalId'],
    run: async (state, args = {}) => {
      const out = await signWithDsc(state, args, resolveToolActor(args));
      return out.ok ? ok(out) : fail(out.error, out);
    },
  },
  {
    name: 'suggest_expense_head',
    title: 'Suggest an expense head',
    description: 'Ask the model which of the twenty expense heads fits a wording nothing in the books has seen before. Read-only; the owner still confirms the expense. Off until a model key is set.',
    args: ['description', 'payee'],
    run: (state, args = {}) => suggestExpenseHead(args),
  },
  {
    name: 'attach_document',
    title: 'Attach a document to an entry',
    description: 'Keep an uploaded document (a receipt photo, a bill) with an expense, bill or invoice already in the books, instead of posting it again. The reader suggests the match when the amount is within fifty paise and the date within three days.',
    args: ['documentSha256', 'id'],
    run: (state, args = {}) => attachDocument(state, args),
  },
  {
    name: 'save_report',
    title: 'Save a report',
    description: 'Save a report by name: a metric (sales, purchases, expenses, owed, owing), grouped by customer, supplier, head, month or not at all, for this month, last month, this quarter, this year, last year or a given month, optionally compared with the period before. Run it any time by name.',
    args: ['name', 'metric', 'groupBy', 'period', 'compare'],
    run: (state, args = {}) => saveReport(state, args),
  },
  {
    name: 'run_report',
    title: 'Run a saved report',
    description: 'Run a saved report by name on the books as they are now. Read-only.',
    args: ['name'],
    run: (state, args = {}) => runReport(state, args),
  },
  {
    name: 'list_reports',
    title: 'Saved reports',
    description: 'The reports saved on these books. Read-only.',
    args: [],
    run: (state) => listReports(state),
  },
  {
    name: 'delete_report',
    title: 'Delete a saved report',
    description: 'Remove a saved report definition; the books are untouched.',
    args: ['name'],
    run: (state, args = {}) => deleteReport(state, args),
  },
  {
    name: 'set_supplier_bank',
    title: 'Where a supplier is paid',
    description: 'Record a supplier\'s bank account and IFSC, or UPI id, for the payout file. A change is shown old against new and should be confirmed on the phone number already on file, never from the bill itself. Owner only.',
    args: ['partyName', 'partyGstin', 'account', 'ifsc', 'upi', 'holder'],
    run: (state, args = {}) => setSupplierBank(state, args),
  },
  {
    name: 'supplier_payout_file',
    title: 'Supplier payout file',
    description: 'A bulk NEFT file (beneficiary, account, IFSC, UPI, amount, narration) for the bills the payment run proposes, one row per supplier, with the suppliers that have no bank details on record named. MyCA moves no money. Owner only. Read-only.',
    args: ['billIds', 'windowDays'],
    run: (state, args = {}) => supplierPayoutFile(state, args),
  },
  {
    name: 'advance_tax',
    title: 'Advance tax to set aside',
    description: 'For an individual or proprietor: profit for the financial year to date scaled to twelve months (both figures shown), tax under the chosen regime from the dated rules, less TDS credit from Form 26AS or marketplace settlements, split into the instalments due 15 June, 15 September, 15 December and 15 March (or the whole by 15 March when presumptive), with what is met, missed or next. Headed "for your CA to confirm" with its assumptions. Read-only.',
    args: ['regime', 'presumptive', 'otherIncome', 'asOf'],
    run: (state, args = {}) => advanceTax(state, args),
  },
  {
    name: 'record_advance_tax',
    title: 'Record an advance tax payment',
    description: 'Record an advance tax instalment paid from the bank (or cash) with its challan number; posts bank to the advance tax asset so the next instalment is computed net of it.',
    args: ['amount', 'date', 'challan', 'mode'],
    run: (state, args = {}) => recordAdvanceTaxPayment(state, args),
  },
  {
    name: 'restock_plan',
    title: 'What to reorder',
    description: 'Per SKU from the stock moves: on hand and on order, units sold a day over 7 and 28 days net of returns and excluding days out of stock, days of cover, a status (too late, order now, order soon, fine, overstock, slow mover, not enough history) against the supplier lead time, and a quantity sized for sixty days plus the lead time rounded to the pack and at least the MOQ. Read-only.',
    args: ['asOf'],
    run: (state, args = {}) => restockPlan(state, args),
  },
  {
    name: 'set_sku_supply',
    title: 'Supplier and lead time for a SKU',
    description: 'Record which supplier a SKU comes from, the lead time in days, the pack size and the minimum order, so the restock plan can size and time orders.',
    args: ['sku', 'supplier', 'leadDays', 'pack', 'moq'],
    run: (state, args = {}) => setSkuSupply(state, args),
  },
  {
    name: 'record_purchase_order',
    title: 'Record a purchase order',
    description: 'Record a purchase order to a supplier (SKU, quantity, rate, expected date). It counts as on order in the restock plan; nothing posts to the ledger until the bill comes.',
    args: ['supplier', 'lines', 'date', 'expectedOn'],
    run: (state, args = {}) => recordPurchaseOrder(state, args),
  },
  {
    name: 'month_close',
    title: 'Close the month',
    description: 'Nine checks for a finished month: entries posted, possible duplicates (same party, amount within a rupee, within five days), bills and expenses above a threshold with no document, marketplace settlements matched, GSTR-2B loaded, payroll approved and paid, a bank balance given in the month, nothing high or critical open, month-on-month moves above a tenth; plus a short narrative from the figures and a draft hash for the sign-off. Read-only.',
    args: ['period', 'receiptThreshold'],
    run: (state, args = {}) => monthCloseOf(state, args),
  },
  {
    name: 'month_close_approve',
    title: 'Sign off the month',
    description: 'Approve the month close bound to its draft hash; open items need a note and are kept with the close; the books lock through the last day of the month.',
    args: ['period', 'draftHash', 'note'],
    run: (state, args = {}) => approveMonthClose(state, args),
  },
  {
    name: 'weekly_brief',
    title: 'Weekly brief',
    description: 'The week in one message: cash with its change on last week and the runway in months, sales this week and this month with deltas, what customers owe in 0-30, 31-60 and over-60-day buckets with the worst late payers, what is owed to suppliers and any MSME bill past its date, what is due this week, open exceptions, and the one thing to do. Read-only.',
    args: ['asOf'],
    run: (state, args = {}) => weeklyBrief(state, args),
  },
  {
    name: 'payment_run',
    title: 'Who to pay',
    description: 'Unpaid supplier bills ranked on the Indian clocks: at or past the MSMED pay-by date first, then bills within 180 days of their date (after which the input credit is reversed under Rule 37), then bills due within the window on agreed terms; bills older than 45 days with no terms are listed to consider; bills with an open exception are held back. Shows the bank and cash balance, the balance after paying and whether payroll and GST still clear. Read-only.',
    args: ['windowDays', 'asOf'],
    run: (state, args = {}) => paymentRun(state, args),
  },
  {
    name: 'record_payment_run',
    title: 'Pay the proposed bills',
    description: 'Record the payments in a payment run from the bank (or cash) in one go, each bill in full. With no billIds, the proposed set is paid. Previewed with the total and the balance after.',
    args: ['billIds', 'date', 'mode'],
    run: (state, args = {}) => recordPaymentRun(state, args),
  },
  {
    name: 'record_supplier_reminder',
    title: 'Send a reminder to a supplier',
    description: 'Record that the owner is sending a GSTR-2B reminder to a supplier from their own phone, with the message as sent. MyCA does not send it; the app hands it to the share sheet after this is confirmed.',
    args: ['supplier', 'period', 'message', 'channel'],
    run: (state, args = {}) => recordSupplierReminder(state, args),
  },
  {
    name: 'list_filings',
    title: 'Filed returns',
    description: 'Returns recorded as filed, newest first, with their ARN and date. Read-only.',
    run: (state) => listFilings(state),
  },
  {
    name: 'record_filing',
    title: 'Record a filed return',
    description: 'Record that a return was filed outside MyCA (on the portal or by the CA), with its acknowledgement (ARN) and date. The return must be one MyCA lists for this business. Files nothing.',
    args: ['returnType', 'period', 'arn', 'filedOn', 'filedBy'],
    run: (state, args = {}) => recordFiling(state, args, filingRows(state, args.filedOn)),
  },
  {
    name: 'exceptions',
    title: 'Exception queue',
    description: 'Everything that needs a person: what it is, why, what it is worth, and whether it is still open. Refreshes from the engines on every run.',
    args: ['scope', 'status', 'severity', 'source', 'asOfDate'],
    run: (state, args = {}) => {
      const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(args.asOfDate || '')) ? args.asOfDate : localToday();
      const run = deadlineRun(state, { asOfDate });
      const byClient = new Map();
      for (const row of run.deadlines || []) {
        if (!byClient.has(row.clientId)) byClient.set(row.clientId, []);
        byClient.get(row.clientId).push(row);
      }
      const filter = { status: args.status || 'open', severity: args.severity, source: args.source };
      const root = state.__root || state;
      if (args.scope === 'firm') {
        const books = [['SELF', root], ...(root.clients || []).map((c) => [c.clientId, getBook(root, c.clientId)])].filter(([, book]) => book);
        const rows = [];
        for (const [clientId, book] of books) {
          refreshExceptions(book, { deadlines: byClient.get(clientId) || [] }, { asOfDate, clientId });
          rows.push(...listExceptions(book, filter));
        }
        return ok({ asOfDate, scope: 'firm', summary: summarise(rows), exceptions: rows });
      }
      const clientId = String(state.activeClientId || 'SELF');
      const reconcile = state.files.gstr2b
        ? reconcileFor(state, asOfDate)
        : null;
      const refreshed = refreshExceptions(state, { deadlines: byClient.get(clientId) || [], reconcile }, { asOfDate, clientId });
      const rows = listExceptions(state, filter);
      return ok({ asOfDate, scope: 'client', clientId, refreshed, reconciled: Boolean(reconcile), summary: summarise(rows), exceptions: rows });
    },
  },
  {
    name: 'exception_decide',
    title: 'Decide an exception',
    description: 'Assign, resolve, waive or reopen one exception. Resolving or waiving needs a reason, and every decision is audited.',
    args: ['id', 'decision', 'note', 'owner'],
    run: (state, args = {}) => {
      const root = state.__root || state;
      const out = decideException(root, state, { ...args, clientId: String(state.activeClientId || 'SELF'), actorId: args.actorId || 'ca' });
      return out.ok ? ok(out) : fail(out.error);
    },
  },
  {
    name: 'audit_books',
    title: 'Defensible audit',
    description: 'Full-population ledger scrutiny, SA 230 working papers, Schedule III / CARO / 3CD, engagement risk.',
    run: (state, args = {}) => {
      let text = args.ledgerText || state.files.auditLedger;
      let source = 'ledger file';
      if (!text) {
        const built = booksAuditLedger(state);
        if (!built.ok) return fail(built.error, { hint: built.hint });
        text = built.text;
        source = `the books (${built.rows} entries)`;
      }
      return ok({ ...auditRun({ ledgerText: text, asOfDate: args.asOfDate || localToday() }), source });
    },
  },
  {
    name: 'post_expense',
    title: 'Post expense',
    description: 'Record an expense paid from bank or cash under the right head. The head is chosen from what you tagged before, then from the words, else Other expenses. Input credit only with the supplier GSTIN.',
    args: ['narration', 'amount', 'gstRate', 'date', 'mode', 'payee', 'supplierGstin', 'head', 'documentSha256'],
    run: (state, args) => postExpense(state, args),
  },
  {
    name: 'set_expense_head',
    title: 'Change expense head',
    description: 'Move a posted expense to another head with a new entry, and remember the choice for that payee and description.',
    args: ['id', 'head'],
    run: (state, args) => retagExpense(state, args),
  },
  {
    name: 'list_expenses',
    title: 'Expenses',
    description: 'Posted expenses with their heads, optionally for one month (YYYY-MM). Read-only.',
    args: ['period'],
    run: (state, args = {}) => ok(listExpenses(state, args)),
  },
  {
    name: 'expense_heads',
    title: 'Expense heads',
    description: 'The heads an expense can be tagged under. Read-only.',
    run: () => ok(expenseHeads()),
  },
  {
    name: 'seed_demo',
    title: 'Load demo books',
    description: 'Post two sample invoices for Nalanda Textiles so the five CA reviewers can click through a live set of books.',
    run: (state) => ok({ invoices: seedDemo(state).invoices.length }),
  },
  ...ENGINE_TOOL_DEFS.map((tool) => ({ name: tool.name, title: tool.title, description: tool.description, args: [...tool.args], run: (state, args = {}) => runEngineTool(tool.name, state, args) })),
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const ACTOR_ID_ARGS = ['actorId', 'requestedBy', 'decidedBy'];

// When the caller is signed in, who they are comes from the session, never from the
// arguments they sent. 'assistant' is left alone: it only ever lowers what is allowed.
function withTrustedActor(state, tool, args) {
  const actor = state && state.__actor;
  if (!actor || !actor.userId || args.actorId === 'assistant') return args;
  const trusted = { ...args, actorId: actor.userId, role: actor.role || '' };
  for (const key of ACTOR_ID_ARGS) {
    if (key !== 'actorId' && (tool.args || []).includes(key)) trusted[key] = actor.userId;
  }
  return trusted;
}

export async function runTool(state, name, args = {}) {
  const tool = TOOL_MAP[name];
  if (!tool) return fail(`Unknown tool ${name}`);
  const country = countryOf(state);
  if (!toolServesCountry(name, country)) return fail('NOT_FOR_COUNTRY', { tool: name, country });
  try {
    return await tool.run(state, withTrustedActor(state, tool, args || {}));
  } catch (err) {
    return fail(String(err.message || err));
  }
}
