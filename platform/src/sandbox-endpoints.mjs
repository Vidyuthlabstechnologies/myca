import { SANDBOX_ENDPOINTS } from './sandbox-catalog.mjs';

export const COVERED_BY_OPERATION = Object.freeze({
  'POST /gst/compliance/public/gstin/search': 'gstin_verify',
  'POST /gst/compliance/public/gstrs/track': 'gst_return_status',
  'POST /gst/compliance/tax-payer/otp': 'gst_taxpayer_generate_otp',
  'POST /gst/compliance/tax-payer/otp/verify': 'gst_taxpayer_verify_otp',
  'POST /gst/compliance/tax-payer/evc/otp': 'gst_evc_otp',
  'POST /gst/analytics/gstr-2b-reconciliation': 'gst_gstr2b_recon_submit',
  'GET /gst/compliance/tax-payer/gstrs/gstr-1/{year}/{month}': 'gst_gstr1_summary',
  'POST /gst/compliance/tax-payer/gstrs/gstr-1/{year}/{month}': 'gst_save_gstr1',
  'POST /gst/compliance/tax-payer/gstrs/gstr-1/{year}/{month}/file': 'gst_file_gstr1_evc',
  'POST /gst/compliance/tax-payer/gstrs/gstr-3b/{year}/{month}': 'gst_save_gstr3b',
  'GET /gst/compliance/tax-payer/gstrs/gstr-3b/{year}/{month}/auto-liability-calc': 'gst_gstr3b_liability',
  'POST /gst/compliance/tax-payer/gstrs/gstr-3b/{year}/{month}/offset-liability': 'gst_gstr3b_offset',
  'POST /gst/compliance/tax-payer/gstrs/gstr-3b/{year}/{month}/file': 'gst_file_gstr3b_evc',
  'GET /gst/compliance/tax-payer/gstrs/{year}/{month}/status': 'gst_gstr1_processing',
  'POST /gst/compliance/tax-payer/gstrs/{gstr}/{year}/{month}/new-proceed': 'gst_gstr1_proceed',
  'POST /tds/analytics/potential-notices': 'tds_analytics_job',
  'POST /tds/compliance/fvu/generate': 'tds_fvu_generate',
});

const ROUTED_ELSEWHERE = [
  { test: (path) => path.includes('/e-way-bill'), reason: 'E-way bills go through the e-way bill flow (eway-bill.mjs and its Quicko route), not the general catalogue.' },
  { test: (path) => path.startsWith('/gst/compliance/e-invoice/tax-payer'), reason: 'IRN generate, cancel and lookup go through govt_generate_irn and the e-invoice flow.' },
  { test: (path) => path === '/authenticate', reason: 'The client authenticates itself; this is never called as an operation.' },
];

const SESSION_PREFIXES = [
  ['/gst/compliance/tax-payer/', 'gst_taxpayer'],
  ['/itd/portal/tax-payer/', 'itd_taxpayer'],
  ['/it/compliance/portal/tax-payer/prefilled-json', 'itd_taxpayer'],
  ['/tds/compliance/traces/deductor/', 'traces_deductor'],
];

export const SESSION_OPENERS = Object.freeze({
  'POST /it/compliance/portal/tax-payer/authorize': 'itd_taxpayer',
  'POST /it/compliance/portal/tax-payer/aadhaar/otp/verify': 'itd_taxpayer',
  'POST /tds/traces/deductors/authenticate': 'traces_deductor',
  'POST /tds/traces/deductors/refresh': 'traces_deductor',
  'POST /gst/compliance/tax-payer/session/refresh': 'gst_taxpayer',
});

const SESSION_CLOSERS = Object.freeze({
  'POST /itd/portal/tax-payer/logout': 'itd_taxpayer',
  'POST /gst/compliance/tax-payer/logout': 'gst_taxpayer',
});

const FILES = new Set(['file', 'e-file', 'submit', 'proceed', 'new-proceed', 'offset-liability', 'payout', 'discard']);
const PORTAL_CHANGES = new Set(['reset', 'regenerate', 'cancel', 'save', 'credential', 'create', 'preference', 'verification-mode', 'logout']);

const OVERRIDES = Object.freeze({
  'POST /itd/portal/tax-payer/itrs/e-verify/otp': { kind: 'file', note: 'Verifies the ITR with the Aadhaar OTP; this is the e-verification.' },
  'POST /it/compliance/eri/tax-payers/{tax_payer_id}/itrs/e-verify/otp': { kind: 'otp', note: 'Sends the e-verification OTP to the taxpayer.' },
  'POST /it/compliance/eri/tax-payers/{tax_payer_id}/itrs/e-verify/otp/verify': { kind: 'file', note: 'Verifies the ITR with the OTP; this is the e-verification.' },
  'POST /itd/portal/public/tax-payer/itrs/e-verify/otp': { kind: 'file', note: 'Verifies the ITR with the OTP; this is the e-verification.' },
  'POST /itd/portal/public/tax-payer/itrs/e-verify': { kind: 'read', note: 'Reads whether a return is e-verified.' },
  'GET /bank/{ifsc}/accounts/{account_number}/verify': { kind: 'money', note: 'Penny-drop: sends one rupee to the account to check it.' },
  'POST /bank/virtual/accounts/{account_number}/payments/payin/upi/collect': { kind: 'money', note: 'Sends a UPI collect request to the payer.' },
  'POST /bank/virtual/accounts/{account_number}/payments/payout': { kind: 'money', note: 'Pays money out of the virtual account.' },
  'POST /bank/virtual/accounts/{account_number}/payments/payin/upi/generate-static-qr': { kind: 'prepare' },
  'POST /bank/virtual/accounts/{account_number}/payments/payin/upi/generate-dynamic-qr': { kind: 'prepare' },
  'POST /it/compliance/portal/public/tax-payment/challan': { kind: 'change', note: 'Creates a challan on the portal; nothing is paid until the taxpayer pays it.' },
  'POST /tds/compliance/e-file': { kind: 'file', note: 'Files the TDS or TCS return.' },
});

const KINDS = Object.freeze({
  read: { actionClass: 'read', mode: 'read', irreversible: false },
  prepare: { actionClass: 'read', mode: 'read_prepare', irreversible: false },
  otp: { actionClass: 'write', mode: 'auth', irreversible: true },
  login: { actionClass: 'write', mode: 'auth', irreversible: false },
  change: { actionClass: 'write', mode: 'write_prepare', irreversible: false },
  destroy: { actionClass: 'write', mode: 'write_prepare', irreversible: true },
  file: { actionClass: 'write', mode: 'file', irreversible: true },
  money: { actionClass: 'write', mode: 'write_government', irreversible: true },
});

function lastSegment(path) {
  return path.split('/').filter(Boolean).pop() || '';
}

function kindOf(endpoint) {
  const key = `${endpoint.method} ${endpoint.path}`;
  if (OVERRIDES[key]) return OVERRIDES[key].kind;
  if (endpoint.method === 'DELETE') return 'destroy';
  if (endpoint.method === 'PATCH' || endpoint.method === 'PUT') return 'change';
  const last = lastSegment(endpoint.path);
  if (endpoint.method === 'GET') return /\/otp$/.test(endpoint.path) ? 'otp' : 'read';
  if (last === 'otp' || last === 'generate-otp') return 'otp';
  if (SESSION_OPENERS[key] || last === 'verify-otp' || endpoint.path.endsWith('/otp/verify') || last === 'authorize' || last === 'authenticate' || last === 'refresh' || /\/sessions\/(init|create)$/.test(endpoint.path)) return 'login';
  if (FILES.has(last)) return 'file';
  if (last === 'reset') return 'destroy';
  if (PORTAL_CHANGES.has(last) && !endpoint.path.includes('/public/')) return 'change';
  if (endpoint.path.startsWith('/gst/compliance/tax-payer/') && /\{month\}$/.test(endpoint.path)) return 'change';
  return 'prepare';
}

function requirementOf(path) {
  if (path.startsWith('/gst/compliance/public/')) return 'REQ-CA-008';
  if (path.startsWith('/gst/')) return 'REQ-CA-006';
  if (path.startsWith('/tds/') || path.startsWith('/tcs/') || path.startsWith('/itd/reporting-portal/tds')) return 'REQ-CA-010';
  if (path.startsWith('/kyc/') || path.startsWith('/mca/') || /^\/bank\/\{ifsc\}/.test(path)) return 'REQ-CA-008';
  if (path.startsWith('/bank/')) return 'REQ-CA-002';
  return 'REQ-CA-009';
}

function familyOf(path) {
  if (path.startsWith('/gst/')) return 'gst';
  if (path.startsWith('/tds/') || path.startsWith('/tcs/') || path.startsWith('/itd/reporting-portal/tds')) return 'tds';
  if (path.startsWith('/kyc/') || path.startsWith('/mca/') || /^\/bank\/\{ifsc\}/.test(path)) return 'kyc';
  if (path.startsWith('/bank/')) return 'bank';
  if (/ocr|form-16|form-26as/.test(path)) return 'income_tax_ocr';
  if (/calculator|calculators/.test(path)) return 'income_tax_calculator';
  if (/report/.test(path)) return 'income_tax_report';
  return 'income_tax_compliance';
}

function sessionOf(path) {
  if (path.includes('/public/')) return 'platform';
  for (const [prefix, session] of SESSION_PREFIXES) if (path.startsWith(prefix)) return session;
  return 'platform';
}

function described(endpoint) {
  const key = `${endpoint.method} ${endpoint.path}`;
  const kind = kindOf(endpoint);
  const routed = ROUTED_ELSEWHERE.find((rule) => rule.test(endpoint.path));
  const covered = COVERED_BY_OPERATION[key] || null;
  return Object.freeze({
    ...endpoint,
    key,
    kind,
    ...KINDS[kind],
    family: familyOf(endpoint.path),
    requirementId: requirementOf(endpoint.path),
    session: sessionOf(endpoint.path),
    opensSession: SESSION_OPENERS[key] || null,
    closesSession: SESSION_CLOSERS[key] || null,
    needsConsent: endpoint.bodyRequired.includes('consent') || endpoint.query.some((q) => q.name === 'consent'),
    job: /\bjob\b|\/jobs?(\/|$)/i.test(`${endpoint.title} ${endpoint.path}`) || endpoint.query.some((q) => q.name === 'job_id'),
    note: OVERRIDES[key]?.note || '',
    coveredBy: covered,
    routedElsewhere: routed ? routed.reason : '',
    docsUrl: `https://developer.sandbox.co.in/${endpoint.spec}`,
  });
}

const FAMILY_LABELS = Object.freeze({
  gst: 'GST',
  tds: 'TDS',
  kyc: 'KYC',
  bank: 'bank',
  income_tax_ocr: 'income tax document reader',
  income_tax_calculator: 'income tax calculator',
  income_tax_report: 'income tax report',
  income_tax_compliance: 'income tax portal',
});

const TITLE_COUNTS = SANDBOX_ENDPOINTS.reduce((counts, endpoint) => counts.set(endpoint.title, (counts.get(endpoint.title) || 0) + 1), new Map());

function sentenceOf(endpoint, family) {
  const where = endpoint.path.replace(/\/\{[^}]+\}/g, '').replace(/^\//, '').replace(/_/g, ' ');
  const title = endpoint.title.startsWith('/') ? `${endpoint.method === 'GET' ? 'Read' : 'Send'} ${where}` : endpoint.title.replace(/_/g, ' ');
  const plain = TITLE_COUNTS.get(endpoint.title) > 1 && !endpoint.title.startsWith('/') ? `${title} (${endpoint.method === 'GET' ? 'read' : 'send'} ${where})` : title;
  return `Quicko ${FAMILY_LABELS[family]}: ${plain}`;
}

export const QUICKO_ENDPOINTS = Object.freeze(SANDBOX_ENDPOINTS.map(described).map((endpoint) => Object.freeze({ ...endpoint, sentence: sentenceOf(endpoint, endpoint.family) })));

export const QUICKO_OPERATIONS = Object.freeze(QUICKO_ENDPOINTS.filter((endpoint) => !endpoint.coveredBy && !endpoint.routedElsewhere));

const BY_ID = new Map(QUICKO_ENDPOINTS.map((endpoint) => [endpoint.id, endpoint]));

export function quickoEndpoint(id) {
  return BY_ID.get(String(id || '').trim()) || null;
}

export function quickoOperation(id) {
  const endpoint = quickoEndpoint(id);
  return endpoint && !endpoint.coveredBy && !endpoint.routedElsewhere ? endpoint : null;
}

function publicEndpoint(endpoint) {
  return {
    operationId: endpoint.id,
    title: endpoint.title,
    method: endpoint.method,
    path: endpoint.path,
    family: endpoint.family,
    requirementId: endpoint.requirementId,
    actionClass: endpoint.actionClass,
    mode: endpoint.mode,
    irreversible: endpoint.irreversible,
    caApprovalRequired: endpoint.actionClass === 'write',
    session: endpoint.session,
    pathParams: endpoint.pathParams,
    query: endpoint.query,
    body: endpoint.body,
    bodyRequired: endpoint.bodyRequired,
    entity: endpoint.entity,
    needsConsent: endpoint.needsConsent,
    job: endpoint.job,
    note: endpoint.note,
    ...(endpoint.coveredBy ? { useOperation: endpoint.coveredBy } : {}),
    ...(endpoint.routedElsewhere ? { routedElsewhere: endpoint.routedElsewhere } : {}),
    docsUrl: endpoint.docsUrl,
  };
}

export function quickoCatalog({ family = '', search = '', operationId = '', limit = 50 } = {}) {
  const words = String(search || '').toLowerCase().split(/\s+/).filter(Boolean);
  let list = QUICKO_ENDPOINTS;
  if (operationId) list = list.filter((endpoint) => endpoint.id === operationId);
  if (family) list = list.filter((endpoint) => endpoint.family === family);
  if (words.length) list = list.filter((endpoint) => words.every((word) => `${endpoint.id} ${endpoint.title} ${endpoint.path}`.toLowerCase().includes(word)));
  const families = {};
  for (const endpoint of QUICKO_ENDPOINTS) families[endpoint.family] = (families[endpoint.family] || 0) + 1;
  const cap = Math.max(1, Math.min(400, Number(limit) || 50));
  return {
    total: QUICKO_ENDPOINTS.length,
    callable: QUICKO_OPERATIONS.length,
    families,
    matched: list.length,
    endpoints: list.slice(0, cap).map(publicEndpoint),
    howToCall: 'Run sandbox_operation with this operationId and params { path, query, body }. Upload a PDF with /api/upload and pass params.documentSha256 for a file field. For a job, pass params.jobInput (JSON) or params.jobInputSha256 and MyCA uploads it to the job URL; poll with the GET operation and params.fetchOutput true.',
  };
}
