import { createHmac } from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { createWahaSender, wahaChatId, wahaPhone, wahaSignatureMatches } from '../src/waha.mjs';
import { smsSenderFromEnv } from '../src/sms-sender.mjs';
import { whatsAppConfigFromEnv, whatsAppProvider } from '../src/whatsapp.mjs';

const SECRET = 'waha-hook-secret';
const CONFIG = { provider: 'waha', waha: { baseUrl: 'http://waha.local', apiKey: 'k', session: 'default', webhookSecret: SECRET } };
let api;
const replies = [];
const sender = {
  provider: 'waha',
  async sendText(phone, text) { replies.push({ phone, text }); },
  async phoneOfLid(lid) { return lid === '555@lid' ? '+919700000011' : ''; },
};

before(async () => {
  api = await startApi({ whatsapp: CONFIG, whatsappSender: sender });
  await api.ownerWithBusiness('+919700000011', { name: 'Ravi Stores', state: '29' });
});
after(async () => { await api.close(); });

function signed(body, secret = SECRET) {
  const raw = JSON.stringify(body);
  return { raw, headers: { 'x-webhook-hmac': createHmac('sha512', secret).update(raw).digest('hex'), 'x-webhook-hmac-algorithm': 'sha512' } };
}

function message(from, id, body, extra = {}) {
  return { event: 'message', session: 'default', payload: { id, from, fromMe: false, body, hasMedia: false, ...extra } };
}

test('chat ids and phone numbers convert both ways', () => {
  assert.equal(wahaChatId('+91 97000 00011'), '919700000011@c.us');
  assert.equal(wahaPhone('919700000011@c.us'), '+919700000011');
  assert.equal(wahaPhone('919700000011@s.whatsapp.net'), '+919700000011');
  assert.equal(wahaPhone('12036302@g.us'), '');
});

test('a member writes to the gateway number and gets the engine\'s answer; the same message is handled once', async () => {
  const { raw, headers } = signed(message('919700000011@c.us', 'true_919700000011@c.us_A1', 'who owes me?'));
  const first = await api.call('POST', '/v1/whatsapp/waha', { raw, headers });
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.results[0].replied, true);
  assert.equal(replies.at(-1).phone, '+919700000011');
  assert.doesNotMatch(replies.at(-1).text, /not a member/);
  const again = await api.call('POST', '/v1/whatsapp/waha', { raw, headers });
  assert.equal(again.body.results[0].duplicate, true);
});

test('an invoice typed to the gateway is previewed and posted on "yes"', async () => {
  const held = signed(message('919700000011@c.us', 'A2', 'invoice Kiran Stores 5000 GST 18%'));
  const previewed = await api.call('POST', '/v1/whatsapp/waha', held);
  assert.equal(previewed.body.results[0].awaitingConfirmation, true, JSON.stringify(previewed.body));
  const yes = signed(message('919700000011@c.us', 'A3', 'yes'));
  const posted = await api.call('POST', '/v1/whatsapp/waha', yes);
  assert.equal(posted.body.results[0].posted, true, JSON.stringify(posted.body));
  assert.match(replies.at(-1).text, /Posted INV-/);
});

test('a sender known only by a privacy id is looked up on the gateway', async () => {
  const lid = signed(message('555@lid', 'A4', 'who owes me?'));
  const out = await api.call('POST', '/v1/whatsapp/waha', lid);
  assert.equal(out.body.results[0].replied, true, JSON.stringify(out.body));
  assert.equal(replies.at(-1).phone, '+919700000011');
});

test('a forged or unsigned call is refused, and own messages, groups and other events are ignored', async () => {
  const forged = signed(message('919700000011@c.us', 'A5', 'who owes me?'), 'wrong');
  assert.equal((await api.call('POST', '/v1/whatsapp/waha', forged)).status, 401);
  assert.equal((await api.call('POST', '/v1/whatsapp/waha', { raw: JSON.stringify(message('919700000011@c.us', 'A6', 'x')), headers: {} })).status, 401);
  const own = await api.call('POST', '/v1/whatsapp/waha', signed(message('919700000011@c.us', 'A7', 'x', { fromMe: true })));
  assert.equal(own.body.results[0].ignored, 'own message');
  const group = await api.call('POST', '/v1/whatsapp/waha', signed(message('12036302@g.us', 'A8', 'x')));
  assert.equal(group.body.results[0].ignored, 'group');
  const ack = await api.call('POST', '/v1/whatsapp/waha', signed({ event: 'message.ack', session: 'default', payload: {} }));
  assert.equal(ack.body.results[0].ignored, 'message.ack');
});

test('without a webhook secret the gateway route does not exist', async () => {
  const bare = await startApi({ whatsapp: { ...CONFIG, waha: { ...CONFIG.waha, webhookSecret: '' } }, whatsappSender: sender });
  try {
    const res = await bare.call('POST', '/v1/whatsapp/waha', signed(message('919700000011@c.us', 'B1', 'hi')));
    assert.equal(res.status, 404);
  } finally {
    await bare.close();
  }
});

test('the gateway sender posts to sendText with the api key, and can send sign-in codes', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 201, text: async () => '{}' }; };
  const s = createWahaSender({ baseUrl: 'https://wa.example.in/', apiKey: 'secret-key', session: 'myca', fetchImpl });
  await s.sendText('+919700000011', 'hello');
  assert.equal(calls[0].url, 'https://wa.example.in/api/sendText');
  assert.equal(calls[0].init.headers['x-api-key'], 'secret-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), { session: 'myca', chatId: '919700000011@c.us', text: 'hello', linkPreview: false });
  const otp = smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'whatsapp', MYCA_WAHA_URL: 'https://wa.example.in', MYCA_WAHA_API_KEY: 'k' }, { fetchImpl });
  await otp.send('+919700000011', '482913');
  assert.match(JSON.parse(calls[1].init.body).text, /^482913 is your MyCA sign-in code/);
  assert.throws(() => smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'whatsapp' }), /MYCA_WAHA_URL/);
});

test('the provider follows the switch, and the gateway URL alone picks the gateway', () => {
  assert.equal(whatsAppProvider({}), 'meta');
  assert.equal(whatsAppProvider({ MYCA_WAHA_URL: 'https://wa.example.in' }), 'waha');
  assert.equal(whatsAppProvider({ MYCA_WHATSAPP_PROVIDER: 'meta', MYCA_WAHA_URL: 'https://wa.example.in' }), 'meta');
  assert.throws(() => whatsAppProvider({ MYCA_WHATSAPP_PROVIDER: 'telegram' }), /unknown MYCA_WHATSAPP_PROVIDER/);
  assert.equal(whatsAppConfigFromEnv({ MYCA_WAHA_URL: 'https://wa.example.in/', MYCA_WAHA_WEBHOOK_SECRET: 's' }).waha.baseUrl, 'https://wa.example.in');
});

test('the signature check takes only sha512 hex of the right length', () => {
  const raw = Buffer.from('{"a":1}');
  const good = createHmac('sha512', 'k').update(raw).digest('hex');
  assert.equal(wahaSignatureMatches('k', raw, good, 'sha512'), true);
  assert.equal(wahaSignatureMatches('k', raw, good, 'sha256'), false);
  assert.equal(wahaSignatureMatches('', raw, good), false);
  assert.equal(wahaSignatureMatches('k', raw, good.slice(2)), false);
});
