import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, normalize, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { emptyLedger, freeze, hydrate } from './ledger.mjs';
import { DEFAULT_COMPANY, installChart } from './chart.mjs';
import { createInvoice, recordReceipt, createPurchase } from './invoice.mjs';
import { normalizeIntegrationConnections } from './integration-contract.mjs';
import { ensureCaApiState } from './ca-api.mjs';
import { serializeBook, deserializeBook } from './books.mjs';

import { migrateLegacyBooks } from './govt.mjs';

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
    billSeq: 0,
    transferSeq: 100000,
    imports: [],
    files: {},
    attachments: {},
    integrationConnections: {},
    documents: [],
    firmUsers: [],
    auditEvents: [],
    auditSeq: 0,
    documentSeq: 0,
    clients: [],
    extraBooks: {},
    approvals: [],
    approvalSeq: 0,
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
    billSeq: state.billSeq || 0,
    transferSeq: state.transferSeq,
    imports: state.imports,
    attachments: state.attachments || {},
    integrationConnections: normalizeIntegrationConnections(state.integrationConnections),
    documents: state.documents || [],
    firmUsers: state.firmUsers || [],
    auditEvents: state.auditEvents || [],
    auditSeq: state.auditSeq || 0,
    documentSeq: state.documentSeq || 0,
    clients: state.clients || [],
    extraBooks: Object.fromEntries(
      Object.entries(state.extraBooks || {}).map(([id, book]) => [id, serializeBook(book)]),
    ),
    approvals: state.approvals || [],
    approvalSeq: state.approvalSeq || 0,
  };
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
  state.billSeq = raw.billSeq || 0;
  state.transferSeq = raw.transferSeq || 100000;
  state.imports = raw.imports || [];
  state.files = {};
  state.attachments = raw.attachments && typeof raw.attachments === 'object' ? raw.attachments : {};
  // Legacy states embedded raw content in `files`; carry it to a one-shot migration.
  state._legacyFiles = raw.files && typeof raw.files === 'object' ? raw.files : null;
  state.integrationConnections = normalizeIntegrationConnections(raw.integrationConnections);
  state.documents = raw.documents || [];
  state.firmUsers = raw.firmUsers || [];
  state.auditEvents = raw.auditEvents || [];
  state.auditSeq = raw.auditSeq || 0;
  state.documentSeq = raw.documentSeq || 0;
  state.clients = raw.clients || [];
  state.extraBooks = Object.fromEntries(
    Object.entries(raw.extraBooks || {}).map(([id, book]) => [id, deserializeBook(book)]),
  );
  state.approvals = raw.approvals || [];
  state.approvalSeq = raw.approvalSeq || 0;
  return ensureCaApiState(state);
}

export function loadState(path) {
  const safePath = safeStatePath(path);
  if (!existsSync(safePath)) return createState();
  const fd = openSync(safePath, 'r');
  try {
    const state = deserialize(JSON.parse(readFileSync(fd, 'utf8')));
    state._dataDir = dirname(safePath);
    return state;
  } finally {
    closeSync(fd);
  }
}

export function saveState(path, state) {
  const safePath = safeStatePath(path);
  mkdirSync(dirname(safePath), { recursive: true });
  writeFileSync(safePath, JSON.stringify(serialize(state), null, 2));
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
    partyGstin: '27AAACH7409R1Z3',
    partyState: '27',
    lines: [{ description: 'Cotton fabric rolls', hsn: '5208', qty: 10, rate: 50000, gstRate: 5 }],
  });
  createInvoice(state, {
    date: '2026-08-18',
    partyName: 'Gujarat Weaves',
    partyGstin: '24AAACF7856R1Z0',
    partyState: '24',
    lines: [{ description: 'Processed yarn', hsn: '5402', qty: 4, rate: 80000, gstRate: 18 }],
  });
  recordReceipt(state, { invoiceId: 'INV-0001', amount: 525000, date: '2026-08-20', mode: 'bank' });
  createPurchase(state, {
    date: '2026-08-06',
    partyName: 'Fabric Co',
    partyGstin: '27AABCT1332L1ZM',
    partyState: '27',
    lines: [{ description: 'Grey cloth', hsn: '5208', qty: 20, rate: 2000, gstRate: 5 }],
  });
  return state;
}
