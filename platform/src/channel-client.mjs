const AMAZON_LWA = 'https://api.amazon.com/auth/o2/token';
const AMAZON_REGIONS = { IN: 'https://sellingpartnerapi-eu.amazon.com', EU: 'https://sellingpartnerapi-eu.amazon.com', NA: 'https://sellingpartnerapi-na.amazon.com', FE: 'https://sellingpartnerapi-fe.amazon.com' };
const AMAZON_REPORTS = { settlement: 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2', orders: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL' };
const RAZORPAY_BASE = 'https://api.razorpay.com/v1';
const SHOPIFY_VERSION = '2025-10';
const ZOHO_DCS = { in: 'in', com: 'com', eu: 'eu', au: 'com.au' };
const PLAID_HOSTS = { sandbox: 'https://sandbox.plaid.com', development: 'https://development.plaid.com', production: 'https://production.plaid.com' };
const TAXJAR_HOSTS = { sandbox: 'https://api.sandbox.taxjar.com', production: 'https://api.taxjar.com' };
const GUSTO_HOSTS = { demo: 'https://api.gusto-demo.com', production: 'https://api.gusto.com' };
const GUSTO_VERSION = '2024-04-01';
const PINWHEEL_HOSTS = { sandbox: 'https://sandbox.getpinwheel.com', production: 'https://api.getpinwheel.com' };
const PINWHEEL_VERSION = '2025-07-08';
const TRACK1099_HOST = 'https://www.track1099.com';
const POLL_MS = 15000;
const POLL_LIMIT = 40;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('ABORTED')); }, { once: true });
  });
}

async function asJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export class ChannelClient {
  constructor(options = {}) {
    this.fetchFn = options.fetchFn || ((...args) => globalThis.fetch(...args));
    this.pollMs = options.pollMs ?? POLL_MS;
    this.pollLimit = options.pollLimit ?? POLL_LIMIT;
  }

  async amazonToken(config, signal) {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refreshToken, client_id: config.clientId, client_secret: config.clientSecret });
    const res = await this.fetchFn(AMAZON_LWA, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal });
    const data = await asJson(res);
    if (!res.ok || !data.access_token) return { ok: false, error: 'AMAZON_AUTH_FAILED', status: res.status };
    return { ok: true, token: data.access_token };
  }

  async amazonReport({ config, kind, from, to }, signal) {
    const auth = await this.amazonToken(config, signal);
    if (!auth.ok) return auth;
    const base = AMAZON_REGIONS[config.region || 'IN'] || AMAZON_REGIONS.IN;
    const headers = { 'x-amz-access-token': auth.token, 'content-type': 'application/json', accept: 'application/json' };
    const created = await this.fetchFn(`${base}/reports/2021-06-30/reports`, { method: 'POST', headers, signal, body: JSON.stringify({ reportType: AMAZON_REPORTS[kind], marketplaceIds: [config.marketplaceId], dataStartTime: `${from}T00:00:00Z`, dataEndTime: `${to}T23:59:59Z` }) });
    const createdData = await asJson(created);
    if (!created.ok || !createdData.reportId) return { ok: false, error: 'AMAZON_REPORT_REQUEST_FAILED', status: created.status, detail: createdData.errors || createdData.raw || '' };
    let documentId = '';
    for (let i = 0; i < this.pollLimit; i += 1) {
      const status = await this.fetchFn(`${base}/reports/2021-06-30/reports/${createdData.reportId}`, { headers, signal });
      const statusData = await asJson(status);
      if (statusData.processingStatus === 'DONE' && statusData.reportDocumentId) { documentId = statusData.reportDocumentId; break; }
      if (['CANCELLED', 'FATAL'].includes(statusData.processingStatus)) return { ok: false, error: `AMAZON_REPORT_${statusData.processingStatus}` };
      await sleep(this.pollMs, signal);
    }
    if (!documentId) return { ok: false, error: 'AMAZON_REPORT_TIMEOUT' };
    const doc = await this.fetchFn(`${base}/reports/2021-06-30/documents/${documentId}`, { headers, signal });
    const docData = await asJson(doc);
    if (!doc.ok || !docData.url) return { ok: false, error: 'AMAZON_DOCUMENT_FAILED', status: doc.status };
    if (docData.compressionAlgorithm) return { ok: false, error: 'AMAZON_DOCUMENT_COMPRESSED', hint: 'Compressed report documents are not read yet; download the report from Seller Central and import the file.' };
    const file = await this.fetchFn(docData.url, { signal });
    if (!file.ok) return { ok: false, error: 'AMAZON_DOWNLOAD_FAILED', status: file.status };
    return { ok: true, text: await file.text(), reportId: createdData.reportId };
  }

  async shopify({ config, kind, from, to }, signal) {
    if (!/^[a-z0-9][a-z0-9-]{0,98}\.myshopify\.com$/.test(String(config.shopDomain || ''))) return { ok: false, error: 'SHOPIFY_HOST_REFUSED' };
    const base = `https://${config.shopDomain}/admin/api/${SHOPIFY_VERSION}`;
    const headers = { 'X-Shopify-Access-Token': config.accessToken, accept: 'application/json' };
    const pages = [];
    let url = kind === 'orders'
      ? `${base}/orders.json?status=any&limit=250&created_at_min=${from}T00:00:00Z&created_at_max=${to}T23:59:59Z`
      : `${base}/shopify_payments/balance/transactions.json?limit=250&processed_at_min=${from}T00:00:00Z&processed_at_max=${to}T23:59:59Z`;
    for (let i = 0; i < 40 && url; i += 1) {
      if (new URL(url).hostname !== config.shopDomain) return { ok: false, error: 'SHOPIFY_HOST_REFUSED' };
      const res = await this.fetchFn(url, { headers, signal, redirect: 'manual' });
      const data = await asJson(res);
      if (!res.ok) return { ok: false, error: 'SHOPIFY_REQUEST_FAILED', status: res.status, detail: data.errors || data.raw || '' };
      pages.push(data);
      const link = res.headers?.get ? res.headers.get('link') || '' : '';
      const next = /<([^>]+)>;\s*rel="next"/.exec(link);
      url = next ? next[1] : '';
    }
    return { ok: true, pages };
  }

  async zohoToken(config, signal) {
    const dc = ZOHO_DCS[config.dc || 'in'] || 'in';
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refreshToken, client_id: config.clientId, client_secret: config.clientSecret });
    const res = await this.fetchFn(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal });
    const data = await asJson(res);
    if (!res.ok || !data.access_token) return { ok: false, error: 'ZOHO_AUTH_FAILED', status: res.status };
    return { ok: true, token: data.access_token, base: `https://www.zohoapis.${dc}/books/v3` };
  }

  async zoho({ config, op, params = {} }, signal) {
    const auth = await this.zohoToken(config, signal);
    if (!auth.ok) return auth;
    const call = async (method, path, body) => {
      const joiner = path.includes('?') ? '&' : '?';
      const res = await this.fetchFn(`${auth.base}${path}${joiner}organization_id=${encodeURIComponent(config.orgId)}`, {
        method,
        headers: { authorization: `Zoho-oauthtoken ${auth.token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal,
      });
      const data = await asJson(res);
      if (!res.ok || (data.code != null && Number(data.code) !== 0)) return { ok: false, error: 'ZOHO_REQUEST_FAILED', status: res.status, detail: String(data.message || data.raw || '').slice(0, 200) };
      return { ok: true, data };
    };
    if (op === 'taxes') {
      const out = await call('GET', '/settings/taxes');
      return out.ok ? { ok: true, taxes: out.data.taxes || [] } : out;
    }
    if (op === 'findContact') {
      const out = await call('GET', `/contacts?contact_name=${encodeURIComponent(params.name)}&contact_type=customer`);
      if (!out.ok) return out;
      const hit = (out.data.contacts || []).find((c) => String(c.contact_name).trim().toLowerCase() === String(params.name).trim().toLowerCase());
      return { ok: true, contactId: hit ? String(hit.contact_id) : '' };
    }
    if (op === 'createContact') {
      const out = await call('POST', '/contacts', { contact_name: params.name, contact_type: 'customer', gst_treatment: params.gstin ? 'business_gst' : 'consumer', ...(params.gstin ? { gst_no: params.gstin } : {}), ...(params.state ? { place_of_contact: params.state } : {}) });
      return out.ok ? { ok: true, contactId: String(out.data.contact?.contact_id || '') } : out;
    }
    if (op === 'createInvoice') {
      const out = await call('POST', '/invoices', params.invoice);
      return out.ok ? { ok: true, invoiceId: String(out.data.invoice?.invoice_id || ''), invoiceNumber: String(out.data.invoice?.invoice_number || '') } : out;
    }
    return { ok: false, error: 'UNKNOWN_ZOHO_OP' };
  }

  async plaid({ config, op, params = {}, from, to }, signal) {
    const base = PLAID_HOSTS[config.environment || 'sandbox'] || PLAID_HOSTS.sandbox;
    const post = async (path, body) => {
      const res = await this.fetchFn(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify({ client_id: config.clientId, secret: config.secret, ...body }) });
      const data = await asJson(res);
      if (!res.ok) return { ok: false, error: 'PLAID_ERROR', status: res.status, code: data.error_code || '', detail: data.error_message || data.raw || '' };
      return { ok: true, data };
    };
    if (op === 'sandbox_public_token') return post('/sandbox/public_token/create', { institution_id: params.institution, initial_products: ['transactions'] });
    if (op === 'exchange') return post('/item/public_token/exchange', { public_token: params.publicToken });
    if (op === 'link_token') return post('/link/token/create', { client_name: 'MyCA', user: { client_user_id: params.userId || 'owner' }, products: ['transactions'], country_codes: ['US'], language: 'en' });
    const transactions = [];
    let cursor = config.cursor || '';
    for (let i = 0; i < 50; i += 1) {
      const page = await post('/transactions/sync', cursor ? { access_token: config.accessToken, cursor } : { access_token: config.accessToken });
      if (!page.ok) return page;
      for (const t of page.data.added || []) if (!from || !to || (t.date >= from && t.date <= to)) transactions.push(t);
      cursor = page.data.next_cursor || cursor;
      if (!page.data.has_more) break;
    }
    return { ok: true, transactions, cursor };
  }

  async pinwheel({ config, op, params = {} }, signal) {
    const base = PINWHEEL_HOSTS[config.environment === 'production' ? 'production' : 'sandbox'];
    const headers = { 'x-api-secret': config.apiSecret, 'pinwheel-version': PINWHEEL_VERSION, 'content-type': 'application/json', accept: 'application/json' };
    const call = async (method, path, body) => {
      const res = await this.fetchFn(`${base}/v1${path}`, { method, headers, signal, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await asJson(res);
      if (!res.ok) return { ok: false, error: 'PINWHEEL_ERROR', status: res.status, code: data.error?.code || data.code || '', detail: data.error?.message || data.message || data.raw || '' };
      return { ok: true, data: data.data === undefined ? data : data.data, meta: data.meta || {} };
    };
    if (op === 'link_token') return call('POST', '/link_tokens', { org_name: 'MyCA', end_user_id: params.endUserId || 'owner', features: ['tax_forms'], language: 'en' });
    if (op === 'tax_form') return call('GET', `/accounts/${encodeURIComponent(params.accountId)}/tax_forms/${encodeURIComponent(params.taxFormId)}?with_parsed_data=true`);
    if (op === 'tax_forms') {
      const forms = [];
      let cursor = '';
      for (let i = 0; i < 20; i += 1) {
        const query = new URLSearchParams({ limit: '50' });
        if (params.year) { query.set('from_year', String(params.year)); query.set('to_year', String(params.year)); }
        if (cursor) query.set('cursor', cursor);
        const page = await call('GET', `/accounts/${encodeURIComponent(params.accountId)}/tax_forms?${query}`);
        if (!page.ok) return page;
        forms.push(...(Array.isArray(page.data) ? page.data : []));
        cursor = page.meta?.next_cursor || '';
        if (!cursor) break;
      }
      const detailed = [];
      for (const form of forms) {
        if (!params.formIds || params.formIds.includes(form.id)) {
          const one = await call('GET', `/accounts/${encodeURIComponent(params.accountId)}/tax_forms/${encodeURIComponent(form.id)}?with_parsed_data=true`);
          if (!one.ok) return one;
          detailed.push(one.data);
        }
      }
      return { ok: true, data: { taxForms: detailed } };
    }
    return { ok: false, error: 'UNKNOWN_OP' };
  }

  async taxjar({ config, op, params = {} }, signal) {
    const base = TAXJAR_HOSTS[config.environment === 'production' ? 'production' : 'sandbox'];
    const headers = { authorization: `Bearer ${config.apiToken}`, 'x-api-version': '2022-01-24', 'content-type': 'application/json' };
    if (op === 'rates') {
      const query = new URLSearchParams();
      if (params.city) query.set('city', params.city);
      if (params.state) query.set('state', params.state);
      query.set('country', 'US');
      const res = await this.fetchFn(`${base}/v2/rates/${encodeURIComponent(params.zip)}?${query}`, { headers, signal });
      const data = await asJson(res);
      if (!res.ok || !data.rate) return { ok: false, error: 'TAXJAR_ERROR', status: res.status, detail: data.detail || data.error || data.raw || '' };
      return { ok: true, data };
    }
    if (op === 'taxes') {
      const res = await this.fetchFn(`${base}/v2/taxes`, { method: 'POST', headers, signal, body: JSON.stringify(params.order || {}) });
      const data = await asJson(res);
      if (!res.ok || !data.tax) return { ok: false, error: 'TAXJAR_ERROR', status: res.status, detail: data.detail || data.error || data.raw || '' };
      return { ok: true, data };
    }
    return { ok: false, error: 'UNKNOWN_OP' };
  }

  async gusto({ config, op, params = {}, from, to }, signal) {
    const base = GUSTO_HOSTS[config.environment === 'production' ? 'production' : 'demo'];
    if (op === 'token' || op === 'refresh') {
      const body = op === 'token'
        ? { client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: params.redirectUri, code: params.code, grant_type: 'authorization_code' }
        : { client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: 'refresh_token' };
      const res = await this.fetchFn(`${base}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal, body: JSON.stringify(body) });
      const data = await asJson(res);
      if (!res.ok || !data.access_token) return { ok: false, error: 'GUSTO_AUTH_FAILED', status: res.status, detail: data.error_description || data.error || data.raw || '' };
      return { ok: true, data };
    }
    const headers = { authorization: `Bearer ${config.accessToken}`, 'x-gusto-api-version': GUSTO_VERSION, accept: 'application/json' };
    if (op === 'token_info') {
      const res = await this.fetchFn(`${base}/v1/token_info`, { headers, signal });
      const data = await asJson(res);
      return res.ok ? { ok: true, data } : { ok: false, error: 'GUSTO_ERROR', status: res.status };
    }
    const query = new URLSearchParams({ processed: 'true' });
    if (from) query.set('start_date', from);
    if (to) query.set('end_date', to);
    const res = await this.fetchFn(`${base}/v1/companies/${encodeURIComponent(config.companyUuid)}/payrolls?${query}`, { headers, signal });
    const data = await asJson(res);
    if (!res.ok || !Array.isArray(data)) return { ok: false, error: 'GUSTO_ERROR', status: res.status, detail: data.message || data.raw || '' };
    return { ok: true, payrolls: data };
  }

  async track1099({ config, op, params = {} }, signal) {
    const base = `${TRACK1099_HOST}/api/v1/${encodeURIComponent(config.teamApiId)}`;
    const headers = { authorization: `Bearer ${config.apiToken}`, accept: 'application/vnd.api+json' };
    const read = async (res) => {
      const data = await asJson(res);
      if (!res.ok) return { ok: false, error: 'TRACK1099_ERROR', status: res.status, detail: Array.isArray(data.errors) ? data.errors.map((e) => e.detail || e.title || '').join('; ') : (data.raw || '') };
      return { ok: true, data };
    };
    if (op === 'issuers') return read(await this.fetchFn(`${base}/issuers`, { headers, signal }));
    if (op === 'job') return read(await this.fetchFn(`${base}/jobs/${encodeURIComponent(params.jobId)}`, { headers, signal }));
    if (op === 'import') {
      const form = new FormData();
      form.set('csv_file', new Blob([params.csv], { type: 'text/csv' }), params.fileName || 'forms.csv');
      return read(await this.fetchFn(`${base}/issuers/${encodeURIComponent(params.issuerId)}/import-forms`, { method: 'POST', headers, body: form, signal }));
    }
    return { ok: false, error: 'UNKNOWN_OP' };
  }

  async razorpay({ config, from, to }, signal) {
    const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;
    const rows = [];
    const [y, m] = from.split('-').map(Number);
    const [y2, m2] = to.split('-').map(Number);
    for (let year = y, month = m; year < y2 || (year === y2 && month <= m2); month = month === 12 ? 1 : month + 1, year = month === 1 ? year + 1 : year) {
      let skip = 0;
      for (let page = 0; page < 40; page += 1) {
        const res = await this.fetchFn(`${RAZORPAY_BASE}/settlements/recon/combined?year=${year}&month=${month}&count=1000&skip=${skip}`, { headers: { authorization: auth, accept: 'application/json' }, signal });
        const data = await asJson(res);
        if (!res.ok) return { ok: false, error: 'RAZORPAY_REQUEST_FAILED', status: res.status, detail: data.error?.description || data.raw || '' };
        const items = Array.isArray(data.items) ? data.items : [];
        rows.push(...items);
        if (items.length < 1000) break;
        skip += items.length;
      }
    }
    return { ok: true, rows };
  }
}

let current = null;

export function getChannelClient() {
  if (!current) current = new ChannelClient();
  return current;
}

export function setChannelClient(client) {
  current = client || null;
}
