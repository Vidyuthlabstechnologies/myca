const APPROVER_ROLES = new Set(['partner', 'reviewer', 'admin']);
const DEFAULT_TTL_MS = 24 * 3600 * 1000;

export function ensureApprovals(state) {
  state.approvals = Array.isArray(state.approvals) ? state.approvals : [];
  state.approvalSeq = Number(state.approvalSeq || state.approvals.length || 0);
  return state.approvals;
}

export function approvalStatus(approval, now = Date.now()) {
  if (!approval) return 'missing';
  if (approval.usedAt) return 'used';
  if (approval.status === 'rejected') return 'rejected';
  if (approval.status === 'approved') {
    if (approval.expiresAt && Date.parse(approval.expiresAt) < now) return 'expired';
    return 'approved';
  }
  return 'pending';
}

export function findApproval(state, approvalId) {
  const key = String(approvalId || '');
  if (!key) return null;
  return (state?.approvals || []).find((a) => a.approvalId === key) || null;
}

export function requestApproval(state, { operationId, requirementId = '', requestedBy = '', payloadSummary = {}, note = '' } = {}) {
  if (!operationId) return { ok: false, error: 'OPERATION_REQUIRED' };
  if (!requestedBy) return { ok: false, error: 'REQUESTER_REQUIRED' };
  ensureApprovals(state);
  const approval = {
    approvalId: `APR-${String(++state.approvalSeq).padStart(6, '0')}`,
    operationId: String(operationId),
    requirementId: String(requirementId || ''),
    requestedBy: String(requestedBy),
    requestedAt: new Date().toISOString(),
    status: 'pending',
    note: String(note || ''),
    payloadSummary,
    decidedBy: '',
    decidedAt: '',
    reason: '',
    usedAt: '',
    usedBy: '',
    expiresAt: '',
  };
  state.approvals.push(approval);
  return { ok: true, approval };
}

export function decideApproval(state, { approvalId, decision, decidedBy, role = '', reason = '', ttlMs = DEFAULT_TTL_MS } = {}) {
  ensureApprovals(state);
  const approval = findApproval(state, approvalId);
  if (!approval) return { ok: false, error: 'APPROVAL_NOT_FOUND' };
  if (approvalStatus(approval) !== 'pending') return { ok: false, error: 'APPROVAL_NOT_PENDING', status: approvalStatus(approval) };
  if (!decidedBy) return { ok: false, error: 'DECIDER_REQUIRED' };
  if (decidedBy === approval.requestedBy) return { ok: false, error: 'MAKER_CHECKER_VIOLATION' };
  if (!APPROVER_ROLES.has(String(role).toLowerCase())) return { ok: false, error: 'APPROVER_ROLE_REQUIRED' };
  const approve = decision === true || String(decision).toLowerCase() === 'approve';
  approval.status = approve ? 'approved' : 'rejected';
  approval.decidedBy = String(decidedBy);
  approval.decidedAt = new Date().toISOString();
  approval.reason = String(reason || '');
  if (approve) approval.expiresAt = new Date(Date.now() + ttlMs).toISOString();
  return { ok: true, approval };
}

export function consumeApproval(state, approvalId, { consumedBy = '' } = {}) {
  const approval = findApproval(state, approvalId);
  if (!approval) return { ok: false, error: 'APPROVAL_NOT_FOUND' };
  if (approvalStatus(approval) !== 'approved') return { ok: false, error: 'APPROVAL_NOT_ACTIVE', status: approvalStatus(approval) };
  approval.usedAt = new Date().toISOString();
  approval.usedBy = String(consumedBy || '');
  return { ok: true, approval };
}

export { APPROVER_ROLES };
