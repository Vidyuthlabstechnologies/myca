import { loadEnvFile } from './runtime-config.mjs';

export class SandboxClient {
  constructor(options = {}) {
    const env = loadEnvFile();
    this.baseUrl = options.baseUrl ?? process.env.MYCA_GSP_BASE_URL ?? env.MYCA_GSP_BASE_URL ?? 'https://api.sandbox.co.in';
    this.apiKey = options.apiKey ?? process.env.MYCA_GSP_API_KEY ?? env.MYCA_GSP_API_KEY ?? '';
    this.apiSecret = options.apiSecret ?? process.env.MYCA_GSP_API_SECRET ?? env.MYCA_GSP_API_SECRET ?? '';
    this.apiVersion = options.apiVersion ?? '1.0';
    this.fetchFn = options.fetchFn || fetch;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiSecret);
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
          'accept': 'application/json',
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) {
        return {
          ok: false,
          status: res.status,
          error: data.message || data.error || `HTTP ${res.status}`,
        };
      }
      this.token = data.access_token;
      // Tokens are typically valid for 24h (86400s), default to 23h validity
      const ttlSec = Number(data.expires_in || 82800);
      this.tokenExpiresAt = now + (ttlSec * 1000);
      return {
        ok: true,
        expiresIn: ttlSec,
        message: 'Sandbox authentication successful',
      };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  async request(endpoint, options = {}) {
    const auth = await this.authenticate();
    if (!auth.ok) return auth;
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const headers = {
      'Authorization': this.token,
      'x-api-key': this.apiKey,
      'x-api-version': this.apiVersion,
      'content-type': 'application/json',
      'accept': 'application/json',
      ...(options.headers || {}),
    };
    try {
      const res = await this.fetchFn(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // Token expired, retry once
        this.token = null;
        const retryAuth = await this.authenticate(true);
        if (!retryAuth.ok) return retryAuth;
        headers['Authorization'] = this.token;
        const retryRes = await this.fetchFn(url, {
          method: options.method || 'GET',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        const retryData = await retryRes.json().catch(() => ({}));
        return { ok: retryRes.ok, status: retryRes.status, data: retryData };
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
      baseUrl: this.baseUrl,
      ms,
      error: auth.error,
      authenticatedAt: auth.ok ? new Date().toISOString() : null,
    };
  }

  async searchGstin(gstin) {
    const cleanGstin = String(gstin || '').trim().toUpperCase();
    if (cleanGstin.length !== 15) {
      return { ok: false, error: 'INVALID_GSTIN_FORMAT' };
    }
    const res = await this.request('/gst/compliance/public/gstin/search', {
      method: 'POST',
      body: { gstin: cleanGstin },
    });
    if (res.ok && res.data?.data) {
      const d = res.data.data.data || res.data.data;
      return {
        ok: true,
        gstin: cleanGstin,
        legalName: d.lgnm || d.tradeNam || '',
        tradeName: d.tradeNam || d.lgnm || '',
        status: d.sts || d.status || 'Active',
        taxpayerType: d.dty || 'Regular',
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
    return this.request('/gst/compliance/public/gstin/verify', {
      method: 'POST',
      body: { gstin: cleanGstin },
    });
  }

  async trackReturns(gstin, fy = '') {
    const cleanGstin = String(gstin || '').trim().toUpperCase();
    return this.request('/gst/compliance/taxpayer/common/track_returns', {
      method: 'POST',
      body: { gstin: cleanGstin, fy: fy || undefined },
    });
  }

  async generateTaxpayerOtp(gstin, username) {
    const cleanGstin = String(gstin || '').trim().toUpperCase();
    return this.request('/gst/compliance/taxpayer/otp/generate', {
      method: 'POST',
      body: { gstin: cleanGstin, username: String(username || '').trim() },
    });
  }

  async verifyTaxpayerOtp(gstin, username, otp) {
    const cleanGstin = String(gstin || '').trim().toUpperCase();
    return this.request('/gst/compliance/taxpayer/otp/verify', {
      method: 'POST',
      body: { gstin: cleanGstin, username: String(username || '').trim(), otp: String(otp || '').trim() },
    });
  }

  async calculateIncomeTax(payload = {}) {
    return this.request('/it/calculator/calculate', {
      method: 'POST',
      body: {
        financial_year: payload.fy || payload.financial_year || '2026-27',
        regime: payload.regime || 'new',
        income_details: payload.income_details || { gross_salary: Number(payload.grossSalary || payload.income || 0) },
        deductions: payload.deductions || {},
      },
    });
  }

  async submitTdsAnalyticsJob(payload = {}) {
    return this.request('/tds/analytics/jobs', {
      method: 'POST',
      body: {
        tan: String(payload.tan || '').trim().toUpperCase(),
        financial_year: payload.fy || payload.financial_year || '2026-27',
        quarter: payload.quarter || 'Q1',
        form_type: payload.formType || '26Q',
      },
    });
  }

  async submitGstr2bReconJob(payload = {}) {
    return this.request('/gst/analytics/gstr-2b-reconciliation/jobs', {
      method: 'POST',
      body: {
        gstin: String(payload.gstin || '').trim().toUpperCase(),
        return_period: String(payload.period || payload.return_period || '').trim(),
      },
    });
  }

  async generateEInvoice(payload = {}) {
    return this.request('/gst/compliance/einvoice/generate', {
      method: 'POST',
      body: payload,
    });
  }

  async cancelEInvoice(payload = {}) {
    return this.request('/gst/compliance/einvoice/cancel', {
      method: 'POST',
      body: payload,
    });
  }
}

let defaultClient = null;
export function getSandboxClient() {
  if (!defaultClient) defaultClient = new SandboxClient();
  return defaultClient;
}
