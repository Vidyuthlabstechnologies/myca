import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { INBOUND_RELAY_HEADER } from '../src/api.mjs';
import { startApi } from './helpers.mjs';

const RELAY = 'relay-token-'.padEnd(48, 'x');
let api;
let asha;
before(async () => {
  api = await startApi({ inboundEmail: { domain: 'inbox.example.test', relayToken: RELAY } });
  asha = await api.ownerWithBusiness('+919800000001', { name: 'Asha Traders', state: '29' });
});
after(async () => { await api.close(); });

const biz = (rest) => `/v1/businesses/${asha.businessId}/${rest}`;
const mail = (body, token = RELAY) => api.call('POST', '/v1/inbound/email', { headers: { [INBOUND_RELAY_HEADER]: token }, body });

test('a documents key gets a forwarding address; mail to it stores the attachments with a reminder; a POS key gets none', async () => {
  const docs = (await api.call('POST', biz('inbound'), { token: asha.token, body: { label: 'Mail inbox', source: 'documents' } })).body.key;
  assert.match(docs.email, /^[a-z0-9]{10}@inbox\.example\.test$/);
  const pos = (await api.call('POST', biz('inbound'), { token: asha.token, body: { label: 'Till', source: 'pos' } })).body.key;
  assert.equal(pos.email, '');
  const listed = (await api.call('GET', biz('inbound'), { token: asha.token })).body.keys;
  assert.equal(listed.find((k) => k.id === docs.id).email, docs.email);
  assert.equal(listed.find((k) => k.id === pos.id).email, '');

  const stored = await mail({
    to: docs.email,
    from: 'kiran@example.com',
    subject: 'Bill for September',
    text: 'attached',
    attachments: [
      { name: 'GM-221.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.4 fake').toString('base64') },
      { name: 'note.txt', mime: 'text/plain', base64: Buffer.from('Supplier: Kiran').toString('base64') },
    ],
  });
  assert.equal(stored.status, 200, stored.text);
  assert.equal(stored.body.stored, 2);
  assert.ok(stored.body.files.every((f) => /^[a-f0-9]{64}$/.test(f.sha256)));
  const reminders = (await api.call('POST', biz('query'), { token: asha.token, body: { name: 'list_reminders', args: {} } })).body.data.reminders;
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].text, 'Mail arrived from kiran@example.com about "Bill for September" with 2 files. Read it and record the bill if it is one.');
});

test('plus-addressing works, text-only mail is kept as a text file, and the wrong token, an unknown address or a disabled key are refused', async () => {
  const docs = (await api.call('POST', biz('inbound'), { token: asha.token, body: { label: 'Second inbox', source: 'documents' } })).body.key;
  const [token, domain] = docs.email.split('@');
  const textOnly = await mail({ to: `${token}+bills@${domain}`, from: 'a@b.c', subject: 'Rent receipt', text: 'Paid 20,000 for October' });
  assert.equal(textOnly.status, 200, textOnly.text);
  assert.deepEqual(textOnly.body.files.map((f) => f.name), ['Rent receipt.txt']);
  const empty = await mail({ to: docs.email, from: 'a@b.c', subject: 'x' });
  assert.equal(empty.body.error, 'NOTHING_TO_STORE');
  const bad = await mail({ to: docs.email, text: 'x' }, 'wrong');
  assert.equal(bad.status, 401);
  const unknown = await mail({ to: `zzzzzzzzzz@${domain}`, text: 'x' });
  assert.equal(unknown.status, 404);
  const wrongDomain = await mail({ to: `${token}@elsewhere.test`, text: 'x' });
  assert.equal(wrongDomain.status, 404);
  await api.call('DELETE', biz(`inbound/${docs.id}`), { token: asha.token });
  const off = await mail({ to: docs.email, text: 'x' });
  assert.equal(off.status, 404);
  const listed = (await api.call('GET', biz('inbound'), { token: asha.token })).body.keys;
  assert.equal(listed.find((k) => k.id === docs.id).email, '', 'a disabled key shows no address');
});

test('without a relay token configured the route is closed', async () => {
  const closed = await startApi();
  try {
    const refused = await closed.call('POST', '/v1/inbound/email', { headers: { [INBOUND_RELAY_HEADER]: '' }, body: { to: 'a@b.c', text: 'x' } });
    assert.equal(refused.status, 401);
  } finally {
    await closed.close();
  }
});
