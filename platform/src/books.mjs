import { emptyLedger, freeze, hydrate } from './ledger.mjs';
import { installChart } from './chart.mjs';

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

// The app's own books are the root state; every other client gets an isolated book.
export function getBook(state, clientId) {
  const id = String(clientId || 'SELF');
  if (id === 'SELF') return state;
  const client = (state.clients || []).find((c) => c.clientId === id);
  if (!client) {
    const err = new Error('CLIENT_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
  state.extraBooks = state.extraBooks || {};
  if (!state.extraBooks[id]) state.extraBooks[id] = newBook(companyFromClient(client));
  return state.extraBooks[id];
}
