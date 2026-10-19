import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_UPLOAD_BYTES } from '../src/api.mjs';
import { startApi } from './helpers.mjs';

const BANK = 'Date,Narration,Withdrawal,Deposit,Balance\n01-08-2026,UPI rent,100,,900\n02-08-2026,NEFT sale,,500,1400\n';
const MARKER = 'UPI rent';

let api;
let asha;
let bala;
before(async () => {
  api = await startApi();
  asha = await api.ownerWithBusiness('+919400000001', { name: 'Asha Traders', state: '29' });
  bala = await api.ownerWithBusiness('+919400000002', { name: 'Bala Stores', state: '27' });
});
after(async () => { await api.close(); });

const post = (who, action, body, raw) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body, raw });
const booksText = async (who) => JSON.stringify((await api.books(who.businessId)));

test('an uploaded statement is previewed in one request and imported in another', async () => {
  const upload = await post(asha, 'uploads', { name: 'bank.csv', content: BANK });
  assert.equal(upload.status, 200, upload.text);
  assert.match(upload.body.sha256, /^[a-f0-9]{64}$/);
  assert.equal(upload.body.bytes, Buffer.byteLength(BANK));

  const held = await post(asha, 'propose', { name: 'import_bank', args: { documentSha256: upload.body.sha256, type: 'csv' } });
  assert.equal(held.status, 200, held.text);
  assert.equal(held.body.awaitingConfirmation, true, held.text);
  assert.match(held.body.preview.summary, /2 rows parsed/);
  assert.equal((await booksText(asha)).includes(MARKER), false, 'the waiting preview does not carry the file');

  const posted = await post(asha, 'confirm', { token: held.body.preview.token });
  assert.equal(posted.body.posted, true, posted.text);
  const replay = await post(asha, 'confirm', { token: held.body.preview.token });
  assert.equal(replay.body.replayed, true);

  const kept = await api.db.query('select bytes from documents where business_id = $1 and sha256 = $2', [asha.businessId, upload.body.sha256]);
  assert.equal(kept.rowCount, 1, 'the file is kept as evidence');
});

test('a file belongs to the business it was uploaded to', async () => {
  const upload = await post(asha, 'uploads', { name: 'bank.csv', content: `${BANK}03-08-2026,Cash,,50,1450\n` });
  const stolen = await post(bala, 'propose', { name: 'import_bank', args: { documentSha256: upload.body.sha256, type: 'csv' } });
  assert.equal(stolen.status, 200);
  assert.equal(stolen.body.blocked, true);
  assert.equal(stolen.body.error, 'DOCUMENT_BYTES_MISSING');
  assert.equal((await api.db.query('select 1 from documents where business_id = $1', [bala.businessId])).rowCount, 0);
  assert.equal((await post(asha, 'uploads', { name: 'x', content: 'y' }, undefined)).status, 200);
  const crossed = await api.call('POST', `/v1/businesses/${asha.businessId}/uploads`, { token: bala.token, body: { name: 'x.csv', content: BANK } });
  assert.equal(crossed.status, 404);
});

test('an import must reference an upload; inline content and bad hashes are refused', async () => {
  for (const args of [{ content: BANK, type: 'csv' }, {}, { documentSha256: 42 }, { documentSha256: 'a'.repeat(64), content: BANK }]) {
    const out = await post(asha, 'propose', { name: 'import_bank', args });
    assert.equal(out.status, 400, JSON.stringify(args).slice(0, 40));
    assert.equal(out.body.error, 'IMPORT_NEEDS_UPLOAD');
  }
  const csv = await post(asha, 'propose', { name: 'import_tally', args: { csv: 'x' } });
  assert.equal(csv.body.error, 'IMPORT_NEEDS_UPLOAD');
  for (const [sha, error] of [['f'.repeat(64), 'DOCUMENT_BYTES_MISSING'], ['not-a-hash', 'INVALID_SHA256']]) {
    const out = await post(asha, 'propose', { name: 'import_bank', args: { documentSha256: sha, type: 'csv' } });
    assert.equal(out.body.blocked, true, sha);
    assert.equal(out.body.error, error, sha);
  }
});

test('empty and oversized uploads are refused, and a normal body limit still applies elsewhere', async () => {
  assert.equal((await post(asha, 'uploads', { name: 'empty.csv', content: '' })).body.error, 'EMPTY_FILE');
  assert.equal((await post(asha, 'uploads', { name: 'empty.csv' })).body.error, 'EMPTY_FILE');
  const big = 'x'.repeat(2 * 1024 * 1024);
  assert.equal((await post(asha, 'uploads', { name: 'big.csv', content: big })).status, 200);
  const tooBig = await post(asha, 'uploads', undefined, JSON.stringify({ name: 'huge.csv', content: 'x'.repeat(MAX_UPLOAD_BYTES + 10) })).catch(() => ({ status: 413 }));
  assert.equal(tooBig.status, 413);
  const elsewhere = await post(asha, 'ask', undefined, JSON.stringify({ message: big })).catch(() => ({ status: 413 }));
  assert.equal(elsewhere.status, 413);
});

test('uploads are audited by name and size, never by content', async () => {
  const upload = await post(asha, 'uploads', { name: 'march-statement.csv', content: `${BANK}04-08-2026,Audit row,,1,1451\n` });
  const row = (await api.db.query("select user_id, metadata from audit_log where business_id = $1 and action = 'file.upload' order by id desc limit 1", [asha.businessId])).rows[0];
  assert.equal(row.user_id, asha.user.id);
  assert.equal(row.metadata.name, 'march-statement.csv');
  assert.equal(row.metadata.sha256, upload.body.sha256);
  assert.equal(JSON.stringify(row).includes('Audit row'), false);
  assert.equal(JSON.stringify(api.logs).includes('Audit row'), false);
  assert.equal((await booksText(asha)).includes('Audit row'), false);
});

test('a Zoho export uploaded to the hosted API becomes invoices in that business only', async () => {
  const zoho = [
    'Invoice Number,Invoice Date,Customer Name,GSTIN,Item Name,HSN/SAC,Quantity,Item Price,Tax Percentage',
    'INV-Z-1,05-08-2026,Retail Mart,27AAACH7409R1Z1,Cloth,5208,1,1000,5',
  ].join('\n');
  const upload = await post(bala, 'uploads', { name: 'zoho.csv', content: `${zoho}\n` });
  const held = await post(bala, 'propose', { name: 'import_zoho', args: { documentSha256: upload.body.sha256 } });
  assert.equal(held.body.awaitingConfirmation, true, held.text);
  const posted = await post(bala, 'confirm', { token: held.body.preview.token });
  assert.equal(posted.body.posted, true, posted.text);

  const theirs = (await api.call('GET', `/v1/businesses/${bala.businessId}/snapshot`, { token: bala.token })).body;
  assert.deepEqual(theirs.invoices.map((i) => [i.id, i.partyName, i.total]), [['INV-Z-1', 'Retail Mart', 1050]]);
  const mine = (await api.call('GET', `/v1/businesses/${asha.businessId}/snapshot`, { token: asha.token })).body;
  assert.equal(mine.invoices.some((i) => i.id === 'INV-Z-1'), false);

  const again = await post(bala, 'propose', { name: 'import_zoho', args: { documentSha256: upload.body.sha256 } });
  const second = await post(bala, 'confirm', { token: again.body.preview?.token });
  const after = (await api.call('GET', `/v1/businesses/${bala.businessId}/snapshot`, { token: bala.token })).body;
  assert.equal(after.invoices.length, 1, `a re-import adds nothing: ${second.text.slice(0, 120)}`);
});

test('a Tally Day Book is read from an upload', async () => {
  const daybook = [
    'Date,Voucher Type,Voucher No,Particulars,Amount,GSTIN,Narration',
    '01-08-2026,Sales,7001,Apna Retail,1180,27AAACH7409R1Z1,No rate given',
  ].join('\n');
  const upload = await post(bala, 'uploads', { name: 'daybook.csv', content: daybook });
  const held = await post(bala, 'propose', { name: 'import_tally', args: { documentSha256: upload.body.sha256 } });
  assert.equal(held.status, 200, held.text);
  assert.notEqual(held.body.error, 'DOCUMENT_BYTES_MISSING');
  assert.match(held.body.reply, /Tally|voucher|row/i);
  await post(bala, 'discard', {});
});
