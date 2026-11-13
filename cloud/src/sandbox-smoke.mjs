import { keyKind } from './integrations.mjs';

const SANDBOX_HOSTS = new Set([
  'test-api.sandbox.co.in',
  'api.stripe.com',
  'sandbox.plaid.com',
  'api.gusto-demo.com',
  'api.sandbox.taxjar.com',
  'sandbox.getpinwheel.com',
  'integrate.api.nvidia.com',
]);

const PRODUCTION_HOSTS = new Set(['api.sandbox.co.in', 'production.plaid.com', 'development.plaid.com', 'api.gusto.com', 'api.taxjar.com', 'api.getpinwheel.com', 'einvoice1.gst.gov.in']);

export function guardedFetch(fetchFn, allowedExtra = []) {
  const extra = new Set(allowedExtra.filter(Boolean));
  return async (url, init) => {
    const host = new URL(String(url)).hostname;
    if (PRODUCTION_HOSTS.has(host)) throw new Error(`refused: ${host} is a production host`);
    if (!SANDBOX_HOSTS.has(host) && !extra.has(host)) throw new Error(`refused: ${host} is not a known sandbox host`);
    return fetchFn(url, init);
  };
}

const read = (env, name) => {
  const v = String(env[name] ?? '').trim();
  return v === 'unset' ? '' : v;
};

const hostOf = (url) => {
  try { return new URL(url).hostname; } catch { return ''; }
};

async function json(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

const SAMPLE_GSTIN = '27AAPFU0939F1ZV';

export const CHECKS = [
  {
    id: 'quicko',
    title: 'Sandbox by Quicko: sign in to the test host and search a GSTIN',
    needs: ['MYCA_GSP_TEST_API_KEY', 'MYCA_GSP_TEST_API_SECRET'],
    async run({ env, fetch }) {
      const { SandboxClient } = await import('../../platform/src/sandbox-client.mjs');
      const client = new SandboxClient({ apiKey: read(env, 'MYCA_GSP_TEST_API_KEY'), apiSecret: read(env, 'MYCA_GSP_TEST_API_SECRET'), environment: 'test', baseUrl: 'https://test-api.sandbox.co.in', fetchFn: fetch, saved: null });
      const auth = await client.authenticate(true);
      if (!auth.ok) return { ok: false, detail: `sign-in refused: ${auth.status || ''} ${auth.error || ''}`.trim() };
      const found = await client.searchGstin(SAMPLE_GSTIN);
      if (!found.ok) return { ok: false, detail: `GSTIN search failed: ${found.error || found.status || 'no data'}` };
      return { ok: true, detail: `signed in; ${SAMPLE_GSTIN} is ${found.legalName || 'found'} (${found.status || 'status not given'})` };
    },
  },
  {
    id: 'nic-einvoice-rcm',
    title: 'NIC e-invoice through Quicko: sign in to the sandbox IRP and generate an IRN for an RCM self-invoice',
    needs: ['MYCA_GSP_TEST_API_KEY', 'MYCA_GSP_TEST_API_SECRET', 'MYCA_SMOKE_IRP_USER', 'MYCA_SMOKE_IRP_PASSWORD', 'MYCA_SMOKE_IRP_GSTIN'],
    async run({ env, fetch }) {
      const { SandboxClient } = await import('../../platform/src/sandbox-client.mjs');
      const { createState } = await import('../../platform/src/store.mjs');
      const { createPurchase } = await import('../../platform/src/invoice.mjs');
      const { invoiceToNicPayload, nicPayloadProblems, nicPartyFor } = await import('../../platform/src/nic-config.mjs');
      const gstin = read(env, 'MYCA_SMOKE_IRP_GSTIN').toUpperCase();
      const state = createState();
      state.company = { ...state.company, name: 'MyCA Smoke Test', gstin, pan: gstin.slice(2, 12), state: gstin.slice(0, 2), address: 'Plot 4, MIDC, Pune 411019', pin: '411019', city: 'Pune' };
      const today = new Date().toISOString().slice(0, 10);
      const bought = createPurchase(state, { partyName: 'Smoke Security Services', partyState: gstin.slice(0, 2), partyAddress: 'Shop 3, Hadapsar, Pune 411028', reverseCharge: true, lines: [{ description: 'Security services', hsn: '998525', qty: 1, rate: 1000, gstRate: 18 }], date: today });
      if (!bought.ok) return { ok: false, detail: `could not build the RCM purchase: ${bought.error}` };
      const bill = bought.invoice;
      const problems = nicPayloadProblems(state.company, bill, nicPartyFor(state, bill), today);
      if (problems.length) return { ok: false, detail: `the self-invoice payload is not valid: ${problems.map((p) => p.code).join(', ')}` };
      const payload = invoiceToNicPayload(state.company, bill);
      payload.DocDtls = { ...payload.DocDtls, No: `SMK${Date.now().toString().slice(-9)}` };
      const irpUser = { username: read(env, 'MYCA_SMOKE_IRP_USER'), password: read(env, 'MYCA_SMOKE_IRP_PASSWORD'), gstin };
      const client = new SandboxClient({ apiKey: read(env, 'MYCA_GSP_TEST_API_KEY'), apiSecret: read(env, 'MYCA_GSP_TEST_API_SECRET'), environment: 'test', baseUrl: 'https://test-api.sandbox.co.in', fetchFn: fetch, saved: null, irpUser });
      const irn = await client.generateEinvoice(payload);
      const data = irn.data?.data || {};
      const value = Number(data.Status) === 1 ? data.Data?.Irn : '';
      if (!irn.ok || !value) return { ok: false, detail: `no IRN: ${irn.error || ''} ${irn.message || ''} ${JSON.stringify(data.ErrorDetails || '').slice(0, 200)}`.trim() };
      return { ok: true, detail: `IRN ${String(value).slice(0, 12)}... for self-invoice ${bill.selfInvoiceNo} (${payload.TranDtls?.SupTyp || 'RCM'})` };
    },
  },
  {
    id: 'stripe',
    title: 'Stripe test mode: read the test balance',
    needs: ['MYCA_STRIPE_TEST_SECRET_KEY'],
    async run({ env, fetch }) {
      const key = read(env, 'MYCA_STRIPE_TEST_SECRET_KEY');
      if (keyKind(key) !== 'test') return { ok: false, detail: 'MYCA_STRIPE_TEST_SECRET_KEY must start sk_test_ or rk_test_' };
      const res = await fetch('https://api.stripe.com/v1/balance', { headers: { authorization: `Bearer ${key}` } });
      const data = await json(res);
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status} ${data.error?.message || ''}`.trim() };
      if (data.livemode !== false) return { ok: false, detail: 'Stripe says this is not test mode' };
      return { ok: true, detail: 'test mode balance read' };
    },
  },
  {
    id: 'plaid',
    title: 'Plaid sandbox: make a test bank item and sync its transactions',
    needs: ['MYCA_SMOKE_PLAID_CLIENT_ID', 'MYCA_SMOKE_PLAID_SECRET'],
    async run({ env, fetch }) {
      const { ChannelClient } = await import('../../platform/src/channel-client.mjs');
      const client = new ChannelClient({ fetchFn: fetch });
      const config = { environment: 'sandbox', clientId: read(env, 'MYCA_SMOKE_PLAID_CLIENT_ID'), secret: read(env, 'MYCA_SMOKE_PLAID_SECRET') };
      const made = await client.plaid({ config, op: 'sandbox_public_token', params: { institution: 'ins_109508' } });
      if (!made.ok) return { ok: false, detail: `public token: ${made.code || made.status} ${made.detail || ''}`.trim() };
      const swapped = await client.plaid({ config, op: 'exchange', params: { publicToken: made.data.public_token } });
      if (!swapped.ok) return { ok: false, detail: `exchange: ${swapped.code || swapped.status}` };
      const synced = await client.plaid({ config: { ...config, accessToken: swapped.data.access_token }, op: 'sync' });
      if (!synced.ok) return { ok: false, detail: `sync: ${synced.code || synced.status}` };
      return { ok: true, detail: `${synced.transactions.length} sandbox transactions synced` };
    },
  },
  {
    id: 'gusto',
    title: 'Gusto demo: read the token of a demo company',
    needs: ['MYCA_SMOKE_GUSTO_ACCESS_TOKEN'],
    async run({ env, fetch }) {
      const { ChannelClient } = await import('../../platform/src/channel-client.mjs');
      const out = await new ChannelClient({ fetchFn: fetch }).gusto({ config: { environment: 'demo', accessToken: read(env, 'MYCA_SMOKE_GUSTO_ACCESS_TOKEN') }, op: 'token_info' });
      return out.ok ? { ok: true, detail: `demo company ${out.data?.resource?.uuid ? 'found' : 'token valid'}` } : { ok: false, detail: `HTTP ${out.status}` };
    },
  },
  {
    id: 'taxjar',
    title: 'TaxJar sandbox: look up a sales tax rate',
    needs: ['MYCA_SMOKE_TAXJAR_TOKEN'],
    async run({ env, fetch }) {
      const { ChannelClient } = await import('../../platform/src/channel-client.mjs');
      const out = await new ChannelClient({ fetchFn: fetch }).taxjar({ config: { environment: 'sandbox', apiToken: read(env, 'MYCA_SMOKE_TAXJAR_TOKEN') }, op: 'rates', params: { zip: '90002' } });
      return out.ok ? { ok: true, detail: `90002 combined rate ${out.data.rate.combined_rate}` } : { ok: false, detail: `${out.status} ${out.detail || ''}`.trim() };
    },
  },
  {
    id: 'waha',
    title: 'WAHA WhatsApp gateway: the session is connected',
    needs: ['MYCA_WAHA_URL'],
    extraHost: (env) => hostOf(read(env, 'MYCA_WAHA_URL')),
    async run({ env, fetch }) {
      const base = read(env, 'MYCA_WAHA_URL').replace(/\/+$/, '');
      const session = read(env, 'MYCA_WAHA_SESSION') || 'default';
      const res = await fetch(`${base}/api/sessions/${encodeURIComponent(session)}`, { headers: { 'x-api-key': read(env, 'MYCA_WAHA_API_KEY') } });
      const data = await json(res);
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      return data.status === 'WORKING' ? { ok: true, detail: `session ${session} is WORKING` } : { ok: false, detail: `session ${session} is ${data.status || 'unknown'}: scan the QR code in the WAHA dashboard` };
    },
  },
  {
    id: 'ai-model',
    title: 'AI model: list the models the key can use',
    needs: [['MYCA_MODEL_API_KEY', 'NVIDIA_NIM_API_KEY', 'NIM_API_KEY']],
    extraHost: (env) => hostOf(read(env, 'MYCA_MODEL_BASE_URL')),
    async run({ env, fetch }) {
      const key = read(env, 'MYCA_MODEL_API_KEY') || read(env, 'NVIDIA_NIM_API_KEY') || read(env, 'NIM_API_KEY');
      const base = (read(env, 'MYCA_MODEL_BASE_URL') || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
      const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${key}` } });
      const data = await json(res);
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const count = Array.isArray(data.data) ? data.data.length : 0;
      return count ? { ok: true, detail: `${count} models available` } : { ok: false, detail: 'no models listed' };
    },
  },
  {
    id: 'us-filer',
    title: 'US e-file partner sandbox: the sandbox address answers with this key',
    needs: ['MYCA_US_FILER_TEST_BASE_URL', 'MYCA_US_FILER_TEST_API_KEY'],
    extraHost: (env) => hostOf(read(env, 'MYCA_US_FILER_TEST_BASE_URL')),
    async run({ env, fetch }) {
      const base = read(env, 'MYCA_US_FILER_TEST_BASE_URL').replace(/\/+$/, '');
      if (!/sandbox|test|staging|demo/i.test(hostOf(base))) return { ok: false, detail: `${hostOf(base)} does not look like a sandbox host` };
      const res = await fetch(base, { headers: { authorization: `Bearer ${read(env, 'MYCA_US_FILER_TEST_API_KEY')}` } });
      if (res.status === 401 || res.status === 403) return { ok: false, detail: `key refused (HTTP ${res.status})` };
      return { ok: true, detail: `reachable (HTTP ${res.status}); the full session check waits for the partner's API contract` };
    },
  },
];

function missingFor(check, env) {
  return check.needs.filter((need) => (Array.isArray(need) ? !need.some((n) => read(env, n)) : !read(env, need))).map((need) => (Array.isArray(need) ? need.join(' or ') : need));
}

export function liveKeysIn(env) {
  const names = new Set(CHECKS.flatMap((c) => c.needs.flat()));
  return [...names].filter((name) => keyKind(read(env, name)) === 'live' || /_LIVE_/.test(name));
}

export async function runSmoke(env = process.env, { fetchFn = globalThis.fetch, only = [] } = {}) {
  const live = liveKeysIn(env);
  if (live.length) return { ok: false, refused: `These hold live keys, so nothing was run: ${live.join(', ')}`, results: [] };
  const results = [];
  for (const check of CHECKS) {
    if (only.length && !only.includes(check.id)) continue;
    const missing = missingFor(check, env);
    if (missing.length) {
      results.push({ id: check.id, title: check.title, status: 'skipped', detail: `set ${missing.join(', ')}` });
      continue;
    }
    const fetch = guardedFetch(fetchFn, [check.extraHost ? check.extraHost(env) : '']);
    const started = Date.now();
    try {
      const out = await check.run({ env, fetch });
      results.push({ id: check.id, title: check.title, status: out.ok ? 'passed' : 'failed', detail: out.detail, ms: Date.now() - started });
    } catch (err) {
      results.push({ id: check.id, title: check.title, status: 'failed', detail: String(err?.message || err), ms: Date.now() - started });
    }
  }
  return { ok: !results.some((r) => r.status === 'failed'), results };
}

export function serverSmokeEnv(env = process.env) {
  const out = { ...env };
  for (const [slot, plain] of [
    ['MYCA_GSP_TEST_API_KEY', 'MYCA_GSP_API_KEY'],
    ['MYCA_GSP_TEST_API_SECRET', 'MYCA_GSP_API_SECRET'],
    ['MYCA_STRIPE_TEST_SECRET_KEY', 'MYCA_STRIPE_SECRET_KEY'],
    ['MYCA_US_FILER_TEST_BASE_URL', 'MYCA_US_FILER_BASE_URL'],
    ['MYCA_US_FILER_TEST_API_KEY', 'MYCA_US_FILER_API_KEY'],
  ]) if (!read(out, slot) && read(out, plain)) out[slot] = read(out, plain);
  return out;
}
