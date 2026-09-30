import { tally, bank, gst, gstin, deadlines, filing, audit } from './sprint-load.mjs';
const ingestTally = tally.ingest;
const ingestBank = bank.ingest;
const { reconcile } = gst;
const { validateGstin } = gstin;
const { complianceRun } = deadlines;
const { filingPrep } = filing;
const { auditRun } = audit;
import { listAccounts, journal, trialBalance, verifyChain, createTransfers, paise } from './ledger.mjs';
import { createInvoice, recordReceipt, invoicesToSalesCsv, createPurchase, purchasesToInwardCsv, printInvoice } from './invoice.mjs';
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
import { csvRows } from './text-safe.mjs';
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

const DEADLINE_COLUMNS = ['clientId', 'name', 'entity', 'turnover', 'gst', 'qrmp', 'tdsDeductor', 'pf', 'advanceTax', 'tp', 'state', 'profession', 'gstTds', 'presumptive'];


function yes(value) {
  return value === true || /^(y|yes|true|1)$/i.test(String(value ?? '').trim());
}

function deadlineProfile(clientId, company, extra, salesInvoices) {
  const gstin = String(company.gstin || '');
  const turnover = Number.isFinite(Number(extra.turnover)) && Number(extra.turnover) > 0
    ? Number(extra.turnover)
    : salesInvoices.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  return {
    clientId,
    name: company.name || clientId,
    entity: String(extra.entityType || company.entityType || 'proprietor').toLowerCase(),
    turnover: Math.round(turnover),
    gst: gstin ? 'TRUE' : 'FALSE',
    qrmp: String(extra.gstFrequency || company.gstFrequency || 'monthly').toLowerCase() === 'quarterly' ? 'TRUE' : 'FALSE',
    tdsDeductor: yes(extra.tdsDeductor ?? company.tdsDeductor) ? 'TRUE' : 'FALSE',
    pf: yes(extra.pf ?? company.pf) ? 'TRUE' : 'FALSE',
    advanceTax: yes(extra.advanceTax ?? company.advanceTax) ? 'TRUE' : 'FALSE',
    tp: yes(extra.transferPricing ?? company.transferPricing) ? 'TRUE' : 'FALSE',
    state: String(extra.state || company.state || gstin.slice(0, 2) || ''),
    profession: yes(extra.profession ?? company.profession) ? 'TRUE' : 'FALSE',
    gstTds: yes(extra.gstTds ?? company.gstTds) ? 'TRUE' : 'FALSE',
    presumptive: yes(extra.presumptive ?? company.presumptive) ? 'TRUE' : 'FALSE',
  };
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

function deadlineProfiles(state) {
  const root = state.__root || state;
  const profiles = [deadlineProfile('SELF', root.company || {}, {}, root.invoices || [])];
  for (const client of root.clients || []) {
    const book = root.extraBooks?.[client.clientId];
    profiles.push(deadlineProfile(client.clientId, { ...client, ...(book?.company || {}) }, client, book?.invoices || []));
  }
  return profiles;
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
    args: ['partyName', 'partyGstin', 'lines', 'date'],
    run: (state, args) => createInvoice(state, args),
  },
  {
    name: 'create_purchase',
    title: 'Record purchase bill',
    description: 'Book a supplier invoice: purchases + GST input + AP. Feeds GSTR-3B ITC.',
    args: ['partyName', 'partyGstin', 'lines', 'date'],
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
    name: 'record_receipt',
    title: 'Record receipt',
    description: 'Receive payment against an invoice (bank or cash) and post the AR settlement.',
    args: ['invoiceId', 'amount', 'mode', 'date'],
    run: (state, args) => recordReceipt(state, args),
  },
  {
    name: 'gst_payable',
    title: 'GST payable',
    description: 'Net GST liability from the books (output − input).',
    run: (state) => {
      const acc = Object.fromEntries(listAccounts(state.ledger).map((a) => [a.code, a]));
      const output = (acc['2100']?.creditsPosted || 0) + (acc['2101']?.creditsPosted || 0) + (acc['2102']?.creditsPosted || 0);
      const input = (acc['1200']?.debitsPosted || 0) + (acc['1201']?.debitsPosted || 0) + (acc['1202']?.debitsPosted || 0);
      return ok({ output, input, payable: Math.round((output - input) * 100) / 100 });
    },
  },
  {
    name: 'prepare_gstr1',
    title: 'Prepare GSTR-1',
    description: 'Build GSTR-1 tables and e-invoice checks from invoices already in the books.',
    run: (state) => {
      const salesText = invoicesToSalesCsv(state.invoices || []);
      const result = filingPrep({ salesText, supplierState: state.company.state, fy: state.company.fy });
      return ok({ salesText, gstr1: result.gstr1, eInvoice: result.summary });
    },
  },
  {
    name: 'export_gstr1_json',
    title: 'Export GSTR-1 JSON',
    description: 'GSTN offline-utility JSON from posted invoices (does not upload).',
    run: (state, args = {}) => {
      const json = invoicesToGstr1Json(state.company, state.invoices || [], args.fp, {
        grossTurnover: args.grossTurnover,
        currentGrossTurnover: args.currentGrossTurnover,
      });
      return json.error ? fail(json.error, { hint: json.hint }) : ok(json);
    },
  },
  {
    name: 'prepare_gstr3b',
    title: 'Prepare GSTR-3B',
    description: 'Draft GSTR-3B outward and ITC from invoices plus optional inward CSV.',
    run: (state, args = {}) => {
      const salesText = invoicesToSalesCsv(state.invoices || []);
      const inwardText = args.inwardText || state.files.inward || purchasesToInwardCsv(state.purchases || []);
      const result = filingPrep({ salesText, inwardText, supplierState: state.company.state, fy: state.company.fy });
      return ok(result.gstr3b);
    },
  },
  {
    name: 'filing_pack',
    title: 'GSTN filing pack',
    description: 'Assemble GSTR-1 + 3B + payable + TB for a CA to file. Does not upload to GSTN.',
    run: (state) => {
      const salesText = invoicesToSalesCsv(state.invoices || []);
      const inwardText = purchasesToInwardCsv(state.purchases || []);
      const filed = filingPrep({ salesText, inwardText, supplierState: state.company.state, fy: state.company.fy });
      const acc = Object.fromEntries(listAccounts(state.ledger).map((a) => [a.code, a]));
      const output = (acc['2100']?.creditsPosted || 0) + (acc['2101']?.creditsPosted || 0) + (acc['2102']?.creditsPosted || 0);
      const input = (acc['1200']?.debitsPosted || 0) + (acc['1201']?.debitsPosted || 0) + (acc['1202']?.debitsPosted || 0);
      return ok({
        gstin: state.company.gstin,
        period: filed.gstr1.period,
        gstr1: filed.gstr1,
        gstr3b: filed.gstr3b,
        payable: Math.round((output - input) * 100) / 100,
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
    args: ['invoiceId'],
    run: async (state, args = {}) => {
      if (!args.invoiceId) return fail('invoiceId required, e.g. INV-0001');
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
      const result = filingPrep({
        aisText: args.aisText || state.files.ais || '',
        tds26Text: args.tds26Text || state.files.form26as || '',
        incomeText: args.incomeText || state.files.income || '',
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
      const result = filingPrep({ paymentsText: args.paymentsText || state.files.payments || '', fy: state.company.fy });
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
    name: 'deadlines',
    title: 'Compliance deadlines',
    description: 'Statutory due dates for the firm and every registered client (GSTR-1/3B, PMT-06, TDS, PF, advance tax, ITR, GSTR-9) from the dated rules, as of today. Due dates never roll over weekends or holidays.',
    run: (state, args = {}) => {
      const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(args.asOfDate || '')) ? args.asOfDate : localToday();
      const clientsText = csvRows([DEADLINE_COLUMNS, ...deadlineProfiles(state).map((p) => DEADLINE_COLUMNS.map((key) => p[key]))]);
      const docsText = 'clientId,period,returnType,docType,status,receivedDate,source\n';
      const run = complianceRun({ clientsText, docsText, holidaysText: args.holidaysText || '' }, { months: args.months, asOfDate });
      return ok({ asOfDate, ...run });
    },
  },
  {
    name: 'exceptions',
    title: 'Exception queue',
    description: 'Everything that needs a person: what it is, why, what it is worth, and whether it is still open. Refreshes from the engines on every run.',
    args: ['scope', 'status', 'severity', 'source', 'asOfDate'],
    run: (state, args = {}) => {
      const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(String(args.asOfDate || '')) ? args.asOfDate : localToday();
      const clientsText = csvRows([DEADLINE_COLUMNS, ...deadlineProfiles(state).map((p) => DEADLINE_COLUMNS.map((key) => p[key]))]);
      const run = complianceRun({ clientsText, docsText: 'clientId,period,returnType,docType,status,receivedDate,source\n', holidaysText: '' }, { asOfDate });
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
    description: 'Pay a vendor from bank and book expense (optional GST input).',
    args: ['narration', 'amount', 'gstRate'],
    run: (state, args) => {
      const date = postingDate(args.date);
      if (!date) return fail('INVALID_DATE', { date: args.date });
      if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
      const amountPaise = Math.round(Number(args.amount) * 100);
      const gstRate = Number(args.gstRate || 0);
      if (!Number.isFinite(amountPaise) || amountPaise <= 0) return fail('BAD_AMOUNT');
      if (!Number.isFinite(gstRate) || gstRate < 0) return fail('BAD_RATE');
      // The amount includes GST. CGST and SGST are equal halves, each in paise,
      // and the expense takes the remainder so the three add back to the amount.
      const halfPaise = gstRate ? Math.round((amountPaise * gstRate) / (100 + gstRate) / 2) : 0;
      const taxablePaise = amountPaise - 2 * halfPaise;
      const transfers = [
        { id: ++state.transferSeq, debitAccountId: 5100, creditAccountId: 1002, amount: BigInt(taxablePaise), code: 'EXPENSE', userData: date },
      ];
      if (halfPaise > 0) {
        transfers.push({ id: ++state.transferSeq, debitAccountId: 1200, creditAccountId: 1002, amount: BigInt(halfPaise), code: 'ITC-CGST', userData: date });
        transfers.push({ id: ++state.transferSeq, debitAccountId: 1201, creditAccountId: 1002, amount: BigInt(halfPaise), code: 'ITC-SGST', userData: date });
      }
      return ok(createTransfers(state.ledger, transfers));
    },
  },
  {
    name: 'seed_demo',
    title: 'Load demo books',
    description: 'Post two sample invoices for Nalanda Textiles so the five CA reviewers can click through a live set of books.',
    run: (state) => ok({ invoices: seedDemo(state).invoices.length }),
  },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

export async function runTool(state, name, args = {}) {
  const tool = TOOL_MAP[name];
  if (!tool) return fail(`Unknown tool ${name}`);
  try {
    return await tool.run(state, args);
  } catch (err) {
    return fail(String(err.message || err));
  }
}
