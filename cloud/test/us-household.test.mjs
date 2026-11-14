import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

let api;
before(async () => {
  api = await startApi();
});
after(async () => { await api.close(); });

test('a US household is made for a personal return and says what it is', async () => {
  const session = await api.signIn('+919400000061');
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Jordan Rivera', country: 'US', kind: 'household' } });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.business.country, 'US');
  assert.equal(created.body.business.kind, 'household');
  const books = await api.books(created.body.business.id);
  assert.equal(books.company.country, 'US');
  assert.equal(books.company.entityType, 'household');
});

test('a US business without a kind stays a business', async () => {
  const session = await api.signIn('+919400000062');
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Luna Bakery LLC', country: 'US' } });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.business.kind, 'business');
  assert.equal(created.body.business.country, 'US');
});

test('a household is refused outside the US and an unknown kind is refused', async () => {
  const session = await api.signIn('+919400000063');
  const india = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Asha', state: '29', kind: 'household' } });
  assert.notEqual(india.status, 200);
  assert.equal(india.body.error, 'HOUSEHOLD_US_ONLY');
  const odd = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Asha', country: 'US', kind: 'trust' } });
  assert.notEqual(odd.status, 200);
  assert.equal(odd.body.error, 'UNKNOWN_KIND');
});

test('the US privacy notice is served for the US and either notice lets you in', async () => {
  const { PRIVACY_NOTICE, PRIVACY_NOTICE_US } = await import('../src/consent.mjs');
  const us = await api.call('GET', '/v1/privacy-notice?region=US');
  assert.equal(us.status, 200);
  assert.equal(us.body.notice.version, PRIVACY_NOTICE_US.version);
  assert.ok(us.body.notice.sections.some((s) => s.body.includes('7216')));
  const india = await api.call('GET', '/v1/privacy-notice');
  assert.equal(india.body.notice.version, PRIVACY_NOTICE.version);
  const session = await api.signIn('+919400000064', { agree: false });
  const before = await api.call('GET', '/v1/businesses', { token: session.accessToken });
  assert.equal(before.status, 403);
  const wrong = await api.call('POST', '/v1/me/consent', { token: session.accessToken, body: { document: 'privacy', version: 'nope' } });
  assert.equal(wrong.body.error, 'NOTICE_CHANGED');
  assert.equal((await api.call('POST', '/v1/me/consent', { token: session.accessToken, body: { document: 'privacy', version: PRIVACY_NOTICE_US.version } })).body.error, 'ADULT_REQUIRED');
  const agreed = await api.call('POST', '/v1/me/consent', { token: session.accessToken, body: { document: 'privacy', version: PRIVACY_NOTICE_US.version, adult: true } });
  assert.equal(agreed.status, 200, agreed.text);
  const after = await api.call('GET', '/v1/businesses', { token: session.accessToken });
  assert.equal(after.status, 200);
});

test('a household snapshot tells the app it is a household', async () => {
  const session = await api.signIn('+919400000065');
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Jordan Rivera', country: 'US', kind: 'household' } });
  const snap = await api.call('GET', `/v1/businesses/${created.body.business.id}/snapshot`, { token: session.accessToken });
  assert.equal(snap.status, 200, snap.text);
  assert.equal(snap.body.company.country, 'US');
  assert.equal(snap.body.company.entityType, 'household');
});

test('SSNs are masked in the hosted audit log', async () => {
  const session = await api.signIn('+919400000066');
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Jordan Rivera', country: 'US', kind: 'household' } });
  const id = created.body.business.id;
  await api.call('POST', `/v1/businesses/${id}/chat`, { token: session.accessToken, body: { message: 'remind me my SSN 123-45-6780 on 2026-04-01' } });
  const rows = await api.db.query('select metadata::text as m from audit_log where business_id = $1', [id]);
  assert.ok(rows.rows.every((r) => !r.m.includes('123-45-6780') && !r.m.includes('123456780')));
});
