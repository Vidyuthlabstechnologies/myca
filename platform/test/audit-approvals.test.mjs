import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import {
  requestApproval,
  decideApproval,
  approvalStatus,
  findApproval,
  paramsHash,
  canonicalJson,
  normalizeActor,
  reserveApproval,
  settleApproval,
} from '../src/approvals.mjs';

const maker = { userId: 'ca', role: 'staff' };
const partner = { userId: 'partner1', role: 'partner' };

test('H8: maker-checker compares normalised user ids, so ca and CA are the same person', () => {
  const state = createState();
  const req = requestApproval(state, { operationId: 'gst_file_gstr1_evc', clientId: 'SELF', params: { period: '2026-08' }, actor: maker });
  assert.equal(req.ok, true);
  for (const userId of ['CA', ' ca ', 'Ｃａ']) {
    const out = decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId, role: 'partner' } });
    assert.equal(out.error, 'MAKER_CHECKER_VIOLATION', userId);
  }
  assert.equal(normalizeActor({ userId: '  Partner1 ', role: 'PARTNER' }).userId, 'partner1');
  assert.equal(normalizeActor({ userId: '  Partner1 ', role: 'PARTNER' }).role, 'partner');
});

test('H8: an approval records the client and a hash of the exact parameters', () => {
  const state = createState();
  const req = requestApproval(state, {
    operationId: 'einvoice_authenticate',
    clientId: 'c2',
    params: { gstin: '27AABCU9603R1ZN', username: 'api', password: 'Secret#1' },
    actor: maker,
  });
  assert.equal(req.approval.clientId, 'C2');
  assert.equal(req.approval.paramsHash, paramsHash({ username: 'api', gstin: '27AABCU9603R1ZN' }));
  assert.equal(req.approval.requestedBy, 'ca');
  assert.equal(JSON.stringify(req.approval).includes('Secret#1'), false);
  assert.equal(req.approval.paramsPreview.password, '[REDACTED]');
});

test('paramsHash is canonical over key order and ignores secret values', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: 'x' } }), '{"a":{"c":"x","d":[2,{"y":2,"z":1}]},"b":1}');
  assert.equal(paramsHash({ period: '2026-08', gstin: 'X' }), paramsHash({ gstin: 'X', period: '2026-08' }));
  assert.notEqual(paramsHash({ period: '2026-08' }), paramsHash({ period: '2026-11' }));
  assert.equal(paramsHash({ period: '2026-08', otp: '111111' }), paramsHash({ period: '2026-08', otp: '222222' }));
  assert.equal(paramsHash({ period: '2026-08', otp: '111111' }), paramsHash({ period: '2026-08' }));
  assert.match(paramsHash({}), /^[0-9a-f]{64}$/);
});

test('H8: an approved approval with no expiry counts as expired', () => {
  const state = createState();
  const req = requestApproval(state, { operationId: 'einvoice_cancel', params: {}, actor: maker });
  const decided = decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: partner });
  assert.equal(approvalStatus(decided.approval), 'approved');
  decided.approval.expiresAt = '';
  assert.equal(approvalStatus(decided.approval), 'expired');
  delete decided.approval.expiresAt;
  assert.equal(approvalStatus(decided.approval), 'expired');
});

test('decideApproval records the approver id and role from the actor', () => {
  const state = createState();
  const req = requestApproval(state, { operationId: 'einvoice_cancel', params: {}, actor: maker });
  assert.equal(decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'rev', role: 'clerk' } }).error, 'APPROVER_ROLE_REQUIRED');
  assert.equal(decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: '', role: 'partner' } }).error, 'DECIDER_REQUIRED');
  const decided = decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'Partner1', role: 'Partner' } });
  assert.equal(decided.approval.decidedBy, 'partner1');
  assert.equal(decided.approval.decidedRole, 'partner');
});

test('reserve marks in_flight; settle marks used or failed, and neither is approved again', () => {
  const state = createState();
  const ids = ['used', 'failed'].map(() => {
    const req = requestApproval(state, { operationId: 'einvoice_generate', params: { invoiceId: 'INV-0001' }, actor: maker });
    decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: partner });
    return req.approval.approvalId;
  });
  const [usedId, failedId] = ids;
  assert.equal(reserveApproval(findApproval(state, usedId), { userId: 'ca' }).ok, true);
  assert.equal(approvalStatus(findApproval(state, usedId)), 'in_flight');
  assert.equal(reserveApproval(findApproval(state, usedId), { userId: 'ca' }).error, 'APPROVAL_NOT_ACTIVE');
  settleApproval(findApproval(state, usedId), { ok: true, actor: { userId: 'ca' } });
  assert.equal(approvalStatus(findApproval(state, usedId)), 'used');
  assert.equal(findApproval(state, usedId).usedBy, 'ca');

  reserveApproval(findApproval(state, failedId), { userId: 'ca' });
  settleApproval(findApproval(state, failedId), { ok: false, error: 'IRN_FAILED', actor: { userId: 'ca' } });
  assert.equal(approvalStatus(findApproval(state, failedId)), 'failed');
  assert.equal(findApproval(state, failedId).failureError, 'IRN_FAILED');
  assert.equal(reserveApproval(findApproval(state, failedId), { userId: 'ca' }).error, 'APPROVAL_NOT_ACTIVE');
});
