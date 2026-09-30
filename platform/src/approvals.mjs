import { createHash } from 'node:crypto';
import { normalizeClientId } from './books.mjs';
import { omitSecrets, redactSecrets } from './secret-keys.mjs';

const APPROVER_ROLES = new Set(['partner', 'reviewer', 'admin']);
const DEFAULT_TTL_MS = 24 * 3600 * 1000;

export function normalizeUserId(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase();
}

export function normalizeActor(actor) {
  const source = actor && typeof actor === 'object' ? actor : {};
  return { userId: normalizeUserId(source.userId), role: normalizeUserId(source.role) };
}

export function canonicalJson(value) {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (typeof value.toJSON === 'function') return canonicalJson(value.toJSON());
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(typeof item === 'function' ? null : item)).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined && typeof value[key] !== 'function').sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function paramsHash(params) {
  return createHash('sha256').update(canonicalJson(omitSecrets(params ?? {}))).digest('hex');
}

export function ensureApprovals(state) {
  state.approvals = Array.isArray(state.approvals) ? state.approvals : [];
  state.approvalSeq = Number(state.approvalSeq || state.approvals.length || 0);
  return state.approvals;
}

export function approvalStatus(approval, now = Date.now()) {
  if (!approval) return 'missing';
  if (approval.status === 'in_flight') return 'in_flight';
  if (approval.status === 'failed') return 'failed';
  if (approval.status === 'used' || approval.usedAt) return 'used';
  if (approval.status === 'rejected') return 'rejected';
  if (approval.status === 'approved') {
    const expires = Date.parse(approval.expiresAt || '');
    return Number.isFinite(expires) && expires >= now ? 'approved' : 'expired';
  }
  return 'pending';
}

export function findApproval(state, approvalId) {
  const key = String(approvalId || '');
  if (!key) return null;
  return (state?.approvals || []).find((a) => a.approvalId === key) || null;
}

export function requestApproval(state, { operationId, clientId = 'SELF', params = {}, actor, requirementId = '', payloadSummary = {}, note = '' } = {}) {
  if (!operationId) return { ok: false, error: 'OPERATION_REQUIRED' };
  const requester = normalizeActor(actor);
  if (!requester.userId) return { ok: false, error: 'REQUESTER_REQUIRED' };
  ensureApprovals(state);
  const approval = {
    approvalId: `APR-${String(++state.approvalSeq).padStart(6, '0')}`,
    operationId: String(operationId),
    requirementId: String(requirementId || ''),
    clientId: normalizeClientId(clientId),
    paramsHash: paramsHash(params),
    paramsPreview: redactSecrets(params ?? {}),
    requestedBy: requester.userId,
    requestedRole: requester.role,
    requestedAt: new Date().toISOString(),
    status: 'pending',
    note: String(note || ''),
    payloadSummary: redactSecrets(payloadSummary ?? {}),
    decidedBy: '',
    decidedRole: '',
    decidedAt: '',
    reason: '',
    usedAt: '',
    usedBy: '',
    expiresAt: '',
  };
  state.approvals.push(approval);
  return { ok: true, approval };
}

export function decideApproval(state, { approvalId, decision, actor, reason = '', ttlMs = DEFAULT_TTL_MS } = {}) {
  ensureApprovals(state);
  const approval = findApproval(state, approvalId);
  if (!approval) return { ok: false, error: 'APPROVAL_NOT_FOUND' };
  if (approvalStatus(approval) !== 'pending') return { ok: false, error: 'APPROVAL_NOT_PENDING', status: approvalStatus(approval) };
  const decider = normalizeActor(actor);
  if (!decider.userId) return { ok: false, error: 'DECIDER_REQUIRED' };
  if (decider.userId === normalizeUserId(approval.requestedBy)) return { ok: false, error: 'MAKER_CHECKER_VIOLATION' };
  if (!APPROVER_ROLES.has(decider.role)) return { ok: false, error: 'APPROVER_ROLE_REQUIRED' };
  const approve = decision === true || String(decision).toLowerCase() === 'approve';
  approval.status = approve ? 'approved' : 'rejected';
  approval.decidedBy = decider.userId;
  approval.decidedRole = decider.role;
  approval.decidedAt = new Date().toISOString();
  approval.reason = String(reason || '');
  if (approve) approval.expiresAt = new Date(Date.now() + ttlMs).toISOString();
  return { ok: true, approval };
}

export function reserveApproval(approval, actor, now = Date.now()) {
  const status = approvalStatus(approval, now);
  if (status !== 'approved') return { ok: false, error: 'APPROVAL_NOT_ACTIVE', status };
  approval.status = 'in_flight';
  approval.reservedAt = new Date(now).toISOString();
  approval.reservedBy = normalizeActor(actor).userId;
  return { ok: true, approval };
}

export function settleApproval(approval, { ok, error = '', actor } = {}) {
  if (!approval || approval.status !== 'in_flight') return { ok: false, error: 'APPROVAL_NOT_IN_FLIGHT' };
  const at = new Date().toISOString();
  const by = normalizeActor(actor).userId;
  if (ok) {
    approval.status = 'used';
    approval.usedAt = at;
    approval.usedBy = by;
  } else {
    approval.status = 'failed';
    approval.failedAt = at;
    approval.failedBy = by;
    approval.failureError = String(error || 'FAILED');
  }
  return { ok: true, approval };
}

export { APPROVER_ROLES };
