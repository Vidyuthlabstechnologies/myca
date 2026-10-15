import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMail, addressOf, base64Of, decodeWord } from '../src/mime.js';
import worker, { inboundPayload } from '../src/index.js';

const PDF = Buffer.from('%PDF-1.4 fake bill').toString('base64');

const RAW = [
  'From: Kiran Stores <kiran@example.com>',
  'To: x7k2p9q4m1@inbox.myca.in',
  'Subject: =?UTF-8?Q?Bill_for_September?=',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Please find the bill attached =E2=82=B9 1,180.',
  '--b1',
  'Content-Type: application/pdf; name="GM-221.pdf"',
  'Content-Disposition: attachment; filename="GM-221.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  PDF,
  '--b1--',
  '',
].join('\r\n');

test('a forwarded bill with a PDF attachment parses into address, subject, text and the file', () => {
  const mail = parseMail(RAW);
  assert.equal(addressOf(mail.to), 'x7k2p9q4m1@inbox.myca.in');
  assert.equal(addressOf(mail.from), 'kiran@example.com');
  assert.equal(mail.subject, 'Bill for September');
  assert.match(mail.text, /₹ 1,180\./);
  assert.equal(mail.attachments.length, 1);
  assert.equal(mail.attachments[0].name, 'GM-221.pdf');
  assert.equal(mail.attachments[0].mime, 'application/pdf');
  assert.equal(base64Of(mail.attachments[0].bytes), PDF);
});

test('a plain text mail with no attachment still carries its text; nested multipart and encoded names work', () => {
  const plain = 'From: a@b.c\r\nTo: tok@inbox.myca.in\r\nSubject: hi\r\n\r\nJust text\r\n';
  const mail = parseMail(plain);
  assert.equal(mail.text, 'Just text\r\n');
  assert.deepEqual(mail.attachments, []);
  const nested = [
    'From: a@b.c', 'To: tok@inbox.myca.in', 'Subject: n', 'Content-Type: multipart/mixed; boundary=outer', '',
    '--outer', 'Content-Type: multipart/alternative; boundary=inner', '',
    '--inner', 'Content-Type: text/plain', '', 'Text part', '--inner', 'Content-Type: text/html', '', '<p>Html part</p>', '--inner--',
    '--outer', 'Content-Type: image/jpeg', "Content-Disposition: attachment; filename*=UTF-8''bill%20photo.jpg", 'Content-Transfer-Encoding: base64', '', Buffer.from('jpeg').toString('base64'),
    '--outer--', '',
  ].join('\r\n');
  const m = parseMail(nested);
  assert.equal(m.text, 'Text part');
  assert.equal(m.html, '<p>Html part</p>');
  assert.equal(m.attachments[0].name, 'bill photo.jpg');
  assert.equal(decodeWord('=?UTF-8?B?QmlsbA==?='), 'Bill');
});

test('the inbound payload carries at most ten attachments as base64, drops oversize ones, and the worker refuses mail when unconfigured', async () => {
  const mail = parseMail(RAW);
  const payload = inboundPayload(mail, { maxAttachmentBytes: 1024 });
  assert.equal(payload.to, 'x7k2p9q4m1@inbox.myca.in');
  assert.equal(payload.from, 'kiran@example.com');
  assert.equal(payload.subject, 'Bill for September');
  assert.deepEqual(payload.attachments.map((a) => [a.name, a.mime, a.base64]), [['GM-221.pdf', 'application/pdf', PDF]]);
  const small = inboundPayload(mail, { maxAttachmentBytes: 4 });
  assert.deepEqual(small.attachments, []);
  assert.deepEqual(small.dropped, ['GM-221.pdf']);

  let rejected = '';
  const message = { raw: new Blob([RAW]).stream(), rawSize: RAW.length, from: 'kiran@example.com', to: 'x7k2p9q4m1@inbox.myca.in', setReject: (reason) => { rejected = reason; } };
  await worker.email(message, {}, {});
  assert.match(rejected, /not configured/i);

  const calls = [];
  const env = { MYCA_API_URL: 'https://api.example.test', INBOUND_RELAY_TOKEN: 'r'.repeat(40), FETCH: async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ ok: true, stored: 1 }), { status: 200 }); } };
  const ok = { ...message, raw: new Blob([RAW]).stream(), setReject: (reason) => { rejected = reason; } };
  rejected = '';
  await worker.email(ok, env, {});
  assert.equal(rejected, '');
  assert.equal(calls[0].url, 'https://api.example.test/v1/inbound/email');
  assert.equal(calls[0].init.headers['x-myca-relay-token'], 'r'.repeat(40));
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.attachments[0].name, 'GM-221.pdf');
});
