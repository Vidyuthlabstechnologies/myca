import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { runTool } from '../src/tools.mjs';

function company() {
  const state = createState();
  return { ...state.company, gstin: '27AAPFU0939F1ZV', state: '27' };
}

function inv(id, date, { partyGstin = '', partyState = '27', lines }) {
  const sum = (k) => lines.reduce((s, l) => s + (l[k] || 0), 0);
  const taxable = sum('taxable');
  const total = taxable + sum('cgst') + sum('sgst') + sum('igst');
  return { id, date, partyGstin, partyState, taxable, total, lines };
}

const igst = (gstRate, taxable) => ({ gstRate, taxable, cgst: 0, sgst: 0, igst: (taxable * gstRate) / 100 });
const local = (gstRate, taxable) => ({ gstRate, taxable, cgst: (taxable * gstRate) / 200, sgst: (taxable * gstRate) / 200, igst: 0 });

test('H6: only invoices dated in the return period are reported', () => {
  const json = invoicesToGstr1Json(company(), [
    inv('A-1', '2026-07-31', { lines: [local(5, 1000)] }),
    inv('A-2', '2026-08-01', { lines: [local(5, 2000)] }),
    inv('A-3', '2026-08-31', { lines: [local(5, 3000)] }),
    inv('A-4', '2026-09-01', { lines: [local(5, 4000)] }),
  ], '082026');
  assert.equal(json.fp, '082026');
  assert.deepEqual(json.b2cs.map((r) => r.txval), [5000]);
});

test('H6: without fp the latest month is reported, not every month merged', () => {
  const json = invoicesToGstr1Json(company(), [
    inv('A-1', '2026-07-10', { lines: [local(5, 1000)] }),
    inv('A-2', '2026-08-10', { lines: [local(5, 2000)] }),
  ]);
  assert.equal(json.fp, '082026');
  assert.equal(json.b2cs[0].txval, 2000);
});

test('H6: a malformed return period is refused', () => {
  assert.equal(invoicesToGstr1Json(company(), [], '132026').error, 'FP_INVALID');
  assert.equal(invoicesToGstr1Json(company(), [], '2026-08').error, 'FP_INVALID');
});

test('H6: inter-state unregistered sale above Rs 1 lakh invoice value is reported invoice-wise in B2CL', () => {
  const json = invoicesToGstr1Json(company(), [
    inv('L-1', '2026-08-05', { partyState: '29', lines: [igst(5, 100000)] }),
    inv('S-1', '2026-08-06', { partyState: '29', lines: [igst(5, 95238)] }),
    inv('S-2', '2026-08-07', { partyState: '27', lines: [local(5, 900000)] }),
  ], '082026');
  assert.deepEqual(json.b2cl, [{
    pos: '29',
    inv: [{ inum: 'L-1', idt: '05-08-2026', val: 105000, itms: [{ num: 1, itm_det: { rt: 5, txval: 100000, camt: 0, samt: 0, iamt: 5000, csamt: 0 } }] }],
  }]);
  assert.deepEqual(json.b2cs.map((r) => [r.sply_ty, r.pos, r.txval]).sort(), [['INTER', '29', 95238], ['INTRA', '27', 900000]]);
});

test('H6: before 1-Aug-2024 the same sale stays in B2CS (threshold Rs 2.5 lakh)', () => {
  const json = invoicesToGstr1Json(company(), [inv('L-2', '2024-07-05', { partyState: '29', lines: [igst(5, 200000)] })], '072024');
  assert.equal(json.b2cl.length, 0);
  assert.equal(json.b2cs.length, 1);
});

test('H6: B2B items are one per rate, with lines of the same rate added together', () => {
  const json = invoicesToGstr1Json(company(), [
    inv('B-1', '2026-08-02', { partyGstin: '27AAACH7409R1Z1', lines: [local(18, 1000), local(5, 400), local(18, 500)] }),
  ], '082026');
  assert.deepEqual(json.b2b[0].inv[0].itms.map((i) => [i.num, i.itm_det.rt, i.itm_det.txval, i.itm_det.camt]), [
    [1, 5, 400, 10],
    [2, 18, 1500, 135],
  ]);
});

test('H6: an invoice at a rate not in force on its date is held back, not reported', () => {
  const json = invoicesToGstr1Json(company(), [
    inv('R-1', '2026-01-31', { partyState: '12', partyGstin: '', lines: [igst(28, 1000)] }),
    inv('R-2', '2026-02-01', { partyState: '12', partyGstin: '', lines: [igst(28, 1000)] }),
    inv('R-3', '2026-02-02', { partyState: '12', partyGstin: '', lines: [igst(13, 1000)] }),
  ], '022026');
  assert.deepEqual(json.held.map((h) => [h.inum, h.code, h.rate]), [['R-2', 'RATE_NOT_IN_FORCE', 28], ['R-3', 'RATE_NOT_IN_FORCE', 13]]);
  assert.equal(json.b2cs.length, 0);
  const jan = invoicesToGstr1Json(company(), [inv('R-1', '2026-01-31', { partyState: '12', lines: [igst(28, 1000)] })], '012026');
  assert.equal(jan.held.length, 0);
  assert.equal(jan.b2cs[0].rt, 28);
});

test('H6: a GSTIN failing the checksum is held back, not filed as B2B', () => {
  const json = invoicesToGstr1Json(company(), [inv('G-1', '2026-08-02', { partyGstin: '27AAACH7409R1Z2', lines: [local(18, 1000)] })], '082026');
  assert.equal(json.b2b.length, 0);
  assert.equal(json.held[0].code, 'INVALID_GSTIN');
});

test('H6: the export tool refuses a bad period and passes turnover through', async () => {
  const state = createState();
  state.company = company();
  const bad = await runTool(state, 'export_gstr1_json', { fp: '002026' });
  assert.equal(bad.ok, false);
  const good = await runTool(state, 'export_gstr1_json', { fp: '082026', grossTurnover: 5000000, currentGrossTurnover: 100000 });
  assert.equal(good.ok, true);
  assert.equal(good.data.gt, 5000000);
  assert.equal(good.data.cur_gt, 100000);
});
