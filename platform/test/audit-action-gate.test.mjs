import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { newBook } from '../src/books.mjs';
import { bookView } from '../src/book-view.mjs';
import { SANDBOX_OPERATIONS } from '../src/sandbox-adapter-contract.mjs';
import { requestApproval, decideApproval, findApproval, approvalStatus, paramsHash } from '../src/approvals.mjs';
import { ACTION_CLASSES, DRY_RUN_LIMIT, performExternalAction } from '../src/action-gate.mjs';

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
const MOCK = { MYCA_MOCK_MODE: '1' };
const maker = { userId: 'ca', role: 'staff' };
const partner = { userId: 'partner1', role: 'partner' };

function counter(result = { ok: true, value: 42 }) {
  const calls = [];
  const execute = async (transports) => {
    calls.push(transports);
    if (result instanceof Error) throw result;
    return result;
  };
  return { calls, execute };
}

function approve(state, { operationId, clientId = 'SELF', params = {}, requester = maker, approver = partner } = {}) {
  const req = requestApproval(state, { operationId, clientId, params, actor: requester });
  decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: approver });
  return req.approval.approvalId;
}

test('action table: one class per external action, and Sandbox classes agree with the contract', () => {
  const required = [
    'nic_auth', 'nic_health', 'nic_gstin_master', 'nic_irn_generate', 'nic_irn_get', 'nic_irn_get_by_doc',
    'nic_irn_cancel', 'nic_rejected_irns', 'nic_ewb_generate', 'nic_ewb_get', 'govt_probe', 'notification_send',
    'nim_ask', 'nim_status', 'provider_doctor_ping', 'sandbox_status', 'validate_gstin_lookup',
  ];
  for (const id of required) assert.ok(Object.hasOwn(ACTION_CLASSES, id), id);
  for (const [id, entry] of Object.entries(ACTION_CLASSES)) assert.ok(['read', 'write'].includes(entry.actionClass), id);
  for (const op of SANDBOX_OPERATIONS) {
    assert.equal(ACTION_CLASSES[op.operationId]?.actionClass, op.caApprovalRequired ? 'write' : 'read', op.operationId);
  }
  for (const id of ['nic_auth', 'nic_irn_generate', 'nic_irn_cancel', 'nic_ewb_generate', 'notification_send', 'gst_file_gstr1_evc']) {
    assert.equal(ACTION_CLASSES[id].actionClass, 'write', id);
  }
  for (const id of ['nic_health', 'govt_probe', 'nim_ask', 'validate_gstin_lookup']) {
    assert.equal(ACTION_CLASSES[id].actionClass, 'read', id);
  }
});

test('gate: unknown actions are refused without calling execute', async () => {
  const { calls, execute } = counter();
  const out = await withEnv(LIVE, () => performExternalAction(createState(), { actionId: 'wire_money', params: {} }, execute));
  assert.equal(out.error, 'UNKNOWN_EXTERNAL_ACTION');
  assert.equal(calls.length, 0);
  assert.equal((await performExternalAction(createState(), { actionId: 'constructor' }, execute)).error, 'UNKNOWN_EXTERNAL_ACTION');
});

test('gate mock: returns the tagged fixture, never executes, and needs no approval even for writes', async () => {
  const state = createState();
  const { calls, execute } = counter();
  const out = await withEnv({ ...MOCK, MYCA_ENABLE_LIVE_CALLS: '1' }, () => performExternalAction(state, {
    actionId: 'nic_irn_generate',
    params: { invoiceId: 'INV-0001' },
    actor: maker,
    fixture: () => ({ ok: true, irn: 'MOCKIRN' }),
  }, execute));
  assert.equal(out.ok, true);
  assert.equal(out.mock, true);
  assert.equal(out.irn, 'MOCKIRN');
  assert.equal(calls.length, 0);
  const audit = state.auditEvents.at(-1);
  assert.equal(audit.action, 'external.nic_irn_generate');
  assert.equal(audit.metadata.mock, true);
  const missing = await withEnv(MOCK, () => performExternalAction(state, { actionId: 'nic_health', params: {} }, execute));
  assert.equal(missing.error, 'NOT_IMPLEMENTED');
  assert.equal(calls.length, 0);
});

test('gate live switch off: LIVE_CALLS_DISABLED plus a redacted dry-run record, and no execute', async () => {
  const state = createState();
  const { calls, execute } = counter();
  const params = { gstin: '27AABCU9603R1ZN', username: 'api', password: 'Pa55word!' };
  const out = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0', MYCA_MOCK_MODE: '0' }, () => performExternalAction(state, {
    actionId: 'einvoice_authenticate',
    clientId: 'self',
    params,
    actor: maker,
  }, execute));
  assert.equal(out.ok, false);
  assert.equal(out.error, 'LIVE_CALLS_DISABLED');
  assert.equal(calls.length, 0);
  const record = state.dryRuns.at(-1);
  assert.equal(record.actionId, 'einvoice_authenticate');
  assert.equal(record.clientId, 'SELF');
  assert.equal(record.paramsHash, paramsHash(params));
  assert.equal(record.payload.password, '[REDACTED]');
  assert.equal(record.payload.gstin, '27AABCU9603R1ZN');
  assert.equal(out.dryRunId, record.dryRunId);
  assert.equal(JSON.stringify({ dryRuns: state.dryRuns, auditEvents: state.auditEvents || [] }).includes('Pa55word!'), false);
});

test('gate dry-run: a caller-built payload is recorded, and the log stays bounded', async () => {
  const state = createState();
  const { execute } = counter();
  await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0' }, async () => {
    await performExternalAction(state, { actionId: 'nic_irn_generate', params: { invoiceId: 'INV-0001' }, payload: { DocDtls: { No: 'INV-0001' }, AppKey: 'k' } }, execute);
    assert.deepEqual(state.dryRuns.at(-1).payload, { DocDtls: { No: 'INV-0001' }, AppKey: '[REDACTED]' });
    for (let i = 0; i < DRY_RUN_LIMIT + 25; i += 1) {
      await performExternalAction(state, { actionId: 'govt_probe', params: { i } }, execute);
    }
  });
  assert.equal(state.dryRuns.length, DRY_RUN_LIMIT);
  assert.equal(state.dryRuns.at(-1).paramsHash, paramsHash({ i: DRY_RUN_LIMIT + 24 }));
});

test('gate dry-run through a client book view lands on the firm state', async () => {
  const root = createState();
  const view = bookView(root, newBook({ name: 'Client' }));
  const out = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0' }, () => performExternalAction(view, { actionId: 'govt_probe', clientId: 'C2', params: {} }, counter().execute));
  assert.equal(out.error, 'LIVE_CALLS_DISABLED');
  assert.equal(root.dryRuns.at(-1).clientId, 'C2');
});

test('gate preflight rejects before any dry-run is written', async () => {
  const state = createState();
  const out = await withEnv({ MYCA_ENABLE_LIVE_CALLS: '0' }, () => performExternalAction(state, {
    actionId: 'nic_irn_generate',
    params: { invoiceId: 'INV-9999' },
    preflight: () => ({ ok: false, error: 'INVOICE_NOT_FOUND' }),
  }, counter().execute));
  assert.equal(out.error, 'INVOICE_NOT_FOUND');
  assert.equal((state.dryRuns || []).length, 0);
});

test('gate read: executes once with the transports and audits hashes without secret values', async () => {
  const state = createState();
  const { calls, execute } = counter({ ok: true, legalName: 'X' });
  const params = { gstin: '27AABCU9603R1ZN', token: 'TOKEN-SECRET-1' };
  const out = await withEnv(LIVE, () => performExternalAction(state, { actionId: 'validate_gstin_lookup', params, actor: maker }, execute));
  assert.equal(out.ok, true);
  assert.equal(out.legalName, 'X');
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]), ['sandbox']);
  assert.deepEqual(Object.keys(calls[0].sandbox), ['searchGstin']);
  const audit = state.auditEvents.at(-1);
  assert.equal(audit.action, 'external.validate_gstin_lookup');
  assert.equal(audit.actorId, 'ca');
  assert.equal(audit.metadata.paramsHash, paramsHash(params));
  assert.match(audit.beforeHash, /^[0-9a-f]{64}$/);
  assert.match(audit.afterHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(state.auditEvents).includes('TOKEN-SECRET-1'), false);
});

test('C2/H8: a write with no matching approval never executes', async () => {
  const state = createState();
  const { calls, execute } = counter();
  const params = { invoiceId: 'INV-0001' };
  await withEnv(LIVE, async () => {
    const none = await performExternalAction(state, { actionId: 'nic_irn_generate', params, actor: maker }, execute);
    assert.equal(none.error, 'APPROVAL_REQUIRED');
    assert.equal(none.paramsHash, paramsHash(params));

    approve(state, { operationId: 'nic_irn_generate', params: { invoiceId: 'INV-0002' } });
    approve(state, { operationId: 'nic_irn_generate', clientId: 'C2', params });
    approve(state, { operationId: 'nic_irn_cancel', params });
    assert.equal((await performExternalAction(state, { actionId: 'nic_irn_generate', params, actor: maker }, execute)).error, 'APPROVAL_REQUIRED');

    const otherParams = approve(state, { operationId: 'nic_irn_generate', params: { invoiceId: 'INV-0003' } });
    const otherClient = approve(state, { operationId: 'nic_irn_generate', clientId: 'C2', params });
    const otherOp = approve(state, { operationId: 'nic_irn_cancel', params });
    const byId = (approvalId) => performExternalAction(state, { actionId: 'nic_irn_generate', params, actor: maker, approvalId }, execute);
    assert.equal((await byId(otherParams)).error, 'APPROVAL_PARAMS_MISMATCH');
    assert.equal((await byId(otherClient)).error, 'APPROVAL_CLIENT_MISMATCH');
    assert.equal((await byId(otherOp)).error, 'APPROVAL_OPERATION_MISMATCH');
    assert.equal((await byId('APR-999999')).error, 'APPROVAL_NOT_FOUND');
  });
  assert.equal(calls.length, 0);
});

test('H8: forged or expiry-less approvals are refused at the gate', async () => {
  const state = createState();
  const { calls, execute } = counter();
  const params = { messageId: 'MSG-000001' };
  await withEnv(LIVE, async () => {
    const selfApproved = approve(state, { operationId: 'notification_send', params });
    const forged = findApproval(state, selfApproved);
    forged.decidedBy = ' CA ';
    const refused = await performExternalAction(state, { actionId: 'notification_send', params, actor: maker, approvalId: selfApproved }, execute);
    assert.equal(refused.error, 'MAKER_CHECKER_VIOLATION');

    const noExpiry = approve(state, { operationId: 'notification_send', params });
    findApproval(state, noExpiry).expiresAt = '';
    const expired = await performExternalAction(state, { actionId: 'notification_send', params, actor: maker, approvalId: noExpiry }, execute);
    assert.equal(expired.error, 'APPROVAL_NOT_ACTIVE');
    assert.equal(expired.status, 'expired');

    const pending = requestApproval(state, { operationId: 'notification_send', params, actor: maker }).approval.approvalId;
    assert.equal((await performExternalAction(state, { actionId: 'notification_send', params, actor: maker, approvalId: pending }, execute)).status, 'pending');
  });
  assert.equal(calls.length, 0);
});

test('gate write: reserves in_flight before execute, settles used, and the approval is single use', async () => {
  const state = createState();
  const params = { invoiceId: 'INV-0001' };
  const approvalId = approve(state, { operationId: 'nic_irn_generate', params });
  const seen = [];
  const execute = async () => {
    seen.push(approvalStatus(findApproval(state, approvalId)));
    return { ok: true, irn: 'IRN-1' };
  };
  await withEnv(LIVE, async () => {
    const out = await performExternalAction(state, { actionId: 'nic_irn_generate', clientId: 'SELF', params, actor: { userId: 'CA ' } }, execute);
    assert.equal(out.ok, true);
    assert.deepEqual(seen, ['in_flight']);
    const approval = findApproval(state, approvalId);
    assert.equal(approvalStatus(approval), 'used');
    assert.equal(approval.usedBy, 'ca');
    const audit = state.auditEvents.at(-1);
    assert.equal(audit.metadata.approvalId, approvalId);
    assert.equal(audit.metadata.actionClass, 'write');
    const again = await performExternalAction(state, { actionId: 'nic_irn_generate', params, actor: maker }, execute);
    assert.equal(again.error, 'APPROVAL_REQUIRED');
  });
  assert.equal(seen.length, 1);
});

test('gate write failure: approval becomes failed, execute ran exactly once, and it cannot be reused', async () => {
  const state = createState();
  const params = { invoiceId: 'INV-0001' };
  for (const outcome of [{ ok: false, error: 'IRN_DUPLICATE' }, new Error('socket hang up'), null]) {
    const approvalId = approve(state, { operationId: 'nic_irn_generate', params });
    const { calls, execute } = counter(outcome);
    await withEnv(LIVE, async () => {
      const out = await performExternalAction(state, { actionId: 'nic_irn_generate', params, actor: maker }, execute);
      assert.equal(out.ok, false);
      assert.equal(calls.length, 1);
      assert.equal(approvalStatus(findApproval(state, approvalId)), 'failed');
      const retry = await performExternalAction(state, { actionId: 'nic_irn_generate', params, actor: maker, approvalId }, execute);
      assert.equal(retry.error, 'APPROVAL_NOT_ACTIVE');
      assert.equal(retry.status, 'failed');
      assert.equal(calls.length, 1);
    });
  }
  assert.match(findApproval(state, 'APR-000002').failureError, /socket hang up/);
});
