import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performExternalAction } from '../../action-gate.mjs';
import { appendAuditEvent } from '../../ca-api.mjs';
import { rules } from '../../sprint-load.mjs';
import { loadEnvFile, mockModeEnabled, providerEnvironment } from '../../runtime-config.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { submissionEntry } from './myinvois-document.mjs';
import { signMyInvoisDocument } from './myinvois-sign.mjs';
import { submitMyInvoisDocuments, myInvoisSubmission, cancelMyInvoisDocument, validateMyTin, myInvoisShareLink, myInvoisDocumentDetails, myInvoisRecentDocuments, rejectMyInvoisDocument } from './myinvois-client.mjs';
import { myInvoisSandbox, MYINVOIS_SANDBOX_CLIENT, receiveSandboxDocument } from './myinvois-sandbox.mjs';

const UID = /^[A-Z0-9]{26}$/;
const HOUR_MS = 3600000;
const LHDN_ERRORS = Object.freeze({
  OperationPeriodOver: 'WINDOW_CLOSED',
  IncorrectState: 'EINVOICE_WRONG_STATE',
  ActiveReferencingDocuments: 'EINVOICE_HAS_ACTIVE_NOTES',
  Forbidden: 'EINVOICE_NOT_YOURS',
  DuplicateSubmission: 'DUPLICATE_SUBMISSION',
  IncorrectSubmitter: 'INCORRECT_SUBMITTER',
  MaximumSizeExceeded: 'SUBMISSION_TOO_LARGE_OR_EMPTY',
  BadStructure: 'SUBMISSION_BAD_STRUCTURE',
  NotFound: 'EINVOICE_NOT_FOUND',
});

function setting(name) {
  const env = loadEnvFile();
  return String(process.env[name] ?? env[name] ?? '').trim();
}

function actorOf(args) {
  return { userId: String(args.actorId || 'owner'), role: String(args.role || '') };
}

function mockUid(seed) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const hash = createHash('sha256').update(String(seed)).digest();
  return Array.from({ length: 26 }, (_, index) => alphabet[hash[index] % 32]).join('');
}

export function myInvoisMode() {
  if (mockModeEnabled()) return 'mock';
  const environment = providerEnvironment();
  if (environment !== 'live' && !setting('MYCA_MYINVOIS_CLIENT_ID')) return 'sandbox';
  return environment;
}

function profileTin(state) {
  const saved = countrySlice(state, 'myEinvoiceProfile');
  return saved && saved.supplier ? String(saved.supplier.tin || '') : '';
}

export function myInvoisConfig(transport, state = null) {
  if (myInvoisMode() === 'sandbox') {
    return { environment: 'test', clientId: MYINVOIS_SANDBOX_CLIENT.clientId, clientSecret: MYINVOIS_SANDBOX_CLIENT.clientSecret, onBehalfOf: state ? profileTin(state) : '', transport };
  }
  return {
    environment: providerEnvironment(),
    clientId: setting('MYCA_MYINVOIS_CLIENT_ID'),
    clientSecret: setting('MYCA_MYINVOIS_CLIENT_SECRET'),
    onBehalfOf: setting('MYCA_MYINVOIS_ON_BEHALF_OF'),
    transport,
  };
}

function signingMaterial() {
  const certPath = setting('MYCA_MYINVOIS_CERT_PATH');
  const keyPath = setting('MYCA_MYINVOIS_KEY_PATH');
  if (!certPath || !keyPath) return null;
  return { certificatePem: readFileSync(certPath, 'utf8'), privateKeyPem: readFileSync(keyPath, 'utf8'), passphrase: setting('MYCA_MYINVOIS_KEY_PASSPHRASE') || undefined };
}

function currentEnvironment() {
  const mode = myInvoisMode();
  return mode === 'mock' ? 'mock' : mode === 'sandbox' ? 'sandbox' : providerEnvironment();
}

function einvoices(state) {
  return openCountrySlice(state, 'myEinvoices', () => ({ byNumber: {} }));
}

function received(state) {
  return openCountrySlice(state, 'myReceivedEinvoices', () => ({ byUuid: {} }));
}

function workflowRule() {
  const found = rules.rule('my.einvoice.workflow', new Date().toISOString().slice(0, 10));
  return found.ok ? found.record.value : null;
}

function gate(state, request, args) {
  const sandbox = myInvoisMode() === 'sandbox';
  return performExternalAction(state, {
    clientId: String(state.activeClientId || 'SELF'),
    actor: actorOf(args),
    ...request,
    ...(sandbox ? { simulator: myInvoisSandbox(state) } : {}),
  }, request.execute);
}

function lhdnCode(out) {
  return out?.lhdn?.error?.errorCode || '';
}

function lhdnFailure(out, fallback) {
  const code = lhdnCode(out);
  if (!code) return out;
  const mapped = LHDN_ERRORS[code] || fallback || out.error;
  return { ...out, error: mapped, lhdnCode: code, why: out.lhdn.error.error || '' };
}

function shareLink(uuid, longId) {
  const mode = myInvoisMode();
  return myInvoisShareLink(mode === 'live' ? 'live' : 'test', uuid, longId);
}

function partyFacts(party) {
  return party ? { name: String(party.name || ''), tin: String(party.tin || '') } : null;
}

export async function submitMyInvois(state, args) {
  const number = String(args.number);
  const existing = countrySlice(state, 'myEinvoices').byNumber?.[number];
  if (existing && existing.environment === currentEnvironment() && !['rejected', 'cancelled', 'invalid'].includes(existing.status)) return { ok: false, error: 'EINVOICE_ALREADY_SENT', number, uuid: existing.uuid, status: existing.status };
  const mode = myInvoisMode();
  const material = signingMaterial();
  let document = args.document;
  if (material) {
    const signed = signMyInvoisDocument(document, material);
    if (!signed.ok) return signed;
    document = signed.document;
  } else if (mode === 'test' || mode === 'live') {
    return { ok: false, error: 'SIGNING_CERTIFICATE_MISSING', settings: ['MYCA_MYINVOIS_CERT_PATH', 'MYCA_MYINVOIS_KEY_PATH'], hint: 'MyInvois v1.1 needs a digital certificate from a Malaysian certification authority such as MSC Trustgate or Pos Digicert.' };
  }
  const entry = submissionEntry(document, number);
  const out = await gate(state, {
    actionId: 'myinvois_submit',
    params: { number, documentHash: entry.documentHash, payable: args.totals.payable },
    approvalId: args.approvalId,
    metadata: { number, kind: args.kind || 'invoice' },
    fixture: () => ({ ok: true, mock: true, data: { submissionUid: mockUid(`s${entry.documentHash}`), acceptedDocuments: [{ uuid: mockUid(entry.documentHash), invoiceCodeNumber: number }], rejectedDocuments: [] } }),
    execute: async (transports) => submitMyInvoisDocuments(myInvoisConfig(transports.https.request, state), { documents: [{ document, codeNumber: number }], approvalId: args.approvalId }),
  }, args);
  if (!out.ok) return lhdnFailure(out);
  const accepted = (out.data.acceptedDocuments || []).find((doc) => doc.invoiceCodeNumber === number);
  const rejected = (out.data.rejectedDocuments || []).find((doc) => doc.invoiceCodeNumber === number);
  const record = {
    number,
    kind: args.kind || 'invoice',
    type: args.type || 'invoice',
    submissionUid: out.data.submissionUid || '',
    uuid: accepted ? accepted.uuid : '',
    status: accepted ? 'submitted' : 'rejected',
    error: rejected ? rejected.error : null,
    documentHash: entry.documentHash,
    totals: args.totals,
    issueDate: args.issueDate || '',
    buyer: partyFacts(args.buyer),
    supplier: partyFacts(args.supplier),
    ...(args.period ? { period: args.period } : {}),
    ...(args.original && args.original.uuid ? { original: { uuid: String(args.original.uuid), number: String(args.original.number || '') } } : {}),
    signed: Boolean(material),
    environment: out.mock ? 'mock' : out.simulated ? 'sandbox' : providerEnvironment(),
    at: new Date().toISOString(),
  };
  einvoices(state).byNumber[number] = record;
  appendAuditEvent(state, { action: 'my_einvoice_submitted', actorId: actorOf(args).userId, metadata: { number, kind: record.kind, uuid: record.uuid, submissionUid: record.submissionUid, status: record.status, environment: record.environment } });
  return { ok: Boolean(accepted), ...(accepted ? {} : { error: 'EINVOICE_REJECTED', lhdn: rejected ? rejected.error : null }), mock: Boolean(out.mock), simulated: Boolean(out.simulated), data: record, hint: 'LHDN validates asynchronously; ask my_einvoice_status with the submission UID.' };
}

function applyStatus(state, doc, args) {
  const book = countrySlice(state, 'myEinvoices').byNumber || {};
  const record = book[doc.number];
  const status = String(doc.status || '').toLowerCase();
  if (!record || record.uuid !== doc.uuid || !status) return;
  const unchanged = record.status === status && (!doc.link || record.link === doc.link) && (!doc.validatedAt || record.validatedAt === doc.validatedAt);
  if (unchanged) return;
  const saved = einvoices(state).byNumber[doc.number];
  const before = saved.status;
  saved.status = status;
  if (doc.link) saved.link = doc.link;
  if (doc.longId) saved.longId = doc.longId;
  if (doc.validatedAt) saved.validatedAt = doc.validatedAt;
  if (doc.errors && doc.errors.length) saved.errors = doc.errors;
  if (before !== status) appendAuditEvent(state, { action: 'my_einvoice_status_changed', actorId: actorOf(args).userId, metadata: { number: doc.number, uuid: doc.uuid, before, after: status } });
}

export async function readMyInvoisSubmission(state, args) {
  const submissionUid = String(args.submissionUid || '').trim();
  if (!UID.test(submissionUid)) return { ok: false, error: 'BAD_SUBMISSION_UID' };
  const out = await gate(state, {
    actionId: 'myinvois_status',
    params: { submissionUid },
    fixture: () => ({ ok: true, mock: true, data: { submissionUid, overallStatus: 'Valid', documentSummary: [] } }),
    execute: async (transports) => myInvoisSubmission(myInvoisConfig(transports.https.request, state), { submissionUid }),
  }, args);
  if (!out.ok) return lhdnFailure(out);
  const documents = (out.data.documentSummary || []).map((doc) => ({ uuid: doc.uuid, number: doc.internalId, status: doc.status, longId: doc.longId || '', validatedAt: doc.dateTimeValidated || '', link: doc.longId ? shareLink(doc.uuid, doc.longId) : '' }));
  for (const doc of documents) applyStatus(state, doc, args);
  return { ok: true, mock: Boolean(out.mock), simulated: Boolean(out.simulated), data: { submissionUid, overallStatus: out.data.overallStatus, documents } };
}

export async function readMyInvoisDocument(state, args) {
  const uuid = String(args.uuid || '').trim();
  if (!UID.test(uuid)) return { ok: false, error: 'BAD_DOCUMENT_UUID' };
  const out = await gate(state, {
    actionId: 'myinvois_details',
    params: { uuid },
    fixture: () => ({ ok: true, mock: true, data: { uuid, status: 'Valid', validationResults: { status: 'Valid', validationSteps: [] } } }),
    execute: async (transports) => myInvoisDocumentDetails(myInvoisConfig(transports.https.request, state), { uuid }),
  }, args);
  if (!out.ok) return lhdnFailure(out);
  const doc = out.data;
  const errors = (doc.validationResults?.validationSteps || []).filter((entry) => entry.status === 'Invalid').flatMap((entry) => (entry.error?.innerError?.length ? entry.error.innerError : [entry.error]).filter(Boolean).map((error) => ({ step: entry.name, code: error.errorCode, why: error.error, path: error.propertyPath || '' })));
  const link = doc.longId ? shareLink(uuid, doc.longId) : '';
  if (doc.internalId) applyStatus(state, { uuid, number: doc.internalId, status: doc.status, longId: doc.longId, validatedAt: doc.dateTimeValidated || '', link, errors }, args);
  return {
    ok: true,
    mock: Boolean(out.mock),
    simulated: Boolean(out.simulated),
    data: {
      uuid,
      number: doc.internalId || '',
      type: doc.typeName || '',
      status: doc.status,
      issuer: { tin: doc.issuerTin || '', name: doc.issuerName || '' },
      receiver: { tin: doc.receiverId || '', name: doc.receiverName || '' },
      issuedAt: doc.dateTimeIssued || '',
      validatedAt: doc.dateTimeValidated || '',
      totalPayable: doc.totalPayableAmount ?? null,
      cancelledAt: doc.cancelDateTime || '',
      rejectionRequestedAt: doc.rejectRequestDateTime || '',
      reason: doc.documentStatusReason || '',
      link,
      errors,
      ...(doc.sandboxNotes ? { sandboxNotes: doc.sandboxNotes } : {}),
    },
  };
}

function windowOpen(record, hours) {
  if (!record || !record.validatedAt) return true;
  const validated = Date.parse(record.validatedAt);
  return !Number.isFinite(validated) || Date.now() - validated <= hours * HOUR_MS;
}

export async function cancelMyInvois(state, args) {
  const uuid = String(args.uuid || '').trim();
  const reason = String(args.reason || '').trim();
  if (!UID.test(uuid)) return { ok: false, error: 'BAD_DOCUMENT_UUID' };
  if (!reason) return { ok: false, error: 'CANCEL_REASON_REQUIRED' };
  const limits = workflowRule();
  if (limits && reason.length > limits.maxReasonCharacters) return { ok: false, error: 'CANCEL_REASON_REQUIRED', hint: `At most ${limits.maxReasonCharacters} characters.` };
  const known = Object.values(countrySlice(state, 'myEinvoices').byNumber || {}).find((row) => row.uuid === uuid);
  if (known && known.status === 'cancelled') return { ok: false, error: 'EINVOICE_WRONG_STATE', status: 'cancelled', why: 'This e-invoice is already cancelled.' };
  if (known && limits && !windowOpen(known, limits.cancelWithinHours)) return { ok: false, error: 'WINDOW_CLOSED', why: `LHDN allows a cancellation only within ${limits.cancelWithinHours} hours of validation (validated ${known.validatedAt}).`, hint: 'Issue a credit note (issue_my_einvoice with type credit-note and original.uuid) instead.' };
  const out = await gate(state, {
    actionId: 'myinvois_cancel',
    params: { uuid, reason },
    approvalId: args.approvalId,
    fixture: () => ({ ok: true, mock: true, data: { uuid, status: 'Cancelled' } }),
    execute: async (transports) => cancelMyInvoisDocument(myInvoisConfig(transports.https.request, state), { uuid, reason, approvalId: args.approvalId }),
  }, args);
  if (!out.ok) {
    const failed = lhdnFailure(out);
    return failed.error === 'WINDOW_CLOSED' ? { ...failed, hint: 'Issue a credit note (issue_my_einvoice with type credit-note and original.uuid) instead.' } : failed;
  }
  const record = Object.values(einvoices(state).byNumber).find((row) => row.uuid === uuid);
  if (record) {
    record.status = 'cancelled';
    record.cancelledAt = new Date().toISOString();
    record.cancelReason = reason;
  }
  appendAuditEvent(state, { action: 'my_einvoice_cancelled', actorId: actorOf(args).userId, metadata: { uuid, number: record ? record.number : '', reason } });
  return { ok: true, mock: Boolean(out.mock), simulated: Boolean(out.simulated), data: { uuid, number: record ? record.number : '', status: 'cancelled' } };
}

export async function rejectMyInvois(state, args) {
  const uuid = String(args.uuid || '').trim();
  const reason = String(args.reason || '').trim();
  if (!UID.test(uuid)) return { ok: false, error: 'BAD_DOCUMENT_UUID' };
  if (!reason) return { ok: false, error: 'REJECT_REASON_REQUIRED' };
  const limits = workflowRule();
  if (limits && reason.length > limits.maxReasonCharacters) return { ok: false, error: 'REJECT_REASON_REQUIRED', hint: `At most ${limits.maxReasonCharacters} characters.` };
  if (Object.values(countrySlice(state, 'myEinvoices').byNumber || {}).some((row) => row.uuid === uuid)) return { ok: false, error: 'EINVOICE_NOT_YOURS', why: 'This is an e-invoice you issued; cancel it with cancel_my_einvoice instead of rejecting it.' };
  const already = countrySlice(state, 'myReceivedEinvoices').byUuid?.[uuid];
  if (already && already.status === 'rejection requested') return { ok: false, error: 'EINVOICE_WRONG_STATE', why: 'A rejection was already requested; a document can be rejected only once.' };
  const out = await gate(state, {
    actionId: 'myinvois_reject',
    params: { uuid, reason },
    approvalId: args.approvalId,
    fixture: () => ({ ok: true, mock: true, data: { uuid, status: 'Requested for Rejection' } }),
    execute: async (transports) => rejectMyInvoisDocument(myInvoisConfig(transports.https.request, state), { uuid, reason, approvalId: args.approvalId }),
  }, args);
  if (!out.ok) {
    const failed = lhdnFailure(out);
    return failed.error === 'WINDOW_CLOSED' ? { ...failed, hint: 'Ask the supplier to issue a credit note instead.' } : failed;
  }
  const row = received(state).byUuid[uuid] || { uuid };
  row.status = 'rejection requested';
  row.reason = reason;
  row.rejectedAt = new Date().toISOString();
  received(state).byUuid[uuid] = row;
  appendAuditEvent(state, { action: 'my_einvoice_rejected', actorId: actorOf(args).userId, metadata: { uuid, reason } });
  return { ok: true, mock: Boolean(out.mock), simulated: Boolean(out.simulated), data: { uuid, status: 'rejection requested', note: 'The e-invoice stays valid until the supplier cancels it.' } };
}

export async function listReceivedMyInvois(state, args = {}) {
  const pageNo = args.pageNo === undefined ? 1 : Number(args.pageNo);
  const pageSize = args.pageSize === undefined ? 50 : Number(args.pageSize);
  if (!(Number.isInteger(pageNo) && pageNo >= 1)) return { ok: false, error: 'BAD_PAGE', hint: 'pageNo is a whole number from 1.' };
  if (!(Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 100)) return { ok: false, error: 'BAD_PAGE', hint: 'pageSize is a whole number from 1 to 100.' };
  const out = await gate(state, {
    actionId: 'myinvois_recent',
    params: { direction: 'Received', pageNo, pageSize },
    fixture: () => ({ ok: true, mock: true, data: { result: [], metadata: { totalPages: 1, totalCount: 0 } } }),
    execute: async (transports) => myInvoisRecentDocuments(myInvoisConfig(transports.https.request, state), { direction: 'Received', pageNo, pageSize }),
  }, args);
  if (!out.ok) return lhdnFailure(out);
  const local = countrySlice(state, 'myReceivedEinvoices').byUuid || {};
  const documents = (out.data.result || []).map((doc) => ({
    uuid: doc.uuid,
    number: doc.internalId,
    type: doc.typeName,
    supplier: { tin: doc.issuerTin, name: doc.issuerName },
    issuedAt: doc.dateTimeIssued,
    validatedAt: doc.dateTimeValidated,
    totalPayable: doc.totalPayableAmount,
    status: doc.rejectRequestDateTime ? 'rejection requested' : String(doc.status || '').toLowerCase(),
    rejectableUntil: doc.dateTimeValidated && !doc.rejectRequestDateTime && doc.status === 'Valid' && workflowRule() ? new Date(Date.parse(doc.dateTimeValidated) + workflowRule().rejectWithinHours * HOUR_MS).toISOString() : '',
    ...(local[doc.uuid] ? { rejectionReason: local[doc.uuid].reason } : {}),
  }));
  return { ok: true, mock: Boolean(out.mock), simulated: Boolean(out.simulated), data: { documents, total: out.data.metadata?.totalCount ?? documents.length, pages: out.data.metadata?.totalPages ?? 1, pageNo } };
}

export async function checkMyTin(state, args) {
  const tin = String(args.tin).trim().toUpperCase();
  const out = await gate(state, {
    actionId: 'myinvois_tin_validate',
    params: { tin, idType: String(args.idType || 'BRN') },
    fixture: () => ({ ok: true, mock: true, data: { tin, valid: true } }),
    execute: async (transports) => validateMyTin(myInvoisConfig(transports.https.request, state), args),
  }, args);
  if (!out.ok) return lhdnFailure(out);
  return { ok: true, mock: Boolean(out.mock), simulated: Boolean(out.simulated), data: { tin, format: true, lhdn: out.data.valid ? 'valid' : 'not found' } };
}

export function simulateReceivedMyInvois(state, args = {}) {
  if (myInvoisMode() !== 'sandbox') return { ok: false, error: 'SANDBOX_ONLY', hint: 'A received e-invoice can be simulated only in the built-in MyInvois sandbox (no MYCA_MYINVOIS_CLIENT_ID and live calls not on).' };
  const saved = countrySlice(state, 'myEinvoiceProfile');
  const out = receiveSandboxDocument(state, { buyerTin: saved?.supplier?.tin, buyerName: saved?.supplier?.name, supplier: args.supplier || {}, number: args.number, issueDate: args.issueDate, total: args.total, tax: args.tax ?? 0, currency: args.currency || 'MYR' });
  if (!out.ok) return out;
  appendAuditEvent(state, { action: 'my_einvoice_sandbox_received', actorId: actorOf(args).userId, metadata: { uuid: out.data.uuid, number: out.data.number, supplierTin: out.data.supplier.tin } });
  return { ok: true, simulated: true, data: out.data };
}

const ISSUED_STATUSES = ['submitted', 'valid', 'invalid', 'rejected', 'cancelled'];

export function listIssuedMyInvois(state, args = {}) {
  const status = args.status === undefined ? '' : String(args.status).toLowerCase();
  if (status && !ISSUED_STATUSES.includes(status)) return { ok: false, error: 'BAD_STATUS', allowed: ISSUED_STATUSES };
  for (const key of ['from', 'to']) {
    if (args[key] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(args[key]))) return { ok: false, error: 'BAD_DATE', field: key };
  }
  const limit = args.limit === undefined ? 50 : Number(args.limit);
  if (!(Number.isInteger(limit) && limit >= 1 && limit <= 500)) return { ok: false, error: 'BAD_LIMIT', hint: 'limit is a whole number from 1 to 500.' };
  const limits = workflowRule();
  const day = (row) => String(row.issueDate || row.at || '').slice(0, 10);
  const rows = Object.values(countrySlice(state, 'myEinvoices').byNumber || {})
    .filter((row) => !status || row.status === status)
    .filter((row) => !args.from || day(row) >= args.from)
    .filter((row) => !args.to || day(row) <= args.to)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const documents = rows.slice(0, limit).map((row) => ({
    number: row.number,
    type: row.type || 'invoice',
    kind: row.kind || 'invoice',
    uuid: row.uuid,
    submissionUid: row.submissionUid,
    status: row.status,
    issueDate: row.issueDate || '',
    buyer: row.buyer || null,
    supplier: row.supplier || null,
    payable: row.totals ? row.totals.payable : null,
    currency: row.totals?.currency || 'MYR',
    payableMyr: row.totals ? row.totals.payableMyr ?? row.totals.payable : null,
    link: row.link || '',
    environment: row.environment,
    cancellableUntil: row.status === 'valid' && row.validatedAt && limits ? new Date(Date.parse(row.validatedAt) + limits.cancelWithinHours * HOUR_MS).toISOString() : '',
    ...(row.period ? { period: row.period } : {}),
    ...(row.original ? { original: row.original } : {}),
  }));
  const byStatus = {};
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  return { ok: true, data: { documents, total: rows.length, byStatus } };
}
