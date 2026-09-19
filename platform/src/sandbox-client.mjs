import { loadEnvFile } from './runtime-config.mjs';

function detectEnvironment(baseUrl) {
  return /test/i.test(String(baseUrl)) ? 'test' : 'live';
}

function qs(params = {}) {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export class SandboxClient {
  constructor(options = {}) {
    const fileEnv = loadEnvFile();
    const read = (name) => process.env[name] ?? fileEnv[name] ?? '';
    this.baseUrl = String(options.baseUrl ?? read('MYCA_GSP_BASE_URL') ?? '').replace(/\/+$/, '') || 'https://api.sandbox.co.in';
    const declared = String(read('MYCA_GSP_ENV')).toLowerCase();
    this.environment = options.environment
      ?? (declared === 'live' || declared === 'test' ? declared : detectEnvironment(this.baseUrl));
    const scoped = this.environment === 'live'
      ? { key: 'MYCA_GSP_LIVE_API_KEY', secret: 'MYCA_GSP_LIVE_API_SECRET' }
      : { key: 'MYCA_GSP_TEST_API_KEY', secret: 'MYCA_GSP_TEST_API_SECRET' };
    const scopedKey = read(scoped.key);
    const scopedSecret = read(scoped.secret);
    this.apiKey = options.apiKey ?? (scopedKey || read('MYCA_GSP_API_KEY'));
    this.apiSecret = options.apiSecret ?? (scopedSecret || read('MYCA_GSP_API_SECRET'));
    this.keySource = options.apiKey != null ? 'explicit' : (scopedKey ? scoped.key : 'MYCA_GSP_API_KEY');
    this.apiVersion = options.apiVersion ?? '1.0.0';
    this.fetchFn = options.fetchFn || fetch;
    this.token = null;
    this.tokenExpiresAt = 0;
    this.taxpayerToken = null;
    this.taxpayerExpiresAt = 0;
    this.einvoiceToken = null;
    this.einvoiceExpiresAt = 0;
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

  async authenticate(force = false) {
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
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) {
        return { ok: false, status: res.status, error: data.message || data.error || `HTTP ${res.status}` };
      }
      this.token = data.access_token;
      this.tokenExpiresAt = now + (Number(data.expires_in || 82800) * 1000);
      return { ok: true, expiresIn: Number(data.expires_in || 82800), message: 'Sandbox authentication successful' };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  async request(endpoint, options = {}) {
    let token = options.token || null;
    if (!token) {
      const auth = await this.authenticate();
      if (!auth.ok) return auth;
      token = this.token;
    }
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const send = async (authToken) => this.fetchFn(url, {
      method: options.method || 'POST',
      headers: { ...this.headers(authToken), ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    try {
      let res = await send(token);
      let data = await res.json().catch(() => ({}));
      if (res.status === 401 && !options.token) {
        this.token = null;
        const retryAuth = await this.authenticate(true);
        if (!retryAuth.ok) return retryAuth;
        res = await send(this.token);
        data = await res.json().catch(() => ({}));
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  async ping() {
    if (!this.isConfigured()) {
      return { ok: false, configured: false, error: 'CREDENTIALS_NOT_CONFIGURED' };
    }
    const started = Date.now();
    const auth = await this.authenticate(true);
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
      const expires = Number(data.expiry || 0);
      this.einvoiceExpiresAt = expires > 0 ? expires : Date.now() + 6 * 3600 * 1000;
    }
    return res;
  }

  async generateEinvoice(payload) {
    const token = this.einvoiceToken || this.token;
    return this.request('/gst/compliance/e-invoice/tax-payer/invoice', { token, body: payload });
  }

  async cancelEinvoice({ irn, reason = '1', remark = '' } = {}) {
    const token = this.einvoiceToken || this.token;
    return this.request(`/gst/compliance/e-invoice/tax-payer/invoice/${encodeURIComponent(irn)}/cancel`, {
      token,
      body: { Irn: String(irn || ''), CnlRsn: String(reason), CnlRem: String(remark || '') },
    });
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
  if (!defaultClient) defaultClient = new SandboxClient();
  return defaultClient;
}
