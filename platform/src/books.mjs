import { emptyLedger, freeze, hydrate } from './ledger.mjs';
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
    billSeq: 0,
    transferSeq: 100000,
    imports: [],
    lockThrough: '',
    files: {},
    attachments: {},
    pendingFile: null,
    pendingChatAction: null,
    exceptions: [],
    exceptionSeq: 0,
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
    billSeq: book.billSeq || 0,
    transferSeq: book.transferSeq || 100000,
    imports: book.imports || [],
    lockThrough: book.lockThrough || '',
    attachments: book.attachments || {},
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
  book.billSeq = raw.billSeq || 0;
  book.transferSeq = raw.transferSeq || 100000;
  book.imports = raw.imports || [];
  book.lockThrough = raw.lockThrough || '';
  book.attachments = raw.attachments && typeof raw.attachments === 'object' ? raw.attachments : {};
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
