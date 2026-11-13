import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encryptPayload, nicGetIrn, nicSession, nicSessionKey, clearNicSession } from '../src/nic-client.mjs';

const ALPHA = { env: 'sandbox', clientId: 'alpha-client', clientSecret: 's', username: 'alpha', password: 'p', gstin: '27AABCU9603R1ZN' };
const BETA = { env: 'sandbox', clientId: 'beta-client', clientSecret: 's', username: 'beta', password: 'p', gstin: '29AAACH7409R1ZV' };

function fakeIrp() {
  const seks = new Map();
  const calls = [];
  const fetchFn = async (url, opts) => {
    const who = opts.headers.client_id;
    calls.push({ who, url, token: opts.headers.AuthToken || '' });
    if (url.endsWith('/eivital/v1.04/auth')) {
      const sek = randomBytes(32).toString('base64');
      seks.set(who, sek);
      const data = { AuthToken: `token-of-${who}`, Sek: sek, TokenExpiry: new Date(Date.now() + 3600000).toISOString() };
      return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 1, Data: data }) };
    }
    const body = encryptPayload({ Irn: 'IRN-X', owner: who }, seks.get(who));
    return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 1, Data: body }) };
  };
  return { calls, fetchFn };
}

async function withPublicKey(run) {
  clearNicSession();
  const dir = mkdtempSync(join(tmpdir(), 'myca-nic-iso-'));
  const prev = process.env.APPDATA;
  process.env.APPDATA = dir;
  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const { saveNicPublicKey } = await import('../src/nic-config.mjs');
  saveNicPublicKey(publicKey);
  try {
    await run();
  } finally {
    process.env.APPDATA = prev;
    clearNicSession();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('one taxpayer never sends a request under another taxpayer session', async () => {
  await withPublicKey(async () => {
    const irp = fakeIrp();
    assert.equal((await nicGetIrn('IRN-X', ALPHA, irp.fetchFn, { allowLive: true })).ok, true);
    const beta = await nicGetIrn('IRN-X', BETA, irp.fetchFn, { allowLive: true });
    assert.equal(beta.ok, true);
    assert.equal(beta.data.owner, 'beta-client');
    const lookups = irp.calls.filter((call) => !call.url.endsWith('/auth'));
    assert.deepEqual(lookups.map((call) => [call.who, call.token]), [
      ['alpha-client', 'token-of-alpha-client'],
      ['beta-client', 'token-of-beta-client'],
    ]);
    assert.equal(irp.calls.filter((call) => call.url.endsWith('/auth')).length, 2);
  });
});

test('each taxpayer reuses its own session and keeps it when another signs in', async () => {
  await withPublicKey(async () => {
    const irp = fakeIrp();
    await nicGetIrn('IRN-X', ALPHA, irp.fetchFn, { allowLive: true });
    await nicGetIrn('IRN-X', BETA, irp.fetchFn, { allowLive: true });
    const again = await nicGetIrn('IRN-X', ALPHA, irp.fetchFn, { allowLive: true });
    assert.equal(again.data.owner, 'alpha-client');
    assert.equal(irp.calls.filter((call) => call.url.endsWith('/auth')).length, 2);
    assert.equal(irp.calls.at(-1).token, 'token-of-alpha-client');
    assert.equal(nicSession(ALPHA).active, true);
    assert.equal(nicSession(BETA).active, true);
    assert.equal(nicSession({ ...ALPHA, gstin: '24AAACG1234F1Z5' }).active, false);
  });
});

test('the session key separates environment, client, user, GSTIN and the secrets given with them', () => {
  const keys = new Set([
    nicSessionKey(ALPHA),
    nicSessionKey(BETA),
    nicSessionKey({ ...ALPHA, env: 'production' }),
    nicSessionKey({ ...ALPHA, username: 'other' }),
    nicSessionKey({ ...ALPHA, gstin: '24AAACG1234F1Z5' }),
  ]);
  assert.equal(keys.size, 5);
  assert.equal(nicSessionKey(ALPHA), nicSessionKey({ ...ALPHA }));
  assert.notEqual(nicSessionKey(ALPHA), nicSessionKey({ ...ALPHA, password: 'changed' }));
  assert.notEqual(nicSessionKey(ALPHA), nicSessionKey({ ...ALPHA, clientSecret: 'x' }));
});
