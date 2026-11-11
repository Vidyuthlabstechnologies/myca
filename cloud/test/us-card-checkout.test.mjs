import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBilling, billingConfigFromEnv, billingConfigProblem } from '../src/billing.mjs';
import { stripeForm, stripeSignature, stripeSignatureValid } from '../src/stripe.mjs';
import { startApi } from './helpers.mjs';

const WEBHOOK_SECRET = 'whsec_test_secret';
const stripeCalls = [];
const sessions = new Map();
const subscriptions = new Map();
let nextId = 1;

async function fakeStripe(url, init = {}) {
  const text = String(url);
  const method = init.method || 'GET';
  const form = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : {};
  stripeCalls.push({ url: text, method, form, auth: init.headers?.authorization });
  const json = (status, data) => new Response(JSON.stringify(data), { status });
  const base = 'https://api.stripe.com/v1/';
  if (!text.startsWith(base)) return json(404, {});
  const path = text.slice(base.length);
  if (path === 'checkout/sessions' && method === 'POST') {
    const id = `cs_test_${nextId++}`;
    const metadata = Object.fromEntries(Object.entries(form).filter(([key]) => key.startsWith('metadata[')).map(([key, value]) => [key.slice(9, -1), value]));
    const session = { id, url: `https://checkout.stripe.com/c/pay/${id}`, status: 'open', payment_status: 'unpaid', mode: form.mode, metadata, client_reference_id: form.client_reference_id, amount_total: Number(form['line_items[0][price_data][unit_amount]'] || 24900), livemode: false };
    sessions.set(id, session);
    return json(200, session);
  }
  const got = path.match(/^checkout\/sessions\/([^/]+)$/);
  if (got) return sessions.has(got[1]) ? json(200, sessions.get(got[1])) : json(404, { error: { message: 'No such session' } });
  const sub = path.match(/^subscriptions\/([^/]+)$/);
  if (sub) {
    const found = subscriptions.get(sub[1]);
    if (!found) return json(404, {});
    if (method === 'POST' && form.cancel_at_period_end === 'true') found.cancel_at_period_end = true;
    return json(200, found);
  }
  return json(404, {});
}

function pay(id, extra = {}) {
  Object.assign(sessions.get(id), { status: 'complete', payment_status: 'paid' }, extra);
  return sessions.get(id);
}

let api;
let year;
before(async () => {
  api = await startApi({
    billing: ({ db, now }) => createBilling({
      db,
      now,
      fetchImpl: fakeStripe,
      config: { stripe: { secretKey: 'sk_test_123', webhookSecret: WEBHOOK_SECRET, plusPriceId: 'price_plus_yearly', returnUrl: 'https://myca.example/us/paid' } },
    }),
  });
  year = new Date(api.clock.now).getUTCFullYear() - 1;
});
after(() => api.close());

async function household(phone, name = 'Jordan Rivera') {
  const session = await api.signIn(phone);
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name, country: 'US', kind: 'household' } });
  assert.equal(created.status, 200, created.text);
  return { token: session.accessToken, businessId: created.body.business.id };
}
const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, path) => api.call('GET', `/v1/businesses/${who.businessId}/${path}`, { token: who.token });

function webhook(event, { secret = WEBHOOK_SECRET, at = Math.floor(api.clock.now / 1000) } = {}) {
  const raw = JSON.stringify(event);
  return api.call('POST', '/v1/billing/stripe/webhook', { raw, headers: { 'stripe-signature': `t=${at},v1=${stripeSignature(secret, raw, at)}` } });
}

test('Stripe form encoding and signatures follow Stripe\'s format', () => {
  assert.equal(stripeForm({ mode: 'payment', line_items: [{ quantity: 1, price_data: { unit_amount: 3900 } }] }), 'mode=payment&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=3900');
  const sig = stripeSignature('whsec_x', '{"a":1}', 1700000000);
  assert.equal(stripeSignatureValid('whsec_x', '{"a":1}', `t=1700000000,v1=${sig}`, 1700000100), true);
  assert.equal(stripeSignatureValid('whsec_x', '{"a":2}', `t=1700000000,v1=${sig}`, 1700000100), false, 'a changed body fails');
  assert.equal(stripeSignatureValid('whsec_x', '{"a":1}', `t=1700000000,v1=${sig}`, 1700000400), false, 'an old signature fails');
  assert.equal(stripeSignatureValid('', '{"a":1}', `t=1700000000,v1=${sig}`, 1700000100), false);
});

test('card checkout is configured from the environment and half a setup is refused', () => {
  const cfg = billingConfigFromEnv({ MYCA_STRIPE_SECRET_KEY: 'sk_live_abc', MYCA_STRIPE_WEBHOOK_SECRET: 'whsec_1', MYCA_STRIPE_PRICE_US_PLUS: 'price_1', MYCA_US_CHECKOUT_RETURN_URL: 'https://myca.app/us/paid', MYCA_US_PLUS_PRICE_USD: '89' });
  assert.deepEqual(cfg.stripe, { secretKey: 'sk_live_abc', webhookSecret: 'whsec_1', plusPriceId: 'price_1', returnUrl: 'https://myca.app/us/paid' });
  assert.equal(cfg.usPlus.priceUsd, 89);
  assert.equal(cfg.usExpertReview.on, false);
  assert.equal(billingConfigFromEnv({ MYCA_US_EXPERT_REVIEW: '1' }).usExpertReview.on, true);
  assert.match(billingConfigProblem({ MYCA_STRIPE_SECRET_KEY: 'sk_live_abc' }), /MYCA_STRIPE_WEBHOOK_SECRET/);
  assert.match(billingConfigProblem({ MYCA_STRIPE_SECRET_KEY: 'pk_live_abc', MYCA_STRIPE_WEBHOOK_SECRET: 'whsec_1', MYCA_US_CHECKOUT_RETURN_URL: 'https://myca.app/x' }), /secret key/);
  assert.match(billingConfigProblem({ MYCA_STRIPE_SECRET_KEY: 'sk_live_abc', MYCA_STRIPE_WEBHOOK_SECRET: 'whsec_1', MYCA_US_CHECKOUT_RETURN_URL: 'http://myca.app/x' }), /https/);
  assert.equal(billingConfigProblem({ MYCA_STRIPE_SECRET_KEY: 'sk_live_abc', MYCA_STRIPE_WEBHOOK_SECRET: 'whsec_1', MYCA_US_CHECKOUT_RETURN_URL: 'https://myca.app/x' }), '');
});

test('plans offer $129 by card, Plus at $249 a year, and no price on waitlist products', async () => {
  const out = await api.call('GET', '/v1/plans');
  assert.equal(out.body.usReturn.checkout, 'card');
  assert.equal(out.body.usReturn.priceLine, '$129 to file your federal return. One price, no upgrade fees.');
  assert.deepEqual({ price: out.body.usPlus.priceUsd, per: out.body.usPlus.per, buyable: out.body.usPlus.buyable }, { price: 249, per: 'year', buyable: true });
  const forms = await api.call('GET', '/v1/us/supported-forms');
  assert.ok(forms.body.supported.includes('W-2'));
  assert.ok(forms.body.coming.includes('Form 2441'));
});

test('a card payment for a return goes through Stripe Checkout and is recorded once by the webhook', async () => {
  const who = await household('+919400000081');
  const before = await get(who, `us-return-purchase?taxYear=${year}`);
  assert.equal(before.body.paid, false, before.text);
  assert.equal(before.body.checkout, 'card');
  const refused = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year } });
  assert.equal(refused.body.error, 'US_RETURN_UNPAID');
  stripeCalls.length = 0;
  const started = await post(who, 'us-checkout', { product: 'return', taxYear: year });
  assert.equal(started.status, 200, started.text);
  assert.match(started.body.url, /^https:\/\/checkout\.stripe\.com\//);
  const made = stripeCalls.find((c) => c.method === 'POST');
  assert.equal(made.auth, 'Bearer sk_test_123');
  assert.equal(made.form.mode, 'payment');
  assert.equal(made.form['line_items[0][price_data][unit_amount]'], '12900');
  assert.equal(made.form['line_items[0][price_data][currency]'], 'usd');
  assert.equal(made.form['metadata[businessId]'], who.businessId);
  assert.equal(made.form['metadata[taxYear]'], String(year));
  assert.match(made.form.success_url, /^https:\/\/myca\.example\/us\/paid\?checkout=\{CHECKOUT_SESSION_ID\}&result=paid$/);
  const session = pay(started.body.sessionId);
  const bad = await webhook({ type: 'checkout.session.completed', data: { object: session } }, { secret: 'whsec_wrong' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'BAD_SIGNATURE');
  const hook = await webhook({ type: 'checkout.session.completed', data: { object: session } });
  assert.equal(hook.status, 200, hook.text);
  assert.equal(hook.body.recorded, true);
  const again = await webhook({ type: 'checkout.session.completed', data: { object: session } });
  assert.equal(again.status, 200, 'a repeated webhook is harmless');
  const confirmed = await post(who, 'us-checkout-confirm', { sessionId: session.id });
  assert.equal(confirmed.body.paid, true, confirmed.text);
  assert.equal(confirmed.body.provider, 'stripe');
  assert.equal(confirmed.body.testPurchase, true);
  const filing = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year } });
  assert.notEqual(filing.body.error, 'US_RETURN_UNPAID', filing.text);
  const twice = await post(who, 'us-checkout', { product: 'return', taxYear: year });
  assert.equal(twice.body.error, 'ALREADY_PAID');
  const audit = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'billing.us_return_paid'", [who.businessId]);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].metadata.provider, 'stripe');
  const row = await api.db.query('select provider, price_usd from us_return_purchases where business_id = $1', [who.businessId]);
  assert.deepEqual(row.rows[0], { provider: 'stripe', price_usd: 129 });
});

test('the app can confirm a payment itself if the webhook is late, but not someone else\'s', async () => {
  const who = await household('+919400000082');
  const other = await household('+919400000083', 'Sam Lee');
  const started = await post(who, 'us-checkout', { product: 'return', taxYear: year });
  const early = await post(who, 'us-checkout-confirm', { sessionId: started.body.sessionId });
  assert.equal(early.body.error, 'PURCHASE_NOT_COMPLETE', 'an unpaid checkout pays for nothing');
  pay(started.body.sessionId);
  const stolen = await post(other, 'us-checkout-confirm', { sessionId: started.body.sessionId });
  assert.equal(stolen.body.error, 'PURCHASE_BELONGS_TO_ANOTHER_BUSINESS');
  assert.equal((await post(who, 'us-checkout-confirm', { sessionId: 'not-a-session' })).body.error, 'UNKNOWN_CHECKOUT');
  const confirmed = await post(who, 'us-checkout-confirm', { sessionId: started.body.sessionId });
  assert.equal(confirmed.body.paid, true, confirmed.text);
});

test('businesses cannot buy a personal return and unknown products are refused', async () => {
  const shop = await api.ownerWithBusiness('+919400000084', { name: 'Kiran Stores', state: '29' });
  assert.equal((await post(shop, 'us-checkout', { product: 'return', taxYear: year })).body.error, 'NOT_A_PERSONAL_RETURN');
  const who = await household('+919400000085');
  assert.equal((await post(who, 'us-checkout', { product: 'gold', taxYear: year })).body.error, 'UNKNOWN_PRODUCT');
  assert.equal((await post(who, 'us-checkout', { product: 'return', taxYear: 1999 })).body.error, 'BAD_TAX_YEAR');
});

test('MyCA Plus is a yearly subscription that unlocks the Plus tools and cancels in one tap', async () => {
  const who = await household('+919400000086');
  const locked = await post(who, 'query', { name: 'us_withholding_check', args: { taxYear: year + 1 } });
  assert.equal(locked.body.error, 'US_PLUS_REQUIRED', locked.text);
  assert.equal(locked.body.priceUsd, 249);
  assert.equal((await get(who, 'us-plus')).body.active, false);
  stripeCalls.length = 0;
  const started = await post(who, 'us-checkout', { product: 'plus' });
  assert.equal(started.status, 200, started.text);
  const made = stripeCalls.find((c) => c.method === 'POST');
  assert.equal(made.form.mode, 'subscription');
  assert.equal(made.form['line_items[0][price]'], 'price_plus_yearly');
  const periodEnd = Math.floor(api.clock.now / 1000) + 365 * 86400;
  subscriptions.set('sub_1', { id: 'sub_1', status: 'active', current_period_end: periodEnd, cancel_at_period_end: false });
  const session = pay(started.body.sessionId, { subscription: 'sub_1' });
  assert.equal((await webhook({ type: 'checkout.session.completed', data: { object: session } })).body.recorded, true);
  const plus = await get(who, 'us-plus');
  assert.equal(plus.body.active, true, plus.text);
  assert.equal(plus.body.renews, true);
  const open = await post(who, 'query', { name: 'us_withholding_check', args: { taxYear: year + 1 } });
  assert.notEqual(open.body.error, 'US_PLUS_REQUIRED', open.text);
  assert.equal((await post(who, 'us-checkout', { product: 'plus' })).body.error, 'ALREADY_SUBSCRIBED');
  const canceled = await post(who, 'us-plus-cancel', {});
  assert.equal(canceled.body.active, true, 'Plus runs to the end of the paid year');
  assert.equal(canceled.body.renews, false);
  await webhook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled', current_period_end: Math.floor(api.clock.now / 1000) - 10 * 86400 } } });
  assert.equal((await get(who, 'us-plus')).body.active, false);
  const audit = await api.db.query("select action from audit_log where business_id = $1 and action like 'billing.us_plus%' order by id", [who.businessId]);
  assert.deepEqual(audit.rows.map((r) => r.action), ['billing.us_plus_started', 'billing.us_plus_canceled', 'billing.us_plus_changed']);
});

test('the waitlist for Done For You and the International add-on records interest without a price', async () => {
  const who = await household('+919400000087');
  const joined = await post(who, 'us-waitlist', { product: 'done_for_you' });
  assert.equal(joined.body.joined, true, joined.text);
  assert.equal(joined.body.priceUsd, undefined);
  assert.equal((await post(who, 'us-waitlist', { product: 'done_for_you' })).body.joined, true, 'joining twice is harmless');
  assert.equal((await post(who, 'us-waitlist', { product: 'gold' })).body.error, 'UNKNOWN_PRODUCT');
  const audit = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'us.waitlist_joined'", [who.businessId]);
  assert.equal(audit.rows.length, 1);
});
