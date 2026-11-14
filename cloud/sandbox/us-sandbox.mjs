import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createApi } from '../src/api.mjs';
import { createDb, migrate } from '../src/db.mjs';
import { createBilling } from '../src/billing.mjs';
import { stripeSignature } from '../src/stripe.mjs';
import { PRIVACY_NOTICE } from '../src/consent.mjs';
import { signPartnerBody, PARTNER_SIGNATURE_HEADER } from '../../platform/src/us-filing-partner.mjs';
import { US_RETURN_YEARS } from '../../platform/src/us-return.mjs';

export const SANDBOX_PARTNER_URL = 'https://partner.sandbox.myca.test';
export const SANDBOX_PLUS_PRODUCT = 'myca_us_plus_yearly';
export const SANDBOX_US_PACKAGE = 'com.mldynamic.myca.us';
const ROUTES = new Set(['partner', 'mef']);
const PLUS = new Set(['card', 'play']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function sandboxRefusal(env = process.env) {
  const on = (name) => String(env[name] || '').trim() && String(env[name]).trim() !== 'unset';
  if (on('MYCA_ENABLE_LIVE_CALLS')) return 'MYCA_ENABLE_LIVE_CALLS is set. The US sandbox never makes live calls; unset it.';
  if (on('K_SERVICE') || on('MYCA_PRODUCTION') || String(env.MYCA_ENVIRONMENT || '').trim() === 'production') return 'This looks like a production host. Run the US sandbox on a developer machine or in CI only.';
  if (/^(sk|rk)_live_/.test(String(env.MYCA_STRIPE_SECRET_KEY || ''))) return 'MYCA_STRIPE_SECRET_KEY is a live Stripe key. The sandbox fakes Stripe and needs no key; unset it.';
  if (on('MYCA_US_FILER_API_KEY') && !String(env.MYCA_US_FILER_BASE_URL || '').startsWith(SANDBOX_PARTNER_URL)) return 'A real e-file partner key is set. The sandbox fakes the partner; unset MYCA_US_FILER_API_KEY.';
  return '';
}

export function sandboxTaxYear(nowMs = Date.now()) {
  const current = new Date(nowMs).getUTCFullYear();
  const years = US_RETURN_YEARS.map(Number).filter((year) => year <= current);
  const ended = years.filter((year) => year < current);
  return ended.length ? Math.max(...ended) : Math.max(...years);
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:760px;padding:16px;color:#111;background:#fff}h1{font-size:22px}h2{font-size:18px;margin-top:28px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left;font-size:14px;vertical-align:top}button{font:inherit;padding:8px 14px;margin:2px;border-radius:6px;border:1px solid #888;background:#f4f4f4;cursor:pointer}.pay{background:#0b6;color:#fff;border-color:#0b6}.note{color:#555;font-size:14px}code{font-size:13px;word-break:break-all}</style></head><body>${body}</body></html>`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function startUsSandbox({ databaseUrl, port = 8080, consolePort = 8090, host = '127.0.0.1', route = 'partner', plus = 'card', log = (entry) => console.log(JSON.stringify(entry)), env = process.env } = {}) {
  const refused = sandboxRefusal(env);
  if (refused) throw new Error(refused);
  if (!ROUTES.has(route)) throw new Error(`route must be one of ${[...ROUTES].join(', ')}`);
  if (!PLUS.has(plus)) throw new Error(`plus must be one of ${[...PLUS].join(', ')}`);
  if (!databaseUrl) throw new Error('MYCA_DATABASE_URL is required (a local Postgres database the sandbox may own).');

  const webhookSecret = `whsec_sandbox_${randomBytes(12).toString('hex')}`;
  const partnerSecret = `partner-sandbox-${randomBytes(16).toString('hex')}`;
  for (const name of ['MYCA_US_FILER', 'MYCA_US_FILER_BASE_URL', 'MYCA_US_FILER_API_KEY', 'MYCA_US_FILER_WEBHOOK_SECRET', 'MYCA_US_FILER_SEND_TINS', 'MYCA_IRS_MEF_ETIN', 'MYCA_IRS_MEF_EFIN']) delete env[name];
  env.MYCA_PROVIDER_ENV = 'test';
  if (route === 'partner') Object.assign(env, { MYCA_US_FILER: 'column-tax', MYCA_US_FILER_BASE_URL: SANDBOX_PARTNER_URL, MYCA_US_FILER_API_KEY: 'sandbox-partner-key', MYCA_US_FILER_WEBHOOK_SECRET: partnerSecret });

  let consoleUrl = '';
  let apiUrl = '';
  const codes = [];
  const checkouts = new Map();
  const subscriptions = new Map();
  const partnerSessions = [];
  const events = [];
  let seq = 1;
  const run = randomBytes(4).toString('hex');
  const note = (entry) => {
    events.unshift({ at: new Date().toISOString(), ...entry });
    events.length = Math.min(events.length, 200);
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (String(url).startsWith(`${SANDBOX_PARTNER_URL}/`)) return fakePartner(init);
    if (LOOPBACK.has(target.hostname)) return realFetch(url, init);
    note({ refused: target.hostname });
    throw new Error(`sandbox: outside call to ${target.hostname} refused`);
  };

  function fakePartner(init) {
    const body = JSON.parse(String(init.body || '{}'));
    let found = partnerSessions.find((item) => item.externalId === body.external_id);
    if (!found) {
      found = { n: partnerSessions.length + 1, externalId: body.external_id, taxYear: body.tax_year, name: [body.prefill?.taxpayer?.first_name, body.prefill?.taxpayer?.last_name].filter(Boolean).join(' '), filingStatus: body.prefill?.filing_status || '', w2s: (body.prefill?.w2s || []).length, ssnSent: Boolean(body.prefill?.taxpayer?.ssn), opened: 0, events: [] };
      partnerSessions.push(found);
    }
    found.opened += 1;
    note({ partner: 'session', externalId: found.externalId });
    return new Response(JSON.stringify({ id: `cu_sandbox_${found.n}`, user_url: `${SANDBOX_PARTNER_URL}/s/${found.n}` }), { status: 200, headers: { 'content-type': 'application/json' } });
  }

  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const googleKey = plus === 'play' ? generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) : '';

  async function fakeProviders(url, init = {}) {
    const text = String(url);
    const method = init.method || 'GET';
    const form = init.body && method !== 'GET' ? Object.fromEntries(new URLSearchParams(String(init.body))) : {};
    if (text === 'https://api.stripe.com/v1/checkout/sessions' && method === 'POST') {
      const id = `cs_test_${run}_${seq++}`;
      const metadata = Object.fromEntries(Object.entries(form).filter(([key]) => key.startsWith('metadata[')).map(([key, value]) => [key.slice(9, -1), value]));
      const session = { id, object: 'checkout.session', url: `${consoleUrl}/checkout/${id}`, status: 'open', payment_status: 'unpaid', mode: form.mode, metadata, client_reference_id: form.client_reference_id, amount_total: form.mode === 'payment' ? Number(form['line_items[0][price_data][unit_amount]'] || 0) : 24900, currency: 'usd', payment_intent: form.mode === 'payment' ? `pi_test_${run}_${seq}` : null, subscription: null, livemode: false, success_url: form.success_url, cancel_url: form.cancel_url, label: form['line_items[0][price_data][product_data][name]'] || 'MyCA Plus, yearly' };
      checkouts.set(id, session);
      note({ stripe: 'checkout.created', id, mode: session.mode, amountUsd: session.amount_total / 100 });
      return json(200, session);
    }
    const got = text.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/([^/?]+)$/);
    if (got) return checkouts.has(got[1]) ? json(200, checkouts.get(got[1])) : json(404, { error: { message: 'No such checkout.session' } });
    const sub = text.match(/^https:\/\/api\.stripe\.com\/v1\/subscriptions\/([^/?]+)$/);
    if (sub) {
      const found = subscriptions.get(sub[1]);
      if (!found) return json(404, { error: { message: 'No such subscription' } });
      if (method === 'POST' && form.cancel_at_period_end === 'true') found.cancel_at_period_end = true;
      return json(200, found);
    }
    if (text === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'ya29.sandbox', expires_in: 3600 });
    const play = text.match(/\/purchases\/subscriptionsv2\/tokens\/([^/:]+)$/);
    if (play) {
      const token = decodeURIComponent(play[1]);
      note({ play: 'lookup', token: token.slice(0, 24) });
      return json(200, { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', lineItems: [{ productId: SANDBOX_PLUS_PRODUCT, expiryTime: new Date(Date.now() + 365 * 86400000).toISOString() }], testPurchase: {} });
    }
    if (/\/purchases\/subscriptions\/[^/]+\/tokens\/[^/]+:acknowledge$/.test(text)) return json(200, {});
    note({ refused: text.slice(0, 80) });
    return json(404, { error: { message: 'not faked in the sandbox' } });
  }

  async function sendStripeEvent(type, object) {
    const raw = JSON.stringify({ id: `evt_test_${run}_${seq++}`, type, livemode: false, data: { object } });
    const at = Math.floor(Date.now() / 1000);
    const res = await realFetch(`${apiUrl}/v1/billing/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${at},v1=${stripeSignature(webhookSecret, raw, at)}` }, body: raw });
    const out = await res.json().catch(() => ({}));
    note({ stripe: type, status: res.status, recorded: out.recorded });
    return { ...out, httpStatus: res.status };
  }

  async function sendPartnerEvent(externalId, kind) {
    const found = partnerSessions.find((item) => item.externalId === externalId);
    if (!found) return { httpStatus: 404, error: 'UNKNOWN_SESSION' };
    const attempt = found.events.filter((item) => item === 'submitted').length + (kind === 'submitted' ? 1 : 0);
    const submissionId = `00000${String(found.taxYear + 1)}${String(found.n).padStart(3, '0')}${String(Math.max(attempt, 1)).padStart(5, '0')}`.slice(0, 20);
    const data = { external_id: externalId, ...(kind === 'started' ? {} : { submission_id: submissionId }), ...(kind === 'rejected' ? { errors: [{ rule_number: 'IND-031-04', message: 'If the Primary Prior Year AGI is present on the return, it must match the e-File database.' }] } : {}), occurred_at: new Date().toISOString() };
    const raw = JSON.stringify({ type: `return.${kind}`, data });
    const res = await realFetch(`${apiUrl}/v1/us/filer/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', [PARTNER_SIGNATURE_HEADER]: signPartnerBody(raw, partnerSecret) }, body: raw });
    const out = await res.json().catch(() => ({}));
    found.events.push(kind);
    note({ partner: `return.${kind}`, status: res.status, result: out.status || out.ignored || out.error });
    return { ...out, httpStatus: res.status };
  }

  async function pay(id, { decline = false } = {}) {
    const session = checkouts.get(id);
    if (!session) return { httpStatus: 404, error: 'UNKNOWN_CHECKOUT' };
    if (decline) {
      session.status = 'expired';
      note({ stripe: 'checkout.declined', id });
      return { httpStatus: 200, declined: true, redirect: session.cancel_url };
    }
    if (session.status === 'complete') return { httpStatus: 200, already: true, redirect: session.success_url.replace('{CHECKOUT_SESSION_ID}', id) };
    Object.assign(session, { status: 'complete', payment_status: 'paid' });
    if (session.mode === 'subscription') {
      const subId = `sub_test_${run}_${seq++}`;
      subscriptions.set(subId, { id: subId, object: 'subscription', status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400, cancel_at_period_end: false, metadata: session.metadata });
      session.subscription = subId;
    }
    const hook = await sendStripeEvent('checkout.session.completed', session);
    return { httpStatus: 200, paid: true, webhook: hook, redirect: session.success_url.replace('{CHECKOUT_SESSION_ID}', id) };
  }

  async function refund(id) {
    const session = checkouts.get(id);
    if (!session?.payment_intent || session.payment_status !== 'paid') return { httpStatus: 404, error: 'NOTHING_TO_REFUND' };
    session.refunded = true;
    return sendStripeEvent('charge.refunded', { id: `ch_test_${run}_${seq++}`, object: 'charge', payment_intent: session.payment_intent, amount: session.amount_total, amount_refunded: session.amount_total, refunded: true });
  }

  const otpSender = {
    async send(phone, code) {
      codes.unshift({ phone, code, at: new Date().toISOString() });
      codes.length = Math.min(codes.length, 20);
      log({ sandbox: 'sign-in code', phone: `${phone.slice(0, 4)}***${phone.slice(-2)}`, code });
    },
    async sendText(phone, text) {
      note({ sms: `${phone.slice(0, 4)}***${phone.slice(-2)}`, text: String(text).slice(0, 120) });
    },
  };

  const consoleServer = createServer(async (req, res) => {
    const url = new URL(req.url, consoleUrl || 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    const wantsJson = String(req.headers.accept || '').includes('application/json');
    const send = (status, body, type = 'text/html; charset=utf-8') => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    const answer = (out) => {
      if (wantsJson) return send(out.httpStatus || 200, out, 'application/json');
      res.writeHead(303, { location: out.redirect || '/' });
      return res.end();
    };
    try {
      if (req.method === 'POST') await readBody(req);
      if (req.method === 'GET' && url.pathname === '/state') return send(200, { apiUrl, consoleUrl, route, plus, codes, checkouts: [...checkouts.values()], partnerSessions, events }, 'application/json');
      if (req.method === 'GET' && url.pathname === '/paid') return send(200, page('Payment finished', `<h1>${url.searchParams.get('result') === 'canceled' ? 'Payment canceled' : 'Payment done'}</h1><p>Go back to the MyCA US app. It confirms the payment itself, or the webhook already did.</p><p><a href="/">Sandbox console</a></p>`));
      if (parts[0] === 'checkout' && parts.length === 2 && req.method === 'GET') {
        const session = checkouts.get(parts[1]);
        if (!session) return send(404, page('Not found', '<h1>No such checkout</h1>'));
        return send(200, page('Sandbox checkout', `<h1>Stripe test checkout (sandbox)</h1><p>${esc(session.label)}</p><p><strong>$${(session.amount_total / 100).toFixed(2)}</strong> ${session.mode === 'subscription' ? 'per year' : 'once'}</p><p class="note">No card is charged. Paying here marks the checkout paid and sends a signed <code>checkout.session.completed</code> webhook to the API, as Stripe would after card 4242 4242 4242 4242.</p><p>Status: ${esc(session.status)} / ${esc(session.payment_status)}</p><form method="post" action="/checkout/${esc(session.id)}/pay"><button class="pay">Pay with test card 4242</button></form><form method="post" action="/checkout/${esc(session.id)}/decline"><button>Cancel</button></form>`));
      }
      if (parts[0] === 'checkout' && parts.length === 3 && req.method === 'POST' && parts[2] === 'pay') return answer(await pay(parts[1]));
      if (parts[0] === 'checkout' && parts.length === 3 && req.method === 'POST' && parts[2] === 'decline') return answer(await pay(parts[1], { decline: true }));
      if (parts[0] === 'checkout' && parts.length === 3 && req.method === 'POST' && parts[2] === 'refund') return answer(await refund(parts[1]));
      if (parts[0] === 'partner' && parts.length === 3 && req.method === 'POST' && ['started', 'submitted', 'accepted', 'rejected'].includes(parts[2])) return answer(await sendPartnerEvent(decodeURIComponent(parts[1]), parts[2]));
      if (req.method === 'GET' && url.pathname === '/') {
        const rows = (items, cells) => items.length ? `<table>${items.map((item) => `<tr>${cells(item)}</tr>`).join('')}</table>` : '<p class="note">None yet.</p>';
        const body = `<h1>MyCA US sandbox</h1><p class="note">API <code>${esc(apiUrl)}</code> · e-file route <strong>${esc(route)}</strong> · Plus by <strong>${esc(plus)}</strong> · every outside call is faked or refused.</p>`
          + `<h2>Sign-in codes</h2>${rows(codes, (c) => `<td>${esc(c.phone)}</td><td><strong>${esc(c.code)}</strong></td><td class="note">${esc(c.at)}</td>`)}`
          + `<h2>Stripe test checkouts</h2>${rows([...checkouts.values()].reverse(), (s) => `<td><a href="/checkout/${esc(s.id)}">${esc(s.id)}</a><br><span class="note">${esc(s.label)}</span></td><td>$${(s.amount_total / 100).toFixed(2)}</td><td>${esc(s.status)}${s.refunded ? ' (refunded)' : ''}</td><td>${s.status === 'open' ? `<form method="post" action="/checkout/${esc(s.id)}/pay"><button class="pay">Pay</button></form>` : s.mode === 'payment' && !s.refunded && s.payment_status === 'paid' ? `<form method="post" action="/checkout/${esc(s.id)}/refund"><button>Refund</button></form>` : ''}</td>`)}`
          + `<h2>E-file partner sessions</h2><p class="note">The app gets a link on ${esc(SANDBOX_PARTNER_URL)}, which does not open. Play the partner here instead.</p>${rows(partnerSessions, (p) => `<td>${esc(p.name)} · ${esc(p.taxYear)} · ${esc(p.filingStatus)}<br><code>${esc(p.externalId)}</code><br><span class="note">W-2s ${p.w2s} · SSN sent ${p.ssnSent ? 'yes' : 'no'} · opened ${p.opened}× · events ${esc(p.events.join(', ') || 'none')}</span></td><td>${['started', 'submitted', 'accepted', 'rejected'].map((kind) => `<form method="post" action="/partner/${encodeURIComponent(p.externalId)}/${kind}" style="display:inline"><button>${kind}</button></form>`).join('')}</td>`)}`
          + `<h2>Events</h2>${rows(events.slice(0, 40), (e) => `<td class="note">${esc(e.at.slice(11, 19))}</td><td><code>${esc(JSON.stringify({ ...e, at: undefined }))}</code></td>`)}`;
        return send(200, page('MyCA US sandbox', body));
      }
      return send(404, page('Not found', '<h1>Not found</h1>'));
    } catch (err) {
      log({ sandbox: 'console error', error: String(err?.message || err) });
      return wantsJson ? send(500, { error: 'CONSOLE_ERROR', detail: String(err?.message || err) }, 'application/json') : send(500, page('Error', `<h1>Sandbox console error</h1><p>${esc(err?.message || err)}</p>`));
    }
  });

  await new Promise((resolve) => consoleServer.listen(consolePort, host, resolve));
  consoleUrl = `http://${host}:${consoleServer.address().port}`;
  const db = createDb(databaseUrl);
  await migrate(db);
  const billingConfig = {
    usReturn: { priceUsd: 129, launchPriceUsd: 99, launchUntil: '2027-04-15', ...(plus === 'play' ? { packageName: SANDBOX_US_PACKAGE } : {}) },
    stripe: { secretKey: 'sk_test_sandbox', webhookSecret, plusPriceId: plus === 'card' ? 'price_sandbox_plus_yearly' : '', returnUrl: `${consoleUrl}/paid` },
    ...(plus === 'play' ? { usPlus: { priceUsd: 249, productId: SANDBOX_PLUS_PRODUCT }, serviceAccount: { clientEmail: 'sandbox@myca-sandbox.iam.gserviceaccount.com', privateKey: googleKey, tokenUri: 'https://oauth2.googleapis.com/token' } } : {}),
  };
  const handler = createApi({
    db,
    billing: createBilling({ db, config: billingConfig, fetchImpl: fakeProviders, log, usFilingOpen: () => true }),
    secret: randomBytes(32).toString('hex'),
    otpSender,
    booksKey: randomBytes(32).toString('hex'),
    log,
    environment: 'local',
  });
  const api = createServer(handler);

  await new Promise((resolve) => api.listen(port, host, resolve));
  apiUrl = `http://${host}:${api.address().port}`;
  return {
    apiUrl,
    consoleUrl,
    route,
    plus,
    state: () => ({ codes, checkouts: [...checkouts.values()], partnerSessions, events }),
    async close() {
      globalThis.fetch = realFetch;
      await new Promise((resolve) => consoleServer.close(resolve));
      await new Promise((resolve) => api.close(resolve));
      await db.close();
    },
  };
}

async function call(base, method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { unparsed: text };
  }
  return { status: res.status, body: parsed, text };
}

export async function runUsSandboxCheck(sandbox, { phone = '+12025550143', taxYear = sandboxTaxYear() } = {}) {
  const steps = [];
  const step = (name, ok, detail = '') => {
    steps.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 400) });
    if (!ok) throw Object.assign(new Error(`${name}: ${detail}`), { steps });
  };
  const api = (method, path, options) => call(sandbox.apiUrl, method, path, options);
  const otp = await api('POST', '/v1/auth/otp', { body: { phone } });
  step('request sign-in code', otp.status === 200, otp.text);
  const code = sandbox.state().codes.find((item) => item.phone === phone)?.code;
  const verified = await api('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone, code, deviceLabel: 'sandbox check' } });
  step('sign in', verified.status === 200, verified.text);
  const token = verified.body.accessToken;
  const agreed = await api('POST', '/v1/me/consent', { token, body: { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version, adult: true } });
  step('accept the privacy notice', agreed.status === 200, agreed.text);
  const created = await api('POST', '/v1/businesses', { token, body: { name: 'Sandbox Filer', country: 'US', kind: 'household' } });
  step('create a household', created.status === 200, created.text);
  const id = created.body.business.id;
  const at = (action, body) => api('POST', `/v1/businesses/${id}/${action}`, { token, body });
  const write = async (name, args) => {
    const proposed = await at('propose', { name, args });
    if (!proposed.body.preview?.token) return proposed;
    return at('confirm', { token: proposed.body.preview.token });
  };
  const ssn = '400-12-3470';
  step('taxpayer profile with a sealed SSN', (await write('set_us_taxpayer', { taxYear: String(taxYear), filingStatus: 'single', taxpayer: { firstName: 'Sam', lastName: 'Sandbox', ssn, dateOfBirth: '1990-01-15', occupation: 'Analyst' }, address: { line1: '1 Test Way', city: 'Columbus', state: 'OH', zip: '43215' } })).status === 200);
  step('add a W-2', (await write('add_us_tax_form', { taxYear: String(taxYear), kind: 'W-2', payer: 'Sandbox Corp', payerTin: '12-3456784', fields: { wages: 64000, federalWithheld: 9000, socialSecurityWages: 64000, socialSecurityTax: 3968, medicareWages: 64000, medicareTax: 928 } })).status === 200);
  const review = await at('query', { name: 'us_return_review', args: { taxYear } });
  step('review the return', review.status === 200 && !review.text.includes(ssn.replace(/-/g, '')), review.text.slice(0, 200));
  const unpaid = await at('propose', { name: 'file_us_return', args: { taxYear } });
  step('filing before paying is refused', unpaid.body.error === 'US_RETURN_UNPAID', unpaid.text);
  const checkout = await at('us-checkout', { product: 'return', taxYear });
  step('open a Stripe test checkout', checkout.status === 200 && checkout.body.url?.startsWith(sandbox.consoleUrl), checkout.text);
  const paid = await call(sandbox.consoleUrl, 'POST', `/checkout/${checkout.body.sessionId}/pay`);
  step('pay with the test card (signed webhook)', paid.body.webhook?.recorded === true, paid.text);
  const purchase = await api('GET', `/v1/businesses/${id}/us-return-purchase?taxYear=${taxYear}`, { token });
  step('the return shows as paid', purchase.body.paid === true && purchase.body.testPurchase === true, purchase.text);
  if (sandbox.route === 'mef') {
    const signed = await write('sign_us_return', { taxYear, taxpayerPin: '13579', priorYear: { taxpayer: { agi: 0 } }, consent8879: true, refund: { method: 'direct_deposit', routing: '021000021', account: '000123456789', accountType: 'checking' } });
    step('sign Form 8879', signed.status === 200 && signed.body.tools?.[0]?.result?.ok !== false, signed.text);
  }
  const filed = await write('file_us_return', { taxYear });
  const result = filed.body.tools?.find((t) => t.name === 'file_us_return')?.result || {};
  step('file the return', filed.status === 200 && result.ok === true, filed.text);
  if (sandbox.route === 'partner') {
    const session = sandbox.state().partnerSessions.at(-1);
    step('partner session opened without the SSN', session && !session.ssnSent && session.externalId.startsWith(`myca.${id}.`), JSON.stringify(session));
    const submitted = await call(sandbox.consoleUrl, 'POST', `/partner/${encodeURIComponent(session.externalId)}/submitted`);
    step('partner reports submitted (signed webhook)', submitted.body.status === 'submitted', submitted.text);
    const accepted = await call(sandbox.consoleUrl, 'POST', `/partner/${encodeURIComponent(session.externalId)}/accepted`);
    step('partner reports accepted', accepted.body.status === 'accepted', accepted.text);
  }
  const status = await at('query', { name: 'us_efile_status', args: { taxYear } });
  const data = status.body.data ?? status.body.result?.data ?? status.body;
  step('the 1040 hub shows the IRS acceptance', data.status === 'accepted' && data.route === sandbox.route, status.text);
  const plusCheckout = sandbox.plus === 'card' ? await at('us-checkout', { product: 'plus' }) : null;
  if (plusCheckout) {
    step('open a Plus checkout', plusCheckout.status === 200, plusCheckout.text);
    await call(sandbox.consoleUrl, 'POST', `/checkout/${plusCheckout.body.sessionId}/pay`);
  } else {
    const bought = await at('us-plus-purchase', { productId: SANDBOX_PLUS_PRODUCT, purchaseToken: `sandbox-plus-${randomBytes(6).toString('hex')}` });
    step('verify a Play Plus purchase', bought.body.subscribed === true, bought.text);
  }
  const plus = await api('GET', `/v1/businesses/${id}/us-plus`, { token });
  step('Plus is on', plus.body.active === true && plus.body.subscribed === true, plus.text);
  return { ok: true, taxYear, businessId: id, steps };
}
