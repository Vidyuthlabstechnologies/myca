import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, generateKeyPairSync, createCipheriv } from 'node:crypto';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { saveGovtConfig, saveNicPublicKey } from '../src/nic-config.mjs';
import { clearNicSession } from '../src/nic-client.mjs';
import { findApproval, approvalStatus } from '../src/approvals.mjs';

process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-nic-gate-'));
process.env.HOME = process.env.APPDATA;

const SEK = randomBytes(32).toString('base64');
const calls = [];

function aesEcb(obj) {
  const cipher = createCipheriv('aes-256-ecb', Buffer.from(SEK, 'base64'), null);
  return Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]).toString('base64');
}

globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), headers: init.headers || {}, body: init.body });
  if (String(url).includes('/eivital/v1.04/auth')) {
    return new Response(JSON.stringify({ Status: 1, Data: { AuthToken: 'NIC-AUTH-TOKEN-123', Sek: SEK, TokenExpiry: new Date(Date.now() + 3600000).toISOString() } }), { status: 200 });
  }
  if (String(url).includes('/eicore/v1.03/Invoice/Cancel')) {
    return new Response(JSON.stringify({ Status: 1, Data: aesEcb({ Irn: 'X', CancelDate: '2026-09-21 10:00:00' }) }), { status: 200 });
  }
  if (String(url).includes('/eicore/v1.03/Invoice')) {
    return new Response(JSON.stringify({ Status: 1, Data: aesEcb({ Irn: 'REALIRN'.padEnd(64, '0'), AckNo: 112610000000001, AckDt: '2026-09-21 10:00:00', SignedQRCode: 'qr' }) }), { status: 200 });
  }
  return new Response('pong', { status: 200 });
};

saveGovtConfig({ env: 'sandbox', clientId: 'CID', clientSecret: 'CLIENT-SECRET-XYZ', username: 'apiuser', password: 'P@ss', gstin: '27AABCU9603R1ZN' });
saveNicPublicKey(generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).publicKey);

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const LIVE = { MYCA_ENABLE_LIVE_CALLS: '1', MYCA_MOCK_MODE: '0' };
const OFF = { MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0' };

function books() {
  const state = createState();
  state.company = { ...state.company, address: 'Plot 4, MIDC, Pune 411019', pin: '411019', city: 'Pune' };
  for (const rate of [1000, 2000]) {
    createInvoice(state, { date: '2026-09-05', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', partyState: '27', partyAddress: '12 FC Road, Pune 411004', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate, gstRate: 5 }] });
  }
  return state;
}

async function approve(state, operationId, params) {
  const req = await runTool(state, 'approval_request', { operationId, params, requestedBy: 'ca' });
  await runTool(state, 'approval_decide', { approvalId: req.data.approval.approvalId, decision: 'approve', decidedBy: 'partner1', role: 'partner' });
  return req.data.approval.approvalId;
}

beforeEach(() => {
  calls.length = 0;
  clearNicSession();
});

test('C2: generating an IRN needs a matching CA approval, and the approval is single use', async () => {
  const state = books();
  await withEnv(LIVE, async () => {
    const blocked = await runTool(state, 'govt_generate_irn', { invoiceId: 'INV-0001' });
    assert.equal(blocked.data.ok, false);
    assert.equal(blocked.data.error, 'APPROVAL_REQUIRED');
    assert.equal(calls.length, 0);
    assert.equal(state.invoices[0].irn, undefined);

    const approvalId = await approve(state, 'nic_irn_generate', { invoiceId: 'INV-0001' });
    const issued = await runTool(state, 'govt_generate_irn', { invoiceId: 'INV-0001' });
    assert.equal(issued.data.ok, true);
    assert.equal(state.invoices[0].sandboxIrn, 'REALIRN'.padEnd(64, '0'));
    assert.equal(state.invoices[0].irn, undefined);
    assert.equal(approvalStatus(findApproval(state, approvalId)), 'used');
    assert.ok(calls.some((c) => c.url.endsWith('/eicore/v1.03/Invoice')));
    const audit = state.auditEvents.filter((e) => e.action === 'external.nic_irn_generate').at(-1);
    assert.equal(audit.metadata.approvalId, approvalId);

    calls.length = 0;
    const again = await runTool(state, 'govt_generate_irn', { invoiceId: 'INV-0001' });
    assert.equal(again.data.error, 'APPROVAL_REQUIRED');
    assert.equal(calls.length, 0);
  });
});

test('C2: cancelling an IRN and generating an e-Way Bill need approval too', async () => {
  const state = books();
  state.invoices[1].irn = 'IRN-TO-CANCEL';
  await withEnv(LIVE, async () => {
    const cancel = await runTool(state, 'govt_nic_cancel_irn', { invoiceId: 'INV-0002', reason: '1' });
    assert.equal(cancel.ok, false);
    assert.equal(cancel.error, 'APPROVAL_REQUIRED');
    assert.equal(state.invoices[1].irnStatus, undefined);
    const ewb = await runTool(state, 'govt_nic_generate_ewb', { irn: 'IRN-TO-CANCEL', transport: { Distance: 10 } });
    assert.equal(ewb.error, 'APPROVAL_REQUIRED');
    assert.equal(calls.length, 0);

    await approve(state, 'nic_irn_cancel', { invoiceId: 'INV-0002', reason: '1' });
    const approved = await runTool(state, 'govt_nic_cancel_irn', { invoiceId: 'INV-0002', reason: '1' });
    assert.equal(approved.ok, true);
    assert.equal(state.invoices[1].irnStatus, 'CNL');
  });
});

test('C2: chat "generate irn" previews first, and with the live switch on still stops at the approval', async () => {
  const state = books();
  const preview = await withEnv(LIVE, () => chat(state, 'generate irn INV-0002'));
  assert.equal(preview.awaitingConfirmation, true);
  assert.equal(calls.length, 0, 'nothing is sent while a preview waits');
  const out = await withEnv(LIVE, () => chat(state, 'yes'));
  assert.match(out.reply, /IRN not issued: APPROVAL_REQUIRED/);
  assert.equal(calls.length, 0);
  assert.equal(state.invoices[1].irn, undefined);
});

test('C3: tool arguments cannot switch live calls on, redirect the host, or forge the payload', async () => {
  const state = books();
  const forged = { DocDtls: { No: 'FORGED-99' }, ValDtls: { TotInvVal: 1 } };
  const off = await withEnv(OFF, () => runTool(state, 'govt_generate_irn', { invoiceId: 'INV-0001', allowLive: true, host: 'https://attacker.example', payload: forged, allowFallback: true, mock: true }));
  assert.equal(off.data.error, 'LIVE_CALLS_DISABLED');
  assert.equal(calls.length, 0);
  assert.equal(state.invoices[0].irn, undefined);
  assert.equal(state.invoices[0].mockIrn, undefined);
  const dry = state.dryRuns.at(-1);
  assert.equal(dry.actionId, 'nic_irn_generate');
  assert.equal(dry.payload.DocDtls.No, 'INV-0001');

  await approve(state, 'nic_auth', {});
  await withEnv(LIVE, async () => {
    await runTool(state, 'govt_nic_health', { host: 'http://169.254.169.254/latest/meta-data/iam?x=' });
    await runTool(state, 'govt_nic_auth', { host: 'https://attacker.example', mock: true });
  });
  assert.ok(calls.length >= 2);
  for (const call of calls) assert.ok(call.url.startsWith('https://einv1api.gstsandbox.nic.in/'), call.url);
});

test('C3: the NIC auth tool result never carries the token or Sek', async () => {
  const state = books();
  const blocked = await withEnv(LIVE, () => runTool(state, 'govt_nic_auth', {}));
  assert.equal(blocked.data.error, 'APPROVAL_REQUIRED');
  assert.equal(calls.length, 0);
  await approve(state, 'nic_auth', {});
  const out = await withEnv(LIVE, () => runTool(state, 'govt_nic_auth', {}));
  assert.equal(out.data.ok, true);
  const text = JSON.stringify(out);
  assert.equal(text.includes('NIC-AUTH-TOKEN-123'), false);
  assert.equal(text.includes(SEK), false);
});

test('H9: with the live switch off, NIC auth, NIC health and the govt probe send nothing', async () => {
  const state = books();
  await withEnv(OFF, async () => {
    const auth = await chat(state, 'nic auth');
    assert.match(auth.reply, /LIVE_CALLS_DISABLED/);
    assert.equal((await runTool(state, 'govt_nic_auth', {})).data.error, 'LIVE_CALLS_DISABLED');
    assert.equal((await runTool(state, 'govt_nic_health', {})).data.error, 'LIVE_CALLS_DISABLED');
    assert.equal((await runTool(state, 'govt_nic_gstin', { gstin: '27AAACH7409R1Z1' })).error, 'LIVE_CALLS_DISABLED');
    const probe = await chat(state, 'probe govt');
    assert.match(probe.reply, /LIVE_CALLS_DISABLED/);
  });
  assert.equal(calls.length, 0);
  const actions = state.dryRuns.map((d) => d.actionId);
  for (const id of ['nic_auth', 'nic_health', 'nic_gstin_master', 'govt_probe']) assert.ok(actions.includes(id), id);
});

test('mock mode: IRN fixtures write only mock fields, and a saved env of "mock" does not bypass the gate', async () => {
  const state = books();
  await withEnv({ MYCA_MOCK_MODE: '1' }, async () => {
    const out = await runTool(state, 'govt_generate_irn', { invoiceId: 'INV-0001' });
    assert.equal(out.data.ok, true);
    assert.equal(out.data.mock, true);
    const sim = await runTool(state, 'govt_nic_mock', { invoiceId: 'INV-0002' });
    assert.equal(sim.data.mock, true);
    assert.ok(sim.data.signedQrCode);
  });
  for (const inv of state.invoices) {
    for (const field of ['irn', 'ackNo', 'ackDate', 'signedQrCode']) assert.equal(inv[field], undefined, `${inv.id}.${field}`);
    assert.ok(inv.mockIrn, inv.id);
  }
  assert.equal(calls.length, 0);

  saveGovtConfig({ env: 'mock' });
  try {
    const out = await withEnv(LIVE, () => runTool(state, 'govt_generate_irn', { invoiceId: 'INV-0001' }));
    assert.equal(out.data.error, 'APPROVAL_REQUIRED');
    assert.equal(state.invoices[0].irn, undefined);
  } finally {
    saveGovtConfig({ env: 'sandbox' });
  }
});
