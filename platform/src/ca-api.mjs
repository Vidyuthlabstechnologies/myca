import { createHash } from 'node:crypto';
import { requestDocuments, recordDocumentReceived, documentRequests, correctEval, evalEvents, searchFirmNotes } from './practice.mjs';
import { journal, trialBalance } from './ledger.mjs';
import { createInvoice, createPurchase } from './invoice.mjs';
import { getBook, canonicalClientId, normalizeClientId, isValidClientId, ensureBooks } from './books.mjs';
import { documentsOf } from './document-store.mjs';
import { ensureDefaultAdmin, listUsers, addUser, findUser, verifyUserPin } from './identity.mjs';
import { normalizeUserId } from './approvals.mjs';
import { redactTinsDeep } from './us-identity.mjs';

function jsonHash(value) {
  const json = JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item));
  return createHash('sha256').update(json).digest('hex');
}

function digestBook(b) {
  if (!b) return {};
  return {
    company: b.company,
    lockThrough: b.lockThrough || '',
    invoices: b.invoices || [],
    purchases: b.purchases || [],
    imports: b.imports || [],
    imsDecisions: b.imsDecisions || {},
    supplierTerms: b.supplierTerms || {},
    ledgerClock: b.ledger?.clock?.toString?.() || '0',
    ledgerChecksum: b.ledger?.lastChecksum || 0,
  };
}

export function stateDigest(state) {
  return jsonHash({
    ...digestBook(state),
    integrationConnections: state.integrationConnections || {},
    documents: state.documents || [],
    outbox: (state.outbox || []).map((m) => ({ id: m.id, status: m.status, channel: m.channel })),
    approvals: (state.approvals || []).map((a) => ({ approvalId: a.approvalId, operationId: a.operationId, status: a.status, usedAt: a.usedAt || '' })),
    clients: state.clients || [],
    extraBooks: Object.fromEntries(
      Object.entries(state.extraBooks || {}).map(([id, book]) => [id, digestBook(book)]),
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
  ensureDefaultAdmin(state);
  state.auditEvents = Array.isArray(state.auditEvents) ? state.auditEvents : [];
  state.auditSeq = Number(state.auditSeq || state.auditEvents.length || 0);
  state.documentSeq = Math.max(documentNumber(state.documentSeq || state.documents.length), highestDocumentNumber(state.documents));
  return state;
}

const DOCUMENT_NUMBER_CAP = 1e12;

function documentNumber(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= DOCUMENT_NUMBER_CAP ? n : 0;
}

function highestDocumentNumber(documents) {
  let highest = 0;
  for (const doc of documents) {
    const match = /^DOC-(\d+)$/.exec(String(doc?.documentId ?? ''));
    highest = Math.max(highest, match ? documentNumber(match[1]) : 0);
  }
  return highest;
}

function documentIds(state) {
  return new Set(state.documents.map((doc) => doc?.documentId));
}

function nextDocumentId(state, taken = documentIds(state)) {
  let id;
  do id = `DOC-${String(++state.documentSeq).padStart(6, '0')}`; while (taken.has(id));
  return id;
}

export function renumberDuplicateDocuments(state) {
  ensureCaApiState(state);
  const seen = new Set();
  const taken = documentIds(state);
  state.documents = state.documents.map((doc) => {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
    if (!seen.has(doc.documentId)) {
      seen.add(doc.documentId);
      return doc;
    }
    return { ...doc, documentId: nextDocumentId(state, taken), legacyDocumentId: doc.documentId };
  });
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
  const id = canonicalClientId(clientId);
  const client = id ? clients(state).find((row) => row.clientId === id) : undefined;
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

function sortedKeysJson(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
  });
}

export function auditEventHash(record) {
  return createHash('sha256').update([record.eventId, record.actorId, String(record.actorName || ''), record.action, record.at, record.beforeHash, record.afterHash, sortedKeysJson(record.metadata), record.prevHash].join('\n')).digest('hex');
}

function auditIdTaken(state, id) {
  return state.auditEvents.some((row) => row && row.eventId === id);
}

const AUDIT_SEQ_CAP = 1e12;

function auditIdOf(number) {
  return `AUD-${String(number).padStart(6, '0')}`;
}

function nextAuditId(state) {
  const counter = state.auditSeq;
  let seq = Number.isSafeInteger(counter) && counter >= 0 && counter < AUDIT_SEQ_CAP ? counter : state.auditEvents.length;
  let id = auditIdOf(++seq);
  if (auditIdTaken(state, id)) {
    const used = new Set(state.auditEvents.map((row) => row && row.eventId));
    while (used.has(id)) id = auditIdOf(++seq);
  }
  state.auditSeq = seq;
  return id;
}

function actorNameFor(state, actorId) {
  const id = normalizeUserId(actorId);
  if (!id) return '';
  const signedIn = state.__actor;
  if (signedIn && signedIn.name && normalizeUserId(signedIn.userId) === id) return String(signedIn.name);
  const user = findUser(state, id);
  return user && user.name ? String(user.name) : '';
}

export function appendAuditEvent(state, event) {
  ensureCaApiState(state);
  if (event.eventId && auditIdTaken(state, event.eventId)) return { ok: false, error: 'DUPLICATE_ID', id: event.eventId };
  const beforeHash = event.beforeHash || stateDigest(state);
  const previous = state.auditEvents[state.auditEvents.length - 1];
  const record = {
    eventId: event.eventId || nextAuditId(state),
    actorId: event.actorId || 'system',
    actorName: String(event.actorName || actorNameFor(state, event.actorId)),
    clientId: event.clientId || 'SELF',
    action: event.action || 'api_event',
    at: event.at || new Date().toISOString(),
    beforeHash,
    afterHash: event.afterHash || beforeHash,
    metadata: redactTinsDeep(event.metadata || {}),
    prevHash: previous && previous.hash ? previous.hash : '',
  };
  record.hash = auditEventHash(record);
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
  const stored = documentsOf(state).put(content);
  doc.sha256 = stored.sha256;
  doc.bytes = stored.bytes;
  state.documents.push(doc);
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
  const read = documentsOf(state).readVerified(doc.sha256);
  if (!read.ok) return { ok: false, error: read.error };
  return { ok: true, data: { ...doc, content: read.content } };
}

function documentPayload(state, clientId, input = {}) {
  ensureCaApiState(state);
  const content = String(input.content || '');
  const doc = {
    documentId: nextDocumentId(state),
    clientId,
    kind: String(input.kind || 'general'),
    fileName: String(input.fileName || input.name || 'document.txt'),
    contentType: String(input.contentType || 'text/plain'),
    uploadedAt: new Date().toISOString(),
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

function handleClientRoute(state, method, client, rest, body) {
  const id = client.clientId;
  if (method === 'GET' && rest.length === 0) return { ok: true, data: client };
  if (method === 'GET' && rest[0] === 'ledger') {
    return { ok: true, data: { clientId: id, rows: journal(getBook(state, id).ledger) } };
  }
  if (method === 'GET' && rest[0] === 'trial-balance') {
    return { ok: true, data: { clientId: id, ...trialBalance(getBook(state, id).ledger) } };
  }
  if (method === 'POST' && rest[0] === 'vouchers') return postVoucher(state, id, body);
  if (method === 'GET' && rest[0] === 'documents' && rest.length === 2) return getDocumentContent(state, id, rest[1]);
  if (method === 'GET' && rest[0] === 'documents' && rest.length === 1) return listDocuments(state, id);
  if (method === 'POST' && rest[0] === 'documents') return uploadDocument(state, id, body);
  if (method === 'GET' && rest[0] === 'access') {
    return { ok: true, data: { clientId: id, users: listUsers(state).filter((user) => (user.clientIds || []).includes(id)) } };
  }
  if (method === 'GET' && rest[0] === 'audit-events') {
    return { ok: true, data: { auditEvents: state.auditEvents.filter((event) => event.clientId === id) } };
  }
  return null;
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

  if (segments[0] === 'clients' && segments.length >= 2) {
    const out = handleClientRoute(state, method, requireClient(state, segments[1]), segments.slice(2), body);
    if (out) return out;
  }

  if (path === '/document-requests') {
    if (method === 'GET') return documentRequests(state, { clientId: body.clientId, status: body.status || 'open' });
    if (method === 'POST') return requestDocuments(state, body);
  }
  if (method === 'POST' && path === '/document-requests/received') return recordDocumentReceived(state, body);
  if (method === 'GET' && path === '/ai/eval-events') return evalEvents(state, body);
  if (method === 'POST' && path === '/ai/eval-events') return correctEval(state, body);
  if (method === 'POST' && path === '/knowledge/search') return searchFirmNotes(state, body);
  if (method === 'GET' && path === '/users') {
    return { ok: true, data: { users: listUsers(state) } };
  }

  if (method === 'POST' && path === '/users') {
    const beforeHash = stateDigest(state);
    const out = addUser(state, body, body.pin || '1234');
    if (!out.ok) return out;
    appendAuditEvent(state, {
      actorId: body.actorId || 'api',
      clientId: 'SELF',
      action: 'user.create',
      beforeHash,
      afterHash: stateDigest(state),
      metadata: { userId: out.user.userId, role: out.user.role },
    });
    return { ok: true, data: out.user };
  }

  if (method === 'POST' && path === '/users/verify-pin') {
    const user = findUser(state, body.userId);
    const verified = verifyUserPin(user, body.pin);
    if (!verified.ok) return verified;
    return { ok: true, data: verified.user };
  }

  if (method === 'GET' && path === '/audit-events') {
    return { ok: true, data: { auditEvents: state.auditEvents } };
  }

  if (method === 'POST' && path === '/audit-events') {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    return { ok: true, data: appendAuditEvent(state, { actorId: input.actorId, actorName: input.actorName, clientId: input.clientId, action: input.action, metadata: input.metadata }) };
  }

  const err = new Error('CA_API_ROUTE_NOT_FOUND');
  err.statusCode = 404;
  throw err;
}
