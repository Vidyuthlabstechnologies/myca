import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createBilling } from '../src/billing.mjs';
import { startApi } from './helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOTIFY = 'qa-play-notify-token-0123456789abcdef';
const JOB_TOKEN = 'qa-job-token-0123456789abcdef0123456789';
const JOB_HEADER = 'x-myca-job-token';
const PACKAGE = 'com.mldynamic.myca';
const PRODUCTS = { essentials: 'myca_essentials_monthly', pro: 'myca_pro_monthly', firm: 'myca_firm_monthly' };
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const purchases = new Map();

async function fakeGoogle(url, init = {}) {
  const text = String(url);
  const json = (status, data) => new Response(JSON.stringify(data), { status });
  if (text === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'ya29.qa', expires_in: 3600 });
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/`;
  if (!text.startsWith(base)) return json(404, {});
  const rest = text.slice(base.length);
  const get = rest.match(/^subscriptionsv2\/tokens\/([^/]+)$/);
  if (get) {
    const found = purchases.get(decodeURIComponent(get[1]));
    return found ? json(200, found) : json(404, {});
  }
  if (/:acknowledge$/.test(rest) && init.method === 'POST') return json(200, {});
  return json(404, {});
}

function purchase(token, { productId = PRODUCTS.pro, state = 'ACTIVE', expires, accountId = '', linked = '' } = {}) {
  purchases.set(token, {
    subscriptionState: `SUBSCRIPTION_STATE_${state}`,
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    lineItems: [{ productId, expiryTime: new Date(expires).toISOString() }],
    ...(accountId ? { externalAccountIdentifiers: { obfuscatedExternalAccountId: accountId } } : {}),
    ...(linked ? { linkedPurchaseToken: linked } : {}),
    testPurchase: {},
  });
}

const config = { packageName: PACKAGE, productIds: PRODUCTS, notifyToken: NOTIFY, serviceAccount: { clientEmail: 'play@qa.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), tokenUri: 'https://oauth2.googleapis.com/token' } };

let api;
let billing;
before(async () => {
  api = await startApi({ jobToken: JOB_TOKEN, billing: ({ db, now }) => createBilling({ db, now, fetchImpl: fakeGoogle, config }) });
  billing = createBilling({ db: api.db, now: () => api.clock.now, fetchImpl: fakeGoogle, config });
});
after(() => api.close());

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const plan = async (who) => (await api.call('GET', `/v1/businesses/${who.businessId}/subscription`, { token: who.token })).body.plan;
const age = (who, days) => api.db.query('update businesses set created_at = created_at - make_interval(days => $2) where id = $1', [who.businessId, days]);
const ageUser = (who, days) => api.db.query('update users set trial_started_at = trial_started_at - make_interval(days => $2) where id = $1', [who.user.id, days]);
const daily = () => api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
const steps = (who, list) => api.call('POST', '/v1/funnel', { token: who.token, body: { steps: list } });

function notify(purchaseToken, { id = `qa-${Math.random()}`, type = 4 } = {}) {
  const data = Buffer.from(JSON.stringify({ version: '1.0', packageName: PACKAGE, eventTimeMillis: String(api.clock.now), subscriptionNotification: { version: '1.0', notificationType: type, purchaseToken } })).toString('base64');
  return api.call('POST', '/v1/billing/play/notify', { raw: JSON.stringify({ message: { data, messageId: id } }), headers: { 'content-type': 'application/json', 'x-myca-notify-token': NOTIFY } });
}

async function subscribe(businessId, planId, days = 20) {
  await api.db.query(
    `insert into subscriptions (business_id, provider, provider_subscription_id, product_id, plan, status, current_end)
     values ($1, 'play', $2, $3, $4, 'active', $5)`,
    [businessId, `qa-tok-${businessId}`, PRODUCTS[planId] || '', planId, new Date(api.clock.now + days * DAY)],
  );
}

test('signing back in during the grace period keeps the businesses the account deletion had marked', async () => {
  const phone = '+919811000001';
  const owner = await api.ownerWithBusiness(phone, { name: 'Second Thoughts', state: '29' });
  const dropped = await api.call('POST', '/v1/businesses', { token: owner.token, body: { name: 'Closed Shop', state: '29' } });
  assert.equal((await api.call('DELETE', `/v1/businesses/${dropped.body.business.id}`, { token: owner.token })).status, 200);
  api.clock.advance(1000);
  assert.equal((await api.call('DELETE', '/v1/me', { token: owner.token })).status, 200);
  api.clock.advance(5 * DAY);
  const back = await api.signIn(phone);
  const me = await api.call('GET', '/v1/me', { token: back.accessToken });
  assert.deepEqual(me.body.businesses.map((b) => b.id), [owner.businessId], 'the business comes back with the account');
  api.clock.advance(30 * DAY);
  const run = await daily();
  assert.equal(run.status, 200, run.text);
  const kept = await api.db.query('select id from businesses where id = $1', [owner.businessId]);
  assert.equal(kept.rowCount, 1, 'books of a cancelled account deletion are not purged');
  const gone = await api.db.query('select id from businesses where id = $1', [dropped.body.business.id]);
  assert.equal(gone.rowCount, 0, 'a business deleted on its own is still purged');
  const audit = await api.db.query("select 1 from audit_log where business_id = $1 and action = 'member.account_deletion_cancelled'", [owner.businessId]);
  assert.equal(audit.rowCount, 1);
  api.clock.advance(-35 * DAY - 1000);
});

test('a cancelled subscription ends with the paid period, with no grace days', async () => {
  const owner = await api.ownerWithBusiness('+919811000002', { name: 'Cancel Co', state: '29' });
  await age(owner, 20);
  await ageUser(owner, 20);
  purchase('qa-cancel', { state: 'CANCELED', expires: api.clock.now + DAY, accountId: owner.businessId });
  assert.equal((await post(owner, 'subscription', { productId: PRODUCTS.pro, purchaseToken: 'qa-cancel' })).body.ok, true);
  assert.equal(await plan(owner), 'pro');
  api.clock.advance(2 * DAY);
  assert.equal((await billing.entitlement(owner.businessId)).plan, 'lapsed', 'a cancelled plan stops when the paid period ends');
  api.clock.advance(-2 * DAY);
});

test('after switching plans, a late notice for the old purchase does not take the new plan away', async () => {
  const owner = await api.ownerWithBusiness('+919811000003', { name: 'Switch Co', state: '29' });
  await age(owner, 20);
  await ageUser(owner, 20);
  purchase('qa-old-pro', { expires: api.clock.now + 10 * DAY, accountId: owner.businessId });
  assert.equal((await post(owner, 'subscription', { productId: PRODUCTS.pro, purchaseToken: 'qa-old-pro' })).body.ok, true);
  purchase('qa-old-pro', { state: 'CANCELED', expires: api.clock.now + 10 * DAY, accountId: owner.businessId });
  purchase('qa-new-firm', { productId: PRODUCTS.firm, expires: api.clock.now + 30 * DAY, accountId: owner.businessId });
  const switched = await post(owner, 'subscription', { productId: PRODUCTS.firm, purchaseToken: 'qa-new-firm' });
  assert.equal(switched.body.ok, true, switched.text);
  assert.equal(await plan(owner), 'firm');

  assert.equal((await notify('qa-old-pro', { type: 3 })).status, 200);
  assert.equal(await plan(owner), 'firm', 'a delayed cancel notice for the old purchase is ignored');
  purchase('qa-old-pro', { state: 'EXPIRED', expires: api.clock.now, accountId: owner.businessId });
  assert.equal((await notify('qa-old-pro', { type: 13 })).status, 200);
  assert.equal(await plan(owner), 'firm', 'the old purchase expiring does not end the new plan');
  const again = await post(owner, 'subscription', { productId: PRODUCTS.pro, purchaseToken: 'qa-old-pro' });
  assert.equal(again.body.error, 'PURCHASE_SUPERSEDED', again.text);
  assert.equal(await plan(owner), 'firm');

  purchase('qa-upgrade', { productId: PRODUCTS.pro, expires: api.clock.now + 5 * DAY, accountId: owner.businessId, linked: 'qa-new-firm' });
  assert.equal((await notify('qa-upgrade', { type: 4 })).status, 200);
  assert.equal(await plan(owner), 'pro', 'a purchase that Play links to the current one replaces it');
});

test('a CA firm earns an invite credit only for a client that really pays for its own business', async () => {
  const firm = await api.ownerWithBusiness('+919811000010', { name: 'Audit and Co', state: '29' });
  await subscribe(firm.businessId, 'firm');
  const code = (await api.call('GET', '/v1/me/referral', { token: firm.token })).body.code;
  const credits = async () => (await api.db.query('select count(*)::int as n from referral_credits where referrer_user_id = $1', [firm.user.id])).rows[0].n;

  const fake = await api.signIn('+919811000011');
  const fakeWho = { token: fake.accessToken };
  assert.equal((await api.call('POST', '/v1/me/referral/claim', { token: fake.accessToken, body: { code } })).body.ok, true);
  await steps(fakeWho, [{ step: 'paid' }]);
  assert.equal(await credits(), 0, 'reporting "paid" without a subscription earns nothing');

  const invited = await post(firm, 'invitations', { phone: '+919811000012', role: 'staff' });
  assert.equal(invited.status, 200, invited.text);
  const partner = await api.signIn('+919811000012');
  await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: partner.accessToken });
  assert.equal((await api.call('PATCH', `/v1/businesses/${firm.businessId}/members/${partner.user.id}`, { token: firm.token, body: { role: 'owner' } })).status, 200);
  await api.call('POST', '/v1/me/referral/claim', { token: partner.accessToken, body: { code } });
  await steps({ token: partner.accessToken }, [{ step: 'paid' }]);
  assert.equal(await credits(), 0, "the firm's own subscription does not count as a client paying");

  const early = await api.ownerWithBusiness('+919811000013', { name: 'Early Bird', state: '29' });
  await api.call('POST', '/v1/me/referral/claim', { token: early.token, body: { code } });
  await steps(early, [{ step: 'paid' }]);
  assert.equal(await credits(), 0);
  await subscribe(early.businessId, 'pro');
  await steps(early, [{ step: 'paid' }]);
  assert.equal(await credits(), 1, 'a client who reported paying before the purchase landed still earns the firm its credit');
  const row = await api.db.query('select client_plan from referral_credits where referred_user_id = $1', [early.user.id]);
  assert.equal(row.rows[0].client_plan, 'pro');
});

test('open invitations hold seats, so a plan cannot be stretched past its member limit', async () => {
  const owner = await api.ownerWithBusiness('+919811000020', { name: 'Two Seat Co', state: '29' });
  await subscribe(owner.businessId, 'essentials');
  assert.equal((await post(owner, 'invitations', { phone: '+919811000021', role: 'staff' })).status, 200);
  const second = await post(owner, 'invitations', { phone: '+919811000022', role: 'staff' });
  assert.equal(second.body.error, 'PLAN_LIMIT_REACHED', second.text);
  const resend = await post(owner, 'invitations', { phone: '+919811000021', role: 'accountant' });
  assert.equal(resend.status, 200, 'sending the same person a new invitation is not a new seat');
});

test('an applied firm credit still keeps the firm plan after Google reports the subscription expired', async () => {
  const firm = await api.ownerWithBusiness('+919811000030', { name: 'Credit Keeps Co', state: '29' });
  const client = await api.ownerWithBusiness('+919811000031', { name: 'Paying Client', state: '29' });
  await age(firm, 40);
  await ageUser(firm, 40);
  purchase('qa-firm-credit', { productId: PRODUCTS.firm, expires: api.clock.now + DAY, accountId: firm.businessId });
  assert.equal((await billing.verify(firm.businessId, null, { productId: PRODUCTS.firm, purchaseToken: 'qa-firm-credit' })).ok, true);
  await api.db.query("insert into referral_credits (referred_user_id, referrer_user_id, firm_business_id, client_plan, months, earned_at) values ($1, $2, $3, 'pro', 1, now())", [client.user.id, firm.user.id, firm.businessId]);
  purchase('qa-firm-credit', { productId: PRODUCTS.firm, expires: api.clock.now + 31 * DAY, accountId: firm.businessId });
  assert.equal((await billing.verify(firm.businessId, null, { productId: PRODUCTS.firm, purchaseToken: 'qa-firm-credit' })).ok, true);
  assert.equal((await billing.entitlement(firm.businessId)).subscription.creditMonths, 1);

  api.clock.advance(32 * DAY);
  purchase('qa-firm-credit', { productId: PRODUCTS.firm, state: 'EXPIRED', expires: api.clock.now - DAY, accountId: firm.businessId });
  const checked = await billing.refreshDue();
  assert.ok(checked.checked >= 1);
  assert.equal((await billing.entitlement(firm.businessId)).plan, 'firm', 'the earned month runs after the paid period ends');
  api.clock.advance(30 * DAY);
  assert.equal((await billing.entitlement(firm.businessId)).plan, 'lapsed');
  api.clock.advance(-62 * DAY);
});
