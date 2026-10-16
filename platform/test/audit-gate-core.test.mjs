import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { newBook } from '../src/books.mjs';
import { bookView } from '../src/book-view.mjs';
import { SandboxClient } from '../src/sandbox-client.mjs';
import { NimClient } from '../src/nim-client.mjs';
import { requestApproval, decideApproval, findApproval, approvalStatus, canonicalJson } from '../src/approvals.mjs';
import { ACTION_CLASSES, DRY_RUN_LIMIT, performExternalAction, providerInfo } from '../src/action-gate.mjs';

globalThis.fetch = async (url) => {
  throw new Error(`NETWORK_FORBIDDEN_IN_TESTS ${url}`);
};

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
const MOCK = { MYCA_MOCK_MODE: '1' };
const maker = { userId: 'ca', role: 'staff' };
const partner = { userId: 'partner1', role: 'partner' };

function approve(state, { operationId, clientId = 'SELF', params = {}, requester = maker, approver = partner } = {}) {
  const req = requestApproval(state, { operationId, clientId, params, actor: requester });
  decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: approver });
  return req.approval.approvalId;
}

function booksWithInvoice() {
  const state = createState();
  createInvoice(state, { date: '2026-09-05', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', partyState: '27', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  return state;
}

test('scoped transports: every action declares the transport functions it may call', () => {
  const groups = new Set(['sandbox', 'nic', 'nim', 'notifications', 'reachability', 'channel']);
  for (const [id, entry] of Object.entries(ACTION_CLASSES)) {
    assert.ok(Array.isArray(entry.uses), id);
    assert.ok(Number.isInteger(entry.timeoutMs) && entry.timeoutMs > 0, id);
    for (const use of entry.uses) {
      const [group, name] = use.split('.');
      assert.ok(groups.has(group), `${id}: ${use}`);
      if (group === 'sandbox') assert.equal(typeof SandboxClient.prototype[name], 'function', `${id}: ${use}`);
      if (group === 'nim') assert.equal(typeof NimClient.prototype[name], 'function', `${id}: ${use}`);
    }
  }
  assert.deepEqual(ACTION_CLASSES.gst_file_gstr1_evc.uses, ['sandbox.fileGstr1']);
  assert.deepEqual(ACTION_CLASSES.nic_irn_generate.uses, ['nic.generateIrn']);
  assert.equal(ACTION_CLASSES.nic_ewb_cancel.actionClass, 'write');
});

test('scoped transports: execute receives only the functions its action declares', async () => {
  const state = createState();
  const seen = {};
  await withEnv(LIVE, async () => {
    for (const [actionId, entry] of Object.entries(ACTION_CLASSES)) {
      const params = { probe: actionId };
      const approvalId = entry.actionClass === 'write' ? approve(state, { operationId: actionId, params }) : '';
      const out = await performExternalAction(state, { actionId, params, actor: maker, approvalId }, async (transports) => {
        seen[actionId] = Object.entries(transports).flatMap(([group, fns]) => Object.entries(fns).map(([name, fn]) => {
          assert.equal(typeof fn, 'function', `${actionId}: ${group}.${name}`);
          return `${group}.${name}`;
        }));
        return { ok: true };
      });
      assert.equal(out.ok, true, `${actionId}: ${out.error}`);
      assert.deepEqual(seen[actionId].sort(), [...entry.uses].sort(), actionId);
    }
  });
  const reach = await withEnv(LIVE, () => performExternalAction(state, { actionId: 'nim_status', params: {}, actor: maker }, async (transports) => {
    assert.equal(transports.nic, undefined);
    assert.equal(transports.sandbox, undefined);
    return transports.nic.generateIrn(state, 'INV-0001');
  }));
  assert.equal(reach.ok, false);
});

test('deadline: a hung transport is cut off, its signal aborts, and the write approval is settled failed', async () => {
  const state = createState();
  const params = { invoiceId: 'INV-0001' };
  const approvalId = approve(state, { operationId: 'nic_irn_generate', params });
  let ctxSeen = null;
  const out = await withEnv(LIVE, () => performExternalAction(state, {
    actionId: 'nic_irn_generate',
    params,
    actor: maker,
    timeoutMs: 25,
  }, async (_transports, ctx) => {
    ctxSeen = ctx;
    return new Promise(() => {});
  }));
  assert.equal(out.ok, false);
  assert.equal(out.error, 'EXTERNAL_TIMEOUT');
  assert.equal(out.outcomeUnknown, true);
  assert.equal(ctxSeen.signal.aborted, true);
  assert.equal(ctxSeen.irreversible, true);
  assert.equal(ctxSeen.actionId, 'nic_irn_generate');
  assert.equal(approvalStatus(findApproval(state, approvalId)), 'failed');
  const audit = state.auditEvents.at(-1);
  assert.equal(audit.metadata.error, 'EXTERNAL_TIMEOUT');
  assert.equal(audit.metadata.outcomeUnknown, true);
});

test('deadline: a caller may shorten the deadline but never lengthen it', async () => {
  const state = createState();
  const started = [];
  const out = await withEnv(LIVE, () => performExternalAction(state, {
    actionId: 'nim_status',
    params: {},
    actor: maker,
    timeoutMs: 'forever',
  }, async (_transports, ctx) => {
    started.push(ctx.timeoutMs);
    return { ok: true };
  }));
  assert.equal(out.ok, true);
  assert.deepEqual(started, [ACTION_CLASSES.nim_status.timeoutMs]);
  await withEnv(LIVE, () => performExternalAction(state, { actionId: 'nim_status', params: {}, actor: maker, timeoutMs: 10 ** 12 }, async (_t, ctx) => {
    started.push(ctx.timeoutMs);
    return { ok: true };
  }));
  assert.equal(started[1], ACTION_CLASSES.nim_status.timeoutMs);
});

test('mock: a fixture works on a copy, only mock fields reach the books, and real-field writes are refused', async () => {
  const state = booksWithInvoice();
  await withEnv(MOCK, async () => {
    const good = await performExternalAction(state, {
      actionId: 'nic_irn_generate',
      params: { invoiceId: 'INV-0001' },
      actor: maker,
      fixture: (copy) => {
        assert.notEqual(copy, state);
        const inv = copy.invoices.find((i) => i.id === 'INV-0001');
        inv.mockIrn = 'M'.repeat(64);
        inv.mockAckNo = 'MOCK-ACK-1';
        return { ok: true, irn: inv.mockIrn };
      },
    }, async () => ({ ok: false, error: 'MUST_NOT_EXECUTE' }));
    assert.equal(good.ok, true);
    assert.equal(good.mock, true);
    assert.equal(state.invoices[0].mockIrn, 'M'.repeat(64));
    assert.equal(state.invoices[0].mockAckNo, 'MOCK-ACK-1');
    assert.equal(state.invoices[0].irn, undefined);

    const bad = await performExternalAction(state, {
      actionId: 'nic_irn_generate',
      params: { invoiceId: 'INV-0001' },
      actor: maker,
      fixture: (copy) => {
        const inv = copy.invoices.find((i) => i.id === 'INV-0001');
        inv.irn = 'REAL-LOOKING-IRN';
        inv.mockIrn = 'CHANGED';
        return { ok: true };
      },
    }, async () => ({ ok: true }));
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'MOCK_WROTE_REAL_FIELDS');
    assert.equal(bad.mock, true);
    assert.equal(state.invoices[0].irn, undefined);
    assert.equal(state.invoices[0].mockIrn, 'M'.repeat(64));

    const closure = await performExternalAction(state, {
      actionId: 'notification_send',
      params: {},
      actor: maker,
      fixture: () => {
        state.invoices[0].ackNo = 'LEAKED';
        return { ok: true };
      },
    }, async () => ({ ok: true }));
    assert.equal(closure.error, 'MOCK_WROTE_REAL_FIELDS');
    assert.equal(state.auditEvents.at(-1).metadata.error, 'MOCK_WROTE_REAL_FIELDS');
  });
});

test('mock: fixtures through a client book view merge mock fields onto that client book', async () => {
  const root = createState();
  const book = newBook({ name: 'Client' });
  const view = bookView(root, book);
  createInvoice(view, { date: '2026-09-05', partyName: 'Buyer', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  const out = await withEnv(MOCK, () => performExternalAction(view, {
    actionId: 'nic_irn_generate',
    clientId: 'C2',
    params: {},
    actor: maker,
    fixture: (copy) => {
      copy.invoices[0].mockIrn = 'VIEW-MOCK';
      return { ok: true };
    },
  }, async () => ({ ok: true })));
  assert.equal(out.ok, true);
  assert.equal(book.invoices[0].mockIrn, 'VIEW-MOCK');
  assert.equal((root.invoices[0] || {}).mockIrn, undefined);
});

test('dry-run log: reads are evicted before writes so filings survive status polling', async () => {
  const state = createState();
  const noop = async () => ({ ok: true });
  await withEnv(OFF, async () => {
    await performExternalAction(state, { actionId: 'gst_file_gstr1_evc', params: { period: '2026-08' }, actor: maker }, noop);
    for (let i = 0; i < DRY_RUN_LIMIT + 10; i += 1) {
      await performExternalAction(state, { actionId: 'nim_status', params: { i }, actor: maker }, noop);
    }
  });
  assert.equal(state.dryRuns.length, DRY_RUN_LIMIT);
  assert.ok(state.dryRuns.some((r) => r.actionId === 'gst_file_gstr1_evc'));
});

test('gate: every external action needs the state it audits into', async () => {
  const out = await withEnv(LIVE, () => performExternalAction(null, { actionId: 'nim_status', params: {}, actor: maker }, async () => ({ ok: true })));
  assert.equal(out.ok, false);
  assert.equal(out.error, 'STATE_REQUIRED');
});

test('gate write: an anonymous or assistant actor never executes, and an assistant-decided approval is refused', async () => {
  const state = createState();
  const params = { messageId: 'MSG-000001' };
  const calls = [];
  const execute = async () => {
    calls.push(1);
    return { ok: true };
  };
  await withEnv(LIVE, async () => {
    const anon = approve(state, { operationId: 'notification_send', params });
    const anonymous = await performExternalAction(state, { actionId: 'notification_send', params, approvalId: anon }, execute);
    assert.equal(anonymous.error, 'ACTOR_REQUIRED');
    assert.equal(approvalStatus(findApproval(state, anon)), 'approved');

    const assistant = await performExternalAction(state, { actionId: 'notification_send', params, actor: { userId: ' Assistant ' }, approvalId: anon }, execute);
    assert.equal(assistant.error, 'ASSISTANT_BLOCKED_FOR_OPERATION');
    assert.equal(approvalStatus(findApproval(state, anon)), 'approved');

    const forged = findApproval(state, anon);
    forged.decidedBy = 'ASSISTANT';
    const byAssistant = await performExternalAction(state, { actionId: 'notification_send', params, actor: maker, approvalId: anon }, execute);
    assert.equal(byAssistant.error, 'ASSISTANT_CANNOT_APPROVE');
  });
  assert.equal(calls.length, 0);
});

test('providerInfo: configuration facts for status screens, with no secrets and no network', async () => {
  const info = await withEnv({
    MYCA_GSP_API_KEY: 'KEY-SECRET-VALUE',
    MYCA_GSP_API_SECRET: 'SECRET-SECRET-VALUE',
    MYCA_GSP_BASE_URL: 'https://test-api.sandbox.co.in',
    NVIDIA_NIM_API_KEY: 'NIM-SECRET-VALUE',
  }, () => providerInfo());
  assert.equal(info.sandbox.configured, true);
  assert.equal(info.sandbox.baseUrl, 'https://test-api.sandbox.co.in');
  assert.equal(info.sandbox.environment, 'test');
  assert.equal(info.nim.configured, true);
  assert.equal(typeof info.nim.model, 'string');
  const text = JSON.stringify(info);
  for (const secret of ['KEY-SECRET-VALUE', 'SECRET-SECRET-VALUE', 'NIM-SECRET-VALUE']) assert.equal(text.includes(secret), false);
});

test('reachability: the gate signal stops the government probe and the TCP probe', async () => {
  const { probeGovt, probeTcp } = await import('../src/reachability.mjs');
  const controller = new AbortController();
  const signals = [];
  const fakeFetch = async (url, init) => {
    signals.push(init.signal);
    controller.abort();
    return { status: 200 };
  };
  const out = await probeGovt(fakeFetch, { signal: controller.signal });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, true);
  assert.equal(out.total, 1);
  const tcp = await probeTcp('127.0.0.1', 9, 1500, { signal: AbortSignal.abort() });
  assert.equal(tcp.status, 'error');
  assert.equal(tcp.error, 'ABORTED');
});

test('H9: with the live switch off no action in the table executes, and each leaves a dry run', async () => {
  const state = createState();
  const calls = [];
  await withEnv(OFF, async () => {
    for (const actionId of Object.keys(ACTION_CLASSES)) {
      const out = await performExternalAction(state, { actionId, params: { probe: actionId }, actor: maker }, async () => {
        calls.push(actionId);
        return { ok: true };
      });
      assert.equal(out.error, 'LIVE_CALLS_DISABLED', actionId);
      assert.equal(state.dryRuns.at(-1).actionId, actionId);
    }
  });
  assert.deepEqual(calls, []);
});

test('C2: with the live switch on no write in the table executes without a matching approval', async () => {
  const state = createState();
  const calls = [];
  const writes = Object.entries(ACTION_CLASSES).filter(([, entry]) => entry.actionClass === 'write').map(([id]) => id);
  assert.ok(writes.length >= 10);
  await withEnv(LIVE, async () => {
    for (const actionId of writes) {
      const out = await performExternalAction(state, { actionId, params: { probe: actionId }, actor: maker }, async () => {
        calls.push(actionId);
        return { ok: true };
      });
      assert.equal(out.error, 'APPROVAL_REQUIRED', actionId);
    }
  });
  assert.deepEqual(calls, []);
});

test('params: only plain JSON reaches the gate, so two different requests never share a params hash', async () => {
  const state = createState();
  const calls = [];
  const execute = async () => {
    calls.push(1);
    return { ok: true };
  };
  const cyclic = { period: '2026-08' };
  cyclic.self = cyclic;
  const refused = [
    { date: new Date('2026-08-01') },
    { period: new Map([['month', 8]]) },
    { invoiceIds: new Set(['INV-0001']) },
    { nested: { when: new Date('2026-11-01') } },
    { amount: Number.NaN },
    { amount: Infinity },
    { amount: 10n },
    { lines: [1, undefined] },
    { build: () => 1 },
    { [Symbol('key')]: 1 },
    Object.assign(Object.create({ inherited: 1 }), { own: 1 }),
    cyclic,
  ];
  for (const env of [LIVE, OFF, MOCK]) {
    for (const params of refused) {
      const out = await withEnv(env, () => performExternalAction(state, { actionId: 'nim_status', params, actor: maker, fixture: () => ({ ok: true }) }, execute));
      assert.equal(out.error, 'PARAMS_NOT_PLAIN_JSON');
    }
  }
  assert.equal((state.dryRuns || []).length, 0);
  const good = await withEnv(LIVE, () => performExternalAction(state, {
    actionId: 'nim_status',
    params: { period: '2026-08', count: 1, nested: [{ a: null, b: true }], dropped: undefined },
    actor: maker,
  }, execute));
  assert.equal(good.ok, true);
  assert.equal(calls.length, 1);
});

test('gate write: the assistant is refused in every mode, before any validation, fixture or dry run', async () => {
  const state = booksWithInvoice();
  const ran = [];
  const request = {
    actionId: 'nic_irn_generate',
    params: { invoiceId: 'INV-0001' },
    actor: { userId: 'Assistant' },
    preflight: () => {
      ran.push('preflight');
      return null;
    },
    fixture: (copy) => {
      ran.push('fixture');
      copy.invoices[0].mockIrn = 'ASSISTANT-MOCK';
      return { ok: true };
    },
  };
  for (const env of [MOCK, OFF, LIVE]) {
    const out = await withEnv(env, () => performExternalAction(state, request, async () => {
      ran.push('execute');
      return { ok: true };
    }));
    assert.equal(out.error, 'ASSISTANT_BLOCKED_FOR_OPERATION');
  }
  assert.deepEqual(ran, []);
  assert.equal(state.invoices[0].mockIrn, undefined);
  assert.equal((state.dryRuns || []).length, 0);
  const read = await withEnv(MOCK, () => performExternalAction(state, { actionId: 'nim_status', params: {}, actor: { userId: 'assistant' }, fixture: () => ({ ok: true }) }, async () => ({ ok: true })));
  assert.equal(read.ok, true);
});

test('gate: request validation runs before the mode checks, so mock mode refuses what live mode refuses', async () => {
  const state = createState();
  for (const env of [MOCK, OFF, LIVE]) {
    const out = await withEnv(env, () => performExternalAction(state, {
      actionId: 'gst_save_gstr1',
      params: { period: '2026-08' },
      actor: maker,
      fixture: () => ({ ok: true }),
      preflight: () => ({ ok: false, error: 'PAYLOAD_REQUIRED' }),
    }, async () => ({ ok: true })));
    assert.equal(out.ok, false);
    assert.equal(out.error, 'PAYLOAD_REQUIRED');
  }
  assert.equal((state.dryRuns || []).length, 0);
});

test('dry run: each one leaves an audit event that survives save and reload, with no secret values', async () => {
  const state = createState();
  const params = { period: '2026-08', pan: 'AABCU9603R', otp: '987654', summary: { chksum: 'AUG' } };
  const out = await withEnv(OFF, () => performExternalAction(state, { actionId: 'gst_file_gstr1_evc', params, actor: maker }, async () => ({ ok: true })));
  assert.equal(out.error, 'LIVE_CALLS_DISABLED');
  const dry = state.dryRuns.at(-1);
  const event = state.auditEvents.at(-1);
  assert.equal(event.action, 'sandbox.gst_file_gstr1_evc');
  assert.equal(event.actorId, 'ca');
  assert.equal(event.metadata.dryRunId, dry.dryRunId);
  assert.equal(event.metadata.error, 'LIVE_CALLS_DISABLED');
  assert.equal(event.metadata.ok, false);
  assert.equal(event.metadata.paramsHash, out.paramsHash);
  assert.equal(event.metadata.payloadHash, createHash('sha256').update(canonicalJson(dry.payload)).digest('hex'));
  assert.equal(JSON.stringify(state.auditEvents).includes('987654'), false);
  const reloaded = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.ok(reloaded.auditEvents.some((e) => e.metadata.dryRunId === dry.dryRunId && e.metadata.payloadHash === event.metadata.payloadHash));
});

test('action classes: credential and OTP actions are writes whichever provider carries them', () => {
  for (const actionId of ['nic_auth', 'einvoice_authenticate', 'gst_taxpayer_generate_otp', 'gst_taxpayer_verify_otp']) {
    assert.equal(ACTION_CLASSES[actionId].actionClass, 'write', actionId);
  }
});
