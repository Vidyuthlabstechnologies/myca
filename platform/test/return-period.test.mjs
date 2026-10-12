import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';
import { localToday } from '../src/dates.mjs';
import { documentsForPeriod, fpOf, periodOf, periodsWithDocuments, taxByHead } from '../src/return-period.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

function books() {
  const state = createState();
  const sale = (id, date, partyGstin, rate, gstRate) => {
    const out = createInvoice(state, { id, date, partyName: `Buyer ${id}`, partyGstin, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate, gstRate }] });
    assert.notEqual(out.ok, false, JSON.stringify(out));
  };
  sale('INV-0001', '2026-08-05', '27AAACH7409R1Z1', 100000, 5);
  sale('INV-0002', '2026-08-20', '24AAACF7856R1ZY', 50000, 18);
  sale('INV-0003', '2026-10-03', '', 20000, 18);
  const bill = createPurchase(state, { date: '2026-08-06', partyName: 'Fabric Co', partyGstin: '27AABCT1332L1ZE', lines: [{ description: 'Grey cloth', hsn: '5208', qty: 1, rate: 40000, gstRate: 5 }] });
  assert.notEqual(bill.ok, false, JSON.stringify(bill));
  return state;
}

test('period helpers read months from document dates and reject anything else', () => {
  assert.equal(periodOf('2026-08-05'), '2026-08');
  assert.equal(periodOf('05-08-2026'), '');
  assert.equal(periodOf('2026-13-01'), '');
  assert.equal(fpOf('2026-08'), '082026');
  assert.equal(fpOf('2026-8'), '');
  assert.deepEqual(taxByHead(0.1, 0.2, 0.3), { igst: 0.1, cgst: 0.2, sgst: 0.3, total: 0.6 });
  const state = books();
  assert.deepEqual(periodsWithDocuments(state), ['2026-08', '2026-10']);
  assert.equal(documentsForPeriod(state).period, '2026-10');
  assert.equal(documentsForPeriod(state, '2026-08').invoices.length, 2);
  assert.equal(documentsForPeriod(state, 'August').error, 'INVALID_PERIOD');
  assert.equal(documentsForPeriod(createState(), undefined, '2026-11').period, '2026-11');
});

test('a GSTR-3B draft holds one month only: October sales never land in August', async () => {
  const state = books();
  const august = (await runTool(state, 'prepare_gstr3b', { period: '2026-08' })).data;
  assert.equal(august.period, '2026-08');
  assert.deepEqual(august.outward.totals, { interTaxable: 50000, interIgst: 9000, intraTaxable: 100000, intraCgst: 2500, intraSgst: 2500 });
  assert.deepEqual(august.itc.available, { igst: 0, cgst: 1000, sgst: 1000 });

  const october = (await runTool(state, 'prepare_gstr3b', { period: '2026-10' })).data;
  assert.equal(october.period, '2026-10');
  assert.deepEqual(october.outward.totals, { interTaxable: 0, interIgst: 0, intraTaxable: 20000, intraCgst: 1800, intraSgst: 1800 });
  assert.deepEqual(october.itc.available, { igst: 0, cgst: 0, sgst: 0 });

  const latest = (await runTool(state, 'prepare_gstr3b', {})).data;
  assert.equal(latest.period, '2026-10', 'with no period the latest month with documents is used');
  assert.deepEqual(latest.periods, ['2026-08', '2026-10']);
});

test('GSTR-1 tables and the filing pack are built for the same single month', async () => {
  const state = books();
  const august = (await runTool(state, 'prepare_gstr1', { period: '2026-08' })).data;
  assert.equal(august.gstr1.totalTaxable, 150000);
  assert.equal(august.salesText.includes('INV-0003'), false);
  const october = (await runTool(state, 'prepare_gstr1', { period: '2026-10' })).data;
  assert.equal(october.gstr1.totalTaxable, 20000);

  const pack = (await runTool(state, 'filing_pack', { period: '2026-08' })).data;
  assert.equal(pack.period, '2026-08');
  assert.equal(pack.gstr1.totalTaxable, 150000);
  assert.deepEqual(pack.gstr3b.outward.totals.intraTaxable, 100000);
  assert.match(pack.payableBasis, /this return period/);
});

test('the period summary gives tax on sales and credit by head, from the 3B draft', async () => {
  const state = books();
  const august = (await runTool(state, 'gst_period_summary', { period: '2026-08' })).data;
  assert.deepEqual(august.periods, ['2026-08', '2026-10']);
  assert.equal(august.salesCount, 2);
  assert.equal(august.purchaseCount, 1);
  assert.equal(august.taxableSales, 150000);
  assert.deepEqual(august.outputTax, { igst: 9000, cgst: 2500, sgst: 2500, total: 14000 });
  assert.deepEqual(august.inputCredit, { igst: 0, cgst: 1000, sgst: 1000, total: 2000 });
  assert.equal(august.gstr1.fp, '082026');
  assert.equal(august.gstr1.b2b, 2);
  assert.match(august.gstr1.hash, /^[a-f0-9]{64}$/);
  assert.equal('payable' in august, false, 'no netted figure: set-off across heads is not this tool job');

  const october = (await runTool(state, 'gst_period_summary', {})).data;
  assert.equal(october.period, '2026-10');
  assert.deepEqual(october.outputTax, { igst: 0, cgst: 1800, sgst: 1800, total: 3600 });
  assert.equal(october.gstr1.b2b, 0);
  assert.equal(october.gstr1.b2cs, 1);
});

test('a month with no documents, and empty books, give zeros rather than another month figures', async () => {
  const state = books();
  const quiet = (await runTool(state, 'gst_period_summary', { period: '2026-09' })).data;
  assert.equal(quiet.salesCount, 0);
  assert.deepEqual(quiet.outputTax, { igst: 0, cgst: 0, sgst: 0, total: 0 });
  assert.deepEqual(quiet.inputCredit, { igst: 0, cgst: 0, sgst: 0, total: 0 });
  assert.deepEqual([quiet.gstr1.b2b, quiet.gstr1.b2cl, quiet.gstr1.b2cs, quiet.gstr1.hash], [0, 0, 0, '']);

  const empty = (await runTool(createState(), 'gst_period_summary', {})).data;
  assert.equal(empty.period, localToday().slice(0, 7));
  assert.deepEqual(empty.periods, []);
  assert.equal(empty.outputTax.total, 0);
});

test('a malformed period is refused by the tool and by the schema', async () => {
  const state = books();
  for (const tool of ['prepare_gstr1', 'prepare_gstr3b', 'filing_pack', 'gst_period_summary']) {
    const out = await runTool(state, tool, { period: '08-2026' });
    assert.equal(out.ok, false, tool);
    assert.deepEqual(out.periods, ['2026-08', '2026-10'], tool);
    assert.equal(validateAssistantToolCall(tool, { period: '08-2026' }).ok, false, tool);
    assert.equal(validateAssistantToolCall(tool, { period: '2026-08' }).ok, true, tool);
  }
});

test('the app may ask for the summary and the GSTR-1 file, and nothing that files', () => {
  assert.equal(isRemoteQuery('gst_period_summary'), true);
  assert.equal(isRemoteQuery('export_gstr1_json'), true);
  assert.equal(isRemoteQuery('filing_pack'), false);
  assert.equal(isRemoteQuery('sandbox_operation'), false);
});
