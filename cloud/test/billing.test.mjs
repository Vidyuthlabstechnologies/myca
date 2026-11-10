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
  assert.equal(byId.free, undefined);
  assert.equal(byId.essentials.buyable, false, 'a plan without a Play product cannot be bought');
  assert.equal(byId.pro.buyable, true);
});

test('a new business gets a 14-day trial of Pro, then turns read-only with the paid features off', async () => {
  const owner = await api.ownerWithBusiness('+919400000081', { name: 'Trial Traders', state: '29' });
  const first = await get(owner, 'subscription');
  assert.equal(first.body.plan, 'pro');
  assert.equal(first.body.trial.daysLeft, 14);
  assert.equal((await post(owner, 'connectors', { channel: 'razorpay', keyId: 'rzp_1', keySecret: 'x' })).body.ok, true);

  await age(owner, 15);
  const later = await get(owner, 'subscription');
  assert.equal(later.body.plan, 'lapsed');
  assert.equal(later.body.trial, null);
  assert.equal((await post(owner, 'connectors', { channel: 'razorpay', keyId: 'rzp_2' })).body.error, 'PLAN_REQUIRED');
  assert.equal((await post(owner, 'invitations', { phone: '+919400000089', role: 'staff' })).body.error, 'PLAN_REQUIRED');
  assert.equal((await post(owner, 'einvoice', { invoiceId: 'INV-0001' })).body.error, 'PLAN_REQUIRED');
});

test('there is no free plan: after the trial the books are read-only until a plan is chosen', async () => {
  const plans = (await api.call('GET', '/v1/plans')).body.plans;
  assert.deepEqual(plans.map((plan) => [plan.id, plan.monthlyRupees, plan.yearlyRupees]), [['essentials', 399, 3999], ['pro', 599, 7999], ['firm', 2499, 24999]]);
  assert.ok(plans.every((plan) => plan.monthlyRupees > 0));
  const owner = await api.ownerWithBusiness('+919400000082', { name: 'Small Shop', state: '29' });
  const month = new Date(api.clock.now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const held = await post(owner, 'propose', { name: 'create_invoice', args: { ...SALE, date: `${month}-01` } });
  assert.ok(held.body.preview, held.text);
  await age(owner, 20);
  const refused = await post(owner, 'confirm', { token: held.body.preview.token });
  assert.equal(refused.body.error, 'PLAN_REQUIRED', refused.text);
  assert.match(refused.body.hint, /read-only/);
  assert.equal((await post(owner, 'propose', { name: 'create_invoice', args: { ...SALE, date: `${month}-01` } })).body.error, 'PLAN_REQUIRED');
  assert.equal((await post(owner, 'uploads', { name: 'a.csv', content: 'x' })).body.error, 'PLAN_REQUIRED');
  const asked = await post(owner, 'ask', { message: 'invoice Kiran Stores 5000 GST 18%' });
  assert.match(asked.body.reply, /read-only/, asked.text);
  assert.equal(asked.body.preview, undefined);
  const yes = await post(owner, 'ask', { message: 'yes' });
  assert.equal(yes.body.posted, undefined, yes.text);
  const read = await post(owner, 'ask', { message: 'who owes me?' });
  assert.doesNotMatch(read.body.reply, /read-only/, read.text);
  assert.equal((await get(owner, 'export')).status, 200);
});

test('a Play purchase is checked with Google, acknowledged, and turns the plan on; renewal notices keep it current', async () => {
  const owner = await api.ownerWithBusiness('+919400000083', { name: 'Paying Co', state: '29' });
  await age(owner, 20);
  assert.equal((await get(owner, 'subscription')).body.plan, 'lapsed');
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
  assert.equal((await get(owner, 'subscription')).body.plan, 'lapsed');

  purchase('tok-firm', { productId: 'myca_firm_monthly', state: 'ON_HOLD', expires: api.clock.now + 5 * DAY });
  await notify('tok-firm', { type: 5 });
  assert.equal((await get(owner, 'subscription')).body.plan, 'lapsed', 'a payment on hold does not keep the plan');
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

test('without Play notices the daily job renews a paid plan from Google, and a lapsed one drops to Free', async () => {
  const quiet = createBilling({
    db: api.db,
    now: () => api.clock.now,
    fetchImpl: fakeGoogle,
    config: { packageName: PACKAGE, productIds: { pro: 'myca_pro_monthly', firm: 'myca_firm_monthly' }, serviceAccount: { clientEmail: 'play@test.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), tokenUri: 'https://oauth2.googleapis.com/token' } },
  });
  assert.equal(quiet.enabled, true, 'Play subscriptions work without the notice token');
  assert.equal((await quiet.notify(Buffer.from('{}'), NOTIFY)).statusCode, 404, 'the notice route stays closed without its token');

  const owner = await api.ownerWithBusiness('+919400000088', { name: 'Renewing Co', state: '29' });
  const lapsing = await api.ownerWithBusiness('+919400000089', { name: 'Lapsing Co', state: '29' });
  const later = await api.ownerWithBusiness('+919400000090', { name: 'Later Co', state: '29' });
  await age(owner, 40);
  await age(lapsing, 40);
  await age(later, 40);
  purchase('tok-renew', { expires: api.clock.now + DAY, accountId: owner.businessId });
  purchase('tok-lapse', { expires: api.clock.now + DAY, accountId: lapsing.businessId });
  purchase('tok-later', { expires: api.clock.now + 25 * DAY, accountId: later.businessId });
  assert.equal((await quiet.verify(owner.businessId, null, { productId: 'myca_pro_monthly', purchaseToken: 'tok-renew' })).ok, true);
  assert.equal((await quiet.verify(lapsing.businessId, null, { productId: 'myca_pro_monthly', purchaseToken: 'tok-lapse' })).ok, true);
  assert.equal((await quiet.verify(later.businessId, null, { productId: 'myca_pro_monthly', purchaseToken: 'tok-later' })).ok, true);

  api.clock.advance(5 * DAY);
  assert.equal((await quiet.entitlement(owner.businessId)).plan, 'lapsed', 'past the end and the grace days the stored plan has run out');
  purchase('tok-renew', { expires: api.clock.now + 29 * DAY, accountId: owner.businessId });
  purchase('tok-lapse', { state: 'EXPIRED', expires: api.clock.now - 4 * DAY, accountId: lapsing.businessId });
  const asked = calls.length;
  const out = await quiet.refreshDue();
  assert.deepEqual({ checked: out.checked, changed: out.changed, failed: out.failed }, { checked: 2, changed: 2, failed: 0 });
  assert.ok(!calls.slice(asked).some((c) => c.url.includes('tok-later')), 'a plan far from its end is not looked up');
  assert.equal((await quiet.entitlement(owner.businessId)).plan, 'pro');
  assert.equal((await quiet.entitlement(lapsing.businessId)).plan, 'lapsed');
  assert.equal((await quiet.entitlement(lapsing.businessId)).subscription.status, 'expired');
  assert.equal((await quiet.refreshDue()).checked, 0, 'an expired plan and a renewed one are not asked about again');
  api.clock.advance(-5 * DAY);
});

test('a Play outage during the renewal check keeps the stored plan and is counted', async () => {
  const down = createBilling({
    db: api.db,
    now: () => api.clock.now,
    fetchImpl: async () => { throw new Error('network down'); },
    config: { packageName: PACKAGE, productIds: { pro: 'myca_pro_monthly' }, serviceAccount: { clientEmail: 'play@test.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), tokenUri: 'https://oauth2.googleapis.com/token' } },
  });
  const owner = await api.ownerWithBusiness('+919400000091', { name: 'Outage Co', state: '29' });
  await api.db.query(`insert into subscriptions (business_id, provider, provider_subscription_id, product_id, plan, status, current_end, test_purchase, updated_at) values ($1, 'play', 'tok-outage', 'myca_pro_monthly', 'pro', 'active', $2, false, now())`, [owner.businessId, new Date(api.clock.now + DAY)]);
  const out = await down.refreshDue();
  assert.ok(out.failed >= 1);
  const kept = await api.db.query('select status from subscriptions where business_id = $1', [owner.businessId]);
  assert.equal(kept.rows[0].status, 'active');
  assert.equal(createBilling({ db: api.db, config: {} }).enabled, false);
  assert.deepEqual(await createBilling({ db: api.db, config: {} }).refreshDue(), { checked: 0, changed: 0, failed: 0 });
});

test('the server refuses to start with Play products but no way to reach the Play Developer API', async () => {
  const { billingConfigProblem } = await import('../src/billing.mjs');
  const base = { MYCA_PLAY_PACKAGE: PACKAGE, MYCA_PLAY_PRODUCT_PRO: 'myca_pro_monthly' };
  assert.equal(billingConfigProblem({}), '');
  assert.match(billingConfigProblem(base), /MYCA_PLAY_SERVICE_ACCOUNT_JSON is empty/);
  assert.equal(billingConfigProblem({ ...base, K_SERVICE: 'myca-api' }), '');
  assert.match(billingConfigProblem({ ...base, MYCA_PLAY_SERVICE_ACCOUNT_JSON: '{"client_email":"x"}' }), /not a service account key/);
  assert.equal(billingConfigProblem({ ...base, MYCA_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'play@x.iam.gserviceaccount.com', private_key: 'k' }) }), '');
  assert.equal(billingConfigProblem({ ...base, MYCA_PLAY_SERVICE_ACCOUNT_JSON: 'unset', K_SERVICE: 'x' }), '');
});
