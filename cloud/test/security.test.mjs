import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { INBOUND_HEADER } from '../src/inbound.mjs';
import { base32Decode, totpCode } from '../src/totp.mjs';
import { startApi, SALE } from './helpers.mjs';

let api;
let asha;
let other;
before(async () => {
  api = await startApi();
  asha = await api.ownerWithBusiness('+919100000001', { name: 'Asha Traders', state: '29' });
  other = await api.ownerWithBusiness('+919100000002', { name: 'Other Co', state: '27' });
});
after(async () => { await api.close(); });

const biz = (who, rest) => `/v1/businesses/${who.businessId}${rest ? `/${rest}` : ''}`;

async function staffOf(owner, phone) {
  const sent = await api.call('POST', biz(owner, 'invitations'), { token: owner.token, body: { phone, role: 'staff' } });
  const person = await api.signIn(phone);
  await api.call('POST', `/v1/invitations/${sent.body.invitation.id}/accept`, { token: person.accessToken });
  return person.accessToken;
}

test('every owner-only route refuses staff with 403, and every route refuses a member of another business with 404', async () => {
  const staff = await staffOf(asha, '+919100000003');
  const ownerOnly = [
    ['POST', biz(asha, 'invitations'), { phone: '+919100000099', role: 'staff' }],
    ['POST', biz(asha, 'inbound'), { label: 'x', source: 'pos' }],
    ['GET', biz(asha, 'inbound')],
    ['GET', biz(asha, 'export')],
    ['POST', biz(asha, 'company'), { name: 'Renamed' }],
    ['POST', biz(asha, 'ca-sync'), { mode: 'daily' }],
    ['DELETE', biz(asha)],
    ['PATCH', biz(asha, 'members/00000000-0000-4000-8000-000000000000'), { role: 'owner' }],
  ];
  for (const [method, path, body] of ownerOnly) {
    const res = await api.call(method, path, { token: staff, body });
    assert.equal(res.status, 403, `${method} ${path} -> ${res.status} ${res.text}`);
  }
  const foreign = [
    ['GET', biz(asha, 'snapshot')],
    ['POST', biz(asha, 'query'), { name: 'business_summary', args: {} }],
    ['POST', biz(asha, 'propose'), { name: 'create_invoice', args: SALE }],
    ['POST', biz(asha, 'uploads'), { name: 'x.txt', content: 'x' }],
    ['GET', biz(asha, 'members')],
    ['GET', biz(asha, 'export')],
    ['DELETE', biz(asha)],
    ['DELETE', biz(asha, 'members/00000000-0000-4000-8000-000000000000')],
  ];
  for (const [method, path, body] of foreign) {
    const res = await api.call(method, path, { token: other.token, body });
    assert.equal(res.status, 404, `${method} ${path} -> ${res.status} ${res.text}`);
  }
});

test('malformed input is refused before any engine runs: bad JSON, an oversize body, an unknown route, a bad method', async () => {
  const badJson = await api.call('POST', biz(asha, 'query'), { token: asha.token, raw: '{not json' });
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.error, 'INVALID_JSON');
  const big = await api.call('POST', biz(asha, 'query'), { token: asha.token, raw: JSON.stringify({ name: 'business_summary', args: { pad: 'x'.repeat(1024 * 1024 + 10) } }) });
  assert.equal(big.status, 413);
  const unknown = await api.call('GET', '/v1/nothing-here', { token: asha.token });
  assert.equal(unknown.status, 404);
  const notV1 = await api.call('GET', '/admin', { token: asha.token });
  assert.equal(notV1.status, 404);
  const badMethod = await api.call('PUT', biz(asha, 'snapshot'), { token: asha.token, body: {} });
  assert.equal(badMethod.status, 404);
  const writeTool = await api.call('POST', biz(asha, 'query'), { token: asha.token, body: { name: 'create_invoice', args: SALE } });
  assert.equal(writeTool.body.error, 'NOT_QUERYABLE', 'a write cannot sneak in through the read route');
  const secretTool = await api.call('POST', biz(asha, 'propose'), { token: asha.token, body: { name: 'govt_save_credentials', args: {} } });
  assert.notEqual(secretTool.status, 200, 'credential tools cannot be proposed from a phone');
});

test('a key for a connected system is not a user token, and a user token is not a key', async () => {
  const key = (await api.call('POST', biz(asha, 'inbound'), { token: asha.token, body: { label: 'Till', source: 'pos' } })).body.key;
  const asUser = await api.call('GET', '/v1/me', { token: key.secret });
  assert.equal(asUser.status, 401);
  const asUser2 = await api.call('GET', biz(asha, 'snapshot'), { token: key.secret });
  assert.equal(asUser2.status, 401);
  const asKey = await api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: asha.token }, body: { saleId: 'S1', lines: SALE.lines } });
  assert.equal(asKey.status, 401);
  const noKey = await api.call('POST', '/v1/inbound/sales', { body: { saleId: 'S1', lines: SALE.lines } });
  assert.equal(noKey.status, 401);
});

test('after sign-out, device revocation or account deletion every old token is dead', async () => {
  const person = await api.signIn('+919100000010');
  const live = await api.call('GET', '/v1/me', { token: person.accessToken });
  assert.equal(live.status, 200);
  const out = await api.call('POST', '/v1/auth/logout', { token: person.accessToken });
  assert.equal(out.status, 200, out.text);
  const refreshAfter = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: person.refreshToken } });
  assert.equal(refreshAfter.status, 400, 'a signed-out device cannot refresh');

  const gone = await api.signIn('+919100000011');
  const deleted = await api.call('DELETE', '/v1/me', { token: gone.accessToken });
  assert.equal(deleted.status, 200, deleted.text);
  const afterDelete = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: gone.refreshToken } });
  assert.equal(afterDelete.status, 400);
  const again = await api.signIn('+919100000011');
  const me = await api.call('GET', '/v1/me', { token: again.accessToken });
  assert.equal(me.status, 200, 'the number can sign up afresh');
  assert.deepEqual(me.body.businesses, []);
});

test('responses never carry secrets: no key hash, no token secret, no code, no phone in a business payload', async () => {
  const key = (await api.call('POST', biz(asha, 'inbound'), { token: asha.token, body: { label: 'Inbox', source: 'documents' } })).body.key;
  const listed = await api.call('GET', biz(asha, 'inbound'), { token: asha.token });
  assert.ok(!listed.text.includes(key.secret));
  assert.ok(!/key_hash|keyHash/.test(listed.text));
  const members = await api.call('GET', biz(asha, 'members'), { token: asha.token });
  assert.ok(!/\+91\d{10}/.test(members.text), 'phone numbers are never listed; invitations carry a hint only');
  const snapshot = await api.call('GET', biz(asha, 'snapshot'), { token: asha.token });
  assert.ok(!/pinHash|pinSalt|refreshToken|accessToken/.test(snapshot.text));
  const exported = await api.call('GET', biz(asha, 'export'), { token: asha.token });
  assert.ok(!exported.text.includes(key.secret));
  assert.ok(!/pinHash|pinSalt|key_hash/.test(exported.text));

  const person = await api.signIn('+919100000020');
  const started = await api.call('POST', '/v1/me/second-step/begin', { token: person.accessToken });
  assert.equal(started.status, 200, started.text);
  const enabled = await api.call('POST', '/v1/me/second-step/confirm', { token: person.accessToken, body: { code: totpCode(base32Decode(started.body.secret), api.clock.now) } });
  assert.equal(enabled.status, 200, enabled.text);
  const secondStep = await api.call('GET', '/v1/me/second-step', { token: person.accessToken });
  assert.ok(!secondStep.text.includes(started.body.secret), 'the authenticator key is shown once, at begin');
  assert.ok(!/secret|code_hash|codeHash|recoveryCodes"/.test(secondStep.text));
  const devices = await api.call('GET', '/v1/me/devices', { token: person.accessToken });
  assert.equal(devices.status, 200, devices.text);
  assert.ok(!/token_hash|tokenHash|refreshToken|accessToken|secret/.test(devices.text));
  for (const code of enabled.body.recoveryCodes) {
    assert.ok(!secondStep.text.includes(code) && !devices.text.includes(code), 'recovery codes are shown once');
  }
  const atRest = JSON.stringify((await api.db.query('select * from user_totp, recovery_codes where user_totp.user_id = recovery_codes.user_id')).rows);
  assert.ok(!atRest.includes(started.body.secret), 'the key is sealed in the database');
  for (const code of enabled.body.recoveryCodes) assert.ok(!atRest.includes(code.replace('-', '')), 'recovery codes are hashed in the database');
});
