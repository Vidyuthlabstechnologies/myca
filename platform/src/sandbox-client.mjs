import { loadEnvFile, testModeEnabled } from './runtime-config.mjs';
import { providerContext } from './provider-context.mjs';
import { loadSandboxKeys, SANDBOX_HOSTS } from './sandbox-keys.mjs';
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
// IRP / e-way bill sessions (one access token covers both), keyed by the API key and the
// taxpayer's API user so that no other GSTIN is ever sent under a session.
const irpSessions = new Map();
const MAX_IRP_SESSIONS = 256;
const IRP_SESSION_MS = 6 * 3600 * 1000;

function irpSessionKey(client, creds) {
  return [client.baseUrl, client.apiKey, creds.gstin, creds.username].map((part) => String(part || '').trim()).join('|');
}

export function clearIrpSessions() {
  irpSessions.clear();
}

function withBusinessKeys(options) {
  const given = providerContext()?.sandbox;
  if (!given) return options;
  const session = {
    ...(options.taxpayerToken == null && given.taxpayerToken ? { taxpayerToken: given.taxpayerToken, taxpayerExpiresAt: Number(given.taxpayerExpiresAt || 0) } : {}),
    ...(options.fetchFn == null && typeof given.fetchFn === 'function' ? { fetchFn: given.fetchFn } : {}),
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
    this.fetchFn = options.fetchFn || ((...args) => globalThis.fetch(...args));
    const cached = platformTokens.get(`${this.baseUrl}|${this.apiKey}`);
    this.token = cached?.token || null;
    this.tokenExpiresAt = cached?.expiresAt || 0;
    this.taxpayerToken = options.taxpayerToken || null;
    this.taxpayerExpiresAt = Number(options.taxpayerExpiresAt || 0);
    this.einvoiceToken = null;
    this.einvoiceExpiresAt = 0;
    this.einvoiceKey = null;
    this.irpUser = options.irpUser || null;
  }

  // The e-invoice / e-way bill API user (created on the IRP or EWB portal for the GSP).
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
      platformTokens.set(`${this.baseUrl}|${this.apiKey}`, { token: this.token, expiresAt: this.tokenExpiresAt });
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
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const send = async (authToken) => this.fetchFn(url, {
      method: options.method || 'POST',
      headers: { ...this.headers(authToken), ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: deadline(options, 30000),
    });
    try {
      let res = await send(token);
      let data = await res.json().catch(() => ({}));
      if (res.status === 401 && !options.token) {
        this.token = null;
        platformTokens.delete(`${this.baseUrl}|${this.apiKey}`);
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
      // Later e-invoice and e-way bill calls on this client run as the user who signed in.
      if (!this.irpUser) this.irpUser = { username: String(username || '').trim(), password: String(password || ''), gstin: String(gstin || '').trim().toUpperCase() };
      this.einvoiceKey = irpSessionKey(this, this.irpCredentials());
      const expires = Number(data.expiry || 0);
      this.einvoiceExpiresAt = expires > 0 ? expires : Date.now() + 6 * 3600 * 1000;
    }
    return res;
  }

  // The IRP session opens on first use from the saved API user (see irpToken), so a
  // generate never goes out under the platform token.
  async generateEinvoice(payload) {
    return this.ewbRequest('/gst/compliance/e-invoice/tax-payer/invoice', { body: payload });
  }

  async cancelEinvoice({ irn, reason = '1', remark = '' } = {}) {
    return this.ewbRequest(`/gst/compliance/e-invoice/tax-payer/invoice/${encodeURIComponent(irn)}/cancel`, {
      body: { Irn: String(irn || ''), CnlRsn: String(reason), CnlRem: String(remark || '').slice(0, 100) },
    });
  }

  // ---- E-way bill (IRP / EWB access token, shared with e-invoice) ----
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
      this.einvoiceKey = irpSessionKey(this, { username, gstin: String(gstin || '').trim().toUpperCase() });
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
    const key = irpSessionKey(this, creds);
    // A token opened explicitly (einvoice_authenticate) or earlier for the same API user.
    if (!force && this.einvoiceToken && this.einvoiceExpiresAt > now + 60000 && this.einvoiceKey === key) return { ok: true, token: this.einvoiceToken };
    if (!creds.username || !creds.password || !creds.gstin) {
      return { ok: false, error: 'EWB_API_USER_MISSING', hint: 'Save the e-invoice / e-way bill API username, password and GSTIN (created on the e-way bill portal for the GSP Sandbox by Quicko) first.' };
    }
    const cached = irpSessions.get(key);
    if (!force && cached && cached.expiresAt > now + 60000) {
      this.einvoiceToken = cached.token;
      this.einvoiceExpiresAt = cached.expiresAt;
      this.einvoiceKey = key;
      return { ok: true, token: cached.token };
    }
    const auth = await this.ewayBillAuthenticate(creds);
    if (!auth.ok) return auth;
    this.einvoiceKey = key;
    irpSessions.delete(key);
    irpSessions.set(key, { token: this.einvoiceToken, expiresAt: this.einvoiceExpiresAt });
    while (irpSessions.size > MAX_IRP_SESSIONS) irpSessions.delete(irpSessions.keys().next().value);
    return { ok: true, token: this.einvoiceToken };
  }

  // One authenticated e-way bill call. A refusal (status "0") comes back as ok:false with
  // the NIC error code; an expired session is renewed once.
  async ewbRequest(endpoint, { method = 'POST', body } = {}) {
    let session = await this.irpToken();
    if (!session.ok) return { ...session, environment: this.environment };
    let res = await this.request(endpoint, { method, body, token: session.token });
    if (res.status === 401) {
      this.einvoiceToken = null;
      irpSessions.delete(irpSessionKey(this, this.irpCredentials()));
      session = await this.irpToken(true);
      if (!session.ok) return session;
      res = await this.request(endpoint, { method, body, token: session.token });
    }
    const refused = res.ok ? ewbRefusal(res.data?.data) : null;
    if (refused) return { ok: false, status: res.status, error: refused.error, message: refused.message, data: res.data, environment: this.environment };
    // The adapter only sees the scoped transport functions, so the answer says which
    // environment (test or live key) it came from.
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
