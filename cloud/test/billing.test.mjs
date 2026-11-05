import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createBilling } from '../src/billing.mjs';
import { startApi, SALE } from './helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;
const WEBHOOK_SECRET = 'whsec-for-tests-0123456789';
const KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const razorpayCalls = [];
let nextStatus = 'created';

async function fakeRazorpay(url, init = {}) {
  const body = init.body ? JSON.parse(init.body) : {};
  razorpayCalls.push({ url: String(url), body, auth: init.headers?.authorization || '' });
  const json = (status, data) => new Response(JSON.stringify(data), { status });
  if (String(url) === 'https://api.razorpay.com/v1/subscriptions') return json(200, { id: `sub_${razorpayCalls.length}`, status: nextStatus, short_url: 'https://rzp.io/i/test123', plan_id: body.plan_id });
  if (/\/v1\/subscriptions\/sub_\d+\/cancel$/.test(String(url))) return json(200, { id: 'sub_x', status: 'cancelled' });
  return json(404, { error: { description: 'no route' } });
}

let api;
const age = (who, days) => api.db.query(`update businesses set created_at = created_at - make_interval(days => $2) where id = $1`, [who.businessId, days]);
before(async () => {
  api = await startApi({
    connectorKey: KEY,
    billing: ({ db, now }) => createBilling({ db, now, fetchImpl: fakeRazorpay, config: { keyId: 'rzp_test_abc', keySecret: 'secret123', webhookSecret: WEBHOOK_SECRET, planIds: { pro: 'plan_pro_1', firm: 'plan_firm_1' }, prices: { pro: 599 } } }),
  });
});
after(() => api.close());

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });

async function webhook(event, entity, { secret = WEBHOOK_SECRET, id = `evt_${Math.random()}` } = {}) {
  const raw = JSON.stringify({ event, payload: { subscription: { entity } }, created_at: Math.floor(api.clock.now / 1000) });
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  return api.call('POST', '/v1/billing/razorpay/webhook', { raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': id } });
}

test('plans are public, priced from the config, and say which can be bought', async () => {
  const out = await api.call('GET', '/v1/plans');
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.testMode, true);
  assert.equal(out.body.trialDays, 14);
  const byId = Object.fromEntries(out.body.plans.map((p) => [p.id, p]));
  assert.equal(byId.pro.monthlyRupees, 599);
  assert.equal(byId.firm.monthlyRupees, 1499);
  assert.equal(byId.free.buyable, false);
  assert.equal(byId.pro.buyable, true);
});

test('a new business gets a 14-day trial of Pro, then falls to Free with its limits', async () => {
  const owner = await api.ownerWithBusiness('+919400000081', { name: 'Trial Traders', state: '29' });
  const first = await get(owner, 'subscription');
  assert.equal(first.body.plan, 'pro');
  assert.equal(first.body.trial.daysLeft, 14);
  assert.equal((await post(owner, 'connectors', { channel: 'razorpay', keyId: 'rzp_1', keySecret: 'x' })).body.ok, true);

  await age(owner, 15);
  const later = await get(owner, 'subscription');
  assert.equal(later.body.plan, 'free');
  assert.equal(later.body.trial, null);
  const blocked = await post(owner, 'connectors', { channel: 'razorpay', keyId: 'rzp_2' });
  assert.equal(blocked.body.error, 'PLAN_REQUIRED');
  assert.equal((await post(owner, 'invitations', { phone: '+919400000089', role: 'staff' })).body.error, 'PLAN_REQUIRED');
  assert.equal((await post(owner, 'einvoice', { invoiceId: 'INV-0001' })).body.error, 'PLAN_REQUIRED');
});

test('Free stops at 30 invoices a month', async () => {
  const owner = await api.ownerWithBusiness('+919400000082', { name: 'Small Shop', state: '29' });
  await age(owner, 20);
  {
    const month = new Date(api.clock.now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
    let held;
    for (let i = 0; i < 31; i += 1) {
      held = await post(owner, 'propose', { name: 'create_invoice', args: { ...SALE, date: `${month}-01` } });
      if (held.body.error === 'PLAN_LIMIT_REACHED') break;
      const posted = await post(owner, 'confirm', { token: held.body.preview.token });
      assert.equal(posted.body.posted, true, posted.text);
    }
    assert.equal(held.body.error, 'PLAN_LIMIT_REACHED');
    assert.equal(held.body.cap, 30);
  }
});

test('only the owner subscribes; the checkout link comes from Razorpay and a signed webhook makes the plan active', async () => {
  const owner = await api.ownerWithBusiness('+919400000083', { name: 'Paying Co', state: '29' });
  assert.equal((await post(owner, 'subscription', { plan: 'gold' })).body.error, 'UNKNOWN_PLAN');
  const out = await post(owner, 'subscription', { plan: 'firm' });
  assert.equal(out.body.ok, true, out.text);
  assert.equal(out.body.checkoutUrl, 'https://rzp.io/i/test123');
  const call = razorpayCalls.at(-1);
  assert.equal(call.body.plan_id, 'plan_firm_1');
  assert.equal(call.body.notes.businessId, owner.businessId);
  assert.equal(call.auth, `Basic ${Buffer.from('rzp_test_abc:secret123').toString('base64')}`);
  const subId = `sub_${razorpayCalls.length}`;

  assert.equal((await get(owner, 'subscription')).body.subscription.checkoutUrl, 'https://rzp.io/i/test123');
  const forged = await webhook('subscription.activated', { id: subId, status: 'active', current_end: Math.floor((api.clock.now + 30 * DAY) / 1000) }, { secret: 'wrong' });
  assert.equal(forged.status, 401);

  await age(owner, 20);
  {
    assert.equal((await get(owner, 'subscription')).body.plan, 'free');
    const end = Math.floor((api.clock.now + 30 * DAY) / 1000);
    const ok = await webhook('subscription.activated', { id: subId, status: 'active', current_end: end }, { id: 'evt_same' });
    assert.equal(ok.status, 200, ok.text);
    assert.equal((await webhook('subscription.activated', { id: subId, status: 'active', current_end: end }, { id: 'evt_same' })).body.duplicate, true);
    const ent = (await get(owner, 'subscription')).body;
    assert.equal(ent.plan, 'firm');
    assert.equal(ent.limits.members, 25);
    assert.equal(ent.subscription.status, 'active');

    assert.equal((await post(owner, 'subscription', { plan: 'pro' })).body.error, 'ALREADY_SUBSCRIBED');

    await webhook('subscription.charged', { id: subId, status: 'active', current_end: Math.floor((api.clock.now - 4 * DAY) / 1000) });
    assert.equal((await get(owner, 'subscription')).body.plan, 'free', 'an unpaid period ends after the grace days');

    await webhook('subscription.halted', { id: subId, status: 'halted', current_end: end });
    assert.equal((await get(owner, 'subscription')).body.plan, 'free');
  }
});

test('staff cannot subscribe or cancel, and billing secrets never reach a response', async () => {
  const owner = await api.ownerWithBusiness('+919400000084', { name: 'Team Co', state: '29' });
  const invited = await post(owner, 'invitations', { phone: '+919400000085', role: 'staff' });
  assert.equal(invited.status, 200, invited.text);
  const staff = await api.signIn('+919400000085');
  await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: staff.accessToken });
  const asStaff = { token: staff.accessToken, businessId: owner.businessId };
  assert.equal((await post(asStaff, 'subscription', { plan: 'pro' })).status, 403);
  assert.equal((await post(asStaff, 'subscription-cancel', {})).status, 403);
  const seen = JSON.stringify([(await get(asStaff, 'subscription')).body, (await api.call('GET', '/v1/plans')).body]);
  assert.ok(!seen.includes('secret123') && !seen.includes(WEBHOOK_SECRET) && !seen.includes('plan_pro_1'));
});
