import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { createPurchase } from '../src/invoice.mjs';
import { twoBNote } from '../src/gst-review.mjs';

const PERIOD = '2026-09';
const HEADER = 'SECTION,SUPPLIER GSTIN,SUPPLIER NAME,INVOICE NO,INVOICE DATE,TAXABLE VALUE,CGST,SGST,IGST,CESS,TOTAL VALUE,ITC AVAILABILITY';
const FABRIC = '27AABCT1332L1ZE';
const SHIRT = '27AAACP1234F1Z5';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Suresh Traders', gstin: '27AABCU9603R1ZN', state: '27' };
  for (const [name, gstin, no, rate] of [['Fabric Co', FABRIC, 'F-101', 10000], ['Shirt Mills', SHIRT, 'S-7', 20000]]) {
    const out = createPurchase(state, { date: '2026-09-05', partyName: name, partyGstin: gstin, supplierInvoiceNo: no, lines: [{ description: 'Goods', hsn: '5208', qty: 1, rate, gstRate: 5 }] });
    assert.notEqual(out.ok, false, JSON.stringify(out));
  }
  return state;
}

const review = async (state) => (await runTool(state, 'gst_review', { period: PERIOD })).data;
const credit = (data) => data.steps.find((step) => step.id === 'credit');

test('with no GSTR-2B added, the credit step says so and the step is marked as unchecked', async () => {
  const data = await review(books());
  assert.equal(data.twoB.loaded, false);
  assert.match(credit(data).note, /not been checked against GSTR-2B/);
  assert.match(credit(data).note, /Add the 2B before you file/);
  assert.equal(credit(data).twoBMissing, true);
});

test('a 2B that confirms one bill but not the other shows the credit it does not confirm, with the supplier to chase', async () => {
  const state = books();
  const added = await runTool(state, 'import_gstr2b', { period: PERIOD, csv: [HEADER, `B2B,${FABRIC},FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y`].join('\n'), fileName: 'GSTR2B.csv' });
  assert.equal(added.ok, true, JSON.stringify(added));
  const data = await review(state);
  assert.equal(data.twoB.loaded, true);
  assert.equal(data.twoB.atRisk, 1000);
  assert.equal(data.twoB.bills, 1);
  assert.deepEqual(credit(data).lines.find((line) => line.label === 'Credit the GSTR-2B does not confirm'), { label: 'Credit the GSTR-2B does not confirm', amount: 1000 });
  assert.match(credit(data).note, /1 bill with ₹1000 of credit is not confirmed/);
  assert.match(credit(data).note, /Shirt Mills/);
  assert.equal(credit(data).creditAtRisk, 1000);
});

test('a 2B that matches everything says so and adds no warning line', async () => {
  const state = books();
  await runTool(state, 'import_gstr2b', { period: PERIOD, csv: [HEADER, `B2B,${FABRIC},FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y`, `B2B,${SHIRT},SHIRT MILLS,S-7,05-09-2026,20000,500,500,0,0,21000,Y`].join('\n'), fileName: 'GSTR2B.csv' });
  const data = await review(state);
  assert.equal(data.twoB.atRisk, 0);
  assert.match(credit(data).note, /matches the GSTR-2B you added/);
  assert.equal(credit(data).lines.some((line) => line.label === 'Credit the GSTR-2B does not confirm'), false);
  assert.equal(credit(data).creditAtRisk, undefined);
});

test('loading the 2B changes the review, so an approval given before it no longer stands', async () => {
  const state = books();
  const before = await review(state);
  await runTool(state, 'import_gstr2b', { period: PERIOD, csv: [HEADER, `B2B,${FABRIC},FABRIC CO,F-101,05-09-2026,10000,250,250,0,0,10500,Y`].join('\n'), fileName: 'GSTR2B.csv' });
  const after = await review(state);
  assert.notEqual(before.draftHash, after.draftHash);
});

test('a month with no bills with credit shows no 2B wording at all', async () => {
  const state = createState();
  state.company = { ...state.company, name: 'Empty', gstin: '27AABCU9603R1ZN', state: '27' };
  const data = await review(state);
  assert.equal(twoBNote(data.twoB), '');
  assert.doesNotMatch(credit(data).note, /Add the 2B/);
});

const reversal = (id, invoiceNo, money, extra = {}) => ({ id, key: `rule37:reverse:${invoiceNo}`, clientId: 'SELF', source: 'rule37', code: 'RULE_37_REVERSAL', severity: 'high', title: 't', why: 'w', ruleIds: [], moneyAtRisk: money, evidence: { invoiceNo }, status: 'open', ...extra });

test('an open credit reversal is shown on the credit step as something this return does not make', async () => {
  const state = books();
  const clean = await review(state);
  state.exceptions = [reversal('EXC-000001', 'F-101', 480), reversal('EXC-000002', 'S-7', 120)];
  const data = await review(state);
  assert.deepEqual(data.reversals, { count: 2, amount: 600, invoices: ['F-101', 'S-7'] });
  assert.deepEqual(credit(data).lines.find((line) => line.label === 'Credit reversals still open, not in this return'), { label: 'Credit reversals still open, not in this return', amount: 600 });
  assert.match(credit(data).note, /2 credit reversals worth ₹600 \(F-101, S-7\) are open/);
  assert.match(credit(data).note, /table 4\(B\) of GSTR-3B/);
  assert.equal(credit(data).reversalsOpen, 2);
  assert.notEqual(data.draftHash, clean.draftHash, 'an earlier approval does not cover a reversal that appeared later');
});

test('a resolved reversal, or another kind of exception, is not counted', async () => {
  const state = books();
  state.exceptions = [reversal('EXC-000001', 'F-101', 480, { status: 'resolved' }), { ...reversal('EXC-000002', 'S-7', 120), code: 'PAYMENT_STATUS_UNKNOWN' }];
  const data = await review(state);
  assert.equal(data.reversals.count, 0);
  assert.equal(credit(data).reversalsOpen, undefined);
  assert.doesNotMatch(credit(data).note, /reversal/);
});

test('one open reversal is worded in the singular, and Rule 37A counts too', async () => {
  const state = books();
  state.exceptions = [reversal('EXC-000001', 'F-101', 480, { code: 'RULE_37A_REVERSAL' })];
  const data = await review(state);
  assert.match(credit(data).note, /1 credit reversal worth ₹480 \(F-101\) is open/);
  assert.match(credit(data).note, /does not make it: enter it in table 4\(B\)/);
});
