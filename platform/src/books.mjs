import { emptyLedger, freeze, hydrate } from './ledger.mjs';
import { persistablePending, restoredPending, restoredConfirmation } from './chat-confirm.mjs';
import { installChart } from './chart.mjs';

export const CLIENT_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;

export function canonicalClientId(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function normalizeClientId(value) {
  return canonicalClientId(value) || 'SELF';
}

export function isValidClientId(id) {
  return id !== 'SELF' && CLIENT_ID_PATTERN.test(id);
}

export function emptyBooks() {
  return Object.create(null);
}

export function ensureBooks(state) {
  if (!state.extraBooks || typeof state.extraBooks !== 'object') state.extraBooks = emptyBooks();
  else if (Object.getPrototypeOf(state.extraBooks) !== null) state.extraBooks = Object.assign(emptyBooks(), state.extraBooks);
  return state.extraBooks;
}

export function newBook(company = {}) {
  const ledger = emptyLedger();
  installChart(ledger);
  return {
    company,
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
    lockThrough: '',
    files: {},
    attachments: {},
    pendingFile: null,
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
    gstr2b: {},
    reminders: [],
    reminderSeq: 0,
    cashReadings: [],
    customerTerms: {},
    supplierTerms: {},
    caRequests: [],
    caRequestSeq: 0,
    quotes: [],
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
    tdsFvuJobs: [],
    supplierReminderSeq: 0,
    employees: [],
    employeeSeq: 0,
    tdsEntries: [],
    tdsDeposits: [],
    gstCreditOpening: null,
    tdsReviews: {},
    payrollRuns: {},
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
  };
}

export function serializeBook(book) {
  return {
    company: book.company || {},
    ledger: freeze(book.ledger),
    parties: book.parties || [],
    vendors: book.vendors || [],
    invoices: book.invoices || [],
    purchases: book.purchases || [],
    invoiceSeq: book.invoiceSeq || 0,
    invoiceSeqByFy: book.invoiceSeqByFy || {},
    billSeq: book.billSeq || 0,
    transferSeq: book.transferSeq || 100000,
    imports: book.imports || [],
    lockThrough: book.lockThrough || '',
    attachments: book.attachments || {},
    pendingChatAction: persistablePending(book.pendingChatAction),
    lastConfirmation: book.lastConfirmation || null,
    exceptions: book.exceptions || [],
    exceptionSeq: book.exceptionSeq || 0,
    expenses: book.expenses || [],
    expenseSeq: book.expenseSeq || 0,
    expenseTags: book.expenseTags || {},
    creditNotes: book.creditNotes || [],
    creditNoteSeq: book.creditNoteSeq || 0,
    debitNotes: book.debitNotes || [],
    debitNoteSeq: book.debitNoteSeq || 0,
    purchaseNotes: book.purchaseNotes || [],
    purchaseNoteSeq: book.purchaseNoteSeq || 0,
    gstReviews: book.gstReviews || {},
    monthCloses: book.monthCloses || {},
    gstr2b: book.gstr2b || {},
    reminders: book.reminders || [],
    reminderSeq: book.reminderSeq || 0,
    cashReadings: book.cashReadings || [],
    customerTerms: book.customerTerms || {},
    supplierTerms: book.supplierTerms || {},
    caRequests: book.caRequests || [],
    caRequestSeq: book.caRequestSeq || 0,
    quotes: book.quotes || [],
    filings: book.filings || [],
    supplierReminders: book.supplierReminders || [],
    collectionReminders: book.collectionReminders || [],
    collectionReminderSeq: book.collectionReminderSeq || 0,
    settlements: book.settlements || [],
    settlementSeq: book.settlementSeq || 0,
    channels: book.channels || {},
    tcsStatements: book.tcsStatements || [],
    tdsCreditStatements: book.tdsCreditStatements || [],
    skus: book.skus || {},
    stockMoves: book.stockMoves || [],
    inventoryValuations: book.inventoryValuations || [],
    portalSaves: book.portalSaves || {},
    tdsFvuJobs: book.tdsFvuJobs || [],
    supplierReminderSeq: book.supplierReminderSeq || 0,
    employees: book.employees || [],
    employeeSeq: book.employeeSeq || 0,
    tdsEntries: book.tdsEntries || [],
    tdsDeposits: book.tdsDeposits || [],
    gstCreditOpening: book.gstCreditOpening || null,
    tdsReviews: book.tdsReviews || {},
    payrollRuns: book.payrollRuns || {},
    salesTaxRates: book.salesTaxRates || [],
    salesTaxNexus: book.salesTaxNexus || [],
    salesTaxReviews: book.salesTaxReviews || {},
    salesTaxPayments: book.salesTaxPayments || [],
    gstPayments: book.gstPayments || {},
    sutaRates: book.sutaRates || [],
    yearClosings: book.yearClosings || {},
    automation: book.automation || { lastRun: '', log: [] },
    amendmentSeq: book.amendmentSeq || 0,
    chatRecent: Array.isArray(book.chatRecent) ? book.chatRecent : [],
    quoteSeq: book.quoteSeq || 0,
  };
}

export function deserializeBook(raw) {
  if (!raw) return newBook({});
  const book = newBook(raw.company || {});
  book.ledger = hydrate(raw.ledger);
  book.parties = raw.parties || [];
  book.vendors = raw.vendors || [];
  book.invoices = raw.invoices || [];
  book.purchases = raw.purchases || [];
  book.invoiceSeq = raw.invoiceSeq || 0;
  book.invoiceSeqByFy = raw.invoiceSeqByFy && typeof raw.invoiceSeqByFy === 'object' ? raw.invoiceSeqByFy : {};
  book.billSeq = raw.billSeq || 0;
  book.transferSeq = raw.transferSeq || 100000;
  book.imports = raw.imports || [];
  book.lockThrough = raw.lockThrough || '';
  book.attachments = raw.attachments && typeof raw.attachments === 'object' ? raw.attachments : {};
  book.pendingChatAction = restoredPending(raw.pendingChatAction);
  book.lastConfirmation = restoredConfirmation(raw.lastConfirmation);
  book.exceptions = Array.isArray(raw.exceptions) ? raw.exceptions : [];
  book.exceptionSeq = raw.exceptionSeq || 0;
  book.expenses = Array.isArray(raw.expenses) ? raw.expenses : [];
  book.expenseSeq = raw.expenseSeq || 0;
  book.expenseTags = raw.expenseTags && typeof raw.expenseTags === 'object' ? raw.expenseTags : {};
  book.creditNotes = Array.isArray(raw.creditNotes) ? raw.creditNotes : [];
  book.creditNoteSeq = raw.creditNoteSeq || 0;
  book.gstReviews = raw.gstReviews && typeof raw.gstReviews === 'object' ? raw.gstReviews : {};
  book.monthCloses = raw.monthCloses && typeof raw.monthCloses === 'object' ? raw.monthCloses : {};
  book.gstr2b = raw.gstr2b && typeof raw.gstr2b === 'object' ? raw.gstr2b : {};
  book.reminders = Array.isArray(raw.reminders) ? raw.reminders : [];
  book.reminderSeq = raw.reminderSeq || 0;
  book.cashReadings = Array.isArray(raw.cashReadings) ? raw.cashReadings : [];
  book.customerTerms = raw.customerTerms && typeof raw.customerTerms === 'object' ? raw.customerTerms : {};
  book.supplierTerms = raw.supplierTerms && typeof raw.supplierTerms === 'object' ? raw.supplierTerms : {};
  book.caRequests = Array.isArray(raw.caRequests) ? raw.caRequests : [];
  book.caRequestSeq = raw.caRequestSeq || 0;
  book.quotes = Array.isArray(raw.quotes) ? raw.quotes : [];
  book.filings = Array.isArray(raw.filings) ? raw.filings : [];
  book.supplierReminders = Array.isArray(raw.supplierReminders) ? raw.supplierReminders : [];
  book.collectionReminders = Array.isArray(raw.collectionReminders) ? raw.collectionReminders : [];
  book.collectionReminderSeq = Number(raw.collectionReminderSeq || 0);
  book.settlements = Array.isArray(raw.settlements) ? raw.settlements : [];
  book.settlementSeq = Number(raw.settlementSeq || 0);
  book.channels = raw.channels && typeof raw.channels === 'object' ? raw.channels : {};
  book.tcsStatements = Array.isArray(raw.tcsStatements) ? raw.tcsStatements : [];
  book.tdsCreditStatements = Array.isArray(raw.tdsCreditStatements) ? raw.tdsCreditStatements : [];
  book.skus = raw.skus && typeof raw.skus === 'object' ? raw.skus : {};
  book.stockMoves = Array.isArray(raw.stockMoves) ? raw.stockMoves : [];
  book.inventoryValuations = Array.isArray(raw.inventoryValuations) ? raw.inventoryValuations : [];
  book.portalSaves = raw.portalSaves && typeof raw.portalSaves === 'object' ? raw.portalSaves : {};
  book.tdsFvuJobs = Array.isArray(raw.tdsFvuJobs) ? raw.tdsFvuJobs : [];
  book.supplierReminderSeq = raw.supplierReminderSeq || 0;
  book.employees = Array.isArray(raw.employees) ? raw.employees : [];
  book.employeeSeq = raw.employeeSeq || 0;
  book.tdsEntries = Array.isArray(raw.tdsEntries) ? raw.tdsEntries : [];
  book.tdsDeposits = Array.isArray(raw.tdsDeposits) ? raw.tdsDeposits : [];
  book.gstCreditOpening = raw.gstCreditOpening && typeof raw.gstCreditOpening === 'object' ? raw.gstCreditOpening : null;
  book.tdsReviews = raw.tdsReviews && typeof raw.tdsReviews === 'object' ? raw.tdsReviews : {};
  book.payrollRuns = raw.payrollRuns && typeof raw.payrollRuns === 'object' ? raw.payrollRuns : {};
  book.salesTaxRates = Array.isArray(raw.salesTaxRates) ? raw.salesTaxRates : [];
  book.salesTaxNexus = Array.isArray(raw.salesTaxNexus) ? raw.salesTaxNexus : [];
  book.salesTaxReviews = raw.salesTaxReviews && typeof raw.salesTaxReviews === 'object' ? raw.salesTaxReviews : {};
  book.salesTaxPayments = Array.isArray(raw.salesTaxPayments) ? raw.salesTaxPayments : [];
  book.gstPayments = raw.gstPayments && typeof raw.gstPayments === 'object' ? raw.gstPayments : {};
  book.sutaRates = Array.isArray(raw.sutaRates) ? raw.sutaRates : [];
  book.yearClosings = raw.yearClosings && typeof raw.yearClosings === 'object' ? raw.yearClosings : {};
  book.automation = raw.automation && typeof raw.automation === 'object' ? raw.automation : { lastRun: '', log: [] };
  book.amendmentSeq = raw.amendmentSeq || 0;
  book.chatRecent = Array.isArray(raw.chatRecent) ? raw.chatRecent : [];
  book.quoteSeq = raw.quoteSeq || 0;
  return book;
}

export function companyFromClient(client = {}) {
  const gstin = String(client.gstin || '');
  return {
    name: client.name || client.clientId || 'Client',
    gstin,
    state: String(client.state || gstin.slice(0, 2) || ''),
    pan: client.pan || (gstin.length >= 12 ? gstin.slice(2, 12) : ''),
    fy: client.fy || '2026-27',
    entityType: client.entityType || 'llp',
    address: client.address || '',
  };
}

export function getBook(state, clientId) {
  const id = canonicalClientId(clientId);
  if (id === 'SELF') return state;
  const client = isValidClientId(id) ? (state.clients || []).find((c) => c.clientId === id) : undefined;
  if (!client) {
    const err = new Error('CLIENT_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
  const books = ensureBooks(state);
  if (!Object.hasOwn(books, id)) books[id] = newBook(companyFromClient(client));
  return books[id];
}
