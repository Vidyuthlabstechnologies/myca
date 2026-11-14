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

test('GSTR-9 table 5B takes supplies to an SEZ without payment of tax and their notes; SEZ with IGST stays in 4C, exports with tax in 4D, deemed exports in 4E (IGST Act section 16)', async () => {
  const sezUnit = withCheck('27AAACS1234F1Z');
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const sale = (extra, rate) => runTool(state, 'create_invoice', { partyName: 'Zone Unit', partyGstin: sezUnit, partyAddress: 'Plot 9, SEEPZ, Mumbai 400096', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate, gstRate: 18 }], date: '2026-05-05', ...extra });
  assert.equal((await sale({ supplyType: 'SEZWOP' }, 50000)).ok, true);
  assert.equal((await sale({ supplyType: 'SEZWP' }, 20000)).ok, true);
  assert.equal((await sale({ supplyType: 'DEXP' }, 7000)).ok, true);
  assert.equal((await runTool(state, 'create_invoice', { partyName: 'Acme LLC', exportSale: { currency: 'INR', withTax: true }, lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 3000, gstRate: 18 }], date: '2026-05-06' })).ok, true);
  assert.equal((await runTool(state, 'create_credit_note', { invoiceId: state.invoices[0].id, amount: 5000, reason: 'short', date: '2026-05-20' })).ok, true);
  const out = await runTool(state, 'gstr9_draft', { fy: '2026-27' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.deepEqual(d.table5.sezWithoutTax, { count: 1, taxable: 50000 });
  assert.equal(d.table5.creditNotes, 5000);
  assert.equal(d.table4.creditNotes.taxable, 0);
  assert.equal(d.table4.outwardTaxable, 30000);
  assert.deepEqual(d.table4.sezWithTax, { count: 1, taxable: 20000, igst: 3600 });
  assert.deepEqual(d.table4.exportsWithTax, { count: 1, taxable: 3000, igst: 540 });
  assert.equal(d.table4.deemedExports.count, 1);
  assert.equal(d.table4.deemedExports.taxable, 7000);
});

const TWO_B_HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';

test('GSTR-2B is stored per GSTIN for an additional registration; month-only data stays the principal\'s, so branch GSTR-9 table 8 and credit at risk read their own 2B', async () => {
  const principal = withCheck('27AABCU9603R1Z');
  const karnataka = withCheck('29AABCU9603R1Z');
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: principal, state: '27' };
  assert.equal((await runTool(state, 'set_registration', { gstin: karnataka, kind: 'branch', label: 'Bengaluru' })).ok, true);
  state.gstr2b = { '2026-05': { fileName: 'old.csv', importedOn: '2026-06-14', rows: [{ section: 'B2B', supplierGstin: '27AABCT1332L1ZE', supplierName: 'FABRIC CO', invoiceNo: 'F-101', invoiceDate: '2026-05-05', taxableValue: 10000, cgst: 250, sgst: 250, igst: 0, cess: 0, itcAvailability: 'Y' }], skipped: 0 } };
  const branchBill = await runTool(state, 'create_purchase', { registrationGstin: karnataka, partyName: 'Pack House', partyGstin: '29AABCL1234J1ZL', supplierInvoiceNo: 'PH-9', lines: [{ description: 'Boxes', hsn: '4819', qty: 1, rate: 5000, gstRate: 18 }], date: '2026-05-10' });
  assert.equal(branchBill.ok, true, JSON.stringify(branchBill));
  assert.equal((await runTool(state, 'create_invoice', { partyName: 'Walk-in', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }], date: '2026-05-12' })).ok, true);
  const csv = [TWO_B_HEADER,'B2B,29AABCL1234J1ZL,PACK HOUSE,PH-9,10-05-2026,5000,450,450,0,0,5900,Y'].join('\n');
  const added = await runTool(state, 'import_gstr2b', { csv, period: '2026-05', gstin: karnataka });
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(added.replaced, false);
  assert.ok(state.gstr2b['2026-05'], 'the principal\'s month-only 2B is untouched');
  assert.equal(state.gstr2b[`2026-05@${karnataka}`].rows.length, 1);
  const branchRisk = await runTool(state, 'credit_at_risk', { period: '2026-05', gstin: karnataka });
  assert.equal(branchRisk.ok, true, JSON.stringify(branchRisk));
  assert.equal(branchRisk.data.bills, 1);
  assert.equal(branchRisk.data.creditAtRisk, 0);
  assert.equal(branchRisk.data.statement.rows, 1);
  const mainRisk = await runTool(state, 'credit_at_risk', { period: '2026-05' });
  assert.equal(mainRisk.data.bills, 0, 'the branch bill is not the principal\'s');
  assert.deepEqual(mainRisk.data.notBooked.map((row) => row.invoiceNo), ['F-101'], 'the principal reads only its own 2B rows');
  const branch9 = await runTool(state, 'gstr9_draft', { fy: '2026-27', gstin: karnataka });
  assert.equal(branch9.data.table8.gstr2bMonths, 1);
  assert.equal(branch9.data.table8.gstr2bAvailable.total, 900);
  const main9 = await runTool(state, 'gstr9_draft', { fy: '2026-27' });
  assert.equal(main9.data.table8.gstr2bAvailable.total, 500);
  assert.equal((await runTool(state, 'import_gstr2b', { csv, period: '2026-05', gstin: withCheck('07AABCU9603R1Z') })).error, 'UNKNOWN_REGISTRATION');
});
