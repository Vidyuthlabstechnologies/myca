import { performExternalAction } from './action-gate.mjs';
import { normalizeClientId } from './books.mjs';
import { generateMockIrnPayload, invoiceToNicPayload, nicCancelProblem, nicDocumentById, nicPartyFor, nicPayloadRefusal } from './nic-config.mjs';
import { mockModeEnabled } from './runtime-config.mjs';

function clientOf(state) {
  return normalizeClientId(state.activeClientId);
}

export function nicDocuments(state) {
  return [...(state.invoices || []), ...(state.creditNotes || []), ...(state.debitNotes || [])];
}

function findInvoice(state, invoiceId) {
  return nicDocumentById(state, invoiceId) || null;
}

function defined(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function stampMockIrn(state, invoiceId) {
  const company = state.company;
  const inv = nicDocumentById(state, invoiceId);
  if (!inv) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId };
  const mock = generateMockIrnPayload(company, inv);
  inv.mockIrn = mock.irn;
  inv.mockAckNo = mock.ackNo;
  inv.mockAckDate = mock.ackDate;
  inv.mockSignedQrCode = mock.signedQrCode;
  return {
    ok: true,
    invoiceId,
    irn: mock.irn,
    ackNo: mock.ackNo,
    ackDate: mock.ackDate,
    signedQrCode: mock.signedQrCode,
    payload: invoiceToNicPayload(company, inv, nicPartyFor(state, inv)),
    hint: 'Simulated IRN stored only in mock fields; nothing reached the IRP.',
  };
}

function gated(state, actionId, { params = {}, actor, payload, fixture, preflight, metadata }, execute) {
  return performExternalAction(state, { actionId, clientId: clientOf(state), params, actor, payload, fixture, preflight, metadata }, execute);
}

export async function generateIrn(state, invoiceId, actor) {
  const inv = findInvoice(state, invoiceId);
  if (!inv) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId };
  const payload = invoiceToNicPayload(state.company, inv, nicPartyFor(state, inv));
  const out = await gated(state, 'nic_irn_generate', {
    params: { invoiceId },
    actor,
    payload,
    preflight: () => nicPayloadRefusal(state, inv),
    metadata: { invoiceId },
    fixture: (copy) => stampMockIrn(copy, inv.id),
  }, (t) => t.nic.generateIrn(state, inv.id));
  return { payload, ...out };
}

export async function simulateIrn(state, invoiceId, actor) {
  if (mockModeEnabled()) return generateIrn(state, invoiceId, actor);
  return { ...stampMockIrn(state, invoiceId), mock: true };
}

export async function authenticate(state, actor) {
  const out = await gated(state, 'nic_auth', {
    actor,
    fixture: () => ({ ok: true, env: 'sandbox (mock)', hint: 'Simulated NIC authentication; no credentials left this PC.' }),
  }, (t) => t.nic.authenticate());
  return defined({ ok: out.ok === true, error: out.error, env: out.env, status: out.status, mock: out.mock, dryRunId: out.dryRunId, approvalId: out.approvalId, hint: out.hint });
}

export function health(state, actor) {
  return gated(state, 'nic_health', {
    actor,
    fixture: () => ({ ok: true, heartbeat: 'mock', hint: 'Simulated IRP heartbeat.' }),
  }, (t) => t.nic.health());
}

export function gstinMaster(state, gstin, actor) {
  return gated(state, 'nic_gstin_master', {
    params: { gstin },
    actor,
    fixture: () => ({ ok: true, data: { Gstin: gstin, LglNm: 'Simulated Legal Name', Status: 'ACT' } }),
  }, (t) => t.nic.gstinMaster(gstin));
}

export function cancelIrn(state, input, actor) {
  const params = defined({ invoiceId: input.invoiceId, irn: input.irn, reason: input.reason, remark: input.remark });
  const inv = input.invoiceId ? findInvoice(state, input.invoiceId) : null;
  return gated(state, 'nic_irn_cancel', {
    params,
    actor,
    metadata: defined({ invoiceId: input.invoiceId }),
    preflight: () => {
      if (inv && !inv.irn && inv.mockIrn && !input.irn) return { ok: false, error: 'MOCK_IRN_NOT_CANCELLABLE', hint: 'This invoice only has a simulated IRN; there is nothing to cancel on the IRP.' };
      const late = inv ? nicCancelProblem(inv) : null;
      return late ? { ok: false, error: late.code, invoiceId: inv.id, hint: late.words } : null;
    },
    fixture: (copy) => {
      const target = (copy.invoices || []).find((item) => item.id === input.invoiceId);
      if (target) target.mockIrnStatus = 'CNL';
      return { ok: true, irn: input.irn || target?.mockIrn || '', hint: 'Simulated cancellation stored only in mock fields.' };
    },
  }, (t) => t.nic.cancelIrn(state, params));
}

export function getIrn(state, irn, actor) {
  return gated(state, 'nic_irn_get', { params: { irn }, actor, fixture: () => ({ ok: true, irn, data: { Irn: irn, Status: 'ACT' } }) }, (t) => t.nic.getIrn(irn));
}

export function getIrnByDoc(state, input, actor) {
  const params = defined({ docType: input.docType || 'INV', docNo: input.docNo, docDate: input.docDate });
  return gated(state, 'nic_irn_get_by_doc', { params, actor, fixture: () => ({ ok: true, data: { DocNo: params.docNo, Status: 'ACT' } }) }, (t) => t.nic.getIrnByDoc(params));
}

export function rejectedIrns(state, date, actor) {
  return gated(state, 'nic_rejected_irns', { params: { date }, actor, fixture: () => ({ ok: true, data: { Irns: [] } }) }, (t) => t.nic.rejectedIrns(date));
}

export function probe(state, actor) {
  return gated(state, 'govt_probe', {
    actor,
    fixture: () => ({ ok: true, live: 0, total: 0, hits: [], note: 'Simulated probe; no government host was contacted.' }),
  }, (t) => t.reachability.probeGovt());
}
