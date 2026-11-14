import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { cleanStep, normalizeCode, referralLink, REFERRAL_CLAIM_DAYS, CODE_LENGTH, FIRM_REWARD } from '../src/growth.mjs';

const admins = [];
let api;
before(async () => { api = await startApi({ adminUserIds: () => admins, growth: { siteUrl: 'https://myca.example', reward: '' } }); });
after(async () => { await api.close(); });

const steps = (token, list) => api.call('POST', '/v1/funnel', { token, body: { steps: list } });

test('a step keeps only a known name, an edition and a short source', () => {
  assert.deepEqual(cleanStep({ step: 'business_created', source: 'Web_GST-Billing', name: 'Asha', amount: 5000 }), { ok: true, step: { step: 'business_created', edition: 'india', source: 'web_gst-billing' } });
  assert.deepEqual(cleanStep({ step: 'return_started', edition: 'us' }), { ok: true, step: { step: 'return_started', edition: 'us', source: '' } });
  for (const bad of [null, [], { step: 'drop table' }, { step: 'paid', edition: 'uk' }, { step: 'paid', source: 'has space' }, { step: 'paid', source: 'x'.repeat(41) }, { step: 'referral_claimed' }]) {
    assert.equal(cleanStep(bad).ok, false, JSON.stringify(bad));
  }
});

test('codes ignore case, spaces and dashes and use no look-alike characters', () => {
  assert.equal(normalizeCode('ab2c-d3ef '), 'AB2CD3EF');
  for (const bad of ['', 'AB2CD3E', 'AB2CD3EF9', 'AB0CD3EF', 'ABICD3EF', 'ABLCD3EF', null]) assert.equal(normalizeCode(bad), '', String(bad));
  assert.equal(referralLink('https://myca.example/', 'AB2CD3EF'), 'https://myca.example/r/AB2CD3EF');
  assert.equal(referralLink('http://myca.example', 'AB2CD3EF'), null);
  assert.equal(referralLink('', 'AB2CD3EF'), null);
});

test('funnel steps need a signed-in user who has agreed to the notice', async () => {
  const anonymous = await steps(undefined, [{ step: 'signed_in' }]);
  assert.equal(anonymous.status, 401);
  const unconsented = await api.signIn('+919700000001', { agree: false });
  const refused = await steps(unconsented.accessToken, [{ step: 'signed_in' }]);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'CONSENT_REQUIRED');
});

test('a step is stored once per person with its first source, and repeats only count', async () => {
  const user = await api.signIn('+919700000002');
  const first = await steps(user.accessToken, [{ step: 'signed_in', source: 'play' }, { step: 'business_created' }, { step: 'nonsense' }]);
  assert.equal(first.status, 200, first.text);
  assert.deepEqual(first.body, { ok: true, accepted: 2, refused: 1 });
  await steps(user.accessToken, [{ step: 'signed_in', source: 'web' }]);
  const { rows } = await api.db.query("select step, source, hits from funnel_steps where user_id = $1 order by step", [user.user.id]);
  assert.deepEqual(rows, [{ step: 'business_created', source: '', hits: 1 }, { step: 'signed_in', source: 'play', hits: 2 }]);
  const tooMany = await steps(user.accessToken, Array.from({ length: 11 }, () => ({ step: 'paid' })));
  assert.equal(tooMany.body.error, 'TOO_MANY_STEPS');
  assert.equal((await steps(user.accessToken, 'paid')).body.error, 'NO_STEPS');
});

test('each person gets one stable invite code and link', async () => {
  const user = await api.signIn('+919700000003');
  const one = await api.call('GET', '/v1/me/referral', { token: user.accessToken });
  assert.equal(one.status, 200, one.text);
  assert.equal(one.body.code.length, CODE_LENGTH);
  assert.equal(normalizeCode(one.body.code), one.body.code);
  assert.equal(one.body.link, `https://myca.example/r/${one.body.code}`);
  assert.deepEqual([one.body.invited, one.body.converted, one.body.reward], [0, 0, null]);
  const two = await api.call('GET', '/v1/me/referral', { token: user.accessToken });
  assert.equal(two.body.code, one.body.code);
});

test('a new person claims a code once; own codes, unknown codes and late claims are refused; paying converts', async () => {
  const referrer = await api.signIn('+919700000004');
  const { code } = (await api.call('GET', '/v1/me/referral', { token: referrer.accessToken })).body;
  const claim = (token, value) => api.call('POST', '/v1/me/referral/claim', { token, body: { code: value } });

  assert.equal((await claim(referrer.accessToken, code)).body.error, 'OWN_CODE');
  const friend = await api.signIn('+919700000005');
  assert.equal((await claim(friend.accessToken, 'ZZZZZZZZ')).body.error, 'CODE_NOT_FOUND');
  assert.equal((await claim(friend.accessToken, 'bad')).body.error, 'BAD_CODE');
  const ok = await claim(friend.accessToken, code.toLowerCase());
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual(ok.body, { ok: true });
  assert.equal((await claim(friend.accessToken, code)).body.error, 'ALREADY_CLAIMED');

  let mine = (await api.call('GET', '/v1/me/referral', { token: referrer.accessToken })).body;
  assert.deepEqual([mine.invited, mine.converted], [1, 0]);
  await steps(friend.accessToken, [{ step: 'paid' }]);
  mine = (await api.call('GET', '/v1/me/referral', { token: referrer.accessToken })).body;
  assert.deepEqual([mine.invited, mine.converted], [1, 1]);

  const late = await api.signIn('+919700000006');
  await api.db.query('update users set created_at = $2 where id = $1', [late.user.id, new Date(api.clock.now - (REFERRAL_CLAIM_DAYS + 1) * 86400000)]);
  const closed = await claim(late.accessToken, code);
  assert.equal(closed.body.error, 'CLAIM_WINDOW_CLOSED');
});

test('code guessing is rate limited', async () => {
  const guesser = await api.signIn('+919700000007');
  let last;
  for (let i = 0; i < 11; i += 1) last = await api.call('POST', '/v1/me/referral/claim', { token: guesser.accessToken, body: { code: 'ZZZZZZZZ' } });
  assert.equal(last.status, 429);
});

test('only an admin reads the funnel; it reports counts and conversion, never people', async () => {
  api.clock.advance(2 * 86400000);
  const people = [];
  for (let i = 0; i < 4; i += 1) people.push(await api.signIn(`+91970000010${i}`));
  await steps(people[0].accessToken, [{ step: 'signed_in', source: 'web_gst' }, { step: 'business_created' }, { step: 'first_entry' }, { step: 'paid' }]);
  await steps(people[1].accessToken, [{ step: 'signed_in', source: 'web_gst' }, { step: 'business_created' }]);
  await steps(people[2].accessToken, [{ step: 'signed_in' }]);
  await steps(people[3].accessToken, [{ step: 'signed_in', edition: 'us' }, { step: 'return_started', edition: 'us' }]);

  const refused = await api.call('GET', '/v1/admin/funnel', { token: people[0].accessToken });
  assert.equal(refused.status, 404);
  const admin = await api.signIn('+919700000199');
  admins.push(admin.user.id);
  const india = await api.call('GET', '/v1/admin/funnel?days=1', { token: admin.accessToken });
  assert.equal(india.status, 200, india.text);
  const byStep = Object.fromEntries(india.body.steps.map((row) => [row.step, row]));
  assert.equal(byStep.signed_in.users, 3);
  assert.equal(byStep.business_created.users, 2);
  assert.equal(byStep.business_created.fromPrevious, 66.7);
  assert.equal(byStep.paid.fromStart, 33.3);
  const web = india.body.sources.find((row) => row.source === 'web_gst');
  assert.deepEqual(web, { source: 'web_gst', signedIn: 2, paid: 1, conversion: 50 });
  assert.ok(!JSON.stringify(india.body).includes(people[0].user.id), 'no user ids in the digest');

  const us = await api.call('GET', '/v1/admin/funnel?days=1&edition=us', { token: admin.accessToken });
  assert.deepEqual(us.body.steps.slice(0, 2).map((row) => row.users), [1, 1]);
  const bad = await api.call('GET', '/v1/admin/funnel?edition=mars', { token: admin.accessToken });
  assert.equal(bad.body.error, 'BAD_EDITION');
});

test('erasing a person removes their steps, code and referrals', async () => {
  const user = await api.signIn('+919700000301');
  await steps(user.accessToken, [{ step: 'signed_in' }]);
  await api.call('GET', '/v1/me/referral', { token: user.accessToken });
  await api.db.query('delete from users where id = $1', [user.user.id]);
  for (const table of ['funnel_steps', 'referral_codes']) {
    const left = await api.db.query(`select count(*)::int as n from ${table} where user_id = $1`, [user.user.id]);
    assert.equal(left.rows[0].n, 0, table);
  }
});

test('only a CA firm earns a credit, once, when the client it invited pays', async () => {
  const subscribe = (businessId, plan) => api.db.query(
    `insert into subscriptions (business_id, provider, provider_subscription_id, product_id, plan, status, current_end)
     values ($1, 'play', $2, $3, $4, 'active', $5)`,
    [businessId, `tok-${businessId}`, `myca_${plan}_monthly`, plan, new Date(api.clock.now + 20 * 86400000)],
  );
  const firm = await api.ownerWithBusiness('+919700000401', { name: 'Rao and Co', state: '29' });
  await subscribe(firm.businessId, 'firm');
  const shop = await api.ownerWithBusiness('+919700000402', { name: 'Kiran Stores', state: '29' });
  await subscribe(shop.businessId, 'pro');

  const firmView = (await api.call('GET', '/v1/me/referral', { token: firm.token })).body;
  assert.equal(firmView.firm, true);
  assert.equal(firmView.reward, FIRM_REWARD);
  assert.deepEqual(firmView.credits, { earned: 0, applied: 0, monthsEarned: 0 });
  const shopView = (await api.call('GET', '/v1/me/referral', { token: shop.token })).body;
  assert.equal(shopView.firm, false);

  const client = await api.ownerWithBusiness('+919700000403', { name: 'Meera Fabrics', state: '29' });
  await subscribe(client.businessId, 'pro');
  assert.deepEqual((await api.call('POST', '/v1/me/referral/claim', { token: client.token, body: { code: firmView.code } })).body, { ok: true });
  assert.equal((await api.db.query('select count(*)::int as n from referral_credits')).rows[0].n, 0, 'no credit before paying');
  await steps(client.token, [{ step: 'paid' }]);
  await steps(client.token, [{ step: 'paid' }]);
  const { rows } = await api.db.query('select referrer_user_id, firm_business_id, client_plan, months, status from referral_credits');
  assert.deepEqual(rows, [{ referrer_user_id: firm.user.id, firm_business_id: firm.businessId, client_plan: 'pro', months: 1, status: 'earned' }]);
  const after = (await api.call('GET', '/v1/me/referral', { token: firm.token })).body;
  assert.deepEqual(after.credits, { earned: 1, applied: 0, monthsEarned: 1 });

  const friend = await api.ownerWithBusiness('+919700000404', { name: 'Sri Traders', state: '29' });
  await steps(friend.token, [{ step: 'paid' }]);
  await api.call('POST', '/v1/me/referral/claim', { token: friend.token, body: { code: shopView.code } });
  assert.equal((await api.db.query('select count(*)::int as n from referral_credits where referrer_user_id = $1', [shop.user.id])).rows[0].n, 0, 'a shop earns nothing');
  const paidFirst = await api.ownerWithBusiness('+919700000405', { name: 'Late Joiner', state: '29' });
  await steps(paidFirst.token, [{ step: 'paid' }]);
  await api.call('POST', '/v1/me/referral/claim', { token: paidFirst.token, body: { code: firmView.code } });
  assert.equal((await api.call('GET', '/v1/me/referral', { token: firm.token })).body.credits.earned, 2, 'a client who paid before claiming still earns the firm a credit');
});
