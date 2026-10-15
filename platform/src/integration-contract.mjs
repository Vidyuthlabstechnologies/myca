export const CA_API_REQUIREMENTS = [
  {
    requirementId: 'REQ-CA-001',
    id: 'client_master',
    priority: 'must_have',
    title: 'Client master',
    purpose: 'Know who the firm serves and which statutory workflows apply.',
    direction: 'read',
    endpoints: ['GET /clients', 'GET /clients/{clientId}'],
    requiredFields: ['clientId', 'name', 'pan', 'gstin', 'entityType', 'state', 'turnover', 'gstFrequency', 'auditRequired'],
  },
  {
    requirementId: 'REQ-CA-002',
    id: 'books_ledger',
    priority: 'must_have',
    title: 'Books and ledger',
    purpose: 'Read and post invoices, purchases, receipts, payments, journals, and trial balance.',
    direction: 'read_write',
    endpoints: ['GET /clients/{clientId}/ledger', 'POST /clients/{clientId}/vouchers', 'GET /clients/{clientId}/trial-balance'],
    requiredFields: ['voucherId', 'date', 'type', 'partyName', 'amount', 'debitAccount', 'creditAccount', 'source'],
  },
  {
    requirementId: 'REQ-CA-003',
    id: 'documents',
    priority: 'must_have',
    title: 'Document upload',
    purpose: 'Bring Tally, bank, GST, AIS/26AS, and audit files into the same client workspace.',
    direction: 'read_write',
    endpoints: ['POST /clients/{clientId}/documents', 'GET /clients/{clientId}/documents'],
    requiredFields: ['documentId', 'clientId', 'kind', 'fileName', 'contentType', 'uploadedAt'],
  },
  {
    requirementId: 'REQ-CA-004',
    id: 'firm_users',
    priority: 'must_have',
    title: 'Firm users and roles',
    purpose: 'Enforce client access, maker-checker flows, and CA reviewer permissions.',
    direction: 'read',
    endpoints: ['GET /users', 'GET /clients/{clientId}/access'],
    requiredFields: ['userId', 'name', 'role', 'clientIds'],
  },
  {
    requirementId: 'REQ-CA-005',
    id: 'audit_log',
    priority: 'must_have',
    title: 'Append-only audit log',
    purpose: 'Record tool runs, state changes, approvals, and filing handoffs.',
    direction: 'write',
    endpoints: ['POST /audit-events', 'GET /clients/{clientId}/audit-events'],
    requiredFields: ['eventId', 'actorId', 'clientId', 'action', 'at', 'beforeHash', 'afterHash'],
  },
  {
    requirementId: 'REQ-CA-006',
    id: 'gsp_gstn',
    priority: 'gst',
    title: 'GSTN through licensed GSP',
    purpose: 'Authenticate, upload returns, read filing status, and reconcile portal ledgers.',
    direction: 'read_write',
    endpoints: ['POST /gst/auth', 'POST /gst/gstr1', 'POST /gst/gstr3b', 'GET /gst/returns/status'],
    requiredFields: ['gstin', 'period', 'returnType', 'status', 'acknowledgement'],
  },
  {
    requirementId: 'REQ-CA-007',
    id: 'nic_einvoice',
    priority: 'gst',
    title: 'NIC e-invoice',
    purpose: 'Generate, cancel, and check IRN/e-way bill status for eligible invoices.',
    direction: 'read_write',
    endpoints: ['POST /einvoice/auth', 'POST /einvoice/irn', 'GET /einvoice/irn/{irn}'],
    requiredFields: ['gstin', 'invoiceId', 'irn', 'ackNo', 'ackDate', 'signedQrCode'],
  },
  {
    requirementId: 'REQ-CA-008',
    id: 'gstin_status',
    priority: 'gst',
    title: 'GSTIN validation and status',
    purpose: 'Verify legal name, registration state, active/cancelled status, and composition status.',
    direction: 'read',
    endpoints: ['GET /gstin/{gstin}'],
    requiredFields: ['gstin', 'legalName', 'state', 'status', 'taxpayerType'],
  },
  {
    requirementId: 'REQ-CA-009',
    id: 'ais_26as',
    priority: 'income_tax',
    title: 'AIS and Form 26AS',
    purpose: 'Compare reported income and TDS credit with return-prep data.',
    direction: 'read',
    endpoints: ['POST /income-tax/ais/import', 'POST /income-tax/26as/import'],
    requiredFields: ['pan', 'fy', 'incomeType', 'amount', 'tdsAmount', 'source'],
  },
  {
    requirementId: 'REQ-CA-010',
    id: 'tds_returns',
    priority: 'income_tax',
    title: 'TDS returns and challans',
    purpose: 'Prepare deductee rows, challan mapping, and 194 section threshold checks.',
    direction: 'read_write',
    endpoints: ['GET /tds/payments', 'POST /tds/returns', 'GET /tds/challans'],
    requiredFields: ['deducteePan', 'section', 'paymentDate', 'amount', 'tds', 'challanId'],
  },
  {
    requirementId: 'REQ-CA-011',
    id: 'task_deadline',
    priority: 'practice',
    title: 'Tasks and deadlines',
    purpose: 'Assign filing/audit work, track due dates, and escalate overdue compliance.',
    direction: 'read_write',
    endpoints: ['GET /tasks', 'POST /tasks', 'PATCH /tasks/{taskId}'],
    requiredFields: ['taskId', 'clientId', 'returnType', 'period', 'dueDate', 'status', 'assigneeId'],
  },
  {
    requirementId: 'REQ-CA-012',
    id: 'client_chase',
    priority: 'practice',
    title: 'Client document chase',
    purpose: 'Request missing files from clients and track collection status.',
    direction: 'read_write',
    endpoints: ['POST /document-requests', 'GET /document-requests'],
    requiredFields: ['requestId', 'clientId', 'documentKind', 'status', 'requestedAt', 'receivedAt'],
  },
  {
    requirementId: 'REQ-CA-013',
    id: 'notifications',
    priority: 'practice',
    title: 'Notifications',
    purpose: 'Send client reminders and internal reviewer alerts over approved channels.',
    direction: 'write',
    endpoints: ['POST /notifications/email', 'POST /notifications/whatsapp', 'POST /notifications/sms'],
    requiredFields: ['recipient', 'channel', 'templateId', 'clientId', 'sentAt'],
  },
  {
    requirementId: 'REQ-CA-014',
    id: 'knowledge_base',
    priority: 'ai',
    title: 'Firm knowledge base',
    purpose: 'Ground assistant answers in firm SOPs, prior positions, working papers, and engagement notes.',
    direction: 'read',
    endpoints: ['GET /knowledge/search', 'GET /clients/{clientId}/notes'],
    requiredFields: ['documentId', 'title', 'source', 'updatedAt', 'excerpt'],
  },
  {
    requirementId: 'REQ-CA-015',
    id: 'eval_logs',
    priority: 'ai',
    title: 'Eval and correction logs',
    purpose: 'Store prompts, tool calls, reviewer corrections, and failure cases for quality improvement.',
    direction: 'write',
    endpoints: ['POST /ai/eval-events', 'GET /ai/eval-events'],
    requiredFields: ['eventId', 'scenario', 'input', 'toolName', 'outcome', 'reviewerCorrection'],
  },
];

const STATUS_AVAILABLE = new Set(['available', 'connected']);

export function findRequirement(ref) {
  const key = String(ref || '').trim();
  if (!key) return null;
  return CA_API_REQUIREMENTS.find((req) => req.requirementId === key || req.id === key) || null;
}

export function normalizeIntegrationConnections(connections = {}) {
  const rows = Object.entries(connections || {});
  const out = {};
  for (const [rawId, rawConnection] of rows) {
    const req = findRequirement(rawId) || findRequirement(rawConnection?.requirementId) || findRequirement(rawConnection?.id);
    if (!req) continue;
    const status = rawConnection?.status || (rawConnection ? 'connected' : 'missing');
    if (!STATUS_AVAILABLE.has(status)) continue;
    out[req.requirementId] = {
      requirementId: req.requirementId,
      id: req.id,
      status: 'connected',
      provider: String(rawConnection?.provider || '').trim(),
      baseUrl: String(rawConnection?.baseUrl || '').trim(),
      notes: String(rawConnection?.notes || '').trim(),
      updatedAt: rawConnection?.updatedAt || null,
    };
  }
  return out;
}

function availableFrom(input = []) {
  if (Array.isArray(input)) {
    return {
      availableSet: new Set(input.map((id) => String(id).trim()).filter(Boolean)),
      connections: {},
    };
  }
  const connections = normalizeIntegrationConnections(input);
  return {
    availableSet: new Set(Object.keys(connections)),
    connections,
  };
}

export const BUILT_IN_REQUIREMENTS = Object.freeze({
  task_deadline: 'deadlines, reminders with an assignee, the week ahead and the daily automation',
  client_chase: 'request_documents, record_document_received and document_requests, with the message drafted for the outbox',
  notifications: 'the outbox with the email relay, WhatsApp and SMS senders behind the live switch',
  knowledge_base: 'search_firm_notes over questions to the CA, reminders, document requests, supplier reminders, documents and corrections',
  eval_logs: 'eval_events and correct_eval, logged on every chat message',
});

export function integrationReadiness(available = []) {
  const { availableSet, connections } = availableFrom(available);
  const rows = CA_API_REQUIREMENTS.map((req) => ({
    ...req,
    status: availableSet.has(req.id) || availableSet.has(req.requirementId) ? 'available' : Object.hasOwn(BUILT_IN_REQUIREMENTS, req.id) ? 'built-in' : 'missing',
    connection: connections[req.requirementId] || (Object.hasOwn(BUILT_IN_REQUIREMENTS, req.id) ? { provider: 'MyCA', builtIn: true, notes: BUILT_IN_REQUIREMENTS[req.id] } : null),
  }));
  const missing = rows.filter((row) => row.status === 'missing');
  const availableRows = rows.filter((row) => row.status === 'available');
  const byPriority = rows.reduce((acc, row) => {
    acc[row.priority] = acc[row.priority] || { total: 0, available: 0, missing: 0 };
    acc[row.priority].total += 1;
    acc[row.priority][row.status] += 1;
    return acc;
  }, {});
  const mustHaveMissing = missing.filter((row) => row.priority === 'must_have');
  return {
    ok: mustHaveMissing.length === 0,
    total: rows.length,
    available: availableRows.length,
    missing: missing.length,
    mustHaveMissing: mustHaveMissing.map((row) => row.requirementId),
    missingRequirementIds: missing.map((row) => row.requirementId),
    availableRequirementIds: availableRows.map((row) => row.requirementId),
    next: mustHaveMissing.length
      ? 'Connect must-have APIs first: client master, books/ledger, documents, firm users, and audit log.'
      : 'Must-have APIs are covered. Next priority is GSTN/GSP and NIC e-invoice integration.',
    byPriority,
    rows,
  };
}

export function setIntegrationConnection(state, args = {}) {
  const req = findRequirement(args.requirementId || args.id);
  if (!req) return { ok: false, error: 'UNKNOWN_REQUIREMENT' };
  const provider = String(args.provider || '').trim();
  if (!provider) return { ok: false, error: 'PROVIDER_REQUIRED' };
  state.integrationConnections = normalizeIntegrationConnections(state.integrationConnections);
  const connection = {
    requirementId: req.requirementId,
    id: req.id,
    status: 'connected',
    provider,
    baseUrl: String(args.baseUrl || '').trim(),
    notes: String(args.notes || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  state.integrationConnections[req.requirementId] = connection;
  return {
    ok: true,
    connection,
    readiness: integrationReadiness(state.integrationConnections),
  };
}

export function clearIntegrationConnection(state, args = {}) {
  const req = findRequirement(args.requirementId || args.id);
  if (!req) return { ok: false, error: 'UNKNOWN_REQUIREMENT' };
  state.integrationConnections = normalizeIntegrationConnections(state.integrationConnections);
  delete state.integrationConnections[req.requirementId];
  return {
    ok: true,
    requirementId: req.requirementId,
    readiness: integrationReadiness(state.integrationConnections),
  };
}
