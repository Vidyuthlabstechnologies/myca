import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { queueNotification, sendNotification } from '../src/notifications.mjs';
import { runSandboxOperation } from '../src/sandbox-adapter.mjs';
import { mockModeEnabled } from '../src/runtime-config.mjs';
import { nicAuthenticate, nicGenerateIrn, nicGetIrn, nicCancelIrn } from '../src/govt.mjs';
import { providerDoctor } from '../src/provider-doctor.mjs';

function freshState() {
  const state = createState();
  createInvoice(state, { partyName: 'Retail', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  return state;
}

let lastFetchCalls = 0;
async function fetchThatFails() {
  lastFetchCalls += 1;
  throw new Error('NETWORK_MUST_NOT_BE_HIT');
}

test('mock mode flag honors process.env.MYCA_MOCK_MODE', () => {
  const original = process.env.MYCA_MOCK_MODE;
  process.env.MYCA_MOCK_MODE = '1';
  assert.equal(mockModeEnabled(), true);
  process.env.MYCA_MOCK_MODE = '0';
  assert.equal(mockModeEnabled(), false);
  process.env.MYCA_MOCK_MODE = original;
});

test('runSandboxOperation mock: gstin_verify validates format then returns fixture', async () => {
  const bad = await runSandboxOperation({ operationId: 'gstin_verify', params: { gstin: '27' }, mock: true });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'INVALID_GSTIN_FORMAT');

  const res = await runSandboxOperation({ operationId: 'gstin_verify', params: { gstin: '27GSPMH1881G1ZH' }, mock: true });
  assert.equal(res.ok, true);
  assert.equal(res.mock, true);
  assert.equal(res.data.valid, true);
  assert.equal(res.data.legalName, 'Nalanda Textiles Private Limited');
});

test('runSandboxOperation mock: gst_save_gstr1 demands the GSTN payload', async () => {
  const missing = await runSandboxOperation({ operationId: 'gst_save_gstr1', params: { period: '092026' }, mock: true });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'PAYLOAD_REQUIRED');

  const ok = await runSandboxOperation({ operationId: 'gst_save_gstr1', params: { period: '092026', payload: { gstin: '27GSPMH1881G1ZH' } }, mock: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.mock, true);
  assert.equal(ok.data.saved, true);
});

test('runSandboxOperation mock: gst_file_gstr1_evc needs pan + otp + summary', async () => {
  const without = await runSandboxOperation({ operationId: 'gst_file_gstr1_evc', params: { period: '092026' }, mock: true });
  assert.equal(without.ok, false);
  assert.equal(without.error, 'PAN_AND_EVC_OTP_REQUIRED');

  const noSummary = await runSandboxOperation({ operationId: 'gst_file_gstr1_evc', params: { period: '092026', pan: 'AADHI1234X', otp: '123456' }, mock: true });
  assert.equal(noSummary.ok, false);
  assert.equal(noSummary.error, 'SUMMARY_REQUIRED');

  const ok = await runSandboxOperation({ operationId: 'gst_file_gstr1_evc', params: { period: '092026', pan: 'AADHI1234X', otp: '123456', summary: { newSumFlag: 'T', sec_sum: 'S', chksum: 'C' } }, mock: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.mock, true);
  assert.equal(ok.data.filed, true);
});

test('runSandboxOperation mock: einvoice_generate stamps the invoice and never hits network', async () => {
  const state = freshState();
  const inv = state.invoices.find((i) => !i.irn);
  const res = await runSandboxOperation({ operationId: 'einvoice_generate', params: { invoiceId: inv.id }, mock: true }, { state });
  assert.equal(res.ok, true);
  assert.equal(res.mock, true);
  assert.ok(res.data.irn);
  const stamped = state.invoices.find((i) => i.id === inv.id);
  assert.equal(stamped.irn, res.data.irn);
  assert.ok(stamped.signedQrCode);
  const audit = state.auditEvents.find((e) => e.action === 'sandbox.einvoice_generate');
  assert.ok(audit);
  assert.equal(audit.metadata.mock, true);
  assert.equal(audit.metadata.caApprovalRequired, false);
});

test('runSandboxOperation mock: income_tax_calculate and tds jobs return fixtures', async () => {
  const tax = await runSandboxOperation({ operationId: 'income_tax_calculate', params: { ay: '2026-27' }, mock: true });
  assert.equal(tax.ok, true);
  assert.equal(tax.mock, true);

  const tds = await runSandboxOperation({ operationId: 'tds_fvu_generate', params: { fvuKey: 'Q1-PAN' }, mock: true });
  assert.equal(tds.ok, true);
  assert.equal(tds.mock, true);
});

test('runSandboxOperation real path still fail-closed when mock is off and live is off', async () => {
  const res = await runSandboxOperation({ operationId: 'gstin_verify', params: { gstin: '27GSPMH1881G1ZH' }, mock: false, allowLive: false });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'LIVE_CALLS_DISABLED');
});

test('sendNotification mock: marks sent with providerId mock', async () => {
  const state = freshState();
  const queued = queueNotification(state, { clientId: 'C1', channel: 'email', to: 'a@b.in', subject: 'T', body: 'B', reviewBy: 'ca' });
  assert.equal(queued.ok, true);
  const sent = await sendNotification(state, queued.message.id, { mock: true });
  assert.equal(sent.ok, true);
  assert.equal(sent.mock, true);
  assert.equal(sent.message.status, 'sent');
  assert.equal(sent.message.providerId, 'mock');
  const again = await sendNotification(state, queued.message.id, { mock: true });
  assert.equal(again.error, 'ALREADY_SENT');
});

test('sendNotification real path fail-closed when live disabled', async () => {
  const state = freshState();
  const queued = queueNotification(state, { clientId: 'C1', channel: 'email', to: 'a@b.in', subject: 'T', body: 'B', reviewBy: 'ca' });
  const sent = await sendNotification(state, queued.message.id, { mock: false, allowLive: false });
  assert.equal(sent.ok, false);
  assert.equal(sent.error, 'LIVE_CALLS_DISABLED');
});

test('NIC mock: auth, IRN generate, get and cancel never hit the network', async () => {
  const cfg = { env: 'sandbox', clientId: 'mock-client', authToken: 'mock-token', password: 'mock-password' };
  const auth = await nicAuthenticate(cfg, fetchThatFails, { mock: true });
  assert.equal(auth.ok, true);
  assert.equal(auth.mock, true);
  assert.equal(lastFetchCalls, 0);

  const state = freshState();
  const inv = state.invoices.find((i) => !i.irn);
  const irn = await nicGenerateIrn(state, inv.id, fetchThatFails, { mock: true });
  assert.equal(irn.ok, true);
  assert.equal(irn.mock, true);
  assert.ok(irn.irn);
  assert.equal(lastFetchCalls, 0);

  const got = await nicGetIrn('MOCKIRN000000000000X', cfg, fetchThatFails, { mock: true });
  assert.equal(got.ok, true);
  assert.equal(got.mock, true);
  assert.equal(got.irn, 'MOCKIRN000000000000X');
  assert.equal(lastFetchCalls, 0);

  const cancelled = await nicCancelIrn(state, { irn: 'MOCKIRN000000000000X', reason: '1' }, fetchThatFails, { mock: true });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.mock, true);
  assert.equal(cancelled.irn, 'MOCKIRN000000000000X');
  assert.equal(lastFetchCalls, 0);
});

test('NIC mock: false forces the real gate even when env is on', async () => {
  const original = process.env.MYCA_MOCK_MODE;
  process.env.MYCA_MOCK_MODE = '1';
  try {
    const cfg = { env: 'sandbox', clientId: 'c', authToken: 't', password: 'p' };
    const gated = await nicGetIrn('MOCKIRN000000000000X', cfg, fetchThatFails, { mock: false, allowLive: false });
    assert.equal(gated.ok, false);
    assert.equal(gated.error, 'LIVE_CALLS_DISABLED');
    assert.equal(lastFetchCalls, 0);
  } finally {
    process.env.MYCA_MOCK_MODE = original;
  }
});

test('providerDoctor mock: all providers configured and reachable, no network', async () => {
  const report = await providerDoctor({ mock: true });
  assert.equal(report.ok, true);
  assert.equal(report.summary.mockMode, true);
  assert.equal(report.summary.needsCredentials.length, 0);
  const nic = report.providers.find((p) => p.id === 'nic_einvoice');
  assert.equal(nic.configured, true);
  assert.equal(nic.reachability.status, 'ok');
});

test('validate_gstin tool returns a simulated lookup under MYCA_MOCK_MODE=1', async () => {
  const original = process.env.MYCA_MOCK_MODE;
  process.env.MYCA_MOCK_MODE = '1';
  try {
    const state = freshState();
    const res = await runTool(state, 'validate_gstin', { gstin: '27AABCU9603R1ZP' });
    assert.equal(res.ok, true);
    assert.equal(res.data.mock, true);
    assert.equal(res.data.liveVerified, true);
  } finally {
    process.env.MYCA_MOCK_MODE = original;
  }
});

test('sandbox_status tool reports mock environment when enabled', async () => {
  const original = process.env.MYCA_MOCK_MODE;
  process.env.MYCA_MOCK_MODE = '1';
  try {
    const state = freshState();
    const res = await runTool(state, 'sandbox_status', {});
    assert.equal(res.ok, true);
    assert.equal(res.data.mock, true);
    assert.equal(res.data.environment, 'mock');
  } finally {
    process.env.MYCA_MOCK_MODE = original;
  }
});

test('nim_status and nim_ask answer from mock under MYCA_MOCK_MODE=1', async () => {
  const original = process.env.MYCA_MOCK_MODE;
  process.env.MYCA_MOCK_MODE = '1';
  try {
    const state = freshState();
    const status = await runTool(state, 'nim_status', {});
    assert.equal(status.ok, true);
    assert.equal(status.data.mock, true);
    const ask = await runTool(state, 'nim_ask', { prompt: 'how do I file GSTR-1?' });
    assert.equal(ask.ok, true);
    assert.equal(ask.data.mock, true);
    assert.ok(ask.data.reply.includes('GSTR-1'));
  } finally {
    process.env.MYCA_MOCK_MODE = original;
  }
});