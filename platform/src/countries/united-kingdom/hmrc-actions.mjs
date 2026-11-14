import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { performExternalAction } from '../../action-gate.mjs';
import { appendAuditEvent } from '../../ca-api.mjs';
import { encryptSecret, decryptSecret } from '../../credential-vault.mjs';
import { loadEnvFile, mockModeEnabled, providerEnvironment } from '../../runtime-config.mjs';
import { countrySlice, openCountrySlice } from '../kit/index.mjs';
import { buildFraudHeaders, fraudHeaderGaps } from './fraud-headers.mjs';
import {
  authorizeUrl, exchangeCode, refreshTokens, vatObligations, submitVatReturn, viewVatReturn, vatLiabilities, vatPayments,
  listBusinesses, incomeObligations, putSelfEmploymentCumulative, putPropertyCumulative, triggerCalculation, retrieveCalculation,
  submitFinalDeclaration, validateFraudHeaders, CALCULATION_TYPES, isBusinessId, isCalculationId, HMRC_SCOPES,
} from './hmrc-client.mjs';
import { vatReturnProblems } from './vat.mjs';
import { normaliseNino, normaliseVrn, ninoValid, vrnValid } from './identifiers.mjs';
import { parseTaxYear } from './rules.mjs';

const STATE_TTL_MS = 15 * 60 * 1000;
const REFRESH_MARGIN_MS = 60 * 1000;
const SEALED = 'hmrc1';
const VAULT = 'hmrcv';

function setting(name) {
  const env = loadEnvFile();
  return String(process.env[name] ?? env[name] ?? '').trim();
}

export function hmrcSettings() {
  return {
    clientId: setting('MYCA_HMRC_CLIENT_ID'),
    clientSecret: setting('MYCA_HMRC_CLIENT_SECRET'),
    redirectUri: setting('MYCA_HMRC_REDIRECT_URI'),
    vendorPublicIp: setting('MYCA_HMRC_VENDOR_PUBLIC_IP'),
    serverVersion: setting('MYCA_VERSION') || 'dev',
  };
}

export const HMRC_SETTINGS = Object.freeze(['MYCA_HMRC_CLIENT_ID', 'MYCA_HMRC_CLIENT_SECRET', 'MYCA_HMRC_REDIRECT_URI', 'MYCA_HMRC_VENDOR_PUBLIC_IP', 'MYCA_HMRC_TOKEN_KEY']);

function environment() {
  return mockModeEnabled() ? 'mock' : providerEnvironment();
}

function hmrcEnvironment() {
  return providerEnvironment() === 'live' ? 'live' : 'test';
}

function actorOf(args) {
  return { userId: String(args.actorId || 'owner'), role: String(args.role || '') };
}

function clientOf(state) {
  return String(state.activeClientId || 'SELF');
}

function tokenKey() {
  return setting('MYCA_HMRC_TOKEN_KEY') || setting('MYCA_PII_KEY');
}

export function sealToken(text, scope = '') {
  const secret = tokenKey();
  if (!secret) return `${VAULT}.${Buffer.from(JSON.stringify(encryptSecret(text))).toString('base64url')}`;
  const key = Buffer.from(hkdfSync('sha256', secret, String(scope), 'myca-hmrc-token', 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(scope)));
  const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return `${SEALED}.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}

export function openToken(sealed, scope = '') {
  const text = String(sealed || '');
  try {
    if (text.startsWith(`${VAULT}.`)) return decryptSecret(JSON.parse(Buffer.from(text.slice(VAULT.length + 1), 'base64url').toString('utf8')));
    if (!text.startsWith(`${SEALED}.`)) return '';
    const secret = tokenKey();
    if (!secret) return '';
    const [, iv, tag, body] = text.split('.');
    const key = Buffer.from(hkdfSync('sha256', secret, String(scope), 'myca-hmrc-token', 32));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), { authTagLength: 16 });
    decipher.setAAD(Buffer.from(String(scope)));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function connection(state) {
  return openCountrySlice(state, 'gbHmrc', () => ({ status: 'not-connected', history: [] }));
}

function data(state) {
  return openCountrySlice(state, 'gbHmrcData', () => ({ vatObligations: [], itsaBusinesses: [], itsaObligations: [], calculations: {}, vatReturns: {}, itsaUpdates: {}, declarations: {} }));
}

function hash(text) {
  return createHash('sha256').update(String(text)).digest('hex');
}

function missingSettings(settings) {
  if (mockModeEnabled()) return [];
  return [['MYCA_HMRC_CLIENT_ID', settings.clientId], ['MYCA_HMRC_CLIENT_SECRET', settings.clientSecret], ['MYCA_HMRC_REDIRECT_URI', settings.redirectUri]].filter(([, value]) => !value).map(([name]) => name);
}

export function hmrcStatus(state) {
  const saved = countrySlice(state, 'gbHmrc');
  const synced = countrySlice(state, 'gbHmrcData');
  const now = Date.now();
  const expires = saved.accessExpiresAt ? Date.parse(saved.accessExpiresAt) : 0;
  const settings = hmrcSettings();
  return {
    ok: true,
    data: {
      status: saved.status || 'not-connected',
      environment: saved.environment || '',
      serviceEnvironment: environment(),
      scopes: saved.scopes || [],
      connectedAt: saved.connectedAt || null,
      accessTokenValid: Boolean(expires && expires > now),
      refreshBy: saved.refreshExpiresAt || null,
      lastSync: synced.syncedAt || null,
      vatObligations: synced.vatObligations || [],
      itsaBusinesses: synced.itsaBusinesses || [],
      itsaObligations: synced.itsaObligations || [],
      calculations: Object.values(synced.calculations || {}),
      fraudHeaderCheck: synced.fraudHeaderCheck || null,
      missingSettings: missingSettings(settings),
    },
  };
}

export function startHmrcConnection(state, args = {}) {
  const settings = hmrcSettings();
  const missing = missingSettings(settings);
  if (missing.length) return { ok: false, error: 'HMRC_NOT_CONFIGURED', settings: missing, hint: 'Register MyCA on the HMRC Developer Hub, create a sandbox application, and set these settings.' };
  const nonce = randomBytes(24).toString('base64url');
  const saved = connection(state);
  saved.pending = { stateHash: hash(nonce), createdAt: new Date().toISOString(), environment: hmrcEnvironment() };
  const config = { environment: hmrcEnvironment(), clientId: settings.clientId || 'mock-client', redirectUri: settings.redirectUri || 'https://myca.app/hmrc/callback' };
  const scopes = Array.isArray(args.scopes) && args.scopes.length ? args.scopes.filter((scope) => HMRC_SCOPES.includes(scope)) : HMRC_SCOPES;
  appendAuditEvent(state, { action: 'gb_hmrc_connect_started', actorId: actorOf(args).userId, metadata: { environment: config.environment, scopes } });
  return { ok: true, data: { authorizeUrl: authorizeUrl(config, { state: nonce, scopes }), state: nonce, expiresInMinutes: 15, environment: config.environment, hint: 'Open the link, sign in to the Government Gateway account and grant MyCA authority; HMRC sends back a code that finishes the connection.' } };
}

function storeTokens(state, tokens, { environment: env, at = Date.now() }) {
  const saved = connection(state);
  saved.status = 'connected';
  saved.environment = env;
  saved.accessToken = sealToken(tokens.accessToken, 'access');
  saved.refreshToken = sealToken(tokens.refreshToken, 'refresh');
  saved.scopes = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : HMRC_SCOPES;
  saved.accessExpiresAt = new Date(at + tokens.expiresIn * 1000).toISOString();
  saved.refreshExpiresAt = new Date(at + 18 * 30 * 24 * 3600 * 1000).toISOString();
  saved.connectedAt = saved.connectedAt || new Date(at).toISOString();
  delete saved.pending;
}

function mockTokens() {
  return { accessToken: `mock-access-${randomUUID()}`, refreshToken: `mock-refresh-${randomUUID()}`, expiresIn: 14400, scope: HMRC_SCOPES.join(' ') };
}

export async function finishHmrcConnection(state, args = {}) {
  const saved = connection(state);
  const pending = saved.pending;
  const code = String(args.code || '').trim();
  if (!pending) return { ok: false, error: 'HMRC_CONNECT_NOT_STARTED', hint: 'Start the connection first; it gives the HMRC sign-in link.' };
  if (hash(String(args.state || '')) !== pending.stateHash) return { ok: false, error: 'HMRC_STATE_MISMATCH', hint: 'The answer from HMRC does not match this connection attempt; start again.' };
  if (Date.now() - Date.parse(pending.createdAt) > STATE_TTL_MS) { delete saved.pending; return { ok: false, error: 'HMRC_CONNECT_EXPIRED', hint: 'The sign-in link is older than 15 minutes; start again.' }; }
  if (!/^[A-Za-z0-9._~-]{8,512}$/.test(code)) return { ok: false, error: 'BAD_AUTHORISATION_CODE' };
  const settings = hmrcSettings();
  const env = pending.environment;
  const out = await performExternalAction(state, {
    actionId: 'hmrc_oauth_token',
    clientId: clientOf(state),
    params: { grant: 'authorization_code', environment: env },
    actor: actorOf(args),
    metadata: { grant: 'authorization_code' },
    fixture: () => ({ ok: true, mock: true, data: mockTokens() }),
  }, async (transports) => exchangeCode({ environment: env, clientId: settings.clientId, clientSecret: settings.clientSecret, redirectUri: settings.redirectUri, transport: transports.https.request }, code));
  if (!out.ok) return out;
  storeTokens(state, out.data, { environment: out.mock ? 'mock' : env });
  saved.history = [...(saved.history || []), { event: 'connected', at: new Date().toISOString(), environment: saved.environment }].slice(-20);
  appendAuditEvent(state, { action: 'gb_hmrc_connected', actorId: actorOf(args).userId, metadata: { environment: saved.environment, scopes: saved.scopes } });
  return { ok: true, mock: Boolean(out.mock), data: { status: 'connected', environment: saved.environment, scopes: saved.scopes, accessExpiresAt: saved.accessExpiresAt } };
}

export function disconnectHmrc(state, args = {}) {
  const saved = connection(state);
  const was = saved.status;
  for (const key of ['accessToken', 'refreshToken', 'accessExpiresAt', 'refreshExpiresAt', 'pending', 'scopes']) delete saved[key];
  saved.status = 'not-connected';
  saved.history = [...(saved.history || []), { event: 'disconnected', at: new Date().toISOString() }].slice(-20);
  appendAuditEvent(state, { action: 'gb_hmrc_disconnected', actorId: actorOf(args).userId, metadata: { was } });
  return { ok: true, data: { status: 'not-connected', hint: 'MyCA has deleted its HMRC tokens. To remove MyCA\'s authority at HMRC too, use the Government Gateway account.' } };
}

async function accessToken(state, args) {
  const saved = connection(state);
  if (saved.status !== 'connected' || !saved.refreshToken) return { ok: false, error: 'HMRC_NOT_CONNECTED', hint: 'Connect MyCA to HMRC first.' };
  if ((saved.environment === 'mock') !== mockModeEnabled() || (saved.environment !== 'mock' && saved.environment !== hmrcEnvironment())) return { ok: false, error: 'HMRC_ENVIRONMENT_CHANGED', connected: saved.environment, now: environment(), hint: 'The HMRC connection was made for another environment; connect again.' };
  if (saved.accessExpiresAt && Date.parse(saved.accessExpiresAt) - REFRESH_MARGIN_MS > Date.now()) {
    const token = openToken(saved.accessToken, 'access');
    if (token) return { ok: true, token };
  }
  if (saved.refreshExpiresAt && Date.parse(saved.refreshExpiresAt) < Date.now()) { saved.status = 'reconnect'; return { ok: false, error: 'HMRC_RECONNECT', hint: 'HMRC authority lasts 18 months; connect again.' }; }
  const refresh = openToken(saved.refreshToken, 'refresh');
  if (!refresh) return { ok: false, error: 'HMRC_TOKEN_UNREADABLE', hint: 'The saved HMRC token cannot be opened with this server\'s key; connect again.' };
  const settings = hmrcSettings();
  const env = saved.environment === 'mock' ? 'test' : saved.environment;
  const out = await performExternalAction(state, {
    actionId: 'hmrc_oauth_token',
    clientId: clientOf(state),
    params: { grant: 'refresh_token', environment: env },
    actor: actorOf(args),
    metadata: { grant: 'refresh_token' },
    fixture: () => ({ ok: true, mock: true, data: mockTokens() }),
  }, async (transports) => refreshTokens({ environment: env, clientId: settings.clientId, clientSecret: settings.clientSecret, transport: transports.https.request }, refresh));
  if (!out.ok) {
    if (out.hmrcCode === 'invalid_grant') saved.status = 'reconnect';
    return out.hmrcCode === 'invalid_grant' ? { ok: false, error: 'HMRC_RECONNECT', hint: 'HMRC no longer accepts this authority; connect again.' } : out;
  }
  storeTokens(state, out.data, { environment: saved.environment });
  return { ok: true, token: out.data.accessToken };
}

function fraudHeadersFor(state, args) {
  const settings = hmrcSettings();
  return buildFraudHeaders({
    device: { ...(args.device || {}), ipAddress: args.device?.ipAddress },
    user: { id: String(args.actorId || state.company?.id || 'owner'), multiFactor: args.device?.multiFactor },
    vendor: { publicIp: settings.vendorPublicIp, serverVersion: settings.serverVersion, appVersion: args.device?.appVersion, licenceId: hash(String(state.company?.id || 'self')).slice(0, 16), productName: 'MyCA UK' },
  });
}

async function hmrcCall(state, args, { actionId, params, fixture, run, metadata = {} }) {
  const headers = fraudHeadersFor(state, args);
  if (!headers.complete && hmrcEnvironment() === 'live' && !mockModeEnabled()) return { ok: false, error: 'FRAUD_HEADERS_INCOMPLETE', gaps: fraudHeaderGaps(headers), hint: 'HMRC requires every fraud prevention header on live calls; send these from the app and server.' };
  const token = mockModeEnabled() ? { ok: true, token: 'mock' } : await accessToken(state, args);
  if (!token.ok) return token;
  const env = hmrcEnvironment();
  const out = await performExternalAction(state, {
    actionId,
    clientId: clientOf(state),
    params,
    actor: actorOf(args),
    approvalId: args.approvalId,
    metadata,
    fixture,
  }, async (transports) => run({ environment: env, accessToken: token.token, fraudHeaders: headers.headers, transport: transports.https.request }));
  return { ...out, fraudHeaderGaps: fraudHeaderGaps(headers) };
}

function profile(state) {
  return countrySlice(state, 'gbTaxpayer');
}

function vrnOf(state, args) {
  const vrn = normaliseVrn(args.vrn || profile(state).vrn || '');
  return vrnValid(vrn) ? vrn.slice(0, 9) : '';
}

function ninoOf(state, args) {
  const nino = normaliseNino(args.nino || profile(state).nino || '');
  return ninoValid(nino) ? nino : '';
}

const MOCK_OBLIGATIONS = (from) => ({ obligations: [{ periodKey: '18A1', start: from, end: addDays(from, 89), due: addDays(from, 127), status: 'O' }] });

function addDays(date, days) {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export async function syncHmrc(state, args = {}) {
  const year = parseTaxYear(args.taxYear) || parseTaxYear(currentTaxYear());
  const vrn = vrnOf(state, args);
  const nino = ninoOf(state, args);
  if (!vrn && !nino) return { ok: false, error: 'GB_TAXPAYER_IDS_MISSING', hint: 'Save a VAT number or a National Insurance number with set_gb_taxpayer first.' };
  const store = data(state);
  const report = { taxYear: year.label, pulled: [], problems: [] };
  if (vrn) {
    const out = await hmrcCall(state, args, {
      actionId: 'hmrc_vat_read', params: { vrn, what: 'obligations', from: year.from, to: year.to },
      fixture: () => ({ ok: true, mock: true, data: MOCK_OBLIGATIONS(year.from) }),
      run: (config) => vatObligations(config, { vrn, from: year.from, to: year.to }),
    });
    if (out.ok) { store.vatObligations = (out.data?.obligations || []).map((entry) => ({ periodKey: entry.periodKey, start: entry.start, end: entry.end, due: entry.due, status: entry.status === 'F' ? 'fulfilled' : 'open', received: entry.received || null })); report.pulled.push('vat-obligations'); } else report.problems.push({ what: 'vat-obligations', error: out.error, hmrcCode: out.hmrcCode, message: out.message || out.hint });
    if (args.includeVatAccount) {
      const account = await hmrcCall(state, args, {
        actionId: 'hmrc_vat_read', params: { vrn, what: 'liabilities-and-payments', from: year.from, to: year.to },
        fixture: () => ({ ok: true, mock: true, data: { liabilities: [], payments: [] } }),
        run: async (config) => {
          const liabilities = await vatLiabilities(config, { vrn, from: year.from, to: year.to });
          const payments = await vatPayments(config, { vrn, from: year.from, to: year.to });
          return { ok: true, data: { liabilities: liabilities.ok ? liabilities.data?.liabilities || [] : [], payments: payments.ok ? payments.data?.payments || [] : [] } };
        },
      });
      if (account.ok) { store.vatAccount = account.data; report.pulled.push('vat-account'); }
    }
  }
  if (nino) {
    const businesses = await hmrcCall(state, args, {
      actionId: 'hmrc_itsa_read', params: { nino, what: 'businesses' },
      fixture: () => ({ ok: true, mock: true, data: { listOfBusinesses: [{ typeOfBusiness: 'self-employment', businessId: 'XAIS12345678901', tradingName: 'Sole trade' }, { typeOfBusiness: 'uk-property', businessId: 'XPIS12345678901' }] } }),
      run: (config) => listBusinesses(config, { nino }),
    });
    if (businesses.ok) { store.itsaBusinesses = (businesses.data?.listOfBusinesses || []).map((entry) => ({ typeOfBusiness: entry.typeOfBusiness, businessId: entry.businessId, tradingName: entry.tradingName || '' })); report.pulled.push('itsa-businesses'); } else report.problems.push({ what: 'itsa-businesses', error: businesses.error, hmrcCode: businesses.hmrcCode, message: businesses.message || businesses.hint });
    const obligations = await hmrcCall(state, args, {
      actionId: 'hmrc_itsa_read', params: { nino, what: 'obligations', from: year.from, to: year.to },
      fixture: () => ({ ok: true, mock: true, data: { obligations: [{ typeOfBusiness: 'self-employment', businessId: 'XAIS12345678901', obligationDetails: [{ periodStartDate: year.from, periodEndDate: addDays(year.from, 90), dueDate: addDays(year.from, 123), status: 'open' }] }] } }),
      run: (config) => incomeObligations(config, { nino, fromDate: year.from, toDate: year.to }),
    });
    if (obligations.ok) { store.itsaObligations = (obligations.data?.obligations || []).flatMap((entry) => (entry.obligationDetails || []).map((detail) => ({ typeOfBusiness: entry.typeOfBusiness, businessId: entry.businessId, from: detail.periodStartDate, to: detail.periodEndDate, due: detail.dueDate, status: String(detail.status || '').toLowerCase() === 'fulfilled' || detail.status === 'F' ? 'fulfilled' : 'open', received: detail.receivedDate || null }))); report.pulled.push('itsa-obligations'); } else report.problems.push({ what: 'itsa-obligations', error: obligations.error, hmrcCode: obligations.hmrcCode, message: obligations.message || obligations.hint });
    if (isCalculationId(args.calculationId)) {
      const calc = await fetchCalculation(state, args, nino, year.label, args.calculationId);
      if (calc.ok) report.pulled.push('calculation'); else report.problems.push({ what: 'calculation', error: calc.error, message: calc.message || calc.hint });
    }
  }
  if (args.checkFraudHeaders && hmrcEnvironment() === 'test') {
    const check = await hmrcCall(state, args, {
      actionId: 'hmrc_fraud_headers_test', params: { what: 'validate' },
      fixture: () => ({ ok: true, mock: true, data: { code: 'VALID_HEADERS', message: 'All headers appear to be valid' } }),
      run: (config) => validateFraudHeaders(config),
    });
    store.fraudHeaderCheck = { at: new Date().toISOString(), ok: check.ok, code: check.data?.code || check.hmrcCode || check.error, message: check.data?.message || check.message || '', warnings: check.data?.warnings || [], errors: check.data?.errors || check.errors || [], gaps: check.fraudHeaderGaps || [] };
    report.pulled.push('fraud-header-check');
  }
  store.syncedAt = new Date().toISOString();
  store.environment = environment();
  appendAuditEvent(state, { action: 'gb_hmrc_synced', actorId: actorOf(args).userId, metadata: { taxYear: year.label, pulled: report.pulled, problems: report.problems.map((entry) => entry.what) } });
  return { ok: report.pulled.length > 0, ...(report.pulled.length ? {} : { error: 'HMRC_SYNC_FAILED' }), data: report };
}

export function currentTaxYear(today = new Date().toISOString().slice(0, 10)) {
  const year = Number(today.slice(0, 4));
  const start = today.slice(5) >= '04-06' ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export async function submitGbVatReturn(state, args = {}) {
  const vrn = vrnOf(state, args);
  if (!vrn) return { ok: false, error: 'GB_VRN_MISSING', hint: 'Save the VAT registration number first.' };
  const body = args.body && typeof args.body === 'object' ? { ...args.body, finalised: args.declaration === true } : null;
  if (!body) return { ok: false, error: 'VAT_RETURN_BODY_MISSING', hint: 'Prepare the return with gb_vat_return_check, then send its body.' };
  const problems = vatReturnProblems(body);
  if (problems.length) return { ok: false, error: 'VAT_RETURN_NOT_READY', problems };
  const store = data(state);
  const key = `${environment()}:${vrn}:${body.periodKey}`;
  if (store.vatReturns[key]) return { ok: false, error: 'VAT_RETURN_ALREADY_SENT', receipt: store.vatReturns[key] };
  const obligation = (store.vatObligations || []).find((entry) => entry.periodKey === body.periodKey);
  if (obligation && obligation.status === 'fulfilled') return { ok: false, error: 'VAT_PERIOD_ALREADY_FILED', periodKey: body.periodKey };
  const out = await hmrcCall(state, args, {
    actionId: 'hmrc_vat_submit', params: { vrn, periodKey: body.periodKey, netVatDue: body.netVatDue },
    metadata: { vrn, periodKey: body.periodKey },
    fixture: () => ({ ok: true, mock: true, data: { processingDate: new Date().toISOString(), formBundleNumber: String(Date.now()).slice(-12).padStart(12, '0'), paymentIndicator: body.totalVatDue >= body.vatReclaimedCurrPeriod ? 'DD' : 'BANK', chargeRefNumber: 'XM002610011594' } }),
    run: (config) => submitVatReturn(config, { vrn, body }),
  });
  if (!out.ok) return out;
  const receipt = { vrn, periodKey: body.periodKey, processingDate: out.data?.processingDate || '', formBundleNumber: out.data?.formBundleNumber || '', paymentIndicator: out.data?.paymentIndicator || '', chargeRefNumber: out.data?.chargeRefNumber || '', correlationId: out.correlationId || '', netVatDue: body.netVatDue, boxes: body, environment: environment(), at: new Date().toISOString() };
  store.vatReturns[key] = receipt;
  if (obligation) obligation.status = 'fulfilled';
  appendAuditEvent(state, { action: 'gb_vat_return_submitted', actorId: actorOf(args).userId, metadata: { vrn, periodKey: body.periodKey, formBundleNumber: receipt.formBundleNumber, environment: receipt.environment } });
  return { ok: true, mock: Boolean(out.mock), data: receipt };
}

export async function viewGbVatReturn(state, args = {}) {
  const vrn = vrnOf(state, args);
  if (!vrn) return { ok: false, error: 'GB_VRN_MISSING' };
  const periodKey = String(args.periodKey || '');
  return hmrcCall(state, args, { actionId: 'hmrc_vat_read', params: { vrn, what: 'return', periodKey }, fixture: () => ({ ok: true, mock: true, data: { periodKey } }), run: (config) => viewVatReturn(config, { vrn, periodKey }) });
}

export async function submitGbItsaUpdate(state, args = {}) {
  const nino = ninoOf(state, args);
  if (!nino) return { ok: false, error: 'GB_NINO_MISSING', hint: 'Save the National Insurance number first.' };
  const kind = String(args.kind || 'self-employment');
  const year = parseTaxYear(args.taxYear);
  if (!year) return { ok: false, error: 'BAD_TAX_YEAR' };
  if (!isBusinessId(args.businessId)) return { ok: false, error: 'BAD_BUSINESS_ID', hint: 'Use the business id from HMRC (sync first to list them).' };
  if (!args.body || typeof args.body !== 'object') return { ok: false, error: 'ITSA_BODY_MISSING', hint: 'Prepare the update with gb_itsa_quarter_check, then send its body.' };
  const known = (data(state).itsaBusinesses || []).find((entry) => entry.businessId === args.businessId);
  if (known && known.typeOfBusiness !== kind) return { ok: false, error: 'BUSINESS_KIND_MISMATCH', businessId: args.businessId, hmrc: known.typeOfBusiness };
  const run = kind === 'uk-property' ? (config) => putPropertyCumulative(config, { nino, businessId: args.businessId, taxYear: year.hmrc, body: args.body }) : (config) => putSelfEmploymentCumulative(config, { nino, businessId: args.businessId, taxYear: year.hmrc, body: args.body });
  const periodEnd = args.body.periodDates?.periodEndDate || args.body.toDate || '';
  const out = await hmrcCall(state, args, {
    actionId: 'hmrc_itsa_submit', params: { nino, businessId: args.businessId, taxYear: year.hmrc, kind, periodEnd },
    metadata: { kind, businessId: args.businessId, taxYear: year.hmrc, periodEnd },
    fixture: () => ({ ok: true, mock: true, data: null }),
    run,
  });
  if (!out.ok) return out;
  const store = data(state);
  const receipt = { kind, businessId: args.businessId, taxYear: year.label, periodEnd, correlationId: out.correlationId || '', environment: environment(), at: new Date().toISOString(), body: args.body };
  store.itsaUpdates[`${environment()}:${args.businessId}:${year.label}:${periodEnd}`] = receipt;
  for (const entry of store.itsaObligations || []) if (entry.businessId === args.businessId && entry.to === periodEnd) entry.status = 'fulfilled';
  appendAuditEvent(state, { action: 'gb_itsa_update_submitted', actorId: actorOf(args).userId, metadata: { kind, businessId: args.businessId, taxYear: year.label, periodEnd, environment: receipt.environment } });
  return { ok: true, mock: Boolean(out.mock), data: { ...receipt, hint: 'Updates are cumulative: the next one replaces this from the start of the tax year.' } };
}

function summariseCalculation(raw, calculationId, type, taxYear) {
  const calc = raw?.calculation || {};
  const summary = calc.taxCalculation || {};
  const it = summary.incomeTax || {};
  return {
    calculationId,
    taxYear,
    calculationType: raw?.metadata?.calculationType || type || '',
    timestamp: raw?.metadata?.calculationTimestamp || new Date().toISOString(),
    incomeTax: it.incomeTaxCharged ?? it.totalIncomeTaxDue ?? null,
    nics: summary.nics?.nicsTotal ?? summary.nics?.totalNic ?? null,
    totalIncomeTaxAndNicsDue: summary.totalIncomeTaxAndNicsDue ?? null,
    totalTaxableIncome: it.totalTaxableIncome ?? null,
    messages: raw?.messages || null,
  };
}

async function fetchCalculation(state, args, nino, taxYear, calculationId, type) {
  const hmrcYear = parseTaxYear(taxYear).hmrc;
  const out = await hmrcCall(state, args, {
    actionId: 'hmrc_itsa_read', params: { nino, what: 'calculation', calculationId },
    fixture: () => ({ ok: true, mock: true, data: { metadata: { calculationId, calculationType: type || 'in-year', calculationTimestamp: new Date().toISOString() }, calculation: { taxCalculation: { incomeTax: { totalTaxableIncome: 37430, incomeTaxCharged: 7486 }, nics: { nicsTotal: 2245.8 }, totalIncomeTaxAndNicsDue: 9731.8 } } } }),
    run: (config) => retrieveCalculation(config, { nino, taxYear: hmrcYear, calculationId }),
  });
  if (!out.ok) return out;
  const summary = summariseCalculation(out.data, calculationId, type, taxYear);
  data(state).calculations[calculationId] = summary;
  return { ok: true, mock: Boolean(out.mock), data: summary };
}

export async function triggerGbCalculation(state, args = {}) {
  const nino = ninoOf(state, args);
  if (!nino) return { ok: false, error: 'GB_NINO_MISSING' };
  const year = parseTaxYear(args.taxYear);
  if (!year) return { ok: false, error: 'BAD_TAX_YEAR' };
  const type = String(args.calculationType || 'in-year');
  if (!CALCULATION_TYPES.includes(type)) return { ok: false, error: 'BAD_CALCULATION_TYPE', types: CALCULATION_TYPES };
  const out = await hmrcCall(state, args, {
    actionId: 'hmrc_itsa_calculate', params: { nino, taxYear: year.hmrc, type },
    metadata: { taxYear: year.hmrc, type },
    fixture: () => ({ ok: true, mock: true, data: { calculationId: randomUUID() } }),
    run: (config) => triggerCalculation(config, { nino, taxYear: year.hmrc, calculationType: type }),
  });
  if (!out.ok) return out;
  const calculationId = out.data?.calculationId;
  if (!isCalculationId(calculationId)) return { ok: false, error: 'HMRC_NO_CALCULATION_ID' };
  data(state).calculations[calculationId] = { calculationId, taxYear: year.label, calculationType: type, status: 'requested', timestamp: new Date().toISOString() };
  const fetched = await fetchCalculation(state, args, nino, year.label, calculationId, type);
  appendAuditEvent(state, { action: 'gb_itsa_calculation_triggered', actorId: actorOf(args).userId, metadata: { taxYear: year.label, type, calculationId } });
  if (!fetched.ok) return { ok: true, mock: Boolean(out.mock), data: { calculationId, status: 'requested', hint: 'HMRC is still working the calculation out; sync with this calculation id in a minute.' } };
  return { ok: true, mock: Boolean(out.mock), data: fetched.data };
}

export async function submitGbFinalDeclaration(state, args = {}) {
  const nino = ninoOf(state, args);
  if (!nino) return { ok: false, error: 'GB_NINO_MISSING' };
  const year = parseTaxYear(args.taxYear);
  if (!year) return { ok: false, error: 'BAD_TAX_YEAR' };
  if (args.declaration !== true) return { ok: false, error: 'DECLARATION_REQUIRED', hint: 'The taxpayer must declare the information is correct and complete to the best of their knowledge and belief; false information can lead to prosecution.' };
  const calc = data(state).calculations[String(args.calculationId || '')];
  if (!calc) return { ok: false, error: 'CALCULATION_NOT_FOUND', hint: 'Ask HMRC for an intent-to-finalise calculation and review it first.' };
  if (calc.calculationType !== 'intent-to-finalise' && calc.calculationType !== 'intent-to-amend') return { ok: false, error: 'WRONG_CALCULATION_TYPE', hint: 'The final declaration needs an intent-to-finalise calculation.' };
  if (calc.taxYear !== year.label) return { ok: false, error: 'CALCULATION_YEAR_MISMATCH' };
  const key = `${environment()}:${nino}:${year.label}`;
  if (data(state).declarations[key] && calc.calculationType === 'intent-to-finalise') return { ok: false, error: 'FINAL_DECLARATION_ALREADY_SENT', receipt: data(state).declarations[key] };
  const out = await hmrcCall(state, args, {
    actionId: 'hmrc_itsa_final_declaration', params: { nino, taxYear: year.hmrc, calculationId: calc.calculationId },
    metadata: { taxYear: year.hmrc, calculationId: calc.calculationId },
    fixture: () => ({ ok: true, mock: true, data: null }),
    run: (config) => submitFinalDeclaration(config, { nino, taxYear: year.hmrc, calculationId: calc.calculationId, calculationType: calc.calculationType }),
  });
  if (!out.ok) return out;
  const receipt = { taxYear: year.label, calculationId: calc.calculationId, type: calc.calculationType, totalDue: calc.totalIncomeTaxAndNicsDue, correlationId: out.correlationId || '', environment: environment(), at: new Date().toISOString() };
  data(state).declarations[key] = receipt;
  appendAuditEvent(state, { action: 'gb_final_declaration_submitted', actorId: actorOf(args).userId, metadata: { taxYear: year.label, calculationId: calc.calculationId, environment: receipt.environment } });
  return { ok: true, mock: Boolean(out.mock), data: receipt };
}
