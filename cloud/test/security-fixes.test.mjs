import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, googleToken } from './helpers.mjs';
import { gustoPage, PLAY_NOTIFY_HEADER } from '../src/api.mjs';

const AUDIENCE = 'https://api.myca.example/v1/billing/play/notify';
const PUSHER = 'play-rtdn@myca-prod.iam.gserviceaccount.com';
const seen = [];
let api;
before(async () => {
  const billing = () => ({
    enabled: true,
    plans: () => ({ ok: true }),
    async notify(raw, token, { pushVerified = false } = {}) {
      seen.push({ token, pushVerified });
      if (!pushVerified && token !== 'header-token-0123456789') return { ok: false, statusCode: 401, error: 'BAD_TOKEN' };
      return { ok: true, received: true };
    },
  });
  api = await startApi({ billing, playPush: { audience: AUDIENCE, serviceAccount: PUSHER } });
});
after(async () => { await api.close(); });

test('the Gusto callback page escapes whatever the provider sends back', () => {
  const page = gustoPage(false, '<script>alert(1)</script>: "x" & \'y\'');
  assert.ok(!page.__html.includes('<script>'));
  assert.match(page.__html, /&lt;script&gt;/);
});

test('the Play notification refuses a token in the query string and takes it from a header', async () => {
  const inQuery = await api.call('POST', '/v1/billing/play/notify?token=header-token-0123456789', { body: {} });
  assert.equal(inQuery.status, 401);
  assert.equal(inQuery.body.error, 'TOKEN_IN_QUERY');
  const header = await api.call('POST', '/v1/billing/play/notify', { body: {}, headers: { [PLAY_NOTIFY_HEADER]: 'header-token-0123456789' } });
  assert.equal(header.status, 200, header.text);
});

test('a Pub/Sub push signed by Google for our audience and service account is accepted without any shared token', async () => {
  const good = googleToken({ aud: AUDIENCE, email: PUSHER, sub: '1234567890' });
  const pushed = await api.call('POST', '/v1/billing/play/notify', { body: {}, headers: { authorization: `Bearer ${good}` } });
  assert.equal(pushed.status, 200, pushed.text);
  assert.equal(seen.at(-1).pushVerified, true);
  const stranger = googleToken({ aud: AUDIENCE, email: 'someone@else.iam.gserviceaccount.com' });
  const refused = await api.call('POST', '/v1/billing/play/notify', { body: {}, headers: { authorization: `Bearer ${stranger}` } });
  assert.equal(refused.status, 401);
  const otherAudience = googleToken({ email: PUSHER });
  assert.equal((await api.call('POST', '/v1/billing/play/notify', { body: {}, headers: { authorization: `Bearer ${otherAudience}` } })).status, 401);
});
