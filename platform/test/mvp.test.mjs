import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { trialBalance } from '../src/ledger.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { invoiceToNicPayload, probeGovt, nicAuthenticate } from '../src/govt.mjs';
import { runTool } from '../src/tools.mjs';

test('MVP: invoice posts, TB ties, GSTR-1 JSON and NIC payload exist', async () => {
  const state = createState();
  const inv = createInvoice(state, {
    date: '2026-08-05',
    partyName: 'Retail Mart',
    partyGstin: '27AAACH7409R1Z3',
    partyState: '27',
    lines: [{ description: 'Fabric', hsn: '5208', qty: 2, rate: 10000, gstRate: 5 }],
  });
  assert.equal(inv.ok, true);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const g1 = invoicesToGstr1Json(state.company, state.invoices);
  assert.equal(g1.b2b[0].ctin, '27AAACH7409R1Z3');
  assert.equal(g1.b2b[0].inv[0].val, 21000);
  const nic = invoiceToNicPayload(state.company, inv.invoice);
  assert.equal(nic.Version, '1.1');
  assert.equal(nic.DocDtls.No, 'INV-0001');
  assert.equal(nic.SellerDtls.Gstin, state.company.gstin);
  const pack = await runTool(state, 'export_gstr1_json', {});
  assert.equal(pack.ok, true);
  assert.equal(pack.data.gstin, state.company.gstin);
});

test('govt probe talks through fetch to official URLs', async () => {
  const seen = [];
  const fetchFn = async (url, opts) => {
    seen.push({ url, method: opts.method });
    return { status: 200, ok: true };
  };
  const r = await probeGovt(fetchFn);
  assert.equal(r.live, 6);
  assert.ok(seen.some((s) => s.url.includes('gst.gov.in')));
  assert.ok(seen.some((s) => s.url.includes('einv-apisandbox.nic.in')));
  assert.ok(seen.some((s) => s.method === 'POST'));
});

test('nic auth without credentials tells the user how to register', async () => {
  const r = await nicAuthenticate({ env: 'sandbox' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'MISSING_CREDENTIALS');
  assert.ok(r.guide.length >= 5);
});
