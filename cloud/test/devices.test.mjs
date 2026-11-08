import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_TTL_SECONDS } from '../src/tokens.mjs';
import { startApi } from './helpers.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

let nextPhone = 9500000000;
const freshPhone = () => `+91${nextPhone++}`;
const DAY = 24 * 60 * 60 * 1000;

async function signInAs(phone, deviceLabel) {
  const otp = await api.call('POST', '/v1/auth/otp', { body: { phone } });
  assert.equal(otp.status, 200, otp.text);
  const verified = await api.call('POST', '/v1/auth/verify', { body: { challengeId: otp.body.challengeId, phone, code: api.sender.last().code, deviceLabel } });
  assert.equal(verified.status, 200, verified.text);
  return verified.body;
}

const list = (token) => api.call('GET', '/v1/me/devices', { token });
const signOut = (token, id) => api.call('POST', `/v1/me/devices/${id}/sign-out`, { token });
const signOutOthers = (token) => api.call('POST', '/v1/me/devices/sign-out-others', { token });
const currentOf = (listed) => listed.body.devices.find((device) => device.current);
const othersOf = (listed) => listed.body.devices.filter((device) => !device.current);

test('the device list shows every signed-in phone with this one first, and nothing about tokens', async () => {
  const phone = freshPhone();
  const a = await api.signIn(phone);
  const b = await signInAs(phone, 'iPhone');
  const fromA = await list(a.accessToken);
  assert.equal(fromA.status, 200, fromA.text);
  assert.equal(fromA.body.devices.length, 2);
  assert.equal(fromA.body.devices[0].current, true);
  assert.equal(fromA.body.devices[0].label, 'test phone');
  assert.equal(fromA.body.devices[1].current, false);
  assert.equal(fromA.body.devices[1].label, 'iPhone');
  for (const device of fromA.body.devices) {
    assert.match(device.id, /^[0-9a-f-]{36}$/);
    assert.match(device.signedInOn, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(device.lastActive, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(Object.keys(device).sort(), ['current', 'id', 'label', 'lastActive', 'signedInOn']);
  }
  assert.ok(!/token|hash|secret/i.test(fromA.text));

  const fromB = await list(b.accessToken);
  assert.equal(currentOf(fromB).label, 'iPhone');
  assert.equal(othersOf(fromB)[0].id, currentOf(fromA).id);

  api.clock.advance(ACCESS_TTL_SECONDS * 1000 + 1);
  const refreshed = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: b.refreshToken } });
  assert.equal(refreshed.status, 200, refreshed.text);
  const later = await list(refreshed.body.accessToken);
  assert.equal(later.body.devices.length, 2, 'a device stays listed after its token rotates');
  assert.ok(currentOf(later).lastActive > othersOf(later)[0].lastActive, 'refreshing moves last active');
  assert.equal(currentOf(later).signedInOn, currentOf(fromB).signedInOn);
});

test('signing out another device ends it at once; this device must use Sign out', async () => {
  const phone = freshPhone();
  const a = await api.signIn(phone);
  const b = await signInAs(phone, 'iPhone');
  const other = othersOf(await list(a.accessToken))[0];
  assert.equal(other.label, 'iPhone');
  const out = await signOut(a.accessToken, other.id);
  assert.equal(out.status, 200, out.text);
  assert.deepEqual(out.body, { ok: true });

  const dead = await api.call('GET', '/v1/me', { token: b.accessToken });
  assert.equal(dead.status, 401);
  assert.equal(dead.body.reason, 'DEVICE_REVOKED');
  const refresh = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: b.refreshToken } });
  assert.equal(refresh.status, 400);
  assert.equal(refresh.body.error, 'DEVICE_REVOKED');

  const after = await list(a.accessToken);
  assert.equal(after.body.devices.length, 1);
  assert.equal(after.body.devices[0].current, true);
  const self = await signOut(a.accessToken, currentOf(after).id);
  assert.equal(self.status, 409);
  assert.equal(self.body.error, 'CURRENT_DEVICE');
  assert.equal((await api.call('GET', '/v1/me', { token: a.accessToken })).status, 200, 'this device still works');
  const again = await signOut(a.accessToken, other.id);
  assert.equal(again.status, 404);
  assert.equal(again.body.error, 'DEVICE_NOT_FOUND');

  assert.equal((await api.call('POST', '/v1/auth/logout', { token: a.accessToken })).status, 200);
  const c = await signInAs(phone, 'Android');
  assert.deepEqual((await list(c.accessToken)).body.devices.map((device) => device.label), ['Android'], 'a device that signed itself out is not listed');
});

test('a device whose refresh token ran out is not listed', async () => {
  const phone = freshPhone();
  await api.signIn(phone);
  api.clock.advance(30 * DAY);
  const b = await signInAs(phone, 'iPhone');
  assert.equal((await list(b.accessToken)).body.devices.length, 2);
  api.clock.advance(31 * DAY);
  const rotated = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: b.refreshToken } });
  assert.equal(rotated.status, 200, rotated.text);
  const listed = await list(rotated.body.accessToken);
  assert.equal(listed.body.devices.length, 1, 'the first phone has not refreshed for sixty days');
  assert.equal(listed.body.devices[0].label, 'iPhone');
  const rows = await api.db.query('select count(*)::int as n from devices d join users u on u.id = d.user_id where u.phone = $1 and d.revoked_at is null', [phone]);
  assert.equal(rows.rows[0].n, 2, 'the dead row is kept, not shown');
});

test('sign out other devices ends every other session and leaves this one', async () => {
  const phone = freshPhone();
  const a = await api.signIn(phone);
  const b = await signInAs(phone, 'iPhone');
  const c = await signInAs(phone, 'Android');
  assert.equal((await list(a.accessToken)).body.devices.length, 3);
  const out = await signOutOthers(a.accessToken);
  assert.equal(out.status, 200, out.text);
  assert.deepEqual(out.body, { ok: true, revoked: 2 });
  assert.equal((await api.call('GET', '/v1/me', { token: b.accessToken })).status, 401);
  assert.equal((await api.call('GET', '/v1/me', { token: c.accessToken })).status, 401);
  assert.equal((await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: c.refreshToken } })).body.error, 'DEVICE_REVOKED');
  assert.equal((await api.call('GET', '/v1/me', { token: a.accessToken })).status, 200);
  assert.equal((await list(a.accessToken)).body.devices.length, 1);
  assert.deepEqual((await signOutOthers(a.accessToken)).body, { ok: true, revoked: 0 });
});

test('a made-up id, a bad id or another person\'s device is not found, and their device keeps working', async () => {
  const mine = await api.signIn(freshPhone());
  const theirs = await api.signIn(freshPhone());
  const theirDevice = currentOf(await list(theirs.accessToken)).id;
  for (const id of ['11111111-1111-4111-8111-111111111111', 'not-a-uuid', theirDevice]) {
    const out = await signOut(mine.accessToken, id);
    assert.equal(out.status, 404, id);
    assert.equal(out.body.error, 'DEVICE_NOT_FOUND', id);
  }
  assert.equal((await api.call('GET', '/v1/me', { token: theirs.accessToken })).status, 200);
  assert.equal((await list(theirs.accessToken)).body.devices.length, 1);
  assert.equal((await api.call('GET', '/v1/me/devices/nothing', { token: mine.accessToken })).status, 404);
  assert.equal((await api.call('DELETE', '/v1/me/devices', { token: mine.accessToken })).status, 404);
  assert.equal((await api.call('GET', `/v1/me/devices/${theirDevice}/sign-out`, { token: mine.accessToken })).status, 404);
});
