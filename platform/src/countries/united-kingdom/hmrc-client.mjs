export const HMRC_HOSTS = Object.freeze({ live: 'api.service.hmrc.gov.uk', test: 'test-api.service.hmrc.gov.uk' });
export const HMRC_SCOPES = Object.freeze(['read:vat', 'write:vat', 'read:self-assessment', 'write:self-assessment']);
export const CALCULATION_TYPES = Object.freeze(['in-year', 'intent-to-finalise', 'intent-to-amend']);
export const FINAL_TYPES = Object.freeze({ 'intent-to-finalise': 'final-declaration', 'intent-to-amend': 'confirm-amendment' });

export const API_VERSIONS = Object.freeze({
  vat: '1.0',
  businessDetails: '2.0',
  obligations: '3.0',
  selfEmployment: '5.0',
  property: '6.0',
  calculations: '8.0',
  fraudTest: '1.0',
});

const NINO = /^[A-Z]{2}\d{6}[A-D]$/;
const VRN = /^\d{9}$/;
const BUSINESS_ID = /^X[A-Z0-9]{1}IS\d{11}$/;
const TAX_YEAR = /^\d{4}-\d{2}$/;
const CALC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hostFor(environment) {
  return environment === 'live' ? HMRC_HOSTS.live : HMRC_HOSTS.test;
}

export function hmrcBase(environment) {
  return `https://${hostFor(environment)}`;
}

function accept(version) {
  return `application/vnd.hmrc.${version}+json`;
}

function guard(condition, error, extra = {}) {
  if (!condition) {
    const err = new Error(error);
    err.code = error;
    err.extra = extra;
    throw err;
  }
}

export function authorizeUrl(config, { state, scopes = HMRC_SCOPES }) {
  const url = new URL('/oauth/authorize', hmrcBase(config.environment));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', config.redirectUri);
  return url.toString();
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 2000) }; }
}

function hmrcError(status, body) {
  const code = body?.code || body?.error || `HTTP_${status}`;
  const errors = Array.isArray(body?.errors) ? body.errors.map((entry) => ({ code: entry.code, message: entry.message, path: entry.path })) : [];
  return { ok: false, error: 'HMRC_REJECTED', status, hmrcCode: code, message: body?.message || body?.error_description || '', errors };
}

async function tokenCall(config, form) {
  const response = await config.transport(`${hmrcBase(config.environment)}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...form }).toString(),
  });
  const body = await readBody(response);
  if (!response.ok) return hmrcError(response.status, body);
  if (!body?.access_token || !body?.refresh_token) return { ok: false, error: 'HMRC_TOKEN_MALFORMED' };
  return { ok: true, data: { accessToken: body.access_token, refreshToken: body.refresh_token, expiresIn: Number(body.expires_in) || 14400, scope: String(body.scope || ''), tokenType: body.token_type || 'bearer' } };
}

export function exchangeCode(config, code) {
  return tokenCall(config, { grant_type: 'authorization_code', code, redirect_uri: config.redirectUri });
}

export function refreshTokens(config, refreshToken) {
  return tokenCall(config, { grant_type: 'refresh_token', refresh_token: refreshToken });
}

async function call(config, { method = 'GET', path, version, query = {}, body, scenario }) {
  const url = new URL(path, hmrcBase(config.environment));
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  const headers = { Accept: accept(version), Authorization: `Bearer ${config.accessToken}`, ...config.fraudHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (scenario && config.environment !== 'live') headers['Gov-Test-Scenario'] = scenario;
  const response = await config.transport(url.toString(), { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const parsed = await readBody(response);
  if (!response.ok) return hmrcError(response.status, parsed);
  const correlationId = typeof response.headers?.get === 'function' ? response.headers.get('x-correlationid') || '' : '';
  return { ok: true, status: response.status, correlationId, data: parsed };
}

export function vatObligations(config, { vrn, from, to, status }) {
  guard(VRN.test(vrn), 'BAD_VRN');
  return call(config, { path: `/organisations/vat/${vrn}/obligations`, version: API_VERSIONS.vat, query: status ? { status } : { from, to } });
}

export function submitVatReturn(config, { vrn, body }) {
  guard(VRN.test(vrn), 'BAD_VRN');
  return call(config, { method: 'POST', path: `/organisations/vat/${vrn}/returns`, version: API_VERSIONS.vat, body });
}

export function viewVatReturn(config, { vrn, periodKey }) {
  guard(VRN.test(vrn), 'BAD_VRN');
  return call(config, { path: `/organisations/vat/${vrn}/returns/${encodeURIComponent(periodKey)}`, version: API_VERSIONS.vat });
}

export function vatLiabilities(config, { vrn, from, to }) {
  guard(VRN.test(vrn), 'BAD_VRN');
  return call(config, { path: `/organisations/vat/${vrn}/liabilities`, version: API_VERSIONS.vat, query: { from, to } });
}

export function vatPayments(config, { vrn, from, to }) {
  guard(VRN.test(vrn), 'BAD_VRN');
  return call(config, { path: `/organisations/vat/${vrn}/payments`, version: API_VERSIONS.vat, query: { from, to } });
}

export function listBusinesses(config, { nino }) {
  guard(NINO.test(nino), 'BAD_NINO');
  return call(config, { path: `/individuals/business/details/${nino}/list`, version: API_VERSIONS.businessDetails });
}

export function incomeObligations(config, { nino, fromDate, toDate, status, typeOfBusiness, businessId }) {
  guard(NINO.test(nino), 'BAD_NINO');
  return call(config, { path: `/obligations/details/${nino}/income-and-expenditure`, version: API_VERSIONS.obligations, query: status ? { status, typeOfBusiness, businessId } : { fromDate, toDate, typeOfBusiness, businessId } });
}

export function putSelfEmploymentCumulative(config, { nino, businessId, taxYear, body }) {
  guard(NINO.test(nino), 'BAD_NINO');
  guard(BUSINESS_ID.test(businessId), 'BAD_BUSINESS_ID');
  guard(TAX_YEAR.test(taxYear), 'BAD_TAX_YEAR');
  return call(config, { method: 'PUT', path: `/individuals/business/self-employment/${nino}/${businessId}/cumulative/${taxYear}`, version: API_VERSIONS.selfEmployment, body });
}

export function putPropertyCumulative(config, { nino, businessId, taxYear, body }) {
  guard(NINO.test(nino), 'BAD_NINO');
  guard(BUSINESS_ID.test(businessId), 'BAD_BUSINESS_ID');
  guard(TAX_YEAR.test(taxYear), 'BAD_TAX_YEAR');
  return call(config, { method: 'PUT', path: `/individuals/business/property/uk/${nino}/${businessId}/cumulative/${taxYear}`, version: API_VERSIONS.property, body });
}

export function triggerCalculation(config, { nino, taxYear, calculationType }) {
  guard(NINO.test(nino), 'BAD_NINO');
  guard(TAX_YEAR.test(taxYear), 'BAD_TAX_YEAR');
  guard(CALCULATION_TYPES.includes(calculationType), 'BAD_CALCULATION_TYPE');
  return call(config, { method: 'POST', path: `/individuals/calculations/${nino}/self-assessment/${taxYear}/trigger/${calculationType}`, version: API_VERSIONS.calculations });
}

export function retrieveCalculation(config, { nino, taxYear, calculationId }) {
  guard(NINO.test(nino), 'BAD_NINO');
  guard(TAX_YEAR.test(taxYear), 'BAD_TAX_YEAR');
  guard(CALC_ID.test(calculationId), 'BAD_CALCULATION_ID');
  return call(config, { path: `/individuals/calculations/${nino}/self-assessment/${taxYear}/${calculationId}`, version: API_VERSIONS.calculations });
}

export function submitFinalDeclaration(config, { nino, taxYear, calculationId, calculationType }) {
  guard(NINO.test(nino), 'BAD_NINO');
  guard(TAX_YEAR.test(taxYear), 'BAD_TAX_YEAR');
  guard(CALC_ID.test(calculationId), 'BAD_CALCULATION_ID');
  const final = FINAL_TYPES[calculationType];
  guard(final, 'BAD_CALCULATION_TYPE');
  return call(config, { method: 'POST', path: `/individuals/calculations/${nino}/self-assessment/${taxYear}/${calculationId}/${final}`, version: API_VERSIONS.calculations });
}

export function validateFraudHeaders(config) {
  return call(config, { path: '/test/fraud-prevention-headers/validate', version: API_VERSIONS.fraudTest });
}

export function isBusinessId(value) {
  return BUSINESS_ID.test(String(value || ''));
}

export function isCalculationId(value) {
  return CALC_ID.test(String(value || ''));
}
