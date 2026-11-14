import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBilling } from '../src/billing.mjs';
import { stripeSignature } from '../src/stripe.mjs';
import { signPartnerBody, PARTNER_SIGNATURE_HEADER } from '../../platform/src/us-filing-partner.mjs';
import { startApi } from './helpers.mjs';

const STRIPE_HOOK = 'whsec_test_sandbox_edge';
const PARTNER_HOOK = 'whsec-partner-sandbox-edge-0123456789';
const PARTNER_ENV = {
  MYCA_US_FILER: 'column-tax',
  MYCA_US_FILER_BASE_URL: 'https://api.partner.example',
  MYCA_US_FILER_API_KEY: 'key_test_sandbox_edge',
  MYCA_US_FILER_WEBHOOK_SECRET: PARTNER_HOOK,
  MYCA_PROVIDER_ENV: 'test',
};
const SSNS = { primary: '400-12-3461', spouse: '400-12-3462', dependent: '400-12-3463' };
const checkouts = new Map();
const partnerCalls = [];
const realFetch = globalThis.fetch;
let partnerMode = 'up';
let nextId = 1;
let api;
let year;

async function fakeStripe(url, init = {}) {
  const text = String(url);
  const form = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : {};
  const json = (status, data) => new Response(JSON.stringify(data), { status });
  if (text === 'https://api.stripe.com/v1/checkout/sessions' && init.method === 'POST') {
    const id = `cs_test_edge_${nextId++}`;
    const metadata = Object.fromEntries(Object.entries(form).filter(([key]) => key.startsWith('metadata[')).map(([key, value]) => [key.slice(9, -1), value]));
    const session = { id, url: `https://checkout.stripe.com/c/pay/${id}`, status: 'open', payment_status: 'unpaid', mode: form.mode, metadata, client_reference_id: form.client_reference_id, amount_total: Number(form['line_items[0][price_data][unit_amount]'] || 0), payment_intent: `pi_test_edge_${id.slice(-4)}`, livemode: false };
    checkouts.set(id, session);
    return json(200, session);
  }
  const got = text.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/([^/?]+)$/);
  if (got && checkouts.has(got[1])) return json(200, checkouts.get(got[1]));
  return json(404, {});
}

async function fakePartner(url, init) {
  const body = JSON.parse(init.body);
  partnerCalls.push({ body, headers: init.headers });
  if (partnerMode === 'down') throw new TypeError('fetch failed');
  if (partnerMode === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  if (partnerMode === 'error') return new Response('{"error":"internal"}', { status: 500 });
  if (partnerMode === 'no-url') return new Response(JSON.stringify({ id: 'cu_x', user_url: 'http://insecure.example/s/1' }), { status: 200 });
  return new Response(JSON.stringify({ id: `cu_${partnerCalls.length}`, user_url: `https://file.partner.example/s/${partnerCalls.length}` }), { status: 200 });
}

before(async () => {
  Object.assign(process.env, PARTNER_ENV);
  globalThis.fetch = async (url, init) => (String(url).startsWith('https://api.partner.example/') ? fakePartner(url, init) : realFetch(url, init));
  api = await startApi({
    billing: ({ db, now }) => createBilling({
      db,
      now,
      fetchImpl: fakeStripe,
      config: { usReturn: { priceUsd: 129, launchPriceUsd: 99, launchUntil: '2027-04-15' }, stripe: { secretKey: 'sk_test_edge', webhookSecret: STRIPE_HOOK, plusPriceId: 'price_plus_yearly', returnUrl: 'https://myca.example/us/paid' } },
    }),
  });
  year = new Date(api.clock.now).getUTCFullYear() - 1;
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const key of [...Object.keys(PARTNER_ENV), 'MYCA_US_FILER_SEND_TINS']) delete process.env[key];
  await api.close();
});

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, path) => api.call('GET', `/v1/businesses/${who.businessId}/${path}`, { token: who.token });
const dataOf = (out) => out.body.result?.data ?? out.body.data ?? out.body;
const fileResult = (out) => out.body.tools?.find((t) => t.name === 'file_us_return')?.result ?? out.body.result ?? out.body;

async function household(phone, name = 'Riley Park') {
  const session = await api.signIn(phone);
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name, country: 'US', kind: 'household' } });
  assert.equal(created.status, 200, created.text);
  return { token: session.accessToken, businessId: created.body.business.id, userId: session.user.id };
}

async function write(who, name, args) {
  const proposed = await post(who, 'propose', { name, args });
  assert.equal(proposed.status, 200, proposed.text);
  assert.ok(proposed.body.preview?.token, proposed.text);
  const confirmed = await post(who, 'confirm', { token: proposed.body.preview.token });
  assert.equal(confirmed.status, 200, confirmed.text);
  return confirmed;
}

async function prepare(who, taxYear = year, { joint = false } = {}) {
  const taxpayer = { firstName: 'Riley', lastName: 'Park', ssn: SSNS.primary, dateOfBirth: '1987-03-14', occupation: 'Engineer' };
  const spouse = joint ? { firstName: 'Casey', lastName: 'Park', ssn: SSNS.spouse, dateOfBirth: '1988-07-01', occupation: 'Teacher' } : undefined;
  await write(who, 'set_us_taxpayer', { taxYear: String(taxYear), filingStatus: joint ? 'mfj' : 'single', taxpayer, ...(spouse ? { spouse } : {}), address: { line1: '5 Pine St', city: 'Portland', state: 'OR', zip: '97201' } });
  await write(who, 'add_us_tax_form', { taxYear: String(taxYear), kind: 'W-2', payer: 'Harbor Labs', payerTin: '12-3456782', fields: { wages: 81000, federalWithheld: 9000, socialSecurityWages: 81000, socialSecurityTax: 5022, medicareWages: 81000, medicareTax: 1174.5 } });
  if (joint) await write(who, 'add_us_tax_form', { taxYear: String(taxYear), kind: 'W-2', owner: 'spouse', payer: 'Lincoln School', payerTin: '12-3456783', fields: { wages: 52000, federalWithheld: 4000, socialSecurityWages: 52000, socialSecurityTax: 3224, medicareWages: 52000, medicareTax: 754 } });
}

function stripeHook(event, { secret = STRIPE_HOOK, at = Math.floor(api.clock.now / 1000), header } = {}) {
  const raw = typeof event === 'string' ? event : JSON.stringify(event);
  return api.call('POST', '/v1/billing/stripe/webhook', { raw, headers: header === undefined ? { 'stripe-signature': `t=${at},v1=${stripeSignature(secret, raw, at)}` } : header ? { 'stripe-signature': header } : {} });
}

function partnerHook(body, { secret = PARTNER_HOOK, header } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return api.call('POST', '/v1/us/filer/webhook', { raw, headers: { 'content-type': 'application/json', ...(header === null ? {} : { [PARTNER_SIGNATURE_HEADER]: header ?? signPartnerBody(raw, secret) }) } });
}

async function startCheckout(who, taxYear = year) {
  const started = await post(who, 'us-checkout', { product: 'return', taxYear });
  assert.equal(started.status, 200, started.text);
  assert.ok(started.body.sessionId, started.text);
  return checkouts.get(started.body.sessionId);
}

function paid(session, extra = {}) {
  return Object.assign(session, { status: 'complete', payment_status: 'paid' }, extra);
}

async function payFor(who, taxYear = year) {
  const session = paid(await startCheckout(who, taxYear));
  const hook = await stripeHook({ type: 'checkout.session.completed', data: { object: session } });
  assert.equal(hook.body.recorded, true, hook.text);
  return session;
}

const purchases = async (businessId) => (await api.db.query('select tax_year as "taxYear", purchase_token as "token", price_usd as "priceUsd" from us_return_purchases where business_id = $1 order by tax_year', [businessId])).rows;
const auditCount = async (businessId, action) => (await api.db.query('select count(*)::int as n from audit_log where business_id = $1 and action = $2', [businessId, action])).rows[0].n;

test('Stripe webhooks: a forged, stale, unsigned or unreadable event is refused and records nothing', async () => {
  const who = await household('+919400000301');
  const session = paid(await startCheckout(who));
  const event = { type: 'checkout.session.completed', data: { object: session } };
  assert.equal((await stripeHook(event, { secret: 'whsec_someone_else' })).body.error, 'BAD_SIGNATURE');
  assert.equal((await stripeHook(event, { at: Math.floor(api.clock.now / 1000) - 600 })).body.error, 'BAD_SIGNATURE', 'a signature older than five minutes is a replay');
  assert.equal((await stripeHook(event, { at: Math.floor(api.clock.now / 1000) + 600 })).body.error, 'BAD_SIGNATURE', 'a signature from the future is refused too');
  assert.equal((await stripeHook(event, { header: '' })).body.error, 'BAD_SIGNATURE');
  assert.equal((await stripeHook(event, { header: 't=1,v1=zz' })).body.error, 'BAD_SIGNATURE');
  const unreadable = await stripeHook('{not json');
  assert.equal(unreadable.status, 400);
  assert.equal(unreadable.body.error, 'BAD_EVENT');
  const tampered = JSON.stringify(event);
  const at = Math.floor(api.clock.now / 1000);
  const sig = stripeSignature(STRIPE_HOOK, tampered, at);
  const swapped = await api.call('POST', '/v1/billing/stripe/webhook', { raw: tampered.replace(who.businessId, '00000000-0000-4000-8000-000000000001'), headers: { 'stripe-signature': `t=${at},v1=${sig}` } });
  assert.equal(swapped.body.error, 'BAD_SIGNATURE', 'a body changed after signing fails');
  assert.deepEqual(await purchases(who.businessId), []);
  const other = await stripeHook({ type: 'invoice.paid', data: { object: {} } });
  assert.deepEqual({ status: other.status, recorded: other.body.recorded }, { status: 200, recorded: false }, 'an event MyCA does not use is acknowledged and ignored');
});

test('Stripe webhooks: a replayed or repeated payment is recorded once, and an unpaid or async session waits for the money', async () => {
  const who = await household('+919400000302');
  const session = await startCheckout(who);
  const pending = await stripeHook({ type: 'checkout.session.completed', data: { object: { ...session, status: 'complete', payment_status: 'unpaid' } } });
  assert.equal(pending.body.recorded, false, 'a bank debit that has not cleared pays for nothing yet');
  assert.equal((await get(who, `us-return-purchase?taxYear=${year}`)).body.paid, false);
  paid(session);
  const event = { type: 'checkout.session.async_payment_succeeded', data: { object: session } };
  assert.equal((await stripeHook(event)).body.recorded, true);
  assert.equal((await stripeHook(event)).body.recorded, true, 'the same event again is harmless');
  assert.equal((await stripeHook({ type: 'checkout.session.completed', data: { object: session } })).body.recorded, true);
  assert.equal((await post(who, 'us-checkout-confirm', { sessionId: session.id })).body.paid, true);
  assert.equal((await purchases(who.businessId)).length, 1);
  assert.equal(await auditCount(who.businessId, 'billing.us_return_paid'), 1, 'one payment, one audit event');
});

test('a payment covers only its own household and tax year', async () => {
  const who = await household('+919400000303');
  const other = await household('+919400000304', 'Morgan Diaz');
  await payFor(who, year);
  assert.equal((await get(who, `us-return-purchase?taxYear=${year}`)).body.paid, true);
  assert.equal((await get(who, `us-return-purchase?taxYear=${year - 1}`)).body.paid, false, 'last year is not paid for by this year\'s fee');
  assert.equal((await get(other, `us-return-purchase?taxYear=${year}`)).body.paid, false, 'another household is not paid for');
  assert.equal((await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year - 1 } })).body.error, 'US_RETURN_UNPAID');
  assert.equal((await post(other, 'propose', { name: 'file_us_return', args: { taxYear: year } })).body.error, 'US_RETURN_UNPAID');
  const stolen = paid(await startCheckout(who, year - 1));
  assert.equal((await post(other, 'us-checkout-confirm', { sessionId: stolen.id })).body.error, 'PURCHASE_BELONGS_TO_ANOTHER_BUSINESS');
  assert.equal((await get(other, `us-return-purchase?taxYear=${year - 1}`)).body.paid, false);
  assert.equal((await post(who, 'us-checkout', { product: 'return', taxYear: year + 2 })).body.error, 'BAD_TAX_YEAR', 'a year after the current one cannot be bought');
  assert.equal((await post(who, 'us-checkout', { product: 'return', taxYear: year - 4 })).body.error, 'BAD_TAX_YEAR', 'nor one more than three years back');
  assert.equal((await post(who, 'us-checkout', { product: 'return', taxYear: 'abc' })).body.error, 'BAD_TAX_YEAR');
  assert.equal((await post(who, 'us-checkout', { product: 'return', taxYear: year })).body.error, 'ALREADY_PAID');
});

test('paying twice for the same return through two open checkouts is flagged for a refund, not lost', async () => {
  const who = await household('+919400000305');
  const first = await startCheckout(who);
  const second = await startCheckout(who);
  assert.notEqual(first.id, second.id);
  assert.equal((await stripeHook({ type: 'checkout.session.completed', data: { object: paid(first) } })).body.recorded, true);
  const dup = await stripeHook({ type: 'checkout.session.completed', data: { object: paid(second) } });
  assert.equal(dup.status, 200, 'Stripe is not asked to retry');
  assert.equal(dup.body.recorded, false, dup.text);
  assert.equal(dup.body.duplicate, true, dup.text);
  await stripeHook({ type: 'checkout.session.completed', data: { object: second } });
  assert.deepEqual((await purchases(who.businessId)).map((row) => row.token), [first.id], 'the first payment stays the one that counts');
  assert.equal(await auditCount(who.businessId, 'billing.us_return_duplicate_payment'), 1, 'the second charge is audited once so it can be refunded');
  const confirmed = await post(who, 'us-checkout-confirm', { sessionId: second.id });
  assert.equal(confirmed.body.paid, true, 'the app still sees the return as paid');
});

test('a refunded payment stops covering the return, and a dispute is recorded', async () => {
  const who = await household('+919400000306');
  const session = await payFor(who);
  assert.equal((await stripeHook({ type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: session.payment_intent, amount: 9900, reason: 'fraudulent' } } })).status, 200);
  assert.equal(await auditCount(who.businessId, 'billing.us_return_disputed'), 1);
  assert.equal((await get(who, `us-return-purchase?taxYear=${year}`)).body.paid, true, 'a dispute alone does not take the return away');
  const partial = await stripeHook({ type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: session.payment_intent, amount: 9900, amount_refunded: 1000, refunded: false } } });
  assert.equal(partial.body.recorded, false, 'a partial refund leaves the return paid');
  assert.equal((await get(who, `us-return-purchase?taxYear=${year}`)).body.paid, true);
  const full = await stripeHook({ type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: session.payment_intent, amount: 9900, amount_refunded: 9900, refunded: true } } });
  assert.equal(full.body.recorded, true, full.text);
  assert.equal((await get(who, `us-return-purchase?taxYear=${year}`)).body.paid, false);
  assert.equal((await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year } })).body.error, 'US_RETURN_UNPAID');
  assert.equal((await stripeHook({ type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: session.payment_intent, amount: 9900, amount_refunded: 9900, refunded: true } } })).body.recorded, false, 'a repeated refund changes nothing');
  assert.equal(await auditCount(who.businessId, 'billing.us_return_refunded'), 1);
  assert.equal((await stripeHook({ type: 'charge.refunded', data: { object: { id: 'ch_2', payment_intent: 'pi_unknown', amount_refunded: 100, refunded: true } } })).body.recorded, false);
  const again = await payFor(who);
  assert.equal((await purchases(who.businessId))[0].token, again.id, 'the return can be bought again after a refund');
});

test('the launch price ends at the end of 15 April 2027 in New York, to the millisecond', async () => {
  const at = (iso) => createBilling({ db: api.db, now: () => Date.parse(iso), fetchImpl: fakeStripe, config: { usReturn: { priceUsd: 129, launchPriceUsd: 99, launchUntil: '2027-04-15' }, stripe: { secretKey: 'sk_test_edge', webhookSecret: STRIPE_HOOK, returnUrl: 'https://myca.example/us/paid' } } }).plans().usReturn;
  assert.equal(at('2026-11-14T12:00:00Z').priceUsd, 99);
  assert.deepEqual(at('2026-11-14T12:00:00Z').launchOffer, { priceUsd: 99, until: '2027-04-15' });
  assert.equal(at('2027-04-15T23:59:59.000-04:00').priceUsd, 99);
  assert.equal(at('2027-04-15T23:59:59.999-04:00').priceUsd, 99, 'the last millisecond of the day is still the launch price');
  assert.equal(at('2027-04-16T03:59:59.999Z').priceUsd, 99, 'the same instant written in UTC');
  assert.equal(at('2027-04-16T04:00:00.000Z').priceUsd, 129, 'midnight in New York (EDT, UTC-4) ends the offer');
  assert.equal(at('2027-04-16T00:00:00-04:00').launchOffer, null);
  assert.equal(at('2027-04-15T21:30:00-07:00').priceUsd, 129, 'the cut-over is one instant for everyone: 9:30 pm in Los Angeles is already past midnight in New York');
  const late = at('2027-04-16T04:00:00.000Z');
  assert.equal(late.priceLine, '$129 to file your federal return. One price, no upgrade fees.');
  assert.match(at('2027-01-10T00:00:00Z').priceLine, /^\$99 to file your federal return, launch price for this season \(usually \$129\)/);
});

test('a checkout started at the launch price keeps it when paid after the cut-over, and a later checkout pays the list price', async () => {
  const who = await household('+919400000307');
  const amounts = [];
  const fetchImpl = async (url, init) => {
    const out = await fakeStripe(url, init);
    if (init?.method === 'POST') amounts.push(Number(new URLSearchParams(init.body).get('line_items[0][price_data][unit_amount]')));
    return out;
  };
  let clock = Date.parse('2027-04-15T23:59:00-04:00');
  const billing = createBilling({ db: api.db, now: () => clock, fetchImpl, config: { usReturn: { priceUsd: 129, launchPriceUsd: 99, launchUntil: '2027-04-15' }, stripe: { secretKey: 'sk_test_edge', webhookSecret: STRIPE_HOOK, returnUrl: 'https://myca.example/us/paid' } } });
  const early = await billing.usCheckout(who.businessId, who.userId, { product: 'return', taxYear: 2026 });
  assert.equal(early.ok, true, JSON.stringify(early));
  clock = Date.parse('2027-04-16T00:00:30-04:00');
  const late = await billing.usCheckout(who.businessId, who.userId, { product: 'return', taxYear: 2025 });
  assert.equal(late.ok, true, JSON.stringify(late));
  assert.deepEqual(amounts, [9900, 12900]);
  const out = await billing.usCheckoutConfirm(who.businessId, who.userId, { sessionId: paid(checkouts.get(early.sessionId)).id });
  assert.equal(out.paid, true, JSON.stringify(out));
  assert.equal(out.priceUsd, 99, 'the price recorded is what Stripe charged');
});
