import { sameSecrets } from './held-secret.mjs';
import { loadEnvFile, testModeEnabled } from './runtime-config.mjs';
import { providerContext } from './provider-context.mjs';
import { loadSandboxKeys, SANDBOX_HOSTS } from './sandbox-keys.mjs';
import { quickoEndpoint } from './sandbox-endpoints.mjs';
import { loadGovtConfig } from './nic-config.mjs';
import { ewbRefusal } from './ewb-errors.mjs';

function detectEnvironment(baseUrl) {
  return /test/i.test(String(baseUrl)) ? 'test' : 'live';
}

function qs(params = {}) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

const DEFAULT_TIMEOUT_MS = 30000;

function deadline(options, ms = DEFAULT_TIMEOUT_MS) {
  const timeoutMs = Number(options?.timeoutMs || options?.timeout || ms);
  const timeout = AbortSignal.timeout(timeoutMs);
  return options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}

const platformTokens = new Map();
const irpSessions = new Map();
const MAX_IRP_SESSIONS = 256;
const IRP_SESSION_MS = 6 * 3600 * 1000;

function holder(names, secrets) {
  return { name: JSON.stringify(names.map((part) => String(part ?? ''))), secrets: secrets.map((part) => String(part ?? '')) };
}

function heldBy(entry, who) {
  return Boolean(entry) && entry.name === who.name && sameSecrets(who.secrets, entry.secrets);
}

function platformHolder(client) {
  return holder([client.baseUrl, client.apiKey], [client.apiSecret]);
}

function irpHolder(client, creds) {
  return holder([client.baseUrl, client.apiKey, String(creds.gstin || '').trim().toUpperCase(), String(creds.username || '').trim()], [client.apiSecret, creds.password]);
}

function heldEntry(map, who) {
  const entry = map.get(who.name);
  return heldBy(entry, who) ? entry : null;
}

export function clearIrpSessions() {
  irpSessions.clear();
}

const JOB_HOSTS = /^[a-z0-9.-]+\.s3[.-]([a-z0-9-]+\.)?amazonaws\.com$|^s3[.-]([a-z0-9-]+\.)?amazonaws\.com$/;
const JOB_OUTPUT_LIMIT = 8 * 1024 * 1024;

function withoutContentType(form, headers) {
  if (!form) return headers;
  const { 'content-type': _dropped, ...rest } = headers;
  return rest;
}

export function jobUrlAllowed(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password && JOB_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

function fillPath(template, values = {}) {
  const missing = [];
  const path = template.replace(/\{([^}]+)\}/g, (_, name) => {
    const value = values[name];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.push(name);
      return '';
    }
    return encodeURIComponent(String(value).trim());
  });
  return { path, missing };
}

function tokenOf(data) {
  const inner = data?.data && typeof data.data === 'object' ? data.data : {};
  return {
    token: String(inner.access_token || data?.access_token || inner.token || ''),
    refreshToken: String(inner.refresh_token || data?.refresh_token || ''),
    expiresAt: Number(inner.token_expiry || inner.expires_at || 0) || (Number(inner.expires_in || data?.expires_in || 0) ? Date.now() + Number(inner.expires_in || data.expires_in) * 1000 : 0),
  };
}

function withBusinessKeys(options) {
  const given = providerContext()?.sandbox;
  if (!given) return options;
  const session = {
    ...(options.taxpayerToken == null && given.taxpayerToken ? { taxpayerToken: given.taxpayerToken, taxpayerExpiresAt: Number(given.taxpayerExpiresAt || 0) } : {}),
    ...(options.fetchFn == null && typeof given.fetchFn === 'function' ? { fetchFn: given.fetchFn } : {}),
    ...(options.sessions == null && given.sessions && typeof given.sessions === 'object' ? { sessions: given.sessions } : {}),
    ...(options.onSession == null && typeof given.onSession === 'function' ? { onSession: given.onSession } : {}),
    ...(options.irpUser == null && given.irpUser ? { irpUser: given.irpUser } : {}),
  };
  if (!given.apiKey || options.apiKey != null) return { ...options, ...session };
  const environment = given.environment === 'production' || given.environment === 'live' ? 'live' : 'test';
  return { ...options, ...session, apiKey: given.apiKey, apiSecret: given.apiSecret || '', environment, baseUrl: SANDBOX_HOSTS[environment], saved: null };
}

function providerFailure(data) {
  const inner = data?.data;
  if (!inner || typeof inner !== 'object' || String(inner.status_cd ?? '') !== '0') return null;
  const error = inner.error || {};
  return { code: String(error.error_cd || 'PROVIDER_REFUSED'), message: String(error.message || error.msg || '') };
}

export class SandboxClient {
  constructor(given = {}) {
    const options = withBusinessKeys(given);
    const fileEnv = loadEnvFile();
    const read = (name) => {
      const value = process.env[name] ?? fileEnv[name] ?? '';
      return value === 'unset' ? '' : value;
    };
    const saved = options.saved === undefined ? loadSandboxKeys() : (options.saved || {});
    const savedUsable = Boolean(saved.apiKey && saved.apiSecret) && !read('MYCA_GSP_API_KEY') && !read('MYCA_GSP_LIVE_API_KEY') && !read('MYCA_GSP_TEST_API_KEY');
    const declared = String(read('MYCA_GSP_ENV')).toLowerCase();
    const savedEnvironment = savedUsable && !declared ? saved.environment : '';
    const forcedTest = testModeEnabled();
    this.baseUrl = forcedTest
      ? SANDBOX_HOSTS.test
      : String(options.baseUrl ?? read('MYCA_GSP_BASE_URL') ?? '').replace(/\/+$/, '') || (savedUsable ? (saved.baseUrl || SANDBOX_HOSTS[saved.environment]) : '') || 'https://api.sandbox.co.in';
    this.environment = forcedTest
      ? 'test'
      : options.environment ?? (declared === 'live' || declared === 'test' ? declared : savedEnvironment || detectEnvironment(this.baseUrl));
    const scoped = this.environment === 'live'
      ? { key: 'MYCA_GSP_LIVE_API_KEY', secret: 'MYCA_GSP_LIVE_API_SECRET' }
      : { key: 'MYCA_GSP_TEST_API_KEY', secret: 'MYCA_GSP_TEST_API_SECRET' };
    const scopedKey = read(scoped.key);
    const scopedSecret = read(scoped.secret);
    this.apiKey = options.apiKey ?? (scopedKey || read('MYCA_GSP_API_KEY') || (savedUsable ? saved.apiKey : ''));
    this.apiSecret = options.apiSecret ?? (scopedSecret || read('MYCA_GSP_API_SECRET') || (savedUsable ? saved.apiSecret : ''));
    this.keySource = options.apiKey != null ? 'explicit' : scopedKey ? scoped.key : read('MYCA_GSP_API_KEY') ? 'MYCA_GSP_API_KEY' : savedUsable ? 'saved' : 'none';
    this.apiVersion = options.apiVersion ?? '1.0.0';
    const send = options.fetchFn || ((...args) => globalThis.fetch(...args));
    this.fetchFn = (url, init = {}) => send(url, { redirect: 'error', ...init });
    const cached = heldEntry(platformTokens, platformHolder(this));
    this.token = cached?.token || null;
    this.tokenExpiresAt = cached?.expiresAt || 0;
    this.taxpayerToken = options.taxpayerToken || null;
    this.taxpayerExpiresAt = Number(options.taxpayerExpiresAt || 0);
    this.einvoiceToken = null;
    this.einvoiceExpiresAt = 0;
    this.sessions = {};
    for (const [kind, session] of Object.entries(options.sessions || {})) {
      if (session?.token) this.sessions[kind] = { token: String(session.token), expiresAt: Number(session.expiresAt || 0), refreshToken: session.refreshToken ? String(session.refreshToken) : '' };
    }
    this.onSession = typeof options.onSession === 'function' ? options.onSession : null;
    this.einvoiceHolder = null;
    this.irpUser = options.irpUser || null;
  }

  irpCredentials() {
    const given = this.irpUser || providerContext()?.govt || null;
    const cfg = given || loadGovtConfig();
    return {
      username: String(cfg?.username || '').trim(),
      password: String(cfg?.password || ''),
      gstin: String(cfg?.gstin || '').trim().toUpperCase(),
    };
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiSecret);
  }

  environmentLabel() {
    return `${this.environment === 'live' ? 'LIVE' : 'TEST'} (${this.baseUrl})`;
  }

  headers(token) {
    return {
      'x-api-key': this.apiKey,
      'x-api-version': this.apiVersion,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(token ? { authorization: token } : {}),
    };
  }

  async authenticate(force = false, options = {}) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'MISSING_SANDBOX_CREDENTIALS', hint: 'Configure MYCA_GSP_API_KEY and MYCA_GSP_API_SECRET in .env' };
    }
    const now = Date.now();
    if (!force && this.token && this.tokenExpiresAt > now + 60000) {
      return { ok: true, cached: true };
    }
    try {
      const res = await this.fetchFn(`${this.baseUrl}/authenticate`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'x-api-secret': this.apiSecret,
          'x-api-version': this.apiVersion,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        signal: deadline(options, 15000),
      });
      const data = await res.json().catch(() => ({}));
      const accessToken = data.access_token || data.data?.access_token;
      if (!res.ok || !accessToken) {
        return { ok: false, status: res.status, error: data.message || data.error || `HTTP ${res.status}` };
      }
      this.token = accessToken;
      this.tokenExpiresAt = now + (Number(data.expires_in || 82800) * 1000);
      const who = platformHolder(this);
      platformTokens.set(who.name, { ...who, token: this.token, expiresAt: this.tokenExpiresAt });
      return { ok: true, expiresIn: Number(data.expires_in || 82800), message: 'Sandbox authentication successful' };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  async request(endpoint, options = {}) {
    let token = options.token || null;
    if (!token) {
      const auth = await this.authenticate(false, options);
      if (!auth.ok) return auth;
      token = this.token;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(endpoint) && !endpoint.startsWith(`${this.baseUrl}/`)) return { ok: false, error: 'ENDPOINT_HOST_REFUSED', hint: 'A Sandbox request goes to the configured Sandbox host only.' };
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const send = async (authToken) => this.fetchFn(url, {
      method: options.method || 'POST',
      headers: withoutContentType(options.form, { ...this.headers(authToken), ...(options.headers || {}) }),
      body: options.form ? options.form : options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: deadline(options, 30000),
    });
    try {
      let res = await send(token);
      let data = await res.json().catch(() => ({}));
      if (res.status === 401 && !options.token) {
        this.token = null;
        const who = platformHolder(this);
        if (heldEntry(platformTokens, who)) platformTokens.delete(who.name);
        const retryAuth = await this.authenticate(true, options);
        if (!retryAuth.ok) return retryAuth;
        res = await send(this.token);
        data = await res.json().catch(() => ({}));
      }
      const refused = res.ok ? providerFailure(data) : null;
      if (refused) return { ok: false, status: res.status, error: refused.code, message: refused.message, data };
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  async ping(options = {}) {
    if (!this.isConfigured()) {
      return { ok: false, configured: false, error: 'CREDENTIALS_NOT_CONFIGURED' };
    }
    const started = Date.now();
    const auth = await this.authenticate(true, options);
    const ms = Date.now() - started;
    return {
      ok: auth.ok,
      configured: true,
      provider: 'sandbox',
      environment: this.environment,
      keySource: this.keySource,
      baseUrl: this.baseUrl,
      ms,
      error: auth.error,
      authenticatedAt: auth.ok ? new Date().toISOString() : null,
    };
  }

  sessionToken(kind) {
    if (kind === 'platform') return null;
    if (kind === 'gst_taxpayer') return this.taxpayerToken && !(this.taxpayerExpiresAt && this.taxpayerExpiresAt < Date.now()) ? this.taxpayerToken : null;
    const session = this.sessions[kind];
    if (!session?.token) return null;
    if (session.expiresAt && session.expiresAt < Date.now()) return null;
    return session.token;
  }

  keepSession(kind, found) {
    if (!found.token) return false;
    if (kind === 'gst_taxpayer') {
      this.taxpayerToken = found.token;
      this.taxpayerExpiresAt = found.expiresAt || Date.now() + 6 * 3600 * 1000;
    } else {
      this.sessions[kind] = { token: found.token, refreshToken: found.refreshToken || this.sessions[kind]?.refreshToken || '', expiresAt: found.expiresAt || 0 };
    }
    if (this.onSession) this.onSession(kind, { ...this.sessions[kind] || { token: this.taxpayerToken, expiresAt: this.taxpayerExpiresAt } });
    return true;
  }

  dropSession(kind) {
    if (kind === 'gst_taxpayer') {
      this.taxpayerToken = null;
      this.taxpayerExpiresAt = 0;
    } else {
      delete this.sessions[kind];
    }
    if (this.onSession) this.onSession(kind, null);
  }

  async callEndpoint(endpointId, { pathParams = {}, query = {}, body, file } = {}, options = {}) {
    const endpoint = quickoEndpoint(endpointId);
    if (!endpoint) return { ok: false, error: 'UNKNOWN_SANDBOX_ENDPOINT' };
    const filled = fillPath(endpoint.path, pathParams);
    if (filled.missing.length) return { ok: false, error: 'PATH_PARAMS_REQUIRED', missing: filled.missing };
    const missingQuery = endpoint.query.filter((q) => q.required && (query[q.name] === undefined || query[q.name] === null || query[q.name] === '')).map((q) => q.name);
    if (missingQuery.length) return { ok: false, error: 'QUERY_PARAMS_REQUIRED', missing: missingQuery };
    const known = new Set(endpoint.query.map((q) => q.name));
    const sent = Object.fromEntries(Object.entries(query).filter(([name]) => known.has(name)));
    let token = null;
    if (endpoint.session !== 'platform') {
      token = this.sessionToken(endpoint.session);
      if (!token) return { ok: false, error: 'PORTAL_SESSION_REQUIRED', session: endpoint.session, hint: 'Sign in to the portal first (the login operation for this session), then try again.' };
    }
    let form = null;
    if (endpoint.body === 'multipart') {
      if (!file?.bytes) return { ok: false, error: 'FILE_REQUIRED', hint: 'Upload the PDF with /api/upload and pass params.documentSha256.' };
      form = new FormData();
      form.append('file', new Blob([file.bytes], { type: file.type || 'application/pdf' }), file.name || 'document.pdf');
    }
    const res = await this.request(`${filled.path}${qs(sent)}`, {
      ...options,
      method: endpoint.method,
      ...(token ? { token } : {}),
      ...(form ? { form } : endpoint.method === 'GET' || endpoint.method === 'DELETE' || body === undefined ? {} : { body }),
    });
    if (res.ok && endpoint.opensSession) {
      const kept = this.keepSession(endpoint.opensSession, tokenOf(res.data));
      return { ...res, sessionEstablished: kept, session: endpoint.opensSession };
    }
    if (res.ok && endpoint.closesSession) this.dropSession(endpoint.closesSession);
    return res;
  }

  async uploadJobPayload(url, { bytes, contentType = 'application/json' } = {}, options = {}) {
    if (!jobUrlAllowed(url)) return { ok: false, error: 'JOB_URL_NOT_ALLOWED', hint: 'Only the pre-signed S3 URL Sandbox returned for the job is accepted.' };
    if (bytes === undefined || bytes === null) return { ok: false, error: 'JOB_INPUT_REQUIRED' };
    try {
      const res = await this.fetchFn(String(url), { method: 'PUT', headers: { 'content-type': contentType }, body: bytes, signal: deadline(options, 60000) });
      return res.ok ? { ok: true, status: res.status } : { ok: false, error: `UPLOAD_HTTP_${res.status}` };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  async fetchJobOutput(url, options = {}) {
    if (!jobUrlAllowed(url)) return { ok: false, error: 'JOB_URL_NOT_ALLOWED' };
    try {
      const res = await this.fetchFn(String(url), { method: 'GET', signal: deadline(options, 60000) });
      if (!res.ok) return { ok: false, error: `DOWNLOAD_HTTP_${res.status}` };
      const declared = Number(res.headers?.get?.('content-length') || 0);
      if (declared > JOB_OUTPUT_LIMIT) return { ok: false, error: 'JOB_OUTPUT_TOO_LARGE', bytes: declared };
      const text = await res.text();
      if (text.length > JOB_OUTPUT_LIMIT) return { ok: false, error: 'JOB_OUTPUT_TOO_LARGE', bytes: text.length };
      const type = String(res.headers?.get?.('content-type') || '');
      if (/json/.test(type) || /^\s*[[{]/.test(text)) {
        try {
          return { ok: true, contentType: type || 'application/json', output: JSON.parse(text) };
        } catch {
          return { ok: true, contentType: type, text };
        }
      }
      return { ok: true, contentType: type, text };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // ---- GST compliance: public (platform token) ----
  async searchGstin(gstin) {
    const cleanGstin = String(gstin || '').trim().toUpperCase();
    if (cleanGstin.length !== 15) return { ok: false, error: 'INVALID_GSTIN_FORMAT' };
    const res = await this.request('/gst/compliance/public/gstin/search', { body: { gstin: cleanGstin } });
    if (res.ok && res.data?.data) {
      const d = res.data.data.data || res.data.data;
      return {
        ok: true,
        gstin: cleanGstin,
        legalName: d.lgnm || d.tradeNam || '',
        tradeName: d.tradeNam || d.lgnm || '',
        status: d.sts || d.status || '',
        taxpayerType: d.dty || '',
        stateCode: d.stjCd || cleanGstin.slice(0, 2),
        registrationDate: d.rgdt || '',
        eInvoiceStatus: d.einvoiceStatus || '',
        natureOfBusiness: d.nba || [],
        raw: d,
      };
    }
    return res;
  }

  async verifyGstin(gstin) {
    const cleanGstin = String(gstin || '').trim().toUpperCase();
    if (cleanGstin.length !== 15) return { ok: false, error: 'INVALID_GSTIN_FORMAT' };
    return this.request('/gst/compliance/public/gstin/verify', { body: { gstin: cleanGstin } });
  }

  async trackGstrs(gstin, financialYear, gstr) {
    const cleanGstin = String(gstin || '').trim().toUpperCase();
    const query = qs({ financial_year: financialYear || undefined, gstr: gstr || undefined });
    return this.request(`/gst/compliance/public/gstrs/track${query}`, { body: { gstin: cleanGstin } });
  }

  // ---- GST compliance: taxpayer session ----
  async generateTaxpayerOtp(username, gstin) {
    return this.request('/gst/compliance/tax-payer/otp', {
      body: { username: String(username || '').trim(), gstin: String(gstin || '').trim().toUpperCase() },
    });
  }

  async verifyTaxpayerOtp(username, gstin, otp) {
    const res = await this.request(`/gst/compliance/tax-payer/otp/verify${qs({ otp })}`, {
      body: { username: String(username || '').trim(), gstin: String(gstin || '').trim().toUpperCase() },
    });
    const token = res.data?.data?.access_token || res.data?.access_token;
    if (res.ok && token) {
      this.taxpayerToken = token;
      const expires = Number(res.data?.data?.token_expiry || res.data?.data?.session_expiry || 0);
      this.taxpayerExpiresAt = expires > 0 ? expires : Date.now() + 6 * 3600 * 1000;
    }
    return res;
  }

  async refreshTaxpayerSession() {
    if (!this.taxpayerToken) return { ok: false, error: 'GST_PORTAL_NOT_CONNECTED' };
    const res = await this.request('/gst/compliance/tax-payer/session/refresh', { token: this.taxpayerToken, body: {} });
    const token = res.data?.data?.access_token;
    if (res.ok && token) {
      this.taxpayerToken = token;
      const expires = Number(res.data?.data?.token_expiry || res.data?.data?.session_expiry || 0);
      this.taxpayerExpiresAt = expires > 0 ? expires : Date.now() + 6 * 3600 * 1000;
    }
    return res;
  }

  async gstr1Summary(year, month) {
    const token = this.taxpayerToken || this.token;
    return this.request(`/gst/compliance/tax-payer/gstrs/gstr-1/${encodeURIComponent(year)}/${encodeURIComponent(month)}`, { method: 'GET', token });
  }

  async returnProcessingStatus(year, month, referenceId) {
    const token = this.taxpayerToken || this.token;
    return this.request(`/gst/compliance/tax-payer/gstrs/${encodeURIComponent(year)}/${encodeURIComponent(month)}/status${qs({ reference_id: referenceId })}`, { method: 'GET', token });
  }

  async generateEvcOtp(pan, gstr) {
    const token = this.taxpayerToken || this.token;
    return this.request(`/gst/compliance/tax-payer/evc/otp${qs({ gstr: gstr || 'gstr-1' })}`, {
      token,
      body: { pan: String(pan || '').trim().toUpperCase() },
    });
  }

  async trackTaxpayerReturns(year, month, returnType) {
    const token = this.taxpayerToken || this.token;
    const query = qs({ return_type: returnType || undefined });
    return this.request(`/gst/compliance/tax-payer/gstrs/${encodeURIComponent(year)}/${encodeURIComponent(month)}/track${query}`, { method: 'GET', token });
  }

  // ---- GSTR-1 filing (taxpayer token) ----
  async saveGstr1({ year, month, payload } = {}) {
    const token = this.taxpayerToken || this.token;
    return this.request(`/gst/compliance/tax-payer/gstrs/gstr-1/${encodeURIComponent(year)}/${encodeURIComponent(month)}`, {
      token,
      body: payload,
    });
  }

  async newProceedGstr1({ year, month, gstr = 'gstr-1', isNil } = {}) {
    const token = this.taxpayerToken || this.token;
    const query = qs({ is_nil: isNil || undefined });
    return this.request(`/gst/compliance/tax-payer/gstrs/${encodeURIComponent(gstr)}/${encodeURIComponent(year)}/${encodeURIComponent(month)}/new-proceed${query}`, { token });
  }

  async fileGstr1({ year, month, pan, otp, summary } = {}) {
    const token = this.taxpayerToken || this.token;
    const query = qs({ pan: String(pan || '').toUpperCase(), otp });
    return this.request(`/gst/compliance/tax-payer/gstrs/gstr-1/${encodeURIComponent(year)}/${encodeURIComponent(month)}/file${query}`, {
      token,
      body: summary,
    });
  }

  async saveGstr3b({ year, month, payload } = {}) {
    const token = this.taxpayerToken || this.token;
    return this.request(`/gst/compliance/tax-payer/gstrs/gstr-3b/${encodeURIComponent(year)}/${encodeURIComponent(month)}`, { token, body: payload });
  }

  async gstr3bAutoLiability(year, month) {
    const token = this.taxpayerToken || this.token;
    return this.request(`/gst/compliance/tax-payer/gstrs/gstr-3b/${encodeURIComponent(year)}/${encodeURIComponent(month)}/auto-liability-calc`, { method: 'GET', token });
  }

  async offsetGstr3bLiability({ year, month, payload } = {}) {
    const token = this.taxpayerToken || this.token;
    return this.request(`/gst/compliance/tax-payer/gstrs/gstr-3b/${encodeURIComponent(year)}/${encodeURIComponent(month)}/offset-liability`, { token, body: payload });
  }

  async fileGstr3b({ year, month, pan, otp, payload } = {}) {
    const token = this.taxpayerToken || this.token;
    const query = qs({ pan: String(pan || '').toUpperCase(), otp });
    return this.request(`/gst/compliance/tax-payer/gstrs/gstr-3b/${encodeURIComponent(year)}/${encodeURIComponent(month)}/file${query}`, { token, body: payload });
  }

  // ---- GST analytics: GSTR-2B reconciliation (platform token) ----
  async submitGstr2bReconJob({ gstin, year, month, reconciliationCriteria = 'moderate', filingPreference = 'monthly' } = {}) {
    return this.request('/gst/analytics/gstr-2b-reconciliation', {
      body: {
        '@entity': 'in.co.sandbox.gst.analytics.gstr-2b_reconciliation.request',
        gstin: String(gstin || '').trim().toUpperCase(),
        year: Number(year),
        month: Number(month),
        reconciliation_criteria: reconciliationCriteria,
        filing_preference: filingPreference,
      },
    });
  }

  // ---- E-invoice (E-invoice access token) ----
  async einvoiceAuthenticate({ username, password, gstin, force = false } = {}) {
    const res = await this.request(`/gst/compliance/e-invoice/tax-payer/authenticate${qs({ force: force ? 'true' : 'false' })}`, {
      body: {
        username: String(username || '').trim(),
        password: String(password || ''),
        gstin: String(gstin || '').trim().toUpperCase(),
      },
    });
    const data = res.data?.data || {};
    if (res.ok && Number(data.Status) === 1 && data.access_token) {
      this.einvoiceToken = data.access_token;
      if (!this.irpUser) this.irpUser = { username: String(username || '').trim(), password: String(password || ''), gstin: String(gstin || '').trim().toUpperCase() };
      this.einvoiceHolder = irpHolder(this, this.irpCredentials());
      const expires = Number(data.expiry || 0);
      this.einvoiceExpiresAt = expires > 0 ? expires : Date.now() + 6 * 3600 * 1000;
    }
    return res;
  }

  async generateEinvoice(payload) {
    return this.ewbRequest('/gst/compliance/e-invoice/tax-payer/invoice', { body: payload });
  }

  async cancelEinvoice({ irn, reason = '1', remark = '' } = {}) {
    return this.ewbRequest(`/gst/compliance/e-invoice/tax-payer/invoice/${encodeURIComponent(irn)}/cancel`, {
      body: { Irn: String(irn || ''), CnlRsn: String(reason), CnlRem: String(remark || '').slice(0, 100) },
    });
  }

  async ewayBillAuthenticate({ username, password, gstin, force = false } = {}) {
    const res = await this.request('/gst/compliance/e-way-bill/tax-payer/authenticate', {
      body: {
        username: String(username || '').trim(),
        password: String(password || ''),
        gstin: String(gstin || '').trim().toUpperCase(),
      },
    });
    const data = res.data?.data || {};
    if (res.ok && Number(data.Status) === 1 && data.access_token) {
      const expires = Number(data.expiry || 0);
      this.einvoiceToken = data.access_token;
      this.einvoiceHolder = irpHolder(this, { username, password, gstin });
      this.einvoiceExpiresAt = expires > Date.now() ? expires : Date.now() + IRP_SESSION_MS;
      return { ok: true, status: res.status, expiresAt: this.einvoiceExpiresAt };
    }
    const refused = ewbRefusal(data);
    if (refused) return { ok: false, status: res.status, error: refused.error, message: refused.message };
    return { ok: false, status: res.status, error: res.error || 'EWB_AUTH_FAILED', message: res.message || '' };
  }

  async irpToken(force = false) {
    const now = Date.now();
    const creds = this.irpCredentials();
    const who = irpHolder(this, creds);
    if (!force && this.einvoiceToken && this.einvoiceExpiresAt > now + 60000 && heldBy(this.einvoiceHolder, who)) return { ok: true, token: this.einvoiceToken };
    if (!creds.username || !creds.password || !creds.gstin) {
      return { ok: false, error: 'EWB_API_USER_MISSING', hint: 'Save the e-invoice / e-way bill API username, password and GSTIN (created on the e-way bill portal for the GSP Sandbox by Quicko) first.' };
    }
    const cached = heldEntry(irpSessions, who);
    if (!force && cached && cached.expiresAt > now + 60000) {
      this.einvoiceToken = cached.token;
      this.einvoiceExpiresAt = cached.expiresAt;
      this.einvoiceHolder = who;
      return { ok: true, token: cached.token };
    }
    const auth = await this.ewayBillAuthenticate(creds);
    if (!auth.ok) return auth;
    this.einvoiceHolder = who;
    irpSessions.delete(who.name);
    irpSessions.set(who.name, { ...who, token: this.einvoiceToken, expiresAt: this.einvoiceExpiresAt });
    while (irpSessions.size > MAX_IRP_SESSIONS) irpSessions.delete(irpSessions.keys().next().value);
    return { ok: true, token: this.einvoiceToken };
  }

  async ewbRequest(endpoint, { method = 'POST', body } = {}) {
    let session = await this.irpToken();
    if (!session.ok) return { ...session, environment: this.environment };
    let res = await this.request(endpoint, { method, body, token: session.token });
    if (res.status === 401) {
      this.einvoiceToken = null;
      const who = irpHolder(this, this.irpCredentials());
      if (heldEntry(irpSessions, who)) irpSessions.delete(who.name);
      session = await this.irpToken(true);
      if (!session.ok) return session;
      res = await this.request(endpoint, { method, body, token: session.token });
    }
    const refused = res.ok ? ewbRefusal(res.data?.data) : null;
    if (refused) return { ok: false, status: res.status, error: refused.error, message: refused.message, data: res.data, environment: this.environment };
    return { ...res, environment: this.environment };
  }

  async generateEwayBillByIrn(irn, transport = {}) {
    return this.ewbRequest(`/gst/compliance/e-invoice/tax-payer/invoice/${encodeURIComponent(irn)}/e-way-bill`, { body: { Irn: String(irn || ''), ...transport } });
  }

  async getEwayBillByIrn(irn) {
    return this.ewbRequest(`/gst/compliance/e-invoice/tax-payer/invoice/${encodeURIComponent(irn)}/e-way-bill`, { method: 'GET' });
  }

  async generateEwayBill(partA) {
    return this.ewbRequest('/gst/compliance/e-way-bill/consignor/bill', { body: partA });
  }

  async getEwayBill(ewbNo) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/tax-payer/bill/${encodeURIComponent(ewbNo)}`, { method: 'GET' });
  }

  async ewayBillByDocument({ docType = 'INV', docNo } = {}) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignor/bill${qs({ document_type: docType, document_number: docNo })}`, { method: 'GET' });
  }

  async cancelEwayBill({ ewbNo, reasonCode, remark = '' } = {}) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignor/bill/${encodeURIComponent(ewbNo)}/cancel`, {
      body: { ewbNo: Number(ewbNo), cancelRsnCode: Number(reasonCode), cancelRmrk: String(remark || '').slice(0, 50) },
    });
  }

  async updateEwayBillVehicle(ewbNo, partB) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignor/bill/${encodeURIComponent(ewbNo)}/vehicle`, { method: 'PUT', body: { ewbNo: Number(ewbNo), ...partB } });
  }

  async updateEwayBillTransporter(ewbNo, transporterId) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignor/bill/${encodeURIComponent(ewbNo)}/transporter`, { method: 'PUT', body: { ewbNo: Number(ewbNo), transporterId: String(transporterId || '') } });
  }

  async extendEwayBill(ewbNo, extension) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignor/bill/${encodeURIComponent(ewbNo)}/extend`, { body: { ewbNo: Number(ewbNo), ...extension } });
  }

  async consolidateEwayBills(trip) {
    return this.ewbRequest('/gst/compliance/e-way-bill/consignor/consolidated-bill', { body: trip });
  }

  async startMultiVehicle(ewbNo, movement) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignor/bill/${encodeURIComponent(ewbNo)}/multi-vehicle`, { body: { ewbNo: Number(ewbNo), ...movement } });
  }

  async addMultiVehicle(ewbNo, vehicle) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignor/bill/${encodeURIComponent(ewbNo)}/multi-vehicle/vehicle`, { body: { ewbNo: Number(ewbNo), ...vehicle } });
  }

  async changeMultiVehicle(ewbNo, change) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignor/bill/${encodeURIComponent(ewbNo)}/multi-vehicle/vehicle`, { method: 'PUT', body: { ewbNo: Number(ewbNo), ...change } });
  }

  async consigneeEwayBills(generatedDate) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignee/bills${qs({ generated_date: generatedDate })}`, { method: 'GET' });
  }

  async rejectEwayBill(ewbNo) {
    return this.ewbRequest(`/gst/compliance/e-way-bill/consignee/bill/${encodeURIComponent(ewbNo)}/reject`, { body: { ewbNo: Number(ewbNo) } });
  }

  // ---- TDS (platform token) ----
  async submitTdsAnalyticsJob({ quarter, tan, form, financialYear } = {}) {
    return this.request('/tds/analytics/potential-notices', {
      body: {
        '@entity': 'in.co.sandbox.tds.analytics.potential_notice.request',
        quarter: String(quarter || ''),
        tan: String(tan || '').trim().toUpperCase(),
        form: String(form || '26Q'),
        financial_year: String(financialYear || ''),
      },
    });
  }

  async submitTdsFvuJob({ taxYear, quarter, form, tan, filingType = 'regular' } = {}) {
    return this.request('/tds/compliance/fvu/generate', {
      body: {
        '@entity': 'in.co.sandbox.tds.compliance.fvu.generate.request',
        tax_year: String(taxYear || ''),
        quarter: String(quarter || ''),
        form: String(form || '26Q'),
        tan: String(tan || '').trim().toUpperCase(),
        filing_type: String(filingType || 'regular'),
      },
    });
  }
}

let defaultClient = null;
export function getSandboxClient() {
  if (providerContext()?.sandbox) return new SandboxClient();
  if (!defaultClient) defaultClient = new SandboxClient();
  return defaultClient;
}

export function resetSandboxClient() {
  defaultClient = null;
}
