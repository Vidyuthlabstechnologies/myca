import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxClient } from '../src/sandbox-client.mjs';
import { journaledCall, providerFingerprint, withProviderJournal } from '../src/provider-journal.mjs';

function memoryJournal() {
  const seen = new Map();
  return {
    seen,
    lookup: (seq, fingerprint) => (seen.get(seq)?.fingerprint === fingerprint ? seen.get(seq).response : null),
    record: async (seq, fingerprint, response) => { seen.set(seq, { fingerprint, response }); },
  };
}

function client(handler) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    const out = handler(calls.length);
    return { ok: out.status < 400, status: out.status, json: async () => out.body };
  };
  return { sandbox: new SandboxClient({ fetchFn }), calls };
}

const post = (sandbox, body = { period: '2026-10' }) => sandbox.request('/gst/returns/gstr1/file', { method: 'POST', body, token: 'taxpayer-token' });

test('outside a journal scope the client behaves as before and nothing is remembered', async () => {
  const { sandbox, calls } = client(() => ({ status: 200, body: { data: { ack: 'A1' } } }));
  assert.equal((await post(sandbox)).ok, true);
  assert.equal((await post(sandbox)).ok, true);
  assert.equal(calls.length, 2);
});

test('inside a scope a successful call is recorded, and a replay of the same call does not reach the provider', async () => {
  const { sandbox, calls } = client(() => ({ status: 200, body: { data: { ack: 'A1' } } }));
  const journal = memoryJournal();
  const first = await withProviderJournal(journal, () => post(sandbox));
  assert.equal(first.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(journal.seen.size, 1);
  const replay = await withProviderJournal(journal, () => post(sandbox));
  assert.deepEqual(replay, first);
  assert.equal(calls.length, 1, 'the second attempt used the recorded answer');
});

test('a different request at the same place is a real call, not a replay', async () => {
  const { sandbox, calls } = client(() => ({ status: 200, body: { data: { ack: 'A1' } } }));
  const journal = memoryJournal();
  await withProviderJournal(journal, () => post(sandbox, { period: '2026-10' }));
  await withProviderJournal(journal, () => post(sandbox, { period: '2026-11' }));
  assert.equal(calls.length, 2);
});

test('reads are never recorded, so a retry sees fresh data', async () => {
  const { sandbox, calls } = client(() => ({ status: 200, body: { data: { status: 'processed' } } }));
  const journal = memoryJournal();
  const get = () => sandbox.request('/gst/returns/gstr1/status', { method: 'GET', token: 'taxpayer-token' });
  await withProviderJournal(journal, get);
  await withProviderJournal(journal, get);
  assert.equal(calls.length, 2);
  assert.equal(journal.seen.size, 0);
});

test('a refused call is not recorded, so the retry really retries', async () => {
  const { sandbox, calls } = client((n) => (n === 1 ? { status: 500, body: { message: 'down' } } : { status: 200, body: { data: { ack: 'A2' } } }));
  const journal = memoryJournal();
  assert.equal((await withProviderJournal(journal, () => post(sandbox))).ok, false);
  assert.equal(journal.seen.size, 0);
  const second = await withProviderJournal(journal, () => post(sandbox));
  assert.equal(second.ok, true);
  assert.equal(calls.length, 2);
});

test('several calls in one action are replayed in order', async () => {
  const { sandbox, calls } = client((n) => ({ status: 200, body: { data: { step: n } } }));
  const journal = memoryJournal();
  const two = () => Promise.all([]).then(async () => [await post(sandbox, { a: 1 }), await post(sandbox, { b: 2 })]);
  const first = await withProviderJournal(journal, two);
  const second = await withProviderJournal(journal, two);
  assert.deepEqual(second, first);
  assert.equal(calls.length, 2);
});

test('the fingerprint changes with any part of the call', () => {
  
  assert.notEqual(providerFingerprint('a', 'bc'), providerFingerprint('ab', 'c'));
  assert.equal(providerFingerprint('x', 1), providerFingerprint('x', '1'));
});

test('the fingerprint is the call itself, not a hash of it, so nothing short can be guessed back out of it', () => {
  const text = providerFingerprint('POST', '/gst/returns/gstr1/file', '{"period":"2026-10"}');
  assert.equal(text, 'POST\u0000/gst/returns/gstr1/file\u0000{"period":"2026-10"}');
  assert.doesNotMatch(text, /^[0-9a-f]{64}$/);
});

test('one-time codes and credentials are not part of what makes two calls the same', () => {
  const first = providerFingerprint('POST', '/file', '{"period":"2026-10","otp":"123456","auth":{"password":"a","user":"u"},"list":[{"pin":"1","x":2}]}');
  const again = providerFingerprint('POST', '/file', '{"period":"2026-10","otp":"654321","auth":{"password":"b","user":"u"},"list":[{"pin":"9","x":2}]}');
  assert.equal(first, again);
  assert.notEqual(first, providerFingerprint('POST', '/file', '{"period":"2026-11","otp":"123456"}'));
  assert.notEqual(providerFingerprint('a', 'bc'), providerFingerprint('ab', 'c'));
  assert.equal(providerFingerprint('x', 1), providerFingerprint('x', '1'));
});

test('a filing retried with a fresh one-time code replays the earlier answer and does not file again', async () => {
  const { sandbox, calls } = client(() => ({ status: 200, body: { data: { ack: 'ACK-1' } } }));
  const journal = memoryJournal();
  const file = (otp) => sandbox.request('/gst/returns/gstr1/file', { method: 'POST', body: { period: '2026-10', otp }, token: 'taxpayer-token' });
  const first = await withProviderJournal(journal, () => file('111111'));
  const retry = await withProviderJournal(journal, () => file('222222'));
  assert.deepEqual(retry, first);
  assert.equal(calls.length, 1);
});

test('journaledCall outside a scope just makes the call', async () => {
  let n = 0;
  assert.equal(await journaledCall('f', async () => { n += 1; return { ok: true, n }; }).then((r) => r.n), 1);
  assert.equal(await journaledCall('f', async () => { n += 1; return { ok: true, n }; }).then((r) => r.n), 2);
});

import { createState } from '../src/store.mjs';
import { performExternalAction } from '../src/action-gate.mjs';
import { requestApproval, decideApproval } from '../src/approvals.mjs';

globalThis.fetch = async (url) => {
  throw new Error(`NETWORK_FORBIDDEN_IN_TESTS ${url}`);
};

async function live(fn) {
  const saved = { MYCA_ENABLE_LIVE_CALLS: process.env.MYCA_ENABLE_LIVE_CALLS, MYCA_MOCK_MODE: process.env.MYCA_MOCK_MODE };
  Object.assign(process.env, { MYCA_ENABLE_LIVE_CALLS: '1', MYCA_MOCK_MODE: '0' });
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function approved(state, operationId, params) {
  const asked = requestApproval(state, { operationId, clientId: 'SELF', params, actor: { userId: 'maker', role: 'staff' } });
  decideApproval(state, { approvalId: asked.approval.approvalId, decision: 'approve', actor: { userId: 'partner1', role: 'partner' } });
  return asked.approval.approvalId;
}

test('at the gate, an irreversible action that already got an answer is not sent again when the same action is retried', async () => {
  await live(async () => {
    const journal = memoryJournal();
    const sent = [];
    const execute = async () => {
      sent.push(1);
      return { ok: true, irn: 'IRN-123' };
    };
    const run = (state) => performExternalAction(state, { actionId: 'einvoice_generate', actor: { userId: 'maker', role: 'staff' }, params: { invoiceId: 'INV-1' }, approvalId: approved(state, 'einvoice_generate', { invoiceId: 'INV-1' }) }, execute);
    const first = await withProviderJournal(journal, () => run(createState()));
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(sent.length, 1);
    const retry = await withProviderJournal(journal, () => run(createState()));
    assert.equal(retry.irn, 'IRN-123');
    assert.equal(sent.length, 1, 'the e-invoice was generated once');
  });
});

test('at the gate, a different invoice is a different action and is sent', async () => {
  await live(async () => {
    const journal = memoryJournal();
    let sent = 0;
    const execute = async () => ({ ok: true, irn: `IRN-${(sent += 1)}` });
    for (const invoiceId of ['INV-1', 'INV-2']) {
      const state = createState();
      await withProviderJournal(journal, () => performExternalAction(state, { actionId: 'einvoice_generate', actor: { userId: 'maker', role: 'staff' }, params: { invoiceId }, approvalId: approved(state, 'einvoice_generate', { invoiceId }) }, execute));
    }
    assert.equal(sent, 2);
  });
});

test('at the gate, a failed irreversible action is not remembered, and a read is never remembered', async () => {
  await live(async () => {
    const journal = memoryJournal();
    let sent = 0;
    const flaky = async () => ((sent += 1) === 1 ? { ok: false, error: 'GSP_DOWN' } : { ok: true, irn: 'IRN-OK' });
    const state = createState();
    const request = () => ({ actionId: 'einvoice_generate', actor: { userId: 'maker', role: 'staff' }, params: { invoiceId: 'INV-9' }, approvalId: approved(state, 'einvoice_generate', { invoiceId: 'INV-9' }) });
    assert.equal((await withProviderJournal(journal, () => performExternalAction(state, request(), flaky))).ok, false);
    assert.equal((await withProviderJournal(journal, () => performExternalAction(state, request(), flaky))).irn, 'IRN-OK');
    assert.equal(sent, 2);
    let reads = 0;
    const read = async () => ({ ok: true, status: (reads += 1) });
    for (let n = 0; n < 2; n += 1) await withProviderJournal(journal, () => performExternalAction(createState(), { actionId: 'nic_irn_get', actor: { userId: 'maker', role: 'staff' }, params: { irn: 'X' } }, read));
    assert.equal(reads, 2, 'reads go to the provider every time');
  });
});
