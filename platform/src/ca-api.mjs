import { createHash } from 'node:crypto';
import { journal, trialBalance } from './ledger.mjs';
import { createInvoice, createPurchase } from './invoice.mjs';

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
  });
}

export function ensureCaApiState(state) {
  state.documents = Array.isArray(state.documents) ? state.documents : [];
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
  const client = clients(state).find((row) => row.clientId === clientId);
  if (!client) {
    const err = new Error('CLIENT_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
  return client;
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
  requireClient(state, clientId);
  const beforeHash = stateDigest(state);
  const kind = String(body.type || body.kind || '').toLowerCase();
  const result = kind === 'purchase'
    ? createPurchase(state, body)
    : createInvoice(state, body);
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

  if (method === 'GET' && segments[0] === 'clients' && segments.length === 2) {
    return { ok: true, data: requireClient(state, segments[1]) };
  }

  if (method === 'GET' && segments[0] === 'clients' && segments[2] === 'ledger') {
    requireClient(state, segments[1]);
    return { ok: true, data: { clientId: segments[1], rows: journal(state.ledger) } };
  }

  if (method === 'GET' && segments[0] === 'clients' && segments[2] === 'trial-balance') {
    requireClient(state, segments[1]);
    return { ok: true, data: { clientId: segments[1], ...trialBalance(state.ledger) } };
  }

  if (method === 'POST' && segments[0] === 'clients' && segments[2] === 'vouchers') {
    return postVoucher(state, segments[1], body);
  }

  if (method === 'GET' && segments[0] === 'clients' && segments[2] === 'documents') {
    requireClient(state, segments[1]);
    return { ok: true, data: { documents: state.documents.filter((doc) => doc.clientId === segments[1]) } };
  }

  if (method === 'POST' && segments[0] === 'clients' && segments[2] === 'documents') {
    requireClient(state, segments[1]);
    const beforeHash = stateDigest(state);
    const { doc, content } = documentPayload(state, segments[1], body);
    state.documents.push(doc);
    state.files[doc.documentId] = content;
    const afterHash = stateDigest(state);
    appendAuditEvent(state, {
      actorId: body.actorId || 'api',
      clientId: segments[1],
      action: 'documents.upload',
      beforeHash,
      afterHash,
      metadata: { documentId: doc.documentId, kind: doc.kind },
    });
    return { ok: true, data: doc };
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
