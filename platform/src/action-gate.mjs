import { createHash } from 'node:crypto';
import { channelPullsEnabled, liveCallsEnabled, loadEnvFile, mockModeEnabled, testModeEnabled } from './runtime-config.mjs';
import { appendAuditEvent, stateDigest } from './ca-api.mjs';
import { normalizeClientId } from './books.mjs';
import { BOOK_KEYS } from './book-view.mjs';
import {
  APPROVER_ROLES,
  approvalStatus,
  canonicalJson,
  findApproval,
  normalizeActor,
  normalizeUserId,
  paramsHash,
  reserveApproval,
  settleApproval,
} from './approvals.mjs';
import { redactSecrets } from './secret-keys.mjs';
import { loadGovtConfig } from './nic-config.mjs';
import { SandboxClient, getSandboxClient } from './sandbox-client.mjs';
import { NimClient, getNimClient } from './nim-client.mjs';
import * as nicClient from './nic-client.mjs';
import { sendNotification } from './notifications.mjs';
import { probeGovt, probeTcp } from './reachability.mjs';
import { getChannelClient } from './channel-client.mjs';
import { sendToTally } from './tally-client.mjs';
import { IrsMefClient, getIrsMefClient } from './us-mef-client.mjs';

export const DRY_RUN_LIMIT = 200;

const MINUTE_MS = 60000;
const ASSISTANT = 'assistant';
const MOCK_FIELD = /^(mock|simulated)/;
const FIXTURE_SKIP = new Set(['files', 'pendingFile', 'auditEvents', 'auditSeq', 'dryRuns', 'dryRunSeq', '_legacyFiles', '_documents', '_dataDir', 'ledger', 'extraBooks', 'firmUsers']);

function entry(actionClass, family, uses, { irreversible = false, timeoutMs = MINUTE_MS, local = false } = {}) {
  return Object.freeze({ actionClass, family, irreversible, local, uses: Object.freeze([...uses]), timeoutMs });
}

function read(family, uses, options) {
  return entry('read', family, uses, options);
}

function write(family, uses, options) {
  return entry('write', family, uses, options);
}

const IRREVERSIBLE = { irreversible: true };
const PROBE = { timeoutMs: 90000 };
const MODEL = { timeoutMs: 2 * MINUTE_MS };
const LOCAL_APP = { local: true, timeoutMs: 30000 };

export const ACTION_CLASSES = Object.freeze(Object.assign(Object.create(null), {
  gst_taxpayer_generate_otp: write('sandbox_operation', ['sandbox.generateTaxpayerOtp'], IRREVERSIBLE),
  gst_taxpayer_verify_otp: write('sandbox_operation', ['sandbox.verifyTaxpayerOtp']),
  gst_gstr2b_recon_submit: read('sandbox_operation', ['sandbox.submitGstr2bReconJob']),
  gst_return_status: read('sandbox_operation', ['sandbox.trackGstrs']),
  gst_save_gstr1: write('sandbox_operation', ['sandbox.saveGstr1']),
  gst_file_gstr1_evc: write('sandbox_operation', ['sandbox.fileGstr1'], IRREVERSIBLE),
  gst_gstr1_processing: read('sandbox_operation', ['sandbox.returnProcessingStatus']),
  gst_save_gstr3b: write('sandbox_operation', ['sandbox.saveGstr3b']),
  gst_gstr3b_liability: read('sandbox_operation', ['sandbox.gstr3bAutoLiability']),
  gst_gstr3b_offset: write('sandbox_operation', ['sandbox.offsetGstr3bLiability'], IRREVERSIBLE),
  gst_file_gstr3b_evc: write('sandbox_operation', ['sandbox.fileGstr3b'], IRREVERSIBLE),
  gst_gstr1_proceed: write('sandbox_operation', ['sandbox.newProceedGstr1']),
  gst_gstr1_summary: read('sandbox_operation', ['sandbox.gstr1Summary']),
  gst_evc_otp: write('sandbox_operation', ['sandbox.generateEvcOtp']),
  einvoice_authenticate: write('sandbox_operation', ['sandbox.einvoiceAuthenticate']),
  einvoice_generate: write('sandbox_operation', ['sandbox.generateEinvoice'], IRREVERSIBLE),
  einvoice_cancel: write('sandbox_operation', ['sandbox.cancelEinvoice'], IRREVERSIBLE),
  gstin_verify: read('sandbox_operation', ['sandbox.searchGstin']),
  income_tax_calculate: read('sandbox_operation', []),
  tds_analytics_job: read('sandbox_operation', ['sandbox.submitTdsAnalyticsJob']),
  tds_fvu_generate: write('sandbox_operation', ['sandbox.submitTdsFvuJob']),
  sandbox_status: read('sandbox', ['sandbox.ping']),
  validate_gstin_lookup: read('sandbox', ['sandbox.searchGstin']),
  nic_auth: write('nic', ['nic.authenticate']),
  nic_health: read('nic', ['nic.health']),
  nic_gstin_master: read('nic', ['nic.gstinMaster']),
  nic_irn_generate: write('nic', ['nic.generateIrn'], IRREVERSIBLE),
  nic_irn_get: read('nic', ['nic.getIrn']),
  nic_irn_get_by_doc: read('nic', ['nic.getIrnByDoc']),
  nic_irn_cancel: write('nic', ['nic.cancelIrn'], IRREVERSIBLE),
  nic_rejected_irns: read('nic', ['nic.rejectedIrns']),
  nic_ewb_generate: write('nic', ['nic.generateEwayBill'], IRREVERSIBLE),
  nic_ewb_get: read('nic', ['nic.getEwayBill']),
  nic_ewb_cancel: write('nic', ['nic.cancelEwayBill'], IRREVERSIBLE),
  govt_probe: read('govt', ['reachability.probeGovt'], PROBE),
  notification_send: write('notification', ['notifications.send'], IRREVERSIBLE),
  nim_ask: read('nim', ['nim.complete'], MODEL),
  knowledge_answer: read('nim', ['nim.complete'], MODEL),
  tax_answer: read('nim', ['nim.complete'], MODEL),
  nim_status: read('nim', ['nim.ping']),
  dsc_sign: write('dsc', [], IRREVERSIBLE),
  tally_push: write('tally', ['tally.send'], LOCAL_APP),
  provider_doctor_ping: read('provider', ['sandbox.ping', 'nim.ping', 'reachability.probeTally'], PROBE),
  channel_fetch_report: read('channel', ['channel.pull'], { timeoutMs: 12 * MINUTE_MS }),
  zoho_push_invoices: write('channel', ['channel.zoho'], { timeoutMs: 10 * MINUTE_MS }),
  plaid_link: read('channel', ['channel.plaid']),
  taxjar_rate: read('channel', ['channel.taxjar']),
  gusto_token: read('channel', ['channel.gusto']),
  track1099_read: read('channel', ['channel.track1099']),
  track1099_import: write('channel', ['channel.track1099'], { timeoutMs: 5 * MINUTE_MS }),
  irs_mef_send: write('irs', ['irs.sendSubmissions'], { irreversible: true, timeoutMs: 3 * MINUTE_MS }),
  irs_mef_acks: read('irs', ['irs.getAcks'], { timeoutMs: 2 * MINUTE_MS }),
}));

function transportOptions(ctx) {
  return { mock: false, signal: ctx.signal };
}

function configValue(name) {
  return String(process.env[name] ?? loadEnvFile()[name] ?? '').trim();
}

const NIC_TRANSPORT = Object.freeze({
  authenticate: (ctx) => () => nicClient.nicAuthenticate(loadGovtConfig(), undefined, transportOptions(ctx)),
  health: (ctx) => () => nicClient.nicHealth(loadGovtConfig(), undefined, transportOptions(ctx)),
  gstinMaster: (ctx) => (gstin) => nicClient.nicGstinMaster(gstin, loadGovtConfig(), undefined, transportOptions(ctx)),
  generateIrn: (ctx) => (state, invoiceId) => nicClient.nicGenerateIrn(state, invoiceId, undefined, transportOptions(ctx)),
  cancelIrn: (ctx) => (state, input) => nicClient.nicCancelIrn(state, input, undefined, transportOptions(ctx)),
  getIrn: (ctx) => (irn) => nicClient.nicGetIrn(irn, loadGovtConfig(), undefined, transportOptions(ctx)),
  getIrnByDoc: (ctx) => (input) => nicClient.nicGetIrnByDoc(input, loadGovtConfig(), undefined, transportOptions(ctx)),
  rejectedIrns: (ctx) => (date) => nicClient.nicGetRejectedIrns(date, loadGovtConfig(), undefined, transportOptions(ctx)),
  generateEwayBill: (ctx) => (payload) => nicClient.nicGenerateEwayBill(payload, loadGovtConfig(), undefined, transportOptions(ctx)),
  getEwayBill: (ctx) => (irn) => nicClient.nicGetEwayBill(irn, loadGovtConfig(), undefined, transportOptions(ctx)),
  cancelEwayBill: (ctx) => (input) => nicClient.nicCancelEwayBill(input, undefined, transportOptions(ctx)),
});

const NOTIFICATION_TRANSPORT = Object.freeze({
  send: (ctx) => (state, messageId) => sendNotification(state, messageId, transportOptions(ctx)),
});

const REACHABILITY_TRANSPORT = Object.freeze({
  probeGovt: (ctx) => () => probeGovt(undefined, { signal: ctx.signal }),
  probeTally: (ctx) => () => {
    const host = configValue('MYCA_TALLY_HOST');
    const port = Number(configValue('MYCA_TALLY_PORT') || 0);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return { status: 'skipped', reason: 'MYCA_TALLY_HOST/PORT not set' };
    return probeTcp(host, port, 1500, { signal: ctx.signal });
  },
});

const CHANNEL_TRANSPORT = Object.freeze({
  pull: (ctx) => (request) => {
    const client = signalled(getChannelClient(), ctx.signal);
    if (request.channel === 'amazon') return client.amazonReport(request, ctx.signal);
    if (request.channel === 'shopify') return client.shopify(request, ctx.signal);
    if (request.channel === 'razorpay') return client.razorpay(request, ctx.signal);
    if (request.channel === 'plaid') return client.plaid({ ...request, op: 'sync' }, ctx.signal);
    if (request.channel === 'gusto') return client.gusto({ ...request, op: 'payrolls' }, ctx.signal);
    return { ok: false, error: 'UNKNOWN_CONNECTOR' };
  },
  zoho: (ctx) => (request) => signalled(getChannelClient(), ctx.signal).zoho(request, ctx.signal),
  plaid: (ctx) => (request) => signalled(getChannelClient(), ctx.signal).plaid(request, ctx.signal),
  taxjar: (ctx) => (request) => signalled(getChannelClient(), ctx.signal).taxjar(request, ctx.signal),
  gusto: (ctx) => (request) => signalled(getChannelClient(), ctx.signal).gusto(request, ctx.signal),
  track1099: (ctx) => (request) => signalled(getChannelClient(), ctx.signal).track1099(request, ctx.signal),
});

const TALLY_TRANSPORT = Object.freeze({
  send: (ctx) => (url, xml) => sendToTally(url, xml, ctx.signal),
});

const TRANSPORT_TABLES = Object.freeze({
  tally: TALLY_TRANSPORT,
  nic: NIC_TRANSPORT,
  channel: CHANNEL_TRANSPORT,
  notifications: NOTIFICATION_TRANSPORT,
  reachability: REACHABILITY_TRANSPORT,
});

const TRANSPORT_CLIENTS = Object.freeze({
  sandbox: { Client: SandboxClient, current: getSandboxClient },
  nim: { Client: NimClient, current: getNimClient },
  irs: { Client: IrsMefClient, current: getIrsMefClient },
});

function signalled(client, signal) {
  const fetchFn = (url, init = {}) => client.fetchFn(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal });
  return new Proxy(client, {
    get: (target, key) => (key === 'fetchFn' ? fetchFn : Reflect.get(target, key)),
    set: (target, key, value) => Reflect.set(target, key, value),
  });
}

function resolveTransport(use) {
  const [group, name] = String(use).split('.');
  let bind = null;
  if (Object.hasOwn(TRANSPORT_CLIENTS, group)) {
    const { Client, current } = TRANSPORT_CLIENTS[group];
    if (typeof Client.prototype[name] === 'function') bind = (ctx) => (...args) => signalled(current(), ctx.signal)[name](...args);
  } else if (Object.hasOwn(TRANSPORT_TABLES, group) && Object.hasOwn(TRANSPORT_TABLES[group], name)) {
    bind = TRANSPORT_TABLES[group][name];
  }
  if (!bind) throw new Error(`UNKNOWN_TRANSPORT:${use}`);
  return { group, name, bind };
}

const TRANSPORT_BY_USE = new Map(Object.values(ACTION_CLASSES).flatMap((item) => item.uses).map((use) => [use, resolveTransport(use)]));

function scopedTransports(uses, ctx) {
  const groups = {};
  for (const use of uses) {
    const { group, name, bind } = TRANSPORT_BY_USE.get(use);
    groups[group] = { ...(groups[group] || {}), [name]: bind(ctx) };
  }
  return Object.freeze(Object.fromEntries(Object.entries(groups).map(([group, fns]) => [group, Object.freeze(fns)])));
}

function publicUrl(value) {
  try {
    const url = new URL(String(value || ''));
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function nicSessionStatus() {
  return nicClient.nicSession();
}

export function providerInfo() {
  const sandbox = new SandboxClient();
  const nim = new NimClient();
  return {
    sandbox: {
      configured: sandbox.isConfigured(),
      baseUrl: publicUrl(sandbox.baseUrl),
      environment: sandbox.environment,
      keySource: sandbox.keySource,
    },
    nim: {
      configured: nim.isConfigured(),
      baseUrl: publicUrl(nim.baseUrl),
      model: String(nim.defaultModel || ''),
    },
  };
}

function errorText(err) {
  return String(err?.message || err || 'EXTERNAL_ACTION_FAILED').slice(0, 300);
}

function refusal(action, error, extra = {}) {
  return { ok: false, error, actionId: action.actionId, clientId: action.clientId, paramsHash: action.paramsHash, ...extra };
}

function auditName(actionId, item) {
  return `${item.family === 'sandbox_operation' ? 'sandbox' : 'external'}.${actionId}`;
}

function isPlainJson(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.every((item) => item !== undefined && isPlainJson(item, seen));
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    if (Object.getOwnPropertySymbols(value).length) return false;
    return Object.keys(value).every((key) => value[key] === undefined || isPlainJson(value[key], seen));
  } finally {
    seen.delete(value);
  }
}

function payloadHash(payload) {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function recordAudit(action, { beforeHash, result, approvalId = '', mock = false, extra = {} }) {
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
      error: result.ok === true ? '' : errorText(result.error),
      outcomeUnknown: result.outcomeUnknown === true,
      mock,
      ...extra,
    },
  });
}

function appendDryRun(state, record) {
  if (!Array.isArray(state.dryRuns)) state.dryRuns = [];
  state.dryRunSeq = Number(state.dryRunSeq || 0) + 1;
  const stored = { dryRunId: `DRY-${String(state.dryRunSeq).padStart(6, '0')}`, ...record };
  state.dryRuns.push(stored);
  while (state.dryRuns.length > DRY_RUN_LIMIT) {
    const oldestRead = state.dryRuns.findIndex((item) => item.actionClass !== 'write');
    state.dryRuns.splice(oldestRead >= 0 ? oldestRead : 0, 1);
  }
  return stored;
}

export const TEST_MODE_FAMILIES = Object.freeze(new Set(['sandbox', 'sandbox_operation', 'nic', 'govt', 'provider', 'nim', 'irs']));

function recordDryRun(action, payload, reason = 'LIVE_CALLS_DISABLED') {
  const beforeHash = stateDigest(action.state);
  const stored = appendDryRun(action.state, {
    actionId: action.actionId,
    actionClass: action.entry.actionClass,
    clientId: action.clientId,
    paramsHash: action.paramsHash,
    payload: redactSecrets(payload ?? {}),
    actorId: action.actor.userId,
    at: new Date().toISOString(),
  });
  const hosted = String(process.env.MYCA_HOSTED || '').trim() === '1';
  const hint = reason === 'TEST_MODE_HELD'
    ? 'Test mode: this action has no sandbox, so nothing was sent. The prepared payload was kept as a dry run; it runs only in live mode.'
    : hosted
      ? 'Nothing was sent: government and provider calls are switched off on this MyCA service. The prepared payload was kept as a dry run.'
      : 'Set MYCA_PROVIDER_ENV=test (sandbox hosts) or live in platform/.env to allow outbound calls. Nothing was sent; the payload was kept as a dry run.';
  const result = refusal(action, reason, { dryRunId: stored.dryRunId, hint });
  recordAudit(action, { beforeHash, result, extra: { dryRunId: stored.dryRunId, payloadHash: payloadHash(stored.payload) } });
  return result;
}

function withoutMockFields(value) {
  if (Array.isArray(value)) return value.map(withoutMockFields);
  if (!value || typeof value !== 'object' || value instanceof Map || value instanceof Set || ArrayBuffer.isView(value)) return value;
  const out = {};
  for (const key of Object.keys(value)) if (!MOCK_FIELD.test(key)) out[key] = withoutMockFields(value[key]);
  return out;
}

function fixtureFields(state) {
  const out = {};
  for (const key of new Set([...Object.keys(state), ...BOOK_KEYS])) {
    if (FIXTURE_SKIP.has(key) || state[key] === undefined) continue;
    out[key] = state[key];
  }
  return out;
}

function realFingerprint(fields) {
  return canonicalJson(withoutMockFields(fields));
}

function isRecord(value) {
  return value !== null && typeof value === 'object';
}

function mergeMockFields(target, source) {
  if (Array.isArray(source)) {
    source.forEach((item, index) => {
      if (isRecord(item) && isRecord(target[index])) mergeMockFields(target[index], item);
    });
    return;
  }
  for (const key of Object.keys(source)) {
    if (MOCK_FIELD.test(key)) {
      if (canonicalJson(target[key]) !== canonicalJson(source[key])) target[key] = source[key];
    } else if (isRecord(source[key]) && isRecord(target[key])) {
      mergeMockFields(target[key], source[key]);
    }
  }
  for (const key of Object.keys(target)) {
    if (MOCK_FIELD.test(key) && !Object.hasOwn(source, key)) delete target[key];
  }
}

async function runFixture(action, fixture) {
  if (typeof fixture !== 'function') {
    return refusal(action, 'NOT_IMPLEMENTED', { mock: true, hint: 'This action has no mock fixture yet.' });
  }
  const beforeHash = stateDigest(action.state);
  const realBefore = realFingerprint(fixtureFields(action.state));
  let copy;
  try {
    copy = structuredClone(fixtureFields(action.state));
  } catch {
    return refusal(action, 'MOCK_STATE_NOT_CLONEABLE', { mock: true });
  }
  let result;
  try {
    result = await fixture(copy);
  } catch (err) {
    result = { ok: false, error: errorText(err) };
  }
  let tagged = { ...(isRecord(result) ? result : { ok: false, error: 'INVALID_FIXTURE_RESULT' }), mock: true };
  if (realFingerprint(copy) !== realBefore || realFingerprint(fixtureFields(action.state)) !== realBefore) {
    tagged = refusal(action, 'MOCK_WROTE_REAL_FIELDS', { mock: true, hint: 'A mock fixture may only write mock* or simulated* fields.' });
  } else {
    try {
      mergeMockFields(action.state, copy);
    } catch (err) {
      tagged = refusal(action, 'MOCK_MERGE_FAILED', { mock: true, detail: errorText(err) });
    }
  }
  recordAudit(action, { beforeHash, result: tagged, mock: true });
  return tagged;
}

function checkApproval(action, approval) {
  const approvalId = approval.approvalId;
  if (approval.operationId !== action.actionId) return refusal(action, 'APPROVAL_OPERATION_MISMATCH', { approvalId });
  if (String(approval.clientId || '') !== action.clientId) return refusal(action, 'APPROVAL_CLIENT_MISMATCH', { approvalId });
  if (approval.paramsHash !== action.paramsHash) return refusal(action, 'APPROVAL_PARAMS_MISMATCH', { approvalId });
  const status = approvalStatus(approval);
  if (status !== 'approved') return refusal(action, 'APPROVAL_NOT_ACTIVE', { approvalId, status });
  const approver = normalizeUserId(approval.decidedBy);
  if (approver === ASSISTANT) return refusal(action, 'ASSISTANT_CANNOT_APPROVE', { approvalId });
  if (!approver || approver === normalizeUserId(approval.requestedBy)) return refusal(action, 'MAKER_CHECKER_VIOLATION', { approvalId });
  if (!APPROVER_ROLES.has(normalizeUserId(approval.decidedRole))) return refusal(action, 'APPROVER_ROLE_REQUIRED', { approvalId });
  return { ok: true, approval };
}

function claimApproval(action, approvalId) {
  if (!action.actor.userId) return refusal(action, 'ACTOR_REQUIRED');
  if (action.actor.userId === ASSISTANT) return refusal(action, 'ASSISTANT_BLOCKED_FOR_OPERATION');
  let checked;
  if (approvalId) {
    const approval = findApproval(action.state, approvalId);
    checked = approval ? checkApproval(action, approval) : refusal(action, 'APPROVAL_NOT_FOUND', { approvalId: String(approvalId) });
  } else {
    const candidates = (action.state.approvals || []).filter((a) => a.operationId === action.actionId
      && String(a.clientId || '') === action.clientId
      && a.paramsHash === action.paramsHash);
    checked = candidates.map((a) => checkApproval(action, a)).find((c) => c.ok)
      || refusal(action, 'APPROVAL_REQUIRED', { hint: 'Request an approval for this action, client and exact params; a different user with a reviewer role must approve it.' });
  }
  if (!checked.ok) return checked;
  const reserved = reserveApproval(checked.approval, action.actor);
  return reserved.ok ? reserved : refusal(action, reserved.error, { approvalId: checked.approval.approvalId, status: reserved.status });
}

function deadlineFor(item, requested) {
  const asked = Number(requested);
  return Number.isFinite(asked) && asked > 0 ? Math.min(item.timeoutMs, Math.ceil(asked)) : item.timeoutMs;
}

async function runWithDeadline(action, execute, timeoutMs) {
  const controller = new AbortController();
  const ctx = Object.freeze({
    actionId: action.actionId,
    clientId: action.clientId,
    irreversible: action.entry.irreversible,
    timeoutMs,
    signal: controller.signal,
  });
  let timer;
  const expired = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new Error('EXTERNAL_TIMEOUT'));
      resolve({ ok: false, error: 'EXTERNAL_TIMEOUT', outcomeUnknown: true });
    }, timeoutMs);
  });
  const attempt = (async () => execute(scopedTransports(action.entry.uses, ctx), ctx))()
    .then((result) => (isRecord(result) ? result : { ok: false, error: 'INVALID_TRANSPORT_RESULT' }))
    .catch((err) => ({ ok: false, error: errorText(err) }));
  try {
    return await Promise.race([attempt, expired]);
  } finally {
    clearTimeout(timer);
  }
}

export async function performExternalAction(state, request = {}, execute) {
  const actionId = String(request?.actionId || '');
  const item = Object.hasOwn(ACTION_CLASSES, actionId) ? ACTION_CLASSES[actionId] : null;
  if (!item) return { ok: false, error: 'UNKNOWN_EXTERNAL_ACTION', actionId };
  if (typeof execute !== 'function') return { ok: false, error: 'EXECUTOR_REQUIRED', actionId };
  if (!isRecord(state)) return { ok: false, error: 'STATE_REQUIRED', actionId };
  const actor = normalizeActor(request.actor);
  if (item.actionClass === 'write' && actor.userId === ASSISTANT) {
    return { ok: false, error: 'ASSISTANT_BLOCKED_FOR_OPERATION', actionId };
  }
  const params = request.params ?? {};
  if (!isPlainJson(params)) return { ok: false, error: 'PARAMS_NOT_PLAIN_JSON', actionId };
  const subject = request.approvalSubject ?? null;
  if (subject !== null && (!isRecord(subject) || !isPlainJson(subject))) return { ok: false, error: 'APPROVAL_SUBJECT_NOT_PLAIN_JSON', actionId };
  const action = {
    state,
    actionId,
    entry: item,
    clientId: normalizeClientId(request.clientId),
    actor,
    paramsHash: paramsHash(subject || params),
    metadata: redactSecrets(request.metadata || {}),
  };

  if (typeof request.preflight === 'function') {
    let rejected;
    try {
      rejected = await request.preflight();
    } catch (err) {
      rejected = refusal(action, 'PREFLIGHT_FAILED', { detail: errorText(err) });
    }
    if (rejected) return rejected;
  }

  if (mockModeEnabled()) return runFixture(action, request.fixture);

  const pullAllowed = item.family === 'channel' && item.actionClass === 'read' && channelPullsEnabled();
  if (!liveCallsEnabled() && !pullAllowed && !item.local) return recordDryRun(action, request.payload ?? params);
  if (testModeEnabled() && !pullAllowed && !item.local && !TEST_MODE_FAMILIES.has(item.family)) return recordDryRun(action, request.payload ?? params, 'TEST_MODE_HELD');

  const beforeHash = stateDigest(state);
  const claim = item.actionClass === 'write' && !item.local && !testModeEnabled() ? claimApproval(action, request.approvalId) : { ok: true, approval: null };
  if (!claim.ok) return claim;

  const result = await runWithDeadline(action, execute, deadlineFor(item, request.timeoutMs));
  if (claim.approval) settleApproval(claim.approval, { ok: result.ok === true, error: result.error, actor: action.actor });
  recordAudit(action, { beforeHash, result, approvalId: claim.approval?.approvalId || '' });
  return result;
}
