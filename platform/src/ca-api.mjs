import { createHash } from 'node:crypto';
import { journal, trialBalance } from './ledger.mjs';
import { createInvoice, createPurchase } from './invoice.mjs';
import { getBook, normalizeClientId, isValidClientId, ensureBooks } from './books.mjs';
import { putDocument, readDocument } from './document-store.mjs';

const DEFAULT_USER = {
  userId: 'USR-ADMIN',
  name: 'Firm Admin',
  role: 'admin',
  clientIds: ['SELF'],
};

function jsonHash(value) {
  const json = JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
  return createHash('sha256').update(json).digest('hex');
}

export function stateDigest(state) {
  return jsonHash({
    company: state.company,
    invoices: state.invoices || [],
    purchases: state.purchases || [],
    ledgerClock: state.ledger?.clock?.toString?.() || '0',
    ledgerChecksum: state.ledger?.lastChecksum || 0,
    imports: state.imports || [],
    documents: state.documents || [],
    outbox: (state.outbox || []).map((m) => ({ id: m.id, status: m.status, channel: m.channel })),
    approvals: (state.approvals || []).map((a) => ({ approvalId: a.approvalId, operationId: a.operationId, status: a.status, usedAt: a.usedAt || '' })),
    clients: state.clients || [],
    extraBooks: Object.fromEntries(
      Object.entries(state.extraBooks || {}).map(([id, book]) => [id, {
        invoices: book.invoices || [],
        purchases: book.purchases || [],
        ledgerChecksum: book.ledger?.lastChecksum || 0,
      }]),
    ),
  });
}

export function ensureCaApiState(state) {
  state.documents = Array.isArray(state.documents) ? state.documents : [];
  state.clients = Array.isArray(state.clients) ? state.clients : [];
  ensureBooks(state);
  state.attachments = state.attachments && typeof state.attachments === 'object' ? state.attachments : {};
  state.approvals = Array.isArray(state.approvals) ? state.approvals : [];
  state.approvalSeq = Number(state.approvalSeq || state.approvals.length || 0);
  state.activeClientId = String(state.activeClientId || 'SELF');
  state.outbox = Array.isArray(state.outbox) ? state.outbox : [];
  state.outboxSeq = Number(state.outboxSeq || state.outbox.length || 0);
  state.firmUsers = Array.isArray(state.firmUsers) && state.firmUsers.length ? state.firmUsers : [DEFAULT_USER];
  state.auditEvents = Array.isArray(state.auditEvents) ? state.auditEvents : [];
  state.auditSeq = Number(state.auditSeq || state.auditEvents.length || 0);
  state.documentSeq = Number(state.documentSeq || state.documents.length || 0);
  return state;
}

function companyClient(state) {
  const gstin = String(state.company?.gstin || '');
  return {
    clientId: 'SELF',
    name: state.company?.name || 'MyCA Client',
    pan: gstin.length >= 12 ? gstin.slice(2, 12) : '',
    gstin,
    entityType: state.company?.entityType || 'llp',
    state: state.company?.state || gstin.slice(0, 2) || '',
    turnover: [...(state.invoices || []), ...(state.purchases || [])].reduce((sum, row) => sum + (Number(row.total) || 0), 0),
    gstFrequency: state.company?.gstFrequency || 'monthly',
    auditRequired: state.company?.auditRequired ?? true,
  };
}

function clients(state) {
  const configured = Array.isArray(state.clients) ? state.clients : [];
  const seen = new Set(configured.map((c) => c.clientId));
  return seen.has('SELF') ? configured : [companyClient(state), ...configured];
}

function requireClient(state, clientId) {
  const id = normalizeClientId(clientId);
  const client = clients(state).find((row) => row.clientId === id);
  if (!client) {
    const err = new Error('CLIENT_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
  return client;
}

export function listClients(state) {
  ensureCaApiState(state);
  return { activeClientId: String(state.activeClientId || 'SELF'), clients: clients(state) };
}

export function registerClient(state, body = {}) {
  ensureCaApiState(state);
  const raw = String(body.clientId || body.id || '').trim();
  if (!raw) return { ok: false, error: 'CLIENT_ID_REQUIRED' };
  const id = normalizeClientId(raw);
  if (id === 'SELF' || state.clients.some((c) => c.clientId === id)) return { ok: false, error: 'CLIENT_EXISTS' };
  if (!isValidClientId(id)) return { ok: false, error: 'INVALID_CLIENT_ID' };
  const gstin = String(body.gstin || '').trim().toUpperCase();
  const client = {
    clientId: id,
    name: String(body.name || id),
    pan: String(body.pan || (gstin.length >= 12 ? gstin.slice(2, 12) : '')),
    gstin,
    entityType: String(body.entityType || 'proprietor'),
    state: String(body.state || gstin.slice(0, 2) || ''),
    turnover: Number(body.turnover || 0),
    gstFrequency: String(body.gstFrequency || 'monthly'),
    auditRequired: body.auditRequired !== false,
  };
  state.clients.push(client);
  return { ok: true, client };
}

export function setActiveClient(state, clientId) {
  ensureCaApiState(state);
  const id = normalizeClientId(clientId);
  if (id !== 'SELF' && !state.clients.some((c) => c.clientId === id)) return { ok: false, error: 'CLIENT_NOT_FOUND' };
  state.activeClientId = id;
  return { ok: true, activeClientId: id };
}

export function appendAuditEvent(state, event) {
  ensureCaApiState(state);
  const beforeHash = event.beforeHash || stateDigest(state);
  const record = {
    eventId: event.eventId || `AUD-${String(++state.auditSeq).padStart(6, '0')}`,
    actorId: event.actorId || 'system',
    clientId: event.clientId || 'SELF',
    action: event.action || 'api_event',
    at: event.at || new Date().toISOString(),
    beforeHash,
    afterHash: event.afterHash || beforeHash,
    metadata: event.metadata || {},
  };
  state.auditEvents.push(record);
  return record;
}

export function listDocuments(state, clientId) {
  ensureCaApiState(state);
  const { clientId: id } = requireClient(state, clientId);
  return { ok: true, data: { clientId: id, documents: state.documents.filter((doc) => doc.clientId === id) } };
}

export function uploadDocument(state, clientId, input = {}) {
  ensureCaApiState(state);
  const { clientId: id } = requireClient(state, clientId);
  const beforeHash = stateDigest(state);
  const { doc, content } = documentPayload(state, id, input);
  const stored = putDocument(state._dataDir, content);
  doc.sha256 = stored.sha256;
  doc.bytes = stored.bytes;
  state.documents.push(doc);
  state.files[doc.documentId] = content;
  appendAuditEvent(state, {
    actorId: input.actorId || 'api',
    clientId: id,
    action: 'documents.upload',
    beforeHash,
    afterHash: stateDigest(state),
    metadata: { documentId: doc.documentId, kind: doc.kind, sha256: doc.sha256, bytes: doc.bytes },
  });
  return { ok: true, data: doc };
}

export function getDocumentContent(state, clientId, documentId) {
  ensureCaApiState(state);
  const { clientId: id } = requireClient(state, clientId);
  const doc = state.documents.find((d) => d.documentId === documentId && d.clientId === id);
  if (!doc) return { ok: false, error: 'DOCUMENT_NOT_FOUND' };
  const content = state.files[documentId] != null ? state.files[documentId] : readDocument(state._dataDir, doc.sha256);
  if (content == null) return { ok: false, error: 'DOCUMENT_BYTES_MISSING' };
  return { ok: true, data: { ...doc, content } };
}

function documentPayload(state, clientId, input = {}) {
  ensureCaApiState(state);
  const content = String(input.content || '');
  const doc = {
    documentId: input.documentId || `DOC-${String(++state.documentSeq).padStart(6, '0')}`,
    clientId,
    kind: String(input.kind || 'general'),
    fileName: String(input.fileName || input.name || 'document.txt'),
    contentType: String(input.contentType || 'text/plain'),
    uploadedAt: input.uploadedAt || new Date().toISOString(),
    bytes: Buffer.byteLength(content, 'utf8'),
    sha256: jsonHash(content),
  };
  return { doc, content };
}

function postVoucher(state, clientId, body = {}) {
  const book = getBook(state, clientId);
  const beforeHash = stateDigest(state);
  const kind = String(body.type || body.kind || '').toLowerCase();
  const result = kind === 'purchase'
    ? createPurchase(book, body)
    : createInvoice(book, body);
  if (!result.ok) return result;
  const afterHash = stateDigest(state);
  appendAuditEvent(state, {
    actorId: body.actorId || 'api',
    clientId,
    action: kind === 'purchase' ? 'books_ledger.create_purchase' : 'books_ledger.create_invoice',
    beforeHash,
    afterHash,
    metadata: { voucherId: result.invoice?.id },
  });
  return result;
}

export function handleCaApi(state, method, pathname, body = {}) {
  ensureCaApiState(state);
  const path = String(pathname || '').replace(/^\/api\/ca/, '') || '/';
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (method === 'GET' && path === '/clients') {
    return { ok: true, data: { clients: clients(state) } };
  }

  if (method === 'POST' && path === '/clients') {
    const beforeHash = stateDigest(state);
    const out = registerClient(state, body);
    if (!out.ok) return out;
    appendAuditEvent(state, {
      actorId: body.actorId || 'api',
      clientId: out.client.clientId,
      action: 'client.create',
      beforeHash,
      afterHash: stateDigest(state),
      metadata: { clientId: out.client.clientId },
    });
    return { ok: true, data: out.client };
  }

  if (method === 'GET' && segments[0] === 'clients' && segments.length === 2) {
    return { ok: true, data: requireClient(state, segments[1]) };
  }

  if (method === 'GET' && segments[0] === 'clients' && segments[2] === 'ledger') {
    const book = getBook(state, segments[1]);
    return { ok: true, data: { clientId: segments[1], rows: journal(book.ledger) } };
  }

  if (method === 'GET' && segments[0] === 'clients' && segments[2] === 'trial-balance') {
    const book = getBook(state, segments[1]);
    return { ok: true, data: { clientId: segments[1], ...trialBalance(book.ledger) } };
  }

  if (method === 'POST' && segments[0] === 'clients' && segments[2] === 'vouchers') {
    return postVoucher(state, segments[1], body);
  }

  if (method === 'GET' && segments[0] === 'clients' && segments[2] === 'documents' && segments.length === 4) {
    return getDocumentContent(state, segments[1], segments[3]);
  }

  if (method === 'GET' && segments[0] === 'clients' && segments[2] === 'documents' && segments.length === 3) {
    return listDocuments(state, segments[1]);
  }

  if (method === 'POST' && segments[0] === 'clients' && segments[2] === 'documents') {
    return uploadDocument(state, segments[1], body);
  }

  if (method === 'GET' && path === '/users') {
    return { ok: true, data: { users: state.firmUsers } };
  }

  if (method === 'GET' && segments[0] === 'clients' && segments[2] === 'access') {
    requireClient(state, segments[1]);
    return {
      ok: true,
      data: {
        clientId: segments[1],
        users: state.firmUsers.filter((user) => (user.clientIds || []).includes(segments[1])),
      },
    };
  }

  if (method === 'GET' && path === '/audit-events') {
    return { ok: true, data: { auditEvents: state.auditEvents } };
  }

  if (method === 'POST' && path === '/audit-events') {
    return { ok: true, data: appendAuditEvent(state, body) };
  }

  if (method === 'GET' && segments[0] === 'clients' && segments[2] === 'audit-events') {
    requireClient(state, segments[1]);
    return { ok: true, data: { auditEvents: state.auditEvents.filter((event) => event.clientId === segments[1]) } };
  }

  const err = new Error('CA_API_ROUTE_NOT_FOUND');
  err.statusCode = 404;
  throw err;
}
