import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { invoiceToNicPayload, generateMockIrnPayload, nicDocType } from '../src/nic-config.mjs';
import { planLocalToolCall, validateAssistantToolCall } from '../src/assistant-contract.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', city: 'Pune', pin: 411001 };
  return state;
}

test('a credit or debit note builds a CRN or DBN e-invoice payload with the original invoice as the preceding document', async () => {
  const state = books();
  const inv = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '27AAACK1234F1Z5', lines: [{ description: 'Cloth', hsn: '5208', qty: 10, rate: 1000, gstRate: 5 }], date: '2026-09-01' });
  assert.equal(inv.ok, true);
  const cn = await runTool(state, 'create_credit_note', { invoiceId: 'INV-0001', amount: 2000, date: '2026-09-10', reason: 'goods returned' });
  assert.equal(cn.ok, true, JSON.stringify(cn).slice(0, 200));
  const dn = await runTool(state, 'create_debit_note', { invoiceId: 'INV-0001', amount: 500, date: '2026-09-12', reason: 'price revised' });
  assert.equal(dn.ok, true, JSON.stringify(dn).slice(0, 200));
  assert.deepEqual([nicDocType('INV-0001'), nicDocType('CN-0001'), nicDocType('DN-0001')], ['INV', 'CRN', 'DBN']);

  const note = state.creditNotes.find((n) => n.id === 'CN-0001');
  const payload = invoiceToNicPayload(state.company, note);
  assert.equal(payload.DocDtls.Typ, 'CRN');
  assert.equal(payload.DocDtls.No, 'CN-0001');
  assert.deepEqual(payload.PrecDocDtls, [{ InvNo: 'INV-0001', InvDt: '01/09/2026' }]);
  assert.equal(payload.ValDtls.AssVal, note.taxable);
  const invPayload = invoiceToNicPayload(state.company, state.invoices[0]);
  assert.equal(invPayload.DocDtls.Typ, 'INV');
  assert.equal(invPayload.PrecDocDtls, undefined);
  const mock = generateMockIrnPayload(state.company, note);
  assert.equal(JSON.parse(Buffer.from(mock.signedQrCode, 'base64url').toString('utf8')).DocTyp, 'CRN');

  const simulated = await runTool(state, 'govt_nic_mock', { invoiceId: 'DN-0001' });
  assert.equal(simulated.ok, true, JSON.stringify(simulated).slice(0, 300));
  assert.match(state.debitNotes[0].mockIrn, /^[a-f0-9]{64}$/);
  assert.equal(validateAssistantToolCall('govt_generate_irn', { invoiceId: 'CN-0001' }).ok, true);
  assert.equal(validateAssistantToolCall('govt_generate_irn', { invoiceId: 'SI-0001' }).ok, true);
  assert.equal(validateAssistantToolCall('govt_generate_irn', { invoiceId: 'PO-0001' }).ok, false);
  const plan = planLocalToolCall(state, 'generate irn CN-0001');
  assert.deepEqual(plan, { kind: 'tool', name: 'govt_generate_irn', args: { invoiceId: 'CN-0001' } });
  const mockPlan = planLocalToolCall(state, 'mock irn DN-0001');
  assert.equal(mockPlan.name, 'govt_nic_mock');

  const view = await runTool(state, 'invoice_document', { id: 'INV-0001' });
  assert.equal(view.ok, true);
  assert.equal(view.data.einvoice.status, 'ready');
  await runTool(state, 'govt_nic_mock', { invoiceId: 'INV-0001' });
  const after = await runTool(state, 'invoice_document', { id: 'INV-0001' });
  assert.equal(after.data.einvoice.status, 'mock');
  assert.equal(after.data.einvoice.irn, state.invoices[0].mockIrn);
  const b2c = await runTool(state, 'create_invoice', { partyName: 'Walk-in', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }], date: '2026-09-02' });
  const b2cView = await runTool(state, 'invoice_document', { id: b2c.invoice.id });
  assert.equal(b2cView.data.einvoice.status, 'not-applicable');
});
