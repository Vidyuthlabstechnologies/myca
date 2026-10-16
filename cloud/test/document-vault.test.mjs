import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDocumentVault, documentVaultConfigFromEnv, createMetadataTokenSource } from '../src/document-vault.mjs';
import { createMemoryBucket } from './fake-bucket.mjs';
import { startApi } from './helpers.mjs';

const BANK = 'Date,Narration,Withdrawal,Deposit,Balance\n01-08-2026,UPI rent,100,,900\n02-08-2026,NEFT sale,,500,1400\n';
const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

let api;
let bucket;
let asha;
before(async () => {
  bucket = createMemoryBucket();
  api = await startApi({ documentVault: createDocumentVault({ bucket: 'myca-docs-test', fetchImpl: bucket.fetchImpl }) });
  asha = await api.ownerWithBusiness('+919400000011', { name: 'Asha Traders', state: '29' });
});
after(async () => { await api.close(); });

const post = (action, body) => api.call('POST', `/v1/businesses/${asha.businessId}/${action}`, { token: asha.token, body });

test('with a bucket configured the bytes go to Cloud Storage and Postgres keeps only the index', async () => {
  const upload = await post('uploads', { name: 'bank.csv', content: BANK });
  assert.equal(upload.status, 200, upload.text);
  const row = (await api.db.query('select content, bytes, location from documents where business_id = $1 and sha256 = $2', [asha.businessId, upload.body.sha256])).rows[0];
  assert.deepEqual(row, { content: '', bytes: Buffer.byteLength(BANK), location: 'gcs' });
  assert.equal(bucket.objects.get(`businesses/${asha.businessId}/${sha(BANK)}`), BANK);
  assert.ok(bucket.calls.some((call) => call.url.includes('ifGenerationMatch=0')), 'uploads never overwrite');

  const held = await post('propose', { name: 'import_bank', args: { documentSha256: upload.body.sha256, type: 'csv' } });
  assert.equal(held.body.awaitingConfirmation, true, held.text);
  assert.match(held.body.preview.summary, /2 rows parsed/);
  const posted = await post('confirm', { token: held.body.preview.token });
  assert.equal(posted.body.posted, true, posted.text);

  const again = await post('uploads', { name: 'bank.csv', content: BANK });
  assert.equal(again.body.sha256, upload.body.sha256);
  assert.equal((await api.db.query('select count(*)::int as n from documents where business_id = $1', [asha.businessId])).rows[0].n, 1);
});

test('the export carries the bytes back from the bucket and a replace stores them again', async () => {
  const exported = await api.call('GET', `/v1/businesses/${asha.businessId}/export`, { token: asha.token });
  assert.equal(exported.status, 200, exported.text);
  assert.equal(exported.body.documents[sha(BANK)], BANK);
  const extra = `${BANK}03-08-2026,Cash,,50,1450\n`;
  const replaced = await post('replace', { books: exported.body.books, documents: { ...exported.body.documents, [sha(extra)]: extra }, exportedAt: exported.body.exportedAt });
  assert.equal(replaced.status, 200, replaced.text);
  assert.equal(replaced.body.replaced, true);
  assert.equal(bucket.objects.get(`businesses/${asha.businessId}/${sha(extra)}`), extra);
});

test('a tampered object is refused on read, so a bad file can never be imported', async () => {
  const content = 'Date,Narration,Withdrawal,Deposit,Balance\n04-08-2026,Fee,10,,1440\n';
  const upload = await post('uploads', { name: 'fee.csv', content });
  bucket.objects.set(`businesses/${asha.businessId}/${upload.body.sha256}`, `${content}05-08-2026,Injected,,1000,2440\n`);
  const held = await post('propose', { name: 'import_bank', args: { documentSha256: upload.body.sha256, type: 'csv' } });
  assert.equal(held.body.blocked, true, held.text);
  assert.equal(held.body.error, 'DOCUMENT_BYTES_MISSING');
});

test('the env reader, the metadata token cache and the database mode', async () => {
  assert.deepEqual(documentVaultConfigFromEnv({ MYCA_DOCUMENT_BUCKET: 'unset' }), { bucket: '' });
  assert.deepEqual(documentVaultConfigFromEnv({ MYCA_DOCUMENT_BUCKET: 'myca-docs' }), { bucket: 'myca-docs' });
  let clock = 0;
  let fetched = 0;
  const token = createMetadataTokenSource({ now: () => clock, fetchImpl: async () => { fetched += 1; return new Response(JSON.stringify({ access_token: `t${fetched}`, expires_in: 3600 }), { status: 200 }); } });
  assert.equal(await token(), 't1');
  assert.equal(await token(), 't1');
  clock = 3600 * 1000;
  assert.equal(await token(), 't2');
  const plain = createDocumentVault({});
  assert.equal(plain.kind, 'db');
  const gcs = createDocumentVault({ bucket: 'b' });
  assert.equal(gcs.kind, 'gcs');
});
