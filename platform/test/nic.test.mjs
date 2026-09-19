import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  encryptPayload,
  decryptPayload,
  IRP_HOSTS,
  IRP_PATHS,
  nicHealth,
  nicGstinMaster,
  nicGenerateIrn,
  nicCancelIrn,
  nicGetIrn,
  nicGetRejectedIrns,
  nicGenerateEwayBill,
  nicCancelEwayBill,
  nicSession,
  clearNicSession,
  nicAuthenticate,
} from '../src/nic-client.mjs';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';

test('nic crypto: AES-256-ECB payloads round-trip with the session Sek', () => {
  const sek = randomBytes(32).toString('base64');
  const payload = { Irn: 'abc', CnlRsn: '1', nested: { a: [1, 2, 3] }, note: 'unicode ✓' };
  const encrypted = encryptPayload(payload, sek);
  assert.equal(typeof encrypted, 'string');
  assert.equal(Buffer.from(encrypted, 'base64').length > 0, true);
  assert.deepEqual(decryptPayload(encrypted, sek), payload);
  assert.throws(() => encryptPayload(payload, 'short'), /INVALID_SEK/);
  assert.throws(() => decryptPayload(encrypted, randomBytes(32).toString('base64')), /unable to authenticate|bad decrypt|error/i);
});

test('nic endpoints: correct hosts and paths for sandbox and production', () => {
  assert.equal(IRP_HOSTS.production, 'https://einvoice1.gst.gov.in');
  assert.equal(IRP_HOSTS.sandbox, 'https://einv1api.gstsandbox.nic.in');
  assert.equal(IRP_PATHS.auth, '/eivital/v1.04/auth');
  assert.equal(IRP_PATHS.generateIrn, '/eicore/v1.03/Invoice');
  assert.equal(IRP_PATHS.cancelIrn, '/eicore/v1.03/Invoice/Cancel');
  assert.equal(IRP_PATHS.irnByIrn('IRN1'), '/eicore/v1.03/Invoice/irn/IRN1');
  assert.match(IRP_PATHS.irnByDoc('INV', 'A1', '05/08/2026'), /doctype=INV&docnum=A1&docdate=05%2F08%2F2026/);
  assert.equal(IRP_PATHS.generateEwb, '/eiewb/v1.03/ewaybill');
  assert.equal(IRP_PATHS.ewbByIrn('IRN1'), '/eiewb/v1.03/ewaybill/irn/IRN1');
  assert.equal(IRP_PATHS.health, '/eivital/v1.04/heartbeat/ping');
});

test('nic calls: gated by the live switch, then auth + AES request shape', async () => {
  clearNicSession();
  const dir = mkdtempSync(join(tmpdir(), 'myca-nic-'));
  const prev = process.env.APPDATA;
  process.env.APPDATA = dir;
  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const { saveNicPublicKey } = await import('../src/nic-config.mjs');
  saveNicPublicKey(publicKey);
  const sek = randomBytes(32).toString('base64');
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith('/eivital/v1.04/auth')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 1, Data: { AuthToken: 'tok', Sek: sek, TokenExpiry: new Date(Date.now() + 3600000).toISOString() } }) };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 1, Data: encryptPayload({ Irn: 'IRN-X', AckNo: '123' }, sek) }) };
  };
  try {
    const gated = await nicGetIrn('IRN-X', { env: 'sandbox' }, fetchFn, {});
    assert.equal(gated.error, 'LIVE_CALLS_DISABLED');

    const lookup = await nicGetIrn('IRN-X', { env: 'sandbox', clientId: 'c', clientSecret: 's', username: 'u', password: 'p', gstin: '27AABCU9603R1ZP' }, fetchFn, { allowLive: true });
    assert.equal(lookup.ok, true);
    assert.equal(calls[0].url, 'https://einv1api.gstsandbox.nic.in/eivital/v1.04/auth');
    assert.equal(calls[1].url, 'https://einv1api.gstsandbox.nic.in/eicore/v1.03/Invoice/irn/IRN-X');
    assert.equal(calls[1].opts.headers.AuthToken, 'tok');
    assert.equal(calls[1].opts.headers.client_id, 'c');
  } finally {
    process.env.APPDATA = prev;
    clearNicSession();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('nic: auth requires the RSA public key and never sends credentials without it', async () => {
  const out = await nicAuthenticate(
    { env: 'sandbox', clientId: 'c', clientSecret: 's', username: 'u', password: 'p', gstin: '27AABCU9603R1ZP' },
    async () => { throw new Error('network must not be reached'); },
  );
  assert.equal(out.error, 'MISSING_NIC_PUBLIC_KEY');
});

test('nic: mock auth + IRN still works and stamps the invoice', async () => {
  clearNicSession();
  const state = createState();
  const inv = createInvoice(state, { partyName: 'Retail', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  const out = await nicGenerateIrn(state, inv.invoice.id, undefined, { mock: true });
  assert.equal(out.ok, true);
  assert.equal(out.mock, true);
  assert.equal(state.invoices[0].irn, out.irn);
  const session = nicSession();
  assert.equal(typeof session.active, 'boolean');
});

test('nic: cancel validates the reason code and e-Way Bill cancel is honest about the EWB system', async () => {
  const state = createState();
  const inv = createInvoice(state, { partyName: 'Retail', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal((await nicCancelIrn(state, { invoiceId: inv.invoice.id, reason: '9' })).error, 'IRN_REQUIRED');
  state.invoices[0].irn = 'IRN-1';
  assert.equal((await nicCancelIrn(state, { invoiceId: inv.invoice.id, reason: '9' })).error, 'INVALID_CANCEL_REASON');
  const ewb = await nicCancelEwayBill({ ewbNo: '123' });
  assert.equal(ewb.error, 'EWB_CANCEL_VIA_EWB_SYSTEM');
  assert.equal((await nicGenerateEwayBill({})).error, 'IRN_REQUIRED');
  assert.equal((await nicGetRejectedIrns('2026-09-19')).error, 'DATE_REQUIRED');
});

test('nic health: pings the heartbeat endpoint', async () => {
  const seen = [];
  const out = await nicHealth({ env: 'sandbox' }, async (url) => {
    seen.push(url);
    return { ok: true, status: 200, text: async () => 'e-Invoice Vital: 11/18/2020 5:47:31 PM' };
  });
  assert.equal(out.ok, true);
  assert.equal(seen[0], 'https://einv1api.gstsandbox.nic.in/eivital/v1.04/heartbeat/ping');
  assert.match(out.heartbeat, /e-Invoice/);
});

test('nic gstin master: builds the v1.04 master path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'myca-nic2-'));
  const prev = process.env.APPDATA;
  process.env.APPDATA = dir;
  const { publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const { saveNicPublicKey } = await import('../src/nic-config.mjs');
  saveNicPublicKey(publicKey);
  const seen = [];
  const sek = randomBytes(32).toString('base64');
  try {
    await nicGstinMaster('27AABCU9603R1ZP', { env: 'production', clientId: 'c', clientSecret: 's', username: 'u', password: 'p', gstin: '27AABCU9603R1ZP' }, async (url) => {
      seen.push(url);
      if (url.endsWith('/auth')) return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 1, Data: { AuthToken: 't', Sek: sek } }) };
      return { ok: true, status: 200, text: async () => JSON.stringify({ Status: 1, Data: encryptPayload({ LglNm: 'X' }, sek) }) };
    }, { allowLive: true });
    assert.equal(seen[0], 'https://einvoice1.gst.gov.in/eivital/v1.04/auth');
    assert.equal(seen[1], 'https://einvoice1.gst.gov.in/eivital/v1.04/Master/gstin/27AABCU9603R1ZP');
  } finally {
    process.env.APPDATA = prev;
    clearNicSession();
    rmSync(dir, { recursive: true, force: true });
  }
});
