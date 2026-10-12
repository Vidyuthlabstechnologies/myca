import { tally, bank, gst, gstin, filing, audit } from './sprint-load.mjs';
const ingestTally = tally.ingest;
const ingestBank = bank.ingest;
const { reconcile } = gst;
const { validateGstin } = gstin;
const { filingPrep } = filing;
const { auditRun } = audit;
import { listAccounts, journal, trialBalance, verifyChain, createTransfers, paise } from './ledger.mjs';
import { createInvoice, recordReceipt, recordPayment, invoicesToSalesCsv, createPurchase, purchasesToInwardCsv, printInvoice } from './invoice.mjs';
import { invoiceDocument, quoteDocument } from './invoice-document.mjs';
import { createQuote, markQuote, convertQuote, listQuotes } from './quotes.mjs';
import { postExpense, retagExpense, listExpenses, expenseHeads } from './expenses.mjs';
import { businessSummary } from './business-summary.mjs';
import { gstr3bFor, periodSummary } from './period-summary.mjs';
import { createCreditNote, cancelInvoice, creditNotesForPeriod } from './credit-notes.mjs';
import { createDebitNote, createPurchaseNote, debitNotesForPeriod, purchaseNotesForPeriod } from './debit-notes.mjs';
import { reviewOf, answerReview } from './gst-review.mjs';
import { exportEntries } from './entries-export.mjs';
import { exportTallyXml } from './tally-export.mjs';
import { import2b, creditAtRisk } from './gstr2b-check.mjs';
import { booksCheck } from './books-check.mjs';
import { deadlineRun, filingRows } from './deadline-run.mjs';
import { listFilings, recordFiling } from './filings.mjs';
import { draftSupplierReminder, recordSupplierReminder } from './supplier-reminders.mjs';
import { addEmployee, changeSalary, endEmployment, listEmployees } from './employees.mjs';
import { payrollFor, approvePayroll, recordSalaryPayment, listPayroll, payslip } from './payroll.mjs';
import { recordTdsDeposit, setDeductor, tdsSummary } from './tds-deduction.mjs';
import { paymentFor, setCreditOpening } from './gst-payment.mjs';
import { tdsReturnDraft } from './tds-return.mjs';
import { setTransport, recordShare, ewayBillStatus, transportPayload } from './eway-bill.mjs';
import { ensureParty } from './invoice.mjs';
import { tdsReviewOf, answerTdsReview } from './tds-review.mjs';
import { addReminder, completeReminder, listReminders } from './reminders.mjs';
import { cashForecast, canAfford, setCashBalance } from './cash-forecast.mjs';
import { setPaymentTerms } from './payment-terms.mjs';
import { askCa, replyCa, closeCa, listCaRequests } from './ca-requests.mjs';
import { postTallyRows, postBankRows, purchaseRegisterCsv } from './post-import.mjs';
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
import { getSandboxClient } from './sandbox-client.mjs';
import { getNimClient } from './nim-client.mjs';
import { runSandboxOperation } from './sandbox-adapter.mjs';
import { requestApproval, decideApproval, approvalStatus, normalizeActor } from './approvals.mjs';
import { normalizeClientId, getBook } from './books.mjs';
import { refreshExceptions, listExceptions, summarise, decideException } from './exceptions.mjs';
import { appendAuditEvent } from './ca-api.mjs';
import { liveCallsEnabled, mockModeEnabled } from './runtime-config.mjs';
import { seedDemo } from './store.mjs';

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
  return reconcile(
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
    description: 'Set this book\'s own business identity (name, GSTIN, PAN, state, FY, address). Affects future postings only; history is untouched.',
    args: ['name', 'gstin', 'pan', 'state', 'fy', 'address', 'city', 'pin', 'entityType'],
    run: (state, args = {}) => {
      const company = state.company;
      const patch = {};
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
      return ok({ count: rows.length, rows: rows.slice(-limit) });
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
    description: 'Create a GST invoice and post double-entry transfers (AR, sales, GST output). Data entry starts here.',
    args: ['partyName', 'partyGstin', 'lines', 'date', 'paymentTermsDays'],
    run: (state, args) => createInvoice(state, args),
  },
  {
    name: 'create_purchase',
    title: 'Record purchase bill',
    description: 'Book a supplier invoice: purchases + GST input + AP. Feeds GSTR-3B ITC.',
    args: ['partyName', 'partyGstin', 'lines', 'date', 'supplierInvoiceNo'],
    run: (state, args) => createPurchase(state, args),
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
    name: 'gst_payable',
    title: 'GST to pay',
    description: 'For one tax period: input credit (and any credit brought forward) set off against tax on sales head by head in the order the law sets, the cash to pay by head, the credit carried forward, and the interest and late fee if paid after the due date. Read-only.',
    args: ['period', 'payOn'],
    run: (state, args = {}) => paymentFor(state, args.period, { payOn: args.payOn }),
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
      const docs = documentsForPeriod(state, args.period);
      if (!docs.ok) return fail(docs.error, { hint: docs.hint, periods: docs.periods });
      const salesText = invoicesToSalesCsv(docs.invoices);
      const result = filingPrep({ salesText, supplierState: state.company.state, fy: state.company.fy });
      return ok({ period: docs.period, periods: docs.periods, salesText, gstr1: result.gstr1, eInvoice: result.summary });
    },
  },
  {
    name: 'export_gstr1_json',
    title: 'Export GSTR-1 JSON',
    description: 'GSTN offline-utility JSON from posted invoices (does not upload).',
    run: (state, args = {}) => {
      const json = invoicesToGstr1Json(state.company, state.invoices || [], args.fp, {
        creditNotes: state.creditNotes || [],
        debitNotes: state.debitNotes || [],
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
      const docs = documentsForPeriod(state, args.period);
      if (!docs.ok) return fail(docs.error, { hint: docs.hint, periods: docs.periods });
      return ok({ ...gstr3bFor(state, docs, args.inwardText || state.files.inward), periods: docs.periods });
    },
  },
  {
    name: 'gst_period_summary',
    title: 'GST for one period',
    description: 'For one tax period: tax on sales and input credit by head from the GSTR-3B draft, and what the GSTR-1 file for that period holds. Lists the periods that have documents.',
    args: ['period'],
    run: (state, args = {}) => {
      const summary = periodSummary(state, args.period);
      if (!summary.ok) return summary;
      const payment = paymentFor(state, summary.data.period);
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
    title: 'Quote',
    description: 'Make a quotation for a customer with GST worked out as on an invoice, valid for a number of days (30 unless given). It posts nothing to the books and is not in any return.',
    args: ['partyName', 'partyGstin', 'lines', 'date', 'validDays'],
    run: (state, args = {}) => createQuote(state, args),
  },
  {
    name: 'mark_quote',
    title: 'Quote accepted or declined',
    description: 'Record that the customer accepted or declined a quote.',
    args: ['id', 'outcome'],
    run: (state, args = {}) => markQuote(state, args),
  },
  {
    name: 'convert_quote',
    title: 'Invoice from quote',
    description: 'Raise the tax invoice for a quote with the same lines, linked both ways. A declined or already-invoiced quote is refused.',
    args: ['id', 'date'],
    run: (state, args = {}) => convertQuote(state, args),
  },
  {
    name: 'list_quotes',
    title: 'Quotes',
    description: 'Quotes with their state (open, accepted, declined, expired, invoiced). Read-only.',
    args: ['status'],
    run: (state, args = {}) => listQuotes(state, args),
  },
  {
    name: 'quote_document',
    title: 'Quote to show or send',
    description: 'One quote laid out like an invoice, for display or a PDF. Read-only.',
    args: ['id'],
    run: (state, args = {}) => quoteDocument(state, args.id),
  },
  {
    name: 'ask_ca',
    title: 'Ask my CA',
    description: 'Send a question to the business\'s CA inside MyCA about an invoice, bill, expense, flagged item or a month\'s GST, with the facts attached by the engine. Nothing leaves MyCA.',
    args: ['subject', 'title', 'note'],
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
    args: ['text', 'due', 'invoiceId', 'billId', 'party'],
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
    args: ['status'],
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
    name: 'gst_review',
    title: 'Review the GST return',
    description: 'The steps of the review for one tax period (the latest with documents unless given): held invoices, sales, purchases and credit, approval. Each step shows its figures and whether it is confirmed for the current draft. Read-only.',
    args: ['period'],
    run: (state, args = {}) => reviewOf(state, args.period),
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
      const docs = documentsForPeriod(state, args.period);
      if (!docs.ok) return fail(docs.error, { hint: docs.hint, periods: docs.periods });
      const salesText = invoicesToSalesCsv(docs.invoices);
      const inwardText = purchasesToInwardCsv(docs.purchases);
      const filed = filingPrep({ salesText, inwardText, supplierState: state.company.state, fy: state.company.fy });
      const payment = paymentFor(state, docs.period);
      if (!payment.ok) return fail(payment.error, payment);
      return ok({
        gstin: state.company.gstin,
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
    description: 'Build NIC Invoice JSON from a posted tax invoice and generate its IRN through the action gate (live switch and a matching CA approval).',
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
    args: ['operationId', 'requirementId', 'requestedBy', 'note', 'clientId', 'params'],
    run: (state, args = {}) => {
      const out = requestApproval(state, {
        operationId: args.operationId,
        requirementId: args.requirementId || '',
        clientId: args.clientId || activeClientId(state),
        params: args.params || {},
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
    name: 'import_bank',
    title: 'Import bank statement',
    description: 'Ingest HDFC-style CSV, fixed-width TXT, or matrix bank statement with running-balance tie-out.',
    args: ['content', 'type'],
    run: (state, args) => {
      const type = args.type || 'csv';
      const result = ingestBank({ type, content: args.content }, { asOfDate: args.asOfDate, fileLabel: args.fileName || 'bank' });
      const good = (result.rows || []).filter((r) => !r._blocking);
      const ledger = postBankRows(state, good);
      state.imports.push({ source: 'bank', at: new Date().toISOString(), ok: result.ok, rows: result.rows?.length || 0, posted: ledger.posted, heldBack: heldBackFrom(ledger.skipped) });
      return ok({ ...result, ledger });
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
      return ok(reconcile(
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
            ? 'Sandbox credentials not configured in .env'
            : 'Live provider calls are disabled (set MYCA_ENABLE_LIVE_CALLS=1 to enable).',
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
    name: 'record_tds_deposit',
    title: 'Record a TDS deposit',
    description: 'Record TDS paid to the government with its challan reference. Defaults to everything still to deposit.',
    args: ['amount', 'date', 'challan', 'mode'],
    run: (state, args = {}) => recordTdsDeposit(state, args),
  },
  {
    name: 'tds_return',
    title: 'Quarterly TDS statement',
    description: 'Draft of the quarterly TDS statement for payments other than salary: deductees by PAN and section, totals by section, the challans that cover the quarter, what is still to deposit, the due date and any recorded filing. The latest quarter with deductions unless one is given as Q2 2026-27. Read-only.',
    args: ['quarter'],
    run: (state, args = {}) => tdsReturnDraft(state, args.quarter),
  },
  {
    name: 'tds_review',
    title: 'Review the TDS statement',
    description: 'The quarterly TDS statement step by step: deductees, challans, then approval, each asking "Is this information correct?". Read-only.',
    args: ['period'],
    run: (state, args = {}) => tdsReviewOf(state, args.period),
  },
  {
    name: 'tds_review_answer',
    title: 'Answer a TDS review step',
    description: 'Confirm a step of the quarterly TDS statement, mark it wrong with a note, or approve the statement. Bound to the draft the owner saw. Files nothing.',
    args: ['period', 'step', 'answer', 'draftHash', 'note'],
    run: (state, args = {}) => answerTdsReview(state, args),
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
    run: (state, args = {}) => payrollFor(state, args.period),
  },
  {
    name: 'approve_payroll',
    title: 'Approve payroll',
    description: 'Approve a month\'s payroll: posts salaries, each deduction payable and net salary payable, and records the salary TDS. Pays nothing. Owner only.',
    args: ['period', 'draftHash'],
    run: (state, args = {}) => approvePayroll(state, args),
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
    run: (state) => listPayroll(state),
  },
  {
    name: 'payslip',
    title: 'Payslip',
    description: 'One employee\'s payslip for an approved month, laid out for display or a PDF. Owner only. Read-only.',
    args: ['period', 'employeeId'],
    run: (state, args = {}) => payslip(state, args),
  },
  {
    name: 'add_employee',
    title: 'Add an employee',
    description: 'Add an employee with a joining date and a monthly salary in parts (for example Basic, HRA). Records only; no payroll is run and no deduction is worked out. Owner only.',
    args: ['name', 'joinedOn', 'components', 'designation', 'pan', 'uan', 'pfMember', 'esiMember', 'ptState', 'taxRegime', 'sex'],
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
    name: 'end_employment',
    title: 'Employee left',
    description: 'Record the last day of an employee. Their record and salary history are kept. Owner only.',
    args: ['id', 'leftOn'],
    run: (state, args = {}) => endEmployment(state, args),
  },
  {
    name: 'supplier_reminder_draft',
    title: 'Draft a reminder to a supplier',
    description: 'Draft a message to one supplier about their bills that are missing or wrong in GSTR-2B for a month, using only their own bill numbers, dates and amounts. Read-only; sends nothing.',
    args: ['supplier', 'period'],
    run: (state, args = {}) => draftSupplierReminder(state, args),
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
      const text = args.ledgerText || state.files.auditLedger;
      if (!text) return fail('Pass ledgerText (clientId,date,narration,debit,credit,party,category,tdsSection).');
      return ok(auditRun({ ledgerText: text, asOfDate: args.asOfDate || localToday() }));
    },
  },
  {
    name: 'post_expense',
    title: 'Post expense',
    description: 'Record an expense paid from bank or cash under the right head. The head is chosen from what you tagged before, then from the words, else Other expenses. Input credit only with the supplier GSTIN.',
    args: ['narration', 'amount', 'gstRate', 'date', 'mode', 'payee', 'supplierGstin', 'head'],
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
  try {
    return await tool.run(state, withTrustedActor(state, tool, args || {}));
  } catch (err) {
    return fail(String(err.message || err));
  }
}
