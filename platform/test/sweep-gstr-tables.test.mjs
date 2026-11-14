import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { invoicesToGstr1Json } from '../src/gstr1-json.mjs';
import { uqcOf, minHsnDigits } from '../src/gstr1-tables.mjs';
import { offsetPlan, splitByWeight } from '../src/gstr3b-portal.mjs';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function withCheck(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return first14 + ALPHABET[(36 - (sum % 36)) % 36];
}

const BUYER = withCheck('27AAACK1234F1Z');

function company(extra = {}) {
  const state = createState();
  return { ...state.company, gstin: '27AAPFU0939F1ZV', state: '27', ...extra };
}

function line(hsn, gstRate, taxable, { qty = 1, unit, description = 'Item', cess = 0, inter = false } = {}) {
  const tax = Math.round(taxable * gstRate) / 100;
  return { description, hsn, qty, ...(unit ? { unit } : {}), gstRate, taxable, cgst: inter ? 0 : tax / 2, sgst: inter ? 0 : tax / 2, igst: inter ? tax : 0, ...(cess ? { cess } : {}) };
}

function doc(id, date, lines, extra = {}) {
  const sum = (key) => lines.reduce((total, item) => total + Number(item[key] || 0), 0);
  return { id, date, partyState: '27', taxable: sum('taxable'), cgst: sum('cgst'), sgst: sum('sgst'), igst: sum('igst'), total: sum('taxable') + sum('cgst') + sum('sgst') + sum('igst') + sum('cess'), lines, ...extra };
}

test('GSTR-1 table 12 (HSN summary): from May 2025 rows are split into hsn_b2b and hsn_b2c per the GSTN Phase-III advisory, with UQC, quantity, rate, tax by head and cess', () => {
  const json = invoicesToGstr1Json(company({ grossTurnoverPrevFy: 20000000 }), [
    doc('INV-0001', '2026-08-02', [line('520811', 5, 10000, { qty: 10, unit: 'mtr', description: 'Cotton cloth' }), line('24022010', 40, 1000, { qty: 2, unit: 'box', description: 'Cigarettes', cess: 50 })], { partyGstin: BUYER }),
    doc('INV-0002', '2026-08-03', [line('520811', 5, 2000, { qty: 2, unit: 'metre', description: 'Cotton cloth' }), line('998314', 18, 500, { qty: 3, description: 'IT support' })]),
  ], '082026');
  assert.equal(json.hsn.data, undefined);
  assert.deepEqual(json.hsn.hsn_b2b, [
    { num: 1, hsn_sc: '24022010', desc: 'Cigarettes', uqc: 'BOX', qty: 2, rt: 40, txval: 1000, iamt: 0, camt: 200, samt: 200, csamt: 50 },
    { num: 2, hsn_sc: '520811', desc: 'Cotton cloth', uqc: 'MTR', qty: 10, rt: 5, txval: 10000, iamt: 0, camt: 250, samt: 250, csamt: 0 },
  ]);
  assert.deepEqual(json.hsn.hsn_b2c, [
    { num: 1, hsn_sc: '520811', desc: 'Cotton cloth', uqc: 'MTR', qty: 2, rt: 5, txval: 2000, iamt: 0, camt: 50, samt: 50, csamt: 0 },
    { num: 2, hsn_sc: '998314', desc: 'IT support', uqc: 'NA', qty: 0, rt: 18, txval: 500, iamt: 0, camt: 45, samt: 45, csamt: 0 },
  ]);
  assert.deepEqual(json.hsnProblems, []);
});

test('GSTR-1 table 12: periods before May 2025 report one data array covering B2B and B2C', () => {
  const json = invoicesToGstr1Json(company({ grossTurnoverPrevFy: 20000000 }), [
    doc('INV-0001', '2025-04-02', [line('5208', 5, 1000, { qty: 1, unit: 'kg' })], { partyGstin: BUYER }),
    doc('INV-0002', '2025-04-03', [line('5208', 5, 3000, { qty: 3, unit: 'KGS' })]),
  ], '042025');
  assert.equal(json.hsn.hsn_b2b, undefined);
  assert.deepEqual(json.hsn.data, [{ num: 1, hsn_sc: '5208', desc: 'Item', uqc: 'KGS', qty: 4, rt: 5, txval: 4000, iamt: 0, camt: 100, samt: 100, csamt: 0 }]);
});

test('GSTR-1 table 12: credit notes reduce and debit notes add to the HSN rows of the period, quantity included', () => {
  const sale = doc('INV-0001', '2026-08-02', [line('520811', 5, 10000, { qty: 10, unit: 'mtr' })], { partyGstin: BUYER });
  const credit = { ...doc('CN-0001', '2026-08-20', [line('520811', 5, 2000, { qty: 2 })], { partyGstin: BUYER }), invoiceId: 'INV-0001' };
  const debit = { ...doc('DN-0001', '2026-08-21', [line('520811', 5, 500, { qty: 0.5 })], { partyGstin: BUYER }), invoiceId: 'INV-0001' };
  const json = invoicesToGstr1Json(company({ grossTurnoverPrevFy: 20000000 }), [sale], '082026', { creditNotes: [credit], debitNotes: [debit] });
  assert.deepEqual(json.hsn.hsn_b2b.map((row) => [row.hsn_sc, row.uqc, row.qty, row.txval, row.camt]), [['520811', 'MTR', 8.5, 8500, 212.5]]);
});

test('GSTR-1 table 12: above Rs 5 crore AATO a 4-digit HSN is reported as a problem and left out, never padded or guessed (Notification 78/2020-CT)', () => {
  const json = invoicesToGstr1Json(company({ grossTurnoverPrevFy: 60000000 }), [
    doc('INV-0001', '2026-08-02', [line('5208', 5, 1000), line('520811', 5, 2000), line('', 5, 300)], { partyGstin: BUYER }),
  ], '082026');
  assert.deepEqual(json.hsn.hsn_b2b.map((row) => row.hsn_sc), ['520811']);
  assert.deepEqual(json.hsnProblems.map((p) => [p.doc, p.line, p.hsn, p.code, p.need]), [['INV-0001', 1, '5208', 'HSN_TOO_SHORT', 6], ['INV-0001', 3, '', 'HSN_MISSING', 6]]);
  assert.ok(json.warnings.some((w) => w.startsWith('HSN_CODE_PROBLEM')));
});

test('GSTR-1 table 12: up to Rs 5 crore AATO 4 digits are enough; with AATO unknown the 4-digit check is used and a warning asks for turnover', () => {
  assert.equal(minHsnDigits(50000000), 4);
  assert.equal(minHsnDigits(50000001), 6);
  const small = invoicesToGstr1Json(company({ grossTurnoverPrevFy: 40000000 }), [doc('INV-0001', '2026-08-02', [line('5208', 5, 1000), line('52', 5, 10)])], '082026');
  assert.deepEqual(small.hsn.hsn_b2c.map((row) => row.hsn_sc), ['5208']);
  assert.deepEqual(small.hsnProblems.map((p) => p.code), ['HSN_TOO_SHORT']);
  const unknown = invoicesToGstr1Json(company(), [doc('INV-0001', '2026-08-02', [line('5208', 5, 1000)])], '082026');
  assert.deepEqual(unknown.hsnProblems, []);
  assert.ok(unknown.warnings.some((w) => w.startsWith('HSN_AATO_UNKNOWN')));
});

test('GSTR-1 table 12: common units map to the GSTN UQC list and anything else to OTH', () => {
  assert.equal(uqcOf('Pcs'), 'PCS');
  assert.equal(uqcOf('nos'), 'NOS');
  assert.equal(uqcOf('Kg'), 'KGS');
  assert.equal(uqcOf('ltr'), 'LTR');
  assert.equal(uqcOf('sq ft'), 'SQF');
  assert.equal(uqcOf('dozen'), 'DOZ');
  assert.equal(uqcOf('TON'), 'TON');
  assert.equal(uqcOf('bucket'), 'OTH');
  assert.equal(uqcOf(''), 'OTH');
});

test('GSTR-1 table 12: an invoice made in the app keeps its unit and its credit note nets into the same HSN row', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', grossTurnoverPrevFy: 10000000 };
  const made = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER, lines: [{ description: 'Rice', hsn: '1006', qty: 100, unit: 'kg', rate: 50, gstRate: 5 }], date: '2026-08-05' });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(state.invoices[0].lines[0].unit, 'kg');
  const note = await runTool(state, 'create_credit_note', { invoiceId: state.invoices[0].id, amount: 1050, reason: 'returned', date: '2026-08-10' });
  assert.equal(note.ok, true, JSON.stringify(note));
  const json = invoicesToGstr1Json(state.company, state.invoices, '082026', { creditNotes: state.creditNotes });
  assert.deepEqual(json.hsn.hsn_b2b.map((row) => [row.hsn_sc, row.uqc, row.qty, row.txval]), [['1006', 'KGS', 80, 4000]]);
});

test('GSTR-1 table 13 (doc_issue): invoices, credit notes and debit notes grouped by series prefix with from, to, total, cancelled and net issued', () => {
  const sale = (id, extra = {}) => doc(id, '2026-08-02', [line('5208', 5, 100)], extra);
  const json = invoicesToGstr1Json(company({ grossTurnoverPrevFy: 1 }), [
    sale('INV-0001'), sale('INV-0002'), sale('INV-0004', { status: 'cancelled' }), sale('INV-0003', { status: 'cancelled', creditNoteIds: ['CN-0001'] }), sale('EXP/1'), sale('EXP/2'),
  ], '082026', {
    creditNotes: [{ ...doc('CN-0001', '2026-08-15', [line('5208', 5, 100)]), invoiceId: 'INV-0003' }],
    debitNotes: [{ ...doc('DN-0007', '2026-08-16', [line('5208', 5, 10)]), invoiceId: 'INV-0001' }],
  });
  assert.deepEqual(json.doc_issue, { doc_det: [
    { doc_num: 1, doc_typ: 'Invoices for outward supply', docs: [
      { num: 1, from: 'EXP/1', to: 'EXP/2', totnum: 2, cancel: 0, net_issue: 2 },
      { num: 2, from: 'INV-0001', to: 'INV-0004', totnum: 4, cancel: 1, net_issue: 3 },
    ] },
    { doc_num: 4, doc_typ: 'Debit Note', docs: [{ num: 1, from: 'DN-0007', to: 'DN-0007', totnum: 1, cancel: 0, net_issue: 1 }] },
    { doc_num: 5, doc_typ: 'Credit Note', docs: [{ num: 1, from: 'CN-0001', to: 'CN-0001', totnum: 1, cancel: 0, net_issue: 1 }] },
  ] });
  assert.deepEqual(json.hsn.hsn_b2c.map((row) => row.txval), [410], 'the voided INV-0004 is left out; INV-0003 and its cancelling credit note net to nil; the debit note adds 10');
});

test('GSTR-1 table 13: a gap in a series in the period is flagged for review, not filled in', () => {
  const json = invoicesToGstr1Json(company({ grossTurnoverPrevFy: 1 }), [doc('INV-0001', '2026-08-02', [line('5208', 5, 100)]), doc('INV-0005', '2026-08-03', [line('5208', 5, 100)])], '082026');
  assert.deepEqual(json.doc_issue.doc_det[0].docs, [{ num: 1, from: 'INV-0001', to: 'INV-0005', totnum: 2, cancel: 0, net_issue: 2 }]);
  assert.ok(json.warnings.some((w) => w.startsWith('DOC_SERIES_GAP') && w.includes('3 numbers')));
});

test('GSTR-9 is drafted per GSTIN (section 44, one annual return per registration): a second registration\'s sales stay out of the principal draft', async () => {
  const principal = withCheck('27AABCU9603R1Z');
  const karnataka = withCheck('29AABCU9603R1Z');
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: principal, state: '27' };
  assert.equal((await runTool(state, 'set_registration', { gstin: karnataka, kind: 'branch', label: 'Bengaluru' })).ok, true);
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 100000, gstRate: 5 }], date: '2026-05-05' });
  const branchSale = await runTool(state, 'create_invoice', { registrationGstin: karnataka, partyName: 'Walk-in', partyState: '29', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 40000, gstRate: 5 }], date: '2026-05-06' });
  assert.equal(branchSale.ok, true, JSON.stringify(branchSale));
  const main = await runTool(state, 'gstr9_draft', { fy: '2026-27' });
  assert.equal(main.ok, true, JSON.stringify(main));
  assert.equal(main.data.gstin, principal);
  assert.equal(main.data.table4.outwardTaxable, 100000);
  assert.deepEqual(main.data.registrations.map((reg) => reg.gstin), [principal, karnataka]);
  assert.ok(main.data.notes.some((note) => note.includes(karnataka)));
  const branch = await runTool(state, 'gstr9_draft', { fy: '2026-27', gstin: karnataka });
  assert.equal(branch.ok, true, JSON.stringify(branch));
  assert.equal(branch.data.gstin, karnataka);
  assert.equal(branch.data.table4.outwardTaxable, 40000);
  assert.deepEqual(branch.data.table17.map((row) => row.taxable), [40000]);
  assert.notEqual(branch.data.draftHash, main.data.draftHash);
  assert.equal((await runTool(state, 'gstr9_draft', { fy: '2026-27', gstin: withCheck('07AABCU9603R1Z') })).error, 'UNKNOWN_REGISTRATION');
});

test('GSTR-9 table 4I/4J count only notes on taxable supplies; notes on exports without tax and on 0% lines go to table 5H/5I', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 10000, gstRate: 5 }, { description: 'Fresh milk', hsn: '0401', qty: 1, rate: 1000, gstRate: 0, supply: 'nil' }], date: '2026-05-05' });
  const exported = await runTool(state, 'create_invoice', { partyName: 'Acme LLC', exportSale: { currency: 'INR', exchangeRate: 1, withTax: false, lutNumber: 'AD270526000001A' }, lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 20000, gstRate: 5 }], date: '2026-05-06' });
  assert.equal(exported.ok, true, JSON.stringify(exported));
  const domestic = state.invoices[0].id;
  const exportId = state.invoices[1].id;
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: domestic, amount: 1050, reason: 'rate', date: '2026-05-20', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] })).ok, true);
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: domestic, amount: 100, reason: 'spoilt', date: '2026-05-21', lines: [{ description: 'Fresh milk', hsn: '0401', qty: 1, rate: 100, gstRate: 0 }] })).ok, true);
  const exportNote = await runTool(state, 'create_credit_note', { invoiceId: exportId, amount: 2000, reason: 'short shipped', date: '2026-05-22' });
  assert.equal(exportNote.ok, true, JSON.stringify(exportNote));
  const out = await runTool(state, 'gstr9_draft', { fy: '2026-27' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.table4.creditNotes.taxable, 1000);
  assert.equal(out.data.table4.netTaxable, 9000);
  assert.equal(out.data.table5.creditNotes, 2100);
  assert.ok(out.data.notes.some((note) => note.includes('5H/5I')));
});

test('GSTR-3B interest (section 50) is split across heads by largest remainder so the shares add up to the paisa', () => {
  assert.deepEqual(splitByWeight(0.1, [1, 1, 1]), [0.04, 0.03, 0.03]);
  assert.deepEqual(splitByWeight(100, [1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.deepEqual(splitByWeight(5, [0, 0, 0]), [0, 0, 0]);
  const plan = offsetPlan({ used: {}, cash: { igst: 333.33, cgst: 333.33, sgst: 333.34 }, reverseCharge: { igst: 0, cgst: 11.11, sgst: 11.11 }, late: { interest: 10.01, lateFee: 50.01 } }, {});
  const rows = plan.pdcash;
  const interest = rows.reduce((sum, row) => sum + Math.round(row.i_intrpd * 100) + Math.round(row.c_intrpd * 100) + Math.round(row.s_intrpd * 100), 0);
  assert.equal(interest, 1001);
  assert.equal(Math.round(rows[0].c_lfeepd * 100) + Math.round(rows[0].s_lfeepd * 100), 5001);
});
