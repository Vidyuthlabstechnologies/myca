import { liveCallsEnabled, mockModeEnabled } from './runtime-config.mjs';
import { appendAuditEvent, stateDigest } from './ca-api.mjs';
import { normalizeClientId } from './books.mjs';
import {
  APPROVER_ROLES,
  approvalStatus,
  findApproval,
  normalizeActor,
  normalizeUserId,
  paramsHash,
  reserveApproval,
  settleApproval,
} from './approvals.mjs';
import { redactSecrets } from './secret-keys.mjs';
import { loadGovtConfig } from './nic-config.mjs';
import { getSandboxClient } from './sandbox-client.mjs';
import { getNimClient } from './nim-client.mjs';
import * as nicClient from './nic-client.mjs';
import { sendNotification } from './notifications.mjs';
import { probeGovt, probeTcp } from './reachability.mjs';

export const DRY_RUN_LIMIT = 200;

function read(family) {
  return Object.freeze({ actionClass: 'read', family, irreversible: false });
}

function write(family, irreversible = false) {
  return Object.freeze({ actionClass: 'write', family, irreversible });
}

export const ACTION_CLASSES = Object.freeze(Object.assign(Object.create(null), {
  gst_taxpayer_generate_otp: write('sandbox_operation', true),
  gst_taxpayer_verify_otp: write('sandbox_operation'),
  gst_gstr2b_recon_submit: read('sandbox_operation'),
  gst_return_status: read('sandbox_operation'),
  gst_save_gstr1: write('sandbox_operation'),
  gst_file_gstr1_evc: write('sandbox_operation', true),
  einvoice_authenticate: write('sandbox_operation'),
  einvoice_generate: write('sandbox_operation', true),
  einvoice_cancel: write('sandbox_operation', true),
  gstin_verify: read('sandbox_operation'),
  income_tax_calculate: read('sandbox_operation'),
  tds_analytics_job: read('sandbox_operation'),
  tds_fvu_generate: write('sandbox_operation'),
  sandbox_status: read('sandbox'),
  validate_gstin_lookup: read('sandbox'),
  nic_auth: read('nic'),
  nic_health: read('nic'),
  nic_gstin_master: read('nic'),
  nic_irn_generate: write('nic', true),
  nic_irn_get: read('nic'),
  nic_irn_get_by_doc: read('nic'),
  nic_irn_cancel: write('nic', true),
  nic_rejected_irns: read('nic'),
  nic_ewb_generate: write('nic', true),
  nic_ewb_get: read('nic'),
  govt_probe: read('govt'),
  notification_send: write('notification', true),
  nim_ask: read('nim'),
  nim_status: read('nim'),
  provider_doctor_ping: read('provider'),
}));

const LIVE_ONLY = Object.freeze({ mock: false });

const TRANSPORTS = Object.freeze({
  get sandbox() {
    return getSandboxClient();
  },
  get nim() {
    return getNimClient();
  },
  nic: Object.freeze({
    authenticate: () => nicClient.nicAuthenticate(loadGovtConfig(), undefined, LIVE_ONLY),
    health: () => nicClient.nicHealth(loadGovtConfig(), undefined, LIVE_ONLY),
    gstinMaster: (gstin) => nicClient.nicGstinMaster(gstin, loadGovtConfig(), undefined, LIVE_ONLY),
    generateIrn: (state, invoiceId) => nicClient.nicGenerateIrn(state, invoiceId, undefined, LIVE_ONLY),
    cancelIrn: (state, input) => nicClient.nicCancelIrn(state, input, undefined, LIVE_ONLY),
    getIrn: (irn) => nicClient.nicGetIrn(irn, loadGovtConfig(), undefined, LIVE_ONLY),
    getIrnByDoc: (input) => nicClient.nicGetIrnByDoc(input, loadGovtConfig(), undefined, LIVE_ONLY),
    rejectedIrns: (date) => nicClient.nicGetRejectedIrns(date, loadGovtConfig(), undefined, LIVE_ONLY),
    generateEwayBill: (payload) => nicClient.nicGenerateEwayBill(payload, loadGovtConfig(), undefined, LIVE_ONLY),
    getEwayBill: (irn) => nicClient.nicGetEwayBill(irn, loadGovtConfig(), undefined, LIVE_ONLY),
  }),
  notifications: Object.freeze({
    send: (state, messageId) => sendNotification(state, messageId, LIVE_ONLY),
  }),
  reachability: Object.freeze({
    probeGovt: () => probeGovt(),
    probeTcp: (host, port) => probeTcp(host, port),
  }),
});

function auditName(actionId, entry) {
  return `${entry.family === 'sandbox_operation' ? 'sandbox' : 'external'}.${actionId}`;
}

function digest(state) {
  return state ? stateDigest(state) : null;
}

function refusal(action, error, extra = {}) {
  return { ok: false, error, actionId: action.actionId, clientId: action.clientId, paramsHash: action.paramsHash, ...extra };
}

function recordAudit(action, { beforeHash, result, approvalId = '', mock = false }) {
  if (!action.state) return;
  appendAuditEvent(action.state, {
    actorId: action.actor.userId || 'system',
    clientId: action.clientId,
    action: auditName(action.actionId, action.entry),
    beforeHash,
    afterHash: stateDigest(action.state),
    metadata: {
      ...action.metadata,
      actionId: action.actionId,
      actionClass: action.entry.actionClass,
      irreversible: action.entry.irreversible,
      paramsHash: action.paramsHash,
      approvalId,
      caApprovalRequired: action.entry.actionClass === 'write' && !mock,
      ok: result.ok === true,
      error: result.ok === true ? '' : String(result.error || ''),
      mock,
    },
  });
}

function appendDryRun(state, record) {
  if (!Array.isArray(state.dryRuns)) state.dryRuns = [];
  state.dryRunSeq = Number(state.dryRunSeq || 0) + 1;
  const stored = { dryRunId: `DRY-${String(state.dryRunSeq).padStart(6, '0')}`, ...record };
  state.dryRuns.push(stored);
  if (state.dryRuns.length > DRY_RUN_LIMIT) state.dryRuns.splice(0, state.dryRuns.length - DRY_RUN_LIMIT);
  return stored;
}

function recordDryRun(action, payload) {
  const record = {
    actionId: action.actionId,
    actionClass: action.entry.actionClass,
    clientId: action.clientId,
    paramsHash: action.paramsHash,
    payload: redactSecrets(payload ?? {}),
    actorId: action.actor.userId,
    at: new Date().toISOString(),
  };
  const stored = action.state ? appendDryRun(action.state, record) : record;
  return refusal(action, 'LIVE_CALLS_DISABLED', {
    dryRunId: stored.dryRunId || '',
    hint: 'Set MYCA_ENABLE_LIVE_CALLS=1 in platform/.env to allow outbound calls. Nothing was sent; the payload was kept as a dry run.',
  });
}

async function runFixture(action, fixture) {
  if (typeof fixture !== 'function') {
    return refusal(action, 'NOT_IMPLEMENTED', { hint: 'This action has no mock fixture yet.' });
  }
  const beforeHash = digest(action.state);
  let result;
  try {
    result = await fixture();
  } catch (err) {
    result = { ok: false, error: String(err?.message || err) };
  }
  const tagged = { ...(result && typeof result === 'object' ? result : { ok: false, error: 'INVALID_FIXTURE_RESULT' }), mock: true };
  recordAudit(action, { beforeHash, result: tagged, mock: true });
  return tagged;
}

function checkApproval(action, approval) {
  if (approval.operationId !== action.actionId) return refusal(action, 'APPROVAL_OPERATION_MISMATCH', { approvalId: approval.approvalId });
  if (String(approval.clientId || '') !== action.clientId) return refusal(action, 'APPROVAL_CLIENT_MISMATCH', { approvalId: approval.approvalId });
  if (approval.paramsHash !== action.paramsHash) return refusal(action, 'APPROVAL_PARAMS_MISMATCH', { approvalId: approval.approvalId });
  const status = approvalStatus(approval);
  if (status !== 'approved') return refusal(action, 'APPROVAL_NOT_ACTIVE', { approvalId: approval.approvalId, status });
  const approver = normalizeUserId(approval.decidedBy);
  if (!approver || approver === normalizeUserId(approval.requestedBy)) return refusal(action, 'MAKER_CHECKER_VIOLATION', { approvalId: approval.approvalId });
  if (!APPROVER_ROLES.has(normalizeUserId(approval.decidedRole))) return refusal(action, 'APPROVER_ROLE_REQUIRED', { approvalId: approval.approvalId });
  return { ok: true, approval };
}

function claimApproval(action, approvalId) {
  let checked;
  if (approvalId) {
    const approval = findApproval(action.state, approvalId);
    checked = approval ? checkApproval(action, approval) : refusal(action, 'APPROVAL_NOT_FOUND', { approvalId: String(approvalId) });
  } else {
    const candidates = (action.state?.approvals || []).filter((a) => a.operationId === action.actionId
      && String(a.clientId || '') === action.clientId
      && a.paramsHash === action.paramsHash);
    checked = candidates.map((a) => checkApproval(action, a)).find((c) => c.ok)
      || refusal(action, 'APPROVAL_REQUIRED', { hint: 'Request an approval for this action, client and exact params; a different user with a reviewer role must approve it.' });
  }
  if (!checked.ok) return checked;
  const reserved = reserveApproval(checked.approval, action.actor);
  return reserved.ok ? reserved : refusal(action, reserved.error, { approvalId: checked.approval.approvalId, status: reserved.status });
}

export async function performExternalAction(state, request = {}, execute) {
  const actionId = String(request.actionId || '');
  const entry = Object.hasOwn(ACTION_CLASSES, actionId) ? ACTION_CLASSES[actionId] : null;
  if (!entry) return { ok: false, error: 'UNKNOWN_EXTERNAL_ACTION', actionId };
  if (typeof execute !== 'function') return { ok: false, error: 'EXECUTOR_REQUIRED', actionId };
  const params = request.params ?? {};
  const action = {
    state: state || null,
    actionId,
    entry,
    clientId: normalizeClientId(request.clientId),
    actor: normalizeActor(request.actor),
    paramsHash: paramsHash(params),
    metadata: redactSecrets(request.metadata || {}),
  };

  if (mockModeEnabled()) return runFixture(action, request.fixture);

  const rejected = typeof request.preflight === 'function' ? await request.preflight() : null;
  if (rejected) return rejected;

  if (!liveCallsEnabled()) return recordDryRun(action, request.payload ?? params);

  const beforeHash = digest(action.state);
  const claim = entry.actionClass === 'write' ? claimApproval(action, request.approvalId) : { ok: true, approval: null };
  if (!claim.ok) return claim;

  let result;
  try {
    result = await execute(TRANSPORTS);
  } catch (err) {
    result = { ok: false, error: String(err?.message || err) };
  }
  if (!result || typeof result !== 'object') result = { ok: false, error: 'INVALID_TRANSPORT_RESULT' };
  if (claim.approval) settleApproval(claim.approval, { ok: result.ok === true, error: result.error, actor: action.actor });
  recordAudit(action, { beforeHash, result, approvalId: claim.approval?.approvalId || '' });
  return result;
}
