const AMAZON_LWA = 'https://api.amazon.com/auth/o2/token';
const AMAZON_REGIONS = { IN: 'https://sellingpartnerapi-eu.amazon.com', EU: 'https://sellingpartnerapi-eu.amazon.com', NA: 'https://sellingpartnerapi-na.amazon.com', FE: 'https://sellingpartnerapi-fe.amazon.com' };
const AMAZON_REPORTS = { settlement: 'GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2', orders: 'GET_FLAT_FILE_ALL_ORDERS_DATA_BY_LAST_UPDATE_GENERAL' };
const RAZORPAY_BASE = 'https://api.razorpay.com/v1';
const SHOPIFY_VERSION = '2025-10';
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
    const base = `https://${config.shopDomain}/admin/api/${SHOPIFY_VERSION}`;
    const headers = { 'X-Shopify-Access-Token': config.accessToken, accept: 'application/json' };
    const pages = [];
    let url = kind === 'orders'
      ? `${base}/orders.json?status=any&limit=250&created_at_min=${from}T00:00:00Z&created_at_max=${to}T23:59:59Z`
      : `${base}/shopify_payments/balance/transactions.json?limit=250&processed_at_min=${from}T00:00:00Z&processed_at_max=${to}T23:59:59Z`;
    for (let i = 0; i < 40 && url; i += 1) {
      const res = await this.fetchFn(url, { headers, signal });
      const data = await asJson(res);
      if (!res.ok) return { ok: false, error: 'SHOPIFY_REQUEST_FAILED', status: res.status, detail: data.errors || data.raw || '' };
      pages.push(data);
      const link = res.headers?.get ? res.headers.get('link') || '' : '';
      const next = /<([^>]+)>;\s*rel="next"/.exec(link);
      url = next ? next[1] : '';
    }
    return { ok: true, pages };
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
