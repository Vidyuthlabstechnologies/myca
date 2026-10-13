import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { parsePosSalesCsv } from '../src/import-pos.mjs';

const POS = `Date,GST Rate,Taxable,CGST,SGST,Bills
12-10-2026,5,4000,100,100,18
12-10-2026,18,2000,180,180,6
13-10-2026,5,3000,75,75,12
13-10-2026,,500,,,2
14-10-2026,18,1000,100,100,3
`;

test('counter sales import posts one walk-in invoice per day by rate, holds back bad rows and mismatched tax, and lands in B2CS', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  const parsed = parsePosSalesCsv(POS);
  assert.equal(parsed.meta.count, 3);
  assert.equal(parsed.held.length, 1);
  assert.equal(parsed.held[0].reason, 'RATE_REQUIRED');
  const preview = previewOf(state, 'import_pos_sales', { csv: POS });
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /3 days read, 2 ready to post totalling ₹9,710\.00; held back: 1 rows with no GST rate; 1 whose GST in the file differs from the rate/);
  const out = await runTool(state, 'import_pos_sales', { csv: POS });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.created.length, 2);
  const first = out.data.created[0].invoice;
  assert.equal(first.partyName, 'Walk-in');
  assert.equal(first.source, 'pos');
  assert.equal(first.posBills, 24);
  assert.equal(first.lines.length, 2);
  assert.equal(first.cgst, 280);
  assert.equal(first.total, 6560);
  assert.deepEqual(out.data.skipped.map((s) => [s.id, s.reason]), [['row 5', 'RATE_REQUIRED'], ['2026-10-14', 'tax_differs']]);
  const again = await runTool(state, 'import_pos_sales', { csv: POS });
  assert.equal(again.data.created.length, 0);
  assert.equal(again.data.skipped.filter((s) => s.reason === 'exists').length, 2);
  const file = await runTool(state, 'export_gstr1_json', { fp: '102026' });
  assert.equal(file.ok, true, JSON.stringify(file).slice(0, 200));
  const b2cs = file.data.b2cs;
  assert.ok(b2cs.length >= 2, JSON.stringify(b2cs));
  assert.equal(b2cs.find((row) => row.rt === 5).txval, 7000);
  state.pendingFile = { name: 'pos.csv', content: POS };
  const held = await chat(state, 'import pos sales');
  assert.equal(held.preview?.tool, 'import_pos_sales', held.reply);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /Imported counter sales for 0 days; each day is one walk-in invoice by GST rate/);
});

test('Form 16A and Form 16 drafts come from the statement and the payroll months, and chat names them', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', tan: 'MUMA12345B', pan: 'AAACA1234A', tdsDeductor: true };
  await runTool(state, 'create_purchase', { partyName: 'Rao & Co', partyGstin: '27AAAFR1234K1Z5', lines: [{ description: 'Audit fees', qty: 1, rate: 60000, gstRate: 18 }], date: '2026-10-05', tdsSection: '194J', payeePan: 'AAAFR1234K', tdsCategory: 'professional' });
  const deposit = await runTool(state, 'record_tds_deposit', { amount: 6000, date: '2026-10-10', challan: 'BSR1234567' });
  assert.equal(deposit.ok, true, JSON.stringify(deposit));
  const out = await runTool(state, 'tds_certificates', { quarter: 'Q3 2026-27' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const d = out.data;
  assert.equal(d.form, '16A');
  assert.equal(d.deductor.tan, 'MUMA12345B');
  assert.equal(d.certificates.length, 1);
  const c = d.certificates[0];
  assert.equal(c.deductee.pan, 'AAAFR1234K');
  assert.equal(c.section, '194J');
  assert.equal(c.amountPaid, 60000);
  assert.equal(c.tdsDeducted, 6000);
  assert.equal(c.challans[0].challan, 'BSR1234567');
  assert.equal(c.challans[0].covers, 6000);
  assert.match(d.csv.split(/\r?\n/)[1], /^16A\/Q3-2026-27\/001,Rao & Co,AAAFR1234K,194J,Q3 2026-27,2026-10-05,60000,10,6000$/);
  const reply = await chat(state, 'form 16a');
  assert.match(reply.reply, /Form 16A drafts for Q3 2026-27: 1 deductee, TDS ₹6,000\.00 deducted, ₹6,000\.00 deposited/);

  await runTool(state, 'add_employee', { name: 'Arjun Rao', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 100000 }, { name: 'HRA', amount: 50000 }], ptState: '27', sex: 'male', taxRegime: 'new', pan: 'ABCPR1234L' });
  for (const period of ['2026-04', '2026-05', '2026-06', '2026-07']) assert.equal((await runTool(state, 'approve_payroll', { period })).ok, true, period);
  const f16 = await runTool(state, 'tds_certificates', { form: 'salary', fy: '2026-27' });
  assert.equal(f16.ok, true, JSON.stringify(f16));
  assert.equal(f16.data.form, '16');
  const e = f16.data.certificates[0];
  assert.equal(e.employee.pan, 'ABCPR1234L');
  assert.equal(e.partB.grossSalary, 600000);
  assert.equal(e.partB.standardDeduction16ia, 75000);
  assert.ok(e.partA.length >= 1);
  assert.equal(e.partA[0].quarter, 'Q1 2026-27');
  assert.ok(e.partA[0].tdsDeducted > 0);
  assert.equal(f16.data.fileName, 'Form16_MUMA12345B_2026-27.csv');
});

test('the ESI contribution due date appears once a payroll month has ESI, from a dated rule', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  await runTool(state, 'add_employee', { name: 'Meena Shah', joinedOn: '2026-04-01', components: [{ name: 'Salary', amount: 18000 }], esiMember: true, ptState: '27', sex: 'female' });
  const before = await runTool(state, 'deadlines', { asOfDate: '2026-10-13' });
  assert.equal((before.data?.deadlines || before.deadlines || []).some((row) => row.returnType === 'ESI'), false);
  assert.equal((await runTool(state, 'approve_payroll', { period: '2026-09' })).ok, true);
  assert.equal(state.company.esi, true);
  const after = await runTool(state, 'deadlines', { asOfDate: '2026-10-13' });
  const rows = (after.data?.deadlines || after.deadlines || []).filter((row) => row.returnType === 'ESI');
  assert.ok(rows.length >= 1, JSON.stringify(after).slice(0, 300));
  assert.equal(rows.find((row) => row.period === '2026-09').dueDate, '2026-10-15');
});

test('the 1099-NEC data file lists payees over the threshold with box 1 and the due date', async () => {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789', address: '12 Maple St' };
  const bill = await runTool(state, 'create_purchase', { partyName: 'Joe Plumbing', lines: [{ description: 'Repairs', qty: 1, rate: 2500 }], date: '2026-03-04' });
  await runTool(state, 'record_payment', { billId: bill.invoice.id, amount: 2500, date: '2026-03-05' });
  await runTool(state, 'set_contractor', { partyName: 'Joe Plumbing', entityType: 'sole-proprietor', tinLast4: '1234', w9Received: true });
  await runTool(state, 'create_purchase', { partyName: 'Small Gig', lines: [{ description: 'Design', qty: 1, rate: 300 }], date: '2026-03-04' });
  await runTool(state, 'set_contractor', { partyName: 'Small Gig', entityType: 'individual' });
  const out = await runTool(state, 'contractor_1099_file', { year: '2026' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.payees.length, 1);
  assert.equal(out.data.payees[0].recipient, 'Joe Plumbing');
  assert.equal(out.data.payees[0].nonemployeeCompensation, 2500);
  assert.equal(out.data.dueDate, '2027-01-31');
  assert.equal(out.data.fileName, '1099NEC_12-3456789_2026.csv');
  assert.match(out.data.csv, /2026,Maple Street Bakery,12-3456789,Joe Plumbing,sole-proprietor,1234,yes,2500/);
  const reply = await chat(state, 'prepare the 1099 file for 2026');
  assert.match(reply.reply, /1099-NEC data for 2026: 1 payee, due 31 January 2027/);
  assert.equal((await runTool(createState(), 'contractor_1099_file', {})).error, 'NOT_FOR_COUNTRY');
});
