import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptSecret, encryptSecret } from '../src/credential-vault.mjs';

test('the local vault opens what it sealed and refuses a record whose check is cut short or changed', () => {
  const record = encryptSecret('portal password');
  assert.equal(record.scheme, 'aes-256-gcm');
  assert.equal(decryptSecret(record), 'portal password');
  for (const bytes of [4, 8, 12, 15]) {
    const cut = { ...record, tag: Buffer.from(record.tag, 'base64').subarray(0, bytes).toString('base64') };
    assert.equal(decryptSecret(cut), '', `${bytes} bytes`);
  }
  const flipped = Buffer.from(record.tag, 'base64');
  flipped[0] ^= 1;
  assert.equal(decryptSecret({ ...record, tag: flipped.toString('base64') }), '');
});
