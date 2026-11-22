import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createBilling } from '../src/billing.mjs';
import { startApi } from './helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;
const PACKAGE = 'com.mldynamic.myca';
const PRODUCTS = { essentials: 'myca_essentials_monthly', pro: 'myca_pro_monthly', firm: 'myca_firm_monthly' };
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const purchases = new Map();
let lookupDelayMs = 0;

async function fakeGoogle(url, init = {}) {
  const text = String(url);
  const json = (status, data) => new Response(JSON.stringify(data), { status });
  if (text === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'ya29.qa', expires_in: 3600 });
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/purchases/`;
  if (!text.startsWith(base)) return json(404, {});
  const rest = text.slice(base.length);
  const get = rest.match(/^subscriptionsv2\/tokens\/([^/]+)$/);
  if (get) {
    if (lookupDelayMs) await new Promise((resolve) => setTimeout(resolve, lookupDelayMs));
    const found = purchases.get(decodeURIComponent(get[1]));
    return found ? json(200, found) : json(404, {});
  }
  if (/:acknowledge$/.test(rest) && init.method === 'POST') return json(200, {});
  return json(404, {});
}

const config = { packageName: PACKAGE, productIds: PRODUCTS, notifyToken: 'qa-bughunt-notify-token-0123456789', serviceAccount: { clientEmail: 'play@qa.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), tokenUri: 'https://oauth2.googleapis.com/token' } };

let api;
before(async () => {
  api = await startApi({ billing: ({ db, now }) => createBilling({ db, now, fetchImpl: fakeGoogle, config }) });
});
after(() => api.close());

test('one Play purchase sent for two businesses at the same moment pays for one and refuses the other, without a 500', async () => {
  const owner = await api.ownerWithBusiness('9876502201');
  const second = await api.call('POST', '/v1/businesses', { token: owner.token, body: { name: 'Second Shop', state: '29' } });
  const ids = [owner.businessId, second.body.business.id];
  purchases.set('qa-race-token', {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    lineItems: [{ productId: PRODUCTS.pro, expiryTime: new Date(api.clock.now + 30 * DAY).toISOString() }],
  });
  lookupDelayMs = 150;
  const answers = await Promise.all(ids.map((id) => api.call('POST', `/v1/businesses/${id}/subscription`, { token: owner.token, body: { productId: PRODUCTS.pro, purchaseToken: 'qa-race-token' } })));
  lookupDelayMs = 0;
  for (const answer of answers) assert.notEqual(answer.status, 500, answer.text);
  assert.equal(answers.filter((answer) => answer.body.ok === true).length, 1);
  const refused = answers.find((answer) => answer.body.ok !== true);
  assert.equal(refused.body.error, 'PURCHASE_BELONGS_TO_ANOTHER_BUSINESS');
  const held = await api.db.query("select count(*)::int as n from subscriptions where provider_subscription_id = 'qa-race-token'");
  assert.equal(held.rows[0].n, 1);
});
