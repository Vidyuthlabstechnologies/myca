import { createHash } from 'node:crypto';
import { mockModeEnabled, providerEnvironment } from '../../runtime-config.mjs';
import { submissionEntry } from './myinvois-document.mjs';

export const MYINVOIS_HOSTS = Object.freeze({
  test: Object.freeze({ api: 'https://preprod-api.myinvois.hasil.gov.my', portal: 'https://preprod.myinvois.hasil.gov.my' }),
  live: Object.freeze({ api: 'https://api.myinvois.hasil.gov.my', portal: 'https://myinvois.hasil.gov.my' }),
});

export const MYINVOIS_SETTINGS = Object.freeze(['MYCA_MYINVOIS_CLIENT_ID', 'MYCA_MYINVOIS_CLIENT_SECRET', 'MYCA_MYINVOIS_CERT_PATH', 'MYCA_MYINVOIS_KEY_PATH']);
const MAX_DOCUMENTS = 100;
const MAX_SUBMISSION_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 300 * 1024;
const TOKEN_MARGIN_MS = 60_000;
const tokens = new Map();

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function clearMyInvoisTokens() {
  tokens.clear();
}

function environmentOf(config) {
  if (config.environment === 'test' || config.environment === 'live') return config.environment;
  return providerEnvironment();
}

function mockUid(seed) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const hash = createHash('sha256').update(String(seed)).digest();
  return Array.from({ length: 26 }, (_, index) => alphabet[hash[index] % 32]).join('');
}

async function readJson(response) {
  if (typeof response.text !== 'function') return typeof response.json === 'function' ? response.json().catch(() => ({})) : {};
  const body = await response.text();
  try { return body ? JSON.parse(body) : {}; } catch { return { raw: body.slice(0, 500) }; }
}

export async function myInvoisToken(config = {}) {
  const environment = environmentOf(config);
  if (environment === 'off') return fail('LIVE_CALLS_DISABLED', { hint: 'Set MYCA_PROVIDER_ENV=test for the LHDN pre-production sandbox, or live for production.' });
  if (!config.clientId || !config.clientSecret) return fail('MYINVOIS_CREDENTIALS_MISSING', { settings: MYINVOIS_SETTINGS.slice(0, 2), hint: 'Register the ERP system in the MyInvois portal to get a client id and secret.' });
  const key = `${environment}|${config.clientId}|${config.onBehalfOf || ''}`;
  const cached = tokens.get(key);
  if (cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) return { ok: true, token: cached.token, environment };
  const send = config.transport;
  if (typeof send !== 'function') return fail('TRANSPORT_MISSING', { hint: 'The action gate passes the transport; the Malaysia engine never opens a connection itself.' });
  const form = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'client_credentials', scope: 'InvoicingAPI' });
  const response = await send(`${MYINVOIS_HOSTS[environment].api}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(config.onBehalfOf ? { onbehalfof: config.onBehalfOf } : {}) },
    body: form.toString(),
  });
  const json = await readJson(response);
  if (!response.ok || !json.access_token) return fail('MYINVOIS_LOGIN_FAILED', { status: response.status, lhdn: { error: json.error, error_description: json.error_description }, hint: 'Do not retry a failed login in a loop; fix the client id, secret or intermediary authorisation first.' });
  tokens.set(key, { token: json.access_token, expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000 });
  return { ok: true, token: json.access_token, environment };
}

async function call(config, method, path, body) {
  const auth = await myInvoisToken(config);
  if (!auth.ok) return auth;
  const send = config.transport;
  if (typeof send !== 'function') return fail('TRANSPORT_MISSING', { hint: 'The action gate passes the transport; the Malaysia engine never opens a connection itself.' });
  const response = await send(`${MYINVOIS_HOSTS[auth.environment].api}${path}`, {
    method,
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': 'en' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await readJson(response);
  if (response.status === 429) return fail('MYINVOIS_THROTTLED', { retryAfterSeconds: Number(response.headers?.get?.('retry-after') || 60) });
  if (!response.ok) return fail('MYINVOIS_REJECTED', { status: response.status, lhdn: json, ...(response.status === 422 ? { retryAfterSeconds: Number(response.headers?.get?.('retry-after') || 0) } : {}) });
  return { ok: true, environment: auth.environment, data: json };
}

function guardProduction(config, args) {
  if (environmentOf(config) === 'live' && !String(args.approvalId || '').trim()) return fail('APPROVAL_REQUIRED', { hint: 'A production e-invoice submission or cancellation needs an approval named by the accountant.' });
  return null;
}

export function submissionProblems(entries) {
  const problems = [];
  if (!entries.length) problems.push('at least one document');
  if (entries.length > MAX_DOCUMENTS) problems.push(`at most ${MAX_DOCUMENTS} documents in one submission`);
  for (const entry of entries) {
    if (Buffer.from(entry.document, 'base64').length > MAX_DOCUMENT_BYTES) problems.push(`${entry.codeNumber} is larger than 300 KB`);
  }
  if (Buffer.byteLength(JSON.stringify({ documents: entries })) > MAX_SUBMISSION_BYTES) problems.push('the submission is larger than 5 MB; split it');
  return problems;
}

export async function submitMyInvoisDocuments(config = {}, args = {}) {
  const documents = Array.isArray(args.documents) ? args.documents : [];
  const entries = documents.map(({ document, codeNumber }) => submissionEntry(document, codeNumber));
  const problems = submissionProblems(entries);
  if (problems.length) return fail('SUBMISSION_TOO_LARGE_OR_EMPTY', { problems });
  if (mockModeEnabled()) {
    return {
      ok: true,
      mock: true,
      data: {
        submissionUid: mockUid(entries.map((entry) => entry.documentHash).join('')),
        acceptedDocuments: entries.map((entry) => ({ uuid: mockUid(entry.documentHash), invoiceCodeNumber: entry.codeNumber })),
        rejectedDocuments: [],
      },
      hint: 'MyInvois mock: nothing reached LHDN.',
    };
  }
  const guarded = guardProduction(config, args);
  if (guarded) return guarded;
  const result = await call(config, 'POST', '/api/v1.0/documentsubmissions/', { documents: entries });
  if (!result.ok) return result;
  return {
    ok: true,
    environment: result.environment,
    data: {
      submissionUid: result.data.submissionUid || result.data.submissionUID,
      acceptedDocuments: result.data.acceptedDocuments || [],
      rejectedDocuments: result.data.rejectedDocuments || [],
    },
    hint: 'LHDN validates asynchronously; read the submission until it is no longer in progress.',
  };
}

export async function myInvoisSubmission(config = {}, args = {}) {
  const uid = String(args.submissionUid || '').trim();
  if (!/^[A-Z0-9]{26}$/.test(uid)) return fail('BAD_SUBMISSION_UID');
  if (mockModeEnabled()) return { ok: true, mock: true, data: { submissionUid: uid, overallStatus: 'Valid', documentSummary: [] } };
  return call(config, 'GET', `/api/v1.0/documentsubmissions/${uid}?pageNo=1&pageSize=100`);
}

export async function cancelMyInvoisDocument(config = {}, args = {}) {
  const uuid = String(args.uuid || '').trim();
  const reason = String(args.reason || '').trim();
  if (!/^[A-Z0-9]{26}$/.test(uuid)) return fail('BAD_DOCUMENT_UUID');
  if (!reason || reason.length > 300) return fail('CANCEL_REASON_REQUIRED', { hint: 'Give a reason of up to 300 characters. LHDN allows cancellation within 72 hours of validation.' });
  if (mockModeEnabled()) return { ok: true, mock: true, data: { uuid, status: 'Cancelled' } };
  const guarded = guardProduction(config, args);
  if (guarded) return guarded;
  return call(config, 'PUT', `/api/v1.0/documents/state/${uuid}/state`, { status: 'cancelled', reason });
}

export async function validateMyTin(config = {}, args = {}) {
  const tin = String(args.tin || '').trim().toUpperCase();
  const idType = String(args.idType || 'BRN').trim().toUpperCase();
  const idValue = String(args.idValue || '').trim();
  if (!tin || !idValue) return fail('TIN_AND_ID_REQUIRED');
  if (!['BRN', 'NRIC', 'PASSPORT', 'ARMY'].includes(idType)) return fail('BAD_ID_TYPE');
  if (mockModeEnabled()) return { ok: true, mock: true, data: { tin, valid: true } };
  const auth = await myInvoisToken(config);
  if (!auth.ok) return auth;
  const send = config.transport;
  if (typeof send !== 'function') return fail('TRANSPORT_MISSING', { hint: 'The action gate passes the transport; the Malaysia engine never opens a connection itself.' });
  const response = await send(`${MYINVOIS_HOSTS[auth.environment].api}/api/v1.0/taxpayer/validate/${encodeURIComponent(tin)}?idType=${idType}&idValue=${encodeURIComponent(idValue)}`, { method: 'GET', headers: { Authorization: `Bearer ${auth.token}` } });
  return { ok: true, environment: auth.environment, data: { tin, valid: response.status === 200 } };
}

export function myInvoisShareLink(environment, uuid, longId) {
  const hosts = MYINVOIS_HOSTS[environment === 'live' ? 'live' : 'test'];
  return `${hosts.portal}/${uuid}/share/${longId}`;
}
