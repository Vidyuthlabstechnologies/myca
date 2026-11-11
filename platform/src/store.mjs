import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, normalize, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { emptyLedger, freeze, hydrate } from './ledger.mjs';
import { DEFAULT_COMPANY, installChart } from './chart.mjs';
import { createInvoice, recordReceipt, createPurchase } from './invoice.mjs';
import { normalizeIntegrationConnections } from './integration-contract.mjs';
import { ensureCaApiState, renumberDuplicateDocuments } from './ca-api.mjs';
import { serializeBook, deserializeBook, emptyBooks, normalizeClientId, isValidClientId } from './books.mjs';

import { migrateLegacyBooks } from './govt.mjs';
import { withoutPin, pinRecords, applyPinRecords } from './identity.mjs';
import { persistablePending, restoredPending, restoredConfirmation } from './chat-confirm.mjs';
import { encryptSecret, decryptSecret } from './credential-vault.mjs';

export function defaultDataPath() {
  return migrateLegacyBooks();
}

export function createState() {
  const ledger = emptyLedger();
  installChart(ledger);
  const state = {
    company: { ...DEFAULT_COMPANY },
    ledger,
    parties: [],
    vendors: [],
    invoices: [],
    purchases: [],
    invoiceSeq: 0,
    invoiceSeqByFy: {},
    billSeq: 0,
    transferSeq: 100000,
    imports: [],
    files: {},
    attachments: {},
    pendingChatAction: null,
    lastConfirmation: null,
    exceptions: [],
    exceptionSeq: 0,
    expenses: [],
    expenseSeq: 0,
    expenseTags: {},
    creditNotes: [],
    creditNoteSeq: 0,
    debitNotes: [],
    debitNoteSeq: 0,
    purchaseNotes: [],
    purchaseNoteSeq: 0,
    gstReviews: {},
    monthCloses: {},
    purchaseOrders: [],
    purchaseOrderSeq: 0,
    advanceTaxPayments: [],
    reports: {},
    tallyPushes: {},
    dscSignatures: [],
    form1099Jobs: [],
    payrollImports: [],
    gstr2b: {},
    imsDecisions: {},
    reminders: [],
    reminderSeq: 0,
    cashReadings: [],
    customerTerms: {},
    supplierTerms: {},
    caRequests: [],
    caRequestSeq: 0,
    quotes: [],
    recurring: [],
    bankLines: [],
    bankLineSeq: 0,
    bankRules: [],
    bankRuleSeq: 0,
    bankAccounts: [],
    bankTransfers: [],
    bankTransferSeq: 0,
    quoteSeq: 0,
    filings: [],
    supplierReminders: [],
    collectionReminders: [],
    collectionReminderSeq: 0,
    settlements: [],
    settlementSeq: 0,
    channels: {},
    tcsStatements: [],
    tdsCreditStatements: [],
    skus: {},
    stockMoves: [],
    inventoryValuations: [],
    portalSaves: {},
    gstr3bPortal: {},
    tdsFvuJobs: [],
    supplierReminderSeq: 0,
    employees: [],
    employeeSeq: 0,
    tdsEntries: [],
    tdsDeposits: [],
    gstCreditOpening: null,
    tdsReviews: {},
    payrollRuns: {},
    usReturns: {},
    salesTaxRates: [],
    salesTaxNexus: [],
    salesTaxReviews: {},
    salesTaxPayments: [],
    gstPayments: {},
    sutaRates: [],
    yearClosings: {},
    automation: { lastRun: '', log: [] },
    amendmentSeq: 0,
    chatRecent: [],
    lockThrough: '',
    integrationConnections: {},
    documents: [],
    firmUsers: [],
    auditEvents: [],
    auditSeq: 0,
    documentSeq: 0,
    clients: [],
    extraBooks: emptyBooks(),
    approvals: [],
    documentRequests: [],
    documentRequestSeq: 0,
    evalEvents: [],
    evalEventSeq: 0,
    approvalSeq: 0,
    activeClientId: 'SELF',
    outbox: [],
    outboxSeq: 0,
  };
  return ensureCaApiState(state);
}

export function serialize(state) {
  return {
    company: state.company,
    ledger: freeze(state.ledger),
    parties: state.parties,
    vendors: state.vendors || [],
    invoices: state.invoices,
    purchases: state.purchases || [],
    invoiceSeq: state.invoiceSeq,
    invoiceSeqByFy: state.invoiceSeqByFy || {},
    billSeq: state.billSeq || 0,
    transferSeq: state.transferSeq,
    imports: state.imports,
    attachments: state.attachments || {},
    lockThrough: state.lockThrough || '',
    pendingChatAction: persistablePending(state.pendingChatAction),
    lastConfirmation: state.lastConfirmation || null,
    exceptions: state.exceptions || [],
    exceptionSeq: state.exceptionSeq || 0,
    expenses: state.expenses || [],
    expenseSeq: state.expenseSeq || 0,
    expenseTags: state.expenseTags || {},
    creditNotes: state.creditNotes || [],
    creditNoteSeq: state.creditNoteSeq || 0,
    debitNotes: state.debitNotes || [],
    debitNoteSeq: state.debitNoteSeq || 0,
    purchaseNotes: state.purchaseNotes || [],
    purchaseNoteSeq: state.purchaseNoteSeq || 0,
    gstReviews: state.gstReviews || {},
    monthCloses: state.monthCloses || {},
    purchaseOrders: state.purchaseOrders || [],
    advanceTaxPayments: state.advanceTaxPayments || [],
    reports: state.reports || {},
    tallyPushes: state.tallyPushes || {},
    dscSignatures: state.dscSignatures || [],
    form1099Jobs: state.form1099Jobs || [],
    payrollImports: state.payrollImports || [],
    purchaseOrderSeq: state.purchaseOrderSeq || 0,
    gstr2b: state.gstr2b || {},
    imsDecisions: state.imsDecisions || {},
    reminders: state.reminders || [],
    reminderSeq: state.reminderSeq || 0,
    cashReadings: state.cashReadings || [],
    customerTerms: state.customerTerms || {},
    supplierTerms: state.supplierTerms || {},
    caRequests: state.caRequests || [],
    caRequestSeq: state.caRequestSeq || 0,
    quotes: state.quotes || [],
    recurring: state.recurring || [],
    bankLines: state.bankLines || [],
    bankLineSeq: state.bankLineSeq || 0,
    bankRules: state.bankRules || [],
    bankRuleSeq: state.bankRuleSeq || 0,
    bankAccounts: state.bankAccounts || [],
    bankTransfers: state.bankTransfers || [],
    bankTransferSeq: state.bankTransferSeq || 0,
    filings: state.filings || [],
    supplierReminders: state.supplierReminders || [],
    collectionReminders: state.collectionReminders || [],
    collectionReminderSeq: state.collectionReminderSeq || 0,
    settlements: state.settlements || [],
    settlementSeq: state.settlementSeq || 0,
    channels: state.channels || {},
    tcsStatements: state.tcsStatements || [],
    tdsCreditStatements: state.tdsCreditStatements || [],
    skus: state.skus || {},
    stockMoves: state.stockMoves || [],
    inventoryValuations: state.inventoryValuations || [],
    portalSaves: state.portalSaves || {},
    gstr3bPortal: state.gstr3bPortal || {},
    tdsFvuJobs: state.tdsFvuJobs || [],
    supplierReminderSeq: state.supplierReminderSeq || 0,
    employees: state.employees || [],
    employeeSeq: state.employeeSeq || 0,
    tdsEntries: state.tdsEntries || [],
    tdsDeposits: state.tdsDeposits || [],
    gstCreditOpening: state.gstCreditOpening || null,
    tdsReviews: state.tdsReviews || {},
    payrollRuns: state.payrollRuns || {},
    usReturns: state.usReturns || {},
    salesTaxRates: state.salesTaxRates || [],
    salesTaxNexus: state.salesTaxNexus || [],
    salesTaxReviews: state.salesTaxReviews || {},
    salesTaxPayments: state.salesTaxPayments || [],
    gstPayments: state.gstPayments || {},
    sutaRates: state.sutaRates || [],
    yearClosings: state.yearClosings || {},
    automation: state.automation || { lastRun: '', log: [] },
    amendmentSeq: state.amendmentSeq || 0,
    chatRecent: Array.isArray(state.chatRecent) ? state.chatRecent : [],
    quoteSeq: state.quoteSeq || 0,
    integrationConnections: normalizeIntegrationConnections(state.integrationConnections),
    documents: state.documents || [],
    firmUsers: (state.firmUsers || []).map(withoutPin),
    auditEvents: state.auditEvents || [],
    auditSeq: state.auditSeq || 0,
    documentSeq: state.documentSeq || 0,
    clients: state.clients || [],
    extraBooks: Object.fromEntries(
      Object.entries(state.extraBooks || {}).map(([id, book]) => [id, serializeBook(book)]),
    ),
    approvals: state.approvals || [],
    documentRequests: state.documentRequests || [],
    documentRequestSeq: state.documentRequestSeq || 0,
    evalEvents: state.evalEvents || [],
    evalEventSeq: state.evalEventSeq || 0,
    approvalSeq: state.approvalSeq || 0,
    activeClientId: state.activeClientId || 'SELF',
    outbox: state.outbox || [],
    outboxSeq: state.outboxSeq || 0,
  };
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rawClients(raw) {
  return (Array.isArray(raw.clients) ? raw.clients : []).filter(isRecord);
}

function rawBooks(raw) {
  return isRecord(raw.extraBooks) ? raw.extraBooks : {};
}

function legacyClientId(client) {
  return String(client.clientId ?? '');
}

function freeClientId(value, taken) {
  const base = String(value ?? '').trim().toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 32)
    .replace(/[-_]+$/, '') || 'CLIENT';
  let id = base;
  for (let n = 2; !isValidClientId(id) || taken.has(id); n += 1) {
    const suffix = `-${n}`;
    id = `${base.slice(0, 32 - suffix.length).replace(/[-_]+$/, '')}${suffix}`;
  }
  return id;
}

function clientIdRemap(raw) {
  const ids = [...new Set([...rawClients(raw).map(legacyClientId), ...Object.keys(rawBooks(raw))])];
  if (ids.some((id) => normalizeClientId(id) === '__PROTO__')) throw new Error('INVALID_CLIENT_ID');
  const kept = ids.filter((id) => id === 'SELF' || isValidClientId(id));
  const remap = new Map(kept.map((id) => [id, id]));
  const taken = new Set(['SELF', ...kept]);
  for (const id of ids) {
    if (remap.has(id)) continue;
    const next = freeClientId(id, taken);
    remap.set(id, next);
    taken.add(next);
  }
  return remap;
}

function loadedActiveClientId(raw, remap, loadedClients) {
  const legacy = raw.activeClientId;
  const id = typeof legacy === 'string' && remap.has(legacy) ? remap.get(legacy) : normalizeClientId(legacy);
  return loadedClients.some((client) => client.clientId === id) ? id : 'SELF';
}

function rewritesDocuments(raw) {
  const ids = (isRecord(raw) && Array.isArray(raw.documents) ? raw.documents : []).filter(isRecord).map((doc) => doc.documentId);
  return new Set(ids).size !== ids.length;
}

function rewritesClients(raw) {
  if (!isRecord(raw)) return false;
  if (raw.clients != null && (!Array.isArray(raw.clients) || raw.clients.some((client) => !isRecord(client)))) return true;
  if (raw.extraBooks != null && !isRecord(raw.extraBooks)) return true;
  return [...clientIdRemap(raw)].some(([from, to]) => from !== to);
}

function renameClient(remap, id) {
  return typeof id === 'string' && remap.has(id) ? remap.get(id) : id;
}

function withRenamedClient(remap, row) {
  if (!isRecord(row)) return row;
  const clientId = renameClient(remap, row.clientId);
  return clientId === row.clientId ? row : { ...row, clientId };
}

function withRenamedAccess(remap, user) {
  if (!isRecord(user) || !Array.isArray(user.clientIds)) return user;
  return { ...user, clientIds: user.clientIds.map((id) => renameClient(remap, id)) };
}

export function deserialize(raw) {
  const state = createState();
  if (!raw) return state;
  state.company = raw.company || state.company;
  state.ledger = hydrate(raw.ledger);
  state.parties = raw.parties || [];
  state.vendors = raw.vendors || [];
  state.invoices = raw.invoices || [];
  state.purchases = raw.purchases || [];
  state.invoiceSeq = raw.invoiceSeq || 0;
  state.invoiceSeqByFy = raw.invoiceSeqByFy && typeof raw.invoiceSeqByFy === 'object' ? raw.invoiceSeqByFy : {};
  state.billSeq = raw.billSeq || 0;
  state.transferSeq = raw.transferSeq || 100000;
  state.imports = raw.imports || [];
  state.files = {};
  state.attachments = raw.attachments && typeof raw.attachments === 'object' ? raw.attachments : {};
  state.lockThrough = raw.lockThrough || '';
  state.pendingChatAction = restoredPending(raw.pendingChatAction);
  state.lastConfirmation = restoredConfirmation(raw.lastConfirmation);
  state.exceptions = Array.isArray(raw.exceptions) ? raw.exceptions : [];
  state.exceptionSeq = raw.exceptionSeq || 0;
  state.expenses = Array.isArray(raw.expenses) ? raw.expenses : [];
  state.expenseSeq = raw.expenseSeq || 0;
  state.expenseTags = raw.expenseTags && typeof raw.expenseTags === 'object' ? raw.expenseTags : {};
  state.creditNotes = Array.isArray(raw.creditNotes) ? raw.creditNotes : [];
  state.creditNoteSeq = raw.creditNoteSeq || 0;
  state.debitNotes = Array.isArray(raw.debitNotes) ? raw.debitNotes : [];
  state.debitNoteSeq = raw.debitNoteSeq || 0;
  state.purchaseNotes = Array.isArray(raw.purchaseNotes) ? raw.purchaseNotes : [];
  state.purchaseNoteSeq = raw.purchaseNoteSeq || 0;
  state.gstReviews = raw.gstReviews && typeof raw.gstReviews === 'object' ? raw.gstReviews : {};
  state.monthCloses = raw.monthCloses && typeof raw.monthCloses === 'object' ? raw.monthCloses : {};
  state.purchaseOrders = Array.isArray(raw.purchaseOrders) ? raw.purchaseOrders : [];
  state.advanceTaxPayments = Array.isArray(raw.advanceTaxPayments) ? raw.advanceTaxPayments : [];
  state.reports = raw.reports && typeof raw.reports === 'object' ? raw.reports : {};
  state.tallyPushes = raw.tallyPushes && typeof raw.tallyPushes === 'object' ? raw.tallyPushes : {};
  state.dscSignatures = Array.isArray(raw.dscSignatures) ? raw.dscSignatures : [];
  state.form1099Jobs = Array.isArray(raw.form1099Jobs) ? raw.form1099Jobs : [];
  state.payrollImports = Array.isArray(raw.payrollImports) ? raw.payrollImports : [];
  state.purchaseOrderSeq = Number(raw.purchaseOrderSeq || 0);
  state.gstr2b = raw.gstr2b && typeof raw.gstr2b === 'object' ? raw.gstr2b : {};
  state.imsDecisions = raw.imsDecisions && typeof raw.imsDecisions === 'object' && !Array.isArray(raw.imsDecisions) ? raw.imsDecisions : {};
  state.reminders = Array.isArray(raw.reminders) ? raw.reminders : [];
  state.reminderSeq = raw.reminderSeq || 0;
  state.cashReadings = Array.isArray(raw.cashReadings) ? raw.cashReadings : [];
  state.customerTerms = raw.customerTerms && typeof raw.customerTerms === 'object' ? raw.customerTerms : {};
  state.supplierTerms = raw.supplierTerms && typeof raw.supplierTerms === 'object' ? raw.supplierTerms : {};
  state.caRequests = Array.isArray(raw.caRequests) ? raw.caRequests : [];
  state.caRequestSeq = raw.caRequestSeq || 0;
  state.quotes = Array.isArray(raw.quotes) ? raw.quotes : [];
  state.recurring = Array.isArray(raw.recurring) ? raw.recurring : [];
  state.bankLines = Array.isArray(raw.bankLines) ? raw.bankLines : [];
  state.bankLineSeq = Number(raw.bankLineSeq || 0);
  state.bankRules = Array.isArray(raw.bankRules) ? raw.bankRules : [];
  state.bankRuleSeq = Number(raw.bankRuleSeq || 0);
  state.bankAccounts = Array.isArray(raw.bankAccounts) ? raw.bankAccounts : [];
  state.bankTransfers = Array.isArray(raw.bankTransfers) ? raw.bankTransfers : [];
  state.bankTransferSeq = Number(raw.bankTransferSeq || 0);
  state.filings = Array.isArray(raw.filings) ? raw.filings : [];
  state.supplierReminders = Array.isArray(raw.supplierReminders) ? raw.supplierReminders : [];
  state.collectionReminders = Array.isArray(raw.collectionReminders) ? raw.collectionReminders : [];
  state.collectionReminderSeq = Number(raw.collectionReminderSeq || 0);
  state.settlements = Array.isArray(raw.settlements) ? raw.settlements : [];
  state.settlementSeq = Number(raw.settlementSeq || 0);
  state.channels = raw.channels && typeof raw.channels === 'object' ? raw.channels : {};
  state.tcsStatements = Array.isArray(raw.tcsStatements) ? raw.tcsStatements : [];
  state.tdsCreditStatements = Array.isArray(raw.tdsCreditStatements) ? raw.tdsCreditStatements : [];
  state.skus = raw.skus && typeof raw.skus === 'object' ? raw.skus : {};
  state.stockMoves = Array.isArray(raw.stockMoves) ? raw.stockMoves : [];
  state.inventoryValuations = Array.isArray(raw.inventoryValuations) ? raw.inventoryValuations : [];
  state.portalSaves = raw.portalSaves && typeof raw.portalSaves === 'object' ? raw.portalSaves : {};
  state.gstr3bPortal = raw.gstr3bPortal && typeof raw.gstr3bPortal === 'object' ? raw.gstr3bPortal : {};
  state.tdsFvuJobs = Array.isArray(raw.tdsFvuJobs) ? raw.tdsFvuJobs : [];
  state.supplierReminderSeq = raw.supplierReminderSeq || 0;
  state.employees = Array.isArray(raw.employees) ? raw.employees : [];
  state.employeeSeq = raw.employeeSeq || 0;
  state.tdsEntries = Array.isArray(raw.tdsEntries) ? raw.tdsEntries : [];
  state.tdsDeposits = Array.isArray(raw.tdsDeposits) ? raw.tdsDeposits : [];
  state.gstCreditOpening = raw.gstCreditOpening && typeof raw.gstCreditOpening === 'object' ? raw.gstCreditOpening : null;
  state.tdsReviews = raw.tdsReviews && typeof raw.tdsReviews === 'object' ? raw.tdsReviews : {};
  state.payrollRuns = raw.payrollRuns && typeof raw.payrollRuns === 'object' ? raw.payrollRuns : {};
  state.usReturns = raw.usReturns && typeof raw.usReturns === 'object' && !Array.isArray(raw.usReturns) ? raw.usReturns : {};
  state.salesTaxRates = Array.isArray(raw.salesTaxRates) ? raw.salesTaxRates : [];
  state.salesTaxNexus = Array.isArray(raw.salesTaxNexus) ? raw.salesTaxNexus : [];
  state.salesTaxReviews = raw.salesTaxReviews && typeof raw.salesTaxReviews === 'object' ? raw.salesTaxReviews : {};
  state.salesTaxPayments = Array.isArray(raw.salesTaxPayments) ? raw.salesTaxPayments : [];
  state.gstPayments = raw.gstPayments && typeof raw.gstPayments === 'object' ? raw.gstPayments : {};
  state.sutaRates = Array.isArray(raw.sutaRates) ? raw.sutaRates : [];
  state.yearClosings = raw.yearClosings && typeof raw.yearClosings === 'object' ? raw.yearClosings : {};
  state.automation = raw.automation && typeof raw.automation === 'object' ? raw.automation : { lastRun: '', log: [] };
  state.amendmentSeq = raw.amendmentSeq || 0;
  state.chatRecent = Array.isArray(raw.chatRecent) ? raw.chatRecent : [];
  state.quoteSeq = raw.quoteSeq || 0;
  // Legacy states embedded raw content in `files`; carry it to a one-shot migration.
  state._legacyFiles = raw.files && typeof raw.files === 'object' ? raw.files : null;
  state.integrationConnections = normalizeIntegrationConnections(raw.integrationConnections);
  const remap = clientIdRemap(raw);
  state.documents = Array.isArray(raw.documents) ? raw.documents.map((doc) => withRenamedClient(remap, doc)) : [];
  state.firmUsers = Array.isArray(raw.firmUsers) ? raw.firmUsers.map((user) => withRenamedAccess(remap, user)) : [];
  state.auditEvents = Array.isArray(raw.auditEvents) ? raw.auditEvents.map((event) => withRenamedClient(remap, event)) : [];
  state.auditSeq = raw.auditSeq || 0;
  state.documentSeq = raw.documentSeq || 0;
  state.clients = rawClients(raw).map((client) => {
    const legacy = legacyClientId(client);
    const clientId = remap.get(legacy);
    return clientId === client.clientId ? { ...client } : { ...client, clientId, legacyClientId: legacy };
  });
  const books = emptyBooks();
  for (const [id, book] of Object.entries(rawBooks(raw))) books[remap.get(id)] = deserializeBook(book);
  state.extraBooks = books;
  state.approvals = raw.approvals || [];
  state.documentRequests = Array.isArray(raw.documentRequests) ? raw.documentRequests : [];
  state.documentRequestSeq = raw.documentRequestSeq || 0;
  state.evalEvents = Array.isArray(raw.evalEvents) ? raw.evalEvents : [];
  state.evalEventSeq = raw.evalEventSeq || 0;
  state.approvalSeq = raw.approvalSeq || 0;
  state.activeClientId = loadedActiveClientId(raw, remap, state.clients);
  state.outbox = raw.outbox || [];
  state.outboxSeq = raw.outboxSeq || 0;
  return renumberDuplicateDocuments(state);
}

function keepPreMigrationCopy(safePath, text, reason) {
  const name = `${basename(safePath, extname(safePath))}.before-${reason}-migration-${Date.now()}.json`;
  writeFileSync(join(dirname(safePath), name), text);
}

// PINs are credentials, not books: they live beside the books file, encrypted, so a
// copy of state.json or a backup never carries them.
export function pinVaultPath(statePath) {
  const safePath = safeStatePath(statePath);
  return join(dirname(safePath), `${basename(safePath, extname(safePath))}.pins`);
}

function writeAtomically(target, text) {
  const tempPath = join(dirname(target), `.${basename(target)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    writeFileSync(tempPath, text, 'utf8');
    renameSync(tempPath, target);
  } catch (err) {
    try { unlinkSync(tempPath); } catch {}
    throw err;
  }
}

const writtenPins = new Map();

// Encrypting costs a key derivation, so the vault is rewritten only when a PIN or a
// lockout counter actually changed, not on every save of the books.
function savePinVault(statePath, state) {
  const records = pinRecords(state);
  if (Object.keys(records).length === 0) return;
  const vaultPath = pinVaultPath(statePath);
  const text = JSON.stringify(records);
  if (!writtenPins.has(vaultPath)) {
    const onDisk = loadPinVault(statePath);
    if (onDisk) writtenPins.set(vaultPath, JSON.stringify(onDisk));
  }
  if (writtenPins.get(vaultPath) === text && existsSync(vaultPath)) return;
  writeAtomically(vaultPath, JSON.stringify({ version: 1, pins: encryptSecret(text) }));
  writtenPins.set(vaultPath, text);
}

function loadPinVault(statePath) {
  const vaultPath = pinVaultPath(statePath);
  if (!existsSync(vaultPath)) return null;
  try {
    const stored = JSON.parse(readFileSync(vaultPath, 'utf8'));
    const records = JSON.parse(decryptSecret(stored.pins));
    return records && typeof records === 'object' ? records : null;
  } catch {
    return null;
  }
}

export function loadState(path) {
  const safePath = safeStatePath(path);
  if (!existsSync(safePath)) return createState();
  const fd = openSync(safePath, 'r');
  try {
    const text = readFileSync(fd, 'utf8');
    const raw = JSON.parse(text);
    const state = deserialize(raw);
    if (rewritesClients(raw)) keepPreMigrationCopy(safePath, text, 'client-id');
    else if (rewritesDocuments(raw)) keepPreMigrationCopy(safePath, text, 'document-id');
    state._dataDir = dirname(safePath);
    applyPinRecords(state, loadPinVault(safePath));
    return state;
  } finally {
    closeSync(fd);
  }
}

export function saveState(path, state) {
  const safePath = safeStatePath(path);
  const dir = dirname(safePath);
  mkdirSync(dir, { recursive: true });
  const tempPath = join(dir, `.${basename(safePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  const text = JSON.stringify(serialize(state));
  savePinVault(safePath, state);
  try {
    writeDurably(tempPath, text);
    renameWithRetry(tempPath, safePath);
  } catch (err) {
    try { unlinkSync(tempPath); } catch {}
    throw err;
  }
  return text;
}

const RENAME_RETRIES = 6;
const RENAME_WAIT_MS = 50;
const TRANSIENT_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES']);

function writeDurably(path, text) {
  const fd = openSync(path, 'w');
  try {
    writeFileSync(fd, text, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameWithRetry(from, to) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (err) {
      if (!TRANSIENT_RENAME.has(err.code) || attempt >= RENAME_RETRIES) throw err;
      pause(RENAME_WAIT_MS * attempt);
    }
  }
}

export function safeStatePath(path) {
  const raw = String(path || '');
  if (!raw || raw.includes('\0')) throw new Error('invalid state path');
  if (!isAbsolute(raw)) throw new Error('state path must be absolute');
  const safePath = normalize(raw);
  if (extname(safePath).toLowerCase() !== '.json') throw new Error('state path must be a .json file');
  const allowedRoots = [
    normalize(dirname(defaultDataPath())),
    normalize(tmpdir()),
  ];
  const allowed = allowedRoots.some((root) => {
    const rel = relative(root, safePath);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  });
  if (!allowed) throw new Error('state path outside allowed storage roots');
  return safePath;
}

export function seedDemo(state) {
  if (state.invoices.length) return state;
  createInvoice(state, {
    date: '2026-08-05',
    partyName: 'Retail Mart',
    partyGstin: '27AAACH7409R1Z1',
    partyState: '27',
    lines: [{ description: 'Cotton fabric rolls', hsn: '5208', qty: 10, rate: 50000, gstRate: 5 }],
  });
  createInvoice(state, {
    date: '2026-08-18',
    partyName: 'Gujarat Weaves',
    partyGstin: '24AAACF7856R1ZY',
    partyState: '24',
    lines: [{ description: 'Processed yarn', hsn: '5402', qty: 4, rate: 80000, gstRate: 18 }],
  });
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 525000, date: '2026-08-20', mode: 'bank' });
  createPurchase(state, {
    date: '2026-08-06',
    partyName: 'Fabric Co',
    partyGstin: '27AABCT1332L1ZE',
    partyState: '27',
    lines: [{ description: 'Grey cloth', hsn: '5208', qty: 20, rate: 2000, gstRate: 5 }],
  });
  return state;
}
