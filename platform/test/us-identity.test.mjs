import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tinKind, tinShapeError, isValidSsn, isValidItin, lastFour, maskTin, sealTin, openTin, isSealedTin,
  redactTins, redactTinsDeep, piiKeyFromEnv, maskAccount, routingShapeError, sealSsn, openSsn, maskSsn, redactSsns,
} from '../src/us-identity.mjs';

const KEY = 'k'.repeat(40);

test('an SSN is nine digits with no zero group, area 000, 666 or 9xx', () => {
  assert.equal(tinKind('123-45-6780'), 'ssn');
  assert.equal(isValidSsn('123 45 6780'), true);
  assert.equal(tinKind('000-12-3456'), null);
  assert.equal(tinKind('666-12-3456'), null);
  assert.equal(tinKind('123-00-4567'), null);
  assert.equal(tinKind('123-45-0000'), null);
  assert.equal(tinKind('078-05-1120'), null);
  assert.equal(tinKind('12345678'), null);
});

test('an ITIN starts with 9 and has a group the IRS issues', () => {
  assert.equal(isValidItin('912-70-1234'), true);
  assert.equal(isValidItin('912-93-1234'), false);
  assert.equal(isValidItin('912-49-1234'), false);
  assert.equal(isValidSsn('912-70-1234'), false);
});

test('shape errors name what is wrong', () => {
  assert.equal(tinShapeError(''), 'TIN_REQUIRED');
  assert.equal(tinShapeError('1234'), 'TIN_NOT_NINE_DIGITS');
  assert.equal(tinShapeError('666-12-3456'), 'TIN_NOT_ISSUABLE');
  assert.equal(tinShapeError('123-45-6780'), null);
});

test('masking keeps only the last four', () => {
  assert.equal(lastFour('123-45-6780'), '6780');
  assert.equal(maskTin('123456780'), '***-**-6780');
  assert.equal(maskTin('6780'), '***-**-6780');
  assert.equal(maskTin('nonsense'), '');
  assert.equal(maskSsn, maskTin);
});

test('a sealed TIN opens only with the same key and scope', () => {
  const sealed = sealTin('123-45-6780', { secret: KEY, scope: 'business-1:taxpayer' });
  assert.equal(sealed.last4, '6780');
  assert.equal(sealed.kind, 'ssn');
  assert.ok(isSealedTin(sealed.sealed));
  assert.ok(!sealed.sealed.includes('123456780'));
  assert.equal(openTin(sealed.sealed, { secret: KEY, scope: 'business-1:taxpayer' }), '123456780');
  assert.throws(() => openTin(sealed.sealed, { secret: KEY, scope: 'business-2:taxpayer' }), /TIN_UNREADABLE/);
  assert.throws(() => openTin(sealed.sealed, { secret: 'x'.repeat(40), scope: 'business-1:taxpayer' }), /TIN_UNREADABLE/);
  assert.throws(() => openTin(sealed.sealed, { secret: '', scope: 'business-1:taxpayer' }), /PII_KEY_MISSING/);
  assert.equal(sealSsn, sealTin);
  assert.equal(openSsn, openTin);
});

test('two seals of the same TIN differ', () => {
  const a = sealTin('123456780', { secret: KEY, scope: 's' });
  const b = sealTin('123456780', { secret: KEY, scope: 's' });
  assert.notEqual(a.sealed, b.sealed);
});

test('without a service key the TIN is sealed by the local vault and opens on this machine', () => {
  const sealed = sealTin('123-45-6780', { secret: '', scope: 's' });
  assert.ok(sealed.sealed.startsWith('tinv.'));
  assert.ok(!sealed.sealed.includes('123456780'));
  assert.equal(openTin(sealed.sealed, { secret: '', scope: 's' }), '123456780');
});

test('sealing refuses a number that is not a TIN', () => {
  assert.throws(() => sealTin('666-12-3456', { secret: KEY }), /TIN_NOT_ISSUABLE/);
  assert.throws(() => openTin('123456780', { secret: KEY }), /TIN_NOT_SEALED/);
});

test('the key comes from MYCA_PII_KEY and can be required', () => {
  assert.equal(piiKeyFromEnv({ MYCA_PII_KEY: KEY }), KEY);
  assert.equal(piiKeyFromEnv({}), '');
  assert.equal(piiKeyFromEnv({ MYCA_PII_KEY: 'unset' }), '');
  assert.throws(() => piiKeyFromEnv({ MYCA_PII_KEY: 'short' }), /PII_KEY_TOO_SHORT/);
  assert.throws(() => piiKeyFromEnv({ MYCA_REQUIRE_PII_KEY: '1' }), /PII_KEY_MISSING/);
});

test('redaction masks SSN-shaped text but leaves amounts, dates and phone numbers', () => {
  assert.equal(redactTins('my ssn is 123-45-6780 ok'), 'my ssn is ***-**-6780 ok');
  assert.equal(redactTins('ssn 123 45 6780'), 'ssn ***-**-6780');
  assert.equal(redactTins('itin 912701234'), 'itin ***-**-1234');
  assert.equal(redactTins('wages $123456789.00'), 'wages $123456789.00');
  assert.equal(redactTins('paid 1,234,567 on 2025-04-15'), 'paid 1,234,567 on 2025-04-15');
  assert.equal(redactTins('call 555-123-4567'), 'call 555-123-4567');
  assert.equal(redactTins(null), null);
  assert.equal(redactSsns, redactTins);
});

test('deep redaction masks ssn keys and nested strings, and keeps sealed values', () => {
  const sealed = sealTin('123456780', { secret: KEY }).sealed;
  const out = redactTinsDeep({ ssn: '123456780', sealedSsn: sealed, notes: ['spouse 987-65-4320'], nested: { itin: '912701234' }, amount: 5 });
  assert.deepEqual(out, { ssn: '***-**-6780', sealedSsn: sealed, notes: ['spouse ***-**-4320'], nested: { itin: '***-**-1234' }, amount: 5 });
});

test('bank accounts are masked and routing numbers are checked', () => {
  assert.equal(maskAccount('000123456789'), '••••6789');
  assert.equal(maskAccount('12'), '');
  assert.equal(routingShapeError('021000021'), null);
  assert.equal(routingShapeError('011000015'), null);
  assert.equal(routingShapeError('021000022'), 'ROUTING_CHECKSUM');
  assert.equal(routingShapeError('991000021'), 'ROUTING_BAD_PREFIX');
  assert.equal(routingShapeError('12345'), 'ROUTING_NOT_NINE_DIGITS');
});

test('a model request is redacted in text and tool blocks but images are left alone', async () => {
  const { redactModelRequest } = await import('../src/us-identity.mjs');
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA123456780BBBB' } };
  const out = redactModelRequest({
    system: 'filer 123-45-6780',
    messages: [
      { role: 'user', content: 'my ssn is 123456780' },
      { role: 'user', content: [{ type: 'text', text: 'spouse 987-65-4320' }, image, { type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: '123 45 6780' }] }] },
    ],
  });
  assert.equal(out.system, 'filer ***-**-6780');
  assert.equal(out.messages[0].content, 'my ssn is ***-**-6780');
  assert.equal(out.messages[1].content[0].text, 'spouse ***-**-4320');
  assert.deepEqual(out.messages[1].content[1], image);
  assert.equal(out.messages[1].content[2].content[0].text, '***-**-6780');
});

test('the model never receives an SSN the owner typed', async () => {
  const { setModelTransport, chooseTool } = await import('../src/model-adapter.mjs');
  let sent = '';
  setModelTransport(async (body) => { sent = JSON.stringify(body); return { ok: true, response: { content: [] } }; });
  try {
    await chooseTool({ message: 'my SSN is 123-45-6780, file my taxes', tools: [], country: 'US' });
  } finally {
    setModelTransport(null);
  }
  assert.ok(sent.length > 0);
  assert.ok(!sent.includes('123-45-6780'));
  assert.ok(sent.includes('***-**-6780'));
});

test('a chat message never keeps an SSN in the books, the eval log or the reply', async () => {
  const { createState } = await import('../src/store.mjs');
  const { chat } = await import('../src/router.mjs');
  const state = createState();
  state.company = { ...state.company, name: 'Jordan Rivera', country: 'US', entityType: 'household' };
  const out = await chat(state, 'my SSN is 123-45-6780');
  const { serialize } = await import('../src/store.mjs');
  const kept = JSON.stringify(serialize(state), (_, v) => (typeof v === 'bigint' ? String(v) : v));
  assert.ok(!kept.includes('123-45-6780') && !kept.includes('123456780'));
  assert.ok(!String(out.reply).includes('123-45-6780'));
});

const NINE_DIGITS = 'please note 104523750 and bank account 302145987 and 500 12 2500';

async function chatSends(country) {
  const { createState } = await import('../src/store.mjs');
  const { chat } = await import('../src/router.mjs');
  const { setModelTransport } = await import('../src/model-adapter.mjs');
  const state = createState();
  state.company = { ...state.company, country };
  const sent = [];
  setModelTransport(async (body) => { sent.push(JSON.stringify(body)); return { ok: true, response: { content: [] } }; });
  try {
    await chat(state, NINE_DIGITS);
  } finally {
    setModelTransport(null);
  }
  return sent.join('\n');
}

test('outside the US, nine-digit amounts, bank accounts and spaced numbers in chat reach the router and the model unchanged', async () => {
  const sent = await chatSends('IN');
  assert.ok(sent.length > 0);
  for (const kept of ['104523750', '302145987', '500 12 2500']) assert.ok(sent.includes(kept), kept);
  assert.ok(!sent.includes('***-**-'));
});

test('in US books the same chat message is masked before the model sees it', async () => {
  const sent = await chatSends('US');
  assert.ok(sent.length > 0);
  for (const masked of ['***-**-3750', '***-**-5987', '***-**-2500']) assert.ok(sent.includes(masked), masked);
  for (const gone of ['104523750', '302145987', '500 12 2500']) assert.ok(!sent.includes(gone), gone);
});

test('outside the US a tool result with a nine-digit paise amount reaches the model unchanged and still parses', async () => {
  const { redactModelRequest } = await import('../src/us-identity.mjs');
  const { setCurrentCountry } = await import('../src/country.mjs');
  const { setModelTransport, extractWithModel } = await import('../src/model-adapter.mjs');
  const result = '{"cash":302145987}';
  const body = { messages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: [{ type: 'text', text: result }] }] }] };
  const kept = redactModelRequest(body, 'IN');
  assert.deepEqual(JSON.parse(kept.messages[0].content[0].content[0].text), { cash: 302145987 });
  assert.equal(redactModelRequest(body, 'US').messages[0].content[0].content[0].text, '{"cash":***-**-5987}');
  let sent = '';
  setModelTransport(async (request) => { sent = JSON.stringify(request); return { ok: true, response: { content: [] } }; });
  setCurrentCountry('IN');
  try {
    await extractWithModel({ content: result, schema: { type: 'object' }, name: 'read' });
  } finally {
    setModelTransport(null);
  }
  assert.ok(sent.includes('302145987'));
});

test('a tin field is masked only when it is a US SSN or ITIN, and audit events are masked only in US books', async () => {
  const { appendAuditEvent } = await import('../src/ca-api.mjs');
  const { createState } = await import('../src/store.mjs');
  assert.deepEqual(redactTinsDeep({ tin: 'C12345678901' }), { tin: 'C12345678901' });
  const malaysia = createState();
  malaysia.company = { ...malaysia.company, country: 'MY' };
  const kept = appendAuditEvent(malaysia, { action: 'my_einvoice_profile_set', metadata: { tin: 'C12345678901', note: 'account 302145987' } });
  assert.deepEqual(kept.metadata, { tin: 'C12345678901', note: 'account 302145987' });
  const india = createState();
  india.company = { ...india.company, country: 'IN' };
  assert.deepEqual(appendAuditEvent(india, { action: 'record_sale', metadata: { amount: '104523750' } }).metadata, { amount: '104523750' });
  const us = createState();
  us.company = { ...us.company, country: 'US', entityType: 'household' };
  const masked = appendAuditEvent(us, { action: 'set_us_taxpayer', metadata: { tin: '123456780', note: 'spouse 987-65-4320' } });
  assert.deepEqual(masked.metadata, { tin: '***-**-6780', note: 'spouse ***-**-4320' });
});
