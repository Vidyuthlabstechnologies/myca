import { createHmac } from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

const CONFIG = { verifyToken: 'verify-me', appSecret: 'app-secret', phoneNumberId: '1234', accessToken: 'tok' };
let api;
let asha;
const replies = [];
const sender = { async sendText(phone, text) { replies.push({ phone, text }); } };

before(async () => {
  api = await startApi({ whatsapp: CONFIG, whatsappSender: sender });
  asha = await api.ownerWithBusiness('+919700000001', { name: 'Asha Traders', state: '29' });
});
after(async () => { await api.close(); });

function signed(body) {
  const raw = JSON.stringify(body);
  return { raw, headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', CONFIG.appSecret).update(raw).digest('hex')}` } };
}

function incoming(from, id, text) {
  return { object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ value: { messaging_product: 'whatsapp', messages: [{ from, id, timestamp: '1', type: 'text', text: { body: text } }] }, field: 'messages' }] }] };
}

test('the webhook verifies with the configured token and refuses a wrong one', async () => {
  const ok = await api.call('GET', '/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345');
  assert.equal(ok.status, 200);
  assert.equal(ok.text, '12345');
  const bad = await api.call('GET', '/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1');
  assert.equal(bad.status, 403);
});

test('a member asks on WhatsApp and gets the engine\'s answer; an unknown number is turned away; a bad signature is refused; the same message is not handled twice', async () => {
  const { raw, headers } = signed(incoming('919700000001', 'wamid.1', 'who owes me?'));
  const first = await api.call('POST', '/v1/whatsapp/webhook', { raw, headers });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.results[0].replied, true);
  assert.equal(replies.at(-1).phone, '+919700000001');
  assert.ok(replies.at(-1).text.length > 0);
  assert.doesNotMatch(replies.at(-1).text, /not a member/);

  const again = await api.call('POST', '/v1/whatsapp/webhook', { raw, headers });
  assert.equal(again.body.results[0].duplicate, true);

  const stranger = signed(incoming('919700000099', 'wamid.2', 'hello'));
  await api.call('POST', '/v1/whatsapp/webhook', { raw: stranger.raw, headers: stranger.headers });
  assert.match(replies.at(-1).text, /not a member of any MyCA business/);

  const forged = await api.call('POST', '/v1/whatsapp/webhook', { raw, headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } });
  assert.equal(forged.status, 401);
});

test('an invoice typed on WhatsApp is previewed, "yes" posts it, and the books show it', async () => {
  const held = signed(incoming('919700000001', 'wamid.3', 'invoice Kiran Stores 5000 GST 18%'));
  const previewed = await api.call('POST', '/v1/whatsapp/webhook', { raw: held.raw, headers: held.headers });
  assert.equal(previewed.body.results[0].awaitingConfirmation, true, JSON.stringify(previewed.body));
  assert.match(replies.at(-1).text, /Nothing is posted yet/);
  const yes = signed(incoming('919700000001', 'wamid.4', 'yes'));
  const posted = await api.call('POST', '/v1/whatsapp/webhook', { raw: yes.raw, headers: yes.headers });
  assert.equal(posted.body.results[0].posted, true, JSON.stringify(posted.body));
  assert.match(replies.at(-1).text, /Posted INV-/);
  const snapshot = (await api.call('GET', `/v1/businesses/${asha.businessId}/snapshot`, { token: asha.token })).body;
  assert.ok(snapshot.invoices.some((inv) => inv.partyName === 'Kiran Stores'));
});

test('a member of two businesses is asked which one, and "use 2" is remembered', async () => {
  const second = await api.call('POST', '/v1/businesses', { token: asha.token, body: { name: 'Asha Exports', state: '27' } });
  assert.equal(second.status, 200, second.text);
  const same = signed(incoming('919700000001', 'wamid.5', 'who owes me?'));
  await api.call('POST', '/v1/whatsapp/webhook', { raw: same.raw, headers: same.headers });
  assert.match(replies.at(-1).text, /Kiran Stores/, 'the remembered business stands until switched');
  const ask = signed(incoming('919700000001', 'wamid.5b', 'switch'));
  await api.call('POST', '/v1/whatsapp/webhook', { raw: ask.raw, headers: ask.headers });
  assert.match(replies.at(-1).text, /Which business\?/);
  const pick = signed(incoming('919700000001', 'wamid.6', 'use 2'));
  await api.call('POST', '/v1/whatsapp/webhook', { raw: pick.raw, headers: pick.headers });
  assert.match(replies.at(-1).text, /Using Asha Exports/);
  const after = signed(incoming('919700000001', 'wamid.7', 'who owes me?'));
  const out = await api.call('POST', '/v1/whatsapp/webhook', { raw: after.raw, headers: after.headers });
  assert.equal(out.body.results[0].replied, true);
  assert.doesNotMatch(replies.at(-1).text, /Which business/);
});

test('without configuration the webhook does not exist, and without an app secret messages are refused rather than trusted', async () => {
  const bare = await startApi();
  try {
    const res = await bare.call('GET', '/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1');
    assert.equal(res.status, 404);
  } finally {
    await bare.close();
  }
  const noSecret = await startApi({ whatsapp: { ...CONFIG, appSecret: '' }, whatsappSender: sender });
  try {
    const raw = JSON.stringify(incoming('919700000001', 'wamid.9', 'hello'));
    const res = await noSecret.call('POST', '/v1/whatsapp/webhook', { raw, headers: {} });
    assert.equal(res.status, 404, 'the route is off until the app secret is set');
  } finally {
    await noSecret.close();
  }
});
