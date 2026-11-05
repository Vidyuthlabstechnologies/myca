import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { createBilling } from '../src/billing.mjs';
import { startApi, SALE } from './helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOTIFY = 'play-notify-token-for-tests-0123456789';
const KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const PACKAGE = 'com.mldynamic.myca';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const calls = [];
const purchases = new Map();

async function fakeGoogle(url, init = {}) {
  const text = String(url);
  calls.push({ url: text, method: init.method || 'GET', auth: init.headers?.authorization || '', body: init.body || '' });
  const json = (status, data) => new Response(JSON.stringify(data), { status });
  if (text === 'https://oauth2.googleapis.com/token') {
    const assertion = new URLSearchParams(init.body).get('assertion').split('.');
    const valid = createVerify('RSA-SHA256').update(`${assertion[0]}.${assertion[1]}`).verify(publicKey, Buffer.from(assertion[2], 'base64url'));
    return valid ? json(200, { access_token: 'ya29.test', expires_in: 3600 }) : json(401, {});
  }
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/`;
  if (!text.startsWith(base)) return json(404, {});
  const rest = text.slice(base.length);
  const get = rest.match(/^subscriptionsv2\/tokens\/([^/]+)$/);
  if (get) {
    const found = purchases.get(decodeURIComponent(get[1]));
    return found ? json(200, found) : json(404, { error: { message: 'not found' } });
  }
  const ack = rest.match(/^subscriptions\/([^/]+)\/tokens\/([^/:]+):acknowledge$/);
  if (ack) {
    const found = purchases.get(decodeURIComponent(ack[2]));
    if (found) found.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
    return json(200, {});
  }
  return json(404, {});
}

function purchase(token, { productId = 'myca_pro_monthly', state = 'ACTIVE', expires, accountId = '', test = true } = {}) {
  purchases.set(token, {
    subscriptionState: `SUBSCRIPTION_STATE_${state}`,
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    lineItems: [{ productId, expiryTime: new Date(expires).toISOString() }],
    ...(accountId ? { externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId } } : {}),
    ...(test ? { testPurchase: {} } : {}),
  });
}

let api;
const age = (who, days) => api.db.query(`update businesses set created_at = created_at - make_interval(days => $2) where id = $1`, [who.businessId, days]);
before(async () => {
  api = await startApi({
    connectorKey: KEY,
    billing: ({ db, now }) => createBilling({
      db,
      now,
      fetchImpl: fakeGoogle,
      config: { packageName: PACKAGE, productIds: { pro: 'myca_pro_monthly', firm: 'myca_firm_monthly' }, notifyToken: NOTIFY, serviceAccount: { clientEmail: 'play@test.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), tokenUri: 'https://oauth2.googleapis.com/token' }, prices: { pro: 599 } },
    }),
  });
});
after(() => api.close());

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });

function notify(purchaseToken, { token = NOTIFY, id = `msg-${Math.random()}`, packageName = PACKAGE, type = 4 } = {}) {
  const data = Buffer.from(JSON.stringify({ version: '1.0', packageName, eventTimeMillis: String(api.clock.now), subscriptionNotification: { version: '1.0', notificationType: type, purchaseToken, subscriptionId: 'myca_pro_monthly' } })).toString('base64');
  const raw = JSON.stringify({ message: { data, messageId: id }, subscription: 'projects/p/subscriptions/play' });
  return api.call('POST', `/v1/billing/play/notify?token=${encodeURIComponent(token)}`, { raw, headers: { 'content-type': 'application/json' } });
}

test('plans are public, name the Play product for each paid plan, and say which can be bought', async () => {
  const out = await api.call('GET', '/v1/plans');
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.store, 'play');
  assert.equal(out.body.packageName, PACKAGE);
  assert.equal(out.body.trialDays, 14);
  const byId = Object.fromEntries(out.body.plans.map((p) => [p.id, p]));
  assert.equal(byId.pro.monthlyRupees, 599);
  assert.equal(byId.pro.productId, 'myca_pro_monthly');
  assert.equal(byId.firm.productId, 'myca_firm_monthly');
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
  assert.equal((await post(owner, 'connectors', { channel: 'razorpay', keyId: 'rzp_2' })).body.error, 'PLAN_REQUIRED');
  assert.equal((await post(owner, 'invitations', { phone: '+919400000089', role: 'staff' })).body.error, 'PLAN_REQUIRED');
  assert.equal((await post(owner, 'einvoice', { invoiceId: 'INV-0001' })).body.error, 'PLAN_REQUIRED');
});

test('Free stops at 30 invoices a month', async () => {
  const owner = await api.ownerWithBusiness('+919400000082', { name: 'Small Shop', state: '29' });
  await age(owner, 20);
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
});

test('a Play purchase is checked with Google, acknowledged, and turns the plan on; renewal notices keep it current', async () => {
  const owner = await api.ownerWithBusiness('+919400000083', { name: 'Paying Co', state: '29' });
  await age(owner, 20);
  assert.equal((await get(owner, 'subscription')).body.plan, 'free');
  assert.equal((await post(owner, 'subscription', { productId: 'gold', purchaseToken: 'tok-x' })).body.error, 'UNKNOWN_PLAN');
  assert.equal((await post(owner, 'subscription', { productId: 'myca_firm_monthly', purchaseToken: 'tok-missing' })).body.error, 'PURCHASE_NOT_FOUND');

  purchase('tok-firm', { productId: 'myca_firm_monthly', expires: api.clock.now + 30 * DAY, accountId: owner.businessId });
  assert.equal((await post(owner, 'subscription', { productId: 'myca_pro_monthly', purchaseToken: 'tok-firm' })).body.error, 'PURCHASE_PRODUCT_MISMATCH');
  const out = await post(owner, 'subscription', { productId: 'myca_firm_monthly', purchaseToken: 'tok-firm' });
  assert.equal(out.body.ok, true, out.text);
  assert.equal(out.body.plan, 'firm');
  assert.equal(out.body.testPurchase, true);
  assert.equal(out.body.entitlement.plan, 'firm');
  assert.equal(out.body.entitlement.limits.members, 25);
  assert.equal(purchases.get('tok-firm').acknowledgementState, 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED');
  assert.ok(calls.some((c) => c.url.endsWith(':acknowledge') && c.auth === 'Bearer ya29.test'));
  assert.match((await get(owner, 'subscription')).body.manageUrl, /^https:\/\/play\.google\.com\/store\/account\/subscriptions\?sku=myca_firm_monthly&package=com\.mldynamic\.myca$/);

  assert.equal((await notify('tok-firm', { token: 'wrong' })).status, 401);
  assert.equal((await notify('tok-firm', { packageName: 'com.other' })).body.ignored, true);

  purchase('tok-firm', { productId: 'myca_firm_monthly', state: 'CANCELED', expires: api.clock.now + 10 * DAY });
  assert.equal((await notify('tok-firm', { type: 3 })).status, 200);
  const canceled = (await get(owner, 'subscription')).body;
  assert.equal(canceled.plan, 'firm', 'a cancelled plan runs to the end of what was paid');
  assert.equal(canceled.subscription.renews, false);

  purchase('tok-firm', { productId: 'myca_firm_monthly', state: 'EXPIRED', expires: api.clock.now - DAY });
  await notify('tok-firm', { type: 13 });
  assert.equal((await get(owner, 'subscription')).body.plan, 'free');

  purchase('tok-firm', { productId: 'myca_firm_monthly', state: 'ON_HOLD', expires: api.clock.now + 5 * DAY });
  await notify('tok-firm', { type: 5 });
  assert.equal((await get(owner, 'subscription')).body.plan, 'free', 'a payment on hold does not keep the plan');
});

test('a purchase the app never reported is picked up from the Play notice, and one token cannot pay for two businesses', async () => {
  const owner = await api.ownerWithBusiness('+919400000086', { name: 'Late Co', state: '29' });
  const other = await api.ownerWithBusiness('+919400000087', { name: 'Other Co', state: '29' });
  await age(owner, 20);
  purchase('tok-late', { expires: api.clock.now + 30 * DAY, accountId: owner.businessId });
  assert.equal((await notify('tok-late', { type: 4 })).status, 200);
  assert.equal((await get(owner, 'subscription')).body.plan, 'pro');

  assert.equal((await post(other, 'subscription', { productId: 'myca_pro_monthly', purchaseToken: 'tok-late' })).body.error, 'PURCHASE_BELONGS_TO_ANOTHER_BUSINESS');
  purchase('tok-shared', { expires: api.clock.now + 30 * DAY, accountId: owner.businessId });
  assert.equal((await post(other, 'subscription', { productId: 'myca_pro_monthly', purchaseToken: 'tok-shared' })).body.error, 'PURCHASE_BELONGS_TO_ANOTHER_BUSINESS');

  assert.equal((await notify('tok-nobody')).body.unknown, true);
});

test('staff cannot record a purchase, and no Google credential reaches a response', async () => {
  const owner = await api.ownerWithBusiness('+919400000084', { name: 'Team Co', state: '29' });
  const invited = await post(owner, 'invitations', { phone: '+919400000085', role: 'staff' });
  assert.equal(invited.status, 200, invited.text);
  const staff = await api.signIn('+919400000085');
  await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: staff.accessToken });
  const asStaff = { token: staff.accessToken, businessId: owner.businessId };
  assert.equal((await post(asStaff, 'subscription', { productId: 'myca_pro_monthly', purchaseToken: 'tok-staff' })).status, 403);
  const seen = JSON.stringify([(await get(asStaff, 'subscription')).body, (await api.call('GET', '/v1/plans')).body]);
  assert.ok(!seen.includes('ya29.test') && !seen.includes(NOTIFY) && !seen.includes('PRIVATE KEY'));
});

test('without Play settings nothing is gated and the notice route is closed', async () => {
  const bare = createBilling({ db: api.db, config: {} });
  assert.equal(bare.enabled, false);
  assert.equal((await bare.notify(Buffer.from('{}'), NOTIFY)).statusCode, 404);
  assert.equal((await bare.verify('x', 'y', { productId: 'a', purchaseToken: 'b' })).error, 'BILLING_NOT_CONFIGURED');
});
