import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('an export under LUT is priced in the foreign currency, valued in rupees at the rate, zero-rated with place of supply 96, and lands in GSTR-1 table 6A and GSTR-9 5A', async () => {
  const state = books();
  const out = await runTool(state, 'create_invoice', { partyName: 'Acme Inc', lines: [{ description: 'Cotton yarn', hsn: '5205', qty: 100, rate: 12, gstRate: 5 }], date: '2026-09-05', exportSale: { currency: 'usd', exchangeRate: 83.5, shippingBillNo: '1234567', shippingBillDate: '2026-09-08', portCode: 'INNSA1' } });
  assert.equal(out.ok, true, JSON.stringify(out));
  const inv = out.invoice;
  assert.equal(inv.placeOfSupply, '96');
  assert.equal(inv.lines[0].foreignRate, 12);
  assert.equal(inv.lines[0].foreignAmount, 1200);
  assert.equal(inv.lines[0].rate, 1002);
  assert.equal(inv.taxable, 100200);
  assert.equal(inv.igst, 0);
  assert.equal(inv.total, 100200);
  assert.equal(inv.zeroRated, true);
  assert.deepEqual(inv.export, { currency: 'USD', exchangeRate: 83.5, withTax: false, shippingBillNo: '1234567', shippingBillDate: '2026-09-08', portCode: 'INNSA1', foreignTotal: 1200 });

  const paid = await runTool(state, 'create_invoice', { partyName: 'Globex LLC', lines: [{ description: 'Software', hsn: '9983', qty: 1, rate: 1000, gstRate: 18 }], date: '2026-09-10', exportSale: { currency: 'USD', exchangeRate: 80, withTax: true } });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  assert.equal(paid.invoice.taxable, 80000);
  assert.equal(paid.invoice.igst, 14400);
  assert.equal(paid.invoice.cgst, 0);
  assert.equal(paid.invoice.zeroRated, false);

  const withGstin = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '27AAACK1234F1Z5', lines: [{ description: 'x', qty: 1, rate: 10, gstRate: 5 }], date: '2026-09-11', exportSale: { currency: 'USD', exchangeRate: 83 } });
  assert.equal(withGstin.error, 'EXPORT_BUYER_HAS_GSTIN');
  const noRate = await runTool(state, 'create_invoice', { partyName: 'Acme Inc', lines: [{ description: 'x', qty: 1, rate: 10, gstRate: 5 }], date: '2026-09-11', exportSale: { currency: 'USD' } });
  assert.equal(noRate.error, 'EXCHANGE_RATE_REQUIRED');
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'A', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 0 }], exportSale: { currency: 'USD', exchangeRate: 83.5 } }).ok, true);
  assert.equal(validateAssistantToolCall('create_invoice', { partyName: 'A', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 0 }], exportSale: { currency: 'dollars' } }).ok, false);

  const json = await runTool(state, 'export_gstr1_json', { period: '2026-09' });
  assert.equal(json.ok, true, JSON.stringify(json).slice(0, 300));
  const body = json.data;
  assert.ok(body.exp, JSON.stringify(Object.keys(body)));
  const byType = Object.fromEntries(body.exp.map((e) => [e.exp_typ, e.inv]));
  assert.equal(byType.WOPAY.length, 1);
  assert.equal(byType.WOPAY[0].inum, 'INV-0001');
  assert.equal(byType.WOPAY[0].sbnum, '1234567');
  assert.equal(byType.WOPAY[0].sbpcode, 'INNSA1');
  assert.equal(byType.WOPAY[0].sbdt, '08-09-2026');
  assert.deepEqual(byType.WOPAY[0].itms, [{ num: 1, txval: 100200, rt: 5, iamt: 0, csamt: 0 }]);
  assert.equal(byType.WPAY[0].itms[0].iamt, 14400);
  assert.equal((body.b2cl || []).length + (body.b2cs || []).length, 0, 'exports are never in B2CL or B2CS');

  const nine = await runTool(state, 'gstr9_draft', { fy: '2026-27' });
  assert.equal(nine.ok, true);
  assert.deepEqual(nine.data.table5.exportsWithoutTax, { count: 1, taxable: 100200 });
  assert.deepEqual(nine.data.table4.exportsWithTax, { count: 1, taxable: 80000, igst: 14400 });
  assert.equal(nine.data.table4.b2cInvoices, 0);

  const held = await chat(state, 'export invoice to Zeta GmbH EUR 500 at 90.25 under LUT');
  assert.match(held.reply, /Export invoice \(EUR at 90.25\) to Zeta GmbH .*taxable ₹45,125\.00, no IGST \(zero-rated under LUT or bond\), total ₹45,125\.00\. Place of supply outside India \(96\)/, held.reply);
  assert.match(held.reply, /GSTR-1 table 6A .* as WOPAY/);
  const said = await chat(state, 'yes');
  assert.match(said.reply, /Export invoice INV-000\d to Zeta GmbH: EUR 500 at 90.25, ₹45,125\.00 in rupees, zero-rated without IGST under LUT or bond/, said.reply);
  const heldTaxed = await chat(state, 'export invoice to Zeta GmbH USD 100 at 80 with IGST 18%');
  assert.match(heldTaxed.reply, /IGST ₹1,440\.00, total ₹9,440\.00/, heldTaxed.reply);
  const taxed = await chat(state, 'yes');
  assert.match(taxed.reply, /IGST ₹1,440\.00 charged/, taxed.reply);
  const refused = await chat(state, 'export invoice to Zeta GmbH USD 100 at 80');
  assert.equal(refused.preview?.tool, 'create_invoice');
});
